#!/usr/bin/env node
/* mim_test.js — verify Market Intraday Momentum (Gao,Han,Li,Zhou 2018, JFE) on NQ:
 * sign of FIRST 30-min return (09:30->10:00) predicts LAST 30-min (15:30->16:00).
 * Trade the last 30 min in that direction; stop = 1xATR (true R). Report edge,
 * per-year robustness, and DAILY-RETURN CORRELATION with P5 (the diversification test).
 * Usage: node mim_test.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const yr=t=>D(t).getUTCFullYear();const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}for(const k of order){const s=days[k];if(s.rth.length){let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}}return {days,order:order.filter(k=>days[k].rth.length>=12)};}
function holdToClose(b,atr,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess,stopMult,window){const {days,order}=sess,tr=[],cutoff=window==='am'?12*60:RTH_CLOSE;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,atr,dir,ent,b[ent][1]-dir*stopMult*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}

// MIM: signal = sign(close@10:00 - open@09:30); trade 15:30->16:00 in that direction, stop 1xATR
function runMIM(b,atr,sess,flip){
  const {days,order}=sess,tr=[];
  for(const k of order){const s=days[k];
    const oOpen=s.rth.find(i=>minOfDay(b[i][0])===RTH_OPEN); const first=s.rth.find(i=>minOfDay(b[i][0])>=10*60-5 && minOfDay(b[i][0])<10*60);
    const ent=s.rth.find(i=>minOfDay(b[i][0])>=15*60+30); const dayEnd=s.rth[s.rth.length-1];
    if(oOpen==null||first==null||ent==null||ent>=dayEnd)continue;
    const r1=b[first][4]-b[oOpen][1]; if(r1===0)continue;
    let dir=r1>0?1:-1; if(flip)dir=-dir;
    const a=atr[ent]; if(a==null||a<=0)continue;
    const t=holdToClose(b,atr,dir,ent,b[ent][1]-dir*a,dayEnd); if(t)tr.push(t);
  }
  return tr;
}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);const gW=w.reduce((s,t)=>s+t.r,0),gL=Math.abs(tr.filter(t=>t.r<=0).reduce((s,t)=>s+t.r,0));let peak=0,cum=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);return{trades:N,win:Math.round(1000*w.length/N)/10,PF:Math.round(1000*(gL>0?gW/gL:99))/1000,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,maxDD:Math.round(dd*10)/10};}
function posYears(tr){const g={};for(const t of tr){const y=yr(t.day.length?Date.parse(t.day)/1000:0);}const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m);return ys.filter(y=>m[y]>0).length+'/'+ys.length;}
function dayMap(tr){const m={};for(const t of tr)m[t.day]=(m[t.day]||0)+t.r;return m;}
function corr(a,b){const keys=Object.keys(a).filter(k=>k in b);if(keys.length<10)return NaN;const xs=keys.map(k=>a[k]),ys=keys.map(k=>b[k]);const mx=xs.reduce((s,v)=>s+v,0)/xs.length,my=ys.reduce((s,v)=>s+v,0)/ys.length;let cov=0,vx=0,vy=0;for(let i=0;i<xs.length;i++){cov+=(xs[i]-mx)*(ys[i]-my);vx+=(xs[i]-mx)**2;vy+=(ys[i]-my)**2;}return Math.round(1000*cov/Math.sqrt(vx*vy))/1000;}

function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),sess=sessions(b);
  const p5=runP5(b,atr,sess,0.75,'am');
  const mim=runMIM(b,atr,sess,false);
  const mimFlip=runMIM(b,atr,sess,true);
  console.log('=== Market Intraday Momentum (MIM) verification on NQ 2019-2026 ===');
  console.log('P5 0.75/am        ', JSON.stringify(stats(p5)), '+yrs',posYears(p5));
  console.log('MIM (momentum)    ', JSON.stringify(stats(mim)), '+yrs',posYears(mim));
  console.log('MIM flipped(revert)',JSON.stringify(stats(mimFlip)),'+yrs',posYears(mimFlip));
  const cP5=dayMap(p5), cMIM=dayMap(mim);
  console.log('\nDAILY-R CORRELATION  P5 vs MIM:', corr(cP5,cMIM), '(low/negative = good diversifier)');
  // per-year expR for MIM
  const m={};for(const t of mim){const y=t.day.split('-')[0];(m[y]=m[y]||[]).push(t.r);}
  console.log('MIM per-year expR:', Object.keys(m).sort().map(y=>y.slice(2)+':'+(m[y].reduce((s,v)=>s+v,0)/m[y].length).toFixed(2)).join('  '));
}
main();
