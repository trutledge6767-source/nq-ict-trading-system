#!/usr/bin/env node
/* =====================================================================
 * NQ ICT Offline Backtest Engine — mirrors Pine strategy v0.2 logic.
 * NON-REPAINTING by construction: at bar i, only data[0..i] (and pivots
 * already confirmed by bar i) are used. Orders fill at close[i]; exits
 * evaluated from bar i+1 using that bar's high/low (stop assumed first
 * if both stop & target are touched on the same bar = conservative).
 *
 * Usage:
 *   node backtest.js <dataFile.json> [paramsJson]
 * dataFile format: { "tf":"5", "tz_offset_hours":-4,
 *                    "bars":[[timeSec,o,h,l,c,v], ...] }   (oldest -> newest)
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
let newsFilter=null;
try{ newsFilter=require(path.join(__dirname,'..','..','02_news','news_filter.js')); }catch(e){ /* optional module */ }

// ---------- default params (match Pine v0.2 defaults) ----------
const DEF = {
  useKZ:true, kzStart:7, kzEnd:11,        // ET hours [start,end)
  pivLen:5, seqWin:12,
  useFVG:true, fvgAtrMin:0.20, fvgWin:4,
  useSweep:true, sweepLook:20,
  useFib:true, useBias:true,
  useVolFilter:false, volLookback:100, volMinPct:0.15, volMaxPct:0.90, // trade only mid-vol regimes
  useNews:false, newsCfg:{recurring:true},   // block entries in news windows (uses 02_news/news_filter.js)

  atrLen:14, stopAtrMlt:1.5, rr:2.0,
  usePartial:false, partialFrac:0.5, partialAtR:1.0, // bank partialFrac at +partialAtR R, move rest to BE
  useTrail:false, trailAtrMlt:2.0,                   // after partial: ATR-trail runner instead of fixed BE+target
  useRetrace:false, retraceWin:10, retraceFill:0.5,  // v0.6: after MSS, limit-enter on pullback INTO the FVG

  maxTradesD:3, dailyLossR:2.0,
  pointValue:20.0, commissionPerContract:2.10, slippagePts:0.5,
  tzOffsetHours:-4                         // EDT for June; over/ridden by data file
};

function readJSON(file){ return JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,'')); }
function load(file){ const j=readJSON(file);
  return { tf:j.tf||'?', tz:(j.tz_offset_hours!=null?j.tz_offset_hours:null), bars:j.bars }; }

// ---------- indicator helpers ----------
function rma(arr,len){ // Wilder RMA for ATR
  const out=new Array(arr.length).fill(null); let prev=null;
  for(let i=0;i<arr.length;i++){ const v=arr[i];
    if(i<len-1){ continue; }
    if(prev===null){ let s=0; for(let k=i-len+1;k<=i;k++) s+=arr[k]; prev=s/len; }
    else { prev=(prev*(len-1)+v)/len; }
    out[i]=prev; }
  return out;
}
function computeATR(b,len){
  const tr=b.map((x,i)=> i===0 ? (x[2]-x[3]) :
      Math.max(x[2]-x[3], Math.abs(x[2]-b[i-1][4]), Math.abs(x[3]-b[i-1][4])));
  return rma(tr,len);
}
// confirmed pivots: returns arrays of {idx, price} with confirmIdx = idx+R
function pivots(b,L){
  const ph=[],pl=[];
  for(let i=L;i<b.length-L;i++){
    let isH=true,isL=true;
    for(let k=i-L;k<=i+L;k++){ if(k===i)continue;
      if(b[k][2]>=b[i][2]) isH=false; if(b[k][3]<=b[i][3]) isL=false; }
    if(isH) ph.push({idx:i,confirm:i+L,price:b[i][2]});
    if(isL) pl.push({idx:i,confirm:i+L,price:b[i][3]});
  }
  return {ph,pl};
}
function etDate(sec,off){ const d=new Date((sec+off*3600)*1000);
  return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate(); }
