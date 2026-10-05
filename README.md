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

## Nuovo ribilanciamento

In `data/portafoglio.json`, nell'elenco `ribilanciamenti`, aggiungi in fondo un
elemento con data, pesi e prezzi di esecuzione (il simulatore può generarlo:
«Scarica come nuovo ribilanciamento»). Il paniere riparte dal valore raggiunto
quel giorno, quindi la curva resta continua. Nello stesso file:
`certificato_al_ribilanciamento` (prezzo del certificato quel giorno, per un
premio/sconto preciso), `soglia_scostamento` e il `benchmark`.

## Versioni

Il numero di versione è nel menu e in fondo alla pagina; le novità di ogni
versione sono nel menu → «Novità della versione».

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
