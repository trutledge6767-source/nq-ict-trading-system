#!/usr/bin/env node
/* vol_target.js — does volatility-targeted sizing (Moreira-Muir 2017) improve the blend?
 * Scale each day's exposure by targetVol/trailingVol (CAUSAL: trailing std uses only past days),
 * clamped. Compare annualized Sharpe + maxDD: constant vs vol-targeted, for P5, reversion, blend.
 * Usage: node vol_target.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const yrOf=k=>k.split('-')[0];
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,k,se,maxBars){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function metrics(arr){const n=arr.length,mean=arr.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/n);let peak=0,cum=0,dd=0;for(const v of arr){cum+=v;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}return{ann:+(sd>0?mean/sd*Math.sqrt(252):0).toFixed(2),maxDD:Math.round(dd),net:Math.round(cum)};}
// causal vol-target: scale[t] = clamp(targetVol / std(prev L days), lo, hi)
function volTarget(stream,L,lo,hi){const n=stream.length;const fullSd=Math.sqrt(stream.reduce((a,b)=>a+b*b,0)/n - (stream.reduce((a,b)=>a+b,0)/n)**2);const out=new Array(n).fill(0);for(let t=0;t<n;t++){if(t<L){out[t]=stream[t];continue;}let m=0;for(let k=t-L;k<t;k++)m+=stream[k];m/=L;let v=0;for(let k=t-L;k<t;k++)v+=(stream[k]-m)**2;v=Math.sqrt(v/L);let sc=v>0?fullSd/v:1;sc=Math.max(lo,Math.min(hi,sc));out[t]=stream[t]*sc;}return out;}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRev(b,atr,ma,sess,2,0.5,15),sess.order);
  const blend=p5.map((v,i)=>v+0.5*rev[i]);
  console.log('=== Volatility-targeted sizing (Moreira-Muir) — causal, clamp 0.33..3.0 ===\n');
  console.log('stream   constant (annSharpe / maxDD / net)   vol-targeted L=20    L=40');
  for(const [nm,st] of [['P5   ',p5],['Rev  ',rev],['Blend',blend]]){
    const c=metrics(st);
    const v20=metrics(volTarget(st,20,0.33,3)), v40=metrics(volTarget(st,40,0.33,3));
    console.log('  '+nm+'  '+(c.ann+' / '+c.maxDD+' / '+c.net).padEnd(24)+'   '+
      (v20.ann+' / '+v20.maxDD).padEnd(18)+'   '+(v40.ann+' / '+v40.maxDD));
  }
  console.log('\nMoreira-Muir: vol-targeting helps if vol is persistent & not return-predictive. Higher annSharpe = it helps.');
}
main();
