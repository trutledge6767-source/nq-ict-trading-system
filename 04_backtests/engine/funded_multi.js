#!/usr/bin/env node
/* funded_multi.js — (1) risk-matched funded-phase: size P5-alone and the blend to the
 * SAME daily-$ volatility, so survival/income compare fairly. (2) Multi-account book income:
 * model N funded accounts, both COPY-TRADED (correlated -> no cross-account diversification)
 * and DECORRELATED (idealized upper bound). Apex-style locking trailing DD, monthly withdrawal.
 * Usage: node funded_multi.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0, FEE=150; // assumed one-time eval/reset fee per account
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,k,stopExtra,maxBars){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=stopExtra*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgtPx=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function std(a){const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);}
function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const pc=(arr,q)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(q*s.length))];};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;

// one 12-month funded account; returns {realized, breached}
function account(dayR,mult,rnd){
  const TRAIL=2500,LOCK=2600,FLOOR=100,BUF=1500,MO=21,MOS=12,n=dayR.length;
  let eq=0,peak=0,locked=false,thr=-TRAIL,bank=0;
  for(let d=1;d<=MOS*MO;d++){const pnl=dayR[(rnd()*n)|0]*mult;eq+=pnl;
    if(!locked){if(eq>peak)peak=eq;if(peak>=LOCK){locked=true;thr=FLOOR;}else thr=peak-TRAIL;}
    if(eq<=thr)return {realized:bank,breached:true};
    if(d%MO===0&&locked){const w=Math.max(0,eq-(FLOOR+BUF));bank+=w;eq-=w;}}
  return {realized:bank+Math.max(0,eq-FLOOR),breached:false};
}
function single(dayR,mult,paths,seed){const rnd=mb(seed);const real=[];let br=0;for(let p=0;p<paths;p++){const a=account(dayR,mult,rnd);real.push(a.realized);if(a.breached)br++;}return {breachPct:Math.round(1000*br/paths)/10,mean:Math.round(mean(real)),med:Math.round(pc(real,.5)),p10:Math.round(pc(real,.1)),p90:Math.round(pc(real,.9))};}
function book(dayR,mult,N,correlated,paths,seed){const rnd=mb(seed);const tot=[];for(let p=0;p<paths;p++){let sum=0;
  if(correlated){const a=account(dayR,mult,rnd);sum=N*a.realized-(a.breached?N*FEE:0);}
  else{for(let k=0;k<N;k++){const a=account(dayR,mult,rnd);sum+=a.realized-(a.breached?FEE:0);}}
  tot.push(sum);}
  return {mean:Math.round(mean(tot)),p10:Math.round(pc(tot,.1)),med:Math.round(pc(tot,.5)),p90:Math.round(pc(tot,.9))};}

function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRev(b,atr,ma,sess,2.0,0.5,15),sess.order);
  const blend=p5.map((v,i)=>v+0.5*rev[i]);
  const sP5=std(p5),sBl=std(blend);

  console.log('=== (1) RISK-MATCHED funded phase (same daily-$ volatility) ===');
  console.log('Daily-R std: P5='+sP5.toFixed(2)+'  Blend(P5+0.5rev)='+sBl.toFixed(2)+'  (mult = targetVol/std)\n');
  console.log('targetVol/day  strategy   $/R-mult  breach%   realized$ (mean / median / p10..p90)');
  for(const sig of [130,190,285]){
    for(const [nm,st,sd] of [['P5   ',p5,sP5],['Blend',blend,sBl]]){
      const mult=sig/sd; const r=single(st,mult,20000,7);
      console.log('  $'+String(sig).padStart(3)+'/day      '+nm+'     '+mult.toFixed(1).padStart(5)+'    '+String(r.breachPct).padStart(5)+'%   $'+String(r.mean).padStart(5)+' / $'+String(r.med).padStart(5)+'  ($'+r.p10+'..$'+r.p90+')');
    }
  }
  console.log('  -> at equal risk the blend should earn more per account for the same breach%.');

  console.log('\n=== (2) MULTI-ACCOUNT BOOK income (blend, conservative $190/day vol each, 12mo) ===');
  console.log('FEE $'+FEE+'/account assumed. Copy-traded = correlated (all accounts share one path).');
  console.log('  N   mode          total income (mean / median / p10..p90)');
  const mult=190/sBl;
  for(const N of [1,3,5,10]){
    for(const [mode,corr] of [['copy(correlated)',true],['decorrelated   ',false]]){
      if(N===1&&!corr)continue;
      const r=book(blend,mult,N,corr,15000,7);
      console.log('  '+String(N).padStart(2)+'  '+mode+'  $'+String(r.mean).padStart(6)+' / $'+String(r.med).padStart(6)+'  ($'+r.p10+'..$'+r.p90+')');
    }
  }
  console.log('\nKey: copy-trading N accounts = N x income but CORRELATED (you can lose all N together).');
  console.log('Decorrelating (stagger starts / split P5 vs reversion across accounts) smooths the book.');
}
main();
