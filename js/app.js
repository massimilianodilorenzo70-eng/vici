/* app.js — legge data/prezzi.json e data/storico.json (scritti ogni ora da
 * GitHub Actions) e li mostra. Nessun server: i dati personali ("Il mio
 * investimento") restano nel localStorage del dispositivo. */

const COLORI_CLASSI = {
  "Azioni": "#2C8FE0",
  "Obbligazioni": "#5BB65A",
  "Oro": "#E0B81C",
  "Liquidità": "#9AA3C7",
};
const CHIAVE_MIO = "vici-mio";
const RICARICA_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const fmt = (v, dec = 2) => v == null || isNaN(v) ? "—" :
  v.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const eur = (v, dec = 2) => v == null ? "—" : fmt(v, dec) + " €";
// Arrotondo prima di decidere il segno, così non compare "-0,00%"
const tondo = (v, dec = 2) => Math.round(v * 10 ** dec) / 10 ** dec || 0;
const perc = (v, dec = 2) => v == null ? "—" : (tondo(v, dec) > 0 ? "+" : "") + fmt(tondo(v, dec), dec) + "%";
const segno = (v) => v == null ? "" : tondo(v) > 0 ? "su" : tondo(v) < 0 ? "giu" : "";
const dataIt = (s) => s ? new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—";
const oraIt = (s) => s ? new Date(s).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

let dati = null;
let storico = null;

function leggiMio() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_MIO)) || null; } catch { return null; }
}
function salvaMio(v) {
  try { localStorage.setItem(CHIAVE_MIO, JSON.stringify(v)); } catch { /* memoria non disponibile */ }
}

async function carica() {
  const bottone = $("aggiorna");
  bottone.classList.add("gira");
  try {
    const t = Date.now();
    const [p, s] = await Promise.all([
      fetch(`data/prezzi.json?t=${t}`).then((r) => r.ok ? r.json() : null),
      fetch(`data/storico.json?t=${t}`).then((r) => r.ok ? r.json() : null),
    ]);
    if (!p || !p.posizioni) throw new Error("dati non ancora disponibili");
    dati = p;
    storico = s || { nav: [], certificato: [] };
    mostra();
    $("stato").className = "stato";
    $("stato").textContent = `Prezzi aggiornati il ${oraIt(dati.aggiornato)}` +
      (dati.mancanti && dati.mancanti.length ? ` · senza prezzo: ${dati.mancanti.join(", ")}` : "");
  } catch (e) {
    $("stato").className = "stato errore";
    $("stato").textContent = navigator.onLine
      ? `Dati non disponibili (${e.message}). Il primo aggiornamento automatico li crea.`
      : "Sei offline: mostro gli ultimi dati salvati, se ci sono.";
  } finally {
    bottone.classList.remove("gira");
  }
}

function mostra() {
  const d = dati;
  const base = d.base || 1000;

  // Certificato
  const c = d.certificato;
  if (c && c.prezzo) {
    $("cert-prezzo").textContent = eur(c.prezzo);
    const pc = (c.prezzo / base - 1) * 100;
    $("cert-perf").innerHTML = `<span class="${segno(pc)}">${perc(pc)}</span> dall'emissione a ${fmt(base, 0)}`;
    const range = c.min_oggi && c.max_oggi ? ` · oggi ${fmt(c.min_oggi)}–${fmt(c.max_oggi)}` : "";
    $("cert-fonte").textContent = `${c.tipo === "ultimo contratto" ? "Ultimo contratto" : "Prezzo di riferimento"}${range} · ${c.fonte}, ${oraIt(c.ora)}`;
  } else {
    $("cert-prezzo").textContent = "—";
    $("cert-perf").textContent = "Quotazione non disponibile";
    $("cert-fonte").textContent = "";
  }

  // Paniere stimato
  $("nav").textContent = fmt(d.nav);
  $("nav-perf").innerHTML = `<span class="${segno(d.perf_totale)}">${perc(d.perf_totale)}</span> dal ${dataIt(d.data_esecuzione)}`;
  $("nav-oggi").innerHTML = `Oggi <span class="${segno(d.perf_giorno)}">${perc(d.perf_giorno)}</span>`;
  $("data-esecuzione").textContent = dataIt(d.data_esecuzione);

  mostraMio();
  mostraGrafico();
  mostraClassi();
  mostraPosizioni();
  $("aggiornato").textContent = `Ultimo calcolo: ${oraIt(d.aggiornato)}.`;
}

