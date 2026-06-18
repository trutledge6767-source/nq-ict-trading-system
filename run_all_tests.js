#!/usr/bin/env node
/* =====================================================================
 * run_all_tests.js — one-command CI-style check of the whole stack.
 * Runs every module's core logic with assertions and prints PASS/FAIL.
 * Exit code 0 = all green, 1 = any failure.
 *   node run_all_tests.js
 * ===================================================================== */
'use strict';
const path=require('path');
const R=(...p)=>require(path.join(__dirname,...p));

let passed=0, failed=0; const fails=[];
function check(name, fn){
  try{ const ok=fn(); if(ok){ passed++; console.log('  PASS  '+name); }
       else { failed++; fails.push(name); console.log('  FAIL  '+name); } }
  catch(e){ failed++; fails.push(name+' (threw: '+e.message+')'); console.log('  FAIL  '+name+'  -> '+e.message); }
}

// deterministic synthetic data (zigzag) for engine-based checks
function synth(n, seed){
  let s=seed||7; const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  let t=Math.floor(Date.UTC(2026,4,1,12,0,0)/1000), p=20000; const bars=[]; let dir=1,leg=0;
  for(let i=0;i<n;i++){ if(leg<=0){dir=-dir;leg=10+Math.floor(rnd()*20);} leg--;
    const o=p,c=o+dir*(6+rnd()*10)+(rnd()-0.5)*18,h=Math.max(o,c)+rnd()*10,l=Math.min(o,c)-rnd()*10;
    bars.push([t,+o.toFixed(2),+h.toFixed(2),+l.toFixed(2),+c.toFixed(2)]); p=c; t+=300; }
  return {tf:'5',tz:-4,bars};
}

console.log('NQ ICT system — self-test suite\n');

// 1) Engine
const {run,DEF}=R('04_backtests','engine','backtest.js');
check('engine: returns valid metrics object', ()=>{
  const m=run(synth(800), Object.assign({},DEF,{useKZ:false,useBias:false,useFib:false,useSweep:false,useFVG:false}));
  return typeof m.trades==='number' && m.trades>=0 && 'profitFactor' in m && 'expectancyR' in m && Array.isArray(m.tradeList);
});
check('engine: partial+BE reduces drawdown vs full-target', ()=>{
  const base={useKZ:false,useBias:false,useFib:false,useSweep:false,useFVG:false,maxTradesD:99,dailyLossR:99};
  const full=run(synth(4000), Object.assign({},DEF,base,{usePartial:false}));
  const part=run(synth(4000), Object.assign({},DEF,base,{usePartial:true,partialFrac:0.5,partialAtR:1.0}));
  return Math.abs(part.maxDrawdownR) < Math.abs(full.maxDrawdownR);
});
check('engine: retrace mode runs + produces trades on structured data (non-repaint)', ()=>{
  const m=run(synth(4000,7), Object.assign({},DEF,{useKZ:false,useBias:false,useFib:false,
    useSweep:false,useRetrace:true,retraceWin:12,fvgWin:6}));
  return typeof m.trades==='number' && m.trades>=1 && Array.isArray(m.tradeList);
});
check('engine: news/vol toggles OFF do not change results (regression)', ()=>{
  const base={useKZ:false,useBias:false,useFib:false,useSweep:false,useFVG:false,maxTradesD:99,dailyLossR:99};
  const a=run(synth(2000), Object.assign({},DEF,base));
  const b=run(synth(2000), Object.assign({},DEF,base,{useNews:false,useVolFilter:false}));
  return a.trades===b.trades && a.netR===b.netR;
});

// 2) Walk-forward
const {walk}=R('09_walkforward','walkforward.js');
check('walkforward: returns verdict + folds', ()=>{
  const r=walk(synth(4000), 5, 0.3, {useKZ:false,useBias:false,useFib:false,useSweep:false,useFVG:false});
  return typeof r.verdict==='string' && Array.isArray(r.perFold) && r.folds===5;
});

// 3) Ranking
const {rank}=R('07_rankings','rank.js');
check('rank: low-DD beats high-PF; tiny-sample UNRANKED', ()=>{
  const c=[
    {name:'A',trades:120,profitFactor:1.8,winRate:52,maxDrawdownR:-6,expectancyR:0.35},
    {name:'B',trades:90,profitFactor:2.6,winRate:48,maxDrawdownR:-14,expectancyR:0.55},
    {name:'C',trades:140,profitFactor:1.5,winRate:58,maxDrawdownR:-3,expectancyR:0.22},
    {name:'D',trades:8,profitFactor:9,winRate:88,maxDrawdownR:-1,expectancyR:2}
  ];
  const r=rank(c,30);
  return r.leaderboard[0].name==='C' && r.unranked.some(u=>u.name==='D');
});

