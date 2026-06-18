#!/usr/bin/env node
/* =====================================================================
 * resample.js — aggregate 1-minute engine-format data up to N-minute bars.
 * Makes a single 1m file the source of truth for 5m/15m/60m tests.
 *
 * Bucketing: each output bar covers [k*N, (k+1)*N) minutes of UNIX time
 * (UTC-aligned, which matches how exchanges align intraday candles).
 * O=first, H=max, L=min, C=last of the bucket. Gaps are skipped (no
 * synthetic bars), so session breaks/weekends don't fabricate data.
 *
 * Usage:
 *   node resample.js <in_1m.json> <out.json> <minutes>
 *   node resample.js --selftest
 * in/out are engine format: { tf, tz_offset_hours, bars:[[t,o,h,l,c],...] }
 * ===================================================================== */
'use strict';
const fs=require('fs');

function resample(data, minutes){
  const N=minutes; const sec=N*60;
  const src=data.bars;
  if(!src || !src.length) return {tf:String(N), tz_offset_hours:data.tz_offset_hours, bars:[]};
  const out=[]; let curKey=null, o,h,l,c,bt;
  for(const b of src){
    const [t,bo,bh,bl,bc]=b;
    const key=Math.floor(t/sec);                 // UTC-aligned bucket
    if(key!==curKey){
      if(curKey!==null) out.push([bt,o,h,l,c]);
      curKey=key; bt=key*sec; o=bo; h=bh; l=bl; c=bc;
    } else {
      if(bh>h) h=bh; if(bl<l) l=bl; c=bc;
    }
  }
  if(curKey!==null) out.push([bt,o,h,l,c]);
  return {tf:String(N), tz_offset_hours:data.tz_offset_hours,
    note:'resampled to '+N+'m from 1m source', bars:out};
}

function selftest(){
  // 10 one-minute bars -> resample to 5m => 2 bars; verify OHLC aggregation
  const t0=Math.floor(Date.UTC(2026,5,1,13,0,0)/1000);
  const bars=[];
  for(let i=0;i<10;i++){ const o=100+i, c=o+0.5, h=o+1, l=o-1; bars.push([t0+i*60,o,h,l,c]); }
  const d={tf:'1',tz_offset_hours:-4,bars};
  const r=resample(d,5);
  const b0=r.bars[0], b1=r.bars[1];
  const ok = r.bars.length===2
    && b0[1]===100                 // open = first
    && b0[2]===Math.max(...[0,1,2,3,4].map(i=>101+i))   // high = max of bucket highs (105)
    && b0[3]===99                  // low = min (100-1)
    && b0[4]===104.5               // close = last close in bucket
    && b1[1]===105 && b1[4]===109.5;
  console.log('resample selftest:', ok?'PASS':'FAIL',
    JSON.stringify({nbars:r.bars.length, b0, b1}));
  // gap handling: a missing minute must not fabricate a bar
  const gap={tf:'1',tz_offset_hours:-4,bars:[[t0,1,1,1,1],[t0+600,2,2,2,2]]}; // 10-min gap
  const rg=resample(gap,5);
  console.log('gap selftest:', rg.bars.length===2?'PASS':'FAIL', '(expect 2 buckets, no fill)');
  return ok && rg.bars.length===2;
}

if(require.main===module){
  if(process.argv[2]==='--selftest'){ process.exit(selftest()?0:1); }
  else if(process.argv[2] && process.argv[3] && process.argv[4]){
    const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    const data={tf:d.tf, tz_offset_hours:(d.tz_offset_hours!=null?d.tz_offset_hours:-4), bars:d.bars};
    const r=resample(data, +process.argv[4]);
    fs.writeFileSync(process.argv[3], JSON.stringify(r));
    console.log('wrote '+r.bars.length+' '+process.argv[4]+'m bars to '+process.argv[3]);
  } else console.error('usage: node resample.js <in_1m.json> <out.json> <minutes> | --selftest');
}
module.exports={resample};
