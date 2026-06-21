#!/usr/bin/env node
/* =====================================================================
 * p5_optimize.js — optimize FUNDED-EVAL PASS RATE for P5 (and a P5+P3
 * diversified portfolio). Uses a DAY-LEVEL block bootstrap that models the
 * real rule set: trailing DD, daily-loss limit, profit target, AND the 30%
 * consistency rule (which the trade-iid Monte-Carlo ignores). Sizing is
 * fixed-$-risk-per-trade, so every trade's true R-multiple (outcome vs its
 * OWN stop) is directly summable across strategies.
 *
 * Only economically-meaningful, already-robust knobs are varied (stop mult,
 * window, sizing, eval length, +P3 diversification) — no filter mining.
 *
 * Usage: node p5_optimize.js <data_et.json>
 * ===================================================================== */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;                          // points round-trip; commission folded into $ later is negligible at these sizes
const D=t=>new Date(t*1000), hh=t=>D(t).getUTCHours(), mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30, RTH_CLOSE=16*60;
const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));
  const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}
  for(const k of order){const s=days[k];if(s.rth.length){let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}}
  return {days,order:order.filter(k=>days[k].rth.length>=6)};}

// hold-to-close exit with a given stop; returns true R-multiple vs that stop
function holdToClose(b,atr,dir,entIdx,stopPx,dayEnd){
  const ep=b[entIdx][1]; const stopDist=Math.abs(ep-stopPx); if(stopDist<=0)return null;
  let exPx=b[dayEnd][4], stopped=false;
  for(let i=entIdx+1;i<=dayEnd;i++){ if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;stopped=true;break;} }
  const grossPts=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;
  return {dir, r:grossPts/stopDist, day:ymd(b[entIdx][0]), entryTime:b[entIdx][0]};
}
// P5: prior-day H/L breakout, 1-trade/day, stop = stopMult*ATR. rCap caps a winner's R (banks the monster) to fight the consistency rule.
function runP5(b,atr,sess,stopMult,window,rCap){
  const {days,order}=sess, tr=[], cutoff=window==='am'?12*60:RTH_CLOSE;
  for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];
    for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;
      const up=b[i][4]>p.rthHi, dn=b[i][4]<p.rthLo; if(!up&&!dn)continue;
      const dir=up?1:-1, ent=s.rth[q+1], a2=atr[ent]; if(a2==null)break;
      const t=holdToClose(b,atr,dir,ent,b[ent][1]-dir*stopMult*a2,dayEnd); if(t){ if(rCap&&t.r>rCap)t.r=rCap; tr.push(t);} break; }}
  return tr;
}
// P3: 30-min opening-range breakout, stop = opposite OR edge, hold to close
function runP3(b,atr,sess){
  const {days,order}=sess, tr=[];
  for(const k of order){const s=days[k];const orEnd=10*60;const orIdx=s.rth.filter(i=>minOfDay(b[i][0])<orEnd);if(orIdx.length<3)continue;
    let oh=-1e9,ol=1e9;for(const i of orIdx){oh=Math.max(oh,b[i][2]);ol=Math.min(ol,b[i][3]);}
    const after=s.rth.filter(i=>minOfDay(b[i][0])>=orEnd), dayEnd=s.rth[s.rth.length-1];
    for(let q=0;q<after.length-1;q++){const i=after[q];
      if(b[i][4]>oh){const t=holdToClose(b,atr,1,after[q+1],ol,dayEnd);if(t)tr.push(t);break;}
      if(b[i][4]<ol){const t=holdToClose(b,atr,-1,after[q+1],oh,dayEnd);if(t)tr.push(t);break;} }}
  return tr;
}
// FAST variant: target-based exit so multiple trades/day are possible; both sides; re-enter on fresh crosses.
function runP5fast(b,atr,sess,stopMult,tgtR,maxPerDay,entryCutoff){
  const {days,order}=sess, tr=[], cutoff=entryCutoff*60;
  for(let j=1;j<order.length;j++){
    const p=days[order[j-1]], s=days[order[j]]; if(p.rthHi==null)continue;
    const rth=s.rth, dayEnd=rth[rth.length-1]; let count=0, qi=0;
    while(qi<rth.length-1 && count<maxPerDay){
      const i=rth[qi], a=atr[i];
      if(a==null||a<=0||minOfDay(b[i][0])>=cutoff){ qi++; continue; }
      const prevC = qi>0 ? b[rth[qi-1]][4] : b[i][1];
      const up = b[i][4]>p.rthHi && prevC<=p.rthHi;   // FRESH cross of prior-day level
      const dn = b[i][4]<p.rthLo && prevC>=p.rthLo;
      if(!up&&!dn){ qi++; continue; }
      const dir=up?1:-1, ent=rth[qi+1], a2=atr[ent]; if(a2==null){qi++;continue;}
      const ep=b[ent][1], sd=stopMult*a2, stopPx=ep-dir*sd, tgtPx=ep+dir*tgtR*sd;
      let exIdx=dayEnd, exPx=b[dayEnd][4];
      for(let k=ent+1;k<=dayEnd;k++){const hi=b[k][2],lo=b[k][3];
        if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=k;break;}
        if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=k;break;}}
      const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;
      tr.push({dir,r:gross/sd,day:ymd(b[ent][0]),entryTime:b[ent][0]});
      count++; let ni=rth.indexOf(exIdx); qi = ni<0 ? qi+1 : ni+1;
    }
  }
  return tr;
}
function quick(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);const gW=w.reduce((s,t)=>s+t.r,0),gL=Math.abs(tr.filter(t=>t.r<=0).reduce((s,t)=>s+t.r,0));
  let peak=0,cum=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}
  return{trades:N,win:Math.round(1000*w.length/N)/10,PF:Math.round(1000*(gL>0?gW/gL:99))/1000,expR:Math.round(1000*cum/N)/1000,maxDD:Math.round(dd*10)/10};}

