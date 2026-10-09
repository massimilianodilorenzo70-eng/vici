# Istruzioni per Claude — progetto VICI

Memoria del progetto: leggila tutta prima di lavorare. Aggiornala quando cambia
qualcosa di importante (decisioni, fonti, preferenze, cose in sospeso).

**Dove sta questo file:** solo nel ramo `memoria` (l'utente non lo vuole in
`main`, che è pubblicato sul sito). Il ramo `memoria` NON va mai unito a `main`.
In una nuova conversazione leggilo con
`git fetch origin memoria && git show origin/memoria:CLAUDE.md`; per aggiornarlo
lavora sul ramo `memoria` (con il permesso dell'utente già dato il 5/10/2026).

## Preferenze dell'utente (vincolanti)

- **Rispondi e scrivi SEMPRE in italiano**: messaggi all'utente, aggiornamenti
  mentre lavori, commit, pull request, commenti nel codice.
- L'utente è il **gestore** del certificato VICI Balanced Growth AMC.
- **Numero di versione** (oggi **3.5**): si scrive sempre con i punti.
  - funzioni nuove → sale il secondo numero: 3.0 → 3.1 → 3.2 …
  - correzioni di errori → terzo numero: 3.1 → 3.1.1 → 3.1.2; 3.2 → 3.2.1 …
  - se l'utente dice "non aumentare la versione", non aumentarla.
  - la versione è in `js/app.js` (`VERSIONE` + voce in `NOVITA`), in
    `versione.json` e in `sw.js` (`CACHE_NAME`): vanno cambiati tutti e tre,
    più la riga nel README (sezione Versioni). All'apertura l'app confronta
    `versione.json` del sito con la sua e si aggiorna da sola.
- Scritta «Sviluppato da VCIAM» accanto al numero di versione, SOLO in fondo alla
  pagina e in fondo al menu, mai in alto nella fascia blu (richiesta dell'utente).
- Cronologia «Novità della versione» (`NOVITA`): una riga breve e sintetica per
  versione (poche parole, niente spiegazioni lunghe). Vale per ogni nuova voce.
- Quotazione del certificato: Cloudflare Worker `vici-quotazione`
  (https://vici-quotazione.massimilianodilorenzo70.workers.dev, codice in
  `cloudflare/quotazione/worker.js`, indirizzo in `data/config.json`) legge Borsa
  Italiana a ogni apertura (cache app 5 min); ripiego su `data/certificato.json`
  (workflow ogni 30 min). Euronext è cifrato: non si legge e non si decifra.
  I cron di GitHub a volte saltano ore. Prezzi di carico: se Yahoo non ha la
  chiusura del giorno si usa l'ultima barra oraria (i fondi NAV aspettano).
- Stile grafico (v3.5): «banca privata» scelto dall'utente (avorio, blu pieno con filo oro, titoli/cifre in Cormorant, linee sottili, niente ombre). Il blocco è in fondo a `css/style.css`. Alternativa scartata: «terminale finanziario». Prima di cambiare stile mostrare sempre immagini di prova.
- Header + schede sono fissi in alto (`.alto` sticky); menu con sottovoci (`SOTTOVOCI`).
- Avviso di aggiornamento: solo la riga «App aggiornata alla versione X», senza
  elenco delle modifiche e senza aprire da sola la finestra Novità.
- Rilascio: lavora sul ramo indicato dalla sessione, poi apri la pull request
  verso `main` e uniscila tu (l'utente lo vuole). GitHub Pages pubblica da `main`.
- Prima di pubblicare: prova con dati simulati e nel browser (Playwright, 320/390/
  1100 px, tema chiaro e scuro, niente pagina più larga dello schermo, niente
  "undefined"/"NaN"); se cambi lo script, fai girare il workflow sul ramo e
  controlla `data/prezzi.json` con i dati veri prima di unire.
- Non aggirare protezioni anti-bot dei siti (es. Leonteq/Incapsula): l'utente
  l'ha chiesto ed è stato rifiutato; proponi strade corrette.
- **Il progetto resta pubblico** (decisione dell'utente del 6/10/2026, anche
  dopo aver preso GitHub Pro): repository e GitHub Pages pubblici. Quindi i
  minuti di GitHub Actions sono gratuiti: NON ridurre la frequenza dei controlli
  (quotazione ogni 15 minuti, prezzi ogni ora) e non proporre il repository
  privato. L'accesso riservato (impronta + approvazione via Cloudflare, oppure
  Cloudflare Access con email) è rimandato: non farlo senza richiesta.

## Il certificato

- VICI Balanced Growth AMC, tracker open end su **VICIGROW Index** (sponsor
  Leonteq). ISIN **CH1453363652**, codice **LQ636B**, SeDeX Borsa Italiana,
  market maker Equita SIM. Emissione a 1000 (strike 15/07/2025, negoziazione dal
  29/07/2025), 15.000 pezzi.
- Costi dal KID (priipkidportal.com): commissione di gestione **2,5% annuo**,
  commissione di performance **15%** della performance positiva.
- Indice: +5,05% dall'avvio (giugno 2025 – settembre 2026), media annua 3,77%
  (Leonteq). Certificato +1,00% dall'emissione. Differenza ≈ −4 punti, di cui
  ≈ −3,4 spiegati dalle commissioni.

## Struttura del repository

- App statica PWA: `index.html`, `css/style.css`, `js/app.js`, `sw.js`,
  `manifest.json`, `icons/` (logo ricostruito in SVG; l'utente non ha mandato il
  file originale). URL: https://massimilianodilorenzo70-eng.github.io/vici/
- Sezioni: Portafoglio (certificato con book, paniere stimato, posizioni con
  dettaglio al tocco, allocazione, il mio investimento), Andamento (benchmark,
  premio/sconto, certificato dall'emissione, indice VICIGROW e costi, grafico,
  rendimenti mensili, attribuzione, stress test, rischio), Gestione
  (ribilanciamento programmato, scostamenti, simulatore, storico ribilanciamenti),
  Report (PDF mensile, senza commento del gestore: l'utente l'ha voluto togliere). Menu ☰, versione in alto a destra.
- `scripts/aggiorna_prezzi.py` (solo libreria standard): prezzi, calcoli, file in
  `data/`. `scripts/importa_ribilanciamento.py` (openpyxl): Excel → ribilanciamento.
- Workflow: `aggiorna-prezzi.yml` (giorni feriali ogni ora 8-19 + sera; anche al
  push di script/portafoglio), `quotazione-certificato.yml` (ogni 15 minuti in
  seduta: solo la quotazione → `data/certificato.json`, commit solo se cambia),
  `importa-ribilanciamento.yml` (Excel caricato in `ribilanciamenti/`),
  `diagnostica.yml` (solo a mano: prova le fonti).
- Dati:
  - `data/portafoglio.json`: elenco `ribilanciamenti` (data, pesi, prezzi di
    carico), benchmark 60/40 (IWDA.AS + IEAG.AS), soglia scostamento 2 punti,
    costi del KID, `storico_proxy` (oro → 4GLD.DE, Schroder → IEAC.AS),
    `certificato_al_ribilanciamento` (null: l'utente non ha dato il prezzo al 2/9).
  - `data/prezzi.json` (ultimo calcolo), `data/storico.json` (paniere,
    benchmark, prezzi di riferimento del certificato, scambi da Borsa Italiana,
    book giornaliero), `data/posizioni_storico.json` (prezzi per il dettaglio),
    `data/simboli.json` (ISIN → simbolo Yahoo), `data/avvisi.json` (issue aperta).
  - `data/indice.json`: rendimenti mensili dell'indice VICIGROW **inseriti a
    mano** dagli screenshot Leonteq dell'utente.

## Fonti dei dati

- Posizioni: Yahoo Finance (simbolo dal codice Bloomberg o ricerca per ISIN;
  accettato solo se in EUR, aggiornato da ≤10 giorni, vicino al carico; tra i
  validi si sceglie quello con lo storico più lungo). Ripiego NAV fondi: FT.
- Prezzo mostrato in cima: "corrente" = ultimo contratto di oggi, altrimenti
  medio denaro/lettera (come Euronext); il riferimento serve per premio/sconto.
  Lettura diretta dal browser all'apertura impossibile (CORS): servirebbe un
  servizio d'appoggio (Cloudflare Worker), proposto e non fatto.
- Certificato: Borsa Italiana «Dati mercato» (riferimento con data ufficiale,
  ufficiale, book denaro/lettera con 15 min di ritardo, performance) e servizio
  grafici di Borsa Italiana per gli scambi dall'emissione (si tengono solo i
  giorni in cui il prezzo cambia).
- **Bloccati/inutilizzabili**: Leonteq (tutti i siti, Incapsula), Euronext (dati
  cifrati), finanzen.net, MarketScreener, borse.it; onvista non ha il titolo;
  CertificatieDerivati solo anagrafica.

## Regole di calcolo (decise e verificate)

- Paniere: base 1000 al primo ribilanciamento, buy and hold con i pesi riportati
  a 100; a ogni ribilanciamento riparte dal valore raggiunto (curva continua).
  Somma dei contributi = performance del periodo (verificato).
- Prezzi di carico vuoti → chiusure del giorno di esecuzione, compilate dal
  giorno dopo (fondi: fino a 5 giorni), scritte in `portafoglio.json`; fino ad
  allora il ribilanciamento è "programmato".
- Variazione giornaliera: giorno precedente trovato per **data**, non per valore
  (gli arrotondamenti di Yahoo davano zero).
- Prezzo di riferimento = seduta precedente: si registra con la data ufficiale
  e il premio/sconto lo confronta con il paniere **alla stessa data**.
- Stress test: regressione sui rendimenti settimanali dell'ultimo anno su azioni
  (IUSE.L, coperto dal cambio), tassi (IEAG.AS, duration 6,5), oro (4GLD.DE),
  dollaro (inverso di EURUSD=X).
- Nel fine settimana nessun punto aggiunto alla serie del paniere.
- Attribuzione «Da acquisto» = **costo medio effettivo** (non il carico originale:
  l'utente l'ha chiesto): media ponderata degli acquisti; se un ribilanciamento
  aumenta la posizione la parte comprata entra nella media al prezzo di quel
  giorno, se la riduce il costo medio non cambia, se esce e rientra si riparte.
  È utile/perdita non realizzati (le vendite già incassate non entrano). Nel
  dettaglio posizione compaiono costo medio, primo acquisto e carico originale.
- Menu: link «Quotazione su Euronext» e «Scheda Leonteq» (tolto il book di Borsa
  Italiana, che l'utente non voleva).

## Procedure ricorrenti

- **Ribilanciamento mensile**: l'utente manda l'Excel della composizione e dice
  la data di esecuzione. Copialo in `ribilanciamenti/AAAA-MM-GG_nome.xlsx` e
  lancia `python scripts/importa_ribilanciamento.py <file> --data AAAA-MM-GG`;
  controlla nome, codice Bloomberg, classe e area delle posizioni nuove
  (es. Nasdaq 100 → Azioni, USA, `CSNDX IM`). Prezzi di carico: chiusure del
  giorno di esecuzione (automatico). Poi nuova versione dell'app.
- **Indice VICIGROW mensile**: l'utente manda lo screenshot della tabella
  «Yearly return since start date» di Leonteq → aggiorna `data/indice.json`
  (mesi, `totali_leonteq`, `media_annua_leonteq`, `aggiornato_al`).

## Trucchi operativi

- Se la pull request ha conflitti, quasi sempre sono nei file generati in
  `data/` (prezzi, storico, posizioni_storico) perché i workflow girano sia su
  `main` sia sul ramo di lavoro: porta `main` nel ramo (`git merge origin/main`),
  per quei file tieni la versione del ramo (`git checkout --ours`), verifica che
  i JSON siano validi, committa e riprova; il workflow li rigenera comunque.
- Il ramo `memoria` si scarica con `git fetch origin memoria` e poi
  `git checkout memoria` (se manca in locale: `git checkout -b memoria FETCH_HEAD`).

## Stato e cose in sospeso (al 6 ottobre 2026)

- Ribilanciamento del **7 ottobre 2026** (file Composizione_10.26.xlsx) inserito
  e **programmato**: entra Nasdaq 100 (7%), esce USA Small Cap, liquidità 3%.
  Diventa attivo da solo dall'8 ottobre con le chiusure del 7.
- **Controllo promesso venerdì 9 ottobre alle 10:00** (routine
  `trig_01PRW2HthWQA7qhiDRBuUEU1`): verificare che il ribilanciamento sia attivo,
  prezzi di carico = chiusure del 7, curva continua, nessun prezzo mancante.
- Premio/sconto: il primo confronto vero arriva con la seconda quotazione di
  riferimento registrata (dopo il 2 ottobre).
- Idee proposte e non ancora fatte: riepilogo serale su Telegram, report
  mensile automatico via email, esposizione valutaria/duration/TER, indicatori
  vs benchmark (tracking error, Sharpe), diario del gestore, esportazione Excel,
  accesso riservato.
