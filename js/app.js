/* app.js — legge data/prezzi.json e data/storico.json (scritti ogni ora da
 * GitHub Actions) e li mostra. Nessun server: i dati personali (il mio
 * investimento, patrimonio del simulatore, commento del report) restano nel
 * localStorage del dispositivo. */

const VERSIONE = "1.5";
const NOVITA = [
  { v: "1.5", voci: ["Numero di versione anche in alto, nella fascia blu, in azzurro tenue.", "Intestazione sistemata sui telefoni stretti: il pulsante di ricarica non copre più la scritta VICI."] },
  { v: "1.4", voci: [
    "Controllo completo e correzioni: data giusta della quotazione del certificato (seduta precedente), niente punti nel fine settimana, virgola decimale accettata nei campi, simulatore che non perde quello che stai scrivendo, data dell'ultimo NAV per i fondi, tabella del rischio leggibile sul telefono.",
    "Avviso di aggiornamento più semplice.",
    "Importazione dei ribilanciamenti: un file con problemi viene saltato con un avviso, senza bloccare gli altri.",
  ] },
  { v: "1.3", voci: [
    "A ogni apertura, e quando la riapri dallo sfondo, l'app controlla se c'è una versione nuova e si aggiorna da sola.",
  ] },
  { v: "1.2", voci: [
    "Ribilanciamento di ottobre: esecuzione il 7 ottobre 2026, prezzi di carico = chiusure di quel giorno, compilati in automatico.",
    "Entra iShares Nasdaq 100 (7%), esce iShares MSCI USA Small Cap; nuovi pesi per tutte le posizioni, liquidità al 3%.",
    "In Gestione il riquadro «Ribilanciamento programmato» mostra i nuovi pesi rispetto a quelli di oggi, finché non diventa attivo.",
    "I ribilanciamenti mensili si importano dall'Excel della composizione (anche caricandolo su GitHub nella cartella ribilanciamenti/).",
  ] },
  { v: "1.1", voci: [
    "Menu (☰) e quattro sezioni: Portafoglio, Andamento, Gestione, Report.",
    "Confronto con un benchmark bilanciato 60/40 (MSCI World + Euro Aggregate Bond).",
    "Premio o sconto del certificato rispetto al paniere.",
    "Rischio del portafoglio: volatilità, perdita massima, VaR, quota di rischio per posizione e correlazioni.",
    "Rendimenti mensili del paniere e del benchmark.",
    "Scostamento dai pesi obiettivo, con avviso via email (issue GitHub) oltre la soglia.",
    "Simulatore di ribilanciamento con operazioni in euro e quantità, esportabile come nuovo ribilanciamento.",
    "Storico dei ribilanciamenti: la curva resta continua da un ribilanciamento all'altro.",
    "Report mensile da stampare o salvare in PDF, con il commento del gestore.",
    "All'apertura l'app propone di installarsi sul telefono.",
    "Numero di versione nel menu e in fondo alla pagina.",
  ] },
  { v: "1", voci: [
    "Prima versione: quotazione del certificato, posizioni con prezzo attuale, variazione dal carico e contributo, paniere stimato, grafico e allocazione.",
  ] },
];

const COLORI_CLASSI = { "Azioni": "#2C8FE0", "Obbligazioni": "#5BB65A", "Oro": "#E0B81C", "Liquidità": "#9AA3C7" };
const COLORI_AREE = ["#0A2283", "#2C8FE0", "#7FCBF2", "#5BB65A", "#E0B81C", "#9AA3C7"];
const K = { mio: "vici-mio", patrimonio: "vici-patrimonio", commento: "vici-commento",
  scheda: "vici-scheda", versioneVista: "vici-versione-vista", sim: "vici-sim" };
const RICARICA_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const tondo = (v, dec = 2) => Math.round(v * 10 ** dec) / 10 ** dec || 0;
const fmt = (v, dec = 2) => v == null || isNaN(v) ? "—" :
  tondo(v, dec).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const eur = (v, dec = 2) => v == null ? "—" : fmt(v, dec) + " €";
// Arrotondo prima di decidere il segno, così non compare "-0,00%"
const perc = (v, dec = 2) => v == null || isNaN(v) ? "—" : (tondo(v, dec) > 0 ? "+" : "") + fmt(v, dec) + "%";
const segno = (v) => v == null ? "" : tondo(v) > 0 ? "su" : tondo(v) < 0 ? "giu" : "";
const colorato = (v, dec = 2) => `<span class="${segno(v)}">${perc(v, dec)}</span>`;
const dataIt = (s) => s ? new Date(s).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : "—";
const oraIt = (s) => s ? new Date(s).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const meseIt = (m) => new Date(m + "-15").toLocaleDateString("it-IT", { month: "long", year: "numeric" });
const decPrezzo = (v) => v < 10 ? 4 : 2;
const breve = (nome) => nome.replace(/^(iShares|Amundi|WisdomTree|PIMCO GIS|Schroder ISF|T\. Rowe Price|Muzinich)\s+/, "");
// Accetta sia "9,5" sia "9.5" (e "5.000.000" come migliaia)
const numero = (v) => {
  let t = String(v ?? "").trim().replace(/\s/g, "");
  if (/,/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function leggi(k, ripiego = null) {
  try { const v = localStorage.getItem(k); return v == null ? ripiego : JSON.parse(v); } catch { return ripiego; }
}
function scrivi(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria non disponibile */ }
}

let dati = null;
let storico = null;

/* ================= caricamento ================= */
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
    storico = s || { nav: [], benchmark: [], certificato: [] };
    mostra();
    $("stato").className = "stato";
    $("stato").textContent = `Prezzi aggiornati il ${oraIt(dati.aggiornato)}` +
      (dati.mancanti && dati.mancanti.length ? ` · senza prezzo: ${dati.mancanti.join(", ")}` : "") +
      ((dati.programmati || []).length ? ` · ribilanciamento del ${dataIt(dati.programmati[0].data)} programmato (vedi Gestione)` : "");
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
  document.querySelectorAll(".data-inizio").forEach((el) => { el.textContent = dataIt(dati.data_inizio || dati.data_esecuzione); });
  mostraPortafoglio();
  mostraAndamento();
  mostraGestione();
  mostraReport();
  $("aggiornato").textContent = `Ultimo calcolo: ${oraIt(dati.aggiornato)}.`;
}

