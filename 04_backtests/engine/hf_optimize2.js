#!/usr/bin/env node
/* hf_optimize2.js — two remaining hedge-fund techniques on the blend (P5 0.75/am + w*limit-reversion):
 *  (1) MEAN-VARIANCE optimal weight (fine grid Sharpe-max) vs risk-parity 0.7 vs static 0.5.
 *  (2) DRAWDOWN-BASED DE-RISKING (equity-curve trading): cut size while in a drawdown > threshold.
 * Sharpe is scale-invariant for weighting; for de-risking we compare Sharpe/netR/maxDD. Usage: node hf_optimize2.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function runRevLimit(b,atr,ma,sess,k,se,maxBars,off,fillWin){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,L=dir<0?b[i][4]+off*a:b[i][4]-off*a;let ent=-1;for(let f=qi+1;f<rth.length&&f<=qi+fillWin;f++){const fi=rth[f];if(dir<0?b[fi][2]>=L:b[fi][3]<=L){ent=fi;break;}}if(ent<0){qi++;continue;}const a2=atr[ent],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=L-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=0.5;for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=0.5;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-L):(L-exPx))-eslip;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function ann(arr){const n=arr.length,m=arr.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-m)**2,0)/n);return sd>0?m/sd*Math.sqrt(252):0;}
function ddof(arr){let peak=0,cum=0,dd=0;for(const v of arr){cum+=v;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}return {net:cum,maxDD:dd};}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3),sess.order);
  // (1) mean-variance optimal weight (fine grid)
  console.log('=== (1) Optimal blend weight (Sharpe-max grid) ===');
  let best={w:0,s:-1};
  for(let w=0.3;w<=1.21;w+=0.05){const bl=p5.map((v,i)=>v+w*rev[i]);const s=ann(bl);if(s>best.s)best={w:+w.toFixed(2),s};}
  for(const w of [0.5,0.7,best.w]){const bl=p5.map((v,i)=>v+w*rev[i]);console.log('  w='+w.toFixed(2)+'  annSharpe '+ann(bl).toFixed(3)+(w===best.w?'  <- grid-optimal':w===0.7?'  (risk parity)':w===0.5?'  (static)':''));}
  // (2) drawdown-based de-risking on the chosen blend
  console.log('\n=== (2) Drawdown de-risking (cut to scale*size while in DD > thresh R) ===');
  const blend=p5.map((v,i)=>v+best.w*rev[i]);
  const base=ddof(blend);console.log('  none (full size)         annSharpe '+ann(blend).toFixed(3)+'  netR '+Math.round(base.net)+'  maxDD '+Math.round(base.maxDD));
  for(const [thresh,scale] of [[10,0.5],[15,0.5],[20,0.5],[15,0.25]]){
    let peak=0,cum=0;const out=blend.map(v=>{const inDD=(peak-cum)>thresh;const eff=inDD?scale:1;const r=v*eff;cum+=r;peak=Math.max(peak,cum);return r;});
    const m=ddof(out);console.log('  DD>'+thresh+'R -> x'+scale+'           annSharpe '+ann(out).toFixed(3)+'  netR '+Math.round(m.net)+'  maxDD '+Math.round(m.maxDD));
  }
  console.log('\nHigher Sharpe or much lower maxDD w/o killing netR = it helps. (Recurring finding: added complexity rarely helps.)');
}
main();
