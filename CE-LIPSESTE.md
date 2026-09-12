# StudyTube v4.5 — comparație și funcții lipsă

Stare la 12 septembrie 2026. „În cod” înseamnă implementat în acest pachet, nu confirmat pe iPhone. „Parțial” indică o dependență, un flux neconfigurat sau o diferență concretă. Site-ul GitHub Pages nu a fost actualizat cu acest pachet.

| Funcție cerută | Ce avem în StudyTube | Ce lipsește concret |
| --- | --- | --- |
| Redare YouTube în player separat | Player și două căi de obținere a sursei: instanțe publice/serviciu propriu | O sursă găzduită care livrează un videoclip YouTube real, cu imagine și sunet, confirmat pe iPhone |
| Mini-player în timpul navigării | În cod; același element video rămâne activ între pagini | Verificare pe dispozitiv cu un fișier real și apoi cu YouTube |
| Gesturi | În cod: glisare jos/sus, căutare orizontală, ±10 s, apăsare lungă | Test tactil iPhone, rafinarea animațiilor; nu există pinch-to-zoom și toate gesturile aplicației native |
| Coada de redare | Nou: adăugare, reordonare, eliminare, următorul și persistență locală pentru ID-uri YouTube | Sincronizare între dispozitive și recomandări automate pentru coadă; fișierele locale se selectează din nou după reîncărcare |
| Repetare și studiu | Nou: repetă un videoclip, A–B și repere denumite | Capitole YouTube și transcriere sincronizată; reperele sunt manuale |
| Istoric / favorite / Vezi mai târziu | Liste locale și reluarea poziției pentru YouTube | Sincronizare completă cu istoricul contului și între dispozitive; fișierele locale nu intră în aceste liste |
| Playlisturi personale | Coada și lista Vezi mai târziu | Mai multe playlisturi denumite, import/export și sincronizare Google |
| Căutare / Acasă | Căutare prin sursa configurată; backendul propriu oferă o listă tematică | Feed personalizat ca în YouTube și căutare confirmată live din găzduire |
| Abonamente | Stocare locală și cod de sincronizare Google existent | Feed verificat și API propriu pentru ultimele clipuri ale canalelor |
| Google / like / comentarii | Cod OAuth și anumite acțiuni API existente | Client ID și origine autorizată configurate; verificare reală. Backendul propriu nu livrează comentarii |
| Fără reclame video | Cale de redare a unui fișier pregătit separat | Confirmare cu YouTube real; fără promisiunea accesului la orice conținut |
| SponsorBlock | În cod; A–B are prioritate față de sărirea segmentelor | API și sărituri verificate cu clip real; acoperirea depinde de segmentele disponibile |
| Descărcare MP4 / audio | Backendul produce MP4/M4A complete; nou, playerul poate deschide fișiere locale | Extragere YouTube confirmată și flux Safari → Fișiere verificat |
| Offline persistent / Smart Downloads | Cache pentru interfața PWA; redare din fișierele selectate | Bibliotecă media offline persistentă în PWA, descărcări automate și administrarea cotei de stocare |
| Picture in Picture | Comenzi standard și WebKit în cod | PiP real verificat în Safari/PWA pe iPhone |
| Fundal / ecran blocat | Comenzi Media Session și mod audio pentru surse compatibile | Continuitate verificată cu ecranul blocat, apeluri și revenire în aplicație; iOS poate suspenda pagina |
| Calitate video | Serviciul propriu pregătește până la 1080p când există formate H.264 | Pornire instantanee, schimbare adaptivă fluidă, 4K/HDR, selecție garantată 60 fps și 1080p Premium |
| Subtitrări / limbi audio | Piste primite de la unele instanțe | Subtitrări în backendul propriu, traducere și selecție completă a limbilor audio |
| Casting / AirPlay | Atribut HTML care permite AirPlay unde îl oferă browserul | Selector verificat de dispozitive, Chromecast și control de la distanță complet |
| Shorts / live / premiere | Navigare obișnuită pentru clipuri | Flux Shorts dedicat, live, live chat și premiere; serviciul propriu refuză live |
| YouTube Music / recomandări inteligente | Mod audio, coadă, viteză manuală, sleep timer | Catalog Music separat, radio personalizat, Jump ahead și Auto speed bazate pe analiza conținutului |
| Notificări / creator | Nu sunt implementate | Push la clipuri noi, upload, editare, postări Community și administrarea canalului |
| Instalare fără computer | PWA, fără Mac/Xcode; configurație pentru găzduire | Publicarea efectivă și verificarea pe telefon; ZIP-ul nu instalează singur aplicația |

## Ordinea în care trebuie închise golurile

1. Publicarea interfeței și a unui serviciu gratuit accesibil. Scrierea GitHub a fost refuzată cu 403; nu există acces de scriere funcțional în această sesiune. Nu a fost creat niciun abonament sau server.
2. Dovadă de redare YouTube: clip public ales, imagine + sunet care progresează, salt în timp și redeschidere. Răspunsul API și testele simulate nu sunt suficiente.
3. Verificare pe iPhone: mini-player în fiecare pagină, toate gesturile, PiP, ecran blocat și revenire după întrerupere.
4. Bibliotecă offline persistentă și playlisturi denumite. Apoi feed de abonamente, subtitrări și configurarea contului Google.

Nu este necesar un abonament pentru logica nouă din player. Găzduirea video gratuită are cote și disponibilitate variabilă; codul nu creează singur capacitate gratuită nelimitată. Variantele gratuite sunt descrise în [GAZDUIRE.md](GAZDUIRE.md).

Lista de comparație include funcțiile descrise de [YouTube pentru Premium](https://support.google.com/youtube/answer/6308116?hl=en), inclusiv coadă, descărcări, fundal, PiP și continuare între dispozitive. Disponibilitatea funcțiilor YouTube diferă după platformă și regiune; acesta este inventarul StudyTube, nu o afirmație că toate funcțiile YouTube sunt disponibile pe fiecare iPhone.
