#!/usr/bin/env node
/* =====================================================================
 * p5_harden.js — stress-test the Prior-Day-High/Low breakout (P5) before
 * any live port, with FUNDED-ACCOUNT survivability as the deciding gate.
 *
 * Stages:
 *   1) Parameter robustness sweep (stop x trigger x window x exit) — is the
 *      edge broad, or one lucky cell?
 *   2) Out-of-sample holdout (train 2019-2023 / test 2024-2026), fixed params.
 *   3) Outlier dependence (drop best year, drop best month, top-5% trade share).
 *   4) Funded gate: full-path funded_eval + Monte-Carlo PASS% over sizing levels,
 *      across exit variants (close / fixed-target / partial+BE runner).
 *
 * R = true risk-multiple (stop distance = 1R). Costs identical to engine.
 * Input: ET-encoded 5m file (tz_offset_hours:0).
 * Usage: node p5_harden.js <data_et.json>
 * ===================================================================== */
'use strict';
const fs=require('fs');
const {sim}=require('../../10_risk/montecarlo.js');
const {evaluate}=require('../../10_risk/funded_eval.js');

const POINT=20.0, COMM=2.10, SLIP_RT=1.0;
const D=t=>new Date(t*1000), hh=t=>D(t).getUTCHours(), mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const ym=t=>{const d=D(t);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');};
const yr=t=>D(t).getUTCFullYear();
const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30, RTH_CLOSE=16*60;
const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN && m<RTH_CLOSE;};

function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));
  const out=new Array(b.length).fill(null);let prev=null;
  for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}
  return out;}

function sessions(b){const days={},order=[];
  for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}
  for(const k of order){const s=days[k];if(s.rth.length){let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}}
  return {days,order:order.filter(k=>days[k].rth.length>=6)};}

// ---- configurable P5 ----
// cfg: {stopMult, trig:'close'|'touch', window:'rth'|'am', exit:'close'|{tgt:N}|'partial'}
function runP5(b,atr,sess,cfg){
  const {days,order}=sess; const tr=[];
  const cutoff = cfg.window==='am' ? 12*60 : RTH_CLOSE;       // 'am' = signal must trigger before noon ET
  for(let j=1;j<order.length;j++){
    const p=days[order[j-1]], s=days[order[j]]; if(p.rthHi==null)continue;
    const dayEnd=s.rth[s.rth.length-1];
    for(let q=0;q<s.rth.length-1;q++){
      const i=s.rth[q]; const a=atr[i]; if(a==null||a<=0)continue;
      if(minOfDay(b[i][0])>=cutoff) break;
      const upBreak = cfg.trig==='close' ? b[i][4]>p.rthHi : b[i][2]>p.rthHi;
      const dnBreak = cfg.trig==='close' ? b[i][4]<p.rthLo : b[i][3]<p.rthLo;
      if(!upBreak && !dnBreak) continue;
      const dir = upBreak?1:-1; const entIdx=q+1<s.rth.length? s.rth[q+1] : i;
      const t=simExit(b,atr,dir,entIdx,dayEnd,cfg); if(t)tr.push(t);
      break;                                                  // one trade/day
    }
  }
  return tr;
}
// simulate exit; R measured vs initial risk = stopMult*ATR(entry)
function simExit(b,atr,dir,entIdx,dayEnd,cfg){
  const ep=b[entIdx][1], a=atr[entIdx]; if(a==null||a<=0)return null;
  const risk=cfg.stopMult*a; if(risk<=0)return null;
  let stop = dir>0?ep-risk:ep+risk;
  const tgt = (cfg.exit&&cfg.exit.tgt)? (dir>0?ep+cfg.exit.tgt*risk:ep-cfg.exit.tgt*risk):null;
  const partial = cfg.exit==='partial';
  let realizedR=0, remFrac=1, beMoved=false, exIdx=dayEnd;
  const slipR=SLIP_RT/risk;
  for(let i=entIdx+1;i<=dayEnd;i++){
    const hi=b[i][2],lo=b[i][3];
    const stopped = dir>0?lo<=stop:hi>=stop;
    if(stopped){ const sR=(dir>0?(stop-ep):(ep-stop))/risk - slipR; realizedR+=remFrac*sR; exIdx=i; remFrac=0; break; }
    if(partial && !beMoved){ const pHit=dir>0?hi>=ep+risk:lo<=ep-risk; if(pHit){ realizedR+=0.5*(1-slipR); remFrac-=0.5; beMoved=true; stop=ep; } }
    if(tgt!=null){ const tHit=dir>0?hi>=tgt:lo<=tgt; if(tHit){ const tR=cfg.exit.tgt - slipR; realizedR+=remFrac*tR; exIdx=i; remFrac=0; break; } }
  }
  if(remFrac>1e-9){ const xp=b[dayEnd][4]; const cR=(dir>0?(xp-ep):(ep-xp))/risk - slipR; realizedR+=remFrac*cR; exIdx=dayEnd; }
  const dollarsPerR=1; // placeholder; scaled later for funded $
  return {dir,r:realizedR, entryTime:b[entIdx][0], exitTime:b[exIdx][0], barsHeld:exIdx-entIdx};
}

