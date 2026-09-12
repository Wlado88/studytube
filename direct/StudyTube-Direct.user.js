// ==UserScript==
// @name         StudyTube Direct
// @namespace    https://wlado88.github.io/studytube/
// @version      1.0.0
// @description  Comenzi de studiu pe YouTube: PiP, viteze, SponsorBlock, repere, buclă A–B și omiterea reclamelor detectate.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://youtube.com/*
// @run-at       document-end
// @inject-into  content
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      sponsor.ajay.app
// ==/UserScript==

(function(factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else api.start(window,typeof GM==='object'?GM:null).catch(error=>console.error('StudyTube Direct:',error));
})(function(){
  'use strict';
  const VERSION='1.0.0';
  const HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com']);
  const CATEGORIES=['sponsor','selfpromo','interaction'];
  const DEFAULTS={speed:1,ads:true,sponsor:true};
  const SKIP_SELECTOR='.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-container button,.videoAdUiSkipButton';

  function videoId(url){
    try{
      const u=new URL(url);if(u.protocol!=='https:')return '';
      let id='';
      if(u.hostname==='youtu.be')id=u.pathname.split('/')[1];
      else if(HOSTS.has(u.hostname)){
        if(u.pathname==='/watch')id=u.searchParams.get('v');
        else {const p=u.pathname.split('/');if(['shorts','live','embed'].includes(p[1]))id=p[2];}
      }
      return /^[\w-]{11}$/.test(id||'')?id:'';
    }catch{return '';}
  }
  function preferences(value){
    const p=value&&typeof value==='object'?value:{};
    const speed=Number(p.speed);
    return {speed:Number.isFinite(speed)&&speed>=.25&&speed<=4?speed:1,ads:typeof p.ads==='boolean'?p.ads:true,sponsor:typeof p.sponsor==='boolean'?p.sponsor:true};
  }
  function bookmarks(value){
    if(!Array.isArray(value))return [];
    return value.filter(x=>x&&/^[\w-]{11}$/.test(x.id||'')&&Number.isFinite(x.time)&&x.time>=0)
      .slice(0,100).map(x=>({id:x.id,time:Math.floor(x.time),title:String(x.title||'Video').slice(0,180)}));
  }
  function validSegments(value){
    if(!Array.isArray(value))return [];
    return value.filter(s=>s&&(!s.actionType||s.actionType==='skip')&&CATEGORIES.includes(s.category)&&Array.isArray(s.segment)&&s.segment.length===2&&s.segment.every(Number.isFinite)&&s.segment[0]>=0&&s.segment[1]>s.segment[0])
      .map(s=>({start:s.segment[0],end:s.segment[1],id:String(s.UUID||s.segment.join(':')),category:s.category})).sort((a,b)=>a.start-b.start);
  }
  function segmentAt(segments,time,duration,ignored){
    if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)return null;
    return segments.find(s=>s.id!==ignored&&s.end<=duration+.5&&time>=s.start&&time<s.end-.1)||null;
  }
  function adAction(active,duration,currentTime,hasSkip){
    if(!active)return 'none';
    if(hasSkip)return 'click';
    return Number.isFinite(duration)&&duration>0&&duration<1800&&duration-currentTime>.1?'seek':'mute';
  }
  function directSource(video){
    if(!video||video.mediaKeys)return '';
    try{const u=new URL(video.currentSrc||video.src);return u.protocol==='https:'&&(u.hostname==='googlevideo.com'||u.hostname.endsWith('.googlevideo.com'))?u.href:'';}catch{return '';}
  }
  function playbackAdvanced(before,after){
    return !!before&&!!after&&!after.paused&&!after.seeking&&after.readyState>=2&&after.time>before.time&&after.wall>before.wall&&after.wall-before.wall<5000&&after.time-before.time<((after.wall-before.wall)/1000)*Math.max(1,after.rate||1)+1;
  }
  function timeLabel(seconds){
    seconds=Math.max(0,Math.floor(seconds)||0);
    return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  }

  async function start(w,gm){
    const d=w.document;
    if(w.top!==w.self||!HOSTS.has(w.location.hostname)||d.getElementById('studytube-direct'))return null;
    const read=async(key,fallback)=>{try{return gm?.getValue?await gm.getValue(key,fallback):JSON.parse(w.localStorage.getItem('studytube-direct:'+key)||JSON.stringify(fallback));}catch{return fallback;}};
    const [savedPrefs,savedMarks]=await Promise.all([read('prefs',DEFAULTS),read('marks',[])]);
    if(d.getElementById('studytube-direct'))return null;
    let prefs=preferences(savedPrefs),marks=bookmarks(savedMarks),writeQueue=Promise.resolve();
    let current=null,currentId='',segments=[],generation=0,pending=null,ignoredSegment='',lastSkip=null;
    let adMuted=null,loopA=null,loopB=null,sleepAt=0,held=null,previousSample=null,confirmed=false;
    let scanTimer=null,ticker=null,disposed=false,sbState='În așteptare',playerObserver=null,skipAt=-Infinity,routePending=false,routeSource='';
    const cache=new Map(),listeners=[];
    const el=(tag,text,attrs={})=>{const n=d.createElement(tag);if(text)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
    const host=el('div','',{id:'studytube-direct'});d.documentElement.appendChild(host);
    const shadow=host.attachShadow({mode:'open'});
    const style=el('style');style.textContent=`
      :host{all:initial;font-family:system-ui,-apple-system,sans-serif;color-scheme:dark}
      *{box-sizing:border-box}button,select,a{font:inherit}button,select{color:#fff;background:#282633;border:1px solid #494452;border-radius:12px;min-height:44px;padding:9px 12px}button{cursor:pointer}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #b99bff;outline-offset:2px}button:disabled{opacity:.45;cursor:default}a{color:#c9b1ff}button[aria-pressed=true]{border-color:#bc9eff;background:#503281}
      #toggle{position:fixed;z-index:2147483646;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));background:#794bd5;border:1px solid #b99bff;box-shadow:0 5px 24px #0008;font-weight:800;border-radius:24px;min-width:54px}
      #panel{position:fixed;z-index:2147483647;right:12px;bottom:calc(140px + env(safe-area-inset-bottom,0px));width:min(350px,calc(100vw - 24px));max-height:70dvh;overflow:auto;overscroll-behavior:contain;background:#16151c;border:1px solid #544567;border-radius:20px;padding:16px;box-shadow:0 12px 48px #000a;color:#f5f2ff;font-size:14px;line-height:1.45}
      [hidden]{display:none!important}.row{display:flex;align-items:center;gap:8px;margin:10px 0;flex-wrap:wrap}.row>*{flex:1}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:19px;margin:0}.muted{color:#bab5c6;font-size:12px}p{margin:8px 0}label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}#message{min-height:20px;color:#ddc9ff}#marks{padding-left:20px;max-height:150px;overflow:auto}#marks li{margin:8px 0}#hold{touch-action:none;user-select:none;-webkit-user-select:none}details{margin-top:12px}summary{cursor:pointer;min-height:36px}#close{flex:none;min-width:44px}#diagnostics{white-space:pre-line}
    `;shadow.appendChild(style);
    const toggle=el('button','ST',{id:'toggle','aria-label':'Deschide StudyTube Direct','aria-expanded':'false'});
    const panel=el('section','',{id:'panel','aria-label':'StudyTube Direct'});panel.hidden=true;
    const head=el('div','',{class:'head'});head.appendChild(el('h2','StudyTube Direct'));
    const close=el('button','×',{id:'close','aria-label':'Închide panoul'});head.appendChild(close);panel.appendChild(head);
    const status=el('p','Deschide un videoclip pe YouTube.',{class:'muted'});panel.appendChild(status);
    const message=el('p','',{id:'message',role:'status','aria-live':'polite'});panel.appendChild(message);
    const say=text=>{message.textContent=text;};
    function show(on){panel.hidden=!on;toggle.setAttribute('aria-expanded',String(on));if(on){refreshStatus();close.focus();}else toggle.focus();}
    toggle.onclick=()=>show(panel.hidden);close.onclick=()=>show(false);
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){show(false);e.stopPropagation();}});
    function row(){const n=el('div','',{class:'row'});panel.appendChild(n);return n;}
    function button(parent,label,action,attrs={}){const b=el('button',label,attrs);b.onclick=()=>{try{Promise.resolve(action()).catch(e=>say(e.message||'Comanda nu a reușit.'));}catch(e){say(e.message||'Comanda nu a reușit.');}};parent.appendChild(b);return b;}
    function needVideo(){if(!current||!currentId)throw new Error('Deschide și pornește un videoclip.');return current;}
    function seek(delta){const v=needVideo();if(!Number.isFinite(v.duration))throw new Error('Saltul nu este disponibil pentru acest flux live.');v.currentTime=Math.min(Math.max(0,v.currentTime+delta),v.duration);}
    const transport=row();button(transport,'−10 s',()=>seek(-10));button(transport,'Play / Pauză',()=>{const v=needVideo();return v.paused?v.play():v.pause();});button(transport,'+10 s',()=>seek(10));
    const speedLabel=el('label','Viteză');const speed=el('select','',{'aria-label':'Viteză'});
    for(const n of [.25,.5,.75,1,1.25,1.5,1.75,2,2.5,3,4])speed.appendChild(el('option',`${n}×`,{value:String(n)}));
    speed.value=String(prefs.speed);speedLabel.appendChild(speed);panel.appendChild(speedLabel);
    function save(key,value){const copy=JSON.parse(JSON.stringify(value));writeQueue=writeQueue.catch(()=>{}).then(()=>gm?.setValue?gm.setValue(key,copy):w.localStorage.setItem('studytube-direct:'+key,JSON.stringify(copy)));writeQueue.catch(()=>say('Setările nu au putut fi salvate.'));}
    speed.onchange=()=>{prefs.speed=Number(speed.value);if(current&&!isAd())current.playbackRate=prefs.speed;save('prefs',prefs);};
    const tools=row();const pip=button(tools,'PiP / Fundal',()=>{
      const v=needVideo();v.removeAttribute('disablepictureinpicture');
      if(typeof v.webkitSetPresentationMode==='function'&&(!v.webkitSupportsPresentationMode||v.webkitSupportsPresentationMode('picture-in-picture'))){v.webkitSetPresentationMode('picture-in-picture');say('Ai cerut PiP. Continuarea în fundal depinde de iOS.');return;}
      if(v.requestPictureInPicture&&d.pictureInPictureEnabled)return v.requestPictureInPicture().then(()=>say('PiP activat.'));
      throw new Error('PiP nu este oferit aici. Încearcă în Safari, după pornirea videoclipului.');
    });
    const hold=button(tools,'Ține pentru 2×',()=>{}, {id:'hold'});
    function releaseHold(){if(held){if(held.video===current&&!isAd())held.video.playbackRate=held.rate;held=null;}}
    hold.addEventListener('pointerdown',e=>{e.preventDefault();try{const v=needVideo();if(isAd())return;held={video:v,rate:v.playbackRate};v.playbackRate=2;hold.setPointerCapture?.(e.pointerId);}catch(e){say(e.message);}});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])hold.addEventListener(event,releaseHold);
    const toggles=row();const ads=button(toggles,'Omitere reclame',()=>{prefs.ads=!prefs.ads;if(!prefs.ads)restoreAdAudio();syncPrefs();save('prefs',prefs);say(prefs.ads?'Omit reclame când playerul le identifică.':'Omiterea reclamelor oprită.');});
    const sb=button(toggles,'SponsorBlock',()=>{prefs.sponsor=!prefs.sponsor;syncPrefs();save('prefs',prefs);loadSegments();});
    const adCss=el('style','',{id:'studytube-direct-ad-style'});adCss.textContent=`html[data-studytube-ads=on] ytd-ad-slot-renderer,html[data-studytube-ads=on] ytm-ad-slot-renderer,html[data-studytube-ads=on] ytd-promoted-video-renderer,html[data-studytube-ads=on] ytm-promoted-video-renderer,html[data-studytube-ads=on] ytd-display-ad-renderer,html[data-studytube-ads=on] ytm-display-ad-renderer,html[data-studytube-ads=on] .ytp-ad-overlay-container{display:none!important}`;
    d.documentElement.appendChild(adCss);
    function syncPrefs(){ads.setAttribute('aria-pressed',String(prefs.ads));sb.setAttribute('aria-pressed',String(prefs.sponsor));d.documentElement.dataset.studytubeAds=prefs.ads?'on':'off';}
    syncPrefs();
    const study=row();button(study,'Reper la minut',()=>{const v=needVideo();if(!Number.isFinite(v.currentTime))return;const item={id:currentId,time:Math.floor(v.currentTime),title:d.title.replace(/ - YouTube$/,'')};marks=bookmarks([item,...marks.filter(x=>x.id!==item.id||Math.abs(x.time-item.time)>1)]);save('marks',marks);renderMarks();say(`Reper salvat la ${timeLabel(item.time)}.`);});
    const loopButton=button(study,'Buclă A–B',()=>{const v=needVideo();if(loopA===null){loopA=v.currentTime;loopButton.textContent='Setează B';say(`A = ${timeLabel(loopA)}. Avansează la capătul secțiunii.`);}else if(loopB===null){if(v.currentTime<=loopA+.25)throw new Error('Punctul B trebuie să fie după A.');loopB=v.currentTime;loopButton.textContent='Oprește bucla';say('Buclă activă. SponsorBlock este suspendat în buclă.');}else clearLoop();});
    function clearLoop(){loopA=null;loopB=null;loopButton.textContent='Buclă A–B';}
    const undo=button(row(),'Anulează ultimul salt SponsorBlock',()=>{if(!lastSkip||lastSkip.videoId!==currentId)throw new Error('Nu există un salt de anulat pentru acest clip.');ignoredSegment=lastSkip.segment.id;needVideo().currentTime=lastSkip.time;lastSkip=null;undo.disabled=true;say('Segmentul poate fi urmărit integral.');});undo.disabled=true;
    const sleepLabel=el('label','Oprire după');const sleep=el('select','',{'aria-label':'Temporizator'});
    for(const n of [0,5,10,15,30,60,90])sleep.appendChild(el('option',n?`${n} minute`:'Dezactivat',{value:String(n)}));sleepLabel.appendChild(sleep);panel.appendChild(sleepLabel);
    sleep.onchange=()=>{sleepAt=Number(sleep.value)?Date.now()+Number(sleep.value)*60000:0;say(sleepAt?'Temporizator pornit.':'Temporizator oprit.');};
    button(row(),'Deschide fișierul video disponibil',()=>{const v=needVideo();const url=directSource(v);if(!url)throw new Error('Playerul folosește un flux segmentat sau protejat; un fișier complet nu este disponibil prin acest buton.');const a=el('a','',{href:url,target:'_blank',rel:'noopener noreferrer'});a.download='video.mp4';shadow.appendChild(a);a.click();a.remove();say('Sursa directă a fost deschisă. Salvarea depinde de formatul oferit de player.');});
    const saved=el('details');saved.appendChild(el('summary','Repere salvate pe dispozitiv'));const list=el('ol','',{id:'marks'});saved.appendChild(list);panel.appendChild(saved);
    function renderMarks(){list.replaceChildren();if(!marks.length){list.appendChild(el('li','Nu ai salvat repere.'));return;}for(const item of marks){const li=el('li');li.appendChild(el('a',`${timeLabel(item.time)} · ${item.title}`,{href:`${w.location.origin}/watch?v=${item.id}&t=${item.time}s`}));list.appendChild(li);}}
    renderMarks();
    const details=el('details');details.appendChild(el('summary','Stare și limite'));const diagnostics=el('p','',{id:'diagnostics',class:'muted'});details.appendChild(diagnostics);
    details.appendChild(el('p','Calitatea se alege din comenzile YouTube. Omiterea reclamelor depinde de identificarea lor în pagină. PiP și fundalul trebuie verificate pe acest iPhone; scriptul nu adaugă descărcări offline complete.',{class:'muted'}));panel.appendChild(details);
    panel.appendChild(el('p',`v${VERSION} · pe playerul YouTube`,{class:'muted'}));shadow.appendChild(toggle);shadow.appendChild(panel);

    function player(){return current?.closest('.html5-video-player,#movie_player,#player')||null;}
    function isAd(){const root=player();return !!root&&(root.classList.contains('ad-showing')||root.classList.contains('ad-interrupting'));}
    function restoreAdAudio(){if(adMuted){if(adMuted.video.muted)adMuted.video.muted=adMuted.before;adMuted=null;}}
    function handleAd(){
      if(!current)return false;const active=isAd();
      if(!active||!prefs.ads){restoreAdAudio();return active;}
      if(!adMuted){adMuted={video:current,before:current.muted};current.muted=true;}
      const skip=player()?.querySelector(SKIP_SELECTOR);const visible=skip&&skip.getClientRects().length>0&&!skip.disabled;
      const action=adAction(true,current.duration,current.currentTime,visible);
      if(Date.now()-skipAt>400){
        if(action==='click'){skipAt=Date.now();skip.click();}
        else if(action==='seek'){skipAt=Date.now();try{current.currentTime=current.duration;}catch{}}
      }
      return true;
    }
    async function loadSegments(){
      const epoch=++generation;pending?.abort?.();pending=null;segments=[];ignoredSegment='';lastSkip=null;undo.disabled=true;
      const id=currentId;
      if(!prefs.sponsor||!id){sbState=prefs.sponsor?'În așteptare':'Oprit';return;}
      if(cache.has(id)){segments=cache.get(id);sbState=`${segments.length} segmente`;return;}
      sbState='Se încarcă';
      try{
        const digest=await w.crypto.subtle.digest('SHA-256',new w.TextEncoder().encode(id));
        const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        if(disposed||generation!==epoch)return;
        const url=`https://sponsor.ajay.app/api/skipSegments/${hash.slice(0,4)}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}&actionTypes=${encodeURIComponent('["skip"]')}`;
        let response;
        if(gm?.xmlHttpRequest){pending=gm.xmlHttpRequest({method:'GET',url,responseType:'json',timeout:10000});response=await pending;}
        else {const controller=new w.AbortController();pending={abort:()=>controller.abort()};const timer=w.setTimeout(()=>controller.abort(),10000);try{const r=await w.fetch(url,{signal:controller.signal,credentials:'omit'});response={status:r.status,response:r.status===404?[]:await r.json()};}finally{w.clearTimeout(timer);}}
        if(disposed||generation!==epoch)return;
        if(response.status!==200&&response.status!==404)throw new Error(`HTTP ${response.status}`);
        const data=response.status===404?[]:(response.response??JSON.parse(response.responseText||'[]'));
        if(!Array.isArray(data))throw new Error('Răspuns invalid');
        const record=data.find(x=>x&&(x.videoID===id||x.hash===hash));segments=validSegments(record?.segments||[]);
        cache.set(id,segments);if(cache.size>20)cache.delete(cache.keys().next().value);
        sbState=`${segments.length} segmente`;
      }catch{if(generation===epoch)sbState='Indisponibil; playerul continuă';}
      finally{if(generation===epoch)pending=null;}
    }
    function checkSleep(){if(sleepAt&&Date.now()>=sleepAt){sleepAt=0;sleep.value='0';current?.pause();say('Redarea a fost oprită de temporizator.');}}
    function sample(){return current?{time:current.currentTime,wall:Date.now(),paused:current.paused,seeking:current.seeking,readyState:current.readyState,rate:current.playbackRate}:null;}
    function onTime(){
      checkSleep();if(!current)return;
      if(routePending&&current.currentSrc!==routeSource&&current.readyState>=1)routePending=false;
      if(routePending)return;
      const point=sample();if(playbackAdvanced(previousSample,point))confirmed=true;previousSample=point;
      if(handleAd()||current.paused||current.seeking)return;
      if(loopA!==null&&loopB!==null){if(current.currentTime>=loopB)current.currentTime=loopA;return;}
      const segment=prefs.sponsor?segmentAt(segments,current.currentTime,current.duration,ignoredSegment):null;
      if(segment){lastSkip={segment,time:current.currentTime,videoId:currentId};current.currentTime=Math.min(segment.end,current.duration);undo.disabled=false;say('Segment SponsorBlock omis. Poți anula saltul.');}
    }
    function onSeeking(){previousSample=null;}
    function onLoaded(){routePending=false;confirmed=false;previousSample=null;if(current&&!isAd())current.playbackRate=prefs.speed;}
    function onRate(){if(current&&!held&&!isAd()){prefs.speed=Math.min(4,Math.max(.25,current.playbackRate));speed.value=String(prefs.speed);save('prefs',prefs);}}
    const mediaEvents={timeupdate:onTime,seeking:onSeeking,loadedmetadata:onLoaded,ratechange:onRate};
    function bind(video){
      releaseHold();restoreAdAudio();playerObserver?.disconnect();
      if(current)for(const [type,fn] of Object.entries(mediaEvents))current.removeEventListener(type,fn);
      current=video;previousSample=null;confirmed=false;
      if(current){
        routePending=false;
        for(const [type,fn] of Object.entries(mediaEvents))current.addEventListener(type,fn);
        if(!isAd())current.playbackRate=prefs.speed;
        const root=player();if(root){playerObserver=new w.MutationObserver(()=>{if(!handleAd()&&current&&!held)current.playbackRate=prefs.speed;});playerObserver.observe(root,{attributes:true,attributeFilter:['class']});}
      }
    }
    function scan(){
      if(scanTimer)w.clearTimeout(scanTimer);scanTimer=null;if(disposed)return;
      const id=videoId(w.location.href);
      if(id!==currentId){routePending=!!current;routeSource=current?.currentSrc||'';currentId=id;clearLoop();ignoredSegment='';lastSkip=null;undo.disabled=true;previousSample=null;confirmed=false;loadSegments();}
      const candidates=Array.from(d.querySelectorAll('video')).filter(v=>v.closest('.html5-video-player,#movie_player,#player'));
      const video=id?(candidates.find(v=>v.getClientRects().length&&!v.paused)||candidates.find(v=>v.getClientRects().length)||null):null;
      if(video!==current)bind(video);
      handleAd();refreshStatus();
    }
    function schedule(){if(!disposed&&!scanTimer)scanTimer=w.setTimeout(scan,200);}
    function refreshStatus(){
      const dimensions=current?.videoWidth?`${current.videoWidth}×${current.videoHeight}`:'rezoluție încă necunoscută';
      status.textContent=!current?'Deschide și pornește un videoclip pe YouTube.':`${isAd()?'Reclamă detectată':current.paused?'Pauză':confirmed?'Redare în curs':'Aștept progresul redării'} · ${dimensions}`;
      diagnostics.textContent=`Player detectat: ${current?'da':'nu'}\nProgres observat: ${confirmed?'da':'nu'}\nSponsorBlock: ${sbState}\nTemporizator: ${sleepAt?Math.max(0,Math.ceil((sleepAt-Date.now())/60000))+' minute':'oprit'}\nPiP: ${current&&(current.webkitSetPresentationMode||current.requestPictureInPicture)?'API disponibil; necesită activare':'API indisponibil'}`;
    }
    const observer=new w.MutationObserver(schedule);observer.observe(d.documentElement,{childList:true,subtree:true});
    const on=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
    for(const type of ['yt-navigate-finish','yt-page-data-updated'])on(d,type,schedule);
    on(w,'popstate',schedule);on(w,'blur',releaseHold);
    on(d,'visibilitychange',()=>{checkSleep();releaseHold();if(!d.hidden)schedule();});
    function startTimer(){if(!ticker)ticker=w.setInterval(()=>{checkSleep();if(!d.hidden){scan();}},1000);}
    on(w,'pagehide',()=>{w.clearInterval(ticker);ticker=null;releaseHold();});
    on(w,'pageshow',()=>{checkSleep();startTimer();schedule();});
    function dispose(){disposed=true;++generation;pending?.abort?.();observer.disconnect();playerObserver?.disconnect();w.clearTimeout(scanTimer);w.clearInterval(ticker);bind(null);listeners.forEach(off=>off());host.remove();adCss.remove();delete d.documentElement.dataset.studytubeAds;}
    scan();startTimer();
    return {dispose,scan,loadSegments,getState:()=>({videoId:currentId,segments:[...segments],prefs:{...prefs},confirmed,sbState})};
  }
  return {VERSION,videoId,preferences,bookmarks,validSegments,segmentAt,adAction,directSource,playbackAdvanced,timeLabel,start};
});
