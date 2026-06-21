#!/usr/bin/env node
/* limit_fill_test.js — can LIMIT-order entries rescue the slippage-fragile reversion sleeve?
 * Market baseline: enter next-bar open, pay slippage. Limit model: place a passive limit at
 * (signal close +/- offset*ATR); fill only if price extends to it within fillWindow bars (else
 * MISS the trade = adverse selection + non-fill); entry slippage = 0; exits keep slippage on
 * stop/close (target is a limit = no slip). Compares expR, fill-rate, per-year, P5 correlation.
 * Usage: node limit_fill_test.js <data_et.json> */
'use strict';
const fs=require('fs');
const D=t=>new Date(t*1000),hh=t=>D(t).getUTCHours(),mm=t=>D(t).getUTCMinutes();
const ymd=t=>{const d=D(t);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const minOfDay=t=>hh(t)*60+mm(t);const RTH_OPEN=9*60+30,RTH_CLOSE=16*60;const isRTH=t=>{const m=minOfDay(t);return m>=RTH_OPEN&&m<RTH_CLOSE;};
function atr14(b){const len=14,tr=b.map((x,i)=>i===0?(x[2]-x[3]):Math.max(x[2]-x[3],Math.abs(x[2]-b[i-1][4]),Math.abs(x[3]-b[i-1][4])));const out=new Array(b.length).fill(null);let prev=null;for(let i=0;i<tr.length;i++){if(i<len-1)continue;if(prev===null){let s=0;for(let k=i-len+1;k<=i;k++)s+=tr[k];prev=s/len;}else prev=(prev*(len-1)+tr[i])/len;out[i]=prev;}return out;}
function sma(b,len){const out=new Array(b.length).fill(null);let s=0;for(let i=0;i<b.length;i++){s+=b[i][4];if(i>=len)s-=b[i-len][4];if(i>=len-1)out[i]=s/len;}return out;}
function sessions(b){const days={},order=[];for(let i=0;i<b.length;i++){const k=ymd(b[i][0]);if(!days[k]){days[k]={rth:[]};order.push(k);}if(isRTH(b[i][0]))days[k].rth.push(i);}const ord=order.filter(k=>days[k].rth.length>=12);for(const k of ord){const s=days[k];let hi=-1e9,lo=1e9;for(const i of s.rth){hi=Math.max(hi,b[i][2]);lo=Math.min(lo,b[i][3]);}s.rthHi=hi;s.rthLo=lo;}return {days,order:ord};}
function runP5(b,atr,sess){const {days,order}=sess,tr=[],cutoff=12*60;for(let j=1;j<order.length;j++){const p=days[order[j-1]],s=days[order[j]];if(p.rthHi==null)continue;const dayEnd=s.rth[s.rth.length-1];for(let q=0;q<s.rth.length-1;q++){const i=s.rth[q],a=atr[i];if(a==null||a<=0)continue;if(minOfDay(b[i][0])>=cutoff)break;const up=b[i][4]>p.rthHi,dn=b[i][4]<p.rthLo;if(!up&&!dn)continue;const dir=up?1:-1,ent=s.rth[q+1],a2=atr[ent];if(a2==null)break;const ep=b[ent][1],sd=0.75*a2,stopPx=ep-dir*sd;let exPx=b[dayEnd][4];for(let kk=ent+1;kk<=dayEnd;kk++){if(dir>0?b[kk][3]<=stopPx:b[kk][2]>=stopPx){exPx=stopPx;break;}}tr.push({r:((dir>0?(exPx-ep):(ep-exPx))-1.0)/sd,day:order[j]});break;}}return tr;}

// market entry (next open, slip) — baseline
function runRevMkt(b,atr,ma,sess,k,se,maxBars,slip){const {days,order}=sess,tr=[];for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}const dir=under?1:-1,ent=rth[qi+1],a2=atr[ent];if(a2==null){qi++;continue;}const ep=b[ent][1],sd=se*a2;if(sd<=0){qi++;continue;}const stopPx=ep-dir*sd,tgt=m;let exIdx=dayEnd,exPx=b[dayEnd][4],slipExit=slip;for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;break;}if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;slipExit=slip/2;break;}exIdx=kk;exPx=b[kk][4];}const gross=(dir>0?(exPx-ep):(ep-exPx))-slip;tr.push({r:gross/sd,day:key});let ni=rth.indexOf(exIdx);qi=ni<0?qi+1:ni+1;}}return tr;}