function prezzoCorrente() {
  if (!dati) return null;
  if (dati.certificato && dati.certificato.prezzo) return dati.certificato.prezzo;
  return dati.nav; // senza quotazione si usa la stima (stessa base 1000)
}

function mostraMio() {
  const mio = leggiMio();
  const pieno = mio && mio.qta > 0 && mio.carico > 0;
  $("mio-vuoto").hidden = pieno;
  $("mio-dati").hidden = !pieno;
  if (!pieno) return;
  const investito = mio.qta * mio.carico;
  const valore = mio.qta * (prezzoCorrente() || mio.carico);
  const diff = valore - investito;
  $("mio-investito").textContent = eur(investito, 0);
  $("mio-valore").textContent = eur(valore, 0);
  $("mio-risultato").innerHTML = `<span class="${segno(diff)}">${diff > 0 ? "+" : ""}${eur(diff, 0)}<br>${perc(diff / investito * 100)}</span>`;
}

function apriForm(aperto) {
  const mio = leggiMio() || {};
  $("mio-form").hidden = !aperto;
  $("modifica-mio").hidden = aperto;
  if (aperto) {
    $("mio-qta").value = mio.qta || "";
    $("mio-carico").value = mio.carico || "";
    $("mio-qta").focus();
  }
}

/* ---------- grafico SVG ---------- */
function mostraGrafico() {
  const box = $("grafico");
  const nav = (storico.nav || []).map((p) => ({ t: new Date(p.data).getTime(), v: p.nav }));
  // La quotazione del certificato ha una base diversa (emissione a 1000 nel
  // 2025): la riporto sulla scala del paniere dal primo giorno in comune, così
  // si confronta l'andamento; nel suggerimento resta il prezzo vero.
  const certVero = (storico.certificato || []).map((p) => ({ t: new Date(p.data).getTime(), v: p.prezzo }));
  let fattore = 1;
  if (certVero.length && nav.length) {
    const primo = certVero[0];
    const navAllora = nav.reduce((a, p) => p.t <= primo.t ? p : a, nav[0]);
    fattore = navAllora.v / primo.v;
  }
  const cert = certVero.map((p) => ({ t: p.t, v: p.v * fattore, vero: p.v }));
  if (nav.length < 2 && cert.length < 2) {
    box.innerHTML = `<div class="vuoto">Il grafico compare dopo i primi aggiornamenti.</div>`;
    return;
  }
  const W = box.clientWidth || 600, H = box.clientHeight || 220;
  const m = { l: 44, r: 8, t: 10, b: 22 };
  const tutti = nav.concat(cert);
  const base = dati.base || 1000;
  let t0 = Math.min(...tutti.map((p) => p.t)), t1 = Math.max(...tutti.map((p) => p.t));
  if (t1 === t0) t1 = t0 + 86400000;
  let v0 = Math.min(base, ...tutti.map((p) => p.v)), v1 = Math.max(base, ...tutti.map((p) => p.v));
  const pad = (v1 - v0) * 0.08 || 5; v0 -= pad; v1 += pad;
  const x = (t) => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - v0) / (v1 - v0)) * (H - m.t - m.b);

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let i = 0; i <= 3; i++) {
    const v = v0 + (v1 - v0) * i / 3;
    svg += `<line class="griglia" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="asse" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  svg += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(base)}" y2="${y(base)}"/>`;
  const mesi = 4;
  for (let i = 0; i <= mesi; i++) {
    const t = t0 + (t1 - t0) * i / mesi;
    const breve = t1 - t0 < 120 * 86400000;
    const lab = new Date(t).toLocaleDateString("it-IT", breve ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    svg += `<text class="asse" x="${x(t)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === mesi ? "end" : "middle"}">${lab}</text>`;
  }
  const linea = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  if (nav.length) svg += `<path d="${linea(nav)}" fill="none" stroke="var(--linea-nav)" stroke-width="2" stroke-linejoin="round"/>`;
  if (cert.length > 1) svg += `<path d="${linea(cert)}" fill="none" stroke="var(--linea-cert)" stroke-width="2" stroke-linejoin="round"/>`;
  cert.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="2.5" fill="var(--linea-cert)"/>`; });
  svg += `<line id="cursore" class="griglia" y1="${m.t}" y2="${H - m.b}" x1="-10" x2="-10"/></svg><div id="sugg" class="suggerimento" hidden></div>`;
  box.innerHTML = svg;

  const sugg = $("sugg"), cursore = $("cursore");
  const vicino = (pts, t) => pts.reduce((a, p) => !a || Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a, null);
  const muovi = (ev) => {
    const r = box.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const t = t0 + (px * W / r.width - m.l) / (W - m.l - m.r) * (t1 - t0);
    const p = vicino(nav.length ? nav : cert, t);
    if (!p) return;
    const pc = vicino(cert, p.t);
    const xs = x(p.t) * r.width / W;
    cursore.setAttribute("x1", x(p.t)); cursore.setAttribute("x2", x(p.t));
    sugg.hidden = false;
    sugg.style.left = Math.min(Math.max(xs, 70), r.width - 70) + "px";
    sugg.style.top = (y(p.v) * r.height / H) + "px";
    sugg.textContent = `${dataIt(p.t)} · ${fmt(p.v)}` +
      (pc && Math.abs(pc.t - p.t) < 86400000 * 1.5 && nav.length ? ` · cert. ${fmt(pc.vero)}` : "");
  };
  box.onmousemove = muovi;
  box.ontouchmove = muovi;
  box.onmouseleave = () => { sugg.hidden = true; cursore.setAttribute("x1", -10); cursore.setAttribute("x2", -10); };
}

function mostraClassi() {
  const voci = Object.entries(dati.classi || {}).sort((a, b) => b[1] - a[1]);
  $("classi-barra").innerHTML = voci.map(([k, v]) =>
    `<div style="flex:${v};background:${COLORI_CLASSI[k] || "#888"}" title="${k} ${fmt(v, 1)}%"></div>`).join("");
  $("classi-elenco").innerHTML = voci.map(([k, v]) =>
    `<li><i style="background:${COLORI_CLASSI[k] || "#888"}"></i>${k}<b>${fmt(v, 1)}%</b></li>`).join("");
}

function mostraPosizioni() {
  const chiave = $("ordina").value;
  const righe = [...dati.posizioni].sort((a, b) => (b[chiave] ?? -1e9) - (a[chiave] ?? -1e9));
  const dec = (v) => v < 10 ? 4 : 2;
  $("posizioni").innerHTML = righe.map((r) => `<tr>
      <td>
        <div class="pos-nome">${r.nome}${r.mancante ? ' <span class="etichetta">senza prezzo</span>' : ""}</div>
        <div class="pos-codice">${r.bloomberg || ""} · oggi <span class="${segno(r.var_giorno)}">${perc(r.var_giorno)}</span></div>
      </td>
      <td data-l="Peso">${fmt(r.peso_iniziale)}%</td>
      <td data-l="Carico">${fmt(r.prezzo_carico, dec(r.prezzo_carico))}</td>
      <td data-l="Attuale">${fmt(r.prezzo, dec(r.prezzo))}</td>
      <td data-l="Var. %" class="var forte ${segno(r.var_carico)}">${perc(r.var_carico)}</td>
      <td data-l="Contributo" class="forte ${segno(r.contributo)}">${perc(r.contributo)}</td>
    </tr>`).join("");
  const pesoTot = righe.reduce((a, r) => a + r.peso_iniziale, 0);
  const contrTot = righe.reduce((a, r) => a + r.contributo, 0);
  $("totale").innerHTML = `<tr>
      <td>Totale portafoglio<div class="pos-codice">oggi <span class="${segno(dati.perf_giorno)}">${perc(dati.perf_giorno)}</span></div></td>
      <td data-l="Peso">${fmt(pesoTot)}%</td>
      <td data-l="Base">${fmt(dati.base)}</td>
      <td data-l="Valore">${fmt(dati.nav)}</td>
      <td data-l="Var. %" class="var forte ${segno(dati.perf_totale)}">${perc(dati.perf_totale)}</td>
      <td data-l="Contributo" class="forte ${segno(contrTot)}">${perc(contrTot)}</td>
    </tr>`;
}

/* ---------- avvio ---------- */
$("aggiorna").addEventListener("click", carica);
$("ordina").addEventListener("change", () => dati && mostraPosizioni());
$("modifica-mio").addEventListener("click", () => apriForm(true));
$("mio-annulla").addEventListener("click", () => apriForm(false));
$("mio-form").addEventListener("submit", (e) => {
  e.preventDefault();
  salvaMio({ qta: Number($("mio-qta").value) || 0, carico: Number($("mio-carico").value) || 0 });
  apriForm(false);
  if (dati) mostraMio();
});
window.addEventListener("resize", () => dati && mostraGrafico());
document.addEventListener("visibilitychange", () => { if (!document.hidden) carica(); });
setInterval(() => { if (!document.hidden) carica(); }, RICARICA_MS);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
carica();
