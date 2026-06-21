#!/usr/bin/env node
/* blend_oos.js — out-of-sample validation of the reversion sleeve + the blend.
 * Splits IS (2019-2023) vs OOS (2024-2026). Reports daily Sharpe of P5, Reversion,
 * and the P5+0.5*Rev blend in BOTH windows, plus correlation. The diversification is
 * only trustworthy if blend Sharpe > P5 Sharpe OOS (not just in-sample).
 * Usage: node blend_oos.js <data_et.json> */
'use strict';
const fs=require('fs');
const SLIP_RT=1.0;
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const yrOf=k=>+k.split('-')[0];
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-SLIP_RT)/sd,day:order[j]});break;}}return tr;}
function runRev(b,atr,ma,sess,k,stopExtra,maxBars){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=stopExtra*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgtPx=m;let exIdx=dayEnd,exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgtPx:lo<=tgtPx){exPx=tgtPx;exIdx=kk;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-SLIP_RT;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}
function streamByDay(tr,order){const m={};for(const k of order)m[k]=0;for(const t of tr)m[t.day]+=t.r;return order.map(k=>({day:k,r:m[k]}));}
function dailyStats(arr){const n=arr.length;if(!n)return{n:0};const vals=arr.map(x=>x.r);const mean=vals.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/n);const tot=vals.reduce((a,b)=>a+b,0);return{n,mean:+mean.toFixed(3),sd:+sd.toFixed(2),sharpe:+(sd>0?mean/sd:0).toFixed(3),ann:+(sd>0?mean/sd*Math.sqrt(252):0).toFixed(2),netR:Math.round(tot)};}
function corr(a,b){const n=a.length,x=a.map(v=>v.r),y=b.map(v=>v.r);const mx=x.reduce((s,v)=>s+v)/n,my=y.reduce((s,v)=>s+v)/n;let c=0,vx=0,vy=0;for(let i=0;i<n;i++){c+=(x[i]-mx)*(y[i]-my);vx+=(x[i]-mx)**2;vy+=(y[i]-my)**2;}return +(c/Math.sqrt(vx*vy)).toFixed(3);}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=streamByDay(runP5(b,atr,sess),sess.order);
  const rev=streamByDay(runRev(b,atr,ma,sess,2.0,0.5,15),sess.order);
  const blend=p5.map((d,i)=>({day:d.day,r:d.r+0.5*rev[i].r}));
  const splits=[['FULL 2019-2026',()=>true],['IS  2019-2023',k=>yrOf(k)<=2023],['OOS 2024-2026',k=>yrOf(k)>=2024]];
  console.log('=== OOS validation: reversion sleeve + blend (daily Sharpe) ===\n');
  for(const [tag,f] of splits){
    const fp=p5.filter(d=>f(d.day)),fr=rev.filter(d=>f(d.day)),fb=blend.filter(d=>f(d.day));
    const sp=dailyStats(fp),sr=dailyStats(fr),sb=dailyStats(fb);
    console.log(tag+'  ('+sp.n+' days)');
    console.log('  P5       : Sharpe/day '+sp.sharpe+'  ann '+sp.ann+'  netR '+sp.netR);
    console.log('  Reversion: Sharpe/day '+sr.sharpe+'  ann '+sr.ann+'  netR '+sr.netR);
    console.log('  BLEND    : Sharpe/day '+sb.sharpe+'  ann '+sb.ann+'  netR '+sb.netR+'   corr(P5,rev) '+corr(fp,fr));
    console.log('  -> blend beats P5? '+(sb.ann>sp.ann?'YES (+'+(sb.ann-sp.ann).toFixed(2)+' ann Sharpe)':'NO')+'\n');
  }
  // per-year reversion robustness
  const m={};for(const d of rev)m[yrOf(d.day)]=(m[yrOf(d.day)]||0)+d.r;
  console.log('Reversion per-year netR:', Object.keys(m).sort().map(y=>y.slice(2)+':'+Math.round(m[y])).join('  '));
}
main();
