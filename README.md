# VICI — Balanced Growth AMC

Web app installabile (PWA) per seguire il certificato **VICI Balanced Growth AMC**
(ISIN `CH1453363652`, emittente Leonteq, sottostante `VICIGROW Index`):
posizioni, prezzi aggiornati e andamento rispetto a quanto investito.

## Cosa mostra

L'app ha un menu (☰) e quattro sezioni.

**Portafoglio**
- Quotazione del certificato (Borsa Italiana) e variazione dall'emissione.
- Paniere stimato dall'ultimo ribilanciamento.
- Tabella delle posizioni: peso, prezzo di carico, prezzo attuale, variazione dal
  carico e contributo (peso × variazione), con il totale.
- Allocazione per classe e per area; "Il mio investimento" (salvato sul dispositivo).

**Andamento**
- Paniere contro un benchmark bilanciato 60/40 (MSCI World + Euro Aggregate Bond).
- Premio/sconto del certificato rispetto al paniere.
- Grafico, rendimenti mensili.
- Attribuzione della performance per classe, area e posizione (dal ribilanciamento,
  dall'inizio, per mese).
- Stress test: sensibilità di ogni posizione ad azioni mondo, tassi euro, oro e
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
- Report mensile con commento del gestore, da stampare o salvare in PDF.

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
Per un rilascio aumenta la versione in `js/app.js`, `versione.json` e `sw.js`.

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
