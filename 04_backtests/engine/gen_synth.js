const fs=require('fs');
const out=process.argv[2];
let t=Math.floor(Date.UTC(2026,5,1,12,0,0)/1000);
let p=20000; const bars=[];
for(let i=0;i<450;i++){ const o=p; const drift=(Math.sin(i/15)*8)+(Math.random()-0.5)*20;
  const c=o+drift; const h=Math.max(o,c)+Math.random()*10; const l=Math.min(o,c)-Math.random()*10;
  bars.push([t,+o.toFixed(2),+h.toFixed(2),+l.toFixed(2),+c.toFixed(2),Math.floor(Math.random()*500)]);
  p=c; t+=300; }
fs.writeFileSync(out, JSON.stringify({tf:'5',tz_offset_hours:-4,bars}));
console.log('wrote',bars.length,'bars to',out);
