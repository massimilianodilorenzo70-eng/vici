"""Aggiorna i prezzi delle posizioni del certificato VICI e calcola l'andamento.

Gira su GitHub Actions (vedi .github/workflows/aggiorna-prezzi.yml) e scrive:
  data/prezzi.json   ultimo stato: prezzi, pesi attuali, contributi, NAV stimato
  data/storico.json  serie giornaliera del NAV stimato dalla data di esecuzione
  data/simboli.json  simboli Yahoo trovati per ogni ISIN (cache)

Metodo: alla data di esecuzione si investe `base` (1000) con i pesi indicati;
le quote di ogni posizione restano fisse (buy and hold) e il valore di oggi è
la somma quote x prezzo. Non tiene conto di commissioni, ribilanciamenti
successivi o dividendi distribuiti: per quello fa fede la quotazione del
certificato, letta a parte da Borsa Italiana / Euronext.

Solo libreria standard, nessuna dipendenza da installare.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DEBUG = ROOT / "debug"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# Suffisso Yahoo per il codice di borsa Bloomberg
BORSA_YAHOO = {"LN": ".L", "IM": ".MI", "GY": ".DE", "NA": ".AS", "FP": ".PA", "SW": ".SW"}

# Scarto massimo accettato tra prezzo trovato e prezzo di carico per dire
# "è lo strumento giusto nella valuta giusta"
SCARTO_MAX = 0.45
# Un prezzo più vecchio di così vuol dire che su quella borsa non tratta più
GIORNI_MAX = 10


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def scarica(url, tentativi=3, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "it-IT,it;q=0.9,en;q=0.8"}
    h.update(headers or {})
    ultimo = None
    for i in range(tentativi):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # rete o HTTP: riprova con attesa crescente
            ultimo = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {ultimo}")


def salva_debug(nome, testo):
    DEBUG.mkdir(exist_ok=True)
    (DEBUG / nome).write_text(testo, encoding="utf-8")


def numero(s):
    """'1.017,31' / '1,017.31' / '1017.31' -> 1017.31"""
    s = s.strip().replace(" ", "").replace(" ", "")
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


# ---------------------------------------------------------------- Yahoo

def yahoo_grafico(simbolo, dal):
    p1 = int(datetime.combine(dal, datetime.min.time(), timezone.utc).timestamp()) - 10 * 86400
    p2 = int(time.time()) + 86400
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(simbolo)}"
        f"?period1={p1}&period2={p2}&interval=1d&includePrePost=false&events=div"
    )
    j = json.loads(scarica(url))
    res = (j.get("chart") or {}).get("result") or []
    if not res:
        raise RuntimeError(f"nessun dato per {simbolo}")
    r = res[0]
    meta = r.get("meta", {})
    ts = r.get("timestamp") or []
    q = ((r.get("indicators") or {}).get("quote") or [{}])[0]
    chiusure = []
    for t, c in zip(ts, q.get("close") or []):
        if c is not None:
            chiusure.append((datetime.fromtimestamp(t, timezone.utc).date().isoformat(), float(c)))
    prezzo = meta.get("regularMarketPrice")
    ora = meta.get("regularMarketTime")
    return {
        "simbolo": simbolo,
        "valuta": meta.get("currency"),
        "borsa": meta.get("exchangeName"),
        "prezzo": float(prezzo) if prezzo is not None else (chiusure[-1][1] if chiusure else None),
        "ora": datetime.fromtimestamp(ora, timezone.utc).isoformat() if ora else None,
        "chiusure": chiusure,
    }


def yahoo_cerca(isin):
    url = (
        "https://query2.finance.yahoo.com/v1/finance/search?"
        + urllib.parse.urlencode({"q": isin, "quotesCount": 10, "newsCount": 0})
    )
    try:
        j = json.loads(scarica(url))
    except Exception as e:
        log("  ricerca Yahoo fallita:", e)
        return []
    return [q["symbol"] for q in j.get("quotes", []) if q.get("symbol")]


def candidati(pos, cache):
    out = []
    for s in (pos.get("yahoo"), cache.get(pos.get("isin"))):
        if s:
            out.append(s)
    bb = (pos.get("bloomberg") or "").split()
    if len(bb) == 2 and bb[1] in BORSA_YAHOO:
        out.append(bb[0] + BORSA_YAHOO[bb[1]])
    if pos.get("isin"):
        out += yahoo_cerca(pos["isin"])
    visti, unici = set(), []
    for s in out:
        if s not in visti:
            visti.add(s)
            unici.append(s)
    return unici


def trova_prezzi(pos, cache, dal):
    p0 = pos["prezzo_carico"]
    for s in candidati(pos, cache):
        try:
            g = yahoo_grafico(s, dal)
        except Exception as e:
            log(f"  {s}: {e}")
            continue
        if g["valuta"] != "EUR" or not g["prezzo"]:
            log(f"  {s}: scartato (valuta {g['valuta']})")
            continue
        if g["ora"] and (datetime.now(timezone.utc) - datetime.fromisoformat(g["ora"])).days > GIORNI_MAX:
            log(f"  {s}: scartato (ultimo prezzo del {g['ora'][:10]})")
            continue
        scarto = abs(g["prezzo"] / p0 - 1)
        if scarto > SCARTO_MAX:
            log(f"  {s}: scartato (prezzo {g['prezzo']} lontano dal carico {p0})")
            continue
        log(f"  {s}: ok {g['prezzo']} EUR ({g['borsa']})")
        cache[pos["isin"]] = s
        g["fonte"] = "Yahoo Finance"
        return g
    return None


# ---------------------------------------------------------------- FT (fondi)

def ft_nav(isin):
    """Ripiego per i fondi non quotati: NAV dalla scheda Financial Times."""
    url = f"https://markets.ft.com/data/funds/tearsheet/summary?s={isin}:EUR"
    html = scarica(url)
    m = re.search(r"Price \(EUR\)</span>\s*<span[^>]*>([\d.,]+)<", html)
    if not m:
        salva_debug(f"ft_{isin}.html", html)
        return None
    d = re.search(r"as of ([A-Z][a-z]{2} \d{1,2} \d{4})", html)
    ora = None
    if d:
        try:
            ora = datetime.strptime(d.group(1), "%b %d %Y").date().isoformat()
        except ValueError:
            pass
    return {"simbolo": f"FT:{isin}", "valuta": "EUR", "borsa": "NAV", "prezzo": numero(m.group(1)),
            "ora": ora, "chiusure": [], "fonte": "Financial Times"}


# ---------------------------------------------------------------- certificato

def testo_pagina(html_):
    import html as h
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html_, flags=re.S)
    t = h.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t)


def quotazione_certificato(isin):
    """Quotazione del certificato dalla scheda SeDeX di Borsa Italiana.

    Euronext cifra le risposte e Leonteq blocca le richieste automatiche,
    quindi si usa solo Borsa Italiana: ultimo contratto se c'è, altrimenti
    il prezzo di riferimento (quello del giorno prima).
    """
    url = f"https://www.borsaitaliana.it/borsa/cw-e-certificates/scheda/{isin}-SEDX.html?lang=it"
    try:
        pagina = scarica(url)
    except Exception as e:
        log(f"  Borsa Italiana: {e}")
        return None
    t = testo_pagina(pagina)
    num = r"(\d{1,3}(?:\.\d{3})*,\d+)"

    def cerca(etichetta):
        m = re.search(etichetta + r":? " + num, t)
        return numero(m.group(1)) if m else None

    ultimo = cerca("Ultimo Contratto")
    rif = cerca("Prezzo di riferimento")
    prezzo = ultimo or rif
    if not prezzo:
        salva_debug("certificato_borsa_italiana.html", pagina)
        log("  Borsa Italiana: prezzo non trovato (copia in debug/)")
        return None
    log(f"  Borsa Italiana: ultimo {ultimo}, riferimento {rif}")
    return {
        "prezzo": prezzo,
        "tipo": "ultimo contratto" if ultimo else "prezzo di riferimento",
        "riferimento": rif,
        "min_oggi": cerca("Min Oggi"),
        "max_oggi": cerca("Max Oggi"),
        "max_anno": cerca("Max Anno"),
        "min_anno": cerca("Min Anno"),
        "fonte": "Borsa Italiana",
        "url": url,
        "ora": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


# ---------------------------------------------------------------- calcolo

def valore_al(chiusure, giorno, ripiego):
    """Ultima chiusura disponibile fino a `giorno` compreso."""
    v = ripiego
    for d, c in chiusure:
        if d <= giorno:
            v = c
        else:
            break
    return v


def main():
    port = json.loads((DATA / "portafoglio.json").read_text(encoding="utf-8"))
    cache_file = DATA / "simboli.json"
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
    dal = date.fromisoformat(port["data_esecuzione"])
    base = float(port.get("base", 1000))

    # I pesi si riportano a 100 (quelli dello screenshot sommano 100,01), così
    # la somma dei contributi coincide con la performance del totale
    somma_pesi = sum(p["peso"] for p in port["posizioni"])
    righe, serie_prezzi = [], {}
    for pos in port["posizioni"]:
        p0 = float(pos["prezzo_carico"])
        quote = base * pos["peso"] / somma_pesi / p0
        log(pos["nome"])
        if pos.get("liquidita"):
            g = {"simbolo": "", "valuta": "EUR", "borsa": "", "prezzo": p0, "ora": None,
                 "chiusure": [], "fonte": "liquidità"}
        else:
            g = trova_prezzi(pos, cache, dal)
            if g is None and pos.get("isin"):
                try:
                    g = ft_nav(pos["isin"])
                except Exception as e:
                    log("  FT:", e)
        ok = g is not None and g.get("prezzo")
        prezzo = g["prezzo"] if ok else p0
        ch = g["chiusure"] if ok else []
        serie_prezzi[pos["nome"]] = (ch, p0, quote)
        prec = ch[-2][1] if len(ch) >= 2 and ch[-1][1] == prezzo else (ch[-1][1] if ch else None)
        righe.append({
            "nome": pos["nome"], "isin": pos.get("isin"), "bloomberg": pos.get("bloomberg"),
            "classe": pos.get("classe"), "area": pos.get("area"),
            "peso_iniziale": pos["peso"], "prezzo_carico": p0, "quote": quote,
            "prezzo": prezzo, "prezzo_prec": prec,
            "var_giorno": (prezzo / prec - 1) * 100 if prec else None,
            "var_carico": (prezzo / p0 - 1) * 100,
            "valore": quote * prezzo,
            "simbolo": g.get("simbolo") if ok else None,
            "fonte": g.get("fonte") if ok else None,
            "aggiornato": g.get("ora") if ok else None,
            "mancante": not ok,
        })

    nav = sum(r["valore"] for r in righe)
    nav_prec = sum(r["quote"] * (r["prezzo_prec"] or r["prezzo"]) for r in righe)
    for r in righe:
        r["peso_attuale"] = r["valore"] / nav * 100
        r["contributo"] = r["quote"] * (r["prezzo"] - r["prezzo_carico"]) / base * 100

    classi = {}
    for r in righe:
        classi[r["classe"]] = classi.get(r["classe"], 0) + r["peso_attuale"]

    log("Certificato")
    cert = quotazione_certificato(port["isin_certificato"])

    # Serie storica del NAV stimato: un punto per ogni giorno di borsa
    giorni = sorted({d for ch, _, _ in serie_prezzi.values() for d, _ in ch if d >= dal.isoformat()})
    storico = []
    for g in giorni:
        v = sum(q * valore_al(ch, g, p0) for ch, p0, q in serie_prezzi.values())
        storico.append({"data": g, "nav": round(v, 4)})

    # Le quotazioni del certificato si accumulano un giorno alla volta
    st_file = DATA / "storico.json"
    vecchio = json.loads(st_file.read_text(encoding="utf-8")) if st_file.exists() else {}
    cert_storico = {p["data"]: p["prezzo"] for p in vecchio.get("certificato", [])}
    if cert:
        cert_storico[date.today().isoformat()] = cert["prezzo"]

    adesso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = {
        "aggiornato": adesso,
        "nome": port["nome"],
        "indice": port["indice"],
        "isin_certificato": port["isin_certificato"],
        "data_esecuzione": port["data_esecuzione"],
        "base": base,
        "nav": nav,
        "nav_prec": nav_prec,
        "perf_totale": (nav / base - 1) * 100,
        "perf_giorno": (nav / nav_prec - 1) * 100 if nav_prec else None,
        "classi": classi,
        "certificato": cert,
        "mancanti": [r["nome"] for r in righe if r["mancante"]],
        "posizioni": righe,
    }
    (DATA / "prezzi.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    st_file.write_text(json.dumps({
        "aggiornato": adesso,
        "nav": storico,
        "certificato": [{"data": d, "prezzo": p} for d, p in sorted(cert_storico.items())],
    }, ensure_ascii=False, indent=0), encoding="utf-8")
    cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    log(f"NAV stimato {nav:.2f} ({out['perf_totale']:+.2f}%), mancanti: {out['mancanti'] or 'nessuno'}")


if __name__ == "__main__":
    main()
