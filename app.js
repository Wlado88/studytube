
"use strict";

const $ = id => document.getElementById(id);
const LS = {
  settings: "studytube_settings_v2",
  history: "studytube_history_v2",
  favorites: "studytube_favorites_v2",
  subs: "studytube_subscriptions_v2",
  instances: "studytube_instances_v4",
  watchLater: "studytube_watchlater_v4"
};

const DEFAULT_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com"
];
const PIPED_INSTANCES = [
  // Official public-instance list checked 2026-09-11. Listing is not proof of playback.
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi-libre.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc"
];
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl";

const defaultSettings = {
  instance: DEFAULT_INSTANCES[0],
  customInstance: "",
  customPipedInstance: "",
  ownServer: "",
  quality: "auto",
  proxy: true,
  preferAdaptive: true,
  pipedFallback: true,
  holdSpeed: 2,
  sponsorBlock: true,
  autoplay: true,
  rememberHistory: true,
  preferGoogleData: true,
  googleClientId: "",
  sbCategories: ["sponsor","selfpromo","interaction"]
};

const state = {
  settings: {...defaultSettings, ...readJSON(LS.settings, {})},
  history: readJSON(LS.history, []),
  favorites: readJSON(LS.favorites, []),
  subscriptions: readJSON(LS.subs, []),
  watchLater: readJSON(LS.watchLater, []),
  instanceRegistry: readJSON(LS.instances, null),
  registryAttemptedAt: 0,
  registryRefresh: null,
  connectionTestController: null,
  lastWorkingInstance: "",
  homeRequest: 0,
  searchRequest: 0,
  localFiles: new Map(),
  localObjectURL: null,
  queue: sanitizeQueue(readJSON("studytube_queue_v1", [])),
  bookmarks: sanitizeBookmarks(readJSON("studytube_marks_v1", [])),
  studyLoop: null,
  repeatOne: false,
  advancing: false,
  ownServerToken: sessionStorage.getItem("studytube_server_token") || "",
  prepareController: null,
  videoRequest: 0,
  sourceRequest: 0,
  cancelSourceWait: null,
  current: null,
  currentVideoId: null,
  related: [],
  sponsorSegments: [],
  sponsorWatch: null,
  activeView: "home",
  priorView: "home",
  libraryMode: "history",
  uiTimer: null,
  lastPositionSave: 0,
  googleToken: sessionStorage.getItem("studytube_google_token") || "",
  googleTokenExpiry: Number(sessionStorage.getItem("studytube_google_expiry") || 0),
  googleProfile: readJSON("studytube_google_profile", null),
  googleChannel: null,
  ytLikes: [],
  
  currentInstance: "",
  audioMode: false,
  videoStream: null,
  audioStream: null,
  sleepTimer: null,
  sleepEndsAt: 0,
  playback: null,
  playbackMode: "",
  dashPlayer: null,
  failoverUsed: false,
  pipedInstance: "",
  lastPlaybackTime: 0
};

