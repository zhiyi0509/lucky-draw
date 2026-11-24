"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const L=require("./dist/lottery.js");
function setup(){const s=L.initial();L.setPool(s,"1-1000");return s;}
function preset(s,id,text){const p=s.prizes[id];L.configure(s,id,{...p,mode:"preset",queueText:text});}
test("15 筆贊助，已知名額 774，四筆待分配",()=>{
 const s=L.initial();assert.equal(s.prizes.length,15);assert.deepEqual(s.prizes.flatMap((p,i)=>p.qty===0?[i+1]:[]),[9,11,13,14]);assert.equal(s.prizes.reduce((n,p)=>n+p.qty,0),774);
});
test("解析非連號、全形數字、前置零與重疊區間",()=>{
 assert.deepEqual(L.parseNumbers("０００１-003、8, 11"),[1,2,3,8,11]);
 for(const value of ["0","3-1","1-3,2","1.5","1000000","1-100001"])assert.throws(()=>L.parseNumbers(value));
});
test("跨獎項預留、同獎項順序揭曉、重新載入後續抽",()=>{
 const s=setup();preset(s,1,"0017,23");s.batch=100;
 assert.ok(L.draw(s).numbers.every(n=>n!==17&&n!==23));
 const restored=JSON.parse(JSON.stringify(s));restored.selected=1;restored.batch=1;
 assert.deepEqual(L.draw(restored).numbers,[17]);assert.deepEqual(L.draw(restored).numbers,[23]);assert.throws(()=>L.draw(restored));assert.equal(L.remaining(restored,1),0);
});
test("重複、越界、撤掉預留號、預設不足均阻擋",()=>{
 const s=setup();preset(s,1,"18");s.selected=1;s.batch=2;
 assert.throws(()=>L.draw(s));assert.deepEqual(s.prizes[1].queue,[18]);assert.equal(s.history.length,0);
 assert.throws(()=>preset(s,2,"18"));assert.throws(()=>preset(s,2,"1001"));assert.throws(()=>L.setPool(s,"1-10"));
});
test("釋出預留、已中獎與名額不可回溯、待確認獎不可抽",()=>{
 const s=setup();preset(s,1,"3");L.configure(s,1,{...s.prizes[1],mode:"live",queueText:""});preset(s,2,"3");
 s.selected=2;assert.deepEqual(L.draw(s).numbers,[3]);assert.throws(()=>preset(s,1,"3"));assert.throws(()=>L.configure(s,2,{...s.prizes[2],qty:0,queueText:""}));s.selected=8;assert.throws(()=>L.draw(s));
});
test("批次抽完 774 份後全場號碼唯一、庫存歸零",()=>{
 const s=setup();L.setPool(s,"1-774");
 for(const [id,p] of s.prizes.entries()){if(p.qty){s.selected=id;s.batch=p.qty;L.draw(s);assert.equal(L.remaining(s,id),0);}}
 assert.equal(L.available(s).length,0);assert.equal(new Set(s.history.flatMap(r=>r.numbers)).size,774);
});
test("號碼不足、空號碼池、無效批次、隨機預設無重號",()=>{
 const s=L.initial();assert.throws(()=>L.draw(s));L.setPool(s,"1-3");s.batch=4;assert.throws(()=>L.draw(s));assert.throws(()=>L.setPool(s,""));
 for(const n of [0,-1,1.5]){s.batch=n;assert.throws(()=>L.draw(s));}
 const a=L.sample(s.pool,3);assert.equal(new Set(a).size,3);preset(s,0,a.join(","));s.batch=3;assert.deepEqual(L.draw(s).numbers,a);
});

