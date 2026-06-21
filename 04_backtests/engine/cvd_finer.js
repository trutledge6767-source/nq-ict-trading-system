#!/usr/bin/env node
/* cvd_finer.js — robustness check on the order-flow finding: does CVD-confirmed P5 survive a
 * FINER delta proxy? Builds 5-min bars from 1-min data and computes per-5min delta two ways:
 *   crude  = close-location of the 5-min bar * 5-min volume (what was used so far)
 *   finer  = SUM over the five 1-min bars of (1min close-location * 1min volume)  [≈ ta.requestVolumeDelta]
 * Then runs P5 baseline vs +crudeCVD vs +finerCVD. If finer confirms, the edge is de-risked.
 * Usage: node cvd_finer.js <1m_et_vol.json> */
'use strict';
const fs=require('fs');
const SLIP=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function clvDelta(o,h,l,c,v){return h>l?((c-l)-(h-c))/(h-l)*v:0;}
// build 5-min bars + crude & finer delta from 1-min input
function build5m(b1){
  const bars=[],crude=[],finer=[]; let key=null,o,h,l,c,v,fd;
  for(const x of b1){const t=x[0],bo=x[1],bh=x[2],bl=x[3],bc=x[4],bv=(x.length>5?(+x[5]||0):0);
    const k=Math.floor(t/300);
    if(k!==key){ if(key!==null){bars.push([key*300,o,h,l,c,v]);crude.push(clvDelta(o,h,l,c,v));finer.push(fd);} key=k;o=bo;h=bh;l=bl;c=bc;v=bv;fd=clvDelta(bo,bh,bl,bc,bv);}
    else{ if(bh>h)h=bh; if(bl<l)l=bl; c=bc; v+=bv; fd+=clvDelta(bo,bh,bl,bc,bv);} }
  if(key!==null){bars.push([key*300,o,h,l,c,v]);crude.push(clvDelta(o,h,l,c,v));finer.push(fd);}
  return {bars,crude,finer};
}
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function sessionCVD(delta,sess){const cvd=new Array(delta.length).fill(0);for(const k of sess.order){let cum=0;for(const i of sess.days[k].rth){cum+=delta[i];cvd[i]=cum;}}return cvd;}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess,cvd){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1;if(cvd&&(dir>0?cvd[i]<=0:cvd[i]>=0))break;const ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);let cum=0,peak=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return{trades:N,win:Math.round(1000*w.length/N)/10,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,netR:Math.round(cum),maxDD:Math.round(dd),posYears:ys.filter(y=>m[y]>0).length+'/'+ys.length};}
function corr(a,b){const n=a.length,mx=a.reduce((s,v)=>s+v,0)/n,my=b.reduce((s,v)=>s+v,0)/n;let c=0,vx=0,vy=0;for(let i=0;i<n;i++){c+=(a[i]-mx)*(b[i]-my);vx+=(a[i]-mx)**2;vy+=(b[i]-my)**2;}return Math.round(1000*c/Math.sqrt(vx*vy))/1000;}
function main(){
  const f=process.argv[2]||'04_backtests/data/NQ_1m_7y_ET_vol.json';
  const j=JSON.parse(fs.readFileSync(f,'utf8').replace(/^﻿/,''));
  const {bars,crude,finer}=build5m(j.bars);
  const atr=atr14(bars),sess=sessions(bars);
  const cvdCrude=sessionCVD(crude,sess), cvdFiner=sessionCVD(finer,sess);
  console.log('=== Order-flow robustness: crude (5m close-loc) vs finer (1m-aggregated) delta ===');
  console.log('5m bars '+bars.length+' built from 1m. delta crude-vs-finer corr: '+corr(crude,finer)+'\n');
  console.log('P5 baseline    :', JSON.stringify(stats(runP5(bars,atr,sess,null))));
  console.log('P5 + crude CVD :', JSON.stringify(stats(runP5(bars,atr,sess,cvdCrude))));
  console.log('P5 + FINER CVD :', JSON.stringify(stats(runP5(bars,atr,sess,cvdFiner))));
  console.log('\nIf FINER CVD confirms (expR > baseline, 8/8 yrs), the order-flow edge is de-risked vs the crude proxy.');
}
main();
