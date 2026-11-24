"use strict";
const $=id=>document.getElementById(id);
const KEY="blia.assembly.2026.lottery.v1";
const projection=new URLSearchParams(location.search).has("stage");
const format=n=>String(n).padStart(4,"0");
const el=(tag,cls,t)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(t!==undefined)e.textContent=t;return e;};
let state,view="stage",editId=0,editRev=0,noticeTimer,animTimer,pageTimer,page=0,pending=false;
let sound,melody,voiceIndex=0,projector=null;
function sendStage(){
  if(!projector||projector.closed)return;
  const p=state.prizes[state.selected],last=state.history.at(-1);
  const snapshot={selected:0,batch:state.batch,display:state.display,pool:state.pool.length?[1]:[],
    prizes:[{name:p.name,sponsor:p.sponsor,qty:Lottery.remaining(state,state.selected)}],history:[],roundCount:state.history.length};
  if(state.display==="result" && last)snapshot.history=[{id:-1,name:last.name,sponsor:last.sponsor,round:last.round,time:last.time,numbers:last.numbers}];
  projector.postMessage({type:"blia-stage-view",snapshot},location.protocol==="file:"?"*":location.origin);
}
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
function read(){
  const raw=localStorage.getItem(KEY);
  if(!raw)return Lottery.initial();
  const data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.history)||!Array.isArray(data.prizes))throw Error("活動資料無法讀取，請保留此瀏覽器資料。");
  return data;
}
function note(message){const box=$("notice");box.textContent=message;box.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>box.hidden=true,5500);}
function busy(s){return s.display==="result" && Date.now()-(s.history.at(-1)?.time??0)<2300;}
async function change(fn,success){
  if(projection||pending)return false;
  pending=true;
  try{
    if(!navigator.locks)throw Error("請使用 Chrome 或 Edge，以活動網址或 localhost 開啟控制台。");
    await navigator.locks.request(KEY,()=>{
      const fresh=read();
      if(busy(fresh))throw Error("本輪正在揭曉，請稍候。");
      fn(fresh);fresh.rev++;localStorage.setItem(KEY,JSON.stringify(fresh));state=fresh;
    });
    render();if(success)note(success);return true;
  }catch(e){note(e.message);return false;}finally{pending=false;}
}
function show(v){
  if(projection)return;
  view=v;for(const id of ["stage","settings","history"])$(id).hidden=id!==v;
  document.querySelectorAll("[data-view]").forEach(b=>{const active=b.dataset.view===v;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");});
  if(v==="settings"){editId=state.selected;loadSettings();}
  if(v==="history")historyView();
}
function loadSettings(){
  editRev=state.rev;$("pool").value=state.poolText;
  $("poolCount").textContent="已儲存 "+state.pool.length.toLocaleString()+" 個有效號碼";
  $("pick").replaceChildren(...state.prizes.map((p,i)=>{const o=el("option","",String(i+1).padStart(2,"0")+"　"+p.sponsor+"｜"+p.name);o.value=i;return o;}));
  $("pick").value=editId;loadPrize();
}
function loadPrize(){
  const p=state.prizes[editId];
  $("prizeName").value=p.name;$("sponsor").value=p.sponsor;$("quantity").value=p.qty;$("mode").value=p.mode;
  $("queue").value=p.queue.map(format).join(", ");$("generateCount").value=1;$("presets").hidden=p.mode!=="preset";
  $("note").textContent=[p.note,p.qty?"已配置 "+p.qty+" 個名額":"名額待確認"].filter(Boolean).join(" ｜ ");
}
function revision(s){if(s.rev!==editRev)throw Error("另一個操作已更新活動，請重新開啟活動設定後再儲存。");}
function list(){
  const area=$("prizes");
  area.replaceChildren(...state.prizes.map((p,i)=>{
    const b=el("button","item"+(i===state.selected?" current":""));b.type="button";b.setAttribute("aria-pressed",String(i===state.selected));
    b.append(el("span","index",String(i+1).padStart(2,"0")));
    const t=el("span");t.append(el("strong","",p.name),el("small","",p.sponsor+" 贊助　·　"+(p.qty?"剩 "+Lottery.remaining(state,i)+" / "+p.qty:"名額待確認")));b.append(t);
    b.onclick=()=>change(s=>{s.selected=i;s.batch=1;s.display="ready";});return b;
  }));
}
function resultPage(r){
  const pages=Math.ceil(r.numbers.length/8);page=(page+pages)%pages;
  const slice=r.numbers.slice(page*8,page*8+8);
  $("numbers").className="results";$("numbers").replaceChildren(...slice.map(n=>el("span","winner"+(r.numbers.length===1?" only":""),format(n))));
  $("pages").hidden=pages<2;$("pageText").textContent=(page+1)+" / "+pages;
  $("stageStatus").textContent="恭喜中獎　·　本輪共 "+r.numbers.length+" 位";
}
function tickets(chars){
  $("numbers").className="";$("numbers").replaceChildren(...Array.from(chars,c=>el("span","ticket",c)));
}
function renderStage(){
  clearInterval(animTimer);clearInterval(pageTimer);page=0;
  const p=state.prizes[state.selected],r=state.history.at(-1),result=state.display==="result"&&r;
  $("round").textContent="第 "+String(result?r.round:(state.roundCount??state.history.length)+1).padStart(2,"0")+" 輪";
  $("onPrize").textContent=(result?r.name:p.name)+"　·　"+(result?r.sponsor:p.sponsor)+" 贊助";
  $("current").textContent=p.name;$("balance").textContent=p.qty?"本獎項尚餘 "+Lottery.remaining(state,state.selected)+" 個名額":"名額待確認";
  $("batch").value=state.batch;$("pages").hidden=true;
  $("draw").disabled=!state.pool.length||Lottery.remaining(state,state.selected)<1;
  if(!result){
    tickets("––––");$("stageStatus").textContent=!state.pool.length?(projection?"敬候開獎":"請先至活動設定輸入摸彩號碼"):!p.qty?"獎項名額待確認":Lottery.remaining(state,state.selected)===0?"本獎項已抽畢":"準備開獎";return;
  }
  const finish=()=>{clearInterval(animTimer);resultPage(r);$("draw").disabled=Lottery.remaining(state,state.selected)<1;if(r.numbers.length>8)pageTimer=setInterval(()=>{page++;resultPage(r);},7000);};
  if(!busy(state)){finish();return;}
  $("draw").disabled=true;$("stageStatus").textContent="祝福揭曉中";
  const tick=()=>{if(!busy(state)){finish();return;}tickets(reduced?"✦✦✦✦":String(Math.floor(Math.random()*10000)).padStart(4,"0"));};
  tick();animTimer=setInterval(tick,reduced?300:95);
}
function historyView(){
  const rs=state.history, total=rs.reduce((a,r)=>a+r.numbers.length,0);
  $("historyCount").textContent=rs.length?"已完成 "+rs.length+" 輪，共 "+total+" 個中獎號碼。":"尚無中獎紀錄。開獎後將依輪次列出獎品與號碼。";
  $("export").disabled=!rs.length;
  $("rows").replaceChildren(...rs.slice().reverse().map(r=>{
    const d=el("article","record");d.append(el("strong","","第 "+r.round+" 輪　"+r.name),el("small","",r.sponsor+" 贊助　·　"+(r.mode==="live"?"現場隨機":"後台預設")+"　·　"+new Date(r.time).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false})),el("div","",r.numbers.map(format).join("　")));return d;
  }));
}
function render(){renderStage();if(!projection){list();sendStage();}if(view==="history")historyView();}
function flowerArt(){
  const c=$("art"),w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
  const scale=Math.min(devicePixelRatio||1,2);c.width=w*scale;c.height=h*scale;
  const ctx=c.getContext("2d");ctx.scale(scale,scale);
  // Gold-foil rosettes extend beyond opposite edges of the stage.
  function medallion(x,y,r,alpha){
    ctx.save();ctx.translate(x,y);ctx.strokeStyle="rgba(244,200,134,"+alpha+")";ctx.lineWidth=.85;
    for(let ring=0;ring<4;ring++){
      const size=r*(1-ring*.18);
      for(let i=0;i<16;i++){
        ctx.save();ctx.rotate(i*Math.PI/8+ring*Math.PI/16);
        ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-size*.32,-size*.37,-size*.13,-size*.8,0,-size);ctx.bezierCurveTo(size*.13,-size*.8,size*.32,-size*.37,0,0);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,-size*.23);ctx.quadraticCurveTo(size*.18,-size*.62,0,-size*.89);ctx.stroke();ctx.restore();
      }
    }
    ctx.restore();
  }
  medallion(w*1.015,h*.10,Math.min(w*.32,h*.59),.25);
  medallion(w*.005,h*.98,Math.min(w*.29,h*.53),.22);
  for(let i=1;i<85;i++){
    const x=((i*817%997)/997)*w,y=((i*283%619)/619)*h;
    ctx.fillStyle="rgba(250,214,151,"+(i%3===0?.38:.2)+")";ctx.beginPath();ctx.arc(x,y,i%6===0?1.4:.75,0,Math.PI*2);ctx.fill();
  }
}
async function toggleMusic(){
  if(melody){clearInterval(melody);melody=null;await sound.suspend();}
  else{
    sound??=new AudioContext();await sound.resume();
    const notes=[62,69,74,78,76,69,66,71,74,81,78,74,69,66,64,69];
    const play=()=>{const time=sound.currentTime,osc=sound.createOscillator(),gain=sound.createGain();osc.type="sine";osc.frequency.value=440*2**((notes[voiceIndex++%notes.length]-69)/12);gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(.075,time+.07);gain.gain.exponentialRampToValueAtTime(.0001,time+1.7);osc.connect(gain).connect(sound.destination);osc.start();osc.stop(time+1.75);osc.onended=()=>{osc.disconnect();gain.disconnect();};};
    play();melody=setInterval(play,540);
  }
  $("music").textContent="♫　背景音樂："+(melody?"開":"關");$("music").setAttribute("aria-pressed",String(!!melody));
}
function exportCsv(){
  const rows=[["輪次","獎品","贊助者","摸彩券號碼","抽法","開獎時間（臺北）"]];
  for(const r of state.history)for(const n of r.numbers)rows.push([r.round,r.name,r.sponsor,format(n),r.mode==="live"?"現場隨機":"後台預設",new Date(r.time).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false})]);
  const cell=value=>{let t=String(value);if(/^[=+@\-\t\r]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';};
  const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=el("a");a.href=URL.createObjectURL(blob);a.download="2026會員大會中獎紀錄.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function setup(){
  state=read();
  if(projection){document.body.classList.add("projecting");$("fullscreen").hidden=false;document.title="千喜萬福｜現場投影";}
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>show(b.dataset.view));
  $("project").onclick=()=>{const url=new URL(location.href);url.searchParams.set("stage","1");projector=window.open(url,"blia_2026_stage");if(!projector)note("請允許此頁面開啟投影視窗。");};
  window.addEventListener("message",event=>{
    if(event.origin!==location.origin)return;
    if(projection && window.opener && event.source===window.opener && event.data?.type==="blia-stage-view"){
      state=event.data.snapshot;renderStage();
    }else if(!projection && projector && event.source===projector && event.data?.type==="blia-stage-ready"){sendStage();}
  });
  if(projection && window.opener)window.opener.postMessage({type:"blia-stage-ready"},location.protocol==="file:"?"*":location.origin);
  $("fullscreen").onclick=()=>document.documentElement.requestFullscreen().catch(()=>note("請使用瀏覽器的全螢幕功能。"));
  $("editPrize").onclick=()=>show("settings");$("music").onclick=()=>toggleMusic().catch(()=>note("無法播放音樂，請檢查瀏覽器音訊權限。"));
  $("draw").onclick=()=>{const rev=state.rev,count=Number($("batch").value);change(s=>{if(s.rev!==rev)throw Error("活動已更新，請確認目前獎項。");s.batch=count;Lottery.draw(s);});};
  // The per-round count is committed atomically with the draw.
  $("poolForm").onsubmit=async e=>{e.preventDefault();if(await change(s=>{revision(s);Lottery.setPool(s,$("pool").value);},"已儲存參加摸彩號碼。")){editRev=state.rev;$("poolCount").textContent="已儲存 "+state.pool.length.toLocaleString()+" 個有效號碼";}};
  $("pick").onchange=()=>{editId=Number($("pick").value);loadPrize();};
  $("mode").onchange=()=>$("presets").hidden=$("mode").value!=="preset";
  $("generate").onclick=()=>{try{
    const existing=Lottery.parseNumbers($("queue").value), skip=new Set(existing),n=Number($("generateCount").value),qty=Number($("quantity").value);
    const awarded=state.prizes[editId].qty-Lottery.remaining(state,editId);
    if(existing.length+n>qty-awarded)throw Error("預設個數超過剩餘名額。");
    const added=Lottery.sample(Lottery.available(state,editId).filter(v=>!skip.has(v)),n);
    $("queue").value=[...existing,...added].map(format).join(", ");note("已加入號碼，請按「儲存獎項設定」完成預留。");
  }catch(e){note(e.message);}};
  $("prizeForm").onsubmit=async e=>{e.preventDefault();if(await change(s=>{revision(s);Lottery.configure(s,editId,{name:$("prizeName").value,sponsor:$("sponsor").value,qty:Number($("quantity").value),mode:$("mode").value,queueText:$("queue").value});},"已儲存獎項設定。"))loadSettings();};
  $("prev").onclick=()=>{page--;resultPage(state.history.at(-1));};$("next").onclick=()=>{page++;resultPage(state.history.at(-1));};
  $("export").onclick=exportCsv;
  $("reset").onclick=()=>{const rev=state.rev;if(prompt("確定清除全部中獎紀錄與預設號碼？請輸入「清除彩排」確認。")==="清除彩排")change(s=>{if(s.rev!==rev)throw Error("活動已更新，請重新確認再清除。");s.history=[];s.prizes.forEach(p=>p.queue=[]);s.display="ready";s.batch=1;},"已清除彩排紀錄與預設號碼。");};
  window.addEventListener("storage",e=>{if(e.key===KEY||e.key===null){try{state=read();render();}catch(err){note(err.message);}}});
  window.addEventListener("pageshow",()=>{try{state=read();render();if(projection&&window.opener)window.opener.postMessage({type:"blia-stage-ready"},location.protocol==="file:"?"*":location.origin);}catch(err){note(err.message);}});
  new ResizeObserver(flowerArt).observe($("art"));render();flowerArt();
}
try{setup();}catch(e){$("draw").disabled=true;note("無法載入活動："+e.message);}
