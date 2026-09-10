
"use strict";

const $ = id => document.getElementById(id);
const LS = {
  settings: "studytube_settings_v2",
  history: "studytube_history_v2",
  favorites: "studytube_favorites_v2",
  subs: "studytube_subscriptions_v2"
};

const DEFAULT_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com"
];

const defaultSettings = {
  instance: DEFAULT_INSTANCES[0],
  customInstance: "",
  quality: "auto",
  proxy: true,
  sponsorBlock: true,
  autoplay: true,
  rememberHistory: true,
  sbCategories: ["sponsor","selfpromo","interaction"]
};

const state = {
  settings: {...defaultSettings, ...readJSON(LS.settings, {})},
  history: readJSON(LS.history, []),
  favorites: readJSON(LS.favorites, []),
  subscriptions: readJSON(LS.subs, []),
  current: null,
  currentVideoId: null,
  related: [],
  sponsorSegments: [],
  sponsorWatch: null,
  activeView: "home",
  priorView: "home",
  libraryMode: "history",
  uiTimer: null,
  lastPositionSave: 0
};

function readJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function saveJSON(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
function cleanInstance(s){ return (s || "").trim().replace(/\/+$/,""); }
function activeInstance(){ return cleanInstance(state.settings.customInstance || state.settings.instance || DEFAULT_INSTANCES[0]); }
function api(path){ return activeInstance() + path; }
function escText(s){ return s == null ? "" : String(s); }

function normalizeUrl(url, instance=activeInstance()){
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return instance + url;
  return url;
}
function fmtDuration(sec){
  sec = Math.max(0, Math.floor(Number(sec)||0));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}
function fmtViews(n){
  n=Number(n)||0;
  try { return new Intl.NumberFormat("ro-RO",{notation:"compact",maximumFractionDigits:1}).format(n)+" viz."; }
  catch { return n+" viz."; }
}
function extractId(input){
  input=(input||"").trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  try{
    const u=new URL(input);
    if(u.hostname==="youtu.be") return u.pathname.split("/").filter(Boolean)[0]?.slice(0,11)||null;
    if(u.hostname.includes("youtube.com")){
      const v=u.searchParams.get("v"); if(v) return v.slice(0,11);
      const p=u.pathname.split("/").filter(Boolean);
      const i=p.findIndex(x=>["shorts","embed","live"].includes(x));
      if(i>=0&&p[i+1]) return p[i+1].slice(0,11);
    }
  }catch{}
  return null;
}
function thumbFor(v){
  const arr=v.videoThumbnails||v.thumbnails||[];
  if(arr.length){
    const t=arr.find(x=>["medium","high","maxres"].includes(x.quality))||arr[Math.floor(arr.length/2)]||arr[0];
    return normalizeUrl(t.url);
  }
  return v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : "";
}
function avatarFor(obj){
  const arr=obj.authorThumbnails||obj.authorThumbnail ? (Array.isArray(obj.authorThumbnails)?obj.authorThumbnails:[{url:obj.authorThumbnail}]) : [];
  return arr.length ? normalizeUrl(arr[arr.length-1].url) : "";
}

async function fetchJSON(url, opts={}, timeout=12000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{...opts,signal:ctrl.signal,headers:{Accept:"application/json",...(opts.headers||{})}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{ clearTimeout(t); }
}

async function withInstanceFallback(pathBuilder){
  const preferred=activeInstance();
  const candidates=[preferred,...DEFAULT_INSTANCES.filter(x=>x!==preferred)];
  let lastErr=null;
  for(const inst of candidates){
    try{
      const path=pathBuilder(inst);
      const data=await fetchJSON(inst+path);
      if(inst!==preferred){
        state.settings.instance=inst;
        state.settings.customInstance="";
        saveJSON(LS.settings,state.settings);
      }
      return {data,instance:inst};
    }catch(e){ lastErr=e; }
  }
  throw lastErr || new Error("Nicio instanță disponibilă");
}

function setStatus(id,msg){ $(id).textContent=msg||""; }
function showView(name, push=true){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $(`view-${name}`).classList.add("active");
  document.querySelectorAll(".navBtn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name!=="watch"){
    state.priorView=name;
    state.activeView=name;
    if(push) history.replaceState({view:name},"",`#${name}`);
  }else{
    state.activeView="watch";
    document.querySelectorAll(".navBtn").forEach(b=>b.classList.remove("active"));
  }
  window.scrollTo({top:0,behavior:"instant"});
}
function goBackFromWatch(){
  $("video").pause();
  showView(state.priorView||"home");
}

function makeVideoCard(v){
  const b=document.createElement("button");
  b.className="videoCard";
  const id=v.videoId;
  const title=escText(v.title||"Video");
  const author=escText(v.author||"");
  const dur=Number(v.lengthSeconds)||0;
  b.innerHTML=`
    <div class="thumbWrap">
      <img loading="lazy" alt="">
      ${dur?`<span class="durationBadge">${fmtDuration(dur)}</span>`:""}
    </div>
    <div>
      <div class="cardTitle"></div>
      <div class="cardMeta"></div>
    </div>`;
  b.querySelector("img").src=thumbFor(v);
  b.querySelector("img").alt=title;
  b.querySelector(".cardTitle").textContent=title;
  b.querySelector(".cardMeta").textContent=[author,v.viewCount?fmtViews(v.viewCount):"",v.publishedText||""].filter(Boolean).join(" · ");
  b.onclick=()=>openVideo(id);
  return b;
}
function renderVideoGrid(id,items){
  const host=$(id); host.innerHTML="";
  const vids=(items||[]).filter(x=>x && x.videoId && (x.type==="video"||x.type==="shortVideo"||!x.type));
  if(!vids.length){ host.innerHTML='<div class="emptyState">Nimic de afișat.</div>'; return; }
  vids.forEach(v=>host.appendChild(makeVideoCard(v)));
}

async function loadHome(){
  setStatus("homeStatus","Se încarcă…");
  try{
    const {data}=await withInstanceFallback(()=>`/api/v1/trending?region=RO&hl=ro`);
    renderVideoGrid("homeGrid",data);
    setStatus("homeStatus","");
  }catch(e){
    setStatus("homeStatus",`Nu pot încărca Home: ${e.message}. Schimbă instanța în Setări.`);
  }
}

async function doSearch(){
  const q=$("searchInput").value.trim();
  if(!q)return;
  const id=extractId(q); if(id){ openVideo(id); return; }
  setStatus("searchStatus","Caut…");
  $("searchGrid").innerHTML="";
  try{
    const {data}=await withInstanceFallback(()=>`/api/v1/search?q=${encodeURIComponent(q)}&type=video&sort=relevance&region=RO&hl=ro`);
    renderVideoGrid("searchGrid",data);
    setStatus("searchStatus",`${data.filter(x=>x.videoId).length} rezultate`);
  }catch(e){ setStatus("searchStatus",`Căutarea a eșuat: ${e.message}`); }
}

function chooseStream(info, instance){
  let formats=(info.formatStreams||[]).filter(f=>f.url);
  if(!formats.length) return null;
  // Prefer MP4/H.264-ish progressive streams on iOS.
  const mp4=formats.filter(f=>(f.container||"").toLowerCase()==="mp4" || (f.type||"").includes("video/mp4"));
  if(mp4.length) formats=mp4;
  const qRank=f=>{
    const s=(f.qualityLabel||f.quality||"").toLowerCase();
    const m=s.match(/(\d{3,4})p?/); return m?Number(m[1]):0;
  };
  formats.sort((a,b)=>qRank(a)-qRank(b));
  let selected;
  if(state.settings.quality==="small") selected=formats.find(f=>qRank(f)>=144)||formats[0];
  else if(state.settings.quality==="medium") selected=[...formats].reverse().find(f=>qRank(f)<=480)||formats[0];
  else if(state.settings.quality==="hd720") selected=[...formats].reverse().find(f=>qRank(f)<=720)||formats[formats.length-1];
  else selected=formats[formats.length-1];
  const url=normalizeUrl(selected.url,instance);
  return {...selected,url};
}

function setLoading(on,text="Se încarcă…"){
  $("loadingText").textContent=text;
  $("loadingOverlay").classList.toggle("hidden",!on);
}
function showPlayerUi(){
  $("playerUi").classList.remove("hiddenUi");
  clearTimeout(state.uiTimer);
  state.uiTimer=setTimeout(()=>{ if(!$("video").paused) $("playerUi").classList.add("hiddenUi"); },2600);
}
function hud(text,ms=650){
  const el=$("gestureHud");el.textContent=text;el.classList.add("show");
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove("show"),ms);
}
function bubble(side){
  const el=$(side==="left"?"seekLeft":"seekRight");el.classList.add("show");
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove("show"),360);
}
function seekBy(sec){
  const v=$("video"); if(!Number.isFinite(v.duration))return;
  v.currentTime=Math.max(0,Math.min(v.duration,v.currentTime+sec)); hud(`${sec>0?"+":""}${sec}s`); bubble(sec<0?"left":"right");
}
function playToggle(){
  const v=$("video");
  if(v.paused) v.play().catch(()=>{}); else v.pause();
  showPlayerUi();
}
function updatePlayIcons(){
  const paused=$("video").paused;
  $("playPause").textContent=paused?"▶︎":"❚❚";
  $("centerPlay").textContent=paused?"▶":"❚❚";
}
function setFavoriteUi(){
  const on=state.favorites.some(x=>x.videoId===state.currentVideoId);
  $("favoriteBtn").textContent=on?"★ Favorit":"☆ Favorite";
}
function setSubscribeUi(){
  const id=state.current?.authorId;
  const on=id&&state.subscriptions.some(x=>x.authorId===id);
  $("subscribeBtn").textContent=on?"Abonat":"Abonează-te";
  $("subscribeBtn").classList.toggle("subscribed",!!on);
}
function addHistory(info){
  if(!state.settings.rememberHistory)return;
  const item={
    videoId:info.videoId,title:info.title,author:info.author,authorId:info.authorId,
    lengthSeconds:info.lengthSeconds,viewCount:info.viewCount,publishedText:info.publishedText,
    videoThumbnails:info.videoThumbnails,watchedAt:Date.now()
  };
  state.history=[item,...state.history.filter(x=>x.videoId!==item.videoId)].slice(0,100);
  saveJSON(LS.history,state.history);
}
function renderLibrary(){
  const list=state.libraryMode==="history"?state.history:state.favorites;
  $("libraryTitle").textContent=state.libraryMode==="history"?"Istoric":"Favorite";
  renderVideoGrid("libraryGrid",list);
}

