#!/usr/bin/env node
/* =====================================================================
 * primitive_scan.js — find raw, low-parameter edges that GENERALIZE on
 * NQ before building any composite strategy. Each "primitive" is a
 * single economic idea with 0-1 knobs. All candidates are scored on the
 * SAME yardstick as the ICT engine: realistic costs + R measured in
 * ATR-at-entry units, so results are directly comparable.
 *
 * The decisive test is PER-YEAR CONSISTENCY (2019..2026) — the regime
 * robustness the ICT build failed — plus comparison vs dumb baselines.
 *
 * Input: an ET-encoded 5m file (tz_offset_hours:0), e.g. NQ_5m_7y_ET.json
 * Usage: node primitive_scan.js <data_et.json>
 * ===================================================================== */
'use strict';
const fs=require('fs');

// ---- costs (mirror engine DEF) ----
const POINT=20.0, COMM=2.10, SLIP_RT=1.0;   // $/pt, $/contract/side, slippage pts round-trip

// ---- helpers on ET-encoded epochs (tz=0 -> getUTC* gives NY wall clock) ----
const D=t=>new Date(t*1000);
const hh=t=>D(t).getUTCHours(), mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const yr=t=>D(t).getUTCFullYear();
const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30, RTH_CLOSE=16*60;     // 09:30..16:00 ET
const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN && m<RTH_CLOSE;};

function atr14(b){
  const len=14, tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));
  const out=new Array(b.length).fill(null); let prev=null;
  for(let i=0;i<tr.length;i++){ if(i<len-1)continue;
    if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;} else prev=(prev*(len-1)+tr[i])/len;
    out[i]=prev; }
  return out;
}

// build one trade record (R = ATR-normalized net return; costs included)
function mkTrade(dir,entIdx,exIdx,b,atr){
  const ep=b[entIdx][1], xp=b[exIdx][4];                 // enter at bar OPEN, exit at bar CLOSE (non-repainting)
  const a=atr[entIdx]; if(a==null||a<=0) return null;
  const grossPts=dir>0?(xp-ep):(ep-xp);
  const netPts=grossPts-SLIP_RT;
  return {dir, r:netPts/a, dollars:netPts*POINT-2*COMM, barsHeld:exIdx-entIdx,
          entryTime:b[entIdx][0], exitTime:b[exIdx][0]};
}
// trade with an explicit stop (breakout style): exit at stop, target=RTH close, R still ATR-normalized
function mkTradeStop(dir,entIdx,stopPx,b,atr,dayEndIdx){
  const ep=b[entIdx][1], a=atr[entIdx]; if(a==null||a<=0) return null;
  let exIdx=dayEndIdx, exPx=b[dayEndIdx][4];
  for(let i=entIdx+1;i<=dayEndIdx;i++){
    if(dir>0 && b[i][3]<=stopPx){ exIdx=i; exPx=stopPx; break; }
    if(dir<0 && b[i][2]>=stopPx){ exIdx=i; exPx=stopPx; break; }
  }
  const grossPts=dir>0?(exPx-ep):(ep-exPx); const netPts=grossPts-SLIP_RT;
  return {dir, r:netPts/a, dollars:netPts*POINT-2*COMM, barsHeld:exIdx-entIdx,
          entryTime:b[entIdx][0], exitTime:b[exIdx][0]};
}

function metrics(tr){
  const N=tr.length; if(!N) return {trades:0};
  const wins=tr.filter(t=>t.r>0), losses=tr.filter(t=>t.r<=0);
  const gW=wins.reduce((s,t)=>s+t.r,0), gL=Math.abs(losses.reduce((s,t)=>s+t.r,0));
  const net=tr.reduce((s,t)=>s+t.r,0), netUsd=tr.reduce((s,t)=>s+t.dollars,0);
  let peak=0,cum=0,maxDD=0; for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);maxDD=Math.min(maxDD,cum-peak);}
  const mean=net/N, sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);
  const r=v=>Math.round(v*1000)/1000;
  return {trades:N, win:Math.round(1000*wins.length/N)/10,
    PF:gL>0?r(gW/gL):(gW>0?99:0), expR:r(mean), netR:Math.round(net*10)/10,
    netUSD:Math.round(netUsd), maxDD:Math.round(maxDD*10)/10, sharpe:sd>0?r(mean/sd):0};
}
function byYear(tr){
  const g={}; for(const t of tr){const y=yr(t.entryTime);(g[y]=g[y]||[]).push(t);}
  const out={}; for(const y of Object.keys(g).sort()) out[y]=metrics(g[y]); return out;
}

