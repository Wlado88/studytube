# StudyTube PWA v2

StudyTube este un PWA rapid, orientat spre iPhone, cu player HTML5 propriu.

## Funcții implementate

- Home / Trending România.
- Căutare video.
- Acceptă direct link YouTube / youtu.be / Shorts / Live.
- Player HTML5 propriu, fără iframe YouTube.
- Stream-uri prin Invidious.
- Fallback automat între mai multe instanțe publice.
- Instanță Invidious custom.
- Mod `local=true` / proxy video prin Invidious.
- SponsorBlock prin API cu k-anonymity hash.
- Categorii SponsorBlock configurabile.
- Double-tap stânga/dreapta: -10s / +10s.
- Swipe orizontal: seek.
- Long press: 2x temporar.
- Play/pause, scrubber, playback speed, fullscreen.
- Autoplay spre primul video recomandat.
- Recomandări.
- Comentarii YouTube read-only prin Invidious.
- Subtitrări atunci când instanța oferă track-uri compatibile.
- Abonamente locale.
- Feed local de abonamente.
- Istoric local.
- Favorite locale.
- Share către URL-ul original YouTube.
- PWA installable pe Home Screen.
- Shell offline prin Service Worker.

## Ce NU poate face

Nu există integrare oficială cu contul Google/YouTube. Prin urmare versiunea aceasta nu oferă:
- login Google;
- sincronizare cu abonamentele/istoricul YouTube;
- like/dislike pe contul YouTube;
- postare comentarii;
- upload;
- purchases / DRM / YouTube Premium content;
- live chat;
- download offline al videoclipurilor.

Aceste funcții ar necesita API-uri/autentificare oficială sau mecanisme neoficiale fragile.

## Despre reclame

StudyTube nu încarcă playerul oficial YouTube și nu solicită sloturile normale de ads din acel player.
SponsorBlock este separat și sare peste segmente sponsor/self-promo/interaction etc. introduse în material.

Nu există o garanție că mecanismul va rămâne permanent fără ads: YouTube și instanțele Invidious își pot schimba comportamentul, iar instanțele publice pot deveni indisponibile.

## Instalare pe iPhone — 0 lei

Ai nevoie de un URL HTTPS. Cea mai simplă variantă:

### GitHub Pages
1. Creează un repository nou.
2. Pune conținutul acestui folder în rădăcina repo-ului.
3. Settings -> Pages.
4. Deploy from branch -> main / root.
5. Deschide URL-ul Pages în Safari pe iPhone.
6. Share -> Add to Home Screen.
7. Lasă `Open as Web App` activ.

### Cloudflare Pages
Poți urca același folder ca site static.

## Recomandare de stabilitate

Instanțele publice Invidious se schimbă frecvent.
Pentru utilizare zilnică serioasă, rulează o instanță Invidious proprie și introdu URL-ul ei în Settings -> Instanță custom.

## Fișiere

- index.html
- style.css
- app.js
- manifest.webmanifest
- sw.js
- icons/

## Licențiere / termeni

Acesta este un client independent pentru uz personal/educațional.
YouTube și mărcile asociate aparțin proprietarilor lor.
Utilizarea unor front-end-uri/API-uri neoficiale poate fi afectată de termenii și modificările serviciului YouTube.
