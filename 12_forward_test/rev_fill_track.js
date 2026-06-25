#!/usr/bin/env node
/* rev_fill_track.js — reversion sleeve LIVE FILL tracker.
 * Counts reversion entries (fills) per trading day from events.csv. The reversion
 * alert only fires on an actual fill, so this is the live-fill side of the fill-rate.
 * (Signals/triangles aren't logged — sample them from the chart for the ratio.)
 * Run: node rev_fill_track.js  (optionally append a dated summary to rev_fill_log.csv)
 */
'use strict';
const fs=require('fs'), path=require('path');
const DIR=__dirname, EVENTS=path.join(DIR,'events.csv');
function parseCsv(f){ if(!fs.existsSync(f))return []; const L=fs.readFileSync(f,'utf8').trim().split('\n'); const h=L[0].split(','); return L.slice(1).filter(x=>x).map(line=>{const c=line.match(/("([^"]|"")*"|[^,]*)/g).filter((_,i)=>i%2===0);const o={};h.forEach((k,i)=>o[k]=(c[i]||'').replace(/^"|"$/g,'').replace(/""/g,'"'));return o;}); }
const ev=parseCsv(EVENTS);
const day=iso=>(iso||'').slice(0,10);                         // UTC date ~ ET trading date for RTH
const revEntries=ev.filter(e=>e.strat==='rev' && e.action==='entry');
const revCloses =ev.filter(e=>e.strat==='rev' && e.action==='close');
const byDay={};
for(const e of revEntries){ const d=day(e.recv_iso); byDay[d]=(byDay[d]||0)+1; }
console.log('=== Reversion LIVE fills by day (from events.csv) ===');
const days=Object.keys(byDay).sort();
if(!days.length) console.log('  (no reversion fills logged yet)');
for(const d of days) console.log(`  ${d}:  ${byDay[d]} fill(s)`);
console.log(`\n  total reversion fills: ${revEntries.length}   closes: ${revCloses.length}`);
console.log('  Backtest expectation ~6 signals/day at IDEALIZED fills — compare live fills to a chart signal-count for the true fill rate.');
