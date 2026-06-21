#!/usr/bin/env node
/* portfolio_sim.js — does combining P5 (breakout) with the negatively-correlated
 * reversion sleeve raise Sharpe and cut funded time-to-pass vs P5 alone?
 *  - builds aligned daily-R streams for P5 (0.75/am) and Rev (fade>2ATR, stop0.5)
 *  - sweeps reversion weight w; reports combined daily Sharpe
 *  - runs day-level first-passage funded sim (50k: target $3000, trailing DD $2500,
 *    daily loss $1100) for P5-alone vs the blended portfolio: pass%, ruin%, time-to-pass.
 * Usage: node portfolio_sim.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,k,stopExtra,maxBars){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=stopExtra*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgtPx=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function daily(arr){const n=arr.length,mean=arr.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/n);return{mean,sd,sharpe:sd>0?mean/sd:0,ann:sd>0?mean/sd*Math.sqrt(252):0};}
function corr(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let c=0,vx=0,vy=0;for(let i=0;i<n;i++){c+=(x[i]-mx)*(y[i]-my);vx+=(x[i]-mx)**2;vy+=(y[i]-my)**2;}return c/Math.sqrt(vx*vy);}
function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// first-passage: dayDollar[] sampled w/ replacement; pass=reach target before trailing-DD; record days
function passage(dayDollar,trailingDD,dailyLoss,target,paths,seed){
  const rnd=mb(seed||7),n=dayDollar.length,days=[];let ruin=0,daily=0;
  for(let p=0;p<paths;p++){let eq=0,peak=0,out=null,d=0;
    for(d=1;d<=1500;d++){const pnl=dayDollar[(rnd()*n)|0];
      if(pnl<=-dailyLoss){out='daily';break;} eq+=pnl;if(eq>peak)peak=eq;
      if((peak-eq)>=trailingDD){out='ruin';break;} if(eq>=target){out='pass';break;}}
    if(out==='pass')days.push(d);else if(out==='ruin')ruin++;else if(out==='daily')daily++;else days.push(d);}
  days.sort((a,b)=>a-b);const pc=q=>days.length?days[Math.min(days.length-1,Math.floor(q*days.length))]:NaN;
  return{pass:Math.round(1000*days.length/paths)/10,ruin:Math.round(1000*ruin/paths)/10,daily:Math.round(1000*daily/paths)/10,
    medTD:pc(.5),p75TD:pc(.75)};}
const cal=td=>isNaN(td)?'-':Math.round(td*7/5)+'cd';

function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRev(b,atr,ma,sess,2.0,0.5,15),sess.order);
  const dP5=daily(p5),dRev=daily(rev);
  console.log('=== Daily-R stream stats (per trading day) ===');
  console.log('P5 0.75/am : mean '+dP5.mean.toFixed(3)+' sd '+dP5.sd.toFixed(2)+' Sharpe/day '+dP5.sharpe.toFixed(3)+' ann '+dP5.ann.toFixed(2));
  console.log('Reversion  : mean '+dRev.mean.toFixed(3)+' sd '+dRev.sd.toFixed(2)+' Sharpe/day '+dRev.sharpe.toFixed(3)+' ann '+dRev.ann.toFixed(2));
  console.log('correlation: '+corr(p5,rev).toFixed(3));
  console.log('\n=== Combined daily Sharpe: P5 + w*Reversion (w = rev risk per R, P5=1) ===');
  console.log('  w     mean    sd   Sharpe/day  annualized');
  let best={ann:-1,w:0};
  for(const w of [0,0.25,0.5,0.75,1.0,1.5,2.0,3.0]){
    const comb=p5.map((v,i)=>v+w*rev[i]); const d=daily(comb);
    if(d.ann>best.ann)best={ann:d.ann,w};
    console.log('  '+String(w).padEnd(5),d.mean.toFixed(3).padStart(6),d.sd.toFixed(2).padStart(6),d.sharpe.toFixed(3).padStart(9),d.ann.toFixed(2).padStart(11));
  }
  console.log('  -> Sharpe-optimal reversion weight w* = '+best.w);

  console.log('\n=== FUNDED time-to-pass (50k: target $3000, trailingDD $2500, dailyLoss $1100) ===');
  console.log('Compare P5-alone vs blend at w* . P5 sized at $50/R; reversion at w*$50/R.');
  console.log('config                       pass%  ruin%  daily%  median-pass   p75');
  for(const [name,w,pR] of [['P5 alone @ $50/R',0,50],['P5+Rev (w*) @ $50/R',best.w,50],['P5+Rev (w*) @ $75/R',best.w,75]]){
    const dd=p5.map((v,i)=>v*pR + w*rev[i]*pR);
    const r=passage(dd,2500,1100,3000,30000,7);
    console.log('  '+name.padEnd(26),String(r.pass).padStart(5),String(r.ruin).padStart(6),String(r.daily).padStart(7),
      (r.medTD+'td/'+cal(r.medTD)).padStart(13),(r.p75TD+'td').padStart(8));
  }
  console.log('\nNote: td=trading days, cd≈calendar. Higher Sharpe + lower median-pass + lower ruin = diversification works.');
}
main();
