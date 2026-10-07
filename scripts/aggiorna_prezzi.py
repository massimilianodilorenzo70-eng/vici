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
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
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
    if res and len(res[0].get("timestamp") or []) < 10:
        # per alcuni listini Yahoo risponde solo con "range"
        url2 = (f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(simbolo)}"
                "?range=2y&interval=1d&includePrePost=false")
        try:
            j2 = json.loads(scarica(url2))
            r2 = (j2.get("chart") or {}).get("result") or []
            if r2 and len(r2[0].get("timestamp") or []) > len(res[0].get("timestamp") or []):
                res = r2
        except Exception:
            pass
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


# Sotto questo numero di prezzi nell'ultimo anno si prova anche un altro listino
STORIA_MINIMA = 200


def trova_prezzi(pos, cache, dal):
    """Primo listino valido (in EUR, aggiornato, vicino al prezzo di carico);
    se ha poco storico si guardano anche gli altri e si tiene il più lungo,
    altrimenti volatilità e correlazioni verrebbero falsate."""
    p0 = pos.get("prezzo_carico")  # None per il benchmark: niente controllo sul prezzo
    migliore = None
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
        if p0 and abs(g["prezzo"] / p0 - 1) > SCARTO_MAX:
            log(f"  {s}: scartato (prezzo {g['prezzo']} lontano dal carico {p0})")
            continue
        g["fonte"] = "Yahoo Finance"
        log(f"  {s}: ok {g['prezzo']} EUR ({g['borsa']}), {len(g['chiusure'])} prezzi storici")
        if migliore is None or len(g["chiusure"]) > len(migliore["chiusure"]):
            migliore = g
        if len(migliore["chiusure"]) >= STORIA_MINIMA:
            break
    if migliore:
        cache[pos["isin"]] = migliore["simbolo"]
    return migliore


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
    """Quotazione del certificato dalla pagina «Dati mercato» di Borsa
    Italiana: prezzo di riferimento e ufficiale con la loro data, ultimo
    contratto, book del market maker (denaro/lettera, ritardato di 15 minuti)
    e performance. Euronext cifra le risposte e Leonteq blocca le richieste
    automatiche, quindi si usa Borsa Italiana."""
    url = f"https://www.borsaitaliana.it/borsa/cw-e-certificates/dati-mercato.html?isin={isin}&mic=SEDX&lang=it"
    try:
        pagina = scarica(url)
    except Exception as e:
        log(f"  Borsa Italiana: {e}")
        return None
    return leggi_dati_mercato(pagina, url)


