#!/usr/bin/env node
/* regime_alloc.js — hedge-fund allocation techniques on the P5+reversion blend:
 *   (a) static 50/50 (baseline), (b) RISK PARITY (inverse-vol weights),
 *   (c) TACTICAL REGIME tilt (more P5 in trending periods, more reversion in chop, via causal ER).
 * Sharpe is scale-invariant, so we compare relative weighting schemes directly. Also reports the
 * blend's Kelly fraction (informational; funded sizing is DD-constrained). Usage: node regime_alloc.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;s.close=b[s.rth[s.rth.length-1]][4];}return {days,order:ord};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function runRevLimit(b,atr,ma,sess,k,se,maxBars,off,fillWin){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,L=dir<0?b[i][4]+off*a:b[i][4]-off*a;let ent=-1;for(let f=qi+1;f<rth.length&&f<=qi+fillWin;f++){const fi=rth[f];if(dir<0?b[fi][2]>=L:b[fi][3]<=L){ent=fi;break;}}if(ent<0){qi++;continue;}const a2=atr[ent],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=L-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=0.5;for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=0.5;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-L):(L-exPx))-eslip;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function metrics(arr){const n=arr.length,mean=arr.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/n);let peak=0,cum=0,dd=0;for(const v of arr){cum+=v;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}return{ann:+(sd>0?mean/sd*Math.sqrt(252):0).toFixed(3),net:Math.round(cum),maxDD:Math.round(dd)};}
function std(a){const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3),sess.order);
  // causal trend regime: efficiency ratio over prior 10 daily closes (lagged by 1 day)
  const closes=sess.order.map(k=>sess.days[k].close);
  const ER=new Array(closes.length).fill(0.5);
  for(let i=11;i<closes.length;i++){const num=Math.abs(closes[i-1]-closes[i-11]);let den=0;for(let k=i-10;k<=i-1;k++)den+=Math.abs(closes[k]-closes[k-1]);ER[i]=den>0?num/den:0.5;}
  const sP5=std(p5),sRev=std(rev);
  console.log('=== Hedge-fund allocation on the P5+reversion blend (daily ann Sharpe) ===');
  console.log('daily std: P5='+sP5.toFixed(2)+'  Rev='+sRev.toFixed(2)+'\n');
  const schemes={
    'static 50/50 (current)': p5.map((v,i)=>v+0.5*rev[i]),
    'risk parity (inv-vol)':  p5.map((v,i)=>v+(sP5/sRev)*rev[i]),
    'tactical regime (ER tilt)': p5.map((v,i)=>{const e=Math.max(0,Math.min(1,ER[i]));return (0.5+e)*v + (0.5+(1-e))*0.5*rev[i];}),
    'regime: P5-only in trend, rev-only in chop': p5.map((v,i)=>{const e=ER[i];return e>=0.5? v : 0.5*rev[i];}),
  };
  for(const [n,s] of Object.entries(schemes)){const m=metrics(s);console.log('  '+n.padEnd(42),'annSharpe '+m.ann+'   netR '+m.net+'   maxDD '+m.maxDD);}
  // Kelly fraction of the blend (per-day): f* = mean/variance
  const blend=p5.map((v,i)=>v+0.5*rev[i]);const mu=blend.reduce((a,b)=>a+b,0)/blend.length;const v=std(blend)**2;
  console.log('\nBlend daily mean '+mu.toFixed(3)+'R, var '+v.toFixed(2)+' -> full-Kelly f* ~'+(mu/v).toFixed(2)+' (per-day R units; use ~1/4 of this).');
  console.log('NOTE: funded sizing is DRAWDOWN-constrained, not Kelly-constrained — Kelly is informational only.');
}
main();