// daily R series over ALL session days (0 on no-trade days)
function dailyR(trs,order){const m={};for(const k of order)m[k]=0;for(const arr of trs)for(const t of arr)m[t.day]=(m[t.day]||0)+t.r;return order.map(k=>m[k]);}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// day-level block bootstrap eval simulator (models trailing DD, daily loss, target, consistency)
function evalSim(dayR, riskPerR, rules, maxDays, paths, seed){
  const rnd=mulberry32(seed||7); const n=dayR.length;
  let pass=0,ruin=0,daily=0,consFail=0,timeout=0;
  for(let p=0;p<paths;p++){
    let eq=0,peak=0,maxDayWin=0,outcome=null;
    for(let d=0;d<maxDays;d++){
      const r=dayR[(rnd()*n)|0]; const pnl=r*riskPerR;
      if(pnl<=-rules.dailyLoss){ outcome='daily'; break; }       // daily-loss breach
      eq+=pnl; if(pnl>maxDayWin)maxDayWin=pnl;
      if(eq>peak)peak=eq;
      if((peak-eq)>=rules.trailingDD){ outcome='ruin'; break; }   // trailing-DD breach
      if(eq>=rules.target){ outcome = (maxDayWin <= rules.consistencyPct*eq) ? 'pass' : 'cons'; break; }
    }
    if(outcome==='pass')pass++; else if(outcome==='ruin')ruin++; else if(outcome==='daily')daily++; else if(outcome==='cons')consFail++; else timeout++;
  }
  const pc=x=>Math.round(1000*x/paths)/10;
  return {pass:pc(pass),ruin:pc(ruin),daily:pc(daily),cons:pc(consFail),timeout:pc(timeout)};
}

function main(){
  const f=process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json';
  const j=JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,'')); const b=j.bars, atr=atr14(b), sess=sessions(b);
  const RULES={trailingDD:2500, dailyLoss:1100, target:3000, consistencyPct:0.30};
  console.log('FUNDED-EVAL OPTIMIZER | 50k rules: trailDD $2500, dailyLoss $1100, target $3000, consistency 30%');
  console.log('day-level block bootstrap, 20000 paths\n');

  // GOAL: pass in < 30 calendar days (~21 trading days). Need faster R accumulation => more trades/day.
  const ndays=sess.order.length;
  const cands={
    'P5 0.75/am (hold)':     runP5(b,atr,sess,0.75,'am'),
    'P5 1.0/rth (hold)':     runP5(b,atr,sess,1.0,'rth'),
    'FAST 0.75 tgt2 x3':     runP5fast(b,atr,sess,0.75,2,3,15),
    'FAST 0.75 tgt3 x3':     runP5fast(b,atr,sess,0.75,3,3,15),
    'FAST 1.0 tgt2 x4':      runP5fast(b,atr,sess,1.0,2,4,15),
    'FAST 1.0 tgt3 x4':      runP5fast(b,atr,sess,1.0,3,4,15),
  };
  console.log('edge check (whole-sample R)   [trades/active-day]:');
  for(const [n,t] of Object.entries(cands)){const q=quick(t);const tpd=(t.length/ndays).toFixed(2);console.log('  '+n.padEnd(20), JSON.stringify(q), ' tpd~'+tpd);}
  const drs={}; for(const [n,t] of Object.entries(cands)) drs[n]=dailyR([t],sess.order);

  // 21 trading-day window (~30 calendar days). EVAL phase = no consistency rule (the speed goal).
  const RULES_EVAL={...RULES, consistencyPct:1.0};
  console.log('\n=== PASS WITHIN ~21 TRADING DAYS (~30 calendar days), eval (no consistency) ===');
  console.log('config                  $risk/R   pass%  ruin%  timeout%');
  for(const [name,dr] of Object.entries(drs)){
    for(const riskPerR of [100,150,200,250]){
      const r=evalSim(dr,riskPerR,RULES_EVAL,21,20000,7);
      console.log('  '+name.padEnd(20),String(riskPerR).padStart(6),String(r.pass).padStart(7),String(r.ruin).padStart(6),String(r.timeout).padStart(9));
    }
  }
  console.log('\nNote: fixed-$-risk/trade. timeout% = survived but did not reach $3000 inside 21 days.');
}
main();
