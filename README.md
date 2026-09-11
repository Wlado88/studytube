# StudyTube PWA v4

StudyTube v4 este o evoluție a v3 concentrată pe player și fiabilitate pe iPhone.

## Nou în v4

- Player adaptiv: preferă HLS nativ pe Safari/iPhone și poate folosi MPEG-DASH prin dash.js 5.2.2 când backend-ul oferă manifest.
- Opțiuni de calitate din player. 1080p/1440p/2160p depind de disponibilitatea DASH/HLS a backend-ului; fallback-ul progresiv este de obicei până la 720p.
- Piped fallback pentru playback dacă Invidious nu oferă stream sau cade.
- SponsorBlock automat (sponsor/selfpromo/interaction, intro/outro opționale).
- Viteze 0.25×–4× și long-press configurabil la 2×/2.5×/3×/4×.
- Media Session API: metadata și controale play/pause/seek din lock screen/Control Center unde WebKit permite.
- Audio/Background mode: schimbă pe cel mai bun stream audio separat pentru cea mai bună șansă de redare în fundal pe iOS.
- PiP cu detectare de suport; dacă PWA standalone este blocat de WebKit, oferă fallback către Safari.
- Download pentru stream-uri progresive (audio+video) și audio separat, pentru conținut pe care îl deții sau ai permisiunea să îl descarci. Nu ocolește DRM.
- Watch Later local real; nu mai pretinde sincronizare cu Watch Later YouTube (API-ul oficial nu îl expune util).
- Google OAuth/YouTube Data API din v3 rămâne pentru subscriptions, likes și comments.

## Limitări reale iPhone

- PiP în Home Screen PWA poate fi blocat de anumite versiuni iOS/WebKit, chiar dacă funcționează în Safari.
- Background audio este best-effort; iOS poate suspenda PWA-uri și evenimentele de autoplay/next-track în fundal.
- 4K/1440p/1080p necesită un manifest adaptive valid și un backend care îl servește. Nu este același lucru cu 1080p Premium enhanced bitrate.
- Public Invidious/Piped instances pot fi blocate sau rate-limited de YouTube. Pentru stabilitate maximă, self-hosting este superior.
- Download-ul nu este pentru conținut DRM/licențiat și nu trebuie folosit pentru materiale pentru care nu ai permisiunea să păstrezi o copie.

## Upgrade de la v3

În repository-ul GitHub Pages înlocuiește:

- index.html
- app.js
- style.css
- manifest.webmanifest
- sw.js
- README.md

Păstrează folderul icons/.

După deploy, închide complet StudyTube și redeschide-l. Dacă vezi încă v3, Safari/PWA poate avea cache-ul vechi: deschide URL-ul GitHub Pages în Safari o dată, apoi redeschide aplicația.

## Publicare în Wlado88/studytube

- GitHub Pages publică automat din ramura `main`, rădăcina repository-ului.
- Pictogramele trebuie să existe direct în `icons/`, la căile din manifest și service worker.
- Service worker-ul se înregistrează la pornire, fără să aștepte API-urile video. Cache-ul este separat pentru această aplicație; actualizarea păstrează istoricul, favoritele, abonamentele și setările locale din v2/v3.
- Conectarea Google necesită un OAuth Client ID configurat de proprietar în Setări și autorizat pentru originea site-ului. Nu include Client Secret sau tokenuri în fișierele publicate.