function sanitizeQueue(value){
  if(!Array.isArray(value))return [];
  const seen=new Set();
  return value.filter(x=>x&&/^[A-Za-z0-9_-]{11}$/.test(x.videoId||"")&&!seen.has(x.videoId)&&seen.add(x.videoId)).slice(0,100)
    .map(x=>({videoId:x.videoId,title:String(x.title||"Video").slice(0,250)}));
}
function sanitizeBookmarks(value){
  if(!Array.isArray(value))return [];
  return value.filter(x=>x&&/^[A-Za-z0-9_-]{11}$/.test(x.videoId||"")&&Number.isFinite(x.time)&&x.time>=0&&x.time<=86400)
    .slice(0,1000).map(x=>({videoId:x.videoId,time:x.time,label:String(x.label||"Reper").slice(0,100)}));
}
function isLocalVideo(){return !!state.currentVideoId&&state.localFiles.has(state.currentVideoId);}
function releaseLocalURL(){
  if(state.localObjectURL){URL.revokeObjectURL(state.localObjectURL);state.localObjectURL=null;}
}
function resetStudyLoop(){state.studyLoop=null;$("loopStatus").textContent="A–B oprit";}
function updateLocalUi(){
  const local=isLocalVideo();
  for(const id of ["qualityBtn","captionsBtn","audioModeBtn","downloadBtn","favoriteBtn","watchLaterBtn","ytLikeBtn","subscribeBtn","sendCommentBtn","shareBtn"]){$(id).disabled=local;}
  $("channelCard").classList.toggle("hidden",local);
  if(!local)updateGoogleUi();
}
function rememberQueue(){saveJSON("studytube_queue_v1",sanitizeQueue(state.queue));}
function queueItem(info){
  if(!info||!(/^[A-Za-z0-9_-]{11}$/.test(info.videoId||"")||state.localFiles.has(info.videoId)))return false;
  if(state.queue.length>=100||state.queue.some(x=>x.videoId===info.videoId))return false;
  state.queue.push({videoId:info.videoId,title:String(info.title||"Video").slice(0,250)});
  rememberQueue();renderQueue();return true;
}
function moveQueue(index,offset){
  const target=index+offset;
  if(!Number.isInteger(index)||![-1,1].includes(offset)||index<0||target<0||index>=state.queue.length||target>=state.queue.length)return;
  [state.queue[index],state.queue[target]]=[state.queue[target],state.queue[index]];rememberQueue();renderQueue();
}
function removeQueue(index){if(!Number.isInteger(index)||index<0||index>=state.queue.length)return;state.queue.splice(index,1);rememberQueue();renderQueue();}
function advanceQueue(){
  if(state.advancing)return true;
  const item=state.queue.shift();if(!item)return false;
  state.advancing=true;rememberQueue();renderQueue();resetStudyLoop();
  try{
    const action=item.videoId===state.currentVideoId&&state.playback&&!$("video").error
      ? ($("video").currentTime=0,$("video").play()) : openVideo(item.videoId);
    Promise.resolve(action).catch(e=>{if(state.currentVideoId===item.videoId)playerProblem(e.message);}).finally(()=>{state.advancing=false;});
  }catch(e){state.advancing=false;playerProblem(e.message);}
  return true;
}
function renderQueue(){
  $("queueCount").textContent=String(state.queue.length);
  const host=$("queueList");host.innerHTML="";
  if(!state.queue.length){host.textContent="Coada este goală. Adaugă un link sau un videoclip.";return;}
  state.queue.forEach((item,index)=>{
    const row=document.createElement("div");row.className="queueRow";
    const title=document.createElement("span");title.textContent=`${index+1}. ${item.title}`;row.appendChild(title);
    for(const [label,fn,disabled] of [["↑",()=>moveQueue(index,-1),index===0],["↓",()=>moveQueue(index,1),index===state.queue.length-1],["✕",()=>removeQueue(index),false]]){
      const button=document.createElement("button");button.className="ghostBtn";button.textContent=label;button.disabled=disabled;
      button.setAttribute("aria-label",label==="✕"?"Scoate din coadă":label==="↑"?"Mută mai sus":"Mută mai jos");button.onclick=fn;row.appendChild(button);
    }
    host.appendChild(row);
  });
}
function addBookmark(){
  const video=$("video"),id=state.currentVideoId;
  if(!id||!Number.isFinite(video.duration)||video.duration<=0||!Number.isFinite(video.currentTime)||video.currentTime>video.duration)return;
  const time=Math.max(0,video.currentTime);
  if(state.bookmarks.some(x=>x.videoId===id&&Math.abs(x.time-time)<1))return;
  if(state.bookmarks.filter(x=>x.videoId===id).length>=50){hud("Maximum 50 de repere pe video");return;}
  state.bookmarks.push({videoId:id,time,label:$("bookmarkLabel").value.trim().slice(0,100)||fmtDuration(time)});
  state.bookmarks=state.bookmarks.slice(-1000);
  saveJSON("studytube_marks_v1",sanitizeBookmarks(state.bookmarks));$("bookmarkLabel").value="";renderBookmarks();
}
function renderBookmarks(){
  const host=$("bookmarkList");host.innerHTML="";
  const marks=state.bookmarks.filter(x=>x.videoId===state.currentVideoId).sort((a,b)=>a.time-b.time);
  if(!marks.length){host.textContent="Niciun reper pentru acest videoclip.";return;}
  for(const mark of marks){
    const row=document.createElement("div");row.className="queueRow";
    const seek=document.createElement("button");seek.className="ghostBtn";seek.textContent=fmtDuration(mark.time)+" · "+mark.label;
    seek.onclick=()=>{const v=$("video");if(Number.isFinite(v.duration)&&mark.time<=v.duration)v.currentTime=mark.time;};
    const remove=document.createElement("button");remove.className="dangerGhost";remove.textContent="Șterge";
    remove.onclick=()=>{state.bookmarks=state.bookmarks.filter(x=>x!==mark);saveJSON("studytube_marks_v1",sanitizeBookmarks(state.bookmarks));renderBookmarks();};
    row.appendChild(seek);row.appendChild(remove);host.appendChild(row);
  }
}
function markLoop(which){
  const v=$("video");if(!state.currentVideoId||!Number.isFinite(v.duration)||v.duration<=0||!Number.isFinite(v.currentTime)||v.currentTime<0||v.currentTime>v.duration)return;
  if(which==="A"){state.studyLoop={id:state.currentVideoId,start:v.currentTime,end:null};$("loopStatus").textContent="A: "+fmtDuration(v.currentTime)+" · Alege B";}
  if(which==="B"){
    const loop=state.studyLoop;
    if(!loop||loop.id!==state.currentVideoId||v.currentTime-loop.start<.5){hud("B trebuie să fie după A");return;}
    loop.end=v.currentTime;v.currentTime=loop.start;$("loopStatus").textContent=`A–B: ${fmtDuration(loop.start)} – ${fmtDuration(loop.end)}`;
  }
}
function applyStudyLoop(){
  const loop=state.studyLoop,v=$("video");
  if(!loop||loop.id!==state.currentVideoId||!Number.isFinite(loop.end)||v.paused||v.seeking||!Number.isFinite(v.duration)||loop.end>v.duration)return false;
  if(v.currentTime>=loop.end){v.currentTime=loop.start;return true;}return false;
}
function enforceSleepDeadline(){
  if(state.sleepEndsAt>0&&Date.now()>=state.sleepEndsAt){clearTimeout(state.sleepTimer);state.sleepTimer=null;state.sleepEndsAt=0;$("video").pause();$("sleepBtn").textContent="☾ Sleep";return true;}
  return false;
}
function onPlaybackEnded(){
  stopSponsorWatch();
  if(enforceSleepDeadline())return;
  if(state.sleepEndsAt===-1){state.sleepEndsAt=0;$("sleepBtn").textContent="☾ Sleep";return;}
  if(state.studyLoop?.id===state.currentVideoId&&Number.isFinite(state.studyLoop.end)){$("video").currentTime=state.studyLoop.start;$("video").play().catch(e=>playerProblem(e.message));return;}
  if(state.repeatOne){$("video").currentTime=0;$("video").play().catch(e=>playerProblem(e.message));return;}
  if(advanceQueue())return;
  if(state.settings.autoplay&&state.related[0]?.videoId)openVideo(state.related[0].videoId);
}
function addLocalFiles(files){
  const accepted=[];
  for(const file of Array.from(files||[])){
    if(state.localFiles.size>=50)break;
    if(!file||!file.size||!(/^(video|audio)\//.test(file.type||"")||/\.(mp4|m4v|mov|webm|m4a|mp3|ogg|wav)$/i.test(file.name||"")))continue;
    const id="local:"+crypto.randomUUID();state.localFiles.set(id,file);accepted.push({videoId:id,title:file.name});
  }
  renderLocalFiles();
  if(accepted.length){for(const item of accepted.slice(1))queueItem(item);openLocalVideo(accepted[0].videoId);}
  else $("localFilesStatus").textContent="Selectează un fișier video sau audio nevid (maximum 50 în sesiune).";
  return accepted;
}
function renderLocalFiles(){
  const host=$("localFilesList");host.innerHTML="";
  $("localFilesStatus").textContent=state.localFiles.size?`${state.localFiles.size} fișiere în sesiune. După reîncărcare, selectează-le din nou din Fișiere.`:"Fișierele se redau pe dispozitiv, fără încărcare pe server.";
  for(const [id,file] of state.localFiles){
    const row=document.createElement("div");row.className="queueRow";
    for(const [label,fn] of [[file.name,()=>openLocalVideo(id)],["＋ Coada",()=>queueItem({videoId:id,title:file.name})],["Elimină",()=>{if(state.currentVideoId===id)closePlayback();state.localFiles.delete(id);state.queue=state.queue.filter(x=>x.videoId!==id);state.bookmarks=state.bookmarks.filter(x=>x.videoId!==id);rememberQueue();renderQueue();renderLocalFiles();}]]){
      const b=document.createElement("button");b.className="ghostBtn";b.textContent=label;b.onclick=fn;row.appendChild(b);
    }
    host.appendChild(row);
  }
}
function openLocalVideo(id){
  const file=state.localFiles.get(id);if(!file)return Promise.resolve();
  if(state.currentVideoId===id&&state.localObjectURL&&!$("video").error){showView("watch");return Promise.resolve();}
  state.prepareController?.abort();++state.videoRequest;++state.sourceRequest;
  if(state.cancelSourceWait)state.cancelSourceWait();stopSponsorWatch();cleanupDash();
  const v=$("video");v.pause();v.removeAttribute("src");v.load();releaseLocalURL();resetStudyLoop();
  state.currentVideoId=id;state.current={videoId:id,title:file.name,author:"Fișier de pe iPhone",videoThumbnails:[]};
  state.related=[];state.sponsorSegments=[];state.lastPlaybackTime=0;state.audioMode=false;state.videoStream=null;state.audioStream=null;
  state.playback={provider:"Local",progressive:[],audio:[]};state.playbackMode="local";
  state.localObjectURL=URL.createObjectURL(file);v.src=state.localObjectURL;
  v.querySelectorAll("track").forEach(t=>t.remove());
  $("playerBox").classList.remove("audioMode");$("audioModeBtn").classList.remove("enabled");$("qualityBtn").textContent="Fișier local";$("playbackProblem").classList.add("hidden");
  $("videoTitle").textContent=file.name;$("miniTitle").textContent=file.name;$("videoMeta").textContent="Fișier local · "+Math.round(file.size/1024/1024)+" MB";
  $("descriptionText").textContent="Fișier ales din dispozitiv. Nu este încărcat pe server.";
  $("relatedGrid").innerHTML="";$("commentsList").innerHTML="";setStatus("commentsStatus","");
  document.title=file.name+" · StudyTube";
  showView("watch");updateLocalUi();renderBookmarks();setLoading(false);v.load();updateMediaSession();
  const request=state.videoRequest;
  return v.play().catch(e=>{if(request===state.videoRequest)playerProblem("Fișierul nu a pornit. Atinge Play sau verifică formatul: "+e.message);});
}
function installFreeFeatures(){
  $("openLocalFiles").onclick=()=>$("localFilesInput").click();
  $("localFilesInput").onchange=e=>{addLocalFiles(e.target.files);e.target.value="";};
  $("openQueue").onclick=()=>{renderQueue();$("queueDialog").showModal();};
  $("closeQueue").onclick=()=>$("queueDialog").close();
  $("addQueueLink").onclick=()=>{const id=extractId($("queueLink").value);if(!id){$("queueStatus").textContent="Introdu un link YouTube valid.";return;}const ok=queueItem({videoId:id,title:id});$("queueStatus").textContent=ok?"Adăugat în coadă.":"Există deja în coadă sau coada este plină.";if(ok)$("queueLink").value="";};
  $("queueCurrent").onclick=()=>queueItem(state.current);
  $("nextQueued").onclick=()=>{if(!advanceQueue())hud("Coada este goală");};
  $("repeatOne").onchange=e=>{state.repeatOne=e.target.checked;};
  $("markA").onclick=()=>markLoop("A");$("markB").onclick=()=>markLoop("B");$("clearLoop").onclick=resetStudyLoop;
  $("addBookmark").onclick=addBookmark;
  window.addEventListener("pageshow",enforceSleepDeadline);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)enforceSleepDeadline();});
  renderQueue();renderLocalFiles();
}

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
  input=String(input||"").trim();
  const valid=id=>/^[A-Za-z0-9_-]{11}$/.test(id||"")?id:null;
  if(valid(input))return input;
  try{
    const u=new URL(input);if(u.protocol!=="https:"&&u.protocol!=="http:")return null;
    if(u.hostname==="youtu.be")return valid(u.pathname.split("/").filter(Boolean)[0]);
    if(!["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com"].includes(u.hostname))return null;
    if(u.pathname==="/watch")return valid(u.searchParams.get("v"));
    const p=u.pathname.split("/").filter(Boolean);
    if(["shorts","embed","live"].includes(p[0]))return valid(p[1]);
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
  const abort=()=>ctrl.abort();
  if(opts.signal?.aborted)ctrl.abort();
  else opts.signal?.addEventListener("abort",abort,{once:true});
  const t=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const r=await fetch(url,{...opts,signal:ctrl.signal,headers:{Accept:"application/json",...(opts.headers||{})}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{clearTimeout(t);opts.signal?.removeEventListener("abort",abort);}
}


async function ownRequest(path,options={}){
  const server=cleanInstance(state.settings.ownServer);
  if(!validInstance(server))throw new Error("Adresa serviciului StudyTube nu este validă.");
  if(!state.ownServerToken)throw new Error("Introdu cheia serviciului StudyTube în Setări.");
  const ctrl=new AbortController(),abort=()=>ctrl.abort();
  options.signal?.addEventListener("abort",abort,{once:true});
  if(options.signal?.aborted)ctrl.abort();
  const timer=setTimeout(abort,45000);
  try{
    const r=await fetch(server+path,{...options,signal:ctrl.signal,credentials:"omit",headers:{"Accept":"application/json","Authorization":"Bearer "+state.ownServerToken,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
    const data=await r.json();if(!r.ok)throw new Error(data.error||`Serviciul a răspuns cu HTTP ${r.status}`);
    return data;
  }finally{clearTimeout(timer);options.signal?.removeEventListener("abort",abort);}
}
function waitForPreparation(signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(new DOMException("Anulat","AbortError"));};
    const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},1200);
    signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
  });
}
async function prepareOwnVideo(id,request){
  state.prepareController?.abort();const controller=new AbortController();state.prepareController=controller;
  const signal=controller.signal,current=()=>request===state.videoRequest&&!signal.aborted;
  const configured=Number(state.settings.quality);
  const height=[240,360,480,720,1080].includes(configured)?configured:720;
  try{
    let job=await ownRequest("/api/jobs",{method:"POST",body:JSON.stringify({videoId:id,height}),signal});
    const started=Date.now();
    while(current()&&job.status!=="ready"){
      if(job.status==="error")throw new Error(job.message||"Pregătirea a eșuat.");
      if(!["queued","preparing"].includes(job.status)||!/^[a-f0-9]{32}$/.test(job.id||""))throw new Error("Răspuns de pregătire invalid.");
      if(Date.now()-started>660000)throw new Error("Pregătirea durează prea mult. Poți reveni din Fișiere pregătite.");
      setLoading(true,job.stage||"Pregătesc videoclipul…");
      await waitForPreparation(signal);job=await ownRequest("/api/jobs/"+job.id,{signal});
    }
    if(!current())return null;
    if(job.videoId!==id||!job.info||!String(job.mediaPath||"").startsWith("/media/")||job.mediaPath.startsWith("//"))throw new Error("Fișierul primit nu corespunde videoclipului ales.");
    const url=cleanInstance(state.settings.ownServer)+job.mediaPath;
    const actual=Number(job.actualHeight)||height;
    return {info:job.info,playback:{provider:"StudyTube propriu",instance:state.settings.ownServer,jobId:job.id,expires:job.expires,
      progressive:[{url,container:"mp4",height:actual,label:`${actual}p`,kind:"progressive"}],audio:String(job.audioPath||"").startsWith("/audio/")?[{url:cleanInstance(state.settings.ownServer)+job.audioPath,quality:"AAC",container:"m4a",kind:"audio"}]:[],videoOnly:[],hlsUrl:"",dashUrl:""}};
  }finally{if(state.prepareController===controller)state.prepareController=null;}
}
async function managePrepared(){
  const host=$("preparedList");host.textContent="Încarc fișierele…";$("preparedDialog").showModal();
  try{
    const {jobs}=await ownRequest("/api/jobs");host.innerHTML="";
    if(!jobs.length){host.textContent="Nu există fișiere pregătite.";return;}
    jobs.forEach(job=>{
      const row=document.createElement("div");row.className="preparedRow";
      const title=document.createElement("p");title.textContent=(job.info?.title||job.videoId)+" · "+job.stage;row.appendChild(title);
      if(job.status==="ready"){
        const play=document.createElement("button");play.className="primaryBtn";play.textContent="Redă";
        play.onclick=()=>{$("preparedDialog").close();state.settings.quality=String(job.height);state.playback=null;openVideo(job.videoId);};row.appendChild(play);
        const download=document.createElement("button");download.className="ghostBtn";download.textContent="Salvează MP4";
        download.onclick=()=>{if(String(job.mediaPath).startsWith("/media/"))openDownloadUrl(cleanInstance(state.settings.ownServer)+job.mediaPath+"&download=1",safeFilename(job.info?.title)+".mp4");};row.appendChild(download);
      }
      if(["ready","error"].includes(job.status)){
        const remove=document.createElement("button");remove.className="dangerGhost";remove.textContent="Șterge de pe server";
        remove.onclick=async()=>{try{await ownRequest("/api/jobs/"+job.id,{method:"DELETE"});row.remove();}catch(e){title.textContent=e.message;}};row.appendChild(remove);
      }
      host.appendChild(row);
    });
  }catch(e){host.textContent=e.message;}
}


