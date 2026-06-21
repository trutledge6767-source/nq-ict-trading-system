#!/usr/bin/env node
/* final_prelive.js — last pre-live optimizations + reality checks:
 *  (A) NEWS blackout: skip entries near 10:00 ET data + 14:00 ET FOMC; effect on P5 vs reversion.
 *  (B) INTRADAY trailing-DD (Apex-accurate): threshold ratchets off the intraday equity PEAK incl.
 *      unrealized P&L (captured via per-trade MFE). Re-runs funded survival vs the optimistic EOD model.
 * Strategy = risk-parity blend (P5 0.75/am + 0.7x limit-reversion). Usage: node final_prelive.js [data_et.json] */
'use strict';
const fs=require('fs'), path=require('path');
const DATA=process.argv[2]||path.join(__dirname,'..','04_backtests','data','NQ_5m_7y_ET.json');
const SLIP=1.0, REVW=0.7;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
const inNews=t=>{const m=minOfDay(t);return (m>=600&&m<=605)||(m>=840&&m<=870);}; // 10:00-10:05 ET data, 14:00-14:30 ET FOMC
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
// P5 with MFE (peakR) capture + optional news skip
function runP5(b,atr,sess,news){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;if(news&&inNews(b[i][0])){break;}const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4],peak=0;for(let kk=ent+1;kk<=dayEnd;kk++){const fav=dir>0?(b[kk][2]-ep):(ep-b[kk][3]);if(fav>peak)peak=fav;if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,peakR:peak/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,news){const k=2,se=0.5,maxBars=15,off=0.25,fillWin=3;const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}if(news&&inNews(b[i][0])){qi++;continue;}const dir=under?1:-1,L=dir<0?b[i][4]+off*a:b[i][4]-off*a;let ent=-1;for(let f=qi+1;f<rth.length&&f<=qi+fillWin;f++){const fi=rth[f];if(dir<0?b[fi][2]>=L:b[fi][3]<=L){ent=fi;break;}}if(ent<0){qi++;continue;}const a2=atr[ent],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=L-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=0.5,peak=0;for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];const fav=dir>0?(hi-L):(L-lo);if(fav>peak)peak=fav;if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=0.5;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-L):(L-exPx))-eslip;tr.push({r:gross/sd,peakR:peak/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function dayAgg(p5,rev,order){const cR={},cP={},rR={};for(const k of order){cR[k]=0;cP[k]=0;rR[k]=0;}
  for(const t of p5){cR[t.day]+=t.r;cP[t.day]=Math.max(cP[t.day],t.peakR);}
  for(const t of rev){cR[t.day]+=REVW*t.r;rR[t.day]+=REVW*t.r;}
  // dayCloseR, dayPeakR (intraday high contribution): P5 MFE + reversion realized-if-positive
  return order.map(k=>({close:cR[k], peak:Math.max(cR[k], cP[k]+Math.max(0,rR[k]))}));
}
function metrics(arr){const n=arr.length,mean=arr.reduce((a,b)=>a+b.close,0)/n;const xs=arr.map(a=>a.close);const sd=Math.sqrt(xs.reduce((a,b)=>a+(b-mean)**2,0)/n);let peak=0,cum=0,dd=0;for(const v of xs){cum+=v;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}return{ann:+(sd>0?mean/sd*Math.sqrt(252):0).toFixed(3),net:Math.round(cum),maxDD:Math.round(dd)};}
function mb(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const meanA=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
// funded sim: mode 'eod' (peak from post-day equity) vs 'intraday' (peak from intraday high incl unrealized)
function fundedSim(days,rk,trail,mode,paths,seed){const lockAt=trail+100,floor=100,wbuf=Math.round(1500*trail/2500);const rnd=mb(seed),n=days.length;let breach=0;const real=[];for(let p=0;p<paths;p++){let eq=0,peak=0,locked=false,thr=-trail,bank=0,died=false;for(let d=1;d<=252;d++){const day=days[(rnd()*n)|0];
  if(mode==='intraday'){const hi=eq+day.peak*rk;if(!locked){if(hi>peak)peak=hi;if(peak>=lockAt){locked=true;thr=floor;}else thr=peak-trail;}}
  eq+=day.close*rk;
  if(mode==='eod'){if(!locked){if(eq>peak)peak=eq;if(peak>=lockAt){locked=true;thr=floor;}else thr=peak-trail;}}
  if(eq<=thr){breach++;died=true;real.push(bank);break;}
  if(d%21===0&&locked){const w=Math.max(0,eq-(floor+wbuf));bank+=w;eq-=w;}}
  if(!died)real.push(bank+Math.max(0,eq-floor));}
  return {survive:Math.round(1000*(paths-breach)/paths)/10,realMean:Math.round(meanA(real))};}
function main(){
  const j=JSON.parse(fs.readFileSync(DATA,'utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  // (A) NEWS
  const p5=runP5(b,atr,sess,false), p5n=runP5(b,atr,sess,true);
  const rev=runRev(b,atr,ma,sess,false), revn=runRev(b,atr,ma,sess,true);
  console.log('=== (A) NEWS BLACKOUT (skip entries 10:00-10:05 + 14:00-14:30 ET) ===');
  const sum=tr=>{let c=0;for(const t of tr)c+=t.r;return {n:tr.length,net:Math.round(c),expR:+(c/tr.length).toFixed(3)};};
  console.log('  P5        no-news '+JSON.stringify(sum(p5))+'   news-blackout '+JSON.stringify(sum(p5n)));
  console.log('  Reversion no-news '+JSON.stringify(sum(rev))+'   news-blackout '+JSON.stringify(sum(revn)));
  const blendOff=metrics(dayAgg(p5,rev,sess.order)), blendOn=metrics(dayAgg(p5n,revn,sess.order));
  console.log('  BLEND Sharpe/netR/maxDD  no-news '+JSON.stringify(blendOff)+'   news-blackout '+JSON.stringify(blendOn));
  // (B) INTRADAY trailing DD vs EOD
  console.log('\n=== (B) INTRADAY trailing DD (Apex-accurate) vs EOD model — 50k, blend, 12mo ===');
  const days=dayAgg(p5,rev,sess.order);
  console.log('  $risk/R    EOD survive% / $yr      INTRADAY survive% / $yr');
  for(const rk of [25,35,50]){const e=fundedSim(days,rk,2500,'eod',30000,7);const i2=fundedSim(days,rk,2500,'intraday',30000,7);
    console.log('   $'+String(rk).padStart(2)+'        '+String(e.survive).padStart(5)+'% / $'+String(e.realMean).padStart(5)+'        '+String(i2.survive).padStart(5)+'% / $'+i2.realMean);}
  console.log('\nIntraday trailing is STRICTER (ratchets off unrealized peak). Use the INTRADAY column for live Apex sizing.');
}
main();
