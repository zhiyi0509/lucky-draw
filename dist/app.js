"use strict";
const $=id=>document.getElementById(id);
const KEY="blia.assembly.2026.lottery.v1";
const projection=new URLSearchParams(location.search).has("stage");
const format=n=>String(n).padStart(4,"0");
const el=(tag,cls,t)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(t!==undefined)e.textContent=t;return e;};
let state,view="stage",editId=0,editRev=0,noticeTimer,animTimer,pending=false;
let music=null,projector=null;
let logoDraft="",logoLoading=false,logoSerial=0,stageSending=false,stageTimeout;
const targetOrigin=location.protocol==="file:"?"*":location.origin;
function sendStage(){
  if(!projector||projector.closed)return;
  const p=state.prizes[state.selected],last=state.history.at(-1);
  const snapshot={rev:state.rev,brand:state.brand,selected:p?0:-1,batch:Number($("batch").value),display:state.display,pool:state.pool.length?[1]:[],
    prizes:p?[{name:p.name,sponsor:p.sponsor,qty:Lottery.remaining(state,state.selected)}]:[],history:[],roundCount:state.history.length};
  if(state.display==="result" && last)snapshot.history=[{id:-1,name:last.name,sponsor:last.sponsor,round:last.round,time:last.time,numbers:last.numbers}];
  projector.postMessage({type:"blia-stage-view",snapshot},location.protocol==="file:"?"*":location.origin);
}
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
function read(){
  const raw=localStorage.getItem(KEY);
  if(!raw)return Lottery.initial();
  const data=JSON.parse(raw);
  if(data.version!==1||!Array.isArray(data.history)||!Array.isArray(data.prizes))throw Error("活動資料無法讀取，請保留此瀏覽器資料。");
  data.brand={...Lottery.defaultBrand,...data.brand};
  return data;
}
function note(message){const box=$("notice");box.textContent=message;box.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>box.hidden=true,5500);}
function busy(s){return s.display==="result" && Date.now()-(s.history.at(-1)?.time??0)<2300;}
async function change(fn,success,onError=note){
  if(pending){onError('操作進行中，請稍候。');return false;}
  pending=true;
  try{
    if(!navigator.locks)throw Error("請使用 Chrome 或 Edge，以活動網址或 localhost 開啟控制台。");
    await navigator.locks.request(KEY,()=>{
      const fresh=read();
      if(busy(fresh))throw Error("本輪正在揭曉，請稍候。");
      fn(fresh);fresh.rev++;localStorage.setItem(KEY,JSON.stringify(fresh));state=fresh;
    });
    render();if(success)note(success);return true;
  }catch(e){onError(e.message);return false;}finally{pending=false;}
}
function show(v){
  if(projection)return;
  view=v;for(const id of ["stage","settings","history"])$(id).hidden=id!==v;
  document.querySelectorAll("[data-view]").forEach(b=>{const active=b.dataset.view===v;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");});
  if(v==="settings"){editId=state.selected;loadSettings();}
  if(v==="history")historyView();
}
function setLogo(node,logo) {
  if(node.dataset.src===logo)return;
  node.dataset.src=logo;
  if(!logo){node.textContent="❀";return;}
  const img=el("img");img.src=logo;img.alt="";node.replaceChildren(img);
}
function renderBrand(){
  const brand=state.brand??Lottery.defaultBrand;
  document.body.dataset.palette=brand.palette;
  document.title=brand.title+"｜"+brand.event+(projection?"｜投影":"｜摸彩");
  document.querySelectorAll("[data-brand]").forEach(node=>node.textContent=brand.title);
  document.querySelectorAll("[data-event]").forEach(node=>node.textContent=brand.event);
  document.querySelectorAll("[data-logo]").forEach(node=>setLogo(node,brand.logo));
}
async function chooseLogo(file){
  if(!file)return;
  const serial=++logoSerial;
  logoLoading=true;
  const url=URL.createObjectURL(file);
  try{
    if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("請選擇 PNG、JPG 或 WebP 圖檔。");
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(1,320/Math.max(img.width,img.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    if(serial===logoSerial){logoDraft=canvas.toDataURL("image/png");setLogo($("logoPreview"),logoDraft);}
  }catch(err){if(serial===logoSerial)note("無法載入 Logo。"+err.message);}
  finally{URL.revokeObjectURL(url);if(serial===logoSerial)logoLoading=false;}
}
function loadSettings(){
  const brand=state.brand??Lottery.defaultBrand;
  $("brandTitle").value=brand.title;$("brandEvent").value=brand.event;$("palette").value=brand.palette;
  logoSerial++;logoLoading=false;logoDraft=brand.logo;$("logoFile").value="";setLogo($("logoPreview"),logoDraft);
  editRev=state.rev;$("pool").value=state.poolText;
  $("poolCount").textContent="已儲存 "+state.pool.length.toLocaleString()+" 個有效號碼";
  const ids=Lottery.activeIds(state);
  const options=ids.map((id,i)=>{const p=state.prizes[id];const o=el("option","",String(i+1).padStart(2,"0")+"　"+p.sponsor+"｜"+p.name);o.value=id;return o;});
  const add=el("option","","＋ 新獎項");add.value=-1;
  $("pick").replaceChildren(...options,add);
  if(!ids.includes(editId))editId=-1;
  $("pick").value=editId;loadPrize();
}
function loadPrize(){
  const adding=editId===-1;
  const p=state.prizes[editId]??{name:"",sponsor:"",qty:1,queue:[],mode:"live",note:""};
  $("deletePrize").disabled=adding;
  $("savePrize").textContent=adding?"儲存新獎項":"儲存獎項設定";
  $("prizeName").value=p.name;$("sponsor").value=p.sponsor;$("quantity").value=p.qty;
  $("queue").value=p.queue.map(format).join(", ");$("generateCount").value=1;
  const oldTens=p.mode==="ending" && p.digitPlace==="tens";
  $("endingDigits").value=oldTens?"":endingText(p);
  const selected=p.mode==="ending"?(oldTens?"lastTwo":(p.digitPlace??"ones")):p.mode;
  for(const option of modeOptions)$(option+"Mode").checked=option===selected;
  showModeFields();
  $("note").textContent=[p.note,p.qty?"已配置 "+p.qty+" 個名額":"名額待確認",oldTens?"請重新指定末兩碼並儲存。":""].filter(Boolean).join(" ｜ ");
}
function revision(s){if(s.rev!==editRev)throw Error("另一個操作已更新活動，請重新開啟活動設定後再儲存。");}
function list(){
  const area=$("prizes");
  const ids=Lottery.activeIds(state);
  $("total").textContent=ids.length+" 項";
  area.replaceChildren(...ids.map((i,ordinal)=>{
    const p=state.prizes[i];
    const b=el("button","item"+(i===state.selected?" current":""));b.type="button";b.setAttribute("aria-pressed",String(i===state.selected));
    b.append(el("span","index",String(ordinal+1).padStart(2,"0")));
    const t=el("span");t.append(el("strong","",p.name),el("small","",p.sponsor+" 贊助　·　"+(p.qty?"剩 "+Lottery.remaining(state,i)+" / "+p.qty:"名額待確認")));b.append(t);
    b.onclick=()=>change(s=>{s.selected=i;s.batch=1;s.display="ready";});return b;
  }));
}
function fitNumbers(){
  const grid=$("numbers");
  if(!grid.classList.contains("number-grid"))return;
  const w=grid.clientWidth,h=grid.clientHeight,count=grid.childElementCount;
  if(!w||!h||!count)return;
  const digits=Number(grid.dataset.digits),gap=1;
  let best=0,columns=1;
  for(let cols=1;cols<=count;cols++){
    const rows=Math.ceil(count/cols);
    const font=Math.min((w-(cols-1)*gap)/(cols*(digits*.63+.28)),(h-(rows-1)*gap)/(rows*1.2));
    if(font>best){best=font;columns=cols;}
    if(font<best && w/cols<(digits*.63+.28)*best)break;
  }
  grid.style.gridTemplateColumns="repeat("+columns+", minmax(0, 1fr))";
  grid.style.gridTemplateRows="repeat("+Math.ceil(count/columns)+", minmax(0, 1fr))";
  grid.style.fontSize=Math.max(.1,Math.floor(best*10)/10)+"px";
}
function resultPage(r){
  const dense=r.numbers.length>8;
  document.body.classList.toggle("many-winners",dense);
  const grid=$("numbers");
  grid.className=dense?"number-grid":"results";
  grid.dataset.digits=String(r.numbers.reduce((max,n)=>Math.max(max,format(n).length),4));
  const fragment=document.createDocumentFragment();
  for(const n of r.numbers)fragment.append(el("span","winner"+(r.numbers.length===1?" only":""),format(n)));
  grid.replaceChildren(fragment);
  $("stageStatus").textContent="恭喜中獎　·　本輪共 "+r.numbers.length+" 位";
  fitNumbers();
}
function tickets(chars){
  document.body.classList.remove("many-winners");$("numbers").className="";$("numbers").replaceChildren(...Array.from(chars,c=>el("span","ticket",c)));
}
function renderStage(){
  clearInterval(animTimer);
  renderBrand();
  const p=state.prizes[state.selected],r=state.history.at(-1),result=state.display==="result"&&r;
  $("round").textContent="第 "+String(result?r.round:(state.roundCount??state.history.length)+1).padStart(2,"0")+" 輪";
  if(!p){
    $("onPrize").textContent="尚無獎項";$("current").textContent="尚無獎項";$("balance").textContent="";
    $("draw").disabled=true;$("stageStatus").textContent=projection?"敬候開獎":"請至活動設定新增獎項";
    tickets("––––");return;
  }
  $("onPrize").textContent=(result?r.name:p.name)+"　·　"+(result?r.sponsor:p.sponsor)+" 贊助";
  $("current").textContent=p.name;$("balance").textContent=p.qty?"本獎項尚餘 "+Lottery.remaining(state,state.selected)+" 個名額":"名額待確認";
  $("batch").value=state.batch;
  $("draw").disabled=!state.pool.length||Lottery.remaining(state,state.selected)<1;
  if(!result){
    tickets("––––");$("stageStatus").textContent=!state.pool.length?(projection?"敬候開獎":"請先至活動設定輸入摸彩號碼"):!p.qty?"獎項名額待確認":Lottery.remaining(state,state.selected)===0?"本獎項已抽畢":"準備開獎　·　本輪 "+state.batch+" 位";return;
  }
  const finish=()=>{clearInterval(animTimer);resultPage(r);$("draw").disabled=Lottery.remaining(state,state.selected)<1;};
  if(!busy(state)){finish();return;}
  if(music)playDrawCue(r);
  $("draw").disabled=true;$("stageStatus").textContent="祝福揭曉中";
  const tick=()=>{if(!busy(state)){finish();return;}tickets(reduced?"✦✦✦✦":String(Math.floor(Math.random()*10000)).padStart(4,"0"));};
  tick();animTimer=setInterval(tick,reduced?300:95);
}
const modeOptions=["live","preset","ones","lastTwo"];
function selectedMode(){return modeOptions.find(option=>$(option+"Mode").checked)??"live";}
function showModeFields(){
  const mode=selectedMode();
  $("presets").hidden=mode!=="preset";
  const two=mode==="lastTwo";
  $("endingRule").hidden=mode!=="ones"&&!two;
  $("endingDigits").placeholder=two?"例如 07、89":"例如 1、5、0";
  $("endingHint").textContent=two?"請填 00 至 99。指定 89 時，0089、1789 都符合；多組尾數可用逗號分隔。":"請填 0 至 9。指定 9 時，1789 符合；多個數字可用逗號分隔。";
}
function endingText(rule){
  return (rule.endings??[]).map(n=>String(n).padStart(rule.digitPlace==="lastTwo"?2:1,"0")).join("、");
}
function modeLabel(round){
  if(round.mode==="ending"){
    const place=round.digitPlace==="tens"?"十位數":round.digitPlace==="lastTwo"?"末兩碼":"末一碼";
    return place+"抽獎（"+endingText(round)+"）";
  }
  return round.mode==="preset"?"後台預設":"現場隨機";
}
function historyView(){
  const query=$("historySearch").value.normalize("NFKC").trim();
  const searching=query.length>0;
  const valid=/^\d{1,6}$/.test(query)&&Number(query)>0;
  const ticket=Number(query);
  const rounds=state.history;
  let shown=rounds;
  if(searching)shown=valid?rounds.filter(r=>r.numbers.includes(ticket)):[];
  let summary;
  if(!searching){
    const total=rounds.reduce((a,r)=>a+r.numbers.length,0);
    summary=rounds.length?"已完成 "+rounds.length+" 輪，共 "+total+" 個中獎號碼。":"尚無中獎紀錄。";
  }else if(!valid){
    summary="請輸入 1 至 999999 的完整券號。";
  }else{
    summary=shown.length?"查到 "+format(ticket)+" 的中獎紀錄。":"目前沒有 "+format(ticket)+" 的中獎紀錄。";
  }
  $("historyCount").textContent=summary;
  $("clearSearch").disabled=!searching;
  $("export").disabled=!rounds.length;
  $("rows").replaceChildren(...shown.slice().reverse().map(r=>{
    const record=el("article","record");
    const when=new Date(r.time).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false});
    const numbers=searching?[ticket]:r.numbers;
    const group=el("div","record-numbers");
    for(const n of numbers)group.append(el("span","",format(n)));
    record.append(el("strong","","第 "+r.round+" 輪　"+r.name),el("small","",r.sponsor+" 贊助　·　"+modeLabel(r)+"　·　"+when),group);
    return record;
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
const scores={
  festival:{bpm:150,roots:[53,58,50,48],lead:[72,76,77,81,79,77,84],chords:[0,4,7],
    phrase:[0,null,1,2,null,3,4,null,5,null,4,2,6,null,3,4],kick:[0,6,8,14],snare:[4,12],fanfare:[77,81,84,89]},
  dance:{bpm:160,roots:[50,46,53,48],lead:[74,77,81,84,86,89],
    phrase:[0,2,3,2,1,2,4,2,0,2,3,5,4,2,1,2],kick:[0,4,8,12],snare:[4,12],fanfare:[74,81,86,93]},
  drums:{bpm:172,roots:[48,48,46,43],lead:[67,70,72,75,79],
    phrase:[0,null,null,1,2,null,2,null,0,null,3,null,4,3,null,2],kick:[0,3,8,10,14],snare:[4,7,12,15],fanfare:[72,79,84,87]}
};
function createScore(ctx,track){
  const score=scores[track]??scores.festival;
  const output=ctx.createGain();
  output.gain.value=.64;output.connect(ctx.destination);
  const noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.22),ctx.sampleRate);
  const samples=noise.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;

  function voice(source,time,length,volume,filter){
    const env=ctx.createGain();
    env.gain.setValueAtTime(.0001,time);
    env.gain.exponentialRampToValueAtTime(volume,time+.006);
    env.gain.exponentialRampToValueAtTime(.0001,time+length);
    if(filter){source.connect(filter);filter.connect(env);}else{source.connect(env);}
    env.connect(output);source.start(time);source.stop(time+length);
    source.onended=()=>{source.disconnect();env.disconnect();if(filter)filter.disconnect();};
  }
  function tone(time,midi,length,volume,type="triangle"){
    const osc=ctx.createOscillator();osc.type=type;
    osc.frequency.value=440*2**((midi-69)/12);
    voice(osc,time,length,volume);
  }
  function drum(time,volume,high=false){
    const hit=ctx.createBufferSource();hit.buffer=noise;
    const filter=ctx.createBiquadFilter();filter.type="highpass";filter.frequency.value=high?6300:950;
    voice(hit,time,high?.05:.12,volume,filter);
  }
  function kick(time){
    const osc=ctx.createOscillator();
    osc.frequency.setValueAtTime(135,time);osc.frequency.exponentialRampToValueAtTime(46,time+.14);
    voice(osc,time,.18,.28);
  }
  function tom(time,hz){
    const osc=ctx.createOscillator();osc.type="triangle";
    osc.frequency.setValueAtTime(hz*1.8,time);osc.frequency.exponentialRampToValueAtTime(hz,time+.10);
    voice(osc,time,.21,.32);
  }
  function brass(time,note,length,level){
    const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter();
    osc.type="sawtooth";osc.frequency.value=440*2**((note-69)/12);
    filter.type="lowpass";filter.frequency.setValueAtTime(2600,time);
    filter.frequency.exponentialRampToValueAtTime(1200,time+length);
    voice(osc,time,length,level,filter);
  }
  const sixteenth=60/score.bpm/4;
  function measure(time,step){
    const beat=step%16,bar=Math.floor(step/16)%4,root=score.roots[bar];
    if(score.kick.includes(beat))kick(time);
    if(score.snare.includes(beat))drum(time,.22);
    if(beat%2===0)drum(time,beat%4===2?.09:.05,true);
    if(beat%4===0||beat===10)tone(time,root-12,.19,.24);
    const degree=score.phrase[beat];
    if(degree!==null){
      const pitch=score.lead[degree]+(bar===3?-2:0);
      if(track==="festival")brass(time,pitch,.13,.12);
      else tone(time,pitch,sixteenth*.88,.105,track==="dance"?"square":"sawtooth");
    }
    if(track==="festival"&&[2,6,11,14].includes(beat)){
      for(const interval of score.chords)brass(time,root+interval,.14,.065);
    }else if(track==="dance"&&beat%4===2){
      tone(time,root+7,.14,.14,"sawtooth");
    }else if(track==="drums"&&[0,3,5,8,10,13,14].includes(beat)){
      tom(time,[88,116,147][beat%3]);
    }
  }
  let step=0,next=ctx.currentTime+.025;
  function pump(){
    next=Math.max(next,ctx.currentTime);
    while(next<ctx.currentTime+.15){
      measure(next,step);
      next+=sixteenth;step++;
    }
  }
  function drawCue(reveal){
    const start=reveal-2.3;
    // Shorten the drum spacing as the numbers roll.
    for(let t=0;t<2.26;t+=t<.8?.19:t<1.6?.115:.065){
      if(start+t>=ctx.currentTime)drum(start+t,.11+.085*t/2.3);
    }
    for(let i=0;i<12;i++){
      const time=start+i*(2.3/12);
      if(time<ctx.currentTime)continue;
      const note=score.fanfare[i%4]-12+Math.floor(i/4)*2;
      if(track==="drums")tom(time,85+i*9);
      else if(track==="festival")brass(time,note,.14,.16);
      else tone(time,note,.13,.14,"square");
      if(i%3===0)kick(time);
    }
    kick(reveal);
    for(const [i,note] of score.fanfare.entries())brass(reveal+i*.09,note,i===3?.62:.21,.17);
    for(const interval of [0,4,7])tone(reveal+.27,score.fanfare[0]-12+interval,.7,.10);
    next=reveal+1.05;step=0;
  }
  pump();
  const timer=setInterval(pump,65);
  return {ctx,drawCue,lastRound:null,disconnect:()=>{clearInterval(timer);output.disconnect();}};
}
function playDrawCue(round){
  const id=round.round+"-"+round.time;
  if(music.lastRound===id)return;
  music.lastRound=id;
  const remaining=Math.max(.015,(round.time+2300-Date.now())/1000);
  music.drawCue(music.ctx.currentTime+remaining);
}
async function toggleMusic(){
  const button=$("music");if(button.disabled)return;
  button.disabled=true;
  try{
    if(music){const score=music;music=null;score.disconnect();await score.ctx.close();}
    else{
      const ctx=new AudioContext();
      try{await ctx.resume();music=createScore(ctx,$("track").value);}catch(error){await ctx.close();throw error;}
      if(busy(state))playDrawCue(state.history.at(-1));
    }
  }finally{
    button.disabled=false;button.textContent="♫　背景音樂："+(music?"開":"關");
    button.setAttribute("aria-pressed",String(!!music));
  }
}
function switchTrack(){
  if(!music)return;
  const ctx=music.ctx;
  music.disconnect();music=createScore(ctx,$("track").value);
  if(busy(state))playDrawCue(state.history.at(-1));
}
function exportCsv(){
  const rows=[["輪次","獎品","贊助者","摸彩券號碼","抽法","開獎時間（臺北）"]];
  for(const r of state.history)for(const n of r.numbers)rows.push([r.round,r.name,r.sponsor,format(n),modeLabel(r),new Date(r.time).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false})]);
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
    }else if(!projection && projector && event.source===projector){
      if(event.data?.type==="blia-stage-ready")sendStage();
      if(event.data?.type==="blia-stage-draw"){
        const {rev,count,request}=event.data;
        let message="";
        change(s=>{
          if(count!==Number($("batch").value))throw Error("本輪名額已更新，請確認後再按開獎。");
          Lottery.drawRound(s,rev,count);
        },null,error=>{message=error;note(error);}).then(()=>{
          sendStage();
          if(!projector.closed)projector.postMessage({type:"blia-stage-ack",message,request},targetOrigin);
        });
      }
    }else if(projection && event.source===window.opener && event.data?.type==="blia-stage-ack" && event.data.request===stageSending){
      clearTimeout(stageTimeout);stageSending=false;
      if(event.data.message)note(event.data.message);
    }
  });
  if(projection && window.opener)window.opener.postMessage({type:"blia-stage-ready"},location.protocol==="file:"?"*":location.origin);
  $("fullscreen").onclick=()=>document.documentElement.requestFullscreen().catch(()=>note("請使用瀏覽器的全螢幕功能。"));
  $("editPrize").onclick=()=>show("settings");$("music").onclick=()=>toggleMusic().catch(()=>note("無法播放音樂，請檢查瀏覽器音訊權限。"));
  $("batch").oninput=()=>{sendStage();if(state.display==="ready" && state.pool.length && state.selected>=0 && Lottery.remaining(state,state.selected)>0)$("stageStatus").textContent="準備開獎　·　本輪 "+$("batch").value+" 位";};
  $("draw").onclick=()=>{
    if(projection && window.opener){
      if(window.opener.closed){note("請回主控台重新開啟投影。");return;}
      if(stageSending)return;
      stageSending=crypto.randomUUID();
      window.opener.postMessage({type:"blia-stage-draw",request:stageSending,rev:state.rev,count:state.batch},targetOrigin);
      stageTimeout=setTimeout(()=>{stageSending=false;note("未收到主控台回應，請先核對中獎紀錄。");},5000);
    }else{
      const rev=state.rev,count=Number($("batch").value);
      change(s=>Lottery.drawRound(s,rev,count));
    }
  };
  $("logoFile").onchange=()=>chooseLogo($("logoFile").files[0]);
  $("restoreLogo").onclick=()=>{logoSerial++;logoLoading=false;logoDraft="";$("logoFile").value="";setLogo($("logoPreview"),"");};
  $("brandForm").onsubmit=async e=>{
    e.preventDefault();
    if(logoLoading){note("Logo 載入中，請稍候再儲存。");return;}
    const title=$("brandTitle").value.trim(),event=$("brandEvent").value.trim();
    if(!title||!event){note("請填寫主標題與活動名稱。");return;}
    const brand={title,event,palette:$("palette").value,logo:logoDraft};
    if(await change(s=>{revision(s);s.brand=brand;},"已儲存主題與 Logo。"))editRev=state.rev;
  };
  $("addPrize").onclick=()=>{editId=-1;$("pick").value=-1;loadPrize();$("prizeName").focus();};
  $("deletePrize").onclick=async ()=>{
    const id=editId,p=state.prizes[id];if(!p)return;
    if(!confirm("刪除「"+p.name+"」？尚未開出的預留號碼將釋出，過往中獎紀錄會保留。"))return;
    if(await change(s=>{revision(s);Lottery.removePrize(s,id);},"已刪除獎項。")){editId=state.selected;loadSettings();}
  };
  $("poolForm").onsubmit=async e=>{e.preventDefault();if(await change(s=>{revision(s);Lottery.setPool(s,$("pool").value);},"已儲存參加摸彩號碼。")){editRev=state.rev;$("poolCount").textContent="已儲存 "+state.pool.length.toLocaleString()+" 個有效號碼";}};
  $("pick").onchange=()=>{editId=Number($("pick").value);loadPrize();};
  $("mode").onchange=showModeFields;
  $("track").onchange=switchTrack;
  $("generate").onclick=()=>{try{
    const existing=Lottery.parseNumbers($("queue").value), skip=new Set(existing),n=Number($("generateCount").value),qty=Number($("quantity").value);
    const awarded=editId<0?0:state.prizes[editId].qty-Lottery.remaining(state,editId);
    if(existing.length+n>qty-awarded)throw Error("預設個數超過剩餘名額。");
    const added=Lottery.sample(Lottery.available(state,editId).filter(v=>!skip.has(v)),n);
    $("queue").value=[...existing,...added].map(format).join(", ");note("已加入號碼，請按「儲存獎項設定」完成預留。");
  }catch(e){note(e.message);}};
  $("prizeForm").onsubmit=async e=>{
    e.preventDefault();
    const option=selectedMode(),ending=option==="ones"||option==="lastTwo";
    const draft={name:$("prizeName").value,sponsor:$("sponsor").value,qty:Number($("quantity").value),
      mode:ending?"ending":option,queueText:$("queue").value,endingText:$("endingDigits").value,digitPlace:ending?option:"ones"};
    if(await change(s=>{revision(s);editId=Lottery.savePrize(s,editId,draft);},"已儲存獎項設定。"))loadSettings();
  };
  $("historySearch").oninput=historyView;
  $("clearSearch").onclick=()=>{$("historySearch").value="";historyView();$("historySearch").focus();};
  $("export").onclick=exportCsv;
  $("reset").onclick=()=>{const rev=state.rev;if(prompt("確定清除全部中獎紀錄與預設號碼？請輸入「清除彩排」確認。")==="清除彩排")change(s=>{if(s.rev!==rev)throw Error("活動已更新，請重新確認再清除。");s.history=[];s.prizes.forEach(p=>p.queue=[]);s.display="ready";s.batch=1;},"已清除彩排紀錄與預設號碼。");};
  window.addEventListener("storage",e=>{if((e.key===KEY||e.key===null) && !(projection && window.opener)){try{state=read();render();}catch(err){note(err.message);}}});
  window.addEventListener("pageshow",()=>{try{state=read();render();if(projection&&window.opener)window.opener.postMessage({type:"blia-stage-ready"},location.protocol==="file:"?"*":location.origin);}catch(err){note(err.message);}});
  new ResizeObserver(fitNumbers).observe($("numbers"));
  new ResizeObserver(flowerArt).observe($("art"));render();flowerArt();
}
try{setup();}catch(e){$("draw").disabled=true;note("無法載入活動："+e.message);}
