const fs=require('fs');
const {walk}=require('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/09_walkforward/walkforward.js');
const {sim}=require('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/10_risk/montecarlo.js');
const {run,DEF}=require('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/04_backtests/engine/backtest.js');
const j=JSON.parse(fs.readFileSync('C:/Users/trutl/OneDrive/Desktop/TRADING BOT/04_backtests/data/NQ_5m_full.json','utf8').replace(/^﻿/,''));
const data={tf:j.tf,tz:(j.tz_offset_hours!=null?j.tz_offset_hours:0),bars:j.bars};

// configs that actually trade enough to validate
const configs={
  'sweep+fvg(noKZ,noBias,noFib)':{useKZ:false,useBias:false,useFib:false},
  'sweep+fvg+partialBE':{useKZ:false,useBias:false,useFib:false,usePartial:true},
};
for(const [name,base] of Object.entries(configs)){
  console.log('\n===== '+name+' =====');
  const wf=walk(data,5,0.3,base);
  console.log('WALK-FORWARD verdict:',wf.verdict,'| OOStrades:',wf.totalOOStrades,
    '| meanIS_expR:',wf.meanIS_expR,'| meanOOS_expR:',wf.meanOOS_expR,'| degradation:',wf.degradation);
  const full=run(data,Object.assign({},DEF,base,{maxTradesD:99,dailyLossR:99}));
  console.log('FULL-period:',JSON.stringify({trades:full.trades,win:full.winRate,PF:full.profitFactor,expR:full.expectancyR,netR:full.netR,maxDD:full.maxDrawdownR,streak:full.maxLosingStreak}));
  const mc=sim(full.tradeList.map(t=>t.r),{paths:10000,tradesPerPath:60,ruinDD_R:6,targetR:9});
  console.log('MonteCarlo: pass_funded',mc.prob_pass_funded,'ruin',mc.prob_ruin_before_target,'verdict',mc.verdict);
}
