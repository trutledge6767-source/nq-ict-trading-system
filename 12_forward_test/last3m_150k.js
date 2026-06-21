#!/usr/bin/env node
/* last3m_150k.js — ACTUAL last ~3 months (real chronological sequence, not bootstrap) of the
 * deployable risk-parity blend (P5 0.75/am + 0.7x limit-reversion), for 3x Apex 150k accounts
 * under the two-step plan: PHASE 1 eval (aggressive $200/R) then PHASE 2 funded (safe $50-70/R).
 * Usage: node last3m_150k.js [data_et.json] [ndays] */
'use strict';
const fs=require('fs'), path=require('path');
const DATA=process.argv[2]||path.join(__dirname,'..','04_backtests','data','NQ_5m_7y_ET.json');
const NDAYS=+(process.argv[3]||63);
const SLIP=1.0, REVW=0.7;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
function runRevLimit(b,atr,ma,sess,k,se,maxBars,off,fillWin){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,L=dir<0?b[i][4]+off*a:b[i][4]-off*a;let ent=-1;for(let f=qi+1;f<rth.length&&f<=qi+fillWin;f++){const fi=rth[f];if(dir<0?b[fi][2]>=L:b[fi][3]<=L){ent=fi;break;}}if(ent<0){qi++;continue;}const a2=atr[ent],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=L-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=0.5;for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=0.5;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-L):(L-exPx))-eslip;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function pathStats(dayR,rk,trail){ // real chronological path; returns net$, maxDD$, survived, winDays, best, worst
  let eq=0,peak=0,maxDD=0,thr=-trail,locked=false,lockAt=trail+100,win=0,best=-1e9,worst=1e9,breachDay=0;
  for(let d=0;d<dayR.length;d++){const pnl=dayR[d]*rk;
    if(!locked){if(eq>peak)peak=eq;if(peak>=lockAt){locked=true;thr=100;}else thr=peak-trail;}
    eq+=pnl; if(eq-peak<maxDD)maxDD=eq-peak; if(pnl>0)win++; best=Math.max(best,pnl);worst=Math.min(worst,pnl);
    if(eq<=thr && !breachDay)breachDay=d+1;}
  return {net:Math.round(eq),maxDD:Math.round(maxDD),win,n:dayR.length,best:Math.round(best),worst:Math.round(worst),breachDay};
}
function main(){
  const j=JSON.parse(fs.readFileSync(DATA,'utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3),sess.order);
  const blendAll=p5.map((v,i)=>v+REVW*rev[i]);
  const idx0=sess.order.length-NDAYS;
  const days=blendAll.slice(idx0); const dates=sess.order.slice(idx0);
  const TRAIL=5000;
  console.log('=== ACTUAL last '+NDAYS+' trading days  '+dates[0]+' -> '+dates[dates.length-1]+'  (real sequence) ===');
  console.log('Risk-parity blend (P5 + 0.7x limit-reversion). Apex 150k: $5000 trailing DD, $9000 eval target.\n');
  console.log('--- PHASE 1: EVAL (aggressive $200/R) — would a fresh 150k eval have passed in this window? ---');
  const ev=pathStats(days,200,TRAIL); let cum=0,passDay=0; for(let d=0;d<days.length;d++){cum+=days[d]*200; if(cum>=9000&&!passDay){passDay=d+1;break;}}
  console.log('  net at $200/R over window: $'+Math.round(days.reduce((a,c)=>a+c,0)*200)+(passDay?('   PASSED on trading day '+passDay+' (~'+(passDay/21).toFixed(1)+'mo)'):'   did NOT hit $9000 target in window')+(ev.breachDay?'  [breached DD day '+ev.breachDay+']':''));
  console.log('\n--- PHASE 2: FUNDED — if 3x 150k were DEPLOYED for the full window (copy-traded) ---');
  for(const [lbl,rk] of [['safe   $50/R',50],['balanced $70/R',70]]){
    const s=pathStats(days,rk,TRAIL);
    const surv=s.breachDay?('BREACHED day '+s.breachDay):'survived';
    console.log('  '+lbl+':  per-acct net $'+s.net+'   maxDD $'+s.maxDD+'   winDays '+s.win+'/'+s.n+'   best +$'+s.best+'/worst $'+s.worst+'   ['+surv+']');
    console.log('               x3 ACCOUNTS total: $'+(s.net*3)+'   (3-month gross; annualized ~$'+Math.round(s.net*3*252/NDAYS)+')');
  }
  console.log('\nNOTE: this is ONE real recent window (Mar-Jun 2026) which was an unusually breakout-FAVORABLE regime');
  console.log('(P5 ran well above its 7yr avg). Treat as a best-case real sample, NOT expected forward performance.');
}
main();
