#!/usr/bin/env node
/* =====================================================================
 * News blackout filter (Phase 2). Pure, deterministic, non-repainting
 * (depends only on the bar's own timestamp + a static schedule/list).
 *
 * inBlackout(barTimeSec, cfg) -> {blocked:bool, tier, reason}
 * cfg = {
 *   tzOffsetHours:-4,
 *   recurring:true,                 // enable 08:30/10:00 weekday windows
 *   recurringDef:[ {hhmm:"08:30",pre:3,post:15,tier:"HIGH",days:[1,2,3,4,5]},
 *                  {hhmm:"10:00",pre:2,post:10,tier:"MEDIUM",days:[1,2,3,4,5]} ],
 *   events:[ {time:<sec>,pre:10,post:60,tier:"EXTREME",label:"FOMC"} ]  // explicit dates
 * }
 * ===================================================================== */
'use strict';
const fs=require('fs');

const DEFAULT_RECURRING=[
  {hhmm:"08:30", pre:3,  post:15, tier:"HIGH",   days:[1,2,3,4,5]}, // BLS/Census 08:30 cluster
  {hhmm:"10:00", pre:2,  post:10, tier:"MEDIUM", days:[1,2,3,4,5]}  // ISM / ConsConf / JOLTS
];

function etParts(sec,off){ const d=new Date((sec+off*3600)*1000);
  return {dow:d.getUTCDay(), h:d.getUTCHours(), m:d.getUTCMinutes()}; }

function inBlackout(barTimeSec, cfg){
  cfg=cfg||{}; const off=cfg.tzOffsetHours!=null?cfg.tzOffsetHours:-4;
  // explicit dated events (highest priority)
  if(cfg.events) for(const e of cfg.events){
    const start=e.time-(e.pre||5)*60, end=e.time+(e.post||30)*60;
    if(barTimeSec>=start && barTimeSec<=end)
      return {blocked:true, tier:e.tier||'EXTREME', reason:(e.label||'event')};
  }
  // recurring time-of-day windows
  if(cfg.recurring!==false){
    const defs=cfg.recurringDef||DEFAULT_RECURRING;
    const p=etParts(barTimeSec,off);
    const nowMin=p.h*60+p.m;
    for(const w of defs){
      if(w.days && !w.days.includes(p.dow)) continue;
      const [H,M]=w.hhmm.split(':').map(Number); const evMin=H*60+M;
      if(nowMin>=evMin-(w.pre||0) && nowMin<=evMin+(w.post||0))
        return {blocked:true, tier:w.tier||'HIGH', reason:'recurring '+w.hhmm};
    }
  }
  return {blocked:false};
}

function selftest(){
  const off=-4;
  const mk=(y,mo,d,h,mi)=> Math.floor(Date.UTC(y,mo,d,h-off,mi,0)/1000); // ET -> epoch
  const cfg={tzOffsetHours:off, recurring:true,
    events:[{time:mk(2026,5,17,14,0), pre:10, post:60, tier:"EXTREME", label:"FOMC"}]};
  const cases=[
    ["Wed 08:31 (CPI window)", mk(2026,5,17,8,31)],
    ["Wed 09:15 (clear)",      mk(2026,5,17,9,15)],
    ["Wed 10:05 (ISM window)", mk(2026,5,17,10,5)],
    ["Wed 14:30 (FOMC presser within event window)", mk(2026,5,17,14,30)],
    ["Wed 16:00 (clear)",      mk(2026,5,17,16,0)],
    ["Sun 08:31 (weekend -> no recurring)", mk(2026,5,14,8,31)]
  ];
  for(const [name,t] of cases) console.log(name+' -> '+JSON.stringify(inBlackout(t,cfg)));
}

if(require.main===module){
  if(process.argv[2]==='--selftest') selftest();
  else if(process.argv[2]){ const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^﻿/,''));
    console.log(JSON.stringify(inBlackout(j.barTimeSec, j.cfg),null,2)); }
  else console.error('usage: node news_filter.js <input.json> | --selftest');
}
module.exports={inBlackout, DEFAULT_RECURRING};
