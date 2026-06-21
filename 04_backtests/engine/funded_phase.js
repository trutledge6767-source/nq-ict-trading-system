#!/usr/bin/env node
/* funded_phase.js — life AFTER passing: model 12 months of funded trading with an
 * Apex-style LOCKING trailing drawdown (trail $2500, locks to a static +$100 floor once
 * +$2600 cushion is built) and monthly withdrawals (bank profit, keep a $1500 working
 * buffer). Answers: do these strategies lose the account? what's realized profitability?
 * Streams: P5 (0.75/am) and blend P5+0.5*Reversion. Usage: node funded_phase.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,k,stopExtra,maxBars){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=stopExtra*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgtPx=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>m[k]);}
function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// Apex-style funded phase: trail $2500, lock to +$100 floor once +$2600 peak reached.
// Monthly (21 td): bank profit above ($floor+$1500 buffer) once locked. 12 months.
function fundedPhase(dayR,riskPerR,paths,seed){
  const TRAIL=2500, LOCK_AT=2600, FLOOR=100, BUFFER=1500, MONTH=21, MONTHS=12;
  const rnd=mb(seed||7),n=dayR.length;
  let breach=0; const banked=[],loseMo=[],lifeTd=[];
  for(let p=0;p<paths;p++){
    let eq=0,peak=0,locked=false,thr=-TRAIL,bank=0,monthPL=0,lose=0,alive=MONTHS*MONTH,died=false;
    for(let d=1;d<=MONTHS*MONTH;d++){
      const pnl=dayR[(rnd()*n)|0]*riskPerR; eq+=pnl; monthPL+=pnl;
      if(!locked){ if(eq>peak)peak=eq; if(peak>=LOCK_AT){locked=true;thr=FLOOR;} else thr=peak-TRAIL; }
      if(eq<=thr){ breach++; died=true; alive=d; break; }
      if(d%MONTH===0){ if(monthPL<0)lose++; if(locked){const w=Math.max(0,eq-(FLOOR+BUFFER)); bank+=w; eq-=w;} monthPL=0; }
    }
    // realized = withdrawn + (if survived) remaining withdrawable equity
    const realized = bank + (died?0:Math.max(0,eq-FLOOR));
    banked.push(realized); loseMo.push(lose); lifeTd.push(alive);
  }
  banked.sort((a,b)=>a-b); lifeTd.sort((a,b)=>a-b);
  const pc=(arr,q)=>arr[Math.min(arr.length-1,Math.floor(q*arr.length))];
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  return {breachPct:Math.round(1000*breach/paths)/10, realMean:Math.round(mean(banked)), realMed:Math.round(pc(banked,.5)),
    realP10:Math.round(pc(banked,.1)), realP90:Math.round(pc(banked,.9)),
    loseMoPct:Math.round(100*mean(loseMo)/MONTHS), medLifeMo:+(pc(lifeTd,.5)/MONTH).toFixed(1)};
}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRev(b,atr,ma,sess,2.0,0.5,15),sess.order);
  const blend=p5.map((v,i)=>v+0.5*rev[i]);
  console.log('=== FUNDED PHASE (12 months, Apex-style locking trailing DD $2500, withdraw monthly) ===');
  console.log('Realized $ = withdrawn profit kept even if account later breaches.\n');
  console.log('strategy   $risk/R  breach%  medLife  loseMo%   realized$ (mean / median / p10..p90)');
  for(const [nm,st] of [['P5     ',p5],['Blend  ',blend]]){
    for(const rk of [50,75,100]){
      const r=fundedPhase(st,rk,30000,7);
      console.log('  '+nm+'   '+String(rk).padStart(4)+'    '+String(r.breachPct).padStart(5)+'%   '+
        (r.medLifeMo>=12?'12mo+':r.medLifeMo+'mo').padStart(6)+'   '+String(r.loseMoPct).padStart(4)+'%    $'+
        String(r.realMean).padStart(5)+' / $'+String(r.realMed).padStart(5)+'  ($'+r.realP10+'..$'+r.realP90+')');
    }
  }
  console.log('\nNote: breach%=account lost within 12mo. medLife=median months until breach. loseMo%=share of negative months.');
  console.log('realized$ over 12 months at 1x size (scale ~linearly with contracts; e.g. 3 MNQ ~3x).');
}
main();
