# Istruzioni per Claude

- Rispondi e scrivi SEMPRE in italiano: messaggi all'utente, aggiornamenti mentre lavori, commit, commenti nel codice.
- Numero di versione dell'app: progressivo (1, 1.1, 1.2, …), definito in `js/app.js` (`VERSIONE` e `NOVITA`) e in `sw.js` (`CACHE_NAME`). Ad ogni rilascio aumentalo e aggiungi la voce nelle novità.
- Composizione del certificato in `data/portafoglio.json` (elenco `ribilanciamenti`); i prezzi li scrive il workflow `Aggiorna prezzi`.
- Ribilanciamento mensile: l'utente manda l'Excel della composizione. Copialo in `ribilanciamenti/AAAA-MM-GG_nome.xlsx` (data di esecuzione) e lancia `python scripts/importa_ribilanciamento.py <file> --data AAAA-MM-GG`; controlla nome, codice Bloomberg, classe e area delle posizioni nuove. Prezzi di carico vuoti: li compila `aggiorna_prezzi.py` con le chiusure del giorno di esecuzione. Poi nuova versione dell'app.
