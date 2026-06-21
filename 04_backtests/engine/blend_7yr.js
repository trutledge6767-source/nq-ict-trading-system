#!/usr/bin/env node
/* blend_7yr.js — 7-year gross performance of the deployable blend (P5 0.75/am + 0.5x limit-reversion)
 * at several $-risk-per-R sizings, with per-year $ and max drawdown. Shows what the $75/R ("~2.3mo
 * median pass") sizing would have produced over 2019-2026. Usage: node blend_7yr.js <data_et.json> */
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
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>({day:k,r:m[k]}));}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3),sess.order);
  const blend=p5.map((d,i)=>({day:d.day,r:d.r+0.5*rev[i].r}));
  const totR=blend.reduce((s,d)=>s+d.r,0);
  // max drawdown in R
  let peak=0,cum=0,ddR=0;for(const d of blend){cum+=d.r;peak=Math.max(peak,cum);ddR=Math.min(ddR,cum-peak);}
  // per-year R
  const yr={};for(const d of blend){const y=d.day.split('-')[0];yr[y]=(yr[y]||0)+d.r;}
  console.log('=== Deployable blend (P5 0.75/am + 0.5x LIMIT-reversion) — 7yr gross, '+blend.length+' trading days ===');
  console.log('Total net R over 7yr: '+totR.toFixed(0)+'R   maxDD: '+ddR.toFixed(0)+'R   (~'+(totR/7).toFixed(0)+'R/yr)\n');
  console.log('Per-year net R:');
  for(const y of Object.keys(yr).sort()) console.log('  '+y+': '+yr[y].toFixed(0)+'R');
  console.log('\n7-year GROSS $ by sizing (= netR x $/R; reversion sized at 0.5x):');
  console.log('  $risk/R   total $ (7yr)   ~$/yr      maxDD $    note');
  for(const rk of [50,75,100]){
    console.log('  $'+String(rk).padStart(3)+'      $'+String(Math.round(totR*rk)).padStart(8)+'   $'+String(Math.round(totR*rk/7)).padStart(6)+'   $'+String(Math.round(ddR*rk)).padStart(7)+'    '+(rk===75?'<- ~2.3mo-median eval sizing':rk===50?'safe / ~4mo median':'fast / higher ruin'));
  }
  console.log('\nGROSS = raw strategy P&L (one continuous account, NO trailing-DD reset). On a real 50k funded acct the');
  console.log('$2500 trailing DD would breach during the worst drawdown at $75-100/R — so this is strategy gross, not');
  console.log('one-account funded reality. Funded income is per the multi-account model (~$5-7k/acct/yr at survivable size).');
}
main();
