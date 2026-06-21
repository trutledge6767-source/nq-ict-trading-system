#!/usr/bin/env node
/* forward_report.js — read the logged forward trades and compare LIVE results to
 * the backtest baselines. Run: node forward_report.js
 * Baselines (7yr backtest): CVD-P5 expR ~+0.67R (recent regime higher); reversion(limit) ~+0.12R. */
'use strict';
const fs=require('fs'), path=require('path');
const DIR=__dirname;
const BASE={ p5:{name:'CVD-P5 breakout', expR:0.67, win:17.4, note:'7yr avg; recent months ran +1.5-2.3R (regime)'},
             rev:{name:'Mean-reversion (limit)', expR:0.12, win:21.4, note:'limit-fill model; watch live fill-rate/slippage'} };
function parseCsv(f){ if(!fs.existsSync(f))return []; const L=fs.readFileSync(f,'utf8').trim().split('\n'); const h=L[0].split(','); return L.slice(1).filter(x=>x).map(line=>{const c=line.match(/("([^"]|"")*"|[^,]*)/g).filter((_,i)=>i%2===0);const o={};h.forEach((k,i)=>o[k]=(c[i]||'').replace(/^"|"$/g,'').replace(/""/g,'"'));return o;}); }
function stats(trades){ const R=trades.map(t=>parseFloat(t.grossR)).filter(x=>isFinite(x)); const N=R.length; if(!N)return null; const w=R.filter(x=>x>0).length; const net=R.reduce((a,b)=>a+b,0); let peak=0,cum=0,dd=0; for(const r of R){cum+=r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);} const mean=net/N; const sd=Math.sqrt(R.reduce((a,b)=>a+(b-mean)**2,0)/N); return {N,win:Math.round(1000*w/N)/10,expR:Math.round(1000*mean)/1000,netR:Math.round(net*10)/10,maxDD:Math.round(dd*10)/10,sharpe:sd>0?Math.round(1000*mean/sd)/1000:0}; }
function sig(N){ return N>=200?'strong':N>=50?'moderate':N>=15?'early':'too-small'; }
console.log('=== FORWARD-TEST REPORT (live alert log vs 7yr backtest) ===\n');
for(const [key,base] of Object.entries(BASE)){
  const f=path.join(DIR,'trades_'+key+'.csv'); const tr=parseCsv(f); const s=stats(tr);
  console.log(base.name+'  ['+key+']  baseline expR +'+base.expR+'R');
  if(!s){ console.log('  (no completed trades yet — file: '+path.basename(f)+')\n'); continue; }
  const verdict = s.expR>0 && s.expR>=base.expR*0.5 ? 'TRACKING baseline' : s.expR>0 ? 'POSITIVE but soft' : 'BELOW baseline (investigate)';
  console.log('  live: '+s.N+' trades  win '+s.win+'%  expR '+(s.expR>=0?'+':'')+s.expR+'R  netR '+s.netR+'  maxDD '+s.maxDD+'R  sharpe '+s.sharpe);
  console.log('  sample: '+sig(s.N)+'   verdict: '+verdict+'   ('+base.note+')\n');
}
const ev=path.join(DIR,'events.csv');
if(fs.existsSync(ev)){ const n=fs.readFileSync(ev,'utf8').trim().split('\n').length-1; console.log('total events logged: '+n+'  (events.csv)'); }
console.log('\nReminder: this tracks SIGNAL-level R from alert prices. Real broker slippage/fills must be compared separately,');
console.log('especially the reversion sleeve\'s LIMIT fills (the #1 live risk). Need ~50+ trades before trusting expR.');