async function openVideo(id){
  if(!id)return;
  state.currentVideoId=id;
  showView("watch");
  setLoading(true,"Pregătesc playerul…");
  $("relatedGrid").innerHTML="";
  $("commentsList").innerHTML="";
  setStatus("commentsStatus","");
  state.sponsorSegments=[];
  stopSponsorWatch();
  try{
    const local=state.settings.proxy?"&local=true":"";
    const {data:info,instance}=await withInstanceFallback(()=>`/api/v1/videos/${encodeURIComponent(id)}?region=RO&hl=ro${local}`);
    state.current=info;
    state.currentVideoId=info.videoId||id;
    state.related=info.recommendedVideos||[];
    document.title=(info.title||"StudyTube")+" · StudyTube";
    $("videoTitle").textContent=info.title||"";
    $("videoMeta").textContent=[fmtViews(info.viewCount),info.publishedText].filter(Boolean).join(" · ");
    $("channelName").textContent=info.author||"";
    $("channelSubs").textContent=info.subCountText||"";
    $("channelAvatar").src=avatarFor(info);
    $("descriptionText").textContent=info.description||"";
    renderVideoGrid("relatedGrid",state.related.slice(0,24));
    setFavoriteUi(); setSubscribeUi(); addHistory(info); renderLibrary();

    const stream=chooseStream(info,instance);
    if(!stream) throw new Error("Instanța nu a furnizat un stream compatibil.");
    $("qualityBadge").textContent=stream.qualityLabel||stream.quality||"Auto";
    const video=$("video");
    video.pause();
    video.removeAttribute("src");
    video.querySelectorAll("track").forEach(t=>t.remove());
    video.src=stream.url;
    addCaptionTracks(info,instance);
    video.load();
    await fetchSponsorSegments(state.currentVideoId);
    setLoading(false);
    video.play().catch(()=>{ showPlayerUi(); });
    loadComments(state.currentVideoId);
  }catch(e){
    setLoading(true,`Eroare: ${e.message}`);
  }
}

