#!/usr/bin/env node
/* mim_cond.js — Conditional Market Intraday Momentum on NQ.
 * Paper (Gao,Han,Li,Zhou 2018): MIM is stronger on HIGH-VOL / LARGE-first-move days.
 * Trade last 30min (15:30->16:00) in dir of first-30min return, ONLY when:
 *   |r1| >= minR1Atr * ATR_open   AND   day's open-ATR is in top volTopPct regime.
 * Stop = 1xATR (true R). Reports edge, per-year robustness, trade count, P5 correlation.
 * Usage: node mim_cond.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}for(const k of order){const s=days[k];if(s.rth.length){let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}}return {days,order:order.filter(k=>days[k].rth.length>=12)};}
function holdToClose(b,atr,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,atr,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}

// precompute per-day features
function dayFeatures(b,atr,sess){
  const {days,order}=sess, feats=[];
  for(const k of order){const s=days[k];
    const oOpen=s.rth.find(i=>minOfDay(b[i][0])===RTH_OPEN);
    const first=s.rth.find(i=>minOfDay(b[i][0])>=10*60-5 && minOfDay(b[i][0])<10*60);
    const ent=s.rth.find(i=>minOfDay(b[i][0])>=15*60+30);
    const dayEnd=s.rth[s.rth.length-1];
    if(oOpen==null||first==null||ent==null||ent>=dayEnd){feats.push(null);continue;}
    feats.push({day:k,r1:b[first][4]-b[oOpen][1],atrOpen:atr[oOpen],atrEnt:atr[ent],oOpen,first,ent,dayEnd});
  }
  // rolling 60-day percentile rank of atrOpen
  const valid=feats.filter(f=>f&&f.atrOpen!=null);
  for(let i=0;i<feats.length;i++){const f=feats[i];if(!f||f.atrOpen==null){continue;}
    const win=feats.slice(Math.max(0,i-60),i).filter(x=>x&&x.atrOpen!=null);
    if(win.length<20){f.volPct=0.5;continue;}
    const le=win.filter(x=>x.atrOpen<=f.atrOpen).length; f.volPct=le/win.length;}
  return feats;
}
function runCond(b,atr,feats,minR1Atr,volTopPct){
  const tr=[];
  for(const f of feats){ if(!f||f.atrEnt==null||f.atrOpen==null||f.atrOpen<=0)continue;
    if(Math.abs(f.r1) < minR1Atr*f.atrOpen) continue;                 // first-move magnitude filter
    if(volTopPct!=null && f.volPct < (1-volTopPct)) continue;          // high-vol-regime day filter
    const dir=f.r1>0?1:-1; const a=f.atrEnt;
    const t=holdToClose(b,atr,dir,f.ent,b[f.ent][1]-dir*a,f.dayEnd); if(t)tr.push(t);
  }
  return tr;
}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);const gW=w.reduce((s,t)=>s+t.r,0),gL=Math.abs(tr.filter(t=>t.r<=0).reduce((s,t)=>s+t.r,0));let peak=0,cum=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);return{trades:N,win:Math.round(1000*w.length/N)/10,PF:Math.round(1000*(gL>0?gW/gL:99))/1000,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,maxDD:Math.round(dd*10)/10};}
function posYears(tr){const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return ys.filter(y=>m[y]>0).length+'/'+ys.length+'  ['+ys.map(y=>y.slice(2)+':'+m[y].toFixed(1)).join(' ')+']';}
function dayMap(tr){const m={};for(const t of tr)m[t.day]=(m[t.day]||0)+t.r;return m;}
function corr(a,b){const keys=Object.keys(a).filter(k=>k in b);if(keys.length<10)return NaN;const xs=keys.map(k=>a[k]),ys=keys.map(k=>b[k]);const mx=xs.reduce((s,v)=>s+v)/xs.length,my=ys.reduce((s,v)=>s+v)/ys.length;let c=0,vx=0,vy=0;for(let i=0;i<xs.length;i++){c+=(xs[i]-mx)*(ys[i]-my);vx+=(xs[i]-mx)**2;vy+=(ys[i]-my)**2;}return Math.round(1000*c/Math.sqrt(vx*vy))/1000;}

function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),sess=sessions(b);
  const feats=dayFeatures(b,atr,sess);
  const p5map=dayMap(runP5(b,atr,sess));
  console.log('=== Conditional MIM on NQ 2019-2026 (last-30min in dir of first-30min) ===');
  const configs=[
    ['all days (baseline)',0,null],
    ['|r1|>0.5ATR',0.5,null],
    ['|r1|>1.0ATR',1.0,null],
    ['|r1|>1.5ATR',1.5,null],
    ['high-vol top30%',0,0.30],
    ['|r1|>1.0ATR & vol top30%',1.0,0.30],
    ['|r1|>1.5ATR & vol top50%',1.5,0.50],
  ];
  for(const [name,mr,vp] of configs){
    const tr=runCond(b,atr,feats,mr,vp); const s=stats(tr);
    console.log('\n'+name); console.log('  '+JSON.stringify(s));
    if(s.trades){console.log('  +yrs '+posYears(tr)); console.log('  corr vs P5: '+corr(dayMap(tr),p5map));}
  }
}
main();
