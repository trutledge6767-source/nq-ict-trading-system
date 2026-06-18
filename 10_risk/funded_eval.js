#!/usr/bin/env node
/* =====================================================================
 * Funded-Account Survivability Simulator (Phase 12)
 * Evaluates a trade-by-trade $P&L sequence against a funded-account rule
 * set and reports PASS / FAIL(breach) / INSUFFICIENT-DATA.
 *
 * Trailing-DD model (EOD proxy): threshold = (runningPeakEquity - trailingDD),
 * where runningPeakEquity ratchets up to the max equity seen and LOCKS once it
 * reaches startBalance + lockBuffer (Apex-style). EOD proxy uses post-trade
 * equity as the peak source (conservative-ish; true intraday peak would be
 * stricter and needs tick data we don't have).
 *
 * Usage:
 *   node funded_eval.js <input.json>
 *   node funded_eval.js --selftest
 * input.json: { "startBalance":50000,
 *               "rules":{ "trailingDD":2500, "lockBuffer":2600,
 *                         "dailyLoss":1100, "profitTarget":3000,
 *                         "consistencyPct":0.30 },
 *               "trades":[ {"exitTime":1781650200,"dollars":120.0}, ... ] }
 * ===================================================================== */
'use strict';
const fs=require('fs');

function evaluate(startBalance, rules, trades){
  const r=Object.assign({trailingDD:2500,lockBuffer:null,dailyLoss:null,
    profitTarget:null,consistencyPct:0.30}, rules||{});
  if(!trades || trades.length===0) return {verdict:'INSUFFICIENT-DATA', trades:0};

  let eq=startBalance, peak=startBalance, locked=false;
  const lockAt = r.lockBuffer!=null ? startBalance + r.lockBuffer : Infinity;
  let threshold = peak - r.trailingDD;

  // group by day for daily-loss + consistency
  const dayKey=t=> new Date(((t.exitTime||0)-4*3600)*1000).toISOString().slice(0,10);
  const dayPnL={}; let order=[];
  let breach=null, passedAt=null, idx=0;

  for(const t of trades){
    idx++;
    const d=dayKey(t);
    if(dayPnL[d]===undefined){ dayPnL[d]=0; order.push(d); }
    dayPnL[d]+=t.dollars;
    eq+=t.dollars;

    // update trailing peak/threshold (ratchets up, locks at lockAt)
    if(!locked && eq>peak){
      peak=Math.min(eq, lockAt);
      if(peak>=lockAt){ peak=lockAt; locked=true; }
      threshold=peak - r.trailingDD;
    }
    // breach checks
    if(eq<=threshold && !breach){
      breach={type:'trailing-DD', atTrade:idx, equity:+eq.toFixed(2), threshold:+threshold.toFixed(2)};
      break;
    }
    if(r.dailyLoss!=null && dayPnL[d]<=-Math.abs(r.dailyLoss) && !breach){
      breach={type:'daily-loss', atTrade:idx, day:d, dayPnL:+dayPnL[d].toFixed(2)};
      break;
    }
    if(r.profitTarget!=null && (eq-startBalance)>=r.profitTarget && !passedAt){
      passedAt={atTrade:idx, equity:+eq.toFixed(2)};
    }
  }

  const totalPnL=eq-startBalance;
  const days=order.map(d=>({day:d, pnl:+dayPnL[d].toFixed(2)}));
  const bestDay=days.reduce((a,b)=> b.pnl>(a?a.pnl:-Infinity)?b:a, null);
  const consistencyOK = (totalPnL>0 && bestDay)
      ? (bestDay.pnl <= r.consistencyPct*totalPnL + 1e-9) : null;

  let verdict;
  if(breach) verdict='FAIL';
  else if(passedAt && (consistencyOK!==false)) verdict='PASS';
  else if(passedAt && consistencyOK===false) verdict='PASS-target-but-CONSISTENCY-FAIL';
  else verdict= totalPnL>0 ? 'SURVIVING-no-target-yet' : 'SURVIVING-drawdown';

  return {
    verdict, trades:trades.length, days:days.length,
    finalEquity:+eq.toFixed(2), totalPnL:+totalPnL.toFixed(2),
    peakEquity:+peak.toFixed(2), finalThreshold:+threshold.toFixed(2), locked,
    breach, passedAt,
    bestDay, consistencyPct:r.consistencyPct, consistencyOK
  };
}

function selftest(){
  const rules={trailingDD:2500, lockBuffer:2600, dailyLoss:1100, profitTarget:3000, consistencyPct:0.30};
  // Case A: steady winner reaching target across days
  const A=[]; let t=Math.floor(Date.UTC(2026,5,1,14,0,0)/1000);
  for(let i=0;i<20;i++){ A.push({exitTime:t, dollars: (i%4===3?-300:260)}); t+=3600*8; }
  // Case B: big spike then give-back -> trailing-DD breach
  const B=[{exitTime:t,dollars:2400},{exitTime:t+3600,dollars:-300},{exitTime:t+7200,dollars:-300},
           {exitTime:t+10800,dollars:-400},{exitTime:t+14400,dollars:-500},{exitTime:t+18000,dollars:-600}];
  console.log('SELFTEST A (steady):', JSON.stringify(evaluate(50000,rules,A),null,1));
  console.log('SELFTEST B (spike+giveback):', JSON.stringify(evaluate(50000,rules,B),null,1));
  console.log('SELFTEST C (empty):', JSON.stringify(evaluate(50000,rules,[])));
}

if(require.main===module){
  if(process.argv[2]==='--selftest'){ selftest(); }
  else if(process.argv[2]){
    const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    console.log(JSON.stringify(evaluate(j.startBalance, j.rules, j.trades),null,2));
  } else { console.error('usage: node funded_eval.js <input.json> | --selftest'); process.exit(1); }
}
module.exports={evaluate};
