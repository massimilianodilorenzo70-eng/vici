# VICI — Balanced Growth AMC

Web app installabile (PWA) per seguire il certificato **VICI Balanced Growth AMC**
(ISIN `CH1453363652`, emittente Leonteq, sottostante `VICIGROW Index`):
posizioni, prezzi aggiornati e andamento rispetto a quanto investito.

## Cosa mostra

L'app ha un menu (☰) e quattro sezioni.

**Portafoglio**
- Quotazione del certificato (Borsa Italiana) e variazione dall'emissione.
- Paniere stimato dall'ultimo ribilanciamento.
- Tabella delle posizioni (tocca una riga per il dettaglio con grafico, rischio,
  sensibilità e link): peso, prezzo di carico, prezzo attuale, variazione dal
  carico e contributo (peso × variazione), con il totale.
- Allocazione per classe e per area; "Il mio investimento" (salvato sul dispositivo).

**Andamento**
- Paniere contro un benchmark bilanciato 60/40 (MSCI World + Euro Aggregate Bond).
- Premio/sconto del certificato rispetto al paniere (sui prezzi di riferimento).
- Certificato dall'emissione: prezzi degli scambi da Borsa Italiana, prezzo di
  riferimento registrato ogni giorno, date dei ribilanciamenti.
- Indice VICIGROW: rendimenti mensili da Leonteq (inseriti a mano in
  `data/indice.json`, perché il sito Leonteq non è raggiungibile in automatico),
  andamento dall'avvio e confronto con il certificato.