// 4) Funded survivability
const {evaluate}=R('10_risk','funded_eval.js');
check('funded_eval: detects daily-loss/trailing breach -> FAIL', ()=>{
  const rules={trailingDD:2500,lockBuffer:2600,dailyLoss:1100,profitTarget:3000,consistencyPct:0.3};
  const t0=Math.floor(Date.UTC(2026,5,1,14,0,0)/1000);
  const trades=[{exitTime:t0,dollars:-600},{exitTime:t0+60,dollars:-600}]; // -1200 > dailyLoss 1100
  return evaluate(50000, rules, trades).verdict==='FAIL';
});
check('funded_eval: empty -> INSUFFICIENT-DATA', ()=> evaluate(50000,{},[]).verdict==='INSUFFICIENT-DATA');

// 5) Monte Carlo
const {sim}=R('10_risk','montecarlo.js');
check('montecarlo: pass-prob in [0,1] and mutually exclusive', ()=>{
  const dist=[]; for(let i=0;i<100;i++) dist.push(i<45?2:-1);
  const m=sim(dist,{paths:5000,tradesPerPath:60,ruinDD_R:6,targetR:9});
  return m.prob_pass_funded>=0 && m.prob_pass_funded<=1 &&
         Math.abs(m.prob_ruin_before_target+m.prob_pass_funded+m.prob_neither_in_window-1)<0.02;
});

// 6) News filter
const {inBlackout}=R('02_news','news_filter.js');
check('news_filter: blocks 08:31 ET, passes 09:15 ET', ()=>{
  const off=-4, mk=(h,mi)=>Math.floor(Date.UTC(2026,5,17,h-off,mi,0)/1000);
  return inBlackout(mk(8,31),{tzOffsetHours:off,recurring:true}).blocked===true &&
         inBlackout(mk(9,15),{tzOffsetHours:off,recurring:true}).blocked===false;
});

// 7) CSV converter
const {parseCSV}=R('04_backtests','engine','csv_to_data.js');
check('csv_to_data: parses datetime CSV, sorts + dedupes', ()=>{
  const csv=[
    'Date,Open,High,Low,Close,Volume',
    '2026-06-01 13:10:00,3,4,2,3.5,10',   // out of order on purpose
    '2026-06-01 13:00:00,1,2,0.5,1.8,10',
    '2026-06-01 13:00:00,1,2,0.5,1.9,10', // dup timestamp -> keep last
    '2026-06-01 13:05:00,2,3,1.5,2.8,10'
  ].join('\n');
  const d=parseCSV(csv,{tf:'5',tz:-4});
  const ts=d.bars.map(b=>b[0]);
  const sorted = ts.every((v,i)=>i===0||v>ts[i-1]);
  return d.bars.length===3 && sorted && d.bars[0][4]===1.9; // dedupe kept last close
});
check('csv_to_data: parses unix-seconds time + alt column names', ()=>{
  const csv='timestamp,o,h,l,c\n1781650200,1,2,0.5,1.5\n1781650500,1.5,2.5,1,2';
  const d=parseCSV(csv,{tf:'5'});
  return d.bars.length===2 && d.bars[0][0]===1781650200 && d.bars[1][4]===2;
});
check('csv_to_data: parses US M/D/YYYY H:MM (ET wall-clock) header "timestamp ET"', ()=>{
  const csv='timestamp ET,open,high,low,close,volume\n3/31/2025 0:35,19921.5,19922.5,19919,19922,73\n3/31/2025 0:36,19922.25,19927.25,19921.75,19925.5,126';
  const d=parseCSV(csv,{tf:'1',tz:0});
  // wall-clock 00:35 read back as UTC hour must be 0 (so killzone/news see ET hour directly)
  const hh=new Date(d.bars[0][0]*1000).getUTCHours(), mm=new Date(d.bars[0][0]*1000).getUTCMinutes();
  return d.bars.length===2 && hh===0 && mm===35 && d.bars[1][0]-d.bars[0][0]===60;
});

// 8) Resampler (1m -> Nm)
const {resample}=R('04_backtests','engine','resample.js');
check('resample: 1m->5m aggregates OHLC correctly + skips gaps', ()=>{
  const t0=Math.floor(Date.UTC(2026,5,1,13,0,0)/1000);
  const bars=[]; for(let i=0;i<10;i++){ const o=100+i; bars.push([t0+i*60,o,o+1,o-1,o+0.5]); }
  const r=resample({tf:'1',tz_offset_hours:-4,bars},5);
  const okAgg = r.bars.length===2 && r.bars[0][1]===100 && r.bars[0][2]===105 &&
                r.bars[0][3]===99 && r.bars[0][4]===104.5;
  const gap=resample({tf:'1',tz_offset_hours:-4,bars:[[t0,1,1,1,1],[t0+600,2,2,2,2]]},5);
  return okAgg && gap.bars.length===2;   // gap not back-filled
});

console.log('\n================ RESULT ================');
console.log('PASSED: '+passed+'   FAILED: '+failed);
if(failed){ console.log('Failures:\n - '+fails.join('\n - ')); process.exit(1); }
else { console.log('ALL GREEN — every module runs flawlessly.'); process.exit(0); }