function etHour(sec,off){ return new Date((sec+off*3600)*1000).getUTCHours(); }

// ---------- backtest ----------
function run(data,P){
  const b=data.bars; const off=(data.tz!=null?data.tz:P.tzOffsetHours);
  const n=b.length;
  const atr=computeATR(b,P.atrLen);
  const {ph,pl}=pivots(b,P.pivLen);
  // pointer-based "last confirmed pivot as of bar i"
  let phi=0,pli=0; let lastPH=null,lastPL=null;
  // day grouping for bias
  const dateOf=b.map(x=>etDate(x[0],off));
  const hourOf=b.map(x=>etHour(x[0],off));
  const dayOpen={},dayHi={},dayLo={},order=[];
  for(let i=0;i<n;i++){ const d=dateOf[i];
    if(dayOpen[d]===undefined){ dayOpen[d]=b[i][1]; order.push(d); dayHi[d]=b[i][2]; dayLo[d]=b[i][3]; }
    dayHi[d]=Math.max(dayHi[d],b[i][2]); dayLo[d]=Math.min(dayLo[d],b[i][3]); }
  const prevDateOf={}; for(let k=1;k<order.length;k++) prevDateOf[order[k]]=order[k-1];

  // recency trackers
  let lastSweptLo=-1e9,lastSweptHi=-1e9,lastBullF=-1e9,lastBearF=-1e9;
  // most-recent FVG zone bounds {top,bot} (bullish gap = [bot=high[i-2], top=low[i]])
  let bullFvgTop=NaN,bullFvgBot=NaN,bearFvgTop=NaN,bearFvgBot=NaN;
  // v0.6 pending retracement limit order
  let pendDir=0,pendLimit=0,pendStop=0,pendExpiry=-1;
  // trade state
  let pos=0,entry=0,stop=0,tgt=0,entryIdx=0;
  let initRisk=0,partialLvl=0,partialDone=false,remFrac=1,realizedR=0; // partial-profit state
  let hhSince=-1e9,llSince=1e9; // trailing extremes after partial
  const trades=[];
  let tradesToday=0,curDay=null,dayStartR=0,cumR=0;

  for(let i=0;i<n;i++){
    // advance confirmed pivots known by bar i
    while(phi<ph.length && ph[phi].confirm<=i){ lastPH=ph[phi].price; phi++; }
    while(pli<pl.length && pl[pli].confirm<=i){ lastPL=pl[pli].price; pli++; }

    const d=dateOf[i];
    if(d!==curDay){ curDay=d; tradesToday=0; dayStartR=cumR; }

    // ----- manage open position with THIS bar's range (entry was prior bar close) -----
    // Supports partial-profit: bank partialFrac at +partialAtR R, move stop to breakeven, run rest.
    // R is always measured vs INITIAL risk. Conservative intrabar order: STOP first, then partial, then target.
    if(pos!==0 && i>entryIdx){
      const hi=b[i][2],lo=b[i][3];
      const slipR=P.slippagePts/(initRisk||1);
      let exit=null;
      const stopped = pos>0 ? lo<=stop : hi>=stop;
      if(stopped){
        const stopR=(pos>0?(stop-entry):(entry-stop))/(initRisk||1) - slipR;
        realizedR += remFrac*stopR; exit=stop; remFrac=0;
      } else {
        // partial fill (profit side) before target
        if(P.usePartial && !partialDone){
          const pHit = pos>0 ? hi>=partialLvl : lo<=partialLvl;
          if(pHit){
            const pR=P.partialAtR - slipR;
            realizedR += P.partialFrac*pR;
            remFrac -= P.partialFrac;
            partialDone=true; stop=entry;        // move remainder to breakeven
            hhSince=hi; llSince=lo;               // start trailing extremes from here
          }
        }
        // fixed target on remainder (skipped when trailing the runner -> let winners run)
        const useFixedTgt = !(P.useTrail && partialDone);
        const tgtHit = pos>0 ? hi>=tgt : lo<=tgt;
        if(useFixedTgt && tgtHit){
          const tR=P.rr - slipR;
          realizedR += remFrac*tR; exit=tgt; remFrac=0;
        }
        // ATR trailing-stop on runner (ratchets only in the favorable direction)
        if(P.useTrail && partialDone && remFrac>1e-9){
          hhSince=Math.max(hhSince,hi); llSince=Math.min(llSince,lo);
          const tr = pos>0 ? hhSince - P.trailAtrMlt*atr[i] : llSince + P.trailAtrMlt*atr[i];
          stop = pos>0 ? Math.max(stop,tr) : Math.min(stop,tr);
        }
      }
      if(remFrac<=1e-9){ // fully closed
        const dollars=realizedR*(initRisk||0)*P.pointValue - 2*P.commissionPerContract*(partialDone?1.5:1);
        cumR+=realizedR;
        trades.push({dir:pos>0?'L':'S',entry,exit:(exit!=null?exit:entry),stop,risk:initRisk,
          r:realizedR,dollars, barsHeld:i-entryIdx, entryTime:b[entryIdx][0], exitTime:b[i][0]});
        pos=0;
      }
    }

    // ----- v0.6 pending retracement limit order: fill / invalidate / expire (causal) -----
    if(P.useRetrace && pos===0 && pendDir!==0){
      const hi=b[i][2],lo=b[i][3];
      if(i>pendExpiry){ pendDir=0; }                                  // expired unfilled
      else if(pendDir>0){
        if(lo<=pendStop){ pendDir=0; }                                // FVG invalidated before fill
        else if(lo<=pendLimit){                                       // pulled back into FVG -> fill long
          const fill = b[i][1]<=pendLimit ? b[i][1] : pendLimit;      // gap-through fills at open
          const risk = fill-pendStop;
          if(risk>0){ pos=1;entry=fill;stop=pendStop;tgt=fill+P.rr*risk;entryIdx=i;tradesToday++;
            initRisk=risk;partialLvl=fill+P.partialAtR*risk;partialDone=false;remFrac=1;realizedR=0;hhSince=-1e9;llSince=1e9; }
          pendDir=0;
        }
      } else {                                                        // pendDir<0 short
        if(hi>=pendStop){ pendDir=0; }
        else if(hi>=pendLimit){
          const fill = b[i][1]>=pendLimit ? b[i][1] : pendLimit;
          const risk = pendStop-fill;
          if(risk>0){ pos=-1;entry=fill;stop=pendStop;tgt=fill-P.rr*risk;entryIdx=i;tradesToday++;
            initRisk=risk;partialLvl=fill-P.partialAtR*risk;partialDone=false;remFrac=1;realizedR=0;hhSince=-1e9;llSince=1e9; }
          pendDir=0;
        }
      }
    }

    // need atr & enough history
    if(atr[i]==null || i<Math.max(P.sweepLook+2,P.atrLen+2,P.pivLen*2+2)) continue;

    // ----- features at bar i (known at close) -----
    const o=b[i][1],h=b[i][2],l=b[i][3],c=b[i][4],a=atr[i];
    // killzone
    const inKZ = !P.useKZ || (hourOf[i]>=P.kzStart && hourOf[i]<P.kzEnd);
    // bias
    let biasLong=true,biasShort=true;
    if(P.useBias){ const pd=prevDateOf[d];
      const dop=dayOpen[d]; const pH=pd?dayHi[pd]:null,pL=pd?dayLo[pd]:null;
      if(pd){ biasLong=(c>dop && c>pL); biasShort=(c<dop && c<pH); }
      else { biasLong=biasShort=false; } // no prior day -> no bias-based trade
    }
    // fib dealing range
    let rngHi=-Infinity,rngLo=Infinity;
    for(let k=i-P.sweepLook+1;k<=i;k++){ if(b[k][2]>rngHi)rngHi=b[k][2]; if(b[k][3]<rngLo)rngLo=b[k][3]; }
    const fibMid=(rngHi+rngLo)/2; const inDisc=c<fibMid, inPrem=c>fibMid;
    // FVG (3-bar) + record zone bounds for retracement entries
    if(l>b[i-2][2] && (l-b[i-2][2])>=P.fvgAtrMin*a){ lastBullF=i; bullFvgBot=b[i-2][2]; bullFvgTop=l; }
    if(h<b[i-2][3] && (b[i-2][3]-h)>=P.fvgAtrMin*a){ lastBearF=i; bearFvgTop=b[i-2][3]; bearFvgBot=h; }
    // sweep
    let pHi=-Infinity,pLo=Infinity;
    for(let k=i-P.sweepLook;k<=i-1;k++){ if(b[k][2]>pHi)pHi=b[k][2]; if(b[k][3]<pLo)pLo=b[k][3]; }
    if(h>pHi && c<pHi) lastSweptHi=i;
    if(l<pLo && c>pLo) lastSweptLo=i;
    // MSS events
    const mssUp   = lastPH!=null && c>lastPH && b[i-1][4]<=lastPH;
    const mssDown = lastPL!=null && c<lastPL && b[i-1][4]>=lastPL;
    // recency
    const sweepLoRec=(i-lastSweptLo)<=P.seqWin, sweepHiRec=(i-lastSweptHi)<=P.seqWin;
    const bullFRec=(i-lastBullF)<=P.fvgWin,     bearFRec=(i-lastBearF)<=P.fvgWin;

    // volatility-regime filter: ATR percentile-rank over volLookback must be mid-band
    let volOK=true;
    if(P.useVolFilter && i>=P.volLookback){
      let le=0; for(let k=i-P.volLookback+1;k<=i;k++){ if(atr[k]!=null && atr[k]<=a) le++; }
      const pr=le/P.volLookback;
      volOK = pr>=P.volMinPct && pr<=P.volMaxPct;
    }

    // news blackout (optional; uses 02_news/news_filter.js if present)
    let newsOK=true;
    if(P.useNews && newsFilter){
      const cfg=Object.assign({tzOffsetHours:off}, P.newsCfg||{});
      newsOK = !newsFilter.inBlackout(b[i][0], cfg).blocked;
    }

    // base signal (no fib gate). In RETRACE mode the pullback into the FVG provides discount/premium,
    // so fib is NOT applied at the breakout bar (which is by nature premium/discount-inverted).
    const baseLong  = volOK && newsOK && biasLong  && inKZ && mssUp   && (!P.useSweep||sweepLoRec) && (!P.useFVG||bullFRec);
    const baseShort = volOK && newsOK && biasShort && inKZ && mssDown && (!P.useSweep||sweepHiRec) && (!P.useFVG||bearFRec);
    const longSig  = baseLong  && (!P.useFib||inDisc);
    const shortSig = baseShort && (!P.useFib||inPrem);
    const armLong  = P.useRetrace ? baseLong  : longSig;
    const armShort = P.useRetrace ? baseShort : shortSig;

    // ----- risk governor -----
    const dayLossHit=(cumR-dayStartR)<=-P.dailyLossR;
    const canTrade=tradesToday<P.maxTradesD && !dayLossHit;

    if(pos===0 && canTrade){
      if(P.useRetrace){
        // v0.6: ARM a pending limit at the displacement FVG (fill only on pullback INTO it = discount)
        if(armLong && !isNaN(bullFvgTop) && bullFvgTop>bullFvgBot){
          pendDir=1; pendLimit=bullFvgBot + P.retraceFill*(bullFvgTop-bullFvgBot);
          pendStop=bullFvgBot - P.stopAtrMlt*a; pendExpiry=i+P.retraceWin;
        } else if(armShort && !isNaN(bearFvgTop) && bearFvgTop>bearFvgBot){
          pendDir=-1; pendLimit=bearFvgTop - P.retraceFill*(bearFvgTop-bearFvgBot);
          pendStop=bearFvgTop + P.stopAtrMlt*a; pendExpiry=i+P.retraceWin;
        }
      } else {
        if(longSig){ const s=Math.min(l,b[i-1][3])-P.stopAtrMlt*a; const risk=c-s;
          if(risk>0){ pos=1;entry=c;stop=s;tgt=c+P.rr*risk;entryIdx=i;tradesToday++;
            initRisk=risk;partialLvl=c+P.partialAtR*risk;partialDone=false;remFrac=1;realizedR=0;hhSince=-1e9;llSince=1e9; } }
        else if(shortSig){ const s=Math.max(h,b[i-1][2])+P.stopAtrMlt*a; const risk=s-c;
          if(risk>0){ pos=-1;entry=c;stop=s;tgt=c-P.rr*risk;entryIdx=i;tradesToday++;
            initRisk=risk;partialLvl=c-P.partialAtR*risk;partialDone=false;remFrac=1;realizedR=0;hhSince=-1e9;llSince=1e9; } }
      }
    }
  }
  return metrics(trades,data,P,n);
}