function metrics(tr){const N=tr.length;if(!N)return{trades:0};
  const wins=tr.filter(t=>t.r>0),losses=tr.filter(t=>t.r<=0);
  const gW=wins.reduce((s,t)=>s+t.r,0),gL=Math.abs(losses.reduce((s,t)=>s+t.r,0));
  const net=tr.reduce((s,t)=>s+t.r,0);let peak=0,cum=0,maxDD=0,curL=0,maxL=0;
  for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);maxDD=Math.min(maxDD,cum-peak);if(t.r<=0){curL++;maxL=Math.max(maxL,curL);}else curL=0;}
  const r=v=>Math.round(v*1000)/1000;
  return{trades:N,win:Math.round(1000*wins.length/N)/10,PF:gL>0?r(gW/gL):99,expR:r(net/N),netR:Math.round(net*10)/10,maxDD:Math.round(maxDD*10)/10,maxLossStreak:maxL};}
function posYears(tr){const g={};for(const t of tr){const y=yr(t.entryTime);g[y]=(g[y]||0)+t.r;}const ys=Object.keys(g);return ys.filter(y=>g[y]>0).length+'/'+ys.length;}

function main(){
  const f=process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json';
  const j=JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));
  const b=j.bars, atr=atr14(b), sess=sessions(b);
  console.log('P5 HARDENING  | data '+b.length+' bars '+ymd(b[0][0])+' -> '+ymd(b[b.length-1][0])+'\n');

  // ---------- 1) ROBUSTNESS SWEEP ----------
  console.log('=== 1) PARAMETER ROBUSTNESS SWEEP (exit=hold-to-close) ===');
  console.log('stop  trig    window   trades  win%    PF    expR   maxDD  +yrs');
  for(const stopMult of [0.75,1.0,1.25,1.5])
   for(const trig of ['close','touch'])
    for(const window of ['rth','am']){
      const cfg={stopMult,trig,window,exit:'close'};
      const tr=runP5(b,atr,sess,cfg); const m=metrics(tr);
      console.log(String(stopMult).padEnd(5),trig.padEnd(7),window.padEnd(8),String(m.trades).padStart(6),String(m.win).padStart(6),String(m.PF).padStart(6),String(m.expR).padStart(7),String(m.maxDD).padStart(7),posYears(tr).padStart(6));
    }

  // baseline config for deeper tests
  const BASE={stopMult:1.0,trig:'close',window:'rth',exit:'close'};

  // ---------- 2) OUT-OF-SAMPLE HOLDOUT ----------
  console.log('\n=== 2) OOS HOLDOUT (fixed params '+JSON.stringify(BASE)+') ===');
  const all=runP5(b,atr,sess,BASE);
  const IS=all.filter(t=>yr(t.entryTime)<=2023), OOS=all.filter(t=>yr(t.entryTime)>=2024);
  console.log('in-sample 2019-2023 :', JSON.stringify(metrics(IS)));
  console.log('out-sample 2024-2026:', JSON.stringify(metrics(OOS)));

  // ---------- 3) OUTLIER DEPENDENCE ----------
  console.log('\n=== 3) OUTLIER DEPENDENCE ===');
  const totalR=all.reduce((s,t)=>s+t.r,0);
  const sortedR=[...all].sort((a,b)=>b.r-a.r);
  const top5=Math.ceil(all.length*0.05);
  const top5R=sortedR.slice(0,top5).reduce((s,t)=>s+t.r,0);
  console.log('top 5% trades ('+top5+') contribute '+Math.round(1000*top5R/totalR)/10+'% of total R');
  // drop best year
  const byY={}; for(const t of all){(byY[yr(t.entryTime)]=byY[yr(t.entryTime)]||[]).push(t);}
  const bestY=Object.keys(byY).sort((a,b)=>byY[b].reduce((s,t)=>s+t.r,0)-byY[a].reduce((s,t)=>s+t.r,0))[0];
  console.log('drop best year ('+bestY+'):', JSON.stringify(metrics(all.filter(t=>yr(t.entryTime)!=bestY))));
  // drop best month
  const byM={}; for(const t of all){(byM[ym(t.entryTime)]=byM[ym(t.entryTime)]||[]).push(t);}
  const bestM=Object.keys(byM).sort((a,b)=>byM[b].reduce((s,t)=>s+t.r,0)-byM[a].reduce((s,t)=>s+t.r,0))[0];
  console.log('drop best month ('+bestM+'):', JSON.stringify(metrics(all.filter(t=>ym(t.entryTime)!=bestM))));

  // ---------- 4) FUNDED GATE ----------
  console.log('\n=== 4) FUNDED-ACCOUNT GATE ===');
  console.log('50k rules: trailingDD $2500, dailyLoss $1100, target $3000, consistency 30%\n');
  const exits={'hold-to-close':'close','target-2R':{tgt:2},'target-3R':{tgt:3},'partial-1R+runner':'partial'};
  for(const [label,exit] of Object.entries(exits)){
    const tr=runP5(b,atr,sess,{...BASE,exit}); const m=metrics(tr);
    const rDist=tr.map(t=>t.r);
    console.log('--- exit='+label+' :: '+JSON.stringify({trades:m.trades,win:m.win,PF:m.PF,expR:m.expR,maxDD:m.maxDD,streak:m.maxLossStreak}));
    // Monte-Carlo funded PASS% across sizing (riskPerR -> ruin/target in R)
    console.log('    MC funded PASS% by $risk/trade (window=120 trades ~6mo):');
    for(const riskPerR of [75,100,150,200,250]){
      const cfg={paths:20000, tradesPerPath:120, ruinDD_R:2500/riskPerR, targetR:3000/riskPerR, seed:7};
      const r=sim(rDist,cfg);
      console.log('      $'+String(riskPerR).padStart(3)+'/R (ruinDD '+r.ruinDD_R.toFixed(1)+'R, tgt '+r.targetR.toFixed(1)+'R): pass '+(r.prob_pass_funded*100).toFixed(0)+'%  ruin '+(r.prob_ruin_before_target*100).toFixed(0)+'%  '+r.verdict);
    }
    // single full-history path at a conservative $100/R
    const riskPerR=100; const trades=tr.map(t=>({exitTime:t.exitTime, dollars:t.r*riskPerR}));
    const ev=evaluate(50000,{trailingDD:2500,lockBuffer:2600,dailyLoss:1100,profitTarget:3000,consistencyPct:0.30}, trades);
    console.log('    full-history path @ $100/R:', JSON.stringify({verdict:ev.verdict, totalPnL:ev.totalPnL, breach:ev.breach?ev.breach.type:null, passedAt:ev.passedAt?('trade#'+ev.passedAt.atTrade):null}));
  }
}
main();
