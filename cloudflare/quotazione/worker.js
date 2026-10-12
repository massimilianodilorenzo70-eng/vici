// Cloudflare Worker «vici-quotazione»
// Legge la pagina «Dati mercato» del certificato su Borsa Italiana nel momento
// in cui l'app la chiede e restituisce i dati in JSON. Serve perché il browser
// non può leggere Borsa Italiana direttamente (il sito non lo permette).
// Gratuito (fino a 100.000 richieste al giorno). I dati sono quelli di Borsa
// Italiana, ritardati di 15 minuti. Borsa Italiana viene interrogata al massimo
// una volta ogni 30 secondi, qualunque sia il numero di aperture dell'app.
// Percorso /prezzi?s=SIMBOLO,SIMBOLO: ultimo prezzo e chiusura precedente degli
// ETF da Yahoo Finance (cache di 60 secondi), per aggiornare le posizioni all'apertura.

const ISIN = "CH1453363652";
const PAGINA = `https://www.borsaitaliana.it/borsa/cw-e-certificates/dati-mercato.html?isin=${ISIN}&mic=SEDX&lang=it`;
const ORIGINI_AMMESSE = ["https://massimilianodilorenzo70-eng.github.io"];

const NUM = "([+-]?\\d{1,3}(?:\\.\\d{3})*,\\d+)";
const aNumero = (t) => parseFloat(t.replace(/\./g, "").replace(",", "."));

function testoPagina(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// Stessa lettura che fa lo script che gira su GitHub
export function leggiDatiMercato(html) {
  const t = testoPagina(html);
  const cerca = (etichetta) => {
    const m = t.match(new RegExp(etichetta + ":? " + NUM));
    return m ? aNumero(m[1]) : null;
  };
  const ultimo = cerca("Prezzo Ultimo Contratto") ?? cerca("Ultimo Contratto");
  const rif = cerca("Prezzo di riferimento");
  let denaro = null, lettera = null, volDenaro = null, volLettera = null;
  const b = t.match(new RegExp("Volume Vendita Numero Proposte 1 \\d+ ([\\d.]+) " + NUM + " " + NUM + " ([\\d.]+)"));
  if (b) {
    volDenaro = parseInt(b[1].replace(/\./g, ""), 10);
    denaro = aNumero(b[2]); lettera = aNumero(b[3]);
    volLettera = parseInt(b[4].replace(/\./g, ""), 10);
  }
  const d = t.match(/Data Pr Rif e Uff (\d{2})\/(\d{2})\/(\d{2})/);
  const dataRif = d ? `20${d[3]}-${d[2]}-${d[1]}` : null;
  const perf = {};
  [["giorno", "1 Giorno"], ["settimana", "1 Settimana"], ["mese", "1 mese"],
   ["sei_mesi", "6 mesi"], ["anno", "1 anno"], ["inizio", "Inizio Negoziazioni"]].forEach(([k, e]) => {
    const m = t.match(new RegExp("Performance " + e + " " + NUM + "%"));
    if (m) perf[k] = aNumero(m[1]);
  });
  const medio = denaro && lettera ? (denaro + lettera) / 2 : null;
  const prezzo = ultimo || rif;
  if (!prezzo) return null;
  const [corrente, tipoCorrente] = ultimo ? [ultimo, "ultimo contratto"]
    : medio ? [medio, "medio denaro/lettera"] : [rif, "prezzo di riferimento"];
  return {
    corrente, tipo_corrente: tipoCorrente,
    prezzo, tipo: ultimo ? "ultimo contratto" : "prezzo di riferimento",
    riferimento: rif, data_riferimento: dataRif, ufficiale: cerca("Prezzo ufficiale"),
    denaro, lettera, volume_denaro: volDenaro, volume_lettera: volLettera,
    medio, spread: denaro && lettera ? (lettera / denaro - 1) * 100 : null,
    min_oggi: cerca("Min Oggi"), max_oggi: cerca("Max Oggi"),
    max_anno: cerca("Max Anno"), min_anno: cerca("Min Anno"),
    performance: perf, fonte: "Borsa Italiana (diretta)", url: PAGINA,
    ora: new Date().toISOString(),
  };
}

// Prezzo attuale e chiusura precedente di un titolo dal grafico giornaliero di Yahoo Finance
export function leggiPrezzoYahoo(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.meta || !r.timestamp) return null;
  const prezzo = r.meta.regularMarketPrice, tempo = r.meta.regularMarketTime;
  if (!(prezzo > 0) || !tempo) return null;
  const giorno = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  const chiusure = r.indicators.quote[0].close;
  let prec = null;
  r.timestamp.forEach((t, i) => { if (chiusure[i] != null && giorno(t) < giorno(tempo)) prec = chiusure[i]; });
  return { prezzo, prec, ora: new Date(tempo * 1000).toISOString(), valuta: r.meta.currency || null };
}

const SIMBOLO = /^[A-Za-z0-9.=^-]{1,20}$/;

async function prezzi(url, cors) {
  const simboli = (url.searchParams.get("s") || "").split(",").filter((x) => SIMBOLO.test(x)).slice(0, 20);
  const out = {};
  await Promise.all(simboli.map(async (sim) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sim)}?range=5d&interval=1d&includePrePost=false`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; vici-quotazione)" },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (!r.ok) return;
      const v = leggiPrezzoYahoo(await r.json());
      if (v) out[sim] = v;
    } catch { /* il simbolo manca dalla risposta */ }
  }));
  return new Response(JSON.stringify(out), {
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
  });
}

export default {
  async fetch(request) {
    const origine = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINI_AMMESSE.includes(origine) ? origine : ORIGINI_AMMESSE[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname.replace(/\/$/, "").endsWith("/prezzi")) return prezzi(url, cors);
    try {
      const r = await fetch(PAGINA, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; vici-quotazione)", "Accept-Language": "it-IT,it;q=0.9" },
        cf: { cacheTtl: 30, cacheEverything: true },
      });
      if (!r.ok) throw new Error("Borsa Italiana ha risposto " + r.status);
      const dati = leggiDatiMercato(await r.text());
      if (!dati) throw new Error("prezzo non trovato nella pagina");
      return new Response(JSON.stringify(dati), {
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=20" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ errore: String(e.message || e) }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
      });
    }
  },
};
