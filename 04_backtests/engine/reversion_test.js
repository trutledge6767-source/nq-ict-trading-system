#!/usr/bin/env node
/* reversion_test.js — intraday mean-reversion (ATR-band fade) on NQ, flat-by-close.
 * Standard recipe (DayTrading.com / practitioner + Bollinger-MR lit): fade price >k*ATR
 * from SMA(maLen); stop ~0.5*ATR beyond entry; target=mean; time-stop maxBars; flat at RTH close.
 * GOAL: a HIGH-WIN-RATE, smooth, P5-UNCORRELATED diversifier to fix funded consistency+speed.
 * R = outcome / stop-distance (true R). Reports edge, per-year, win%, Sharpe, P5 correlation.
 * Usage: node reversion_test.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);
const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}return {days,order:order.filter(k=>days[k].rth.length>=12)};}

// intraday band-fade; multiple trades/day; flat by RTH close
function runRev(b,atr,ma,sess,k,stopExtra,maxBars){
  const {days,order}=sess, tr=[];
  for(const key of order){const s=days[key]; const rth=s.rth, dayEnd=rth[rth.length-1]; let qi=0;
    while(qi<rth.length-1){
      const i=rth[qi], a=atr[i], m=ma[i];
      if(a==null||m==null||a<=0){qi++;continue;}
      const over = b[i][4] > m + k*a;     // overbought -> fade short
      const under= b[i][4] < m - k*a;     // oversold  -> fade long
      if(!over&&!under){qi++;continue;}
      const dir = under?1:-1, ent=rth[qi+1], a2=atr[ent]; if(a2==null){qi++;continue;}
      const ep=b[ent][1], sd=stopExtra*a2; if(sd<=0){qi++;continue;}
      const stopPx = ep - dir*sd, tgtPx = m;       // target = mean at signal
      let exIdx=dayEnd, exPx=b[dayEnd][4];
      for(let kk=ent+1; kk<=dayEnd && kk-ent<=maxBars; kk++){const hi=b[kk][2],lo=b[kk][3];
        if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}
        if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=kk;break;}
        exIdx=kk; exPx=b[kk][4]; }                 // time-stop / running exit
      const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;
      tr.push({r:gross/sd, day:key});
      let ni=rth.indexOf(exIdx); qi = ni<0?qi+1:ni+1;
    }
  }
  return tr;
}
function runP5(b,atr,sess){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}const tr=[],cutoff=12*60;for(let j=1;j<ord.length;j++){const p=days[ord[j-1]],s=days[ord[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:ord[j]});break;}}return tr;}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);const gW=w.reduce((s,t)=>s+t.r,0),gL=Math.abs(tr.filter(t=>t.r<=0).reduce((s,t)=>s+t.r,0));let peak=0,cum=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);return{trades:N,win:Math.round(1000*w.length/N)/10,PF:Math.round(1000*(gL>0?gW/gL:99))/1000,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,netR:Math.round(cum),maxDD:Math.round(dd)};}
function posYears(tr){const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return ys.filter(y=>m[y]>0).length+'/'+ys.length+'  ['+ys.map(y=>y.slice(2)+':'+m[y].toFixed(0)).join(' ')+']';}
function dayMap(tr){const m={};for(const t of tr)m[t.day]=(m[t.day]||0)+t.r;return m;}
function corr(a,b){const keys=Object.keys(a).filter(k=>k in b);if(keys.length<10)return NaN;const xs=keys.map(k=>a[k]),ys=keys.map(k=>b[k]);const mx=xs.reduce((s,v)=>s+v)/xs.length,my=ys.reduce((s,v)=>s+v)/ys.length;let c=0,vx=0,vy=0;for(let i=0;i<xs.length;i++){c+=(xs[i]-mx)*(ys[i]-my);vx+=(xs[i]-mx)**2;vy+=(ys[i]-my)**2;}return Math.round(1000*c/Math.sqrt(vx*vy))/1000;}

function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5map=dayMap(runP5(b,atr,sess));
  console.log('=== Intraday ATR-band mean reversion on NQ 2019-2026 (SMA20, flat-by-close) ===');
  for(const k of [1.5,2.0,2.5])
   for(const stopExtra of [0.5,1.0]){
     const tr=runRev(b,atr,ma,sess,k,stopExtra,15); const s=stats(tr);
     console.log('\nfade >'+k+'ATR, stop '+stopExtra+'ATR, maxBars15');
     console.log('  '+JSON.stringify(s));
     if(s.trades){console.log('  +yrs '+posYears(tr)); console.log('  corr vs P5: '+corr(dayMap(tr),p5map));}
   }
}
main();
