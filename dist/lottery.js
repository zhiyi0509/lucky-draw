/* 會員大會抽獎規則。抽獎及預留號碼共用同一個可用號碼池。 */
"use strict";
const Lottery = (() => {
  const catalog = [
    ["維剛","全聯 1,000 元禮券",100,"份","總額 100,000 元"],
    ["瑞珍","電視機",2,"台",""],
    ["游象進","日本品牌吸塵器",5,"台",""],
    ["洪慧珠","Panasonic 多功能鍋",30,"台",""],
    ["賴國津","益樂多水萃維生素 C",100,"盒",""],
    ["阿昭","iPad",5,"台",""],
    ["胡素華","益樂多藍莓穀物棒",100,"盒",""],
    ["周學文","伊威養生葡萄飲",300,"瓶",""],
    ["楊政達","現金贊助",0,"份","總額 80,000 元"],
    ["劉宗澧","益樂多奇亞籽紫薯穀物飲",100,"盒",""],
    ["黃明泰","現金贊助",0,"份","總額 100,000 元"],
    ["趙翠慧","iPhone 18 手機",2,"台",""],
    ["陳順章","現金贊助",0,"份","總額 100,000 元"],
    ["黃敏惠","全聯禮券",0,"份","總額 30,000 元"],
    ["朱唐妹","海能量水果清潔液＋環境清潔液禮盒",30,"份",""]
  ];
  function initial() {
    return {version:1, rev:0, poolText:"", pool:[], selected:0, batch:1, history:[], display:"ready",
      prizes:catalog.map(([sponsor,name,qty,unit,note]) => ({sponsor,name,qty,unit,note,mode:"live",queue:[]}))};
  }
  function requireValue(ok, msg) { if (!ok) throw Error(msg); }
  function parseNumbers(text) {
    const tokens=text.normalize("NFKC").trim().split(/[\s,、，;；]+/u).filter(Boolean);
    const seen=new Set();
    for (const token of tokens) {
      const m=/^(\d{1,6})(?:[-~～–](\d{1,6}))?$/.exec(token);
      requireValue(m,"請使用數字、逗號或連續區間，例如 1-300, 305。");
      const start=Number(m[1]), end=Number(m[2] ?? m[1]);
      requireValue(start>0 && end>=start,"號碼須為 1 至 999999，區間結尾須大於或等於起點。");
      requireValue(seen.size+end-start+1<=100000,"單場最多可設定 100,000 個號碼。");
      for(let n=start;n<=end;n++){requireValue(!seen.has(n),"號碼重複："+n);seen.add(n);}
    }
    return [...seen];
  }
  function used(s) {return new Set(s.history.flatMap(r=>r.numbers));}
  function remaining(s,id) {return s.prizes[id].qty - s.history.filter(r=>r.id===id).reduce((a,r)=>a+r.numbers.length,0);}
  function available(s,except=-1) {
    const excluded=used(s);
    s.prizes.forEach((p,i)=>{if(i!==except)p.queue.forEach(n=>excluded.add(n));});
    return s.pool.filter(n=>!excluded.has(n));
  }
  function randomBelow(n) {
    const word=new Uint32Array(1), limit=0x100000000-(0x100000000%n);
    do { crypto.getRandomValues(word); } while(word[0]>=limit);
    return word[0]%n;
  }
  function sample(list,count) {
    requireValue(Number.isSafeInteger(count)&&count>0&&count<=list.length,"可抽號碼不足，請檢查號碼池、預留號碼與本輪名額。");
    const pool=list.slice();
    for(let i=0;i<count;i++){const j=i+randomBelow(pool.length-i);[pool[i],pool[j]]=[pool[j],pool[i]];}
    return pool.slice(0,count);
  }
  function setPool(s,text) {
    const pool=parseNumbers(text), allowed=new Set(pool);
    requireValue(pool.length,"請先輸入本次參加摸彩的號碼。");
    const protectedNumbers=[...used(s),...s.prizes.flatMap(p=>p.queue)];
    requireValue(protectedNumbers.every(n=>allowed.has(n)),"號碼池須保留已中獎及已預留的號碼。");
    s.pool=pool;s.poolText=text.trim();s.display="ready";
  }
  function configure(s,id,draft) {
    const p=s.prizes[id], awarded=p.qty-remaining(s,id);
    requireValue(draft.name.trim() && draft.sponsor.trim(),"請填寫獎品及贊助者名稱。");
    requireValue(Number.isSafeInteger(draft.qty)&&draft.qty>=awarded&&draft.qty>=0&&draft.qty<=100000,"請確認總名額，不能少於已抽出的名額。");
    const queue=draft.mode==="preset"?parseNumbers(draft.queueText):[];
    requireValue(queue.length<=draft.qty-awarded,"預設號碼數量超過剩餘獎項名額。");
    const free=new Set(available(s,id));
    requireValue(queue.every(n=>free.has(n)),"預設號碼須在有效號碼池內，且不能已中獎或被其他獎項預留。");
    Object.assign(p,{name:draft.name.trim(),sponsor:draft.sponsor.trim(),qty:draft.qty,mode:draft.mode,queue});
    s.display="ready";
  }
  function draw(s,now=Date.now()) {
    const id=s.selected,p=s.prizes[id],count=s.batch;
    requireValue(s.pool.length,"請先在「活動設定」儲存參加摸彩的號碼。");
    requireValue(Number.isInteger(count)&&count>=1&&count<=remaining(s,id),"本輪名額超過可抽份數，請調整名額或選擇其他獎項。");
    let numbers;
    if(p.mode==="preset"){
      requireValue(p.queue.length>=count,"本獎項預設號碼不足，請至活動設定補齊或調整本輪名額。");
      numbers=p.queue.splice(0,count);
    } else { numbers=sample(available(s),count); }
    const r={id,name:p.name,sponsor:p.sponsor,mode:p.mode,numbers,time:now,round:s.history.length+1};
    s.history.push(r);s.display="result";return r;
  }
  return {initial,parseNumbers,remaining,available,sample,setPool,configure,draw};
})();
if (typeof module!=="undefined") module.exports=Lottery;