// ---- session index: per trading day, RTH bar indices + key levels ----
function sessions(b){
  const days={}, order=[];
  for(let i=0;i<b.length;i++){ const k=ymd(b[i][0]); if(!days[k]){days[k]={all:[],rth:[]};order.push(k);} days[k].all.push(i); if(isRTH(b[i][0]))days[k].rth.push(i); }
  for(const k of order){ const s=days[k]; if(s.rth.length){ let hi=-1e9,lo=1e9; for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);} s.rthHi=hi;s.rthLo=lo;s.open=b[s.rth[0]][1];s.close=b[s.rth[s.rth.length-1]][4]; } }
  return {days,order};
}

// ===================== PRIMITIVES =====================
function buildPrimitives(b,atr){
  const {days,order}=sessions(b);
  const P={};
  const fullDays=order.filter(k=>days[k].rth.length>=6);   // need a real RTH session

  // P1: RTH drift — long open->close every day (also the "always-long" baseline)
  P['P1 RTH-long open->close']=()=>{const tr=[];for(const k of fullDays){const s=days[k];const t=mkTrade(1,s.rth[0],s.rth[s.rth.length-1],b,atr);if(t)tr.push(t);}return tr;};

  // P2: Overnight drift — long RTH close -> next RTH open
  P['P2 Overnight-long close->open']=()=>{const tr=[];for(let j=0;j<fullDays.length-1;j++){const a=days[fullDays[j]],n=days[fullDays[j+1]];const ent=a.rth[a.rth.length-1],ex=n.rth[0];const at=atr[ent];if(at==null||at<=0)continue;const ep=b[ent][4],xp=b[ex][1];const netPts=(xp-ep)-SLIP_RT;tr.push({dir:1,r:netPts/at,dollars:netPts*POINT-2*COMM,barsHeld:ex-ent,entryTime:b[ent][0],exitTime:b[ex][0]});}return tr;};

  // P3: Opening-range breakout — OR = 09:30-10:00; break -> enter next open, stop opposite OR, exit RTH close
  P['P3 ORB-30m breakout']=()=>{const tr=[];for(const k of fullDays){const s=days[k];const orEnd=10*60;const orIdx=s.rth.filter(i=>minOfDay(b[i][0])<orEnd);if(orIdx.length<3)continue;let oh=-1e9,ol=1e9;for(const i of orIdx){oh=Math.max(oh,b[i][2]);ol=Math.min(ol,b[i][3]);}const after=s.rth.filter(i=>minOfDay(b[i][0])>=orEnd);const dayEnd=s.rth[s.rth.length-1];let done=false;for(let q=0;q<after.length-1;q++){const i=after[q];if(b[i][4]>oh){const t=mkTradeStop(1,after[q+1],ol,b,atr,dayEnd);if(t)tr.push(t);done=true;break;}if(b[i][4]<ol){const t=mkTradeStop(-1,after[q+1],oh,b,atr,dayEnd);if(t)tr.push(t);done=true;break;}}}return tr;};

  // P4: Gap fade — fade overnight gap at RTH open, exit RTH close
  P['P4 Gap-fade open->close']=()=>{const tr=[];for(let j=1;j<fullDays.length;j++){const p=days[fullDays[j-1]],s=days[fullDays[j]];const gap=s.open-p.close;if(Math.abs(gap)<1e-9)continue;const dir=gap>0?-1:1;const t=mkTrade(dir,s.rth[0],s.rth[s.rth.length-1],b,atr);if(t)tr.push(t);}return tr;};

  // P5: Prior-day high/low breakout (testable ICT core) — RTH close beyond PDH/PDL -> enter next open, stop 1xATR, exit RTH close
  P['P5 PDH/PDL breakout']=()=>{const tr=[];for(let j=1;j<fullDays.length;j++){const p=days[fullDays[j-1]],s=days[fullDays[j]];const dayEnd=s.rth[s.rth.length-1];let done=false;for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q];const a=atr[i];if(a==null)continue;if(!done&&b[i][4]>p.rthHi){const t=mkTradeStop(1,s.rth[q+1],b[s.rth[q+1]][1]-a,b,atr,dayEnd);if(t)tr.push(t);done=true;break;}if(!done&&b[i][4]<p.rthLo){const t=mkTradeStop(-1,s.rth[q+1],b[s.rth[q+1]][1]+a,b,atr,dayEnd);if(t)tr.push(t);done=true;break;}}}return tr;};

  // P6: Last-hour momentum — at 15:00 ET enter in direction of RTH-open->now move, exit RTH close
  P['P6 Last-hour momentum']=()=>{const tr=[];for(const k of fullDays){const s=days[k];const h3=s.rth.find(i=>minOfDay(b[i][0])>=15*60);if(h3==null)continue;const prior=b[h3-1][4];const move=prior-s.open;if(Math.abs(move)<1e-9)continue;const dir=move>0?1:-1;const t=mkTrade(dir,h3,s.rth[s.rth.length-1],b,atr);if(t)tr.push(t);}return tr;};

  // BASELINE: random long/short at RTH open -> close (seeded) = noise floor
  P['B  Random open->close']=()=>{let sd=12345;const rnd=()=>{sd=(sd*1103515245+12345)&0x7fffffff;return sd/0x7fffffff;};const tr=[];for(const k of fullDays){const s=days[k];const dir=rnd()<0.5?1:-1;const t=mkTrade(dir,s.rth[0],s.rth[s.rth.length-1],b,atr);if(t)tr.push(t);}return tr;};

  return P;
}

