#!/usr/bin/env node
/* p5_timetopass.js — how long (trading days / calendar) to reach the $3000
 * funded target for the safe P5 configs, via day-level first-passage bootstrap.
 * Reports the time distribution for paths that PASS before trailing-DD ruin. */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}for(const k of order){const s=days[k];if(s.rth.length){let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}}return {days,order:order.filter(k=>days[k].rth.length>=6)};}
function holdToClose(b,atr,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess,stopMult,window){const {days,order}=sess,tr=[],cutoff=window==='am'?12*60:RTH_CLOSE;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,atr,dir,ent,b[ent][1]-dir*stopMult*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function dailyR(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]=(m[t.day]||0)+t.r;return order.map(k=>m[k]);}
function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function firstPassage(dayR,riskPerR,trailingDD,target,paths,seed){
  const rnd=mb(seed||7),n=dayR.length,days=[];let ruin=0;
  for(let p=0;p<paths;p++){let eq=0,peak=0,d=0,done=false;
    for(d=1;d<=2000;d++){const pnl=dayR[(rnd()*n)|0]*riskPerR;eq+=pnl;if(eq>peak)peak=eq;
      if((peak-eq)>=trailingDD){ruin++;done=true;break;}
      if(eq>=target){days.push(d);done=true;break;}}
    if(!done)days.push(d);
  }
  days.sort((a,b)=>a-b);const pc=q=>days.length?days[Math.min(days.length-1,Math.floor(q*days.length))]:NaN;
  const mean=days.reduce((a,b)=>a+b,0)/(days.length||1);
  return {passPct:Math.round(1000*days.length/paths)/10, ruinPct:Math.round(1000*ruin/paths)/10,
    td:{p25:pc(.25),median:pc(.5),mean:Math.round(mean),p75:pc(.75),p90:pc(.9)}};
}
const cal=td=>Math.round(td*7/5); // trading days -> calendar days (~5 td/week)
const mo=td=>(td*7/5/30.44).toFixed(1);

function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),sess=sessions(b);
  const dr=dailyR(runP5(b,atr,sess,0.75,'am'),sess.order);
  const drB=dailyR(runP5(b,atr,sess,1.0,'rth'),sess.order);
  console.log('TIME-TO-PASS to $3000 (50k: trailing DD $2500). Trading days (td) -> calendar.\n');
  console.log('config              $risk/R  pass%  ruin%   median       mean        p75        p90');
  for(const [name,d] of [['P5 0.75/am (SAFE)',dr],['P5 1.0/rth',drB]]){
    for(const rk of [50,75,100]){
      const r=firstPassage(d,rk,2500,3000,30000,7);const t=r.td;
      const fmt=v=>v+'td/'+cal(v)+'cd';
      console.log('  '+name.padEnd(18),String(rk).padStart(5),String(r.passPct).padStart(6),String(r.ruinPct).padStart(6),
        ('  '+fmt(t.median)+' ('+mo(t.median)+'mo)').padEnd(22),fmt(t.mean).padStart(11),fmt(t.p75).padStart(11),fmt(t.p90).padStart(11));
    }
  }
  console.log('\ntd=trading days, cd=calendar days. Pass = reach $3000 before $2500 trailing-DD breach (no time limit).');
}
main();
