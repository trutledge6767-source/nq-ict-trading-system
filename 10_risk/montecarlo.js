#!/usr/bin/env node
/* =====================================================================
 * Monte Carlo trade-sequence simulator (Phase 12 risk extension).
 * Takes a per-trade R-multiple distribution (the strategy's edge) and
 * bootstraps N randomized equity paths to estimate:
 *   - distribution of max drawdown (R)
 *   - probability of breaching a daily/trailing risk limit
 *   - probability of reaching a profit target before ruin (funded PASS%)
 *   - percentile equity outcomes
 *
 * WHY: trade ORDER is random in live trading; a positive-expectancy edge
 * can still bust an account via an unlucky cluster of losses. This sizes
 * that tail risk — the core of funded-account survivability.
 *
 * Usage:
 *   node montecarlo.js <input.json>     // {rMultiples:[...], cfg:{...}}
 *   node montecarlo.js --selftest
 * cfg: { paths, tradesPerPath, riskPerTradeR (1), startR (0),
 *        ruinDD_R (trailing-DD in R), targetR, dailyTrades }
 * ===================================================================== */
'use strict';
const fs=require('fs');

function mulberry32(a){ return function(){ a|=0;a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

function sim(rDist, cfg){
  const c=Object.assign({paths:10000, tradesPerPath:0, ruinDD_R:6, targetR:9, seed:12345}, cfg||{});
  if(!rDist || rDist.length<3) return {error:'need >=3 R samples', n:rDist?rDist.length:0};
  const tpp = c.tradesPerPath>0 ? c.tradesPerPath : rDist.length;
  const rnd = mulberry32(c.seed);
  const maxDDs=[], finals=[]; let ruinCount=0, targetCount=0, targetBeforeRuin=0;

  for(let p=0;p<c.paths;p++){
    let eq=c.startR||0, peak=eq, maxDD=0, outcome='neither';
    for(let i=0;i<tpp;i++){
      const r=rDist[(rnd()*rDist.length)|0];          // bootstrap with replacement
      eq+=r;
      if(eq>peak) peak=eq;
      const dd=peak-eq; if(dd>maxDD) maxDD=dd;          // positive magnitude
      if(dd>=c.ruinDD_R){ outcome='ruin'; break; }       // DD checked first = conservative
      if((eq-(c.startR||0))>=c.targetR){ outcome='pass'; break; }
    }
    if(outcome==='ruin') ruinCount++;
    else if(outcome==='pass'){ targetCount++; targetBeforeRuin++; }
    maxDDs.push(maxDD); finals.push(eq);
  }
  const pct=(arr,q)=>{ const s=[...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(q*s.length))]; };
  const mean=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
  const r2=v=>Math.round(v*100)/100;
  const neither=c.paths-ruinCount-targetCount;
  return {
    samples:rDist.length, paths:c.paths, tradesPerPath:tpp,
    edge_meanR:r2(mean(rDist)),
    maxDD_R_magnitude:{ p50:r2(pct(maxDDs,0.5)), p90:r2(pct(maxDDs,0.9)), p99:r2(pct(maxDDs,0.99)), worst:r2(Math.max(...maxDDs)) },
    finalR:{ p10:r2(pct(finals,0.10)), p50:r2(pct(finals,0.5)), p90:r2(pct(finals,0.9)) },
    prob_ruin_before_target: r2(ruinCount/c.paths),
    prob_pass_funded:        r2(targetBeforeRuin/c.paths),  // target before trailing-DD breach (mutually excl.)
    prob_neither_in_window:  r2(neither/c.paths),
    ruinDD_R:c.ruinDD_R, targetR:c.targetR,
    verdict: (targetBeforeRuin/c.paths) >= 0.6 ? 'STRONG-SURVIVABILITY'
           : (targetBeforeRuin/c.paths) >= 0.4 ? 'MODERATE'
           : 'FRAGILE-tail-risk-high'
  };
}

function selftest(){
  // synthetic edge: 45% winners at +2R, 55% losers at -1R  => expectancy +0.35R
  const dist=[]; for(let i=0;i<100;i++) dist.push(i<45?2:-1);
  console.log('MC selftest (45% @ +2R / 55% @ -1R, exp +0.35R):');
  console.log(JSON.stringify(sim(dist, {paths:20000, tradesPerPath:60, ruinDD_R:6, targetR:9}), null, 2));
  // fragile edge: barely positive, fat left tail
  const d2=[]; for(let i=0;i<100;i++) d2.push(i<35?3:-1);  // 35% @ +3R / 65% @ -1R => +0.4R but choppy
  console.log('\nMC selftest (35% @ +3R / 65% @ -1R):');
  console.log(JSON.stringify(sim(d2, {paths:20000, tradesPerPath:60, ruinDD_R:6, targetR:9}), null, 2));
}

if(require.main===module){
  if(process.argv[2]==='--selftest') selftest();
  else if(process.argv[2]){ const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    console.log(JSON.stringify(sim(j.rMultiples, j.cfg), null, 2)); }
  else console.error('usage: node montecarlo.js <input.json> | --selftest');
}
module.exports={sim};