function addCaptionTracks(info,instance){
  const v=$("video");
  (info.captions||[]).slice(0,25).forEach((c,i)=>{
    const tr=document.createElement("track");
    tr.kind="subtitles";
    tr.label=c.label||c.language_code||`CC ${i+1}`;
    tr.srclang=c.language_code||"";
    let u=normalizeUrl(c.url,instance);
    // Invidious caption URLs are generally VTT-capable; add tlang only if supplied upstream.
    tr.src=u;
    v.appendChild(tr);
  });
}
function showCaptionsDialog(){
  const host=$("captionOptions"); host.innerHTML="";
  const off=document.createElement("button");off.className="optionBtn";off.textContent="Dezactivate";
  off.onclick=()=>{[...$("video").textTracks].forEach(t=>t.mode="disabled");$("captionsDialog").close();};host.appendChild(off);
  [...$("video").textTracks].forEach((t,i)=>{
    const b=document.createElement("button");b.className="optionBtn";b.textContent=t.label||t.language||`Pista ${i+1}`;
    b.onclick=()=>{[...$("video").textTracks].forEach((x,j)=>x.mode=j===i?"showing":"disabled");$("captionsDialog").close();};host.appendChild(b);
  });
  $("captionsDialog").showModal();
}

async function loadComments(id){
  setStatus("commentsStatus","Încarc comentariile…");
  try{
    const {data}=await withInstanceFallback(()=>`/api/v1/comments/${encodeURIComponent(id)}?sort_by=top&source=youtube&hl=ro`);
    const host=$("commentsList");host.innerHTML="";
    (data.comments||[]).slice(0,30).forEach(c=>{
      const el=document.createElement("div");el.className="comment";
      const img=document.createElement("img");img.loading="lazy";img.src=normalizeUrl(c.authorThumbnail||"");
      const body=document.createElement("div");
      const head=document.createElement("div");head.className="commentHead";head.textContent=[c.author,c.publishedText].filter(Boolean).join(" · ");
      const txt=document.createElement("div");txt.className="commentText";txt.textContent=c.content||"";
      const likes=document.createElement("div");likes.className="commentLikes";likes.textContent=c.likeCount?`♥ ${c.likeCount}`:"";
      body.append(head,txt,likes);el.append(img,body);host.appendChild(el);
    });
    setStatus("commentsStatus",data.commentCount?`${data.commentCount} comentarii`:"");
  }catch(e){ setStatus("commentsStatus","Comentariile nu sunt disponibile pe instanța curentă."); }
}

