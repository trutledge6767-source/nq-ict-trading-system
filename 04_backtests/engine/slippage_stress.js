#!/usr/bin/env node
/* slippage_stress.js — does the blend survive realistic fills? Sweep round-trip slippage
 * (points) and recompute P5, reversion, and blend. P5 has a wide stop + fat tail (should be
 * robust); reversion is high-frequency on a thin edge + tight stop (should be fragile).
 * Finds the breakeven slippage for the reversion sleeve. NQ tick=0.25pt; liquid-hour market
 * fills ~0.25-0.5pt/side (0.5-1.0 RT); fast tape worse. Usage: node slippage_stress.js <data_et.json> */
'use strict';
const fs=require('fs');
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess,slip){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-slip)/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,k,stopExtra,maxBars,slip){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=stopExtra*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgtPx=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-slip;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function expR(tr){return tr.length?tr.reduce((s,t)=>s+t.r,0)/tr.length:0;}
function netR(tr){return tr.reduce((s,t)=>s+t.r,0);}
function dayStream(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function sharpe(arr){const n=arr.length,mean=arr.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(arr.reduce((a,b)=>a+(b-mean)**2,0)/n);return sd>0?mean/sd*Math.sqrt(252):0;}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  console.log('=== Slippage stress (round-trip points). NQ tick=0.25; realistic RT ~0.5-1.0pt ===\n');
  console.log('slipRT   P5 expR / netR     Rev expR / netR    Blend annSharpe   reversion alive?');
  for(const slip of [0.5,1.0,1.5,2.0,2.5,3.0]){
    const p5=runP5(b,atr,sess,slip), rev=runRev(b,atr,ma,sess,2.0,0.5,15,slip);
    const p5d=dayStream(p5,sess.order), revd=dayStream(rev,sess.order);
    const blend=p5d.map((v,i)=>v+0.5*revd[i]);
    const re=expR(rev);
    console.log('  '+slip.toFixed(1).padStart(4)+'   '+
      (expR(p5).toFixed(3)+' / '+Math.round(netR(p5))).padEnd(17)+'  '+
      (re.toFixed(3)+' / '+Math.round(netR(rev))).padEnd(18)+'  '+
      sharpe(blend).toFixed(2).padStart(6)+'         '+(re>0?'yes':'NO (dead)'));
  }
  console.log('\nP5 baseline annSharpe (slip 1.0):', sharpe(dayStream(runP5(b,atr,sess,1.0),sess.order)).toFixed(2));
  console.log('Note: reversion R-unit = 0.5*ATR (~8-12pt), so each +1pt slip ~ -0.1R/trade on a +0.056R edge => fragile.');
}
main();