def leggi_dati_mercato(pagina, url=""):
    t = testo_pagina(pagina)
    num = r"([+-]?\d{1,3}(?:\.\d{3})*,\d+)"

    def cerca(etichetta):
        m = re.search(etichetta + r":? " + num, t)
        return numero(m.group(1)) if m else None

    ultimo = cerca("Prezzo Ultimo Contratto") or cerca("Ultimo Contratto")
    rif = cerca("Prezzo di riferimento")
    prezzo = ultimo or rif
    if not prezzo:
        salva_debug("certificato_borsa_italiana.html", pagina)
        log("  Borsa Italiana: prezzo non trovato (copia in debug/)")
        return None
    # Book: prima riga dopo l'intestazione (N, proposte, volume, denaro, lettera, volume, proposte)
    denaro = lettera = vol_d = vol_l = None
    m = re.search(r"Volume Vendita Numero Proposte 1 \d+ ([\d.]+) " + num + " " + num + r" ([\d.]+)", t)
    if m:
        vol_d, denaro, lettera, vol_l = int(m.group(1).replace(".", "")), numero(m.group(2)), numero(m.group(3)), int(m.group(4).replace(".", ""))
    data_rif = None
    m = re.search(r"Data Pr Rif e Uff (\d{2})/(\d{2})/(\d{2})", t)
    if m:
        data_rif = f"20{m.group(3)}-{m.group(2)}-{m.group(1)}"
    perf = {}
    for chiave, etichetta in [("giorno", "1 Giorno"), ("settimana", "1 Settimana"), ("mese", "1 mese"),
                              ("sei_mesi", "6 mesi"), ("anno", "1 anno"), ("inizio", "Inizio Negoziazioni")]:
        m = re.search(r"Performance " + etichetta + r" " + num + "%", t)
        if m:
            perf[chiave] = numero(m.group(1))
    log(f"  Borsa Italiana: riferimento {rif} del {data_rif}, ultimo {ultimo}, book {denaro} / {lettera}")
    medio = (denaro + lettera) / 2 if denaro and lettera else None
    if ultimo:
        corrente, tipo_corrente = ultimo, "ultimo contratto"
    elif medio:
        corrente, tipo_corrente = medio, "medio denaro/lettera"
    else:
        corrente, tipo_corrente = rif, "prezzo di riferimento"
    return {
        "corrente": corrente,
        "tipo_corrente": tipo_corrente,
        "prezzo": prezzo,
        "tipo": "ultimo contratto" if ultimo else "prezzo di riferimento",
        "riferimento": rif,
        "data_riferimento": data_rif,
        "ufficiale": cerca("Prezzo ufficiale"),
        "denaro": denaro, "lettera": lettera, "volume_denaro": vol_d, "volume_lettera": vol_l,
        "medio": medio,
        "spread": (lettera / denaro - 1) * 100 if denaro and lettera else None,
        "min_oggi": cerca("Min Oggi"),
        "max_oggi": cerca("Max Oggi"),
        "max_anno": cerca("Max Anno"),
        "min_anno": cerca("Min Anno"),
        "performance": perf,
        "fonte": "Borsa Italiana",
        "url": url,
        "ora": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def storico_certificato(isin, codice=None):
    """Chiusure storiche del certificato dal servizio grafici di Borsa
    Italiana (lo stesso usato dalle loro pagine). Restituisce [(data, prezzo)]."""
    url = "https://charts.borsaitaliana.it/charts/services/ChartWService.asmx/GetPricesWithVolume"
    chiavi = [f"{isin}.SEDX"] + ([f"{codice}.SEDX"] if codice else []) + [isin]
    for k in chiavi:
        corpo = {"request": {"SampleTime": "1d", "TimeFrame": "5y", "RequestedDataSetType": "ohlc",
                             "ChartPriceType": "price", "Key": k, "OffSet": 0, "FromDate": None,
                             "ToDate": None, "UseDelay": True, "KeyType": "Topic", "KeyType2": "Topic",
                             "Language": "it-IT"}}
        try:
            req = urllib.request.Request(url, data=json.dumps(corpo).encode(), method="POST", headers={
                "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8",
                "Accept": "application/json", "Origin": "https://www.borsaitaliana.it",
                "Referer": f"https://www.borsaitaliana.it/borsa/cw-e-certificates/scheda/{isin}-SEDX.html"})
            with urllib.request.urlopen(req, timeout=30) as r:
                testo = r.read().decode("utf-8", "replace")
        except Exception as e:
            log(f"  storico certificato ({k}): {e}")
            continue
        try:
            dati = json.loads(testo)
        except ValueError:
            log(f"  storico certificato ({k}): risposta non JSON: {testo[:200]}")
            continue
        righe = dati.get("d") if isinstance(dati, dict) else dati
        out = []
        for r in righe or []:
            if isinstance(r, list) and len(r) >= 2 and isinstance(r[0], (int, float)):
                chiusura = r[4] if len(r) >= 5 else r[1]
                if chiusura:
                    giorno = datetime.fromtimestamp(r[0] / 1000, timezone.utc).date().isoformat()
                    out.append((giorno, float(chiusura)))
        if out:
            log(f"  storico certificato ({k}): {len(out)} giorni dal {out[0][0]}")
            return sorted(out)
        log(f"  storico certificato ({k}): nessun dato: {testo[:300]}")
    return []


# ---------------------------------------------------------------- calcolo

# Finestra per volatilità, drawdown e correlazioni del portafoglio attuale
GIORNI_RISCHIO = 365
# Giorni di attesa dei prezzi di chiusura del giorno di ribilanciamento
GIORNI_ATTESA = 5


def chiave(pos):
    return pos.get("isin") or pos.get("bloomberg") or pos["nome"]


def valore_al(chiusure, giorno, ripiego):
    """Ultima chiusura disponibile fino a `giorno` compreso."""
    v = ripiego
    for d, c in chiusure:
        if d <= giorno:
            v = c
        else:
            break
    return v


def serie_allineata(chiusure, giorni, ripiego):
    """Prezzi sui giorni dati, riportando avanti l'ultimo noto."""
    out, j, v = [], 0, ripiego
    for g in giorni:
        while j < len(chiusure) and chiusure[j][0] <= g:
            v = chiusure[j][1]
            j += 1
        out.append(v)
    return out


def rendimenti(valori):
    return [(b / a - 1) if a else 0.0 for a, b in zip(valori, valori[1:])]


def media(x):
    return sum(x) / len(x) if x else 0.0


def covarianza(a, b):
    if len(a) < 2:
        return 0.0
    ma, mb = media(a), media(b)
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (len(a) - 1)


def vol_annua(r):
    return math.sqrt(max(covarianza(r, r), 0) * 252) * 100 if len(r) > 1 else None


def max_drawdown(valori):
    if not valori:
        return None
    picco, peggiore = valori[0], 0.0
    for v in valori:
        picco = max(picco, v)
        peggiore = min(peggiore, v / picco - 1)
    return peggiore * 100


def var_storico(r, livello=0.95):
    """Perdita giornaliera superata solo nel 5% dei giorni (in %)."""
    if len(r) < 20:
        return None
    ordinati = sorted(r)
    return -ordinati[int((1 - livello) * len(ordinati))] * 100


def scarica_strumenti(port, cache, dal_storia):
    strumenti = {}
    for rib in port["ribilanciamenti"]:
        for pos in rib["posizioni"]:
            strumenti[chiave(pos)] = pos  # vale la definizione più recente
    dati = {}
    for k, pos in strumenti.items():
        log(pos["nome"])
        if pos.get("liquidita"):
            dati[k] = {"prezzo": float(pos["prezzo_carico"]), "chiusure": [], "fonte": "liquidità",
                       "simbolo": None, "ora": None, "liquidita": True}
            continue
        g = trova_prezzi(pos, cache, dal_storia)
        if g is None and pos.get("isin"):
            try:
                g = ft_nav(pos["isin"])
            except Exception as e:
                log("  FT:", e)
        g = g if g and g.get("prezzo") else None
        proxy = pos.get("storico_proxy")
        if g and proxy and len(g["chiusure"]) < STORIA_MINIMA // 2:
            # Storico troppo corto per il rischio: si usa quello di uno strumento
            # equivalente, riportato al prezzo attuale (il prezzo resta quello vero)
            try:
                gp = yahoo_grafico(proxy["yahoo"], dal_storia)
                if gp["chiusure"]:
                    f = g["prezzo"] / gp["chiusure"][-1][1]
                    proprie = {d for d, _ in g["chiusure"]}
                    g["chiusure"] = sorted([(d, c * f) for d, c in gp["chiusure"] if d not in proprie] + g["chiusure"])
                    g["storico_da"] = proxy.get("nome", proxy["yahoo"])
                    log(f"  storico da {proxy['yahoo']}: {len(gp['chiusure'])} prezzi")
            except Exception as e:
                log(f"  storico da {proxy['yahoo']} non disponibile: {e}")
        dati[k] = g
    return dati


def completa_prezzi_di_carico(port, ribs, dati, oggi):
    """Ribilanciamenti senza prezzi di carico: si usano le chiusure del giorno
    di esecuzione appena ci sono tutte (i NAV dei fondi possono arrivare con
    qualche giorno di ritardo; dopo GIORNI_ATTESA si prende l'ultimo prezzo
    disponibile fino a quel giorno). I prezzi trovati si scrivono nel file, così
    restano fissi. Restituisce i ribilanciamenti ancora in attesa."""
    in_attesa, modificato = [], False
    for rib in ribs:
        vuote = [p for p in rib["posizioni"] if p.get("prezzo_carico") in (None, "")]
        if not vuote:
            continue
        d = rib["data"]
        scaduto = (oggi - date.fromisoformat(d)).days > GIORNI_ATTESA
        prezzi = {}
        for p in vuote:
            if p.get("liquidita"):
                prezzi[id(p)] = 1.0
                continue
            g = dati.get(chiave(p))
            ch = g["chiusure"] if g else []
            esatta = next((c for gg, c in ch if gg == d), None)
            if esatta is not None:
                prezzi[id(p)] = esatta
            elif scaduto and ch and ch[0][0] <= d:
                prezzi[id(p)] = valore_al(ch, d, None)
                log(f"  {p['nome']}: nessuna chiusura del {d}, uso l'ultima precedente")
        # Il giorno stesso la "chiusura" di Yahoo è ancora il prezzo della
        # giornata: si aspetta almeno il giorno dopo
        if len(prezzi) < len(vuote) or date.fromisoformat(d) >= oggi:
            mancano = [p["nome"] for p in vuote if id(p) not in prezzi]
            log(f"Ribilanciamento del {d} in attesa dei prezzi di chiusura: {', '.join(mancano) or 'giorno non ancora chiuso'}")
            in_attesa.append(rib)
            continue
        for p in vuote:
            p["prezzo_carico"] = round(prezzi[id(p)], 6)
        rib["prezzi_carico_da"] = f"chiusure del {d} (automatico)"
        modificato = True
        log(f"Ribilanciamento del {d}: prezzi di carico compilati con le chiusure")
    if modificato:
        (DATA / "portafoglio.json").write_text(json.dumps(port, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return in_attesa


def prezzo_precedente(g):
    """Chiusura del giorno di borsa prima di quello del prezzo attuale.
    Si confrontano le date: i prezzi di Yahoo hanno piccoli arrotondamenti
    (158,16 contro 158,16000366) e un confronto sui valori sbaglierebbe."""
    ch = g["chiusure"]
    if not ch:
        return None
    giorno = (g.get("ora") or "")[:10] or ch[-1][0]
    prima = [c for d, c in ch if d < giorno]
    return prima[-1] if prima else None


def mensili(serie, base):
    """Rendimento di ogni mese dalla serie giornaliera [(data, valore)]."""
    fine_mese = {}
    for d, v in serie:
        fine_mese[d[:7]] = v
    out, prec = [], base
    for mese in sorted(fine_mese):
        v = fine_mese[mese]
        out.append({"mese": mese, "rend": (v / prec - 1) * 100})
        prec = v
    return out


def calcola_rischio(posizioni_attuali, dati, oggi):
    """Rischio del portafoglio di oggi, con i pesi attuali, sull'ultimo anno."""
    dal = (oggi - timedelta(days=GIORNI_RISCHIO)).isoformat()
    voci = [r for r in posizioni_attuali if not r.get("liquidita")]
    giorni = sorted({d for r in voci if dati.get(r["chiave"])
                     for d, _ in dati[r["chiave"]]["chiusure"] if d >= dal})
    if len(giorni) < 30:
        return None
    rend, senza_storia = {}, []
    for r in voci:
        g = dati.get(r["chiave"])
        ch = g["chiusure"] if g else []
        if len([1 for d, _ in ch if d >= dal]) < 30:
            senza_storia.append(r["nome"])
        primo = next((c for d, c in ch if d >= dal), r["prezzo"])
        rend[r["chiave"]] = rendimenti(serie_allineata(ch, giorni, primo))
    pesi = {r["chiave"]: r["peso_attuale"] / 100 for r in voci}
    n = len(giorni) - 1
    rp = [sum(pesi[k] * rend[k][t] for k in rend) for t in range(n)]
    cumulato, v = [], 1.0
    for x in rp:
        v *= 1 + x
        cumulato.append(v)
    var_p = covarianza(rp, rp)
    per_posizione = []
    for r in voci:
        k = r["chiave"]
        per_posizione.append({
            "nome": r["nome"],
            "vol": vol_annua(rend[k]),
            "rend_1a": (math.prod(1 + x for x in rend[k]) - 1) * 100,
            "contributo_rischio": pesi[k] * covarianza(rend[k], rp) / var_p * 100 if var_p else None,
        })
    nomi = [r["nome"] for r in voci]
    sd = {k: math.sqrt(max(covarianza(rend[k], rend[k]), 0)) for k in rend}
    chiavi = [r["chiave"] for r in voci]
    corr = [[round(covarianza(rend[a], rend[b]) / (sd[a] * sd[b]), 3) if sd[a] and sd[b] else None
             for b in chiavi] for a in chiavi]
    return {
        "dal": giorni[0],
        "giorni": n,
        "vol": vol_annua(rp),
        "max_drawdown": max_drawdown([1.0] + cumulato),
        "var95": var_storico(rp),
        "rend_1a": (cumulato[-1] - 1) * 100,
        "peggior_giorno": min(rp) * 100,
        "miglior_giorno": max(rp) * 100,
        "posizioni": per_posizione,
        "correlazioni": {"nomi": nomi, "matrice": corr},
        "senza_storia": senza_storia,
    }


def calcola_benchmark(port, cache, dal_storia, inizio, base):
    b = port.get("benchmark")
    if not b:
        return None, []
    comp = []
    somma = sum(c["peso"] for c in b["componenti"])
    for c in b["componenti"]:
        log(f"Benchmark: {c['nome']}")
        g = trova_prezzi(c, cache, dal_storia)
        if not g:
            log("  benchmark incompleto, salto")
            return None, []
        p0 = valore_al(g["chiusure"], inizio, g["chiusure"][0][1] if g["chiusure"] else g["prezzo"])
        comp.append((c["peso"] / somma, p0, g))
    giorni = sorted({d for _, _, g in comp for d, _ in g["chiusure"] if d >= inizio})
    serie = [(d, base * sum(w * valore_al(g["chiusure"], d, p0) / p0 for w, p0, g in comp)) for d in giorni]
    valore = base * sum(w * g["prezzo"] / p0 for w, p0, g in comp)
    prec = base * sum(w * (prezzo_precedente(g) or g["prezzo"]) / p0 for w, p0, g in comp)
    # rischio del benchmark sull'ultimo anno, per confronto
    dal = (date.today() - timedelta(days=GIORNI_RISCHIO)).isoformat()
    gr = sorted({d for _, _, g in comp for d, _ in g["chiusure"] if d >= dal})
    vb = [sum(w * valore_al(g["chiusure"], d, p0) / p0 for w, p0, g in comp) for d in gr]
    rb = rendimenti(vb)
    return {
        "nome": b["nome"],
        "componenti": [{"nome": c["nome"], "peso": c["peso"], "simbolo": g["simbolo"]}
                       for c, (_, _, g) in zip(b["componenti"], comp)],
        "valore": valore,
        "perf": (valore / base - 1) * 100,
        "perf_giorno": (valore / prec - 1) * 100 if prec else None,
        "vol": vol_annua(rb),
        "max_drawdown": max_drawdown(vb),
        "rend_1a": (vb[-1] / vb[0] - 1) * 100 if len(vb) > 1 else None,
    }, serie


# ---------------------------------------------------------------- stress test

# Fattori di rischio: per ogni posizione si stima quanto reagisce a ciascuno
FATTORI = [
    # Azionario coperto dal cambio, così l'effetto del dollaro resta tutto nel fattore dollaro
    {"id": "azioni", "nome": "Azioni", "simbolo": "IUSE.L", "nota": "S&P 500 coperto dal cambio (EUR)"},
    {"id": "obbligazioni", "nome": "Tassi euro", "simbolo": "IEAG.AS", "nota": "iShares Core Euro Aggregate Bond"},
    {"id": "oro", "nome": "Oro", "simbolo": "4GLD.DE", "nota": "Xetra-Gold (EUR)"},
    {"id": "dollaro", "nome": "Dollaro", "simbolo": "EURUSD=X", "nota": "valore del dollaro in euro", "inverti": True},
]
# Duration del fattore tassi: +1 punto di tassi ≈ -6,5% sull'indice obbligazionario
DURATION_TASSI = 6.5
SCENARI = [
    {"nome": "Azioni −10%", "shock": {"azioni": -10}},
    {"nome": "Crollo azionario con fuga verso la qualità", "shock": {"azioni": -20, "tassi": -0.5, "oro": 5, "dollaro": 5}},
    {"nome": "Tassi +1 punto", "shock": {"tassi": 1}},
    {"nome": "Tassi −1 punto", "shock": {"tassi": -1}},
    {"nome": "Stagflazione", "shock": {"azioni": -10, "tassi": 1, "oro": 10}},
    {"nome": "Dollaro −10%", "shock": {"dollaro": -10}},
    {"nome": "Oro −10%", "shock": {"oro": -10}},
    {"nome": "Rialzo azionario +10%", "shock": {"azioni": 10}},
]


def risolvi(a, b):
    """Sistema lineare a·x = b (eliminazione di Gauss con pivot)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[piv][c]) < 1e-14:
            return None
        m[c], m[piv] = m[piv], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for k in range(c, n + 1):
                    m[r][k] -= f * m[c][k]
    return [m[i][n] / m[i][i] for i in range(n)]


def regressione(y, colonne):
    """Minimi quadrati con intercetta: coefficienti per colonna e R²."""
    righe = [[1.0] + [c[t] for c in colonne] for t in range(len(y))]
    k = len(righe[0])
    xtx = [[sum(r[i] * r[j] for r in righe) for j in range(k)] for i in range(k)]
    xty = [sum(r[i] * yy for r, yy in zip(righe, y)) for i in range(k)]
    coef = risolvi(xtx, xty)
    if coef is None:
        return None, None
    stima = [sum(c * x for c, x in zip(coef, r)) for r in righe]
    my = media(y)
    tot = sum((v - my) ** 2 for v in y)
    res = sum((v - e) ** 2 for v, e in zip(y, stima))
    return coef[1:], (1 - res / tot) if tot else None


def calcola_stress(dati, dal_storia, oggi):
    """Sensibilità di ogni strumento ai fattori, sui rendimenti settimanali
    dell'ultimo anno (i settimanali evitano gli sfasamenti tra borse e NAV)."""
    venerdi = []
    d = oggi - timedelta(days=GIORNI_RISCHIO)
    while d <= oggi:
        if d.weekday() == 4:
            venerdi.append(d.isoformat())
        d += timedelta(days=1)
    serie_f = {}
    for f in FATTORI:
        try:
            g = yahoo_grafico(f["simbolo"], dal_storia)
        except Exception as e:
            log(f"Stress test: fattore {f['simbolo']} non disponibile ({e})")
            return None
        ch = [(dd, 1 / c if f.get("inverti") else c) for dd, c in g["chiusure"] if c]
        if len(ch) < 100:
            log(f"Stress test: storico corto per {f['simbolo']}")
            return None
        serie_f[f["id"]] = rendimenti(serie_allineata(ch, venerdi, ch[0][1]))
    colonne = [serie_f[f["id"]] for f in FATTORI]
    beta = {}
    for k, g in dati.items():
        if not g or g.get("liquidita"):
            continue
        ch = [(dd, c) for dd, c in g["chiusure"] if dd >= venerdi[0]]
        if len(ch) < 120:
            continue
        y = rendimenti(serie_allineata(g["chiusure"], venerdi, ch[0][1]))
        coef, r2 = regressione(y, colonne)
        if coef is None:
            continue
        beta[k] = {f["id"]: round(c, 4) for f, c in zip(FATTORI, coef)}
        beta[k]["r2"] = round(r2, 3) if r2 is not None else None
    return {
        "dal": venerdi[0], "settimane": len(venerdi) - 1, "duration_tassi": DURATION_TASSI,
        "fattori": [{k: v for k, v in f.items() if k != "inverti"} for f in FATTORI],
        "beta": beta, "scenari": SCENARI,
    }


# ---------------------------------------------------------------- avvisi

def api_github(metodo, percorso, corpo=None):
    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}{percorso}"
    req = urllib.request.Request(url, method=metodo, data=json.dumps(corpo).encode() if corpo else None, headers={
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "vici-bot",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


def gestisci_avvisi(righe, soglia, nav):
    """Apre una issue (GitHub la manda anche per email) quando una posizione
    si scosta dal peso obiettivo più della soglia; la chiude quando rientra.
    Solo sul ramo principale, per non mandare avvisi dalle prove."""
    if not os.environ.get("GITHUB_TOKEN") or os.environ.get("GITHUB_REF") != "refs/heads/main":
        return
    stato_file = DATA / "avvisi.json"
    stato = json.loads(stato_file.read_text(encoding="utf-8")) if stato_file.exists() else {}
    fuori = [r for r in righe if r["oltre_soglia"]]
    nomi = sorted(r["nome"] for r in fuori)
    issue = stato.get("issue")
    try:
        if fuori and (nomi != stato.get("posizioni") or not issue):
            tabella = "\n".join(
                f"| {r['nome']} | {r['peso_obiettivo']:.2f}% | {r['peso_attuale']:.2f}% | "
                f"{r['scostamento']:+.2f} | {'vendi' if r['scostamento'] > 0 else 'compra'} "
                f"{abs(r['scostamento']):.2f}% del portafoglio |"
                for r in fuori)
            testo = (f"Posizioni oltre la soglia di {soglia:.1f} punti dal peso obiettivo:\n\n"
                     "| Posizione | Obiettivo | Attuale | Scostamento | Per riallineare |\n|---|---|---|---|---|\n"
                     f"{tabella}\n\nValore stimato del paniere: {nav:.2f}.\n"
                     "Il simulatore nella scheda *Gestione* dell'app calcola le operazioni.")
            if issue:
                api_github("POST", f"/issues/{issue}/comments", {"body": "Aggiornamento\n\n" + testo})
            else:
                issue = api_github("POST", "/issues", {
                    "title": "VICI: posizioni fuori dalla soglia di scostamento", "body": testo,
                })["number"]
            stato = {"issue": issue, "posizioni": nomi}
        elif not fuori and issue:
            api_github("POST", f"/issues/{issue}/comments",
                       {"body": "Tutte le posizioni sono rientrate nella soglia."})
            api_github("PATCH", f"/issues/{issue}", {"state": "closed", "state_reason": "completed"})
            stato = {}
    except Exception as e:
        log("Avviso GitHub non inviato:", e)
        return
    stato_file.write_text(json.dumps(stato, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------- principale

def main():
    port = json.loads((DATA / "portafoglio.json").read_text(encoding="utf-8"))
    cache_file = DATA / "simboli.json"
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
    base = float(port.get("base", 1000))
    ribs = sorted(port["ribilanciamenti"], key=lambda r: r["data"])
    inizio = ribs[0]["data"]
    oggi = date.today()
    dal_storia = min(date.fromisoformat(inizio), oggi - timedelta(days=GIORNI_RISCHIO)) - timedelta(days=5)

    dati = scarica_strumenti(port, cache, dal_storia)
    programmati = completa_prezzi_di_carico(port, ribs, dati, oggi)
    ribs = [r for r in ribs if r not in programmati]

    def prezzo_di(k, giorno, ripiego):
        g = dati.get(k)
        return valore_al(g["chiusure"], giorno, ripiego) if g and g["chiusure"] else (g["prezzo"] if g and g.get("liquidita") else ripiego)

    # Periodi tra un ribilanciamento e l'altro: ognuno riparte dal valore
    # raggiunto dal precedente, così la curva è continua
    periodi = []
    for i, rib in enumerate(ribs):
        if i == 0:
            b = base
        else:
            b = sum(q * prezzo_di(k, rib["data"], p0) for k, (q, p0) in periodi[-1]["quote"].items())
        somma = sum(p["peso"] for p in rib["posizioni"])
        quote = {chiave(p): (b * p["peso"] / somma / p["prezzo_carico"], float(p["prezzo_carico"]))
                 for p in rib["posizioni"]}
        periodi.append({"data": rib["data"], "base": b, "quote": quote, "rib": rib, "somma": somma})

    # Primo ingresso e COSTO MEDIO EFFETTIVO di ogni posizione. A ogni
    # ribilanciamento: se la quantità aumenta, la parte comprata entra nella
    # media al prezzo di quel giorno; se diminuisce, il costo medio non cambia;
    # se la posizione esce e poi rientra, si riparte da capo.
    origine = {}
    for per in periodi:
        presenti = set(per["quote"])
        for k in [k for k in origine if k not in presenti]:
            del origine[k]
        for k, (q, p0) in per["quote"].items():
            o = origine.get(k)
            if o is None:
                origine[k] = {"data": per["data"], "carico": p0, "q": q, "costo": p0}
                continue
            if q > o["q"] + 1e-12:
                o["costo"] = (o["q"] * o["costo"] + (q - o["q"]) * p0) / q
            o["q"] = q

    giorni = sorted({d for g in dati.values() if g for d, _ in g["chiusure"] if d >= inizio})
    serie_nav = []
    for d in giorni:
        per = [p for p in periodi if p["data"] <= d][-1]
        serie_nav.append((d, sum(q * prezzo_di(k, d, p0) for k, (q, p0) in per["quote"].items())))

    # Posizioni del periodo in corso
    att = periodi[-1]
    righe = []
    for pos in att["rib"]["posizioni"]:
        k = chiave(pos)
        q, p0 = att["quote"][k]
        g = dati.get(k)
        ok = g is not None
        prezzo = g["prezzo"] if ok else p0
        prec = prezzo_precedente(g) if ok and g["chiusure"] else (prezzo if ok and g.get("liquidita") else None)
        righe.append({
            "chiave": k, "nome": pos["nome"], "isin": pos.get("isin"), "bloomberg": pos.get("bloomberg"),
            "classe": pos.get("classe"), "area": pos.get("area"), "liquidita": bool(pos.get("liquidita")),
            "peso_iniziale": pos["peso"], "peso_obiettivo": pos["peso"] / att["somma"] * 100,
            "prezzo_carico": p0, "quote": q, "prezzo": prezzo, "prezzo_prec": prec,
            "data_acquisto": origine[k]["data"], "prezzo_carico_originale": origine[k]["carico"],
            "costo_medio": origine[k]["costo"],
            "var_acquisto": (prezzo / origine[k]["costo"] - 1) * 100,
            "var_giorno": (prezzo / prec - 1) * 100 if prec else None,
            "data_prezzo": (g.get("ora") or "")[:10] or (g["chiusure"][-1][0] if ok and g["chiusure"] else None) if ok else None,
            "var_carico": (prezzo / p0 - 1) * 100,
            "valore": q * prezzo,
            "simbolo": g.get("simbolo") if ok else None,
            "fonte": g.get("fonte") if ok else None,
            "aggiornato": g.get("ora") if ok else None,
            "storia": len(g["chiusure"]) if ok else 0,
            "storico_da": g.get("storico_da") if ok else None,
            "mancante": not ok,
        })
    nav = sum(r["valore"] for r in righe)
    nav_prec = sum(r["quote"] * (r["prezzo_prec"] or r["prezzo"]) for r in righe)
    soglia = float(port.get("soglia_scostamento", 2.0))
    # «Da acquisto»: valore attuale delle posizioni in portafoglio rispetto al
    # loro costo medio effettivo (utile o perdita non realizzati); i contributi
    # si sommano al totale. Gli utili già realizzati con le vendite non entrano.
    costo_acquisto = sum(r["quote"] * r["costo_medio"] for r in righe)
    for r in righe:
        r["peso_attuale"] = r["valore"] / nav * 100
        r["contributo"] = r["quote"] * (r["prezzo"] - r["prezzo_carico"]) / att["base"] * 100
        r["contributo_acquisto"] = (r["quote"] * (r["prezzo"] - r["costo_medio"]) / costo_acquisto * 100
                                    if costo_acquisto else 0.0)
        r["scostamento"] = r["peso_attuale"] - r["peso_obiettivo"]
        r["oltre_soglia"] = abs(r["scostamento"]) > soglia
    if serie_nav and serie_nav[-1][0] == oggi.isoformat():
        serie_nav[-1] = (serie_nav[-1][0], nav)
    elif oggi.weekday() < 5:  # nel fine settimana niente punto in più
        serie_nav.append((oggi.isoformat(), nav))

    classi, aree = {}, {}
    for r in righe:
        classi[r["classe"]] = classi.get(r["classe"], 0) + r["peso_attuale"]
        aree[r["area"]] = aree.get(r["area"], 0) + r["peso_attuale"]

    riepilogo_periodi = []
    for i, p in enumerate(periodi):
        fine = periodi[i + 1]["base"] if i + 1 < len(periodi) else nav
        riepilogo_periodi.append({
            "data": p["data"], "fino_al": periodi[i + 1]["data"] if i + 1 < len(periodi) else None,
            "base": p["base"], "fine": fine, "perf": (fine / p["base"] - 1) * 100,
            "posizioni": len(p["rib"]["posizioni"]), "nota": p["rib"].get("nota", ""),
        })

    # Attribuzione della performance: variazione di valore di ogni posizione
    # nel periodo, divisa per il valore iniziale. Si somma esattamente alla
    # performance anche quando c'è un ribilanciamento in mezzo.
    meta = {}
    for rib in ribs:
        for p in rib["posizioni"]:
            meta[chiave(p)] = p

    def prezzo_ora(k, ripiego):
        g = dati.get(k)
        return g["prezzo"] if g and g.get("prezzo") else ripiego

    def attribuzione(t0, t1):
        """t0, t1 date AAAA-MM-GG; t1 None = adesso."""
        delta, v0 = {}, None
        for i, p in enumerate(periodi):
            fine_p = periodi[i + 1]["data"] if i + 1 < len(periodi) else None
            s0 = max(t0, p["data"])
            if fine_p is not None and s0 >= fine_p:
                continue
            e = t1 if fine_p is None else (fine_p if t1 is None else min(t1, fine_p))
            if e is not None and e < s0:
                continue
            for k, (q, p0) in p["quote"].items():
                ps = p0 if s0 == p["data"] else prezzo_di(k, s0, p0)
                pe = prezzo_ora(k, p0) if e is None else prezzo_di(k, e, p0)
                delta[k] = delta.get(k, 0.0) + q * (pe - ps)
            if v0 is None:
                v0 = sum(q * (p0 if s0 == p["data"] else prezzo_di(k, s0, p0)) for k, (q, p0) in p["quote"].items())
        if not v0:
            return None
        pos = {k: d / v0 * 100 for k, d in delta.items()}
        per_classe, per_area = {}, {}
        for k, c in pos.items():
            m = meta.get(k, {})
            per_classe[m.get("classe", "Altro")] = per_classe.get(m.get("classe", "Altro"), 0) + c
            per_area[m.get("area", "Altro")] = per_area.get(m.get("area", "Altro"), 0) + c
        return {
            "rend": sum(pos.values()),
            "classi": per_classe, "aree": per_area,
            "posizioni": sorted(({"nome": meta.get(k, {}).get("nome", k), "classe": meta.get(k, {}).get("classe"),
                                  "contributo": c} for k, c in pos.items()), key=lambda x: -x["contributo"]),
        }

    attrib = []
    a_rib = attribuzione(att["data"], None)
    if a_rib:
        attrib.append({"id": "ribilanciamento", "etichetta": f"Dal ribilanciamento del {att['data']}", **a_rib})
    if costo_acquisto:
        cl_a, ar_a = {}, {}
        for r in righe:
            cl_a[r["classe"]] = cl_a.get(r["classe"], 0) + r["contributo_acquisto"]
            ar_a[r["area"]] = ar_a.get(r["area"], 0) + r["contributo_acquisto"]
        attrib.append({
            "id": "acquisto", "etichetta": "Da acquisto (costo medio effettivo)",
            "rend": sum(r["contributo_acquisto"] for r in righe), "classi": cl_a, "aree": ar_a,
            "posizioni": sorted(({"nome": r["nome"], "classe": r["classe"], "contributo": r["contributo_acquisto"]}
                                 for r in righe), key=lambda x: -x["contributo"]),
        })
    if len(periodi) > 1:
        a_ini = attribuzione(inizio, None)
        if a_ini:
            attrib.append({"id": "inizio", "etichetta": f"Dall'inizio ({inizio})", **a_ini})
    mesi = sorted({d[:7] for d, _ in serie_nav})
    for i, mese in enumerate(mesi):
        prec = [d for d, _ in serie_nav if d[:7] < mese]
        t0 = prec[-1] if prec else inizio
        dentro = [d for d, _ in serie_nav if d[:7] == mese]
        t1 = None if mese == oggi.isoformat()[:7] else dentro[-1]
        a_m = attribuzione(t0, t1)
        if a_m:
            attrib.append({"id": mese, "etichetta": mese, "mese": True, **a_m})

    stress = calcola_stress(dati, dal_storia, oggi)

    bench, serie_bench = calcola_benchmark(port, cache, dal_storia, inizio, base)
    rischio = calcola_rischio(righe, dati, oggi)
    r_nav = rendimenti([v for _, v in serie_nav])
    realizzato = {
        "vol": vol_annua(r_nav) if len(r_nav) >= 10 else None,
        "max_drawdown": max_drawdown([base] + [v for _, v in serie_nav]),
        "giorni": len(r_nav),
    }

    log("Certificato")
    cert = quotazione_certificato(port["isin_certificato"])

    st_file = DATA / "storico.json"
    vecchio = json.loads(st_file.read_text(encoding="utf-8")) if st_file.exists() else {}
    cert_storico = {p["data"]: p["prezzo"] for p in vecchio.get("certificato", [])}
    # Prezzi degli scambi dall'emissione (Borsa Italiana). Il certificato
    # scambia poco: nei giorni senza scambi il servizio ripete l'ultimo
    # prezzo, quindi si tiene solo quando il prezzo cambia. Serie separata
    # dai prezzi di riferimento, che sono il valore ufficiale di ogni giorno.
    scambi = []
    for giorno, prezzo in storico_certificato(port["isin_certificato"], port.get("codice_certificato")):
        if not scambi or abs(prezzo - scambi[-1][1]) > 1e-9:
            scambi.append((giorno, round(prezzo, 4)))
    if not scambi:
        scambi = [(p["data"], p["prezzo"]) for p in vecchio.get("certificato_scambi", [])]
    # Book del market maker (denaro/lettera): uno per giorno, l'ultimo letto
    book = {p["data"]: p for p in vecchio.get("certificato_book", [])}
    if cert and cert.get("denaro") and cert.get("lettera"):
        book[oggi.isoformat()] = {"data": oggi.isoformat(), "denaro": cert["denaro"], "lettera": cert["lettera"]}
    book_storico = [book[d] for d in sorted(book)]
    if cert:
        # Il prezzo di riferimento è quello della seduta precedente: va
        # registrato con quella data, non con oggi
        giorno = oggi
        if cert["tipo"] == "prezzo di riferimento":
            if cert.get("data_riferimento"):
                giorno = date.fromisoformat(cert["data_riferimento"])
            else:
                giorno = oggi - timedelta(days=1)
                while giorno.weekday() >= 5:
                    giorno -= timedelta(days=1)
        cert["data"] = giorno.isoformat()
        cert_storico[giorno.isoformat()] = cert["prezzo"]

    # Premio/sconto: quotazione del certificato contro il valore che avrebbe
    # se seguisse esattamente il paniere da un giorno di riferimento
    premio = None
    if cert:
        ancora_prezzo, ancora_data = port.get("certificato_al_ribilanciamento"), att["data"]
        ancora_nav = att["base"]
        if not ancora_prezzo:
            dopo = sorted(d for d in cert_storico if d >= att["data"])
            if dopo:
                ancora_data, ancora_prezzo = dopo[0], cert_storico[dopo[0]]
                ancora_nav = valore_al(serie_nav, ancora_data, nav)
        if ancora_prezzo:
            # Paniere alla stessa data della quotazione: il prezzo di riferimento
            # è della seduta precedente, quindi si confronta con la chiusura del
            # paniere di quel giorno e non con il valore di adesso
            data_cert = cert.get("data") or oggi.isoformat()
            nav_cert = nav if data_cert >= oggi.isoformat() else valore_al(serie_nav, data_cert, nav)
            implicito = ancora_prezzo * nav_cert / ancora_nav
            premio = {"data": ancora_data, "prezzo_riferimento": ancora_prezzo,
                      "da_configurazione": bool(port.get("certificato_al_ribilanciamento")),
                      "data_confronto": data_cert, "valore_implicito": implicito,
                      "premio": (cert["prezzo"] / implicito - 1) * 100}

    emissione = port.get("emissione", {"prezzo": base})
    adesso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = {
        "aggiornato": adesso,
        "nome": port["nome"],
        "indice": port["indice"],
        "isin_certificato": port["isin_certificato"],
        "emissione": emissione,
        "costi": port.get("costi"),
        "data_inizio": inizio,
        "data_esecuzione": att["data"],
        "base": base,
        "base_periodo": att["base"],
        "nav": nav,
        "nav_prec": nav_prec,
        "perf_totale": (nav / base - 1) * 100,
        "perf_periodo": (nav / att["base"] - 1) * 100,
        "perf_giorno": (nav / nav_prec - 1) * 100 if nav_prec else None,
        "classi": classi,
        "aree": aree,
        "soglia_scostamento": soglia,
        "certificato": cert,
        "premio": premio,
        "benchmark": bench,
        "rischio": rischio,
        "attribuzione": attrib,
        "perf_acquisto": (nav / costo_acquisto - 1) * 100 if costo_acquisto else None,
        "stress": stress,
        "realizzato": realizzato,
        "mensili": {
            "paniere": mensili(serie_nav, base),
            "benchmark": mensili(serie_bench + ([(oggi.isoformat(), bench["valore"])] if bench else []), base),
        },
        "periodi": riepilogo_periodi,
        "programmati": [{
            "data": r["data"], "nota": r.get("nota", ""),
            "posizioni": [{"nome": p["nome"], "isin": p.get("isin"), "chiave": chiave(p), "classe": p.get("classe"),
                           "peso": p["peso"], "liquidita": bool(p.get("liquidita"))} for p in r["posizioni"]],
        } for r in programmati],
        "mancanti": [r["nome"] for r in righe if r["mancante"]],
        "posizioni": righe,
    }
    (DATA / "prezzi.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    st_file.write_text(json.dumps({
        "aggiornato": adesso,
        "nav": [{"data": d, "nav": round(v, 4)} for d, v in serie_nav],
        "benchmark": [{"data": d, "valore": round(v, 4)} for d, v in serie_bench],
        "certificato": [{"data": d, "prezzo": p} for d, p in sorted(cert_storico.items())],
        "certificato_scambi": [{"data": d, "prezzo": p} for d, p in scambi],
        "certificato_book": book_storico,
    }, ensure_ascii=False, indent=0), encoding="utf-8")
    cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    # Storico dei prezzi di ogni strumento per il dettaglio posizione nell'app
    # (file a parte: si scarica solo quando si apre un dettaglio)
    dal_pos = min(inizio, (oggi - timedelta(days=GIORNI_RISCHIO)).isoformat())
    (DATA / "posizioni_storico.json").write_text(json.dumps({
        k: {"simbolo": g.get("simbolo"), "storico_da": g.get("storico_da"),
            "chiusure": [[d, round(c, 4)] for d, c in g["chiusure"] if d >= dal_pos]}
        for k, g in dati.items() if g and not g.get("liquidita")
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    salva_quotazione(cert)
    gestisci_avvisi(righe, soglia, nav)
    log(f"Paniere {nav:.2f} ({out['perf_periodo']:+.2f}% dal {att['data']}), "
        f"mancanti: {out['mancanti'] or 'nessuno'}")


def salva_quotazione(cert):
    """Scrive data/certificato.json solo se è cambiato qualcosa oltre all'ora
    di lettura, così il controllo ogni 15 minuti non crea commit inutili."""
    if not cert:
        return False
    f = DATA / "certificato.json"
    vecchio = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    if {k: v for k, v in vecchio.items() if k != "ora"} == {k: v for k, v in cert.items() if k != "ora"}:
        # invariata: non si riscrive, ma almeno ogni 20 minuti si aggiorna l'ora di
        # lettura, così l'app capisce che i controlli girano e il dato è fresco
        try:
            eta = (datetime.now(timezone.utc) - datetime.fromisoformat(vecchio["ora"])).total_seconds()
        except (KeyError, ValueError):
            eta = 1e9
        if eta < 20 * 60:
            log("Quotazione invariata")
            return False
    f.write_text(json.dumps(cert, ensure_ascii=False, indent=1), encoding="utf-8")
    return True


def solo_certificato():
    """Controllo leggero: legge solo la quotazione del certificato."""
    port = json.loads((DATA / "portafoglio.json").read_text(encoding="utf-8"))
    cert = quotazione_certificato(port["isin_certificato"])
    if cert:
        cert["data"] = cert.get("data_riferimento")
    salva_quotazione(cert)


if __name__ == "__main__":
    if "--certificato" in sys.argv:
        solo_certificato()
    else:
        main()
