#!/usr/bin/env node
/* =====================================================================
 * csv_to_data.js — convert a generic OHLC CSV into the engine's data
 * format { tf, tz_offset_hours, bars:[[t,o,h,l,c], ...] } (oldest->newest).
 *
 * Accepts common exports (TradingView, Barchart, Firstrate, NinjaTrader):
 *   - header auto-detected; columns matched by name (case/space-insensitive)
 *   - time column: unix seconds/ms, or ISO/"YYYY-MM-DD HH:MM(:SS)" datetime
 *   - required: time, open, high, low, close   (volume optional, ignored)
 *
 * Usage:
 *   node csv_to_data.js <in.csv> <out.json> [--tf 5] [--tz -4] [--tzcsv 0]
 *     --tf    timeframe label written into output (default "5")
 *     --tz    tz_offset_hours used by the engine for ET session logic (default -4)
 *     --tzcsv if CSV datetimes are LOCAL with a known UTC offset in hours, give it
 *             so they are converted to epoch correctly (default 0 = treat as UTC)
 * ===================================================================== */
'use strict';
const fs=require('fs');

function arg(flag, def){ const i=process.argv.indexOf(flag); return i>0?process.argv[i+1]:def; }

function parseTime(v, tzcsv){
  v=String(v).trim();
  if(/^\d+$/.test(v)){ let n=+v; if(v.length>=13) n=Math.floor(n/1000); return n; } // unix s or ms
  // US slash format: M/D/YYYY H:MM[:SS]  (parsed as wall-clock -> UTC epoch, DST-agnostic)
  let m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(m){
    const [_,mo,d,y,h,mi,s]=m;
    const ms=Date.UTC(+y,+mo-1,+d,+h,+mi,+(s||0));
    return Math.floor(ms/1000) - (tzcsv||0)*3600;
  }
  // ISO / other datetime string
  let iso=v.replace(' ','T');
  if(!/[zZ]|[+\-]\d\d:?\d\d$/.test(iso)) iso+='Z';            // assume UTC unless offset present
  let ms=Date.parse(iso);
  if(isNaN(ms)) throw new Error('unparseable time: '+v);
  return Math.floor(ms/1000) - (tzcsv||0)*3600;               // shift local->UTC if tzcsv given
}

// pure parser: CSV text -> {tf, tz_offset_hours, bars:[[t,o,h,l,c],...]} (testable)
function parseCSV(raw, opts){
  opts=opts||{}; const tf=opts.tf||'5', tz=(opts.tz!=null?opts.tz:-4), tzcsv=opts.tzcsv||0;
  const lines=raw.replace(/^﻿/,'').trim().split(/\r?\n/).filter(x=>x.length);
  const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const head=lines[0].split(/[,;\t]/).map(norm);
  const find=names=>{ for(const n of names){ const i=head.indexOf(n); if(i>=0) return i; } return -1; };
  // time column: exact match first, else first header containing time/date/timestamp (e.g. "timestamp ET")
  let iT=find(['time','date','datetime','timestamp','unixtime','date_time','tsevent','ts','tsrecv']);
  if(iT<0) iT=head.findIndex(h=>/(timestamp|datetime|^time|^date|unixtime|^ts)/.test(h));
  const iO=find(['open','o']), iH=find(['high','h']), iL=find(['low','l']), iC=find(['close','c','last']);
  const iV=find(['volume','vol','v']);                       // optional; kept as 6th element when present
  if([iT,iO,iH,iL,iC].some(x=>x<0)) throw new Error('missing required column(s). header='+JSON.stringify(head));
  const bars=[];
  for(let k=1;k<lines.length;k++){
    const f=lines[k].split(/[,;\t]/); if(f.length<=iC) continue;
    const t=parseTime(f[iT],tzcsv);
    const o=+f[iO],h=+f[iH],l=+f[iL],c=+f[iC];
    if([o,h,l,c].some(x=>!isFinite(x))) continue;
    const v=iV>=0?(+f[iV]||0):0;
    bars.push([t,o,h,l,c,v]);
  }
  bars.sort((a,b)=>a[0]-b[0]);
  const dedup=[]; for(const b of bars){ if(dedup.length && dedup[dedup.length-1][0]===b[0]) dedup[dedup.length-1]=b; else dedup.push(b); }
  return {tf, tz_offset_hours:tz, bars:dedup};
}

function main(){
  const inf=process.argv[2], outf=process.argv[3];
  if(!inf||!outf){ console.error('usage: node csv_to_data.js <in.csv> <out.json> [--tf 5] [--tz -4] [--tzcsv 0]'); process.exit(1); }
  const tf=arg('--tf','5'), tz=+arg('--tz','-4'), tzcsv=+arg('--tzcsv','0');
  const out=parseCSV(fs.readFileSync(inf,'utf8'), {tf,tz,tzcsv});
  out.note='imported via csv_to_data.js from '+inf;
  fs.writeFileSync(outf, JSON.stringify(out));
  const d=out.bars; const span=d.length>1?((d[d.length-1][0]-d[0][0])/86400).toFixed(1):0;
  console.log('wrote '+d.length+' bars to '+outf+'  (~'+span+' days, tf='+tf+', tz='+tz+')');
}

if(require.main===module) main();
module.exports={parseCSV, parseTime};