/* ================= PORTAFOGLIO ================= */
function mostraPortafoglio() {
  const d = dati;
  const emis = (d.emissione && d.emissione.prezzo) || d.base || 1000;
  const c = d.certificato;
  if (c && c.prezzo) {
    $("cert-prezzo").textContent = eur(c.prezzo);
    const pc = (c.prezzo / emis - 1) * 100;
    $("cert-perf").innerHTML = `${colorato(pc)} dall'emissione a ${fmt(emis, 0)}`;
    const range = c.min_oggi && c.max_oggi ? ` · oggi ${fmt(c.min_oggi)}–${fmt(c.max_oggi)}` : "";
    const quando = c.tipo === "ultimo contratto" ? `ultimo contratto, letto ${oraIt(c.ora)}` : `prezzo di riferimento del ${dataIt(c.data || c.ora)}`;
    $("cert-fonte").textContent = `${quando[0].toUpperCase() + quando.slice(1)}${range} · ${c.fonte}`;
  } else {
    $("cert-prezzo").textContent = "—";
    $("cert-perf").textContent = "Quotazione non disponibile";
    $("cert-fonte").textContent = "";
  }
  const perfPeriodo = d.perf_periodo ?? d.perf_totale;
  $("nav").textContent = fmt(d.nav);
  $("nav-perf").innerHTML = `${colorato(perfPeriodo)} dal ${dataIt(d.data_esecuzione)}`;
  $("nav-oggi").innerHTML = `Oggi ${colorato(d.perf_giorno)}`;

  mostraPosizioni();
  barraAllocazione("classi", d.classi, (k) => COLORI_CLASSI[k] || "#888");
  const aree = Object.keys(d.aree || {}).sort((a, b) => d.aree[b] - d.aree[a]);
  barraAllocazione("aree", d.aree || {}, (k) => COLORI_AREE[aree.indexOf(k) % COLORI_AREE.length]);
  mostraMio();
}

function mostraPosizioni() {
  const chiave = $("ordina").value;
  const righe = [...dati.posizioni].sort((a, b) => (b[chiave] ?? -1e9) - (a[chiave] ?? -1e9));
  $("posizioni").innerHTML = righe.map((r) => `<tr>
      <td>
        <div class="pos-nome">${esc(r.nome)}${r.mancante ? ' <span class="etichetta">senza prezzo</span>' : ""}</div>
        <div class="pos-codice">${esc(r.bloomberg || "")} · ${etichettaGiorno(r)} ${colorato(r.var_giorno)}</div>
      </td>
      <td data-l="Peso">${fmt(r.peso_iniziale)}%</td>
      <td data-l="Carico">${fmt(r.prezzo_carico, decPrezzo(r.prezzo_carico))}</td>
      <td data-l="Attuale">${fmt(r.prezzo, decPrezzo(r.prezzo))}</td>
      <td data-l="Var. %" class="var forte ${segno(r.var_carico)}">${perc(r.var_carico)}</td>
      <td data-l="Contributo" class="forte ${segno(r.contributo)}">${perc(r.contributo)}</td>
    </tr>`).join("");
  const pesoTot = righe.reduce((a, r) => a + r.peso_iniziale, 0);
  const contrTot = righe.reduce((a, r) => a + r.contributo, 0);
  const perf = dati.perf_periodo ?? dati.perf_totale;
  $("totale").innerHTML = `<tr>
      <td>Totale portafoglio<div class="pos-codice">oggi ${colorato(dati.perf_giorno)}</div></td>
      <td data-l="Peso">${fmt(pesoTot)}%</td>
      <td data-l="Base">${fmt(dati.base_periodo ?? dati.base)}</td>
      <td data-l="Valore">${fmt(dati.nav)}</td>
      <td data-l="Var. %" class="var forte ${segno(perf)}">${perc(perf)}</td>
      <td data-l="Contributo" class="forte ${segno(contrTot)}">${perc(contrTot)}</td>
    </tr>`;
}