function googleConnected(){
  return !!state.googleToken && Date.now() < state.googleTokenExpiry - 15000;
}
async function googleFetch(path, opts={}){
  if(!googleConnected()) throw new Error("Sesiunea Google a expirat. Reconectează contul.");
  const r=await fetch(`https://www.googleapis.com/youtube/v3${path}`,{
    ...opts,
    headers:{Authorization:`Bearer ${state.googleToken}`,"Content-Type":"application/json",...(opts.headers||{})}
  });
  if(r.status===401){ googleSignOut(false); throw new Error("Sesiunea Google a expirat."); }
  if(!r.ok){
    let msg=`Google API HTTP ${r.status}`;
    try{const j=await r.json();msg=j?.error?.message||msg;}catch{}
    throw new Error(msg);
  }
  if(r.status===204)return {};
  return await r.json();
}
function waitForGoogleLibrary(timeout=8000){
  return new Promise((resolve,reject)=>{
    const start=Date.now();
    const t=setInterval(()=>{
      if(window.google?.accounts?.oauth2){clearInterval(t);resolve();}
      else if(Date.now()-start>timeout){clearInterval(t);reject(new Error("Google Identity Services nu s-a încărcat."));}
    },100);
  });
}
async function googleSignIn(){
  const clientId=(state.settings.googleClientId||$("googleClientId")?.value||"").trim();
  if(!clientId){ $("googleStatus").textContent="Introdu mai întâi OAuth Client ID și salvează."; return; }
  state.settings.googleClientId=clientId; saveJSON(LS.settings,state.settings);
  try{
    await waitForGoogleLibrary();
    const tokenClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:GOOGLE_SCOPES,
      prompt:"consent",
      callback:async resp=>{
        if(resp.error){$("googleStatus").textContent=`Google: ${resp.error}`;return;}
        state.googleToken=resp.access_token;
        state.googleTokenExpiry=Date.now()+(Number(resp.expires_in||3600)*1000);
        sessionStorage.setItem("studytube_google_token",state.googleToken);
        sessionStorage.setItem("studytube_google_expiry",String(state.googleTokenExpiry));
        await syncGoogleAccount(true);
      }
    });
    tokenClient.requestAccessToken();
  }catch(e){ $("googleStatus").textContent=e.message; }
}
function googleSignOut(revoke=true){
  const token=state.googleToken;
  if(revoke && token && window.google?.accounts?.oauth2?.revoke){ try{google.accounts.oauth2.revoke(token,()=>{});}catch{} }
  state.googleToken="";state.googleTokenExpiry=0;state.googleProfile=null;state.googleChannel=null;state.ytLikes=[];
  sessionStorage.removeItem("studytube_google_token");sessionStorage.removeItem("studytube_google_expiry");
  localStorage.removeItem("studytube_google_profile");
  updateGoogleUi();
}
function updateGoogleUi(){
  const connected=googleConnected() && state.googleProfile;
  $("googleLoginBtn")?.classList.toggle("hidden",!!connected);
  $("googleLogoutBtn")?.classList.toggle("hidden",!connected);
  $("syncGoogleBtn")?.classList.toggle("hidden",!connected);
  $("commentComposer")?.classList.toggle("hidden",!connected);
  if(connected){
    $("accountName").textContent=state.googleProfile.title||"YouTube";
    $("accountDetail").textContent="Conectat prin OAuth Google";
    $("googleTopText").textContent="Cont";
    const av=state.googleProfile.avatar||"";
    if(av){$("accountAvatar").src=av;$("accountAvatar").classList.remove("hidden");$("googleTopAvatar").src=av;$("googleTopAvatar").classList.remove("hidden");}
  }else{
    $("accountName").textContent="Cont YouTube neconectat";$("accountDetail").textContent="OAuth oficial Google / YouTube Data API";$("googleTopText").textContent="Google";
    $("accountAvatar")?.classList.add("hidden");$("googleTopAvatar")?.classList.add("hidden");
  }
}
async function fetchAllPages(path, limitPages=10){
  let out=[], token="";
  for(let i=0;i<limitPages;i++){
    const sep=path.includes("?")?"&":"?";
    const d=await googleFetch(path+(token?`${sep}pageToken=${encodeURIComponent(token)}`:""));
    out.push(...(d.items||[])); token=d.nextPageToken||""; if(!token)break;
  }
  return out;
}
function playlistItemsToVideos(items){
  return (items||[]).map(x=>{
    const s=x.snippet||{}, r=s.resourceId||{}, c=x.contentDetails||{};
    const videoId=r.videoId||c.videoId;
    if(!videoId)return null;
    return {videoId,title:s.title||"Video",author:s.videoOwnerChannelTitle||"YouTube",authorId:s.videoOwnerChannelId||"",videoThumbnails:Object.values(s.thumbnails||{}).map(t=>({url:t.url})),publishedText:"YouTube"};
  }).filter(Boolean);
}
async function syncGoogleAccount(showStatus=false){
  if(!googleConnected()){updateGoogleUi();return;}
  if(showStatus && $("googleStatus"))$("googleStatus").textContent="Sincronizez contul…";
  try{
    const ch=await googleFetch("/channels?part=snippet,contentDetails,statistics&mine=true");
    const channel=ch.items?.[0]; if(!channel)throw new Error("Contul nu are canal YouTube disponibil.");
    state.googleChannel=channel;
    const sn=channel.snippet||{};
    state.googleProfile={title:sn.title||"YouTube",avatar:sn.thumbnails?.default?.url||sn.thumbnails?.medium?.url||"",channelId:channel.id};
    saveJSON("studytube_google_profile",state.googleProfile);

    const subs=await fetchAllPages("/subscriptions?part=snippet&mine=true&maxResults=50",8);
    state.subscriptions=subs.map(x=>({
      ytSubscriptionId:x.id,
      authorId:x.snippet?.resourceId?.channelId||"",
      author:x.snippet?.title||"",
      authorThumbnails:Object.values(x.snippet?.thumbnails||{}).map(t=>({url:t.url})),
      google:true
    })).filter(x=>x.authorId);
    saveJSON(LS.subs,state.subscriptions);

    const rel=channel.contentDetails?.relatedPlaylists||{};
    if(rel.likes){
      const likes=await fetchAllPages(`/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(rel.likes)}&maxResults=50`,4);
      state.ytLikes=playlistItemsToVideos(likes);
    }
    updateGoogleUi();renderLibrary();
    if(showStatus && $("googleStatus"))$("googleStatus").textContent=`Conectat: ${state.googleProfile.title} · ${state.subscriptions.length} abonamente sincronizate`;
  }catch(e){if($("googleStatus"))$("googleStatus").textContent=`Google sync: ${e.message}`;}
}
async function googleSearch(q){
  const d=await googleFetch(`/search?part=snippet&type=video&maxResults=25&regionCode=RO&q=${encodeURIComponent(q)}`);
  return (d.items||[]).map(x=>({videoId:x.id?.videoId,title:x.snippet?.title,author:x.snippet?.channelTitle,authorId:x.snippet?.channelId,videoThumbnails:Object.values(x.snippet?.thumbnails||{}).map(t=>({url:t.url})),publishedText:"YouTube"})).filter(x=>x.videoId);
}
async function googleHome(){
  const d=await googleFetch("/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=RO&maxResults=25");
  return (d.items||[]).map(x=>({videoId:x.id,title:x.snippet?.title,author:x.snippet?.channelTitle,authorId:x.snippet?.channelId,videoThumbnails:Object.values(x.snippet?.thumbnails||{}).map(t=>({url:t.url})),viewCount:Number(x.statistics?.viewCount||0),publishedText:"Popular",lengthSeconds:isoDurationSeconds(x.contentDetails?.duration)}));
}
function isoDurationSeconds(s){
  if(!s)return 0;const m=s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);return m?(Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0)):0;
}
async function googleRate(rating="like"){
  if(!googleConnected())return alert("Conectează contul Google mai întâi.");
  try{await googleFetch(`/videos/rate?id=${encodeURIComponent(state.currentVideoId)}&rating=${encodeURIComponent(rating)}`,{method:"POST"});$("ytLikeBtn").textContent=rating==="like"?"♥ Apreciat":"♡ Like YouTube";$("ytLikeBtn").classList.toggle("enabled",rating==="like");}
  catch(e){alert(e.message);}
}
async function googleSubscribeToggle(){
  if(!googleConnected())return false;
  const channelId=state.current?.authorId;if(!channelId)return false;
  try{
    const found=state.subscriptions.find(x=>x.authorId===channelId);
    if(found?.ytSubscriptionId){await googleFetch(`/subscriptions?id=${encodeURIComponent(found.ytSubscriptionId)}`,{method:"DELETE"});state.subscriptions=state.subscriptions.filter(x=>x.authorId!==channelId);}
    else{
      const body={snippet:{resourceId:{kind:"youtube#channel",channelId}}};
      const created=await googleFetch("/subscriptions?part=snippet",{method:"POST",body:JSON.stringify(body)});
      state.subscriptions.unshift({ytSubscriptionId:created.id,authorId:channelId,author:state.current.author,authorThumbnails:state.current.authorThumbnails,google:true});
    }
    saveJSON(LS.subs,state.subscriptions);setSubscribeUi();return true;
  }catch(e){alert(`YouTube: ${e.message}`);return false;}
}
async function postGoogleComment(){
  if(!googleConnected())return alert("Conectează Google mai întâi.");
  const text=$("commentInput").value.trim();if(!text)return;
  const body={snippet:{videoId:state.currentVideoId,topLevelComment:{snippet:{textOriginal:text}}}};
  try{await googleFetch("/commentThreads?part=snippet",{method:"POST",body:JSON.stringify(body)});$("commentInput").value="";await loadComments(state.currentVideoId);}
  catch(e){alert(`Comentariul nu a fost trimis: ${e.message}`);}
}
function validInstance(value){
  try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}
}
function registryRows(){return Array.isArray(state.instanceRegistry?.instances)?state.instanceRegistry.instances:[];}
function registryFresh(){const age=Date.now()-Number(state.instanceRegistry?.checkedAt||0);return age>=0&&age<6*60*60*1000;}
function instanceBlocked(instance){
  if(!registryFresh())return false;
  const record=registryRows().find(x=>x.url===instance);
  return !!record&&(record.api===false||record.cors===false);
}
function availableInstances(){return registryRows().filter(x=>x.api===true&&x.cors===true).map(x=>x.url);}
function instanceCandidates(){
  return [...new Set([activeInstance(),state.lastWorkingInstance,...availableInstances(),...DEFAULT_INSTANCES])]
    .map(cleanInstance).filter(x=>validInstance(x)&&!instanceBlocked(x));
}
function catalogArray(data){
  if(!Array.isArray(data))throw new Error("Serverul nu a returnat un catalog video valid.");
  return data;
}
async function refreshPublicInstances(silent=false){
  if(!silent&&$("instanceStatus"))$("instanceStatus").textContent="Actualizez lista…";
  try{
    const data=await fetchJSON("https://api.invidious.io/instances.json",{},8000);
    if(!Array.isArray(data))throw new Error("Registrul nu a returnat o listă validă.");
    const instances=data.filter(x=>Array.isArray(x)&&x[1]?.type==="https")
      .map(([host,info])=>({url:cleanInstance(`https://${host}`),api:info.api,cors:info.cors}))
      .filter(x=>validInstance(x.url));
    state.instanceRegistry={instances,checkedAt:Date.now()};
    saveJSON(LS.instances,state.instanceRegistry);
    populateInstanceSelect();
    const count=availableInstances().length;
    if(!silent&&$("instanceStatus"))$("instanceStatus").textContent=count
      ?`${count} instanțe cu acces API din browser, conform registrului. Redarea trebuie testată separat.`
      :"Registrul nu indică instanțe publice cu API și CORS active. Site-urile lor pot fi online, dar conexiunea PWA nu este disponibilă.";
    return instances;
  }catch(e){if(!silent&&$("instanceStatus"))$("instanceStatus").textContent=`Registrul nu poate fi citit: ${e.message}. Asta nu dovedește că serverele sunt căzute.`;return null;}
}
function populateInstanceSelect(preserveSelection=true){
  const sel=$("instanceSelect");if(!sel)return;const current=cleanInstance((preserveSelection&&sel.value)||state.settings.instance||DEFAULT_INSTANCES[0]);sel.innerHTML="";
  const instances=[current,...availableInstances(),...DEFAULT_INSTANCES].map(cleanInstance).filter(validInstance);
  [...new Set(instances)].forEach(x=>{const o=document.createElement("option");o.value=x;o.textContent=x.replace("https://","")+(instanceBlocked(x)?" · API/CORS indisponibil":"");sel.appendChild(o);});
  if([...sel.options].some(o=>o.value===current))sel.value=current;
}
async function ensureInstanceRegistry(){
  if(registryFresh())return;
  if(state.registryRefresh)return state.registryRefresh;
  if(Date.now()-state.registryAttemptedAt<60000)return;
  state.registryAttemptedAt=Date.now();
  state.registryRefresh=refreshPublicInstances(true).finally(()=>{state.registryRefresh=null;});
  return state.registryRefresh;
}
async function withInstanceFallback(pathBuilder,validate=x=>x){
  await ensureInstanceRegistry();
  const candidates=instanceCandidates();
  if(!candidates.length)throw new Error("Invidious: registrul indică API/CORS dezactivate pentru sursele publice configurate.");
  const started=Date.now();
  let lastErr=null;
  for(const inst of candidates){
    const remaining=9000-(Date.now()-started);if(remaining<100)break;
    try{
      const path=pathBuilder(inst);
      const data=validate(await fetchJSON(inst+path,{},Math.min(3500,remaining)));
      state.lastWorkingInstance=inst;
      return {data,instance:inst};
    }catch(e){ lastErr=e; }
  }
  throw new Error(`Invidious: ${lastErr?.message||"conexiune indisponibilă"}`);
}

