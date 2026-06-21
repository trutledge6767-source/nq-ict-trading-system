#!/usr/bin/env node
/* cvd_test.js — does ORDER FLOW (volume delta / CVD) improve P5 + reversion?
 * Pine v6 exposes real order flow via ta.requestVolumeDelta()/CVD. Here we backtest a PROXY from
 * OHLCV: bar delta = volume * CLV, CLV=((c-l)-(h-c))/(h-l) (close-location volume delta);
 * session CVD = cumsum within RTH. Tests order-flow CONFIRMATION filters:
 *   - P5 breakout: require breakout-bar delta confirms direction (real buying into the break).
 *   - P5: require session CVD aligned (net buying for longs).
 *   - Reversion: fade only on delta EXHAUSTION (delta opposes the extension at the extreme).
 * Reports expR/Sharpe/netR/maxDD/posYears vs baseline. Needs volume file. Usage: node cvd_test.js <data_et_vol.json> */
'use strict';
const fs=require('fs');
const SLIP=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
// delta proxy + session CVD
function deltaCVD(b,sess){const dl=new Array(b.length).fill(0),cvd=new Array(b.length).fill(null);
  for(let i=0;i<b.length;i++){const h=b[i][2],l=b[i][3],c=b[i][4],v=b[i].length>5?(+b[i][5]||0):0;dl[i]=h>l?((c-l)-(h-c))/(h-l)*v:0;}
  for(const k of sess.order){let cum=0;for(const i of sess.days[k].rth){cum+=dl[i];cvd[i]=cum;}}
  return {dl,cvd};}
function holdToClose(b,dir,ent,stopPx,dayEnd){const ep=b[ent][1],sd=Math.abs(ep-stopPx);if(sd<=0)return null;let exPx=b[dayEnd][4];for(let i=ent+1;i<=dayEnd;i++){if(dir>0?b[i][3]<=stopPx:b[i][2]>=stopPx){exPx=stopPx;break;}}return {r:((dir>0?(exPx-ep):(ep-exPx))-SLIP)/sd,day:ymd(b[ent][0])};}
// P5 with optional order-flow filter: mode 'none' | 'delta' (breakout-bar delta confirms) | 'cvd' (session CVD aligned)
function runP5(b,atr,sess,dl,cvd,mode){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1;
  if(mode==='delta' && (dir>0?dl[i]<=0:dl[i]>=0)){break;}                 // require delta to confirm the break
  if(mode==='cvd' && (dir>0?cvd[i]<=0:cvd[i]>=0)){break;}                  // require session CVD aligned
  const ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const t=holdToClose(b,dir,ent,b[ent][1]-dir*0.75*a2,dayEnd);if(t)tr.push(t);break;}}return tr;}
// reversion with optional delta-exhaustion filter
function runRev(b,atr,ma,sess,dl,k,se,maxBars,exh){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1;
  if(exh && (dir<0?dl[i]>=0:dl[i]<=0)){qi++;continue;}                     // exhaustion: delta opposes the extension (selling into highs / buying into lows)
  const ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function stats(tr){const N=tr.length;if(!N)return{trades:0};const w=tr.filter(t=>t.r>0);let cum=0,peak=0,dd=0;for(const t of tr){cum+=t.r;peak=Math.max(peak,cum);dd=Math.min(dd,cum-peak);}const mean=cum/N;const sd=Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N);const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return{trades:N,win:Math.round(1000*w.length/N)/10,expR:Math.round(1000*mean)/1000,sharpe:Math.round(1000*(sd>0?mean/sd:0))/1000,netR:Math.round(cum),maxDD:Math.round(dd),posYears:ys.filter(y=>m[y]>0).length+'/'+ys.length};}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET_vol.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);const {dl,cvd}=deltaCVD(b,sess);
  console.log('=== Order-flow (delta/CVD proxy) confirmation tests on NQ 2019-2026 ===\n');
  console.log('P5 baseline        :', JSON.stringify(stats(runP5(b,atr,sess,dl,cvd,'none'))));
  console.log('P5 + delta-confirm :', JSON.stringify(stats(runP5(b,atr,sess,dl,cvd,'delta'))));
  console.log('P5 + CVD-aligned   :', JSON.stringify(stats(runP5(b,atr,sess,dl,cvd,'cvd'))));
  console.log('');
  console.log('Reversion baseline :', JSON.stringify(stats(runRev(b,atr,ma,sess,dl,2,0.5,15,false))));
  console.log('Reversion + delta-exhaustion :', JSON.stringify(stats(runRev(b,atr,ma,sess,dl,2,0.5,15,true))));
  console.log('\nProxy caveat: close-location delta != true tick delta (Pine ta.requestVolumeDelta). Indicative only.');
}
main();