- Grafico, rendimenti mensili.
- Attribuzione della performance per classe, area e posizione (dal ribilanciamento,
  da acquisto con il costo medio effettivo, dall'inizio, per mese).
- Stress test: sensibilità di ogni posizione ad azioni (S&P 500 coperto), tassi euro, oro e
  dollaro (regressione sui rendimenti settimanali dell'ultimo anno) e impatto di
  scenari pronti o liberi, sul portafoglio attuale e su quello programmato.
- Rischio del portafoglio attuale sull'ultimo anno: volatilità, perdita massima,
  VaR 95%, quota di rischio per posizione, matrice delle correlazioni.

**Gestione**
- Scostamento di ogni posizione dal peso obiettivo; oltre la soglia
  (`soglia_scostamento`, 2 punti) il workflow apre una issue su GitHub, che arriva
  anche per email, e la chiude quando tutto rientra.
- Simulatore di ribilanciamento: nuovi pesi → operazioni in euro e quantità,
  nuova allocazione; si scarica come nuovo ribilanciamento.
- Storico dei ribilanciamenti con la performance di ogni periodo.

**Report**
- Report mensile da stampare o salvare in PDF.

All'apertura l'app propone di installarsi sul telefono (Android: pulsante
«Installa»; iPhone: istruzioni per «Aggiungi alla schermata Home»).

## Come si aggiornano i dati

Il workflow `.github/workflows/aggiorna-prezzi.yml` gira nei giorni feriali
ogni ora dalle 8 alle 19 e una volta la sera. Esegue
`scripts/aggiorna_prezzi.py`, che:

1. per ogni posizione cerca il prezzo su Yahoo Finance (simbolo da Bloomberg
   o ricerca per ISIN, accettato solo se in EUR e vicino al prezzo di carico);
   per i fondi non quotati prova il NAV del Financial Times;
2. legge la quotazione del certificato;
3. scrive `data/prezzi.json` e `data/storico.json`, che l'app legge.

Il workflow `quotazione-certificato.yml` legge solo la quotazione del certificato
ogni 15 minuti durante la seduta e la salva in `data/certificato.json`.

Si può avviare a mano da GitHub → **Actions** → *Aggiorna prezzi* → **Run workflow**.

`Diagnostica fonti` salva in `debug/fonti/` una copia delle pagine di Leonteq,
Euronext e Borsa Italiana: serve per adattare lo script se una fonte cambia.

## Ribilanciamento mensile

Ogni mese arriva l'Excel della composizione (righe con ISIN, nome e peso, più la
riga "Liquidità"). Due modi per inserirlo:

- **Da GitHub:** carica il file nella cartella `ribilanciamenti/` con la data di
  esecuzione nel nome, per esempio `2026-11-06.xlsx` (Add file → Upload files).
  Il workflow *Importa ribilanciamento* lo aggiunge e ricalcola tutto.
- **A mano:** `python scripts/importa_ribilanciamento.py FILE.xlsx --data AAAA-MM-GG`.

I prezzi di carico sono le **chiusure del giorno di esecuzione**: lo script le
prende da solo il giorno dopo (per i NAV dei fondi aspetta fino a 5 giorni) e le
scrive in `data/portafoglio.json`. Fino ad allora il ribilanciamento compare in
Gestione come "programmato" e resta attivo il portafoglio precedente. Il paniere
riparte dal valore raggiunto quel giorno, quindi la curva resta continua.

Le posizioni nuove prendono classe e area dal nome (da controllare in
`data/portafoglio.json`). Nello stesso file: `certificato_al_ribilanciamento`,
`soglia_scostamento`, `benchmark`, `storico_proxy`.

## Versioni

Il numero di versione è nel menu e in fondo alla pagina; le novità di ogni
versione sono nel menu → «Novità della versione». A ogni apertura l'app legge
`versione.json` dal sito e, se è cambiata, si aggiorna e si ricarica da sola.
Per un rilascio aumenta la versione in `js/app.js`, `versione.json` e `sw.js`:
funzioni nuove → sale il secondo numero (3.0 → 3.1 → 3.2), correzioni di errori →
terzo numero (3.1 → 3.1.1 → 3.1.2).

- **3.2.1** — «Da acquisto» con il costo medio effettivo; tolto il commento del gestore dal report.
- **3.2** — attribuzione «Da acquisto» con prezzi di carico originali; carico originale nel dettaglio posizione.
- **3.1.2** — menu: tolto il link al book di Borsa Italiana, aggiunta la scheda Leonteq.
- **3.1.1** — link del menu a Euronext e al book di Borsa Italiana.
- **3.1** — prezzo corrente del certificato in cima (ultimo contratto o medio del book) e quotazione aggiornata ogni 15 minuti.
- **3.0.1** — ✕ per chiudere la finestra delle novità.
- **3.0** — book denaro/lettera e performance da Borsa Italiana, costi del KID e scomposizione della differenza con l'indice.
- **2.0** — indice VICIGROW (Leonteq) e confronto con il certificato.
- **1.9.2** — premio/sconto confrontato alla stessa data.
- **1.9.1** — correzioni (variazione giornaliera, dettaglio posizione).
- **1.9** — dettaglio posizione; storico del certificato dall'emissione.
- **1.8** — menu più semplice, correzioni su scenario libero e attribuzione.
- **1.7** — attribuzione della performance e stress test.
- **1.6** — avviso del ribilanciamento programmato in Portafoglio.
- **1.5** — numero di versione nella fascia blu in alto.
- **1.4** — controllo completo e correzioni.
- **1.3** — aggiornamento automatico all'apertura.
- **1.2** — ribilanciamento di ottobre (7/10/2026) con prezzi di carico
  automatici dalle chiusure; importazione dell'Excel mensile; riquadro del
  ribilanciamento programmato.
- **1.1** — menu e sezioni, benchmark, premio/sconto, rischio e correlazioni,
  rendimenti mensili, scostamenti con avviso email, simulatore, storico dei
  ribilanciamenti, report PDF, invito a installare all'apertura.
- **1** — prima versione.

## Pubblicazione

GitHub → **Settings** → **Pages** → *Deploy from a branch* → `main` / root.
L'app sarà su `https://massimilianodilorenzo70-eng.github.io/vici/`.

## Avvertenza

Il paniere stimato è un calcolo indicativo: non considera commissioni,
ribilanciamenti successivi alla data di esecuzione né eventuali dividendi
distribuiti. Il valore che fa fede è la quotazione ufficiale del certificato.
