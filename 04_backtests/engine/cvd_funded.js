#!/usr/bin/env node
/* cvd_funded.js — does CVD-confirmed P5 (higher Sharpe, fewer trades) actually pass funded FASTER?
 * Builds daily-R streams for P5, P5+CVD, reversion; compares daily Sharpe and day-level first-passage
 * (target $3000, trailing $2500, dailyLoss $1100) for P5 vs P5+CVD and the two blends.
 * Usage: node cvd_funded.js <data_et_vol.json> */
'use strict';
const fs=require('fs');
const SLIP=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function deltaCVD(b,sess){const dl=new Array(b.length).fill(0),cvd=new Array(b.length).fill(null);for(let i=0;i<b.length;i++){const h=b[i][2],l=b[i][3],c=b[i][4],v=b[i].length>5?(+b[i][5]||0):0;dl[i]=h>l?((c-l)-(h-c))/(h-l)*v:0;}for(const k of sess.order){let cum=0;for(const i of sess.days[k].rth){cum+=dl[i];cvd[i]=cum;}}return {dl,cvd};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess,cvd,useCVD){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1;if(useCVD&&(dir>0?cvd[i]<=0:cvd[i]>=0))break;const ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function runRev(b,atr,ma,sess,k,se,maxBars){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function annSharpe(a){const n=a.length,mean=a.reduce((x,y)=>x+y,0)/n;const sd=Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/n);return sd>0?mean/sd*Math.sqrt(252):0;}
function std(a){const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length);}
function mb(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function passage(dayDollar,trailDD,dailyLoss,target,paths,seed){const rnd=mb(seed),n=dayDollar.length,days=[];let ruin=0;for(let p=0;p<paths;p++){let eq=0,peak=0,out=null,d=0;for(d=1;d<=1500;d++){const pnl=dayDollar[(rnd()*n)|0];if(pnl<=-dailyLoss){out='r';break;}eq+=pnl;if(eq>peak)peak=eq;if((peak-eq)>=trailDD){out='r';break;}if(eq>=target){out='p';break;}}if(out==='p')days.push(d);else if(out==='r')ruin++;else days.push(d);}days.sort((a,b)=>a-b);const pc=q=>days.length?days[Math.min(days.length-1,Math.floor(q*days.length))]:NaN;return{pass:Math.round(1000*days.length/paths)/10,ruin:Math.round(1000*ruin/paths)/10,med:pc(.5)};}
const cal=td=>isNaN(td)?'-':Math.round(td*7/5);
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET_vol.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);const {cvd}=deltaCVD(b,sess);
  const p5=streamByDay(runP5(b,atr,sess,cvd,false),sess.order);
  const p5cvd=streamByDay(runP5(b,atr,sess,cvd,true),sess.order);
  const rev=streamByDay(runRev(b,atr,ma,sess,2,0.5,15),sess.order);
  const blendBase=p5.map((v,i)=>v+0.5*rev[i]);
  const blendCVD=p5cvd.map((v,i)=>v+0.5*rev[i]);
  console.log('=== Daily ann Sharpe ===');
  console.log('P5            '+annSharpe(p5).toFixed(2)+'   P5+CVD '+annSharpe(p5cvd).toFixed(2));
  console.log('Blend(base)   '+annSharpe(blendBase).toFixed(2)+'   Blend(CVD) '+annSharpe(blendCVD).toFixed(2));
  console.log('\n=== Funded first-passage (50k: $3000 target, $2500 trailDD, $1100 daily) ===');
  // risk-matched to equal daily-$ vol at the P5@$50/R reference (std*50)
  const refVol=std(p5)*50;
  console.log('Risk-matched to '+refVol.toFixed(0)+'$/day vol (= P5 @ $50/R). pass% / ruin% / median time-to-pass:');
  for(const [nm,st] of [['P5        ',p5],['P5+CVD    ',p5cvd],['Blend base',blendBase],['Blend CVD ',blendCVD]]){
    const mult=refVol/std(st); const dd=st.map(v=>v*mult);
    const r=passage(dd,2500,1100,3000,30000,7);
    console.log('  '+nm+'  mult $'+mult.toFixed(0)+'/R   pass '+r.pass+'%  ruin '+r.ruin+'%  median '+r.med+'td (~'+cal(r.med)+'cd)');
  }
  console.log('\nHigher Sharpe should pass faster at equal risk even with fewer trades — if median TD drops, CVD wins.');
}
main();