// "oggi" se il prezzo è di oggi; per i fondi (NAV con qualche giorno di
// ritardo) la data dell'ultimo prezzo
function etichettaGiorno(r) {
  if (!r.data_prezzo || r.liquidita) return "oggi";
  const oggi = new Date().toISOString().slice(0, 10);
  return r.data_prezzo >= oggi ? "oggi" : new Date(r.data_prezzo).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function barraAllocazione(id, valori, colore) {
  const voci = Object.entries(valori || {}).sort((a, b) => b[1] - a[1]);
  $(id + "-barra").innerHTML = voci.map(([k, v]) =>
    `<div style="flex:${v};background:${colore(k)}" title="${esc(k)} ${fmt(v, 1)}%"></div>`).join("");
  $(id + "-elenco").innerHTML = voci.map(([k, v]) =>
    `<li><i style="background:${colore(k)}"></i>${esc(k)}<b>${fmt(v, 1)}%</b></li>`).join("");
}

function prezzoCorrente() {
  if (!dati) return null;
  if (dati.certificato && dati.certificato.prezzo) return dati.certificato.prezzo;
  return dati.nav;
}

function mostraMio() {
  const mio = leggi(K.mio);
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

function apriFormMio(aperto) {
  const mio = leggi(K.mio, {});
  $("mio-form").hidden = !aperto;
  $("modifica-mio").hidden = aperto;
  if (aperto) {
    $("mio-qta").value = mio.qta || "";
    $("mio-carico").value = mio.carico || "";
    $("mio-qta").focus();
  }
}

/* ================= ANDAMENTO ================= */
function mostraAndamento() {
  const d = dati;
  const b = d.benchmark;
  $("a-paniere").innerHTML = colorato(d.perf_totale);
  $("a-paniere-dett").innerHTML = `dal ${dataIt(d.data_inizio || d.data_esecuzione)} · oggi ${colorato(d.perf_giorno)}`;
  if (b) {
    $("a-bench-nome").textContent = b.nome;
    $("a-bench").innerHTML = colorato(b.perf);
    const diff = d.perf_totale - b.perf;
    $("a-bench-dett").innerHTML = `Paniere ${diff >= 0 ? "meglio" : "peggio"} di ${fmt(Math.abs(diff))} punti · oggi ${colorato(b.perf_giorno)}`;
  } else {
    $("a-bench").textContent = "—";
    $("a-bench-dett").textContent = "Benchmark non disponibile";
  }
  const pr = d.premio;
  if (pr) {
    $("a-premio").innerHTML = colorato(pr.premio);
    $("a-premio-dett").textContent = `${pr.premio >= 0 ? "Premio" : "Sconto"} del certificato rispetto al paniere: ` +
      `se lo seguisse alla perfezione dal ${dataIt(pr.data)} varrebbe ${fmt(pr.valore_implicito)}` +
      (pr.da_configurazione ? "." : " (riferimento: prima quotazione registrata dall'app).");
  } else {
    $("a-premio").textContent = "—";
    $("a-premio-dett").textContent = "Serve la quotazione del certificato.";
  }
  mostraGrafico();
  mostraMensili();
  mostraRischio();
}

function mostraGrafico() {
  const box = $("grafico");
  if (box.offsetParent === null) return; // scheda nascosta: si disegna quando si apre
  const pt = (arr, campo) => (arr || []).map((p) => ({ t: new Date(p.data).getTime(), v: p[campo] }));
  const nav = pt(storico.nav, "nav");
  const bench = pt(storico.benchmark, "valore");
  // La quotazione del certificato ha una base diversa: la riporto sulla scala
  // del paniere dal primo giorno in comune; nel suggerimento resta il prezzo vero.
  const certVero = pt(storico.certificato, "prezzo");
  let fattore = 1;
  if (certVero.length && nav.length) {
    const primo = certVero[0];
    const navAllora = nav.reduce((a, p) => p.t <= primo.t ? p : a, nav[0]);
    fattore = navAllora.v / primo.v;
  }
  const cert = certVero.map((p) => ({ t: p.t, v: p.v * fattore, vero: p.v }));
  if (nav.length < 2) {
    box.innerHTML = `<div class="vuoto">Il grafico compare dopo i primi aggiornamenti.</div>`;
    return;
  }
  const W = box.clientWidth || 600, H = box.clientHeight || 220;
  const m = { l: 44, r: 8, t: 10, b: 22 };
  const tutti = nav.concat(bench, cert);
  const base = dati.base || 1000;
  const t0 = Math.min(...nav.map((p) => p.t));
  let t1 = Math.max(...tutti.map((p) => p.t));
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
  const corto = t1 - t0 < 120 * 86400000;
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (t1 - t0) * i / 4;
    const lab = new Date(t).toLocaleDateString("it-IT", corto ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    svg += `<text class="asse" x="${x(t)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${lab}</text>`;
  }
  const linea = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  if (bench.length > 1) svg += `<path d="${linea(bench)}" fill="none" stroke="var(--linea-bench)" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  svg += `<path d="${linea(nav)}" fill="none" stroke="var(--linea-nav)" stroke-width="2" stroke-linejoin="round"/>`;
  if (cert.length > 1) svg += `<path d="${linea(cert)}" fill="none" stroke="var(--linea-cert)" stroke-width="2"/>`;
  cert.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="2.5" fill="var(--linea-cert)"/>`; });
  svg += `<line id="cursore" class="griglia" y1="${m.t}" y2="${H - m.b}" x1="-10" x2="-10"/></svg><div id="sugg" class="suggerimento" hidden></div>`;
  box.innerHTML = svg;

  const sugg = $("sugg"), cursore = $("cursore");
  const vicino = (pts, t) => pts.reduce((a, p) => !a || Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a, null);
  const muovi = (ev) => {
    const r = box.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const t = t0 + (px * W / r.width - m.l) / (W - m.l - m.r) * (t1 - t0);
    const p = vicino(nav, t);
    if (!p) return;
    const pb = vicino(bench, p.t), pc = vicino(cert, p.t);
    const stesso = (q) => q && Math.abs(q.t - p.t) < 86400000 * 1.5;
    cursore.setAttribute("x1", x(p.t)); cursore.setAttribute("x2", x(p.t));
    sugg.hidden = false;
    sugg.style.left = Math.min(Math.max(x(p.t) * r.width / W, 90), r.width - 90) + "px";
    sugg.style.top = (y(p.v) * r.height / H) + "px";
    sugg.textContent = `${dataIt(p.t)} · paniere ${fmt(p.v)}` +
      (stesso(pb) ? ` · bench. ${fmt(pb.v)}` : "") + (stesso(pc) ? ` · cert. ${fmt(pc.vero)}` : "");
  };
  box.onmousemove = muovi;
  box.ontouchmove = muovi;
  box.onmouseleave = () => { sugg.hidden = true; cursore.setAttribute("x1", -10); cursore.setAttribute("x2", -10); };
}

