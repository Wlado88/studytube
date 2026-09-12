# StudyTube v4.5 — funcții gratuite în player

Versiune de dezvoltare pentru utilizare din browser/PWA pe iPhone, fără Mac sau Xcode. Adaugă coadă de redare, repere, repetare A–B și fișiere locale. Nu introduce abonamente sau API-uri plătite pentru aceste funcții. Nu a fost publicată pe GitHub Pages: scrierea prin integrarea GitHub a fost refuzată cu 403.

**Redarea YouTube reală rămâne neconfirmată.** Fișierele locale folosesc playerul browserului și nu au nevoie de serviciul YouTube; compatibilitatea codec-ului și comportamentul pe iPhone trebuie verificate pe dispozitiv. Acest pachet este cod sursă pentru o aplicație web, nu o aplicație iOS instalabilă direct din ZIP.

## Ce am adăugat în v4.5

- **Coada de redare:** adăugare din carduri, din videoclipul curent sau dintr-un link YouTube; reordonare, eliminare și trecere la următorul. Maximum 100 de intrări, fără duplicate. Coada are prioritate față de sugestiile de redare automată. Intrările YouTube se păstrează pe dispozitiv.
- **Repetare A–B:** marchezi începutul și sfârșitul unui fragment. Schimbarea videoclipului sau închiderea playerului șterge fragmentul. SponsorBlock nu sare peste conținut cât timp repeți un fragment ales de tine.
- **Repere cu denumire:** salvezi un moment și revii la el prin atingere; maximum 50 pe videoclip și 1.000 în total. Reperele YouTube se păstrează local.
- **Repetă videoclipul:** reia același videoclip înainte de a consuma coada. Comanda Următorul din coadă permite avansarea manuală.
- **Video/audio din Fișiere:** selectezi până la 50 de fișiere. Primul se deschide, restul intră în coadă. Fișierele nu sunt încărcate pe server; playerul folosește direct fișierele selectate. Un fișier din iCloud poate necesita mai întâi descărcare în aplicația Fișiere.
- **Sleep timer la revenire:** verifică termenul și după revenirea în aplicație, dacă iOS a suspendat temporizatoarele. Oprirea la finalul videoclipului are prioritate față de A–B, repetare și coadă.

Fișierele locale, coada lor și reperele lor există numai în sesiunea curentă. După reîncărcarea paginii, trebuie selectate din nou. Nu sunt copiate în istoricul YouTube, favorite sau Vezi mai târziu. Aceasta nu este încă o bibliotecă offline persistentă în PWA.

## Cum folosești funcțiile noi pe iPhone

Acești pași se aplică **după publicarea versiunii v4.5**, nu site-ului vechi care este încă online.

1. Deschide site-ul și verifică eticheta **v4.5**. Pentru utilizare ca PWA: Safari → Partajare → Adaugă pe ecranul principal.
2. Acasă → **Deschide video/audio din Fișiere** → selectează un fișier disponibil pe telefon. Pentru prima încercare folosește MP4 cu H.264/AAC sau M4A/MP3. Extensia singură nu garantează un codec compatibil.
3. Atinge Play dacă browserul nu pornește automat. Glisează în jos sau atinge ⌄ pentru mini-player; navighează prin paginile aplicației. Atinge titlul mini-playerului pentru a reveni; ✕ oprește redarea.
4. Pentru coadă, folosește **＋ La coadă** și **Coada** din antet. Poți muta intrările cu ↑/↓ și le poți elimina cu ✕.
5. Pentru un fragment, atinge **Marchează A**, avansează cel puțin o jumătate de secundă și atinge **Marchează B**. **Oprește A–B** dezactivează repetarea.
6. Pentru un reper, scrie opțional o denumire și atinge **＋ Reper aici**. Atinge reperul pentru a reveni la acel moment.
7. Testează separat PiP și ecranul blocat. Dacă iOS oprește redarea, acestea nu se consideră confirmate pe telefonul respectiv.

Încărcarea catalogului Acasă poate afișa o eroare de conexiune, în timp ce deschiderea unui fișier local rămâne disponibilă. Deschiderea locală nu cere backend; catalogul YouTube continuă să folosească setările de conexiune existente.

## Ce exista deja

Playerul video rămâne montat când schimbi Acasă/Caută/Abonamente/Bibliotecă. Există mini-player, dublă atingere ±10 secunde, glisare pentru căutare în video, viteză 0,25–4×, accelerare la apăsare lungă, istoric/favorite/Vezi mai târziu locale și comenzile PiP/Media Session. Unele funcții depind de o sursă media funcțională și de browser.

Există un backend propriu Python + yt-dlp + FFmpeg, cu căutare, pregătire MP4/M4A, cache, descărcări, autentificare și HTTP Range. Nu există un serviciu activ creat în contul tău. GitHub Pages poate găzdui interfața, dar backendul necesită altă găzduire.

## Verificări efectuate pentru v4.5

- **72 de teste JavaScript trecute**, cu DOM/API/media simulate: coadă, concurență, A–B, repere, fișiere locale, mini-player, schimbarea sursei, conexiuni, userscript și cache PWA.
- **9 teste Python trecute**, cu server HTTP local și FFmpeg reale: autentificare, validare, semnături, expirare, listare/ștergere, MP4/M4A, Range/HEAD și descărcare.
- În testele Python, extractorul YouTube este înlocuit cu o înregistrare generată. FFmpeg a pregătit și decodat efectiv fișierele; HTTP a livrat octeții așteptați.
- Sintaxa JavaScript și legăturile dintre interfață și cod au fost verificate.

Aceste rezultate nu confirmă extragerea YouTube, redarea efectivă în Safari sau gesturile pe iPhone. Încercarea anterioară cu yt-dlp real a eșuat în acest mediu cu timeout HTTPS și eroare de verificare a certificatului. Docker, găzduirea și verificarea vizuală în browser nu au fost executate. Endpointul `/health` păstrează `playbackVerified:false`.

Rulează verificările de dezvoltare cu `node --test tests/*.test.cjs` și `python3 -m unittest discover -s backend/tests -v` (necesită FFmpeg).

Vezi **[CE-LIPSESTE.md](CE-LIPSESTE.md)** pentru comparația cu YouTube și **[GAZDUIRE.md](GAZDUIRE.md)** pentru opțiunile de găzduire. **[backend/README.md](backend/README.md)** descrie limitele serviciului video.
