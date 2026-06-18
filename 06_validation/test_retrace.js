const fs=require('fs');
const {walk}=require('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/09_walkforward/walkforward.js');
const {sim}=require('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/10_risk/montecarlo.js');
const {run,DEF}=require('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/04_backtests/engine/backtest.js');
const j=JSON.parse(fs.readFileSync('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/04_backtests/data/NQ_5m_full.json','utf8').replace(/^﻿/,''));
const data={tf:j.tf,tz:0,bars:j.bars};

const configs={
  'RETRACE full ICT stack':            {useRetrace:true},
  'RETRACE full + partial/BE':         {useRetrace:true,usePartial:true},
  'RETRACE no-KZ':                     {useRetrace:true,useKZ:false},
  'RETRACE no-KZ + partial/BE':        {useRetrace:true,useKZ:false,usePartial:true},
  'RETRACE no-KZ,no-bias':             {useRetrace:true,useKZ:false,useBias:false},
};
for(const [name,base] of Object.entries(configs)){
  const full=run(data,Object.assign({},DEF,base,{maxTradesD:99,dailyLossR:99}));
  let line='  full: '+JSON.stringify({trades:full.trades,win:full.winRate,PF:full.profitFactor,expR:full.expectancyR,netR:full.netR,maxDD:full.maxDrawdownR,streak:full.maxLosingStreak});
  console.log('\n=== '+name+' ===');
  console.log(line);
  if(full.trades>=40){
    const wf=walk(data,5,0.3,base);
    console.log('  WF: '+wf.verdict+' OOStrades='+wf.totalOOStrades+' IS='+wf.meanIS_expR+' OOS='+wf.meanOOS_expR+' degr='+wf.degradation);
    const mc=sim(full.tradeList.map(t=>t.r),{paths:10000,tradesPerPath:60,ruinDD_R:6,targetR:9});
    console.log('  MC: pass='+mc.prob_pass_funded+' ruin='+mc.prob_ruin_before_target+' '+mc.verdict);
  } else { console.log('  (too few trades to walk-forward)'); }
}