async function fetchSponsorSegments(videoId){
  state.sponsorSegments=[];
  if(!state.settings.sponsorBlock || !crypto.subtle)return;
  try{
    const raw=new TextEncoder().encode(videoId);
    const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(x=>x.toString(16).padStart(2,"0")).join("");
    const cats=encodeURIComponent(JSON.stringify(state.settings.sbCategories||["sponsor"]));
    const acts=encodeURIComponent(JSON.stringify(["skip"]));
    const data=await fetchJSON(`https://sponsor.ajay.app/api/skipSegments/${hash.slice(0,4)}?categories=${cats}&actionTypes=${acts}&service=YouTube`,{},8000);
    const match=(data||[]).find(x=>x.videoID===videoId);
    state.sponsorSegments=(match?.segments||[])
      .filter(s=>s.actionType==="skip"&&Array.isArray(s.segment))
      .map(s=>({start:Number(s.segment[0]),end:Number(s.segment[1]),category:s.category}))
      .filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start)
      .sort((a,b)=>a.start-b.start);
  }catch{}
}
function startSponsorWatch(){
  stopSponsorWatch();
  state.sponsorWatch=setInterval(()=>{
    if(!state.settings.sponsorBlock||!state.sponsorSegments.length)return;
    const v=$("video"),t=v.currentTime;
    const s=state.sponsorSegments.find(x=>t>=x.start&&t<x.end-.15);
    if(s){v.currentTime=s.end;hud(`SponsorBlock: ${s.category}`,900);}
  },250);
}
function stopSponsorWatch(){if(state.sponsorWatch)clearInterval(state.sponsorWatch);state.sponsorWatch=null;}

