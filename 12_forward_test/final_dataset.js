#!/usr/bin/env node
/* final_dataset.js — consolidated dataset for the OPTIMIZED model (risk-parity blend:
 * P5 0.75/am + 0.7x limit-reversion). Per account size (50k/100k/150k, Apex rules):
 *   PHASE 1 EVAL  (aggressive: size up for fast pass)  -> pass% / fail% / median months
 *   PHASE 2 FUNDED (safe: size down for longevity)     -> survive% / gross $/yr
 * Usage: node final_dataset.js [data_et.json] */
'use strict';
const fs=require('fs'), path=require('path');
const DATA=process.argv[2]||path.join(__dirname,'..','04_backtests','data','NQ_5m_7y_ET.json');
const SLIP=1.0, REVW=0.7; // risk-parity reversion weight
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
function evalSim(dayR,rk,target,trail,paths,seed){const rnd=mb(seed),n=dayR.length;let pass=0,fail=0;const days=[];for(let p=0;p<paths;p++){let eq=0,peak=0,out=0;for(let d=1;d<=2000;d++){const pnl=dayR[(rnd()*n)|0]*rk;eq+=pnl;if(eq>peak)peak=eq;if((peak-eq)>=trail){out=-1;break;}if(eq>=target){out=1;days.push(d);break;}}if(out===1)pass++;else fail++;}return {pass:Math.round(1000*pass/paths)/10,fail:Math.round(1000*fail/paths)/10,medMo:days.length?+(pc(days,.5)/21).toFixed(1):NaN};}
function fundedSim(dayR,rk,trail,paths,seed){const lockAt=trail+100,floor=100,wbuf=Math.round(1500*trail/2500);const rnd=mb(seed),n=dayR.length;let breach=0;const real=[];for(let p=0;p<paths;p++){let eq=0,peak=0,locked=false,thr=-trail,bank=0,died=false;for(let d=1;d<=252;d++){const pnl=dayR[(rnd()*n)|0]*rk;eq+=pnl;if(!locked){if(eq>peak)peak=eq;if(peak>=lockAt){locked=true;thr=floor;}else thr=peak-trail;}if(eq<=thr){breach++;died=true;real.push(bank);break;}if(d%21===0&&locked){const w=Math.max(0,eq-(floor+wbuf));bank+=w;eq-=w;}}if(!died)real.push(bank+Math.max(0,eq-floor));}return {survive:Math.round(1000*(paths-breach)/paths)/10,realMean:Math.round(mean(real)),realMed:Math.round(pc(real,.5))};}
function main(){
  const j=JSON.parse(fs.readFileSync(DATA,'utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRevLimit(b,atr,ma,sess,2,0.5,15,0.25,3),sess.order);
  const blend=p5.map((v,i)=>v+REVW*rev[i]);
  const accts=[{n:'50k ',T:3000,DD:2500},{n:'100k',T:6000,DD:3000},{n:'150k',T:9000,DD:5000}];
  console.log('############ OPTIMIZED MODEL DATASET — risk-parity blend (P5 + 0.7x limit-reversion) ############');
  console.log('NQ '+sess.order.length+' trading days (2019-2026). Eval=AGGRESSIVE (size up). Funded=SAFE (size down). MNQ.\n');
  for(const a of accts){
    const k=a.DD/2500;
    console.log('==================== '+a.n.trim()+' ACCOUNT  (target $'+a.T+', trailing DD $'+a.DD+') ====================');
    console.log('  PHASE 1 — EVAL (AGGRESSIVE, size up for speed)');
    console.log('    $risk/R   pass%   fail%   median pass   ~MNQ');
    for(const base of [75,100,130]){const rk=Math.round(base*k);const e=evalSim(blend,rk,a.T,a.DD,30000,7);console.log('     $'+String(rk).padStart(3)+'      '+String(e.pass).padStart(5)+'%  '+String(e.fail).padStart(5)+'%   '+String(e.medMo).padStart(4)+'mo        ~'+Math.max(1,Math.round(rk/40)));}
    console.log('  PHASE 2 — FUNDED (SAFE, size down for account longevity)');
    console.log('    $risk/R   survive 12mo   breach%   gross $/yr (mean / median)');
    for(const base of [25,35,50]){const rk=Math.round(base*k);const f=fundedSim(blend,rk,a.DD,30000,7);console.log('     $'+String(rk).padStart(3)+'      '+String(f.survive).padStart(5)+'%        '+String(Math.round(1000*(100-f.survive))/1000).toString().padStart(4)+'%   $'+String(f.realMean).padStart(6)+' / $'+f.realMed);}
    console.log('');
  }
  console.log('Notes: GROSS per account (pre-fees). Eval ruin only costs an eval fee+reset -> size up freely; spread across');
  console.log('2-3 accounts so fast-pass fail% does not sting. Funded: size DOWN for longevity. Forward-test before real capital.');
}
main();