function setStatus(id,msg){ $(id).textContent=msg||""; }
function showView(name, push=true){
  if(!["home","search","subs","library","watch"].includes(name))return;
  const mini=!!state.currentVideoId&&name!=="watch";
  $("view-watch").classList.toggle("miniWatch",mini);
  document.body.classList.toggle("hasMiniPlayer",mini);
  $("miniTitle").textContent=state.current?.title||"Se încarcă videoclipul…";
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
  showView(state.priorView||"home");
}

function closePlayback(){
  state.prepareController?.abort();
  ++state.videoRequest; ++state.sourceRequest;
  if(state.cancelSourceWait)state.cancelSourceWait();
  clearTimeout(state.sleepTimer);state.sleepEndsAt=0;state.sleepTimer=null;
  stopSponsorWatch();cleanupDash();
  const video=$("video");video.pause();video.removeAttribute("src");video.load();
  releaseLocalURL();resetStudyLoop();
  state.currentVideoId=null;state.current=null;state.playback=null;
  state.related=[];state.sponsorSegments=[];
  setLoading(false);$("playbackProblem").classList.add("hidden");
  if(navigator.mediaSession){navigator.mediaSession.playbackState="none";navigator.mediaSession.metadata=null;}
  showView(state.priorView||"home");
}
function playerProblem(message){
  setLoading(false);
  $("playbackProblemText").textContent=message;
  $("playbackProblem").classList.remove("hidden");
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
  const card=document.createElement("article");card.className="cardWithQueue";card.appendChild(b);
  const queue=document.createElement("button");queue.className="queueCardBtn";queue.textContent="＋ La coadă";queue.onclick=()=>queueItem(v);card.appendChild(queue);
  return card;
}
function renderVideoGrid(id,items){
  const host=$(id); host.innerHTML="";
  const vids=(items||[]).filter(x=>x && x.videoId && (x.type==="video"||x.type==="shortVideo"||!x.type));
  if(!vids.length){ host.innerHTML='<div class="emptyState">Nimic de afișat.</div>'; return; }
  vids.forEach(v=>host.appendChild(makeVideoCard(v)));
}

async function loadHome(){
  const request=++state.homeRequest;
  setStatus("homeStatus","Se încarcă…");
  try{
    const {videos,provider}=await loadCatalog();if(request!==state.homeRequest)return;
    $("homeSubtitle").textContent=(state.settings.ownServer&&provider!=="YouTube Data API"?"Descoperă documentare educative":"Popular în România")+` · ${provider}`;
    renderVideoGrid("homeGrid",videos);setStatus("homeStatus","");
  }catch(e){if(request===state.homeRequest)setStatus("homeStatus",`Catalogul nu poate fi încărcat. ${e.message}`);}
}

async function doSearch(){
  const q=$("searchInput").value.trim();
  if(!q)return;
  const request=++state.searchRequest;
  const id=extractId(q); if(id){ openVideo(id); return; }
  setStatus("searchStatus","Caut…");
  $("searchGrid").innerHTML="";
  try{
    const {videos,provider}=await loadCatalog(q);if(request!==state.searchRequest)return;
    renderVideoGrid("searchGrid",videos);
    setStatus("searchStatus",`${videos.filter(x=>x.videoId).length} rezultate · ${provider}`);
  }catch(e){if(request===state.searchRequest)setStatus("searchStatus",`Căutarea a eșuat: ${e.message}`);}
}

async function loadCatalog(query=null){
  const errors=[];
  if(googleConnected()&&state.settings.preferGoogleData){
    try{return {videos:catalogArray(await (query?googleSearch(query):googleHome())),provider:"YouTube Data API"};}
    catch(e){errors.push(`Google: ${e.message}`);}
  }
  if(state.settings.ownServer){
    const data=await ownRequest("/api/catalog"+(query?"?q="+encodeURIComponent(query):""));
    return {videos:catalogArray(data.videos),provider:data.provider||"StudyTube propriu"};
  }
  try{
    const path=query?`/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance&region=RO&hl=ro`:"/api/v1/trending?region=RO&hl=ro";
    const {data}=await withInstanceFallback(()=>path,catalogArray);
    return {videos:data,provider:"Invidious"};
  }catch(e){errors.push(e.message);}
  if(state.settings.pipedFallback){
    try{
      const path=query?`/search?q=${encodeURIComponent(query)}&filter=videos`:"/trending?region=RO";
      const {data}=await withPipedFallback(path,x=>catalogArray(query?x?.items:x));
      return {videos:data.map(normalizePipedVideo).filter(x=>x.videoId),provider:"Piped"};
    }catch(e){errors.push(e.message);}
  }
  throw new Error(errors.join(" · "));
}