function tabellaMensili() {
  const m = dati.mensili || {};
  const bench = Object.fromEntries((m.benchmark || []).map((r) => [r.mese, r.rend]));
  return (m.paniere || []).map((r) => ({ mese: r.mese, paniere: r.rend, bench: bench[r.mese] }));
}

function mostraMensili() {
  const righe = tabellaMensili();
  const conBench = !!dati.benchmark;
  $("mensili").innerHTML = `<thead><tr><th>Mese</th><th>Paniere</th>${conBench ? "<th>Benchmark</th><th>Differenza</th>" : ""}</tr></thead>
    <tbody>${righe.map((r) => `<tr><td>${meseIt(r.mese)}</td><td class="forte ${segno(r.paniere)}">${perc(r.paniere)}</td>
      ${conBench ? `<td>${colorato(r.bench)}</td><td>${r.bench == null ? "—" : colorato(r.paniere - r.bench)}</td>` : ""}</tr>`).join("")}</tbody>
    <tfoot><tr><td>Dal ${dataIt(dati.data_inizio || dati.data_esecuzione)}</td><td class="forte ${segno(dati.perf_totale)}">${perc(dati.perf_totale)}</td>
      ${conBench ? `<td>${colorato(dati.benchmark.perf)}</td><td>${colorato(dati.perf_totale - dati.benchmark.perf)}</td>` : ""}</tr></tfoot>`;
}

function mostraRischio() {
  const r = dati.rischio;
  if (!r) {
    $("rischio-nota").textContent = "Dati storici non ancora sufficienti.";
    $("rischio-metriche").innerHTML = "";
    $("rischio-posizioni").innerHTML = "";
    $("correlazioni").innerHTML = "";
    return;
  }
  const b = dati.benchmark || {};
  const re = dati.realizzato || {};
  $("rischio-nota").textContent = `Pesi di oggi applicati ai prezzi dell'ultimo anno (dal ${dataIt(r.dal)}, ${r.giorni} giorni di borsa): ` +
    "mostra come si sarebbe comportato il portafoglio attuale." +
    (r.senza_storia && r.senza_storia.length ? ` Storico incompleto per: ${r.senza_storia.join(", ")}.` : "") +
    dati.posizioni.filter((p) => p.storico_da).map((p) => ` Per ${breve(p.nome)} lo storico è quello di ${p.storico_da}.`).join("");
  const met = [
    ["Volatilità annua", fmt(r.vol) + "%", b.vol != null ? `benchmark ${fmt(b.vol)}%` : ""],
    ["Perdita massima", fmt(r.max_drawdown) + "%", b.max_drawdown != null ? `benchmark ${fmt(b.max_drawdown)}%` : ""],
    ["VaR 95% (1 giorno)", "−" + fmt(r.var95) + "%", "perdita superata 1 giorno su 20"],
    ["Rendimento 1 anno", perc(r.rend_1a), b.rend_1a != null ? `benchmark ${perc(b.rend_1a)}` : ""],
    ["Giorno peggiore", perc(r.peggior_giorno), `migliore ${perc(r.miglior_giorno)}`],
  ];
  if (re.vol != null) met.push(["Volatilità realizzata", fmt(re.vol) + "%", `dal ${dataIt(dati.data_inizio)}`]);
  if (re.max_drawdown != null) met.push(["Perdita massima realizzata", fmt(re.max_drawdown) + "%", `dal ${dataIt(dati.data_inizio)}`]);
  $("rischio-metriche").innerHTML = met.map(([a, v, s]) => `<div><span>${a}</span><b>${v}</b><small>${s}</small></div>`).join("");

  const pesi = Object.fromEntries(dati.posizioni.map((p) => [p.nome, p.peso_attuale]));
  $("rischio-posizioni").innerHTML = [...r.posizioni].sort((a, b) => (b.contributo_rischio ?? 0) - (a.contributo_rischio ?? 0)).map((p) =>
    `<tr><td>${esc(breve(p.nome))}</td><td data-l="Peso">${fmt(pesi[p.nome])}%</td><td data-l="Volatilità">${fmt(p.vol)}%</td>
      <td data-l="Rend. 1 anno">${colorato(p.rend_1a)}</td>
      <td class="var forte" title="Quota di rischio">${fmt(p.contributo_rischio, 1)}%<small class="sotto-var">del rischio</small></td></tr>`).join("");

  const c = r.correlazioni;
  const sigle = c.nomi.map((n) => {
    const p = dati.posizioni.find((x) => x.nome === n);
    return (p && p.bloomberg ? p.bloomberg.split(" ")[0] : breve(n));
  });
  const n = sigle.length;
  let h = `<div style="display:grid;grid-template-columns:72px repeat(${n},minmax(28px,1fr));gap:2px">`;
  h += `<div></div>` + sigle.map((s) => `<div class="etic-alto">${esc(s)}</div>`).join("");
  c.matrice.forEach((riga, i) => {
    h += `<div class="etic" title="${esc(c.nomi[i])}">${esc(sigle[i])}</div>`;
    riga.forEach((v) => {
      const a = v == null ? 0 : Math.min(Math.abs(v), 1);
      const col = v == null ? "transparent" : v >= 0 ? `rgba(44,143,224,${a * 0.85})` : `rgba(224,16,43,${a * 0.85})`;
      h += `<div style="background:${col};color:${a > 0.55 ? "#fff" : "inherit"}">${v == null ? "" : fmt(v, 1)}</div>`;
    });
  });
  $("correlazioni").innerHTML = h + "</div>";
}

/* ================= GESTIONE ================= */
function mostraGestione() {
  mostraProgrammati();
  mostraScostamenti();
  preparaSimulatore();
  mostraPeriodi();
}