function toggleFavorite(){
  if(!state.current)return;
  const id=state.currentVideoId;
  if(state.favorites.some(x=>x.videoId===id)) state.favorites=state.favorites.filter(x=>x.videoId!==id);
  else state.favorites.unshift({
    videoId:id,title:state.current.title,author:state.current.author,authorId:state.current.authorId,
    lengthSeconds:state.current.lengthSeconds,viewCount:state.current.viewCount,publishedText:state.current.publishedText,
    videoThumbnails:state.current.videoThumbnails
  });
  saveJSON(LS.favorites,state.favorites);setFavoriteUi();renderLibrary();
}
function toggleSubscribe(){
  if(!state.current?.authorId)return;
  const id=state.current.authorId;
  if(state.subscriptions.some(x=>x.authorId===id)) state.subscriptions=state.subscriptions.filter(x=>x.authorId!==id);
  else state.subscriptions.unshift({authorId:id,author:state.current.author,authorThumbnails:state.current.authorThumbnails});
  saveJSON(LS.subs,state.subscriptions);setSubscribeUi();loadSubscriptions();
}
async function loadSubscriptions(){
  const host=$("subsGrid");host.innerHTML="";
  if(!state.subscriptions.length){host.innerHTML='<div class="emptyState">Abonează-te la canale din pagina unui video. Abonamentele rămân numai pe dispozitiv.</div>';setStatus("subsStatus","");return;}
  setStatus("subsStatus",`Încarc ultimele clipuri de la ${state.subscriptions.length} canale…`);
  const latest=[];
  const batch=state.subscriptions.slice(0,12);
  await Promise.all(batch.map(async s=>{
    try{
      const {data}=await withInstanceFallback(()=>`/api/v1/channels/${encodeURIComponent(s.authorId)}/latest?hl=ro`);
      const vids=Array.isArray(data)?data:(data.videos||[]);
      latest.push(...vids.slice(0,4));
    }catch{}
  }));
  latest.sort((a,b)=>(Number(b.published)||0)-(Number(a.published)||0));
  renderVideoGrid("subsGrid",latest.slice(0,40));
  setStatus("subsStatus",latest.length?`Ultimele clipuri din ${batch.length} canale`:"Nu am putut încărca feed-ul.");
}

function populateSettings(){
  const sel=$("instanceSelect");sel.innerHTML="";
  DEFAULT_INSTANCES.forEach(x=>{const o=document.createElement("option");o.value=x;o.textContent=x.replace("https://","");sel.appendChild(o);});
  sel.value=DEFAULT_INSTANCES.includes(state.settings.instance)?state.settings.instance:DEFAULT_INSTANCES[0];
  $("customInstance").value=state.settings.customInstance||"";
  $("qualitySelect").value=state.settings.quality||"auto";
  $("proxyToggle").checked=!!state.settings.proxy;
  $("sponsorToggle").checked=!!state.settings.sponsorBlock;
  $("autoplayToggle").checked=!!state.settings.autoplay;
  $("rememberToggle").checked=!!state.settings.rememberHistory;
  document.querySelectorAll(".sbCat").forEach(c=>c.checked=(state.settings.sbCategories||[]).includes(c.value));
}
function saveSettingsFromUi(){
  state.settings.instance=$("instanceSelect").value;
  state.settings.customInstance=cleanInstance($("customInstance").value);
  state.settings.quality=$("qualitySelect").value;
  state.settings.proxy=$("proxyToggle").checked;
  state.settings.sponsorBlock=$("sponsorToggle").checked;
  state.settings.autoplay=$("autoplayToggle").checked;
  state.settings.rememberHistory=$("rememberToggle").checked;
  state.settings.sbCategories=[...document.querySelectorAll(".sbCat:checked")].map(x=>x.value);
  saveJSON(LS.settings,state.settings);
  $("autoplayBtn").classList.toggle("active",state.settings.autoplay);
}
async function testInstance(){
  saveSettingsFromUi();
  $("instanceStatus").textContent="Testez…";
  try{
    const d=await fetchJSON(api("/api/v1/stats"),{},7000);
    $("instanceStatus").textContent=`OK · ${d?.software?.version||"online"}`;
  }catch(e){$("instanceStatus").textContent=`Eșec · ${e.message}`;}
}