test("新增與刪除獎項不改變歷史歸屬，未使用的預留號可以再抽",()=>{
 const s=setup();preset(s,1,"17,18");s.selected=1;L.draw(s);
 L.removePrize(s,1);
 assert.ok(!L.activeIds(s).includes(1));assert.ok(L.available(s).includes(18));assert.ok(!L.available(s).includes(17));
 const id=L.savePrize(s,-1,{name:"新獎項",sponsor:"大會",qty:2,mode:"preset",queueText:"18"});
 assert.equal(id,15);assert.equal(s.history[0].name,"電視機");assert.equal(L.remaining(s,id),2);
 L.savePrize(s,id,{name:"新禮盒",sponsor:"協會",qty:1,mode:"preset",queueText:"18"});s.selected=id;
 assert.deepEqual(L.drawRound(s,s.rev,1).numbers,[18]);assert.equal(s.history.at(-1).name,"新禮盒");
});
test("可刪除最後一項後再新增；失敗的新增不留下空獎項",()=>{
 const s=setup();for(const id of L.activeIds(s))L.removePrize(s,id);
 assert.equal(s.selected,-1);assert.throws(()=>L.draw(s));
 assert.throws(()=>L.savePrize(s,-1,{name:"",sponsor:"",qty:1,mode:"live"}));assert.equal(s.prizes.length,15);
 const id=L.savePrize(s,-1,{name:"摸彩",sponsor:"大會",qty:1,mode:"live"});assert.equal(s.selected,id);
});
test("主控及投影的開獎請求共用輪次與名額檢查，300 號一次開出",()=>{
 const s=setup();s.selected=7;const rev=s.rev;
 const r=L.drawRound(s,rev,300);s.rev++;
 assert.equal(r.numbers.length,300);assert.throws(()=>L.drawRound(s,rev,300));assert.equal(s.history.length,1);
});
test("尾數可含 0、多個數字及全形輸入，排除保留與歷史中獎號碼",()=>{
 const s=L.initial();L.setPool(s,"1-30");preset(s,1,"20");
 preset(s,2,"11");s.selected=2;L.draw(s);
 const draft={name:"尾數獎",sponsor:"大會",qty:10,mode:"ending",endingText:"０、１，0"};
 L.savePrize(s,0,draft);s.selected=0;s.batch=4;
 const r=L.draw(s);assert.deepEqual([...r.numbers].sort((a,b)=>a-b),[1,10,21,30]);
 assert.deepEqual(r.endings,[0,1]);assert.equal(r.mode,"ending");
 L.savePrize(s,0,{...draft,endingText:"5"});assert.deepEqual(r.endings,[0,1]);
});
test("尾數條件不足與無效規則均不異動已儲存資料",()=>{
 const s=setup();const draft={name:"尾數獎",sponsor:"大會",qty:100,mode:"ending",endingText:"0"};
 L.setPool(s,"1-12");L.savePrize(s,0,draft);s.batch=2;
 const before=JSON.stringify(s);assert.throws(()=>L.draw(s),/剩 1 個/);assert.equal(JSON.stringify(s),before);
 for(const endingText of ["","10","-1","三",", ,"])assert.throws(()=>L.savePrize(s,0,{...draft,endingText}));
 assert.equal(JSON.stringify(s),before);
});
test("四種抽法跨獎項及輪次共用已中獎券號，重載後仍然排除",()=>{
 const s=L.initial();L.setPool(s,"7,17,27,72,77,88,127");
 preset(s,1,"77");s.selected=1;assert.deepEqual(L.draw(s).numbers,[77]);
 const rule={name:"數字獎",sponsor:"大會",qty:10,mode:"ending",endingText:"27",digitPlace:"lastTwo"};
 L.savePrize(s,0,rule);s.selected=0;s.batch=2;
 const tens=L.draw(s);assert.deepEqual([...tens.numbers].sort((a,b)=>a-b),[27,127]);
 const saved=JSON.parse(JSON.stringify(s));
 L.savePrize(saved,2,{...rule,endingText:"7",digitPlace:"ones"});saved.selected=2;
 assert.deepEqual([...L.draw(saved).numbers].sort((a,b)=>a-b),[7,17]);
 saved.selected=3;assert.deepEqual([...L.draw(saved).numbers].sort((a,b)=>a-b),[72,88]);
 assert.throws(()=>preset(saved,1,"127"));assert.throws(()=>L.draw(saved));
 const all=saved.history.flatMap(r=>r.numbers);assert.equal(new Set(all).size,all.length);
 assert.equal(tens.digitPlace,"lastTwo");
});
test("末兩碼支援 00、07 及前置零，舊末一碼規則仍可使用",()=>{
 const s=L.initial();L.setPool(s,"7,17,70,100,107");
 const draft={name:"尾數獎",sponsor:"大會",qty:10,mode:"ending",endingText:"00、０７",digitPlace:"lastTwo"};
 L.savePrize(s,0,draft);s.batch=3;
 assert.deepEqual([...L.draw(s).numbers].sort((a,b)=>a-b),[7,100,107]);
 delete s.prizes[0].digitPlace;s.prizes[0].endings=[7];s.batch=1;const legacy=L.draw(s);
 assert.deepEqual(legacy.numbers,[17]);assert.equal(legacy.digitPlace,"ones");
});
test("指定 89 完整比對末兩碼；位於開頭或中間的 89 不符合",()=>{
 const s=L.initial();L.setPool(s,"89,1789,8912,1892,1799,1780,189");
 const rule={name:"末兩碼",sponsor:"大會",qty:10,mode:"ending",endingText:"89",digitPlace:"lastTwo"};
 L.savePrize(s,0,rule);s.batch=3;
 assert.deepEqual(L.draw(s).numbers.sort((a,b)=>a-b),[89,189,1789]);
 for(const endingText of ["9","089","-1","8,9"])assert.throws(()=>L.savePrize(s,0,{...rule,endingText}));
 assert.throws(()=>L.draw(s));assert.equal(s.history.length,1);
});
test("既有十位數規則須指定末兩碼後才能開獎，舊紀錄保留",()=>{
 const s=setup();Object.assign(s.prizes[0],{mode:"ending",digitPlace:"tens",endings:[8]});
 const before=JSON.stringify(s);assert.throws(()=>L.draw(s),/重新|填寫/);assert.equal(JSON.stringify(s),before);
});
test("已中獎或同一批重複的舊預設名單不會再開出",()=>{
 const s=setup();preset(s,1,"7");s.selected=1;L.draw(s);s.selected=0;s.batch=2;
 for(const queue of [[7,10],[10,10]]){
   Object.assign(s.prizes[0],{mode:"preset",queue});const before=JSON.stringify(s);
   assert.throws(()=>L.draw(s),/重複/);assert.equal(JSON.stringify(s),before);
 }
});