function metrics(tr,data,P,nbars){
  const N=tr.length;
  const wins=tr.filter(t=>t.r>0), losses=tr.filter(t=>t.r<=0);
  const gW=wins.reduce((s,t)=>s+t.r,0), gL=Math.abs(losses.reduce((s,t)=>s+t.r,0));
  const net=tr.reduce((s,t)=>s+t.r,0), netUsd=tr.reduce((s,t)=>s+t.dollars,0);
  // equity curve in R + max drawdown
  let peak=0,cum=0,maxDD=0;
  for(const t of tr){ cum+=t.r; peak=Math.max(peak,cum); maxDD=Math.min(maxDD,cum-peak); }
  // streak
  let curL=0,maxL=0; for(const t of tr){ if(t.r<=0){curL++;maxL=Math.max(maxL,curL);} else curL=0; }
  const mean=N?net/N:0;
  const sd=N?Math.sqrt(tr.reduce((s,t)=>s+(t.r-mean)**2,0)/N):0;
  const r=v=>Math.round(v*100)/100;
  return {
    tf:data.tf, bars:nbars, params:P,
    trades:N, wins:wins.length, losses:losses.length,
    winRate: N? r(100*wins.length/N):0,
    profitFactor: gL>0? r(gW/gL): (gW>0?Infinity:0),
    netR: r(net), netUSD: Math.round(netUsd),
    expectancyR: r(mean),
    avgWinR: wins.length? r(gW/wins.length):0,
    avgLossR: losses.length? r(-gL/losses.length):0,
    maxDrawdownR: r(maxDD),
    maxLosingStreak: maxL,
    sharpePerTrade: sd>0? r(mean/sd):0,
    avgBarsHeld: N? r(tr.reduce((s,t)=>s+t.barsHeld,0)/N):0,
    tradeList: tr.map(t=>({d:t.dir, entry:t.entry, stop:+t.stop.toFixed(2),
      exit:+t.exit.toFixed(2), r:r(t.r), usd:Math.round(t.dollars),
      bars:t.barsHeld, entryTime:t.entryTime, exitTime:t.exitTime}))
  };
}

// ---------- main ----------
if(require.main===module){
  const file=process.argv[2];
  if(!file){ console.error('usage: node backtest.js <dataFile.json> [paramsJson]'); process.exit(1); }
  // 3rd arg: inline JSON ("{...}") OR a path to a .json params file
  let over={};
  const a3=process.argv[3];
  if(a3){ const txt=(a3.trim().startsWith('{')?a3:fs.readFileSync(a3,'utf8')).replace(/^﻿/,''); over=JSON.parse(txt); }
  const P=Object.assign({},DEF, over);
  const data=load(file);
  const m=run(data,P);
  const {tradeList, ...summary}=m;
  console.log(JSON.stringify(summary,null,2));
}
module.exports={run,DEF};