function initSpeedDialog(){
  const host=$("speedOptions");
  [0.5,0.75,1,1.25,1.5,1.75,2].forEach(rate=>{
    const b=document.createElement("button");b.className="optionBtn";b.textContent=rate+"×";
    b.onclick=()=>{$("video").playbackRate=rate;$("speedBtn").textContent=rate+"×";$("speedDialog").close();};
    host.appendChild(b);
  });
}

function installPlayerEvents(){
  const v=$("video");
  v.addEventListener("loadedmetadata",()=>{
    $("duration").textContent=fmtDuration(v.duration);
    $("scrubber").max=1000;showPlayerUi();
  });
  v.addEventListener("timeupdate",()=>{
    $("curTime").textContent=fmtDuration(v.currentTime);
    if(Number.isFinite(v.duration)&&v.duration>0) $("scrubber").value=Math.round(v.currentTime/v.duration*1000);
    const now=Date.now();
    if(state.settings.rememberHistory && now-state.lastPositionSave>5000 && state.currentVideoId){
      localStorage.setItem("studytube_pos_"+state.currentVideoId,String(Math.floor(v.currentTime)));
      state.lastPositionSave=now;
    }
  });
  v.addEventListener("play",()=>{updatePlayIcons();startSponsorWatch();showPlayerUi();});
  v.addEventListener("pause",()=>{updatePlayIcons();stopSponsorWatch();showPlayerUi();});
  v.addEventListener("waiting",()=>setLoading(true,"Buffering…"));
  v.addEventListener("playing",()=>setLoading(false));
  v.addEventListener("error",()=>setLoading(true,"Stream indisponibil. Încearcă altă instanță."));
  v.addEventListener("ended",()=>{
    stopSponsorWatch();
    if(state.settings.autoplay&&state.related[0]?.videoId) openVideo(state.related[0].videoId);
  });
  $("scrubber").addEventListener("input",e=>{
    if(Number.isFinite(v.duration))v.currentTime=Number(e.target.value)/1000*v.duration;
  });
}

function installGestures(){
  const layer=$("gestureLayer");
  let g={sx:0,sy:0,st:0,videoT:0,moved:false,seeking:false,lastTap:0,long:false,oldRate:1};
  let longTimer=null;
  layer.addEventListener("touchstart",e=>{
    if(e.touches.length!==1)return;
    const t=e.touches[0];g.sx=t.clientX;g.sy=t.clientY;g.st=Date.now();g.videoT=$("video").currentTime;g.moved=false;g.seeking=false;g.long=false;g.oldRate=$("video").playbackRate;
    longTimer=setTimeout(()=>{if(!g.moved){g.long=true;$("video").playbackRate=2;hud("2×",500);}},420);
  },{passive:true});
  layer.addEventListener("touchmove",e=>{
    if(e.touches.length!==1)return;
    const t=e.touches[0],dx=t.clientX-g.sx,dy=t.clientY-g.sy;
    if(Math.abs(dx)>8||Math.abs(dy)>8){g.moved=true;clearTimeout(longTimer);}
    if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)*1.25&&Number.isFinite($("video").duration)){
      g.seeking=true;
      const maxDelta=Math.min(180,$("video").duration*.22);
      const delta=(dx/layer.clientWidth)*maxDelta;
      $("video").currentTime=Math.max(0,Math.min($("video").duration,g.videoT+delta));
      hud(`${delta>=0?"+":""}${Math.round(delta)}s`,180);
    }
  },{passive:true});
  layer.addEventListener("touchend",e=>{
    clearTimeout(longTimer);
    if(g.long){$("video").playbackRate=g.oldRate;return;}
    if(g.seeking)return;
    if(g.moved)return;
    const now=Date.now(),touch=e.changedTouches[0],rect=layer.getBoundingClientRect();
    if(now-g.lastTap<310){
      if(touch.clientX-rect.left<rect.width/2)seekBy(-10);else seekBy(10);
      g.lastTap=0;
    }else{
      g.lastTap=now;
      setTimeout(()=>{if(Date.now()-g.lastTap>=300 && g.lastTap){showPlayerUi();g.lastTap=0;}},315);
    }
  },{passive:true});
}

