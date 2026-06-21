#!/usr/bin/env node
/* cvd_variants.js — find the BEST order-flow confirmation for P5. Compares CVD logics:
 *  level (sign), slope (rising/falling), conviction (|CVD| threshold), delta+CVD (both),
 *  no-divergence (skip when CVD slope opposes the break). Reports expR/Sharpe/netR/maxDD/+yrs.
 * Usage: node cvd_variants.js <data_et_vol.json> */
'use strict';
const fs=require('fs');
const SLIP=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function deltaCVD(b,sess){const dl=new Array(b.length).fill(0),cvd=new Array(b.length).fill(0);for(let i=0;i<b.length;i++){const h=b[i][2],l=b[i][3],c=b[i][4],v=b[i].length>5?(+b[i][5]||0):0;dl[i]=h>l?((c-l)-(h-c))/(h-l)*v:0;}for(const k of sess.order){let cum=0;for(const i of sess.days[k].rth){cum+=dl[i];cvd[i]=cum;}}return {dl,cvd};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
// pass(i,dir) -> boolean filter
function runP5(b,atr,sess,pass){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1;if(!pass(i,dir))break;const ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);let cum=0,peak=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return{trades:N,win:Math.round(1000*w.length/N)/10,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,netR:Math.round(cum),maxDD:Math.round(dd),posYears:ys.filter(y=>m[y]>0).length+'/'+ys.length};}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET_vol.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),sess=sessions(b);const {dl,cvd}=deltaCVD(b,sess);
  // CVD daily scale for conviction threshold: use median |cvd| at signal-ish ~ just use a fraction of rolling
  const slope=i=>i>=3?cvd[i]-cvd[i-3]:0;
  const variants={
    'none (baseline)':      (i,dir)=>true,
    'CVD level (sign)':     (i,dir)=>dir>0?cvd[i]>0:cvd[i]<0,
    'CVD slope (3-bar)':    (i,dir)=>dir>0?slope(i)>0:slope(i)<0,
    'level + slope':        (i,dir)=>dir>0?(cvd[i]>0&&slope(i)>0):(cvd[i]<0&&slope(i)<0),
    'delta + level':        (i,dir)=>dir>0?(dl[i]>0&&cvd[i]>0):(dl[i]<0&&cvd[i]<0),
    'no-divergence (slope)':(i,dir)=>dir>0?slope(i)>=0:slope(i)<=0,
  };
  console.log('=== P5 order-flow variant comparison (NQ 2019-2026) ===\n');
  for(const [nm,f] of Object.entries(variants))
    console.log(nm.padEnd(22), JSON.stringify(stats(runP5(b,atr,sess,f))));
  console.log('\nBest = highest Sharpe/expR while keeping 8/8 years and adequate trade count.');
}
main();