function chooseAudioStream(info, instance){
  const audio=(info.adaptiveFormats||[]).filter(f=>f.url && ((f.type||"").startsWith("audio/") || !f.qualityLabel));
  if(!audio.length)return null;
  audio.sort((a,b)=>Number(a.bitrate||0)-Number(b.bitrate||0));
  const s=audio[audio.length-1];return {...s,url:normalizeUrl(s.url,instance)};
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


function qHeight(f){
  const direct=Number(f.height||0); if(direct)return direct;
  const t=String(f.qualityLabel||f.quality||f.resolution||"");
  const m=t.match(/(\d{3,4})p?/); return m?Number(m[1]):0;
}
function normalizeInvidiousPlayback(info, instance){
  const progressive=(info.formatStreams||[]).filter(f=>f.url).map(f=>({...f,url:normalizeUrl(f.url,instance),height:qHeight(f),label:f.qualityLabel||f.quality||`${qHeight(f)||"?"}p`,kind:"progressive"}));
  const audio=(info.adaptiveFormats||[]).filter(f=>f.url && ((f.type||"").startsWith("audio/") || (!f.qualityLabel && (f.audioQuality||f.audioChannels)))).map(f=>({...f,url:normalizeUrl(f.url,instance),kind:"audio"}));
  const dashUrl=info.dashUrl?normalizeUrl(info.dashUrl,instance):"";
  const hlsUrl=info.hlsUrl?normalizeUrl(info.hlsUrl,instance):"";
  return {provider:"Invidious",instance,progressive,audio,dashUrl,hlsUrl,raw:info};
}
function pipedVideoIdFromUrl(url=""){
  try{const u=new URL(url,"https://x.invalid");return u.searchParams.get("v")||"";}catch{return "";}
}
function normalizePipedVideo(v){
  return {videoId:pipedVideoIdFromUrl(v.url),title:v.title||"Video",author:v.uploaderName||v.uploader||"",authorId:(v.uploaderUrl||"").split("/").pop()||"",lengthSeconds:Number(v.duration)||0,viewCount:Number(v.views)||0,publishedText:v.uploadedDate||"",videoThumbnails:v.thumbnail?[{url:v.thumbnail}]:[]};
}
function normalizePipedInfo(d,id){
  return {videoId:id,title:d.title||"Video",author:d.uploader||"",authorId:(d.uploaderUrl||"").split("/").pop()||"",lengthSeconds:Number(d.duration)||0,viewCount:Number(d.views)||0,publishedText:d.uploadDate||"",description:d.description||"",videoThumbnails:d.thumbnailUrl?[{url:d.thumbnailUrl}]:[],authorThumbnails:d.uploaderAvatar?[{url:d.uploaderAvatar}]:[],recommendedVideos:(d.relatedStreams||[]).map(normalizePipedVideo).filter(x=>x.videoId),captions:(d.subtitles||[]).map(c=>({label:c.name,language_code:c.code,url:c.url}))};
}
function normalizePipedPlayback(d,instance){
  const progressive=(d.videoStreams||[]).filter(f=>f.url && !f.videoOnly).map(f=>({...f,url:f.url,height:Number(f.height)||qHeight(f),label:f.quality||`${f.height||"?"}p`,container:(f.format||"").toLowerCase().includes("mpeg")?"mp4":f.format,kind:"progressive"}));
  const videoOnly=(d.videoStreams||[]).filter(f=>f.url && f.videoOnly).map(f=>({...f,url:f.url,height:Number(f.height)||qHeight(f),label:f.quality||`${f.height||"?"}p`,kind:"videoOnly"}));
  const audio=(d.audioStreams||[]).filter(f=>f.url).map(f=>({...f,url:f.url,kind:"audio"}));
  return {provider:"Piped",instance,progressive,videoOnly,audio,dashUrl:d.dash||"",hlsUrl:d.hls||"",raw:d};
}
async function withPipedFallback(path,validate=x=>x){
  let last=null;
  const candidates=[...new Set([state.settings.customPipedInstance,state.pipedInstance,...PIPED_INSTANCES].map(cleanInstance).filter(validInstance))];
  const started=Date.now();
  for(const inst of candidates){
    const remaining=9000-(Date.now()-started);if(remaining<100)break;
    try{const data=validate(await fetchJSON(inst+path,{},Math.min(3000,remaining)));state.pipedInstance=inst;return {data,instance:inst};}catch(e){last=e;}
  }
  throw new Error(`Piped: ${last?.message||"conexiune indisponibilă"}`);
}
async function fetchPipedBundle(id){
  const {data,instance}=await withPipedFallback(`/streams/${encodeURIComponent(id)}`,d=>{
    if(!d||typeof d!=="object"||(!Array.isArray(d.videoStreams)&&!d.hls&&!d.dash))throw new Error("Răspuns video invalid.");
    return d;
  });
  return {info:normalizePipedInfo(data,id),playback:normalizePipedPlayback(data,instance)};
}
function mergePlayback(primary,secondary){
  if(!primary)return secondary;if(!secondary)return primary;
  const progressive=[...(primary.progressive||[]),...(secondary.progressive||[])];
  const audio=[...(primary.audio||[]),...(secondary.audio||[])];
  return {...primary,progressive,audio,dashUrl:primary.dashUrl||secondary.dashUrl,hlsUrl:primary.hlsUrl||secondary.hlsUrl,secondaryProvider:secondary.provider};
}
function cleanupDash(){
  if(state.dashPlayer){try{state.dashPlayer.reset();}catch{} state.dashPlayer=null;}
  state.playbackMode="";
}
function bestAudio(pb){
  const a=[...(pb?.audio||[])]; if(!a.length)return null;
  a.sort((x,y)=>Number(x.bitrate||0)-Number(y.bitrate||0)); return a[a.length-1];
}
function sortedProgressive(pb){
  return [...(pb?.progressive||[])].filter(x=>x.url).sort((a,b)=>qHeight(a)-qHeight(b));
}
function chooseProgressive(pb,target="best"){
  let a=sortedProgressive(pb); if(!a.length)return null;
  const mp4=a.filter(f=>String(f.container||f.format||f.type||"").toLowerCase().includes("mp4")||String(f.type||"").includes("video/mp4")||String(f.format||"").includes("MPEG_4"));if(mp4.length)a=mp4;
  if(target==="auto"||target==="best")return a[a.length-1];
  const h=Number(target)||720;return [...a].reverse().find(f=>qHeight(f)<=h)||a[0];
}
function supportsNativeHls(){const v=$("video");return !!v.canPlayType("application/vnd.apple.mpegurl")||!!v.canPlayType("application/x-mpegURL");}
async function setPlaybackSource(target=state.settings.quality,preserveTime=null,autoplay=true){
  const request=++state.sourceRequest, videoRequest=state.videoRequest;
  if(state.cancelSourceWait)state.cancelSourceWait();
  const current=()=>request===state.sourceRequest&&videoRequest===state.videoRequest;
  const v=$("video"),pb=state.playback;if(!pb)throw new Error("Nu există surse video.");
  const time=preserveTime==null?(Number.isFinite(v.currentTime)?v.currentTime:0):preserveTime;
  const rate=v.playbackRate||1;cleanupDash();v.pause();v.removeAttribute("src");v.load();
  let label="";
  if(state.settings.preferAdaptive && (target==="auto"||target==="best"||Number(target)>720)){
    if(pb.hlsUrl && supportsNativeHls()){
      v.src=pb.hlsUrl;state.playbackMode="hls";label=target==="best"?"Best HLS":"Auto HLS";
    }else if(pb.dashUrl && window.dashjs && window.MediaSource){
      const player=dashjs.MediaPlayer().create();state.dashPlayer=player;state.playbackMode="dash";
      const numericTarget=Number(target)||0;
      player.updateSettings({streaming:{abr:{autoSwitchBitrate:{video:!numericTarget,audio:true}},buffer:{fastSwitchEnabled:true}}});
      player.initialize(v,pb.dashUrl,false);label=numericTarget?`DASH ${numericTarget}p`:"Auto DASH";
      if(numericTarget){
        const ev=dashjs.MediaPlayer.events.STREAM_INITIALIZED;
        player.on(ev,()=>{try{const reps=player.getRepresentationsByType("video")||[];const candidates=reps.map((r,i)=>({r,i,h:Number(r.height||0)})).filter(x=>x.h&&x.h<=numericTarget).sort((a,b)=>a.h-b.h);const pick=candidates[candidates.length-1]||reps.map((r,i)=>({r,i,h:Number(r.height||0)})).sort((a,b)=>a.h-b.h)[0];if(pick)player.setRepresentationForTypeById("video",pick.r.id,true);}catch{}},{once:true});
      }
    }
  }
  if(!state.playbackMode){
    const f=chooseProgressive(pb,target);if(!f)throw new Error("Nu există stream progresiv compatibil.");v.src=f.url;state.playbackMode="progressive";label=f.label||`${qHeight(f)}p`;state.videoStream=f;
  }
  $("qualityBtn").textContent=label||"Auto";
  v.playbackRate=rate;if(state.playbackMode!=="dash")v.load();
  await new Promise(resolve=>{
    let timer;
    const finish=()=>{clearTimeout(timer);v.removeEventListener("loadedmetadata",loaded);v.removeEventListener("error",finish);if(state.cancelSourceWait===finish)state.cancelSourceWait=null;resolve();};
    const loaded=()=>{if(current()&&time>0&&Number.isFinite(v.duration))v.currentTime=Math.min(time,Math.max(0,v.duration-1));finish();};
    state.cancelSourceWait=finish;
    v.addEventListener("loadedmetadata",loaded,{once:true});v.addEventListener("error",finish,{once:true});
    timer=setTimeout(finish,5000);
    if(v.readyState>=1)loaded();
  });
  if(!current())return false;
  if(v.error)throw new Error("Fișierul video nu poate fi redat de browser.");
  if(autoplay){try{await v.play();}catch(e){if(current())playerProblem(e.name==="NotAllowedError"?"Atinge Play pentru a porni videoclipul.":"Redarea nu a pornit: "+e.message);}}
  if(!current())return false;
  updateMediaSession();return true;
}
function qualityItems(){
  const pb=state.playback||{};const items=[];
  if(pb.hlsUrl||pb.dashUrl)items.push({key:"auto",label:"Auto adaptiv",sub:pb.hlsUrl?"HLS (ideal Safari/iPhone)":"DASH adaptive"});
  const seen=new Set();
  sortedProgressive(pb).reverse().forEach(f=>{const h=qHeight(f);if(!h||seen.has(h))return;seen.add(h);items.push({key:String(h),label:`${h}p`,sub:`${pb.provider||"Stream"} · progresiv audio+video`});});
  if(!items.length)items.push({key:"best",label:"Cea mai bună disponibilă",sub:"Fallback"});
  return items;
}
function showQualityDialog(){
  const host=$("qualityOptions");host.innerHTML="";qualityItems().forEach(i=>{const b=document.createElement("button");b.className="optionBtn qualityOption";b.innerHTML=`<strong>${i.label}</strong><small>${i.sub}</small>`;b.onclick=async()=>{$("qualityDialog").close();state.settings.quality=i.key;saveJSON(LS.settings,state.settings);try{setLoading(true,"Schimb calitatea…");await setPlaybackSource(i.key,$("video").currentTime,!$("video").paused);}catch(e){alert(e.message);}finally{setLoading(false);}};host.appendChild(b);});$("qualityDialog").showModal();
}
function safeFilename(s){return String(s||"video").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,120)||"video";}
function openDownloadUrl(url,filename){const a=document.createElement("a");a.href=url;a.download=filename;a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove();}
function showDownloadDialog(){
  const host=$("downloadOptions");host.innerHTML="";$("downloadStatus").textContent="MP4 progresiv include audio + video. Calitățile adaptive separate nu sunt muxate în browser.";
  const base=safeFilename(state.current?.title||"StudyTube");
  const prog=sortedProgressive(state.playback).reverse();
  const seen=new Set();prog.forEach(f=>{const h=qHeight(f);if(!h||seen.has(h))return;seen.add(h);const b=document.createElement("button");b.className="optionBtn downloadOption";b.innerHTML=`<strong>Video ${h}p</strong><small>${f.container||f.format||"MP4"} · deschide/salvează în Files</small>`;b.onclick=()=>openDownloadUrl(f.url+(state.playback?.jobId?"&download=1":""),`${base}-${h}p.mp4`);host.appendChild(b);});
  const a=bestAudio(state.playback);if(a){const b=document.createElement("button");b.className="optionBtn downloadOption";b.innerHTML=`<strong>Audio</strong><small>${a.quality||a.audioQuality||Math.round(Number(a.bitrate||0)/1000)+" kbps"}</small>`;b.onclick=()=>openDownloadUrl(a.url+(state.playback?.jobId?"&download=1":""),`${base}-audio.m4a`);host.appendChild(b);}
  if(!host.children.length)host.innerHTML='<div class="emptyState">Nu există un stream direct descărcabil pentru acest video.</div>';$("downloadDialog").showModal();
}
function updateMediaSession(){
  if(!("mediaSession" in navigator)||!state.current)return;
  try{navigator.mediaSession.metadata=new MediaMetadata({title:state.current.title||"StudyTube",artist:state.current.author||"",album:"StudyTube",artwork:(state.current.videoThumbnails||[]).slice(-4).map(x=>({src:normalizeUrl(x.url),sizes:"512x512",type:"image/jpeg"}))});navigator.mediaSession.playbackState=$("video").paused?"paused":"playing";}catch{}
}
function installMediaSession(){
  if(!("mediaSession" in navigator))return;const ms=navigator.mediaSession;
  const actions={play:()=>$("video").play(),pause:()=>$("video").pause(),seekbackward:d=>seekBy(-(d.seekOffset||10)),seekforward:d=>seekBy(d.seekOffset||10),previoustrack:()=>seekBy(-10),nexttrack:()=>{if(!advanceQueue()&&state.related[0]?.videoId)openVideo(state.related[0].videoId);},seekto:d=>{if(Number.isFinite(d.seekTime))$("video").currentTime=d.seekTime;}};
  for(const [a,h] of Object.entries(actions)){try{ms.setActionHandler(a,h);}catch{}}
}
async function playbackFailover(){
  if(isLocalVideo())return false;
  if(state.settings.ownServer)return false;
  if(state.failoverUsed||!state.settings.pipedFallback||!state.currentVideoId)return false;
  state.failoverUsed=true;
  const request=state.videoRequest,id=state.currentVideoId;
  try{
    setLoading(true,"Încerc o altă sursă video…");
    const bundle=await fetchPipedBundle(id);
    if(request!==state.videoRequest)return false;
    state.playback=mergePlayback(state.playback,bundle.playback);
    if((!state.current?.title||state.current.title==="Video")&&bundle.info)state.current=bundle.info;
    const installed=await setPlaybackSource(state.settings.quality,state.lastPlaybackTime||$("video").currentTime,true);
    if(request!==state.videoRequest||!installed)return false;
    setLoading(false);return true;
  }catch(e){if(request===state.videoRequest)setLoading(false);return false;}
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
  if(v.paused) v.play().catch(e=>playerProblem("Redarea nu a pornit: "+e.message)); else v.pause();
  showPlayerUi();
}
function updatePlayIcons(){
  const paused=$("video").paused;
  $("playPause").textContent=paused?"▶︎":"❚❚";
  $("centerPlay").textContent=paused?"▶":"❚❚";
  $("miniPlay").textContent=paused?"▶":"❚❚";
  $("miniPlay").setAttribute("aria-label",paused?"Redă":"Pauză");
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
  let list=[],title="";
  if(state.libraryMode==="history"){list=state.history;title="Istoric local";}
  else if(state.libraryMode==="favorites"){list=state.favorites;title="Favorite";}
  else if(state.libraryMode==="ytlikes"){list=state.ytLikes;title="Apreciate pe YouTube";}
  else if(state.libraryMode==="watchlater"){list=state.watchLater;title="Vezi mai târziu";}
  $("libraryTitle").textContent=title;
  if(state.libraryMode==="ytlikes"&&!googleConnected()){$("libraryGrid").innerHTML='<div class="emptyState">Conectează contul Google din Setări pentru această secțiune.</div>';return;}
  renderVideoGrid("libraryGrid",list);
}

