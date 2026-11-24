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