function mostraProgrammati() {
  const prog = (dati.programmati || [])[0];
  $("programmato").hidden = !prog;
  if (!prog) return;
  const oggi = Object.fromEntries(dati.posizioni.map((p) => [p.isin || p.nome, p]));
  const chiave = (p) => p.isin || p.nome;
  const nuovi = new Set(prog.posizioni.map(chiave));
  const righe = prog.posizioni.map((p) => {
    const o = oggi[chiave(p)];
    return { nome: p.nome, att: o ? o.peso_attuale : 0, nuovo: p.peso, stato: o ? "" : "entra" };
  }).concat(dati.posizioni.filter((p) => !nuovi.has(chiave(p)))
    .map((p) => ({ nome: p.nome, att: p.peso_attuale, nuovo: 0, stato: "esce" })));
  righe.sort((a, b) => b.nuovo - a.nuovo);
  $("programmato-nota").textContent = `Esecuzione il ${dataIt(prog.data)}. I prezzi di carico saranno le chiusure di quel giorno, ` +
    "prese in automatico: da allora questo diventa il portafoglio attivo e le performance ripartono dal valore raggiunto.";
  $("programmato-righe").innerHTML = righe.map((r) => {
    const diff = r.nuovo - r.att;
    return `<tr><td>${esc(breve(r.nome))}${r.stato ? ` <span class="etichetta">${r.stato}</span>` : ""}</td>
      <td>${fmt(r.att)}%</td><td class="forte">${fmt(r.nuovo)}%</td>
      <td class="${segno(diff)}">${diff > 0 ? "+" : ""}${fmt(diff)}</td></tr>`;
  }).join("");
}

function mostraScostamenti() {
  const soglia = dati.soglia_scostamento ?? 2;
  const righe = [...dati.posizioni].filter((r) => r.scostamento != null)
    .sort((a, b) => Math.abs(b.scostamento) - Math.abs(a.scostamento));
  const fuori = righe.filter((r) => r.oltre_soglia).length;
  $("scost-nota").innerHTML = `Soglia di avviso: ±${fmt(soglia, 1)} punti. ` + (fuori
    ? `<b class="giu">${fuori} posizion${fuori === 1 ? "e" : "i"} oltre la soglia</b>: ti arriva un avviso per email (issue su GitHub).`
    : "Tutte le posizioni sono dentro la soglia.");
  const scala = Math.max(soglia * 2, ...righe.map((r) => Math.abs(r.scostamento)));
  $("scostamenti").innerHTML = `<div class="scost scost-testa"><span>Posizione</span><span class="num">Obiettivo</span><span class="num">Attuale</span><span class="num">Scost.</span></div>` +
    righe.map((r) => {
      const w = Math.abs(r.scostamento) / scala * 50;
      const left = r.scostamento >= 0 ? 50 : 50 - w;
      const col = r.oltre_soglia ? "var(--giu)" : "var(--azzurro)";
      return `<div class="scost ${r.oltre_soglia ? "fuori" : ""}">
        <span class="nome" title="${esc(r.nome)}">${esc(breve(r.nome))}</span>
        <span class="num">${fmt(r.peso_obiettivo)}%</span>
        <span class="num">${fmt(r.peso_attuale)}%</span>
        <span class="num ${r.oltre_soglia ? "giu forte" : ""}">${r.scostamento > 0 ? "+" : ""}${fmt(r.scostamento)}</span>
        <div class="scost-barra"><i style="left:${left}%;width:${w}%;background:${col}"></i><span class="centro"></span></div>
      </div>`;
    }).join("");
}

let simPesi = null;
function preparaSimulatore() {
  const chiavi = dati.posizioni.map((p) => p.chiave || p.nome);
  const stesse = (o) => o && chiavi.length === Object.keys(o).length && chiavi.every((k) => k in o);
  const righeOra = [...$("sim-righe").querySelectorAll("tr")].map((tr) => tr.dataset.k);
  // Stesse posizioni già in tabella: si aggiornano solo i numeri, così chi sta
  // scrivendo un peso non perde il campo al ricaricamento automatico dei dati
  if (stesse(simPesi) && righeOra.length === chiavi.length && chiavi.every((k, i) => righeOra[i] === k)) {
    dati.posizioni.forEach((p) => {
      const tr = $("sim-righe").querySelector(`tr[data-k="${CSS.escape(p.chiave || p.nome)}"]`);
      if (tr) tr.querySelector("td[data-l='Attuale']").textContent = fmt(p.peso_attuale) + "%";
    });
    calcolaSimulatore();
    return;
  }
  if (!stesse(simPesi)) {
    const salvati = leggi(K.sim);
    simPesi = stesse(salvati) ? salvati
      : Object.fromEntries(dati.posizioni.map((p) => [p.chiave || p.nome, tondo(p.peso_obiettivo ?? p.peso_iniziale)]));
  }
  const pat = leggi(K.patrimonio);
  if (pat && !$("sim-patrimonio").value) $("sim-patrimonio").value = pat;
  $("sim-righe").innerHTML = dati.posizioni.map((p) => {
    const k = p.chiave || p.nome;
    return `<tr data-k="${esc(k)}">
      <td>${esc(breve(p.nome))}</td>
      <td data-l="Attuale">${fmt(p.peso_attuale)}%</td>
      <td class="var"><input type="text" inputmode="decimal" value="${fmt(simPesi[k])}" aria-label="Nuovo peso ${esc(p.nome)}"></td>
      <td class="op" data-l="Operazione"></td><td class="qta" data-l="Quantità"></td>
    </tr>`;
  }).join("");
  $("sim-righe").querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
    simPesi[inp.closest("tr").dataset.k] = numero(inp.value);
    scrivi(K.sim, simPesi);
    calcolaSimulatore();
  }));
  calcolaSimulatore();
}

