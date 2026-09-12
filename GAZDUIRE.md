# StudyTube — găzduire și serviciu propriu

## Găzduire administrabilă de pe iPhone — numai opțiuni fără abonament

Nu este necesar un Mac/Xcode pentru această aplicație web. Este necesar un serviciu de găzduire care poate rula Docker, Python, Node 22 și FFmpeg; GitHub Pages singur nu poate rula backendul.

1. Publică sursele acestei arhive în repository, păstrând structura. Integrarea GitHub a refuzat anterior scrierea cu 403; această sesiune nu a încărcat fișierele și nu a făcut deploy.
2. Pentru un test fără abonament, poți crea în Render un Blueprint din repository și fișierul render.yaml, care selectează acum planul Free. Folosește un workspace gratuit fără metodă de plată dacă vrei ca depășirea cotelor să ducă la suspendare, nu la costuri suplimentare. Acest plan nu este recomandat ca serviciu video stabil: adoarme după 15 minute, pierde fișierele temporare și poate fi suspendat pentru trafic mare inițiat de server. Nu am creat niciun serviciu.
3. Render va genera STUDYTUBE_TOKEN. Copiază cheia numai în Setările aplicației, nu în codul public sau în conversație.
4. După terminarea buildului, deschide adresa HTTPS a serviciului și așteaptă pornirea lui; pe Free poate dura aproximativ un minut. Apoi reîncearcă verificarea dacă prima cerere expiră; el servește și interfața web. În Setări → Serviciul tău StudyTube, introdu aceeași adresă HTTPS și cheia, apoi Verifică conexiunea și Salvează.
5. Lipește un link YouTube în Caută. Așteaptă pregătirea. Dacă apare eroare, ea trebuie diagnosticată pe serviciul găzduit; un build reușit nu dovedește că YouTube este accesibil.
6. Pentru descărcare: Bibliotecă → Fișiere pregătite pe server → Salvează MP4. Pe iPhone, dacă se deschide playerul browserului, folosește Partajare → Salvează în Fișiere.
7. După confirmarea redării, adaugă site-ul pe ecranul principal din Safari. Verifică separat mini-playerul, schimbarea paginilor, PiP și telefonul blocat.

Alternativ, poți păstra frontendul pe GitHub Pages și folosi URL-ul serviciului numai pentru API; STUDYTUBE_ORIGINS este configurat pentru https://wlado88.github.io. Pentru alt frontend, setează originile exacte, separate prin virgulă, fără slash la final. Cheia serverului se păstrează doar în sesiunea browserului și poate necesita reintroducere la o sesiune nouă.

## Verificare pentru dezvoltare

- `node --test tests/*.test.cjs`
- `python3 -m unittest discover -s backend/tests -v` (necesită FFmpeg)
- Dockerfile instalează yt-dlp cu EJS și Node 22. Cererile folosesc numai ID-uri YouTube validate, nu URL-uri arbitrare sau comenzi shell.
- Serviciu personal, o singură instanță de proces; nu este o arhitectură de streaming pentru mulți utilizatori. Accesul public trebuie terminat prin HTTPS la furnizorul de găzduire.

Documentație: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [EJS și runtime JavaScript](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [Render Blueprint](https://render.com/docs/blueprint-spec).


## Alternative gratuite verificate la 12 septembrie 2026

### Pentru StudyTube: Oracle Cloud Always Free

Dintre variantele consultate, aceasta are resursele gratuite cele mai potrivite pentru un serviciu personal de fișiere video: pentru A1, documentația curentă indică echivalentul a 2 OCPU și 12 GB RAM, 200 GB de block storage în total și 10 TB/lună de trafic extern. Sunt cote comune contului, nu alocații separate pentru fiecare VM. Nu presupune vechile limite de 4 OCPU/24 GB din tutoriale.

Folosește numai resursele marcate Always Free, în regiunea de domiciliu a contului. Creditul de probă de 300 USD nu este o soluție permanent gratuită. Oracle poate să nu aibă capacitate disponibilă și poate recupera VM-urile considerate inactive. Cere un card pentru verificarea identității; pot apărea autorizări temporare, fără achiziție efectivă. Nu este necesară trecerea contului la Pay As You Go pentru a folosi resursele Always Free disponibile.

Dockerfile-ul existent este portabil; nu există însă în acest pachet un deploy Oracle executat, o VM rezervată sau HTTPS configurat. Crearea contului, verificarea identității și accesul la resursele contului nu pot fi înlocuite prin cod. Un server Oracle nu garantează că YouTube permite extragerea de pe IP-ul lui.

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/faq/

### Pentru utilizare directă de pe iPhone: Brave Playlist

Brave descrie Playlist ca funcție gratuită cu redare fără reclame, ascultare în fundal, comenzi pe ecranul blocat și păstrare offline în browser. Documentația include YouTube ca exemplu de pagină de pe care poți adăuga conținut. Fișierele Playlist rămân în Brave și nu se exportă ca fișiere normale către alt dispozitiv.

Este o alternativă existentă pentru o parte dintre cerințe, nu o implementare StudyTube și nu dovedește paritate cu toate gesturile, SponsorBlock, sincronizarea și funcțiile YouTube Premium. Funcționarea pe telefonul utilizatorului nu a fost verificată în această sesiune.

- https://brave.com/playlist/

### Opțiuni mai puțin potrivite

- Render Free: 750 ore/workspace/lună; suspendare după 15 minute fără trafic, cache pierdut la oprire; prag suplimentar pentru trafic inițiat de serviciu. Cu metodă de plată, depășirea traficului inclus poate genera costuri. Fără metodă de plată, documentația indică suspendarea serviciilor la depășire. Pachetul a fost schimbat la Free numai pentru evaluare: https://render.com/docs/free
- Koyeb Free: 512 MB RAM, 0,1 vCPU și 2 GB SSD, o instanță pe organizație, suspendare după o oră fără trafic. Resursele sunt strânse pentru cache și pregătirea video din acest proiect; nu recomand o migrare înainte de adaptare și testare: https://www.koyeb.com/docs/reference/instances
- Hugging Face Spaces: CPU Basic este prezentat fără tarif orar, însă documentația curentă cere plan plătit pentru crearea Docker Spaces. Prin urmare nu este o soluție fără abonament pentru acest backend: https://huggingface.co/docs/hub/spaces-overview
- Google Cloud Compute Free Tier: cota de trafic extern indicată pentru e2-micro este 1 GB/lună; nepotrivită pentru folosirea frecventă a unui serviciu video fără costuri: https://cloud.google.com/products/compute