async function openVideo(id){
  if(state.localFiles.has(id))return openLocalVideo(id);
  if(!/^[A-Za-z0-9_-]{11}$/.test(id||""))return;
  if(id===state.currentVideoId&&state.playback&&(!state.playback.expires||state.playback.expires>Date.now()/1000)&&!$("video").error){showView("watch");return;}
  state.prepareController?.abort();
  const request=++state.videoRequest;
  const current=()=>request===state.videoRequest;
  ++state.sourceRequest;if(state.cancelSourceWait)state.cancelSourceWait();
  $("video").pause();$("video").removeAttribute("src");$("video").load();
  releaseLocalURL();resetStudyLoop();
  state.current=null;state.lastPlaybackTime=0;
  $("playbackProblem").classList.add("hidden");
  state.currentVideoId=id;state.failoverUsed=false;state.playback=null;state.videoStream=null;state.audioStream=null;
  showView("watch");updateLocalUi();renderBookmarks();setLoading(true,"Pregătesc playerul…");$("relatedGrid").innerHTML="";$("commentsList").innerHTML="";setStatus("commentsStatus","");state.sponsorSegments=[];stopSponsorWatch();cleanupDash();
  let info=null,instance="",ivErr=null,pipedBundle=null;
  if(state.settings.ownServer){
    try{const bundle=await prepareOwnVideo(id,request);if(!current()||!bundle)return;info=bundle.info;state.playback=bundle.playback;instance=state.settings.ownServer;}
    catch(e){if(current())playerProblem(e.message);return;}
  }else{
  try{const local=state.settings.proxy?"&local=true":"";const r=await withInstanceFallback(()=>`/api/v1/videos/${encodeURIComponent(id)}?region=RO&hl=ro${local}`);if(!current())return;info=r.data;instance=r.instance;state.playback=normalizeInvidiousPlayback(info,instance);}catch(e){ivErr=e;}
  if(!current())return;
  const needPiped=!info || !state.playback?.progressive?.length || (state.settings.preferAdaptive && !state.playback?.dashUrl && !state.playback?.hlsUrl);
  if(state.settings.pipedFallback && needPiped){try{pipedBundle=await fetchPipedBundle(id);if(!current())return;state.playback=mergePlayback(state.playback,pipedBundle.playback);if(!info)info=pipedBundle.info;}catch{} }
  if(!current())return;
  if(!info){playerProblem(`Eroare: ${ivErr?.message||"nu pot obține datele video"}`);return;}
  }
  try{
    state.current=info;state.currentInstance=instance;state.currentVideoId=info.videoId||id;state.related=info.recommendedVideos||[];
    $("miniTitle").textContent=info.title||"Video";document.title=(info.title||"StudyTube")+" · StudyTube";$("videoTitle").textContent=info.title||"";$("videoMeta").textContent=[fmtViews(info.viewCount),info.publishedText,state.playback?.provider].filter(Boolean).join(" · ");$("channelName").textContent=info.author||"";$("channelSubs").textContent=info.subCountText||"";$("channelAvatar").src=avatarFor(info);$("descriptionText").textContent=info.description||"";renderVideoGrid("relatedGrid",state.related.slice(0,24));
    setFavoriteUi();setWatchLaterUi();setSubscribeUi();addHistory(info);renderLibrary();updateGoogleUi();
    state.audioStream=bestAudio(state.playback);state.audioMode=false;$("playerBox").classList.remove("audioMode");$("audioModeBtn").classList.remove("enabled");
    const video=$("video");video.querySelectorAll("track").forEach(t=>t.remove());addCaptionTracks(info,instance||activeInstance());
    void fetchSponsorSegments(state.currentVideoId,request);
    const installed=await setPlaybackSource(state.settings.quality,0,true);
    if(!current()||!installed)return;
    setLoading(false);if(!state.settings.ownServer)loadComments(state.currentVideoId);else setStatus("commentsStatus","Comentarii indisponibile prin serviciul propriu.");updateMediaSession();
  }catch(e){if(current())playerProblem(`Eroare player: ${e.message}`);}
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
  const request=state.videoRequest;
  setStatus("commentsStatus","Încarc comentariile…");
  try{
    const {data}=await withInstanceFallback(()=>`/api/v1/comments/${encodeURIComponent(id)}?sort_by=top&source=youtube&hl=ro`);
    if(request!==state.videoRequest||id!==state.currentVideoId)return;
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
  }catch(e){ if(request===state.videoRequest)setStatus("commentsStatus","Comentariile nu sunt disponibile pe instanța curentă."); }
}

