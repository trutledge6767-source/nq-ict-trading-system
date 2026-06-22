#!/usr/bin/env node
/* lastweek_pnl.js — what the SURVIVAL-config model (P5 1.0xATR stop + limit-reversion 0.5xATR)
 * would have made over a date window, sized at 1 MNQ ($2/pt). Per-trade $ = R * stopPts * $2.
 * Usage: node lastweek_pnl.js [from=YYYY-M-D] [to=YYYY-M-D]   (dates are ET, no zero-pad) */
'use strict';
const fs=require('fs');
const PV=2;            // MNQ $/pt
const SLIP=1.0;       // round-trip slippage assumption (matches project engines)
const P5_STOP=1.0;    // survival/funded stop (was 0.75 eval)
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0]),risk:sd};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*P5_STOP*a2,dayEnd);if(t){t.strat='p5';tr.push(t);}break;}}return tr;}
function runRevLimit(b,atr,ma,sess,k,se,maxBars,off,fillWin){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,L=dir<0?b[i][4]+off*a:b[i][4]-off*a;let ent=-1;for(let f=qi+1;f<rth.length&&f<=qi+fillWin;f++){const fi=rth[f];if(dir<0?b[fi][2]>=L:b[fi][3]<=L){ent=fi;break;}}if(ent<0){qi++;continue;}const a2=atr[ent],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=L-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=0.5;for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=0.5;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-L):(L-exPx))-eslip;tr.push({r:gross/sd,day:key,risk:sd,strat:'rev'});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}

const j=JSON.parse(fs.readFileSync('04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
const all=[...runP5(b,atr,sess),...runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3)];
const from=process.argv[2]||'2026-6-15', to=process.argv[3]||'2026-6-19';
const toNum=s=>{const[y,m,d]=s.split('-').map(Number);return y*10000+m*100+d;};
const lo=toNum(from),hi=toNum(to);
const wk=all.filter(t=>{const n=toNum(t.day);return n>=lo&&n<=hi;}).sort((a,b)=>toNum(a.day)-toNum(b.day));
console.log(`=== SURVIVAL-config model, ${from} -> ${to}, sized 1 MNQ ($2/pt) ===\n`);
const byDay={};
for(const t of wk){const usd=t.r*t.risk*PV;(byDay[t.day]=byDay[t.day]||[]).push({...t,usd});}
let totUsd=0,totR=0,n=0;
for(const day of Object.keys(byDay)){
  let d$=0,dR=0;const rows=byDay[day];
  for(const t of rows){d$+=t.usd;dR+=t.r;totUsd+=t.usd;totR+=t.r;n++;}
  const p5=rows.filter(x=>x.strat==='p5').length,rev=rows.filter(x=>x.strat==='rev').length;
  console.log(`${day}:  ${rows.length} trades (p5 ${p5}, rev ${rev})   R ${dR>=0?'+':''}${dR.toFixed(2)}   $ ${d$>=0?'+':''}${d$.toFixed(0)}`);
}
console.log(`\nWEEK TOTAL:  ${n} trades   R ${totR>=0?'+':''}${totR.toFixed(2)}   $ ${totUsd>=0?'+':''}${totUsd.toFixed(0)}  (1 MNQ)`);
console.log(`Note: P5 ${P5_STOP}xATR stop, reversion 0.5xATR, ${SLIP}pt slip. Idealized fills (esp. reversion limits).`);
const lastDay=ymd(b[b.length-1][0]);
console.log(`Data ends ${lastDay} — any week days after that are NOT included.`);