function wireUi(){
  document.querySelectorAll(".navBtn").forEach(b=>b.onclick=()=>{
    const v=b.dataset.view;showView(v);
    if(v==="subs")loadSubscriptions();if(v==="library")renderLibrary();
  });
  $("logoBtn").onclick=()=>showView("home");
  $("settingsTop").onclick=()=>{populateSettings();$("settingsDialog").showModal();};
  $("closeSettings").onclick=()=>$("settingsDialog").close();
  $("saveSettings").onclick=()=>{saveSettingsFromUi();$("settingsDialog").close();loadHome();};
  $("testInstance").onclick=testInstance;
  $("refreshHome").onclick=loadHome;
  $("searchGo").onclick=doSearch;
  $("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch();});
  $("closePlayer").onclick=goBackFromWatch;
  $("playPause").onclick=playToggle;$("centerPlay").onclick=playToggle;
  $("back10").onclick=()=>seekBy(-10);$("fwd10").onclick=()=>seekBy(10);
  $("speedBtn").onclick=()=>$("speedDialog").showModal();
  $("captionsBtn").onclick=showCaptionsDialog;
  $("fullscreenBtn").onclick=async()=>{
    const box=$("playerBox");
    try{if(box.requestFullscreen)await box.requestFullscreen();else if($("video").webkitEnterFullscreen)$("video").webkitEnterFullscreen();}catch{}
  };
  $("favoriteBtn").onclick=toggleFavorite;
  $("subscribeBtn").onclick=toggleSubscribe;
  $("autoplayBtn").onclick=()=>{
    state.settings.autoplay=!state.settings.autoplay;saveJSON(LS.settings,state.settings);
    $("autoplayBtn").classList.toggle("active",state.settings.autoplay);
  };
  $("shareBtn").onclick=async()=>{
    const url=`https://www.youtube.com/watch?v=${state.currentVideoId}`;
    try{if(navigator.share)await navigator.share({title:state.current?.title||"Video",url});else await navigator.clipboard.writeText(url);}catch{}
  };
  document.querySelectorAll(".chip[data-library]").forEach(b=>b.onclick=()=>{
    state.libraryMode=b.dataset.library;
    document.querySelectorAll(".chip[data-library]").forEach(x=>x.classList.toggle("active",x===b));renderLibrary();
  });
  $("clearLibrary").onclick=()=>{
    if(state.libraryMode==="history"){state.history=[];saveJSON(LS.history,[]);}
    else{state.favorites=[];saveJSON(LS.favorites,[]);}
    renderLibrary();
  };
  window.addEventListener("hashchange",()=>{
    const h=location.hash.replace("#","");
    if(["home","search","subs","library"].includes(h))showView(h,false);
  });
}

function restoreInitialView(){
  const h=location.hash.replace("#","");
  if(["home","search","subs","library"].includes(h))showView(h,false);else showView("home",false);
}

async function boot(){
  initSpeedDialog();wireUi();installPlayerEvents();installGestures();restoreInitialView();
  $("autoplayBtn").classList.toggle("active",state.settings.autoplay);
  renderLibrary();
  await loadHome();
  if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
boot();
