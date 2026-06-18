#!/usr/bin/env node
/* =====================================================================
 * Walk-Forward Harness (Phase 11) — anti-overfitting validator.
 * Splits bars into rolling TRAIN/TEST folds. On each fold: grid-search
 * params on TRAIN (optimize objective), then apply the WINNING params to
 * the immediately-following TEST window (unseen). Aggregates out-of-sample
 * (OOS) results across all folds. A strategy is only credible if its OOS
 * metrics hold up vs in-sample (IS) — large IS->OOS degradation = overfit.
 *
 * Uses the SAME engine as production (04_backtests/engine/backtest.js) so
 * walk-forward results are non-repainting by construction.
 *
 * Usage:
 *   node walkforward.js <dataFile.json> [--folds N] [--testFrac 0.3]
 *   node walkforward.js --selftest
 * ===================================================================== */
'use strict';
const fs=require('fs');
const path=require('path');
const {run,DEF}=require('../04_backtests/engine/backtest.js');

// objective: maximize expectancy with a min-trade guard; tie-break on PF.
function objective(m){
  if(m.trades < 5) return -Infinity;          // ignore tiny-sample fits
  const pf = m.profitFactor===Infinity?3:m.profitFactor;
  return m.expectancyR*1.0 + 0.1*Math.min(pf,3) - 0.05*Math.abs(m.maxDrawdownR);
}

// parameter grid (kept small + economically meaningful to avoid overfitting)
function grid(){
  const G=[];
  for(const rr of [1.5,2.0,2.5,3.0])
   for(const stop of [1.0,1.5,2.0])
    for(const seq of [8,12,16])
      G.push({rr, stopAtrMlt:stop, seqWin:seq});
  return G;
}

function sliceData(data, a, b){ return {tf:data.tf, tz:data.tz, bars:data.bars.slice(a,b)}; }

function walk(data, folds, testFrac, base){
  base=base||{};
  const n=data.bars.length;
  const foldLen=Math.floor(n/folds);
  const results=[];
  for(let k=0;k<folds;k++){
    const start=k*foldLen;
    const end=(k===folds-1)?n:start+foldLen;
    if(end-start < 60) continue;             // need enough bars
    const testLen=Math.max(20, Math.floor((end-start)*testFrac));
    const trainEnd=end-testLen;
    const train=sliceData(data,start,trainEnd);
    const test =sliceData(data,trainEnd,end);
    // optimize on train
    let best=null,bestP=null,bestScore=-Infinity;
    for(const g of grid()){
      const P=Object.assign({},DEF,base,g);
      const m=run(train,P);
      const s=objective(m);
      if(s>bestScore){ bestScore=s; best=m; bestP=P; }
    }
    if(!bestP){ results.push({fold:k, note:'no-valid-train-fit'}); continue; }
    // apply winning params to unseen test
    const oos=run(test,bestP);
    results.push({
      fold:k,
      trainBars:train.bars.length, testBars:test.bars.length,
      chosen:{rr:bestP.rr, stop:bestP.stopAtrMlt, seq:bestP.seqWin},
      IS:{trades:best.trades, expR:best.expectancyR, PF:best.profitFactor, maxDD:best.maxDrawdownR},
      OOS:{trades:oos.trades, expR:oos.expectancyR, PF:oos.profitFactor, maxDD:oos.maxDrawdownR, win:oos.winRate}
    });
  }
  // aggregate OOS
  const oosT=results.reduce((s,r)=>s+(r.OOS?r.OOS.trades:0),0);
  const oosExp=results.filter(r=>r.OOS&&r.OOS.trades>0);
  const meanOOSexp = oosExp.length? oosExp.reduce((s,r)=>s+r.OOS.expR,0)/oosExp.length : 0;
  const meanISexp  = results.filter(r=>r.IS).reduce((s,r,_,a)=>s+r.IS.expR/a.length,0);
  return {
    folds:results.length, totalOOStrades:oosT,
    meanIS_expR:+meanISexp.toFixed(3), meanOOS_expR:+meanOOSexp.toFixed(3),
    degradation:+(meanISexp-meanOOSexp).toFixed(3),
    verdict: oosT<20 ? 'INSUFFICIENT-OOS-SAMPLE'
            : meanOOSexp>0 && (meanISexp-meanOOSexp)<0.3 ? 'ROBUST'
            : meanOOSexp>0 ? 'WEAK-OOS-positive-but-degrades'
            : 'OVERFIT/FAIL',
    perFold:results
  };
}

function genSynth(nbars, seed){
  // zigzag legs (frequent structure breaks -> exercises MSS/sweep/FVG) + noise
  let s=seed||7; const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  let t=Math.floor(Date.UTC(2026,4,1,12,0,0)/1000), p=20000; const bars=[];
  let dir=1, legLeft=0;
  for(let i=0;i<nbars;i++){
    if(legLeft<=0){ dir=-dir; legLeft=10+Math.floor(rnd()*20); }   // new leg every 10-30 bars
    legLeft--;
    const o=p;
    const step=dir*(6+rnd()*10) + (rnd()-0.5)*18;                  // trend + noise
    const c=o+step;
    const h=Math.max(o,c)+rnd()*10, l=Math.min(o,c)-rnd()*10;
    bars.push([t,+o.toFixed(2),+h.toFixed(2),+l.toFixed(2),+c.toFixed(2)]); p=c; t+=300;
  }
  return {tf:'5', tz:-4, bars};
}

if(require.main===module){
  if(process.argv[2]==='--selftest'){
    const data=genSynth(4000,7);
    console.log('SELFTEST walk-forward on synthetic 4000 bars (raw MSS, filters off, to exercise OOS path):');
    const base={useKZ:false,useBias:false,useFib:false,useSweep:false,useFVG:false};
    console.log(JSON.stringify(walk(data, 5, 0.3, base), (k,v)=>v===Infinity?'inf':v, 2));
  } else if(process.argv[2]){
    const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    const data={tf:j.tf, tz:(j.tz_offset_hours!=null?j.tz_offset_hours:-4), bars:j.bars};
    const fi=process.argv.indexOf('--folds'); const tf=process.argv.indexOf('--testFrac');
    const folds=fi>0?+process.argv[fi+1]:5; const testFrac=tf>0?+process.argv[tf+1]:0.3;
    console.log(JSON.stringify(walk(data, folds, testFrac), (k,v)=>v===Infinity?'inf':v, 2));
  } else console.error('usage: node walkforward.js <dataFile.json> [--folds N] [--testFrac F] | --selftest');
}
module.exports={walk};
