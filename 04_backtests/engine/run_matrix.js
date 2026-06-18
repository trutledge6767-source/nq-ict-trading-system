#!/usr/bin/env node
// Run a set of param configs against one data file and print a compact comparison.
// Usage: node run_matrix.js <dataFile.json>
'use strict';
const path=require('path');
const {run,DEF}=require('./backtest.js');
const fs=require('fs');
const file=process.argv[2];
const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));
const D={tf:data.tf, tz:(data.tz_offset_hours!=null?data.tz_offset_hours:null), bars:data.bars};

const configs={
  'baseline(all on)':       {},
  'no-bias':                {useBias:false},
  'no-fib':                 {useFib:false},
  'no-sweep':               {useSweep:false},
  'no-fvg':                 {useFVG:false},
  'no-killzone':            {useKZ:false},
  'raw-MSS-only':           {useBias:false,useFib:false,useSweep:false,useFVG:false,useKZ:false},
  'no-KZ+no-bias':          {useKZ:false,useBias:false},
  'rr1.5':                  {rr:1.5},
  'rr3.0':                  {rr:3.0},
  'sweep+fvg only(noKZ)':   {useKZ:false,useBias:false,useFib:false},
  'baseline+news-blackout': {useNews:true},                 // H4: does news blackout help?
  'baseline+partial+BE':    {usePartial:true},              // adopted risk preset
  'baseline+partial+trail': {usePartial:true,useTrail:true,trailAtrMlt:2.0},
};
const rows=[];
for(const [name,ov] of Object.entries(configs)){
  const P=Object.assign({},DEF,ov);
  const m=run(D,P);
  rows.push({name, trades:m.trades, win:m.winRate, PF:m.profitFactor,
    expR:m.expectancyR, netR:m.netR, maxDD:m.maxDrawdownR, streak:m.maxLosingStreak});
}
// print table
const pad=(s,n)=>String(s).padEnd(n);
const padL=(s,n)=>String(s).padStart(n);
console.log('TF='+data.tf+'  bars='+data.bars.length);
console.log(pad('config',22)+padL('trades',7)+padL('win%',7)+padL('PF',7)+padL('expR',7)+padL('netR',8)+padL('maxDD',8)+padL('lstreak',8));
for(const r of rows){
  console.log(pad(r.name,22)+padL(r.trades,7)+padL(r.win,7)+padL(r.PF===Infinity?'inf':r.PF,7)+padL(r.expR,7)+padL(r.netR,8)+padL(r.maxDD,8)+padL(r.streak,8));
}
console.log('\nJSON:'+JSON.stringify(rows));
