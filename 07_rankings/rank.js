#!/usr/bin/env node
/* =====================================================================
 * Strategy Ranking / Leaderboard (Phase 7)
 * Scoring weights (per mission): 40% Profit Factor, 25% Drawdown,
 * 20% Win Rate, 15% Consistency.
 *
 * Each metric is normalized to [0,1] across the candidate set (relative
 * ranking), then combined. Candidates with trades < minTrades are marked
 * UNRANKED (cannot trust the metrics) — robustness over noise.
 *
 * Input: a JSON array of candidate result objects, each like:
 *   { name, trades, profitFactor, winRate, maxDrawdownR, expectancyR,
 *     consistency? }   // consistency optional 0..1 (e.g., % profitable months/days)
 * If consistency is absent, it is proxied from |expectancy|/perTradeStd-ish via a
 * stability proxy = clamp( expectancyR / (|maxDrawdownR|+1) ).
 *
 * Usage: node rank.js <candidates.json> [minTrades]
 *        node rank.js --selftest
 * ===================================================================== */
'use strict';
const fs=require('fs');

const W={ pf:0.40, dd:0.25, win:0.20, cons:0.15 };

function norm(vals){ // min-max -> [0,1]; if all equal, 0.5
  const f=vals.filter(v=>Number.isFinite(v));
  if(f.length===0) return vals.map(_=>0.5);
  const mn=Math.min(...f), mx=Math.max(...f);
  if(mx===mn) return vals.map(_=>0.5);
  return vals.map(v=>Number.isFinite(v)?(v-mn)/(mx-mn):0);
}

function rank(cands, minTrades){
  minTrades=minTrades||30;
  const elig=cands.filter(c=>(c.trades||0)>=minTrades);
  const unranked=cands.filter(c=>(c.trades||0)<minTrades)
     .map(c=>({name:c.name, trades:c.trades||0, status:'UNRANKED-small-sample'}));

  if(elig.length===0) return {weights:W, minTrades, ranked:[], unranked,
     note:'No candidate met minTrades; nothing rankable (data ceiling).'};

  // raw arrays (PF capped at 5 to avoid an outlier dominating; DD uses -|dd| so higher=better)
  const pf  = elig.map(c=> Math.min(c.profitFactor===Infinity?5:(c.profitFactor||0), 5));
  const dd  = elig.map(c=> -Math.abs(c.maxDrawdownR||0));
  const win = elig.map(c=> c.winRate||0);
  const cons= elig.map(c=> c.consistency!=null ? c.consistency
                 : Math.max(0, Math.min(1, (c.expectancyR||0)/(Math.abs(c.maxDrawdownR||0)+1))));
  const nPF=norm(pf), nDD=norm(dd), nWin=norm(win), nCons=norm(cons);

  const scored=elig.map((c,i)=>({
    name:c.name, trades:c.trades,
    profitFactor:c.profitFactor, winRate:c.winRate, maxDrawdownR:c.maxDrawdownR,
    expectancyR:c.expectancyR,
    score:+(W.pf*nPF[i]+W.dd*nDD[i]+W.win*nWin[i]+W.cons*nCons[i]).toFixed(4),
    parts:{pf:+nPF[i].toFixed(2), dd:+nDD[i].toFixed(2), win:+nWin[i].toFixed(2), cons:+nCons[i].toFixed(2)}
  })).sort((a,b)=>b.score-a.score);

  scored.forEach((s,i)=>s.rank=i+1);
  return {weights:W, minTrades, leaderboard:scored, unranked};
}

function selftest(){
  const cands=[
    {name:'A_balanced',  trades:120, profitFactor:1.8, winRate:52, maxDrawdownR:-6,  expectancyR:0.35},
    {name:'B_highPF_DD', trades:90,  profitFactor:2.6, winRate:48, maxDrawdownR:-14, expectancyR:0.55},
    {name:'C_lowDD',     trades:140, profitFactor:1.5, winRate:58, maxDrawdownR:-3,  expectancyR:0.22},
    {name:'D_tiny',      trades:8,   profitFactor:9.0, winRate:88, maxDrawdownR:-1,  expectancyR:2.0},
    {name:'E_loser',     trades:110, profitFactor:0.8, winRate:40, maxDrawdownR:-20, expectancyR:-0.2}
  ];
  console.log(JSON.stringify(rank(cands,30), (k,v)=>v===Infinity?'inf':v, 2));
}

if(require.main===module){
  if(process.argv[2]==='--selftest') selftest();
  else if(process.argv[2]){
    const arr=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    console.log(JSON.stringify(rank(arr, +process.argv[3]||30), (k,v)=>v===Infinity?'inf':v, 2));
  } else console.error('usage: node rank.js <candidates.json> [minTrades] | --selftest');
}
module.exports={rank, W};
