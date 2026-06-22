#!/usr/bin/env node
/* =====================================================================
 * forward_logger.js — webhook receiver + trade logger for forward-testing
 * the NQ strategies (P5+CVD and the mean-reversion sleeve). Dependency-free.
 *
 * Receives TradingView alert() webhooks (the JSON the Pine strategies emit),
 * appends every event to events.csv, and PAIRS entry->close into realized-R
 * trades in trades_<strat>.csv. Open positions are persisted to state.json
 * so a restart doesn't lose an in-flight trade.
 *
 * Strategy is identified by URL PATH: POST to /p5 or /rev (or any /<name>).
 * Optional shared secret: set FT_TOKEN and append ?token=... to the webhook URL.
 *
 * Run:   node forward_logger.js              (PORT 8787 default; FT_TOKEN optional)
 *        PORT=9000 FT_TOKEN=abc node forward_logger.js
 * Report: node forward_report.js
 * ===================================================================== */
'use strict';
const http=require('http'), https=require('https'), fs=require('fs'), path=require('path');
const DIR=process.env.FT_DIR||__dirname, PORT=+(process.env.PORT||8787), TOKEN=process.env.FT_TOKEN||null;
const BRIDGE=process.env.BRIDGE_URL||null;  // e.g. http://localhost:8799 — when set, raw events are forwarded to the execution bridge
function forwardToBridge(strat, body){
  if(!BRIDGE) return;
  try{
    const u=new URL(BRIDGE.replace(/\/+$/,'')+'/'+strat);
    const lib=u.protocol==='https:'?https:http;
    const req=lib.request(u,{method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},r=>r.resume());
    req.on('error',e=>console.log('[bridge] forward failed: '+e.message));
    req.write(body); req.end();
  }catch(e){ console.log('[bridge] forward error: '+e.message); }
}
const EVENTS=path.join(DIR,'events.csv'), STATE=path.join(DIR,'state.json');
const POINT_VALUE=+(process.env.POINT_VALUE||2);  // $ per index point: MNQ=2, NQ=20
const tradesFile=s=>path.join(DIR,'trades_'+s.replace(/[^a-z0-9_-]/gi,'')+'.csv');

function ensureCsv(f,header){ if(!fs.existsSync(f)) fs.writeFileSync(f,header+'\n'); }
function appendCsv(f,row){ fs.appendFileSync(f,row.map(x=>{const s=String(x==null?'':x);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')+'\n'); }
function loadState(){ try{return JSON.parse(fs.readFileSync(STATE,'utf8'));}catch(e){return {open:{}};} }
function saveState(st){ fs.writeFileSync(STATE,JSON.stringify(st,null,1)); }

ensureCsv(EVENTS,'recv_iso,strat,action,side,symbol,price,sl,tp,cvd,remaining_qty,raw');
let state=loadState();

function handle(strat, ev){
  const iso=new Date().toISOString();
  appendCsv(EVENTS,[iso,strat,ev.action,ev.side,ev.symbol,ev.price,ev.sl,ev.tp,ev.cvd,ev.remaining_qty,JSON.stringify(ev)]);
  if(ev.action==='entry'){
    const risk=(ev.price!=null&&ev.sl!=null)?Math.abs(+ev.price-+ev.sl):null;
    state.open[strat]={time:iso,side:ev.side,entry:+ev.price,sl:(ev.sl!=null?+ev.sl:null),risk,symbol:ev.symbol,cvd:ev.cvd};
    saveState(state);
    return 'opened '+strat+' '+ev.side+' @'+ev.price;
  }
  if(ev.action==='close'){
    const op=state.open[strat];
    if(!op){ return 'close with no open '+strat+' (ignored)'; }
    const dir=op.side==='long'?1:-1;
    const exit=+ev.price;
    const grossR=(op.risk&&op.risk>0)?dir*(exit-op.entry)/op.risk:null;
    const usd1=dir*(exit-op.entry)*POINT_VALUE;  // realized $ for ONE contract (MNQ by default)
    const f=tradesFile(strat);
    ensureCsv(f,'entry_iso,exit_iso,side,entry,exit,sl,risk,grossR,usd_1contract,cvd,symbol');
    appendCsv(f,[op.time,iso,op.side,op.entry,exit,op.sl,op.risk,grossR!=null?grossR.toFixed(3):'',usd1.toFixed(2),op.cvd,op.symbol]);
    delete state.open[strat]; saveState(state);
    return 'closed '+strat+' R='+(grossR!=null?grossR.toFixed(2):'?')+' ($'+usd1.toFixed(0)+'/contract)';
  }
  if(ev.action==='reduce'){ return 'reduce '+strat+' (logged; trade stays open until close)'; }
  return 'logged '+ev.action;
}

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'); const strat=u.pathname.replace(/^\/+|\/+$/g,'')||'default';
  if(req.method==='GET'){
    if(strat==='status'||strat==='default'){
      res.writeHead(200,{'content-type':'application/json'});
      return res.end(JSON.stringify({ok:true,port:PORT,open:state.open,events:fs.existsSync(EVENTS)?fs.readFileSync(EVENTS,'utf8').trim().split('\n').length-1:0},null,1));
    }
  }
  if(req.method!=='POST'){ res.writeHead(405); return res.end('POST only'); }
  if(TOKEN && u.searchParams.get('token')!==TOKEN && req.headers['x-token']!==TOKEN){ res.writeHead(401); return res.end('bad token'); }
  let body=''; req.on('data',c=>{body+=c; if(body.length>1e5) req.destroy();});
  req.on('end',()=>{
    let ev; try{ ev=JSON.parse(body.trim()); }catch(e){ appendCsv(EVENTS,[new Date().toISOString(),strat,'PARSE_FAIL','','','','','','','',body.slice(0,300)]); res.writeHead(200); return res.end('logged-raw'); }
    let msg; try{ msg=handle(strat,ev); }catch(e){ msg='error: '+e.message; }
    forwardToBridge(strat, body.trim());
    console.log('['+new Date().toISOString()+'] '+strat+' <- '+msg);
    res.writeHead(200,{'content-type':'text/plain'}); res.end(msg);
  });
});
if(require.main===module){
  server.listen(PORT,()=>{
    console.log('forward_logger listening on :'+PORT+(TOKEN?' (token required)':' (no token)'));
    console.log('TradingView webhook URLs:  http://<public-host>:'+PORT+'/p5'+(TOKEN?'?token='+TOKEN:'')+'   and  /rev');
    console.log('Events -> '+EVENTS+' ; paired trades -> trades_<strat>.csv ; status: GET /status');
  });
}
module.exports={handle, tradesFile, _state:()=>state};
