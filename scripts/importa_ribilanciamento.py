"""Aggiunge un ribilanciamento a data/portafoglio.json partendo dall'Excel
mensile della composizione (righe con ISIN, nome e peso; una riga
"Liquidità" con il peso del contante).

Uso:
  python scripts/importa_ribilanciamento.py FILE.xlsx [--data AAAA-MM-GG]

La data di esecuzione si prende da --data oppure dal nome del file
(es. ribilanciamenti/2026-11-06.xlsx). I prezzi di carico restano vuoti:
li compila aggiorna_prezzi.py con le chiusure di quel giorno appena sono
disponibili. Se il file ha una colonna di prezzi ("Prezzo" / "Price")
vengono usati quelli.

Per le posizioni già note si riusano nome, codice Bloomberg, classe, area
e storico equivalente; per quelle nuove classe e area si deducono dal nome
(da controllare nel file).
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
FILE_PORT = ROOT / "data" / "portafoglio.json"
ISIN = re.compile(r"\b[A-Z]{2}[A-Z0-9]{9}\d\b")


def classe_da_nome(nome):
    n = nome.upper()
    if "GOLD" in n or " ORO" in n:
        return "Oro"
    if re.search(r"BOND|\bBD\b|GOV|CORP|FLO|YIELD|CAPITAL SEC|CAPT|CREDIT|AGGREG|TREASUR", n):
        return "Obbligazioni"
    return "Azioni"


def area_da_nome(nome):
    n = nome.upper()
    if re.search(r"EMRG|EMERG|CHINA|INDIA|ASIA", n):
        return "Emergenti"
    if re.search(r"S&P|NASDAQ|USA|\bUS\b|AMERICA|RUSSELL", n):
        return "USA"
    if re.search(r"EURO|EUR GOV|STOXX|EUROPE|GERMAN|ITAL|FRANC", n):
        return "Europa"
    return "Globale"


def leggi_excel(percorso):
    ws = openpyxl.load_workbook(percorso, data_only=True).active
    righe = [[c for c in r] for r in ws.iter_rows(values_only=True)]
    col_prezzo = None
    for r in righe:
        for i, c in enumerate(r):
            if isinstance(c, str) and re.search(r"prezzo|price", c, re.I):
                col_prezzo = i
    posizioni, liquidita = [], 0.0
    for r in righe:
        testi = [c for c in r if isinstance(c, str)]
        numeri = [(i, c) for i, c in enumerate(r) if isinstance(c, (int, float)) and not isinstance(c, bool)]
        if any(t.strip().lower().startswith("liquidit") for t in testi) and numeri:
            liquidita = numeri[-1][1]
            continue
        isin = next((m.group(0) for t in testi for m in [ISIN.search(t)] if m), None)
        if not isin or not numeri:
            continue
        nome = next((t.strip() for t in testi if not ISIN.fullmatch(t.strip())), isin)
        nome = ISIN.sub("", nome).strip(" \t-") or isin
        prezzo = next((c for i, c in numeri if i == col_prezzo), None) if col_prezzo is not None else None
        pesi = [c for i, c in numeri if i != col_prezzo]
        if not pesi:
            continue
        posizioni.append({"isin": isin, "nome_file": nome, "peso": pesi[-1], "prezzo": prezzo})
    if not posizioni:
        sys.exit("Nessuna posizione trovata nel file (servono righe con ISIN e peso).")
    # Pesi in frazione (0,15) o in percento (15): si porta tutto in percento
    somma = sum(p["peso"] for p in posizioni) + liquidita
    fattore = 100 if somma <= 1.5 else 1
    for p in posizioni:
        p["peso"] = round(p["peso"] * fattore, 4)
    return posizioni, round(liquidita * fattore, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--data", help="data di esecuzione AAAA-MM-GG (altrimenti dal nome del file)")
    a = ap.parse_args()
    m = re.search(r"\d{4}-\d{2}-\d{2}", a.data or Path(a.file).name)
    if not m:
        sys.exit("Manca la data di esecuzione: usa --data AAAA-MM-GG o mettila nel nome del file.")
    data = date.fromisoformat(m.group(0)).isoformat()

    posizioni, liquidita = leggi_excel(a.file)
    port = json.loads(FILE_PORT.read_text(encoding="utf-8"))
    if any(r["data"] == data for r in port["ribilanciamenti"]):
        sys.exit(f"Esiste già un ribilanciamento del {data}.")

    # Ultima definizione nota di ogni strumento
    note = {}
    for rib in sorted(port["ribilanciamenti"], key=lambda r: r["data"]):
        for p in rib["posizioni"]:
            note[p.get("isin") or p.get("bloomberg")] = p

    nuove = []
    for p in posizioni:
        vecchia = note.get(p["isin"])
        if vecchia:
            pos = {k: v for k, v in vecchia.items() if k not in ("peso", "prezzo_carico")}
        else:
            pos = {"nome": p["nome_file"], "isin": p["isin"], "bloomberg": "",
                   "classe": classe_da_nome(p["nome_file"]), "area": area_da_nome(p["nome_file"])}
            print(f"Nuova posizione: {p['nome_file']} ({p['isin']}) → {pos['classe']}, {pos['area']}")
        pos["peso"] = p["peso"]
        pos["prezzo_carico"] = p["prezzo"]  # None: lo compila aggiorna_prezzi.py
        nuove.append(pos)
    if liquidita:
        cassa = dict(note.get("CASH_EUR") or {"nome": "Liquidità EUR", "isin": "", "bloomberg": "CASH_EUR",
                                               "classe": "Liquidità", "area": "Europa", "liquidita": True})
        cassa.update({"peso": liquidita, "prezzo_carico": 1})
        nuove.append(cassa)
    nuove.sort(key=lambda x: -x["peso"])

    chiavi_nuove = {p.get("isin") or p.get("bloomberg") for p in nuove}
    usciti = [x["nome"] for x in port["ribilanciamenti"][-1]["posizioni"]
              if (x.get("isin") or x.get("bloomberg")) not in chiavi_nuove]
    somma = sum(p["peso"] for p in nuove)
    port["ribilanciamenti"].append({
        "data": data,
        "nota": f"Da {Path(a.file).name}; prezzi di carico = chiusure del {data}",
        "file": Path(a.file).name,
        "posizioni": nuove,
    })
    port["ribilanciamenti"].sort(key=lambda r: r["data"])
    FILE_PORT.write_text(json.dumps(port, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Aggiunto il ribilanciamento del {data}: {len(nuove)} posizioni, pesi totali {somma:.2f}%")
    if usciti:
        print("Escono:", ", ".join(usciti))
    if abs(somma - 100) > 0.05:
        print(f"ATTENZIONE: i pesi sommano {somma:.2f}%")


if __name__ == "__main__":
    main()
