#!/usr/bin/env node
/* trend_filter_test.js — does a TREND-DAY filter improve the reversion sleeve?
 * Reversion dies on trend days (fade runs into a runner). Add a Kaufman Efficiency Ratio
 * filter: ER = |close-close[n]| / sum|close diffs| over n bars (high=trending, low=choppy).
 * Only fade when ER <= erMax (choppy enough). Applied to the LIMIT-entry sleeve (the viable one).
 * Compares expR / Sharpe / maxDD / trades / per-year vs unfiltered. Usage: node trend_filter_test.js <data_et.json> */
'use strict';
const fs=require('fs');
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function effRatio(b,n){const out=new Array(b.length).fill(null);for(let i=n;i<b.length;i++){const num=Math.abs(b[i][4]-b[i-n][4]);let den=0;for(let k=i-n+1;k<=i;k++)den+=Math.abs(b[k][4]-b[k-1][4]);out[i]=den>0?num/den:0;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);return {days,order:ord};}
// limit-entry reversion with optional ER trend filter (erMax=null => no filter)
function runRevLimit(b,atr,ma,er,sess,k,se,maxBars,off,fillWindow,exitSlip,erMax){const {days,order}=sess,tr=[];let sig=0,fil=0;
  for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;
    while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}
      const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}
      if(erMax!=null && (er[i]==null || er[i]>erMax)){qi++;continue;}     // TREND filter: skip if trending
      sig++; const dir=under?1:-1; const L=dir<0?b[i][4]+off*a:b[i][4]-off*a;
      let ent=-1;for(let f=qi+1;f<rth.length&&f<=qi+fillWindow;f++){const fi=rth[f];if(dir<0?b[fi][2]>=L:b[fi][3]<=L){ent=fi;break;}}
      if(ent<0){qi++;continue;} fil++; const a2=atr[ent],sd=se*a2;if(sd<=0){qi++;continue;}
      const stopPx=L-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=exitSlip;
      for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];
        if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=exitSlip;break;}
        if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;} exIdx=kk;exPx=b[kk][4];}
      const gross=(dir>0?(exPx-L):(L-exPx))-eslip;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}
  return {tr,fillRate:Math.round(1000*fil/sig)/10};
}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);let cum=0,peak=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return{trades:N,win:Math.round(1000*w.length/N)/10,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,netR:Math.round(cum),maxDD:Math.round(dd),posYears:ys.filter(y=>m[y]>0).length+'/'+ys.length};}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),er=effRatio(b,10),sess=sessions(b);
  console.log('=== Trend-day filter (Kaufman ER over 10 bars) on limit-entry reversion (off0.25) ===\n');
  const base=runRevLimit(b,atr,ma,er,sess,2,0.5,15,0.25,3,0.5,null);
  console.log('no filter        :', JSON.stringify(stats(base.tr)));
  for(const erMax of [0.7,0.6,0.5,0.4,0.3]){
    const r=runRevLimit(b,atr,ma,er,sess,2,0.5,15,0.25,3,0.5,erMax);
    console.log('ER<='+erMax+' (fill '+r.fillRate+'%):', JSON.stringify(stats(r.tr)));
  }
  console.log('\nGoal: higher expR/Sharpe or lower maxDD without gutting trade count = trend filter helps.');
}
main();
