# VICI — Balanced Growth AMC

Web app installabile (PWA) per seguire il certificato **VICI Balanced Growth AMC**
(ISIN `CH1453363652`, emittente Leonteq, sottostante `VICIGROW Index`):
posizioni, prezzi aggiornati e andamento rispetto a quanto investito.

## Cosa mostra

- **Certificato**: ultima quotazione (Euronext / Borsa Italiana) e variazione
  dal prezzo di emissione (1000).
- **Paniere stimato**: valore ricalcolato del paniere partendo da 1000 alla
  data di esecuzione, con i pesi e i prezzi di carico di `data/portafoglio.json`
  e i prezzi di mercato più recenti. Variazione totale e di oggi.
- **Il mio investimento**: numero di certificati e prezzo medio di carico
  (salvati solo sul dispositivo) → valore attuale e guadagno/perdita in € e %.
- **Andamento**: grafico del paniere stimato dalla data di esecuzione, con i
  punti della quotazione del certificato man mano che vengono raccolti.
- **Allocazione** per classe (azioni, obbligazioni, oro, liquidità).
- **Posizioni**: per ognuna peso attuale e scostamento dal peso iniziale,
  prezzo di carico, ultimo prezzo, variazione dal carico e di oggi,
  contributo alla performance.

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

## Cambiare la composizione

Dopo un ribilanciamento basta modificare `data/portafoglio.json` (pesi,
prezzi di carico, data di esecuzione, posizioni nuove). Il campo `yahoo` è
facoltativo: se è vuoto lo script trova il simbolo da solo partendo dall'ISIN.

## Pubblicazione

GitHub → **Settings** → **Pages** → *Deploy from a branch* → `main` / root.
L'app sarà su `https://massimilianodilorenzo70-eng.github.io/vici/`.

## Avvertenza

Il paniere stimato è un calcolo indicativo: non considera commissioni,
ribilanciamenti successivi alla data di esecuzione né eventuali dividendi
distribuiti. Il valore che fa fede è la quotazione ufficiale del certificato.