async function fetchSponsorSegments(videoId,request=state.videoRequest){
  state.sponsorSegments=[];
  if(!state.settings.sponsorBlock || !crypto.subtle)return;
  try{
    const raw=new TextEncoder().encode(videoId);
    const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(x=>x.toString(16).padStart(2,"0")).join("");
    const cats=encodeURIComponent(JSON.stringify(state.settings.sbCategories||["sponsor"]));
    const acts=encodeURIComponent(JSON.stringify(["skip"]));
    const data=await fetchJSON(`https://sponsor.ajay.app/api/skipSegments/${hash.slice(0,4)}?categories=${cats}&actionTypes=${acts}&service=YouTube`,{},8000);
    if(request!==state.videoRequest||videoId!==state.currentVideoId)return;
    const match=(Array.isArray(data)?data:[]).find(x=>x.videoID===videoId||x.hash===hash);
    state.sponsorSegments=(match?.segments||[])
      .filter(s=>s.actionType==="skip"&&Array.isArray(s.segment))
      .map(s=>({start:Number(s.segment[0]),end:Number(s.segment[1]),category:s.category}))
      .filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start)
      .sort((a,b)=>a.start-b.start);
  }catch{}
}
function startSponsorWatch(){
  stopSponsorWatch();
  state.sponsorWatch=setInterval(()=>{
    if(!state.settings.sponsorBlock||!state.sponsorSegments.length)return;
    const v=$("video"),t=v.currentTime;
    if(state.studyLoop?.id===state.currentVideoId&&Number.isFinite(state.studyLoop.end))return;
    if(v.paused||v.seeking||!Number.isFinite(v.duration))return;
    const s=state.sponsorSegments.find(x=>x.end<=v.duration&&t>=x.start&&t<x.end-.15);
    if(s){v.currentTime=s.end;hud(`SponsorBlock: ${s.category}`,900);}
  },250);
}
function stopSponsorWatch(){if(state.sponsorWatch)clearInterval(state.sponsorWatch);state.sponsorWatch=null;}


async function togglePiP(){
  const v=$("video");
  try{
    if(document.pictureInPictureElement){await document.exitPictureInPicture();return;}
    if(v.requestPictureInPicture && document.pictureInPictureEnabled){await v.requestPictureInPicture();return;}
    if(v.webkitSupportsPresentationMode && v.webkitSetPresentationMode){v.webkitSetPresentationMode("picture-in-picture");return;}
    throw new Error("WebKit nu expune PiP în modul curent");
  }catch(e){
    const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone;
    if(standalone && confirm("PiP este blocat în unele versiuni iOS pentru PWA. Deschid StudyTube în Safari, unde PiP poate funcționa mai bine?")){window.open(location.href,"_blank");return;}
    alert(`PiP: ${e.message}`);
  }
}
async function toggleAudioMode(){
  if(!state.current || !state.playback)return;
  const v=$("video"),time=v.currentTime,wasPlaying=!v.paused,rate=v.playbackRate||1;
  if(!state.audioMode){
    const a=bestAudio(state.playback);if(!a)return alert("Backend-ul curent nu oferă stream audio separat.");
    cleanupDash();state.audioMode=true;state.audioStream=a;v.pause();v.src=a.url;$("playerBox").classList.add("audioMode");$("audioModeBtn").classList.add("enabled");$("qualityBtn").textContent="Audio BG";
  }else{
    state.audioMode=false;$("playerBox").classList.remove("audioMode");$("audioModeBtn").classList.remove("enabled");await setPlaybackSource(state.settings.quality,time,wasPlaying);return;
  }
  v.playbackRate=rate;v.load();v.addEventListener("loadedmetadata",function restore(){if(Number.isFinite(v.duration))v.currentTime=Math.min(time,Math.max(0,v.duration-1));if(wasPlaying)v.play().catch(()=>{});updateMediaSession();},{once:true});
}
function initSleepDialog(){
  const host=$("sleepOptions");
  [{m:0,t:"Oprit"},{m:15,t:"15 minute"},{m:30,t:"30 minute"},{m:45,t:"45 minute"},{m:60,t:"60 minute"}].forEach(o=>{
    const b=document.createElement("button");b.className="optionBtn";b.textContent=o.t;b.onclick=()=>{setSleepTimer(o.m);$("sleepDialog").close();};host.appendChild(b);
  });
  const end=document.createElement("button");end.className="optionBtn";end.textContent="La finalul videoclipului";end.onclick=()=>{clearTimeout(state.sleepTimer);state.sleepTimer=null;state.sleepEndsAt=-1;$("sleepBtn").textContent="☾ La final";$("sleepDialog").close();};host.appendChild(end);
}
function setSleepTimer(minutes){
  clearTimeout(state.sleepTimer);state.sleepTimer=null;state.sleepEndsAt=0;
  if(!minutes){$("sleepBtn").textContent="☾ Sleep";return;}
  state.sleepEndsAt=Date.now()+minutes*60000;$("sleepBtn").textContent=`☾ ${minutes}m`;
  state.sleepTimer=setTimeout(()=>{$("video").pause();$("sleepBtn").textContent="☾ Sleep";state.sleepEndsAt=0;},minutes*60000);
}


function setWatchLaterUi(){
  const on=state.watchLater.some(x=>x.videoId===state.currentVideoId);$("watchLaterBtn").textContent=on?"✓ Mai târziu":"＋ Mai târziu";$("watchLaterBtn").classList.toggle("enabled",on);
}
function toggleWatchLater(){
  if(!state.current)return;const id=state.currentVideoId;
  if(state.watchLater.some(x=>x.videoId===id))state.watchLater=state.watchLater.filter(x=>x.videoId!==id);
  else state.watchLater.unshift({videoId:id,title:state.current.title,author:state.current.author,authorId:state.current.authorId,lengthSeconds:state.current.lengthSeconds,viewCount:state.current.viewCount,publishedText:state.current.publishedText,videoThumbnails:state.current.videoThumbnails});
  saveJSON(LS.watchLater,state.watchLater);setWatchLaterUi();renderLibrary();
}

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
async function toggleSubscribe(){
  if(!state.current?.authorId)return;
  if(googleConnected()){const handled=await googleSubscribeToggle();if(handled){loadSubscriptions();return;}}
  const id=state.current.authorId;
  if(state.subscriptions.some(x=>x.authorId===id)) state.subscriptions=state.subscriptions.filter(x=>x.authorId!==id);
  else state.subscriptions.unshift({authorId:id,author:state.current.author,authorThumbnails:state.current.authorThumbnails});
  saveJSON(LS.subs,state.subscriptions);setSubscribeUi();loadSubscriptions();
}
async function loadSubscriptions(){
  const host=$("subsGrid");host.innerHTML="";
  $("subsSubtitle").textContent=googleConnected()?"Sincronizate din contul YouTube · clipuri prin backend alternativ":"Stocate local pe dispozitiv";
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
  populateInstanceSelect(false);
  $("googleClientId").value=state.settings.googleClientId||"";
  $("customInstance").value=state.settings.customInstance||"";
  $("customPipedInstance").value=state.settings.customPipedInstance||"";
  $("ownServer").value=state.settings.ownServer||"";
  $("ownServerToken").value=state.ownServerToken||"";
  $("qualitySelect").value=state.settings.quality||"auto";
  $("proxyToggle").checked=!!state.settings.proxy;
  $("adaptiveToggle").checked=state.settings.preferAdaptive!==false;
  $("pipedToggle").checked=state.settings.pipedFallback!==false;
  $("holdSpeedSelect").value=String(state.settings.holdSpeed||2);
  $("sponsorToggle").checked=!!state.settings.sponsorBlock;
  $("autoplayToggle").checked=!!state.settings.autoplay;
  $("rememberToggle").checked=!!state.settings.rememberHistory;
  $("preferGoogleToggle").checked=state.settings.preferGoogleData!==false;
  document.querySelectorAll(".sbCat").forEach(c=>c.checked=(state.settings.sbCategories||[]).includes(c.value));
}
function saveSettingsFromUi(){
  for(const id of ["customInstance","customPipedInstance","ownServer"]){
    const value=cleanInstance($(id).value);
    if(value&&!validInstance(value))throw new Error("Adresa serverului trebuie să fie HTTPS, fără parolă, parametri sau fragment.");
  }
  state.settings.ownServer=cleanInstance($("ownServer").value);
  state.ownServerToken=$("ownServerToken").value.trim();
  sessionStorage.setItem("studytube_server_token",state.ownServerToken);
  state.settings.instance=$("instanceSelect").value;
  state.settings.customInstance=cleanInstance($("customInstance").value);
  state.settings.customPipedInstance=cleanInstance($("customPipedInstance").value);
  state.settings.quality=$("qualitySelect").value;
  state.settings.proxy=$("proxyToggle").checked;
  state.settings.preferAdaptive=$("adaptiveToggle").checked;
  state.settings.pipedFallback=$("pipedToggle").checked;
  state.settings.holdSpeed=Number($("holdSpeedSelect").value||2);
  state.settings.sponsorBlock=$("sponsorToggle").checked;
  state.settings.autoplay=$("autoplayToggle").checked;
  state.settings.rememberHistory=$("rememberToggle").checked;
  state.settings.preferGoogleData=$("preferGoogleToggle").checked;
  state.settings.googleClientId=$("googleClientId").value.trim();
  state.settings.sbCategories=[...document.querySelectorAll(".sbCat:checked")].map(x=>x.value);
  saveJSON(LS.settings,state.settings);
  $("autoplayBtn").classList.toggle("active",state.settings.autoplay);
}
function cancelConnectionTest(){
  const controller=state.connectionTestController;
  state.connectionTestController=null;
  controller?.abort();
  const preview=$("connectionTestVideo");
  preview.pause();preview.removeAttribute("src");preview.load();preview.classList.add("hidden");
  $("testInstance").disabled=false;
  if(controller)$("instanceStatus").textContent="Test oprit.";
}
async function testInstance(){
  cancelConnectionTest();
  const instance=cleanInstance($("customInstance").value||$("instanceSelect").value);
  const preview=$("connectionTestVideo");
  if(!validInstance(instance)){$("instanceStatus").textContent="Introdu o adresă HTTPS validă.";return;}
  const controller=new AbortController();state.connectionTestController=controller;
  const opts={signal:controller.signal};
  $("testInstance").disabled=true;
  $("instanceStatus").textContent="Verific încărcarea catalogului…";
  try{
    let catalog;
    try{catalog=catalogArray(await fetchJSON(instance+"/api/v1/trending?region=RO&hl=ro",opts,7000));}
    catch(e){if(controller.signal.aborted)throw e;catalog=catalogArray(await fetchJSON(instance+"/api/v1/popular",opts,7000));}
    const sample=catalog.find(v=>/^[\w-]{11}$/.test(v?.videoId||""));
    if(!sample)throw new Error("Catalog valid, dar fără un videoclip care să poată fi testat.");
    $("instanceStatus").textContent="Catalog disponibil. Verific sursa și redarea unui videoclip…";
    const info=await fetchJSON(instance+`/api/v1/videos/${sample.videoId}?region=RO&hl=ro${$("proxyToggle").checked?"&local=true":""}`,opts,7000);
    const playback=normalizeInvidiousPlayback(info,instance);
    const progressive=chooseProgressive(playback,"360");
    const source=progressive?.url||(supportsNativeHls()?playback.hlsUrl:"");
    if(!source)throw new Error("Catalog disponibil, dar niciun stream compatibil cu testul de redare. Redarea nu este confirmată.");
    preview.classList.remove("hidden");
    await verifyMediaPlayback(preview,source,12000,controller.signal);
    if(state.connectionTestController!==controller)return;
    $("instanceStatus").textContent="Redare confirmată pentru videoclipul testat. Salvează pentru a folosi această instanță.";
  }catch(e){if(state.connectionTestController===controller)$("instanceStatus").textContent=`Redare neconfirmată · ${e.message}`;}
  finally{if(state.connectionTestController===controller){state.connectionTestController=null;$("testInstance").disabled=false;}}
}
function verifyMediaPlayback(video,url,timeout=12000,signal){
  return new Promise((resolve,reject)=>{
    let finished=false,startedAt=null;
    const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);for(const [event,handler] of Object.entries(events))video.removeEventListener(event,handler);signal?.removeEventListener("abort",cancelled);video.pause();error?reject(error):resolve();};
    const playing=()=>{startedAt=video.currentTime;};
    const reset=()=>{startedAt=null;};
    const advanced=()=>{if(startedAt!==null&&!video.paused&&!video.seeking&&video.readyState>=2&&video.currentTime-startedAt>=0.25)finish();};
    const failed=()=>finish(new Error(`Streamul nu poate fi redat (cod ${video.error?.code||"necunoscut"}).`));
    const cancelled=()=>finish(new Error("Test oprit."));
    const events={playing,timeupdate:advanced,seeking:reset,error:failed};
    const timer=setTimeout(()=>finish(new Error("Videoclipul nu a început redarea în intervalul de test.")),timeout);
    if(signal?.aborted){cancelled();return;}
    for(const [event,handler] of Object.entries(events))video.addEventListener(event,handler);
    signal?.addEventListener("abort",cancelled,{once:true});
    video.src=url;video.muted=true;video.load();
    try{Promise.resolve(video.play()).catch(error=>finish(new Error(`Browserul nu a pornit redarea: ${error.name||"eroare"}.`)));}
    catch(error){finish(error);}
  });
}

