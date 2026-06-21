#!/usr/bin/env node
/* =====================================================================
 * utc_to_et.js — re-encode a TRUE-UTC engine-format file into the
 * ET-wall-clock convention the engine expects (timestamps stored as if
 * NY local time were UTC, with tz_offset_hours:0). DST-correct per bar
 * via Intl America/New_York, so winter (EST) and summer (EDT) killzones
 * both align — fixing the fixed-offset (-4/-5) error.
 *
 * Usage: node utc_to_et.js <in_utc.json> <out_et.json>
 *        node utc_to_et.js --selftest
 * ===================================================================== */
'use strict';
const fs=require('fs');

// NY UTC-offset (seconds, negative west) at a given UTC epoch, cached hourly.
const _cache=new Map();
const _dtf=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour12:false,
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function nyOffsetSec(epochSec){
  const key=Math.floor(epochSec/3600);
  const hit=_cache.get(key); if(hit!==undefined) return hit;
  const p={}; for(const x of _dtf.formatToParts(new Date(epochSec*1000))) p[x.type]=x.value;
  let hh=+p.hour; if(hh===24) hh=0;
  const asUTC=Date.UTC(+p.year,+p.month-1,+p.day,hh,+p.minute,+p.second);
  const off=Math.round((asUTC-epochSec*1000)/1000);
  _cache.set(key,off); return off;
}

function convert(data){
  const bars=data.bars.map(b=>{ const t=b[0]; return b.length>5 ? [t+nyOffsetSec(t), b[1],b[2],b[3],b[4],b[5]] : [t+nyOffsetSec(t), b[1],b[2],b[3],b[4]]; });
  return {tf:data.tf, tz_offset_hours:0, note:'UTC->ET wall-clock (DST-correct) via utc_to_et.js', bars};
}

function selftest(){
  // 2021-01-15 12:00Z is EST (-5) -> ET hour 07; 2021-07-15 12:00Z is EDT (-4) -> ET hour 08
  const win=Math.floor(Date.UTC(2021,0,15,12,0,0)/1000);
  const sum=Math.floor(Date.UTC(2021,6,15,12,0,0)/1000);
  const r=convert({tf:'1',bars:[[win,1,1,1,1],[sum,2,2,2,2]]});
  const hWin=new Date(r.bars[0][0]*1000).getUTCHours();
  const hSum=new Date(r.bars[1][0]*1000).getUTCHours();
  const ok = hWin===7 && hSum===8 && r.tz_offset_hours===0;
  console.log('utc_to_et selftest:', ok?'PASS':'FAIL', JSON.stringify({hWin,hSum}));
  return ok;
}

if(require.main===module){
  if(process.argv[2]==='--selftest'){ process.exit(selftest()?0:1); }
  else if(process.argv[2]&&process.argv[3]){
    const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    const r=convert(d);
    fs.writeFileSync(process.argv[3], JSON.stringify(r));
    console.log('wrote '+r.bars.length+' ET-encoded bars to '+process.argv[3]+' (tz=0)');
  } else console.error('usage: node utc_to_et.js <in_utc.json> <out_et.json> | --selftest');
}
module.exports={convert, nyOffsetSec};