function main(){
  const f=process.argv[2]; if(!f){console.error('usage: node primitive_scan.js <data_et.json>');process.exit(1);}
  const j=JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));
  if(j.tz_offset_hours!==0) console.error('WARN: expected ET-encoded data (tz_offset_hours:0); got '+j.tz_offset_hours);
  const b=j.bars; const atr=atr14(b);
  console.log('data: '+b.length+' bars  '+ymd(b[0][0])+' -> '+ymd(b[b.length-1][0])+'\n');
  const P=buildPrimitives(b,atr);
  const rows=[];
  for(const name of Object.keys(P)){
    const tr=P[name](); const m=metrics(tr); const yb=byYear(tr);
    const years=Object.keys(yb); const posYears=years.filter(y=>yb[y].expR>0).length;
    rows.push({name,m,posYears,nYears:years.length,yb});
  }
  // table
  console.log('strategy                       trades   win%     PF    expR    netR   maxDD  +yrs');
  for(const r of rows){const m=r.m;if(!m.trades){console.log(r.name.padEnd(30),'  (no trades)');continue;}
    console.log(r.name.padEnd(30),String(m.trades).padStart(6),String(m.win).padStart(6),String(m.PF).padStart(6),String(m.expR).padStart(7),String(m.netR).padStart(7),String(m.maxDD).padStart(7),(r.posYears+'/'+r.nYears).padStart(6));}
  // per-year expR matrix (the regime-consistency test)
  const allYears=[...new Set(rows.flatMap(r=>Object.keys(r.yb)))].sort();
  console.log('\nper-year expR (regime consistency):');
  console.log('strategy'.padEnd(30),allYears.map(y=>y.slice(2)).map(s=>s.padStart(6)).join(''));
  for(const r of rows){if(!r.m.trades)continue;console.log(r.name.padEnd(30),allYears.map(y=>(r.yb[y]?String(r.yb[y].expR):'-')).map(s=>s.padStart(6)).join(''));}
  console.log('\nNote: R = ATR(14)-normalized net return; costs = '+SLIP_RT+'pt slip + $'+(2*COMM)+' RT commission. Enter@open, exit@close (non-repainting).');
}
main();