function initSpeedDialog(){
  const host=$("speedOptions");
  [0.25,0.5,0.75,1,1.25,1.5,1.75,2,2.5,3,4].forEach(rate=>{
    const b=document.createElement("button");b.className="optionBtn";b.textContent=rate+"×";
    b.onclick=()=>{$("video").playbackRate=rate;$("speedBtn").textContent=rate+"×";$("speedDialog").close();};
    host.appendChild(b);
  });
}

function installPlayerEvents(){
  const v=$("video");
  v.addEventListener("loadedmetadata",()=>{
    $("duration").textContent=fmtDuration(v.duration);$("scrubber").max=1000;
    const pos=Number(localStorage.getItem("studytube_pos_"+state.currentVideoId)||0);if(pos>5 && pos<v.duration-10 && Math.abs(v.currentTime-pos)>3)v.currentTime=pos;
    showPlayerUi();
  });
  v.addEventListener("timeupdate",()=>{
    if(enforceSleepDeadline())return;
    applyStudyLoop();
    $("curTime").textContent=fmtDuration(v.currentTime);
    if(Number.isFinite(v.duration)&&v.duration>0) $("scrubber").value=Math.round(v.currentTime/v.duration*1000);
    state.lastPlaybackTime=v.currentTime||0;
    const now=Date.now();
    if(state.settings.rememberHistory && !isLocalVideo() && now-state.lastPositionSave>5000 && state.currentVideoId){
      localStorage.setItem("studytube_pos_"+state.currentVideoId,String(Math.floor(v.currentTime)));
      state.lastPositionSave=now;
    }
  });
  v.addEventListener("play",()=>{updatePlayIcons();startSponsorWatch();showPlayerUi();updateMediaSession();});
  v.addEventListener("pause",()=>{updatePlayIcons();stopSponsorWatch();showPlayerUi();updateMediaSession();});
  v.addEventListener("waiting",()=>setLoading(true,"Buffering…"));
  v.addEventListener("playing",()=>{setLoading(false);$("playbackProblem").classList.add("hidden");});
  v.addEventListener("error",async()=>{
    if(!state.currentVideoId||!state.playback)return;
    if(isLocalVideo()){playerProblem("Fișierul local nu poate fi redat. Verifică formatul și dacă este descărcat în Fișiere.");return;}
    const request=state.videoRequest;state.lastPlaybackTime=v.currentTime||state.lastPlaybackTime;
    if(!(await playbackFailover())&&request===state.videoRequest)playerProblem("Sursa video nu poate fi redată. Reîncearcă sau verifică conexiunea din Setări.");
  });
  v.addEventListener("ended",onPlaybackEnded);
  $("scrubber").addEventListener("input",e=>{
    if(Number.isFinite(v.duration))v.currentTime=Number(e.target.value)/1000*v.duration;
  });
}

function installGestures(){
  const layer=$("gestureLayer");
  let g={sx:0,sy:0,st:0,videoT:0,moved:false,seeking:false,lastTap:0,long:false,oldRate:1};
  let longTimer=null;
  const cancel=()=>{clearTimeout(longTimer);if(g.long)$("video").playbackRate=g.oldRate;g.long=false;g.moved=true;};
  layer.addEventListener("touchcancel",cancel,{passive:true});
  window.addEventListener("blur",cancel);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)cancel();});
  layer.addEventListener("touchstart",e=>{
    if(e.touches.length!==1){cancel();return;}
    const t=e.touches[0];g.sx=t.clientX;g.sy=t.clientY;g.st=Date.now();g.videoT=$("video").currentTime;g.moved=false;g.seeking=false;g.long=false;g.oldRate=$("video").playbackRate;
    longTimer=setTimeout(()=>{if(!g.moved){g.long=true;$("video").playbackRate=Number(state.settings.holdSpeed||2);hud(`${state.settings.holdSpeed||2}×`,500);}},420);
  },{passive:true});
  layer.addEventListener("touchmove",e=>{
    if(e.touches.length!==1){cancel();return;}
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
    const end=e.changedTouches[0];if(!end)return;
    const dx=end.clientX-g.sx,dy=end.clientY-g.sy;
    if(Math.abs(dy)>60&&Math.abs(dy)>Math.abs(dx)*1.4){if(dy>0)goBackFromWatch();else if(state.activeView!=="watch")showView("watch");return;}
    if(g.moved)return;
    if(state.activeView!=="watch"){showView("watch");return;}
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
  $("preparedFiles").onclick=managePrepared;
  $("closePrepared").onclick=()=>$("preparedDialog").close();
  $("checkOwnServer").onclick=async()=>{
    try{saveSettingsFromUi();const data=await ownRequest("/api/jobs");$("ownServerStatus").textContent=`Conectat · ${data.jobs.length} fișiere. Redarea nu a fost încă verificată.`;}
    catch(e){$("ownServerStatus").textContent=e.message;}
  };
  $("googleTop").onclick=()=>{populateSettings();updateGoogleUi();$("settingsDialog").showModal();};
  $("googleLoginBtn").onclick=googleSignIn;
  $("googleLogoutBtn").onclick=()=>googleSignOut(true);
  $("syncGoogleBtn").onclick=()=>syncGoogleAccount(true);
  $("refreshInstances").onclick=()=>refreshPublicInstances();
  document.querySelectorAll(".navBtn").forEach(b=>b.onclick=()=>{
    const v=b.dataset.view;showView(v);
    if(v==="subs")loadSubscriptions();if(v==="library")renderLibrary();
  });
  $("logoBtn").onclick=()=>showView("home");
  $("settingsTop").onclick=()=>{populateSettings();$("settingsDialog").showModal();};
  $("closeSettings").onclick=()=>{cancelConnectionTest();$("settingsDialog").close();};
  $("settingsDialog").addEventListener("close",cancelConnectionTest);
  $("settingsDialog").addEventListener("cancel",cancelConnectionTest);
  $("saveSettings").onclick=()=>{try{saveSettingsFromUi();cancelConnectionTest();$("settingsDialog").close();loadHome();}catch(e){$("instanceStatus").textContent=e.message;}};
  $("testInstance").onclick=testInstance;
  $("refreshHome").onclick=loadHome;
  $("searchGo").onclick=doSearch;
  $("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch();});
  $("closePlayer").onclick=goBackFromWatch;
  $("miniExpand").onclick=()=>showView("watch");
  $("miniPlay").onclick=playToggle;
  $("miniClose").onclick=closePlayback;
  $("stopPlayer").onclick=closePlayback;
  $("retryPlayback").onclick=()=>{const id=state.currentVideoId;state.playback=null;if(id)openVideo(id);};
  $("playbackSettings").onclick=()=>{populateSettings();$("settingsDialog").showModal();};
  $("playPause").onclick=playToggle;$("centerPlay").onclick=playToggle;
  $("back10").onclick=()=>seekBy(-10);$("fwd10").onclick=()=>seekBy(10);
  $("speedBtn").onclick=()=>$("speedDialog").showModal();
  $("qualityBtn").onclick=showQualityDialog;
  $("captionsBtn").onclick=showCaptionsDialog;
  $("pipBtn").onclick=togglePiP;
  $("audioModeBtn").onclick=toggleAudioMode;
  $("watchLaterBtn").onclick=toggleWatchLater;
  $("downloadBtn").onclick=showDownloadDialog;
  $("sleepBtn").onclick=()=>$("sleepDialog").showModal();
  $("ytLikeBtn").onclick=()=>googleRate("like");
  $("sendCommentBtn").onclick=postGoogleComment;
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
    if(state.libraryMode==="history"){state.history=[];saveJSON(LS.history,[]);renderLibrary();}
    else if(state.libraryMode==="favorites"){state.favorites=[];saveJSON(LS.favorites,[]);renderLibrary();}
    else if(state.libraryMode==="watchlater"){state.watchLater=[];saveJSON(LS.watchLater,[]);renderLibrary();}
    else alert("Lista YouTube Likes nu este ștearsă din acest buton.");
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
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).catch(()=>{});
  initSpeedDialog();initSleepDialog();wireUi();installFreeFeatures();installPlayerEvents();installGestures();installMediaSession();restoreInitialView();updateGoogleUi();
  $("autoplayBtn").classList.toggle("active",state.settings.autoplay);
  renderLibrary();
  if(googleConnected())await syncGoogleAccount(false);
  await loadHome();
}
boot();