function calcolaSimulatore() {
  const pat = numero($("sim-patrimonio").value);
  let acquisti = 0, vendite = 0, somma = 0;
  const classi = {};
  dati.posizioni.forEach((p) => {
    const k = p.chiave || p.nome;
    const nuovo = simPesi[k] || 0;
    somma += nuovo;
    classi[p.classe] = (classi[p.classe] || 0) + nuovo;
    const diff = nuovo - p.peso_attuale;
    const tr = $("sim-righe").querySelector(`tr[data-k="${CSS.escape(k)}"]`);
    if (!tr) return;
    const opEur = pat * diff / 100;
    if (diff > 0) acquisti += opEur; else vendite -= opEur;
    const verbo = Math.abs(diff) < 0.005 ? "—" : diff > 0 ? "Compra" : "Vendi";
    tr.querySelector(".op").innerHTML = verbo === "—" ? "—" :
      `<span class="${diff > 0 ? "su" : "giu"}">${verbo} ${pat ? eur(Math.abs(opEur), 0) : fmt(Math.abs(diff)) + "%"}</span>`;
    tr.querySelector(".qta").textContent = pat && !p.liquidita && verbo !== "—" ? fmt(Math.abs(opEur) / p.prezzo, 0) : "—";
  });
  const ok = Math.abs(somma - 100) < 0.05;
  $("sim-totale").innerHTML = `<tr><td>Totale</td><td data-l="Attuale">100,00%</td>
    <td class="var ${ok ? "" : "giu"}">${fmt(somma)}%</td>
    <td colspan="2" class="sim-somma">${pat ? `Acquisti ${eur(acquisti, 0)} · vendite ${eur(vendite, 0)}` : "Inserisci il patrimonio per vedere gli importi"}</td></tr>`;
  $("sim-classi").innerHTML = (ok ? "" : `<b class="giu">I nuovi pesi sommano ${fmt(somma)}%, non 100%.</b> `) +
    "Allocazione dopo il ribilanciamento: " + Object.entries(classi).sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `${esc(c)} ${fmt(v, 1)}% (oggi ${fmt((dati.classi || {})[c] || 0, 1)}%)`).join(" · ");
}

function impostaPesiSim(campo) {
  simPesi = Object.fromEntries(dati.posizioni.map((p) => [p.chiave || p.nome, tondo(p[campo] ?? p.peso_iniziale)]));
  scrivi(K.sim, simPesi);
  $("sim-righe").innerHTML = "";
  preparaSimulatore();
}

