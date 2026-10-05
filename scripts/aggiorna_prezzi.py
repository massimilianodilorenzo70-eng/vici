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

# Finestra per volatilità, drawdown e correlazioni del portafoglio attuale
GIORNI_RISCHIO = 365


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


def prezzo_precedente(g):
    ch = g["chiusure"]
    if len(ch) >= 2 and abs(ch[-1][1] - g["prezzo"]) < 1e-9:
        return ch[-2][1]
    return ch[-1][1] if ch else None


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
            "var_giorno": (prezzo / prec - 1) * 100 if prec else None,
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
    for r in righe:
        r["peso_attuale"] = r["valore"] / nav * 100
        r["contributo"] = r["quote"] * (r["prezzo"] - r["prezzo_carico"]) / att["base"] * 100
        r["scostamento"] = r["peso_attuale"] - r["peso_obiettivo"]
        r["oltre_soglia"] = abs(r["scostamento"]) > soglia
    if serie_nav and serie_nav[-1][0] == oggi.isoformat():
        serie_nav[-1] = (serie_nav[-1][0], nav)
    else:
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
    if cert:
        cert_storico[oggi.isoformat()] = cert["prezzo"]

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
            implicito = ancora_prezzo * nav / ancora_nav
            premio = {"data": ancora_data, "prezzo_riferimento": ancora_prezzo,
                      "da_configurazione": bool(port.get("certificato_al_ribilanciamento")),
                      "valore_implicito": implicito, "premio": (cert["prezzo"] / implicito - 1) * 100}

    emissione = port.get("emissione", {"prezzo": base})
    adesso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = {
        "aggiornato": adesso,
        "nome": port["nome"],
        "indice": port["indice"],
        "isin_certificato": port["isin_certificato"],
        "emissione": emissione,
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
        "realizzato": realizzato,
        "mensili": {
            "paniere": mensili(serie_nav, base),
            "benchmark": mensili(serie_bench + ([(oggi.isoformat(), bench["valore"])] if bench else []), base),
        },
        "periodi": riepilogo_periodi,
        "mancanti": [r["nome"] for r in righe if r["mancante"]],
        "posizioni": righe,
    }
    (DATA / "prezzi.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    st_file.write_text(json.dumps({
        "aggiornato": adesso,
        "nav": [{"data": d, "nav": round(v, 4)} for d, v in serie_nav],
        "benchmark": [{"data": d, "valore": round(v, 4)} for d, v in serie_bench],
        "certificato": [{"data": d, "prezzo": p} for d, p in sorted(cert_storico.items())],
    }, ensure_ascii=False, indent=0), encoding="utf-8")
    cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    gestisci_avvisi(righe, soglia, nav)
    log(f"Paniere {nav:.2f} ({out['perf_periodo']:+.2f}% dal {att['data']}), "
        f"mancanti: {out['mancanti'] or 'nessuno'}")


if __name__ == "__main__":
    main()
