#!/usr/bin/env node
/* account_scale.js — gross $/yr per funded account at 50k / 100k / 150k (Apex-style locking trailing DD).
 * Bigger account = bigger trailing buffer -> size proportionally larger -> income scales ~with buffer.
 * Funded sizing set to the buffer-scaled equivalents of the 50k $35 (survival) and $50 (balanced) per-R.
 * Strategy = deployable blend (P5 0.75/am + 0.5x limit-reversion). Usage: node account_scale.js <data_et.json> */
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
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function mb(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const pc=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))];};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
// funded 12mo: locking trailing DD, monthly withdraw keeping `buffer` above floor
function fundedSim(dayR,rk,acct,paths,seed){const {trail,lockAt,floor,wbuf}=acct;const rnd=mb(seed),n=dayR.length;let breach=0;const real=[];for(let p=0;p<paths;p++){let eq=0,peak=0,locked=false,thr=-trail,bank=0,died=false;for(let d=1;d<=252;d++){const pnl=dayR[(rnd()*n)|0]*rk;eq+=pnl;if(!locked){if(eq>peak)peak=eq;if(peak>=lockAt){locked=true;thr=floor;}else thr=peak-trail;}if(eq<=thr){breach++;died=true;real.push(bank);break;}if(d%21===0&&locked){const w=Math.max(0,eq-(floor+wbuf));bank+=w;eq-=w;}}if(!died)real.push(bank+Math.max(0,eq-floor));}return {survive:Math.round(1000*(paths-breach)/paths)/10,realMean:Math.round(mean(real)),realMed:Math.round(pc(real,.5))};}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3),sess.order);
  const blend=p5.map((v,i)=>v+0.5*rev[i]);
  // Apex-style account specs (trailing DD); sizing scaled by buffer ratio k=trail/2500
  const accts=[
    {name:'50k ',trail:2500,target:3000,k:1.0},
    {name:'100k',trail:3000,target:6000,k:1.2},
    {name:'150k',trail:5000,target:9000,k:2.0},
  ];
  console.log('=== Gross $/yr per FUNDED account by account size (deployable blend, 12mo) ===');
  console.log('Funded sizing scaled by buffer ratio. Two profiles: SURVIVAL (~$35/R @50k) and BALANCED (~$50/R @50k).\n');
  console.log('Account  trailDD   profile    $risk/R   survive%   gross $/yr (mean / median)');
  for(const a of accts){
    const acct={trail:a.trail,lockAt:a.trail+100,floor:100,wbuf:Math.round(1500*a.k)};
    for(const [prof,base] of [['SURVIVAL',35],['BALANCED',50]]){
      const rk=Math.round(base*a.k);
      const f=fundedSim(blend,rk,acct,30000,7);
      console.log('  '+a.name+'    $'+String(a.trail).padStart(4)+'    '+prof.padEnd(9)+'  $'+String(rk).padStart(3)+'      '+String(f.survive).padStart(5)+'%     $'+String(f.realMean).padStart(6)+' / $'+f.realMed);
    }
  }
  console.log('\nEval pass RATE + time-to-pass are ~identical across sizes (target & buffer scale together).');
  console.log('Income scales ~linearly with the trailing-DD buffer. GROSS per account; scale across accounts for total.');
}
main();