function esportaRibilanciamento() {
  const oggi = new Date().toISOString().slice(0, 10);
  const rib = {
    data: oggi,
    nota: "Da simulatore: sostituire i prezzi di carico con quelli di esecuzione",
    posizioni: dati.posizioni.filter((p) => (simPesi[p.chiave || p.nome] || 0) > 0).map((p) => {
      const o = { nome: p.nome, isin: p.isin || "", bloomberg: p.bloomberg || "", classe: p.classe, area: p.area,
        peso: tondo(simPesi[p.chiave || p.nome]), prezzo_carico: p.liquidita ? 1 : tondo(p.prezzo, 4) };
      if (p.liquidita) o.liquidita = true;
      return o;
    }),
  };
  const blob = new Blob([JSON.stringify(rib, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ribilanciamento-${oggi}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function mostraPeriodi() {
  const periodi = dati.periodi || [];
  $("periodi").innerHTML = periodi.map((p) => `<tr>
    <td>${dataIt(p.data)}</td><td>${p.fino_al ? dataIt(p.fino_al) : "oggi"}</td><td>${p.posizioni}</td>
    <td>${fmt(p.base)}</td><td>${fmt(p.fine)}</td><td class="forte ${segno(p.perf)}">${perc(p.perf)}</td></tr>`).join("") +
    (dati.programmati || []).map((p) => `<tr><td>${dataIt(p.data)}</td><td colspan="5"><span class="etichetta">programmato</span> ${p.posizioni.length} posizioni, in attesa delle chiusure</td></tr>`).join("");
}

/* ================= REPORT ================= */
function mostraReport() {
  const d = dati;
  const c = d.certificato;
  const emis = (d.emissione && d.emissione.prezzo) || 1000;
  const mens = tabellaMensili();
  const ultimo = mens[mens.length - 1];
  const b = d.benchmark;
  const r = d.rischio;
  const righe = [...d.posizioni].sort((a, x) => x.peso_iniziale - a.peso_iniziale);
  const commento = $("commento").value.trim();
  const titolo = ultimo ? meseIt(ultimo.mese) : "";
  $("report").innerHTML = `
    <div class="r-testa">
      <div><h1>VICI</h1><small>Balanced Growth AMC · ISIN ${esc(d.isin_certificato)}</small></div>
      <div style="text-align:right"><b>Report ${esc(titolo)}</b><small>dati al ${oraIt(d.aggiornato)}</small></div>
      <img src="icons/logo.svg" alt="">
    </div>
    <div class="r-cifre">
      <div><span>Certificato</span><b>${c ? eur(c.prezzo) : "—"}</b><span>${c ? perc((c.prezzo / emis - 1) * 100) + " dall'emissione" : ""}</span></div>
      <div><span>Paniere dal ${dataIt(d.data_esecuzione)}</span><b class="${segno(d.perf_periodo ?? d.perf_totale)}">${perc(d.perf_periodo ?? d.perf_totale)}</b><span>valore ${fmt(d.nav)}</span></div>
      <div><span>Mese in corso</span><b class="${segno(ultimo && ultimo.paniere)}">${ultimo ? perc(ultimo.paniere) : "—"}</b><span>${ultimo && ultimo.bench != null ? "benchmark " + perc(ultimo.bench) : ""}</span></div>
      <div><span>${b ? esc(b.nome) : "Benchmark"}</span><b class="${segno(b && b.perf)}">${b ? perc(b.perf) : "—"}</b><span>dal ${dataIt(d.data_inizio)}</span></div>
    </div>
    ${commento ? `<h2>Commento del gestore</h2><div class="r-commento">${esc(commento)}</div>` : ""}
    <h2>Posizioni</h2>
    <table>
      <thead><tr><th>Posizione</th><th>Classe</th><th>Peso</th><th>Carico</th><th>Attuale</th><th>Var. %</th><th>Contributo</th></tr></thead>
      <tbody>${righe.map((p) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.classe)}</td><td>${fmt(p.peso_iniziale)}%</td>
        <td>${fmt(p.prezzo_carico, decPrezzo(p.prezzo_carico))}</td><td>${fmt(p.prezzo, decPrezzo(p.prezzo))}</td>
        <td class="${segno(p.var_carico)}">${perc(p.var_carico)}</td><td class="${segno(p.contributo)}">${perc(p.contributo)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Totale</td><td></td><td>${fmt(righe.reduce((a, p) => a + p.peso_iniziale, 0))}%</td><td>${fmt(d.base_periodo ?? d.base)}</td>
        <td>${fmt(d.nav)}</td><td class="${segno(d.perf_periodo)}">${perc(d.perf_periodo ?? d.perf_totale)}</td>
        <td class="${segno(d.perf_periodo)}">${perc(righe.reduce((a, p) => a + p.contributo, 0))}</td></tr></tfoot>
    </table>
    <h2>Allocazione</h2>
    <p>${Object.entries(d.classi || {}).sort((a, x) => x[1] - a[1]).map(([k, v]) => `${esc(k)} <b>${fmt(v, 1)}%</b>`).join(" · ")}</p>
    <p>${Object.entries(d.aree || {}).sort((a, x) => x[1] - a[1]).map(([k, v]) => `${esc(k)} <b>${fmt(v, 1)}%</b>`).join(" · ")}</p>
    <h2>Rendimenti mensili</h2>
    <table>
      <thead><tr><th>Mese</th><th>Paniere</th>${b ? "<th>Benchmark</th><th>Differenza</th>" : ""}</tr></thead>
      <tbody>${mens.map((m) => `<tr><td>${meseIt(m.mese)}</td><td class="${segno(m.paniere)}">${perc(m.paniere)}</td>
        ${b ? `<td class="${segno(m.bench)}">${perc(m.bench)}</td><td class="${segno(m.bench == null ? null : m.paniere - m.bench)}">${m.bench == null ? "—" : perc(m.paniere - m.bench)}</td>` : ""}</tr>`).join("")}</tbody>
    </table>
    ${r ? `<h2>Rischio (portafoglio attuale, ultimo anno)</h2>
    <table><tbody>
      <tr><td>Volatilità annua</td><td>${fmt(r.vol)}%</td><td>${b && b.vol != null ? "benchmark " + fmt(b.vol) + "%" : ""}</td></tr>
      <tr><td>Perdita massima</td><td>${fmt(r.max_drawdown)}%</td><td>${b && b.max_drawdown != null ? "benchmark " + fmt(b.max_drawdown) + "%" : ""}</td></tr>
      <tr><td>VaR 95% a 1 giorno</td><td>−${fmt(r.var95)}%</td><td></td></tr>
    </tbody></table>` : ""}
    <div class="r-piede">Il paniere stimato è un calcolo indicativo basato su pesi e prezzi di carico dei ribilanciamenti e sui prezzi di mercato più recenti; non considera commissioni. Il valore che fa fede è la quotazione ufficiale del certificato. Prezzi: Yahoo Finance e Borsa Italiana. Documento a solo scopo informativo.</div>`;
}

/* ================= schede e menu ================= */
function mostraScheda(nome) {
  if (!document.querySelector(`[data-pannello="${nome}"]`)) nome = "portafoglio";
  document.querySelectorAll("[data-pannello]").forEach((s) => { s.hidden = s.dataset.pannello !== nome; });
  document.querySelectorAll("[data-scheda]").forEach((b) => b.classList.toggle("attiva", b.dataset.scheda === nome));
  scrivi(K.scheda, nome);
  chiudiMenu();
  window.scrollTo({ top: 0 });
  if (nome === "andamento" && dati) mostraGrafico();
}

function apriMenu() {
  $("menu").hidden = false;
  $("velo").hidden = false;
  $("apri-menu").setAttribute("aria-expanded", "true");
}
function chiudiMenu() {
  $("menu").hidden = true;
  $("velo").hidden = true;
  $("apri-menu").setAttribute("aria-expanded", "false");
}

function mostraNovita() {
  $("novita-elenco").innerHTML = NOVITA.map((n) =>
    `<h3>Versione ${n.v}</h3><ul>${n.voci.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>`).join("");
  $("novita").hidden = false;
  chiudiMenu();
}

/* ================= installazione ================= */
// Android/Chrome: prompt del browser (beforeinstallprompt). iPhone: Safari non
// ha un prompt, si spiega come fare a mano. L'invito compare a ogni apertura
// finché l'app non è installata; «Non ora» lo nasconde fino alla prossima.
let installaRinviato = null;
const installata = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const suIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const suBrowserBloccato = () => /EdgA\/|SamsungBrowser\//.test(navigator.userAgent);

function mostraInvito() {
  if (installata()) return;
  try { if (sessionStorage.getItem("vici-installa-no")) return; } catch { /* niente */ }
  $("installa").hidden = false;
  document.body.classList.add("con-invito");
}

function preparaInstallazione() {
  if (installata()) return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installaRinviato = e;
    $("installa-si").hidden = suBrowserBloccato();
    $("menu-installa").hidden = false;
    mostraInvito();
  });
  window.addEventListener("appinstalled", () => {
    installaRinviato = null;
    $("installa").hidden = true;
    $("menu-installa").hidden = true;
  });
  if (suIOS()) {
    $("installa-suggerimento").textContent = "Tocca Condividi (il quadrato con la freccia in su) e poi «Aggiungi alla schermata Home».";
    $("menu-installa").hidden = false;
    setTimeout(mostraInvito, 1200);
  } else if (suBrowserBloccato()) {
    $("installa-suggerimento").textContent = "Per installare l'app apri questo sito in Chrome.";
    setTimeout(mostraInvito, 1200);
  }
  $("installa-si").addEventListener("click", async () => {
    if (!installaRinviato) return;
    installaRinviato.prompt();
    await installaRinviato.userChoice.catch(() => null);
    installaRinviato = null;
    $("installa").hidden = true;
  });
  $("installa-no").addEventListener("click", () => {
    try { sessionStorage.setItem("vici-installa-no", "1"); } catch { /* niente */ }
    $("installa").hidden = true;
    document.body.classList.remove("con-invito");
  });
  $("menu-installa").addEventListener("click", () => {
    chiudiMenu();
    if (installaRinviato) $("installa-si").click();
    else { try { sessionStorage.removeItem("vici-installa-no"); } catch { /* niente */ } mostraInvito(); }
  });
}

/* ================= avvio ================= */
document.querySelectorAll(".versione").forEach((el) => { el.textContent = VERSIONE; });
document.querySelectorAll("[data-scheda]").forEach((b) => b.addEventListener("click", () => mostraScheda(b.dataset.scheda)));
$("apri-menu").addEventListener("click", apriMenu);
$("velo").addEventListener("click", chiudiMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { chiudiMenu(); $("novita").hidden = true; } });
$("menu-aggiorna").addEventListener("click", () => { chiudiMenu(); carica(); });
$("menu-novita").addEventListener("click", mostraNovita);
$("novita-chiudi").addEventListener("click", () => { $("novita").hidden = true; });
$("aggiorna").addEventListener("click", carica);
$("ordina").addEventListener("change", () => dati && mostraPosizioni());
$("modifica-mio").addEventListener("click", () => apriFormMio(true));
$("mio-annulla").addEventListener("click", () => apriFormMio(false));
$("mio-form").addEventListener("submit", (e) => {
  e.preventDefault();
  scrivi(K.mio, { qta: numero($("mio-qta").value), carico: numero($("mio-carico").value) });
  apriFormMio(false);
  if (dati) mostraMio();
});
$("sim-patrimonio").addEventListener("input", () => { scrivi(K.patrimonio, numero($("sim-patrimonio").value) || null); if (dati) calcolaSimulatore(); });
$("sim-obiettivo").addEventListener("click", () => dati && impostaPesiSim("peso_obiettivo"));
$("sim-attuali").addEventListener("click", () => dati && impostaPesiSim("peso_attuale"));
$("sim-esporta").addEventListener("click", () => dati && esportaRibilanciamento());
$("commento").value = leggi(K.commento, "") || "";
$("commento").addEventListener("input", () => { scrivi(K.commento, $("commento").value); if (dati) mostraReport(); });
$("stampa").addEventListener("click", () => window.print());
window.addEventListener("resize", () => dati && mostraGrafico());
document.addEventListener("visibilitychange", () => { if (!document.hidden) carica(); });
setInterval(() => { if (!document.hidden) carica(); }, RICARICA_MS);

mostraScheda(leggi(K.scheda, "portafoglio"));
preparaInstallazione();
const vista = leggi(K.versioneVista);
if (vista !== VERSIONE) {
  // primo avvio di una versione nuova (aggiornata senza passare dal controllo
  // automatico): basta l'avviso breve
  if (vista) { try { sessionStorage.setItem("vici-aggiornata-a", VERSIONE); } catch { /* niente */ } }
  scrivi(K.versioneVista, VERSIONE);
}

/* ================= aggiornamento automatico ================= */
// All'apertura (e al ritorno dallo sfondo, al massimo ogni 10 minuti) legge
// versione.json dal sito: se è diversa da quella in uso aggiorna il service
// worker, svuota la copia offline e ricarica la pagina. Dopo il ricaricamento
// un avviso dice a quale versione è passata.
let ultimoControllo = 0;
async function controllaVersione() {
  if (!navigator.onLine || Date.now() - ultimoControllo < 10 * 60 * 1000) return;
  ultimoControllo = Date.now();
  try {
    const r = await fetch(`versione.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const online = (await r.json()).versione;
    if (!online || online === VERSIONE) return;
    // evita di ricaricare all'infinito se il sito non è ancora allineato
    try {
      if (sessionStorage.getItem("vici-aggiornata-a") === online) return;
      sessionStorage.setItem("vici-aggiornata-a", online);
    } catch { /* niente */ }
    $("stato").className = "stato";
    $("stato").textContent = `Aggiornamento alla versione ${online}…`;
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update().catch(() => {});
    }
    if (window.caches) {
      const chiavi = await caches.keys();
      await Promise.all(chiavi.map((k) => caches.delete(k)));
    }
    location.reload();
  } catch { /* offline o sito non raggiungibile: si riprova alla prossima apertura */ }
}

function avvisoAggiornata() {
  let a = null;
  try { a = sessionStorage.getItem("vici-aggiornata-a"); } catch { /* niente */ }
  if (!a || a !== VERSIONE) return;
  try { sessionStorage.removeItem("vici-aggiornata-a"); } catch { /* niente */ }
  const t = document.createElement("div");
  t.className = "avviso-versione";
  t.textContent = `App aggiornata alla versione ${VERSIONE}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) controllaVersione(); });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
avvisoAggiornata();
controllaVersione();
carica();
