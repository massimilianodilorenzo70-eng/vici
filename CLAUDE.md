# Istruzioni per Claude

- Rispondi e scrivi SEMPRE in italiano: messaggi all'utente, aggiornamenti mentre lavori, commit, commenti nel codice.
- Numero di versione dell'app (siamo alla 3.0): funzioni nuove → sale il secondo numero (3.0 → 3.1 → 3.2 …); correzioni di errori → si aggiunge o sale il terzo numero (3.1 → 3.1.1 → 3.1.2; 3.2 → 3.2.1). Se l'utente dice di non aumentare la versione, non aumentarla. La versione è in `js/app.js` (`VERSIONE` e `NOVITA`), in `versione.json` e in `sw.js` (`CACHE_NAME`): all'apertura l'app confronta `versione.json` del sito con la sua e si aggiorna da sola.
- Composizione del certificato in `data/portafoglio.json` (elenco `ribilanciamenti`); i prezzi li scrive il workflow `Aggiorna prezzi`.
- Ribilanciamento mensile: l'utente manda l'Excel della composizione. Copialo in `ribilanciamenti/AAAA-MM-GG_nome.xlsx` (data di esecuzione) e lancia `python scripts/importa_ribilanciamento.py <file> --data AAAA-MM-GG`; controlla nome, codice Bloomberg, classe e area delle posizioni nuove. Prezzi di carico vuoti: li compila `aggiorna_prezzi.py` con le chiusure del giorno di esecuzione. Poi nuova versione dell'app.