// limit entry: passive limit at close +/- off*ATR; fill if price extends to it within fillWindow; else MISS
function runRevLimit(b,atr,ma,sess,k,se,maxBars,off,fillWindow,exitSlip){const {days,order}=sess,tr=[];let signals=0,fills=0;
  for(const key of order){const s=days[key],rth=s.rth,dayEnd=rth[rth.length-1];let qi=0;
    while(qi<rth.length-1){const i=rth[qi],a=atr[i],m=ma[i];if(a==null||m==null||a<=0){qi++;continue;}
      const over=b[i][4]>m+k*a,under=b[i][4]<m-k*a;if(!over&&!under){qi++;continue;}
      signals++; const dir=under?1:-1; const L = dir<0 ? b[i][4]+off*a : b[i][4]-off*a;   // short limit above / long limit below
      // find fill within window
      let ent=-1; for(let f=qi+1; f<rth.length && f<=qi+fillWindow; f++){const fi=rth[f];if(dir<0? b[fi][2]>=L : b[fi][3]<=L){ent=fi;break;}}
      if(ent<0){ qi++; continue; }                                  // no fill -> missed (adverse selection / non-fill)
      fills++; const a2=atr[ent]; const sd=se*a2; if(sd<=0){qi++;continue;}
      const stopPx=L-dir*sd, tgt=m; let exIdx=dayEnd,exPx=b[dayEnd][4],eslip=exitSlip;
      for(let kk=ent+1;kk<=dayEnd&&kk-ent<=maxBars;kk++){const hi=b[kk][2],lo=b[kk][3];
        if(dir>0?lo<=stopPx:hi>=stopPx){exPx=stopPx;exIdx=kk;eslip=exitSlip;break;}
        if(dir>0?hi>=tgt:lo<=tgt){exPx=tgt;exIdx=kk;eslip=0;break;}                       // target = limit, no slip
        exIdx=kk;exPx=b[kk][4];}
      const gross=(dir>0?(exPx-L):(L-exPx))-eslip;                  // entry at L (no entry slip)
      tr.push({r:gross/sd,day:key}); let ni=rth.indexOf(exIdx); qi=ni<0?qi+1:ni+1;
    }
  }
  return {tr,fillRate:Math.round(1000*fills/signals)/10};
}
function expR(tr){return tr.length?tr.reduce((s,t)=>s+t.r,0)/tr.length:0;}
function stats(tr){const N=tr.length;if(!N)return'(none)';const w=tr.filter(t=>t.r>0);let cum=0;for(const t of tr)cum+=t.r;const m={};for(const t of tr){const y=t.day.split('-')[0];m[y]=(m[y]||0)+t.r;}const ys=Object.keys(m).sort();return 'trades '+N+' win '+(Math.round(1000*w.length/N)/10)+'% expR '+(Math.round(1000*cum/N)/1000)+' netR '+Math.round(cum)+' +yrs '+ys.filter(y=>m[y]>0).length+'/'+ys.length;}
function dayMap(tr){const m={};for(const t of tr)m[t.day]=(m[t.day]||0)+t.r;return m;}
function corr(a,b){const ks=Object.keys(a).filter(k=>k in b);const x=ks.map(k=>a[k]),y=ks.map(k=>b[k]),n=x.length;const mx=x.reduce((s,v)=>s+v)/n,my=y.reduce((s,v)=>s+v)/n;let c=0,vx=0,vy=0;for(let i=0;i<n;i++){c+=(x[i]-mx)*(y[i]-my);vx+=(x[i]-mx)**2;vy+=(y[i]-my)**2;}return Math.round(1000*c/Math.sqrt(vx*vy))/1000;}
function main(){
  const j=JSON.parse(fs.readFileSync(process.argv[2]||'04_backtests/data/NQ_5m_7y_ET.json','utf8').replace(/^﻿/,''));
  const b=j.bars,atr=atr14(b),ma=sma(b,20),sess=sessions(b);
  const p5=dayMap(runP5(b,atr,sess));
  console.log('=== Reversion execution model comparison (fade>2ATR, stop0.5, maxBars15) ===\n');
  console.log('MARKET  @1.0pt slip :', stats(runRevMkt(b,atr,ma,sess,2,0.5,15,1.0)));
  console.log('MARKET  @1.5pt slip :', stats(runRevMkt(b,atr,ma,sess,2,0.5,15,1.5)));
  for(const off of [0,0.25,0.5]){
    const r=runRevLimit(b,atr,ma,sess,2,0.5,15,off,3,0.5);
    console.log('LIMIT off'+off+'ATR (exitSlip0.5, fill '+r.fillRate+'%):', stats(r.tr), ' corrP5 '+corr(dayMap(r.tr),p5));
  }
  console.log('\nLimit removes ENTRY slip but adds non-fill/adverse-selection. Net = does expR beat the market 1.5pt case (+0.002)?');
}
main();
