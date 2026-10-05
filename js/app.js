/* app.js — legge data/prezzi.json e data/storico.json (scritti ogni ora da
 * GitHub Actions) e li mostra. Nessun server: i dati personali (il mio
 * investimento, patrimonio del simulatore, commento del report) restano nel
 * localStorage del dispositivo. */

const VERSIONE = "3.1";
const NOVITA = [
  { v: "3.1", voci: [
    "In cima il prezzo corrente del certificato (ultimo contratto di oggi o medio tra denaro e lettera, come su Euronext) con l'ora; il prezzo di riferimento resta come informazione.",
    "Quotazione del certificato aggiornata ogni 15 minuti durante la seduta e letta a ogni apertura dell'app.",
  ] },
  { v: "3.0.1", voci: ["Finestra delle novità: ✕ in alto per chiuderla senza scorrere fino in fondo."] },
  { v: "3.0", voci: [
    "Certificato: book del market maker da Borsa Italiana (denaro, lettera, spread), data ufficiale della quotazione e performance a 1 settimana, 1 mese, 6 mesi e 1 anno.",
    "Il mio investimento: quanto incasseresti vendendo ora al prezzo denaro.",
    "Indice e certificato: scomposizione della differenza tra commissione di gestione (2,5% annuo) e di performance (15%) dal KID.",
  ] },
  { v: "2.0", voci: ["Indice VICIGROW (Leonteq): rendimenti mensili, andamento dall'avvio e confronto con il certificato, con la differenza tra i due."] },
  { v: "1.9.2", voci: ["Certificato vs paniere: il prezzo del certificato è confrontato con il paniere alla stessa data (prima con il valore di adesso)."] },
  { v: "1.9.1", voci: [
    "Correzioni: variazione giornaliera calcolata correttamente (prima risultava quasi sempre zero); link e testi del dettaglio posizione; il grafico del dettaglio mantiene il periodo scelto.",
  ] },
  { v: "1.9", voci: [
    "Dettaglio posizione: tocca una posizione per grafico dal carico o a 1 anno, minimo e massimo, contributo, rischio, sensibilità dello stress test, nuovo peso del ribilanciamento e link a justETF, Morningstar e Yahoo Finance.",
    "Certificato dall'emissione: prezzi degli scambi da luglio 2025 (Borsa Italiana), prezzo di riferimento e date dei ribilanciamenti; rendimento dall'emissione e annuo.",
    "Premio/sconto calcolato solo sui prezzi di riferimento (non sugli scambi, che possono essere fermi da giorni).",
  ] },
  { v: "1.8", voci: ["Tolta dal menu la voce «Aggiornamenti dei prezzi (GitHub)»; corretti scenario libero e attribuzione sul telefono."] },
  { v: "1.7", voci: [
    "Attribuzione della performance per classe, area e posizione: dal ribilanciamento, dall'inizio e mese per mese.",
    "Stress test: impatto stimato di scenari (azioni, tassi, oro, dollaro) sul portafoglio attuale e su quello programmato, con dettaglio per posizione e scenario libero.",
    "Attribuzione e stress test anche nel report mensile.",
  ] },
  { v: "1.6", voci: ["In Portafoglio un riquadro avvisa quando c'è un ribilanciamento programmato non ancora in vigore."] },
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
  // il meno tipografico (−) e i segni + vanno accettati come numeri
  let t = String(v ?? "").trim().replace(/\s/g, "").replace(/[\u2212\u2012\u2013]/g, "-").replace(/^\+/, "");
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
let indice = null; // rendimenti mensili dell'indice VICIGROW (data/indice.json)

/* ================= caricamento ================= */
async function carica() {
  const bottone = $("aggiorna");
  bottone.classList.add("gira");
  try {
    const t = Date.now();
    const [p, s, ind, q] = await Promise.all([
      fetch(`data/prezzi.json?t=${t}`).then((r) => r.ok ? r.json() : null),
      fetch(`data/storico.json?t=${t}`).then((r) => r.ok ? r.json() : null),
      fetch(`data/indice.json?t=${t}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`data/certificato.json?t=${t}`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    indice = ind;
    // quotazione aggiornata ogni 15 minuti: se è più recente prevale
    if (p && q && q.ora && (!p.certificato || !p.certificato.ora || q.ora > p.certificato.ora)) p.certificato = q;
    if (!p || !p.posizioni) throw new Error("dati non ancora disponibili");
    dati = p;
    storico = s || { nav: [], benchmark: [], certificato: [] };
    storicoPosizioni = null; // si riscarica alla prossima apertura del dettaglio
    mostra();
    if (dettaglioAperto) aggiornaDettaglio();
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
    const att = c.corrente || c.prezzo;
    $("cert-prezzo").textContent = eur(att);
    const pc = (att / emis - 1) * 100;
    $("cert-perf").innerHTML = `${colorato(pc)} dall'emissione a ${fmt(emis, 0)}`;
    const range = c.min_oggi && c.max_oggi ? ` · oggi ${fmt(c.min_oggi)}–${fmt(c.max_oggi)}` : "";
    // ora dei dati: Borsa Italiana li dà con 15 minuti di ritardo
    const oraDati = c.ora ? new Date(new Date(c.ora).getTime() - 15 * 60000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
    const giornoLettura = c.ora ? dataIt(c.ora) : "";
    const rifTesto = c.riferimento ? ` · riferimento del ${dataIt(c.data_riferimento || c.data)}: ${fmt(c.riferimento)}` : "";
    const quando = c.tipo_corrente === "ultimo contratto" ? `Ultimo contratto, ${giornoLettura} ore ${oraDati} circa`
      : c.tipo_corrente === "medio denaro/lettera" ? `Medio tra denaro e lettera, ${giornoLettura} ore ${oraDati} circa`
      : `Prezzo di riferimento del ${dataIt(c.data_riferimento || c.data || c.ora)}`;
    $("cert-fonte").textContent = `${quando}${c.tipo_corrente && c.tipo_corrente !== "prezzo di riferimento" ? rifTesto : ""}${c.denaro ? "" : range} · ${c.fonte}`;
    $("cert-book").hidden = !(c.denaro && c.lettera);
    if (c.denaro && c.lettera) {
      $("cert-book").innerHTML = `<div>Denaro<b>${fmt(c.denaro)}</b></div><div>Lettera<b>${fmt(c.lettera)}</b></div>
        <div>Spread<b>${fmt(c.spread)}%</b></div>
        <span class="nota">Book del market maker (ritardo 15 min, come su Euronext): denaro = a quanto si vende, lettera = a quanto si compra.</span>`;
    }
  } else {
    $("cert-prezzo").textContent = "—";
    $("cert-perf").textContent = "Quotazione non disponibile";
    $("cert-fonte").textContent = "";
  }
  const perfPeriodo = d.perf_periodo ?? d.perf_totale;
  $("nav").textContent = fmt(d.nav);
  $("nav-perf").innerHTML = `${colorato(perfPeriodo)} dal ${dataIt(d.data_esecuzione)}`;
  $("nav-oggi").innerHTML = `Oggi ${colorato(d.perf_giorno)}`;

  mostraBanner();
  mostraPosizioni();
  barraAllocazione("classi", d.classi, (k) => COLORI_CLASSI[k] || "#888");
  const aree = Object.keys(d.aree || {}).sort((a, b) => d.aree[b] - d.aree[a]);
  barraAllocazione("aree", d.aree || {}, (k) => COLORI_AREE[aree.indexOf(k) % COLORI_AREE.length]);
  mostraMio();
}

// Avviso ben visibile quando c'è un ribilanciamento non ancora in vigore
function mostraBanner() {
  const prog = (dati.programmati || [])[0];
  $("banner-programmato").hidden = !prog;
  if (!prog) return;
  const mese = new Date(prog.data).toLocaleDateString("it-IT", { month: "long" });
  $("banner-titolo").textContent = `Ribilanciamento di ${mese} programmato per il ${dataIt(prog.data)}`;
  $("banner-testo").textContent = `Le posizioni e il paniere qui sotto sono ancora quelli del ${dataIt(dati.data_esecuzione)}. ` +
    "Il nuovo portafoglio entra in vigore da solo con i prezzi di chiusura di quel giorno.";
}

function mostraPosizioni() {
  const chiave = $("ordina").value;
  const righe = [...dati.posizioni].sort((a, b) => (b[chiave] ?? -1e9) - (a[chiave] ?? -1e9));
  $("posizioni").innerHTML = righe.map((r) => `<tr data-k="${esc(r.chiave || r.nome)}">
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
  if (dati.certificato && dati.certificato.prezzo) return dati.certificato.corrente || dati.certificato.prezzo;
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
  const c = dati.certificato;
  $("mio-vendita").hidden = !(c && c.denaro);
  if (c && c.denaro) {
    const incasso = mio.qta * c.denaro, d2 = incasso - investito;
    $("mio-vendita").innerHTML = `Valore al prezzo corrente. Vendendo ora al denaro (${fmt(c.denaro)}) incasseresti ${eur(incasso, 0)}: ` +
      `<span class="${segno(d2)}">${d2 > 0 ? "+" : ""}${eur(d2, 0)} (${perc(d2 / investito * 100)})</span>.`;
  }
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
  if (pr && pr.data_confronto && pr.data_confronto <= pr.data) {
    $("a-premio").textContent = "—";
    $("a-premio-dett").textContent = `Il confronto parte dalla quotazione del ${dataIt(pr.data)}: il risultato arriva con la prossima quotazione del certificato.`;
  } else if (pr) {
    $("a-premio").innerHTML = colorato(pr.premio);
    $("a-premio-dett").textContent = `${pr.premio >= 0 ? "Premio" : "Sconto"} del certificato rispetto al paniere: ` +
      `se lo seguisse alla perfezione dal ${dataIt(pr.data)}, il ${dataIt(pr.data_confronto || dati.aggiornato)} varrebbe ${fmt(pr.valore_implicito)} invece di ${fmt(dati.certificato.prezzo)}` +
      (pr.da_configurazione ? "." : " (riferimento: prima quotazione registrata dall'app).");
  } else {
    $("a-premio").textContent = "—";
    $("a-premio-dett").textContent = "Serve la quotazione del certificato.";
  }
  mostraGrafico();
  mostraStoriaCertificato();
  mostraIndice();
  mostraMensili();
  mostraAttribuzione();
  mostraStress();
  mostraRischio();
}

/* ---------- certificato dall'emissione ---------- */
function mostraStoriaCertificato() {
  const box = $("cert-storia-grafico");
  const pt = (arr) => (arr || []).map((p) => ({ t: new Date(p.data).getTime(), v: p.prezzo, d: p.data }));
  const scambi = pt(storico.certificato_scambi);
  const rif = pt(storico.certificato);
  const emis = dati.emissione || { prezzo: 1000 };
  const c = dati.certificato;
  const ultimoRif = rif.length ? rif[rif.length - 1] : null;
  const ultimoSc = scambi.length ? scambi[scambi.length - 1] : null;
  const attuale = (c && (c.corrente || c.prezzo)) || (ultimoRif && ultimoRif.v) || (ultimoSc && ultimoSc.v);
  const inizioT = scambi.length ? scambi[0].t : new Date(emis.data || dati.data_inizio).getTime();
  const anni = (Date.now() - inizioT) / (365.25 * 86400000);
  const rendTot = attuale ? (attuale / (emis.prezzo || 1000) - 1) * 100 : null;
  const rendAnn = attuale && anni > 0.5 ? (Math.pow(attuale / (emis.prezzo || 1000), 1 / anni) - 1) * 100 : null;
  const vals = scambi.map((p) => p.v);
  const met = [
    ["Dall'emissione", perc(rendTot), `${fmt(emis.prezzo || 1000, 0)} → ${fmt(attuale)}`],
    ["Rendimento annuo", rendAnn == null ? "—" : perc(rendAnn), scambi.length ? `in ${fmt(anni, 1)} anni` : ""],
    ["Ultimo scambio", ultimoSc ? fmt(ultimoSc.v) : "—", ultimoSc ? dataIt(ultimoSc.d) : ""],
    ["Massimo – minimo", vals.length ? `${fmt(Math.max(...vals), 0)} – ${fmt(Math.min(...vals), 0)}` : "—", "prezzi degli scambi"],
  ];
  const pf = (c && c.performance) || {};
  [["settimana", "1 settimana"], ["mese", "1 mese"], ["sei_mesi", "6 mesi"], ["anno", "1 anno"]].forEach(([k, n]) => {
    if (pf[k] != null) met.push([n, perc(pf[k]), "Borsa Italiana"]);
  });
  $("cert-storia-metriche").innerHTML = met.map(([a, v, x]) => `<div><span>${a}</span><b>${v}</b><small>${x}</small></div>`).join("");
  if (box.offsetParent === null) return;
  if (scambi.length + rif.length < 2) { box.innerHTML = `<div class="vuoto">Storico non ancora disponibile.</div>`; return; }

  const W = box.clientWidth || 600, H = box.clientHeight || 220, m = { l: 44, r: 8, t: 14, b: 22 };
  const tutti = scambi.concat(rif);
  const t0 = Math.min(...tutti.map((p) => p.t)), t1 = Math.max(Date.now(), ...tutti.map((p) => p.t));
  const base = emis.prezzo || 1000;
  let v0 = Math.min(base, ...tutti.map((p) => p.v)), v1 = Math.max(base, ...tutti.map((p) => p.v));
  const pad = (v1 - v0) * 0.1 || 5; v0 -= pad; v1 += pad;
  const x = (t) => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - v0) / (v1 - v0)) * (H - m.t - m.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let i = 0; i <= 3; i++) {
    const v = v0 + (v1 - v0) * i / 3;
    svg += `<line class="griglia" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  svg += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(base)}" y2="${y(base)}"/>`;
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (t1 - t0) * i / 4;
    svg += `<text class="asse" x="${x(t)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${new Date(t).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })}</text>`;
  }
  // date dei ribilanciamenti registrati (anche quello programmato)
  const ribs = (dati.periodi || []).map((p) => p.data).concat((dati.programmati || []).map((p) => p.data));
  ribs.forEach((d) => {
    const t = new Date(d).getTime();
    if (t < t0 || t > t1) return;
    svg += `<line class="rib" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}"/>`;
  });
  // scambi: gradini (il prezzo resta fermo fino allo scambio successivo)
  if (scambi.length) {
    let d = `M${x(scambi[0].t).toFixed(1)},${y(scambi[0].v).toFixed(1)}`;
    for (let i = 1; i < scambi.length; i++) d += `H${x(scambi[i].t).toFixed(1)}V${y(scambi[i].v).toFixed(1)}`;
    svg += `<path d="${d}" fill="none" stroke="var(--azzurro)" stroke-width="1.6"/>`;
    scambi.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="1.8" fill="var(--azzurro)"/>`; });
  }
  if (rif.length) {
    if (rif.length > 1) svg += `<path d="${rif.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}" fill="none" stroke="var(--linea-cert)" stroke-width="2"/>`;
    rif.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3" fill="var(--linea-cert)"/>`; });
  }
  box.innerHTML = svg + "</svg>";
}

/* ---------- indice VICIGROW (Leonteq) ---------- */
const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

// Serie del valore dell'indice a fine mese (100 all'avvio) dai rendimenti mensili
function serieIndice() {
  const out = [];
  let v = 100;
  Object.keys(indice.mensili).sort().forEach((anno) => {
    Object.keys(indice.mensili[anno]).map(Number).sort((a, b) => a - b).forEach((mese) => {
      const r = indice.mensili[anno][mese];
      if (!out.length) out.push({ t: new Date(Number(anno), mese - 1, 1).getTime(), v }); // inizio del primo mese
      if (r != null) v *= 1 + r / 100;
      out.push({ t: new Date(Number(anno), mese, 0).getTime(), v, anno, mese });
    });
  });
  return out;
}

function mostraIndice() {
  $("indice-riquadro").hidden = !indice;
  if (!indice) return;
  const serie = serieIndice();
  const ultimo = serie[serie.length - 1];
  const rendIndice = ultimo.v - 100;
  const emis = (dati.emissione && dati.emissione.prezzo) || 1000;
  const c = dati.certificato;
  const prezzoCert = c ? (c.corrente || c.prezzo) : null;
  const rendCert = prezzoCert ? (prezzoCert / emis - 1) * 100 : null;
  const met = [
    ["Indice dall'avvio", perc(rendIndice), `fino a ${MESI_BREVI[ultimo.mese - 1]} ${ultimo.anno}`],
    ["Media annua indice", indice.media_annua_leonteq != null ? perc(indice.media_annua_leonteq) : "—", "dato Leonteq"],
    ["Certificato dall'emissione", perc(rendCert), c ? `prezzo ${fmt(prezzoCert)}` : ""],
    ["Differenza", rendCert == null ? "—" : `${fmt(rendCert - rendIndice)} punti`, "costi della struttura e altre differenze"],
  ];
  $("indice-metriche").innerHTML = met.map(([a, v, x]) => `<div><span>${a}</span><b class="${a === "Differenza" ? segno(rendCert - rendIndice) : ""}">${v}</b><small>${x}</small></div>`).join("");

  // Quanto della differenza spiegano le commissioni del KID: gestione annua
  // per gli anni dall'emissione, performance sulla parte positiva (stima)
  const costi = dati.costi;
  if (costi && rendCert != null) {
    const scambi0 = (storico.certificato_scambi || [])[0];
    const dal = new Date((dati.emissione && dati.emissione.data) || (scambi0 && scambi0.data) || dati.data_inizio);
    const anni = Math.max(0, (Date.now() - dal.getTime()) / (365.25 * 86400000));
    const lordo = 1 + rendIndice / 100;
    const dopoGestione = lordo * Math.pow(1 - costi.commissione_gestione / 100, anni);
    const perfFee = Math.max(0, dopoGestione - 1) * costi.commissione_performance / 100;
    const atteso = (dopoGestione - perfFee) * emis;
    const gestionePt = (dopoGestione - lordo) * 100, perfPt = -perfFee * 100;
    const resto = rendCert - rendIndice - gestionePt - perfPt;
    $("indice-costi").innerHTML = `<h4>Da dove viene la differenza (stima)</h4><table>
      <tr><td>Indice dall'avvio</td><td>${perc(rendIndice)}</td></tr>
      <tr><td>Commissione di gestione (${fmt(costi.commissione_gestione, 1)}% annuo per ${fmt(anni, 1)} anni)</td><td class="giu">${fmt(gestionePt)} punti</td></tr>
      <tr><td>Commissione di performance (${fmt(costi.commissione_performance, 0)}% della performance positiva)</td><td class="${perfPt < 0 ? "giu" : ""}">${fmt(perfPt)} punti</td></tr>
      <tr><td>Valore atteso del certificato</td><td>${fmt(atteso)}</td></tr>
      <tr><td>Prezzo attuale (${esc(c.tipo_corrente || "riferimento")})</td><td>${fmt(prezzoCert)}</td></tr>
      <tr class="totale"><td>Differenza non spiegata dalle commissioni</td><td class="${segno(resto)}">${fmt(resto)} punti</td></tr>
    </table><p class="nota">${esc(costi.fonte || "")}. Stima semplificata: la commissione di performance reale dipende dai massimi raggiunti (high watermark).</p>`;
  } else $("indice-costi").innerHTML = "";

  // tabella: righe = mesi, colonne = anni (si legge bene anche sul telefono)
  const anni = Object.keys(indice.mensili).sort();
  const tot = indice.totali_leonteq || {};
  $("indice-mesi").innerHTML = `<thead><tr><th>Mese</th>${anni.map((a) => `<th>${a}</th>`).join("")}</tr></thead>
    <tbody>${MESI_BREVI.map((nome, i) => {
      const celle = anni.map((a) => indice.mensili[a][i + 1]);
      if (celle.every((v) => v === undefined)) return "";
      return `<tr><td>${nome}</td>${celle.map((v) => `<td class="${v == null ? "" : segno(v)}">${v == null ? "—" : perc(v)}</td>`).join("")}</tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td>Totale</td>${anni.map((a) => `<td class="forte ${segno(tot[a])}">${tot[a] == null ? "—" : perc(tot[a])}</td>`).join("")}</tr></tfoot>`;
  $("indice-nota").textContent = `Fonte: ${indice.fonte}; dati fino al ${dataIt(indice.aggiornato_al)}. ` +
    "La differenza tra indice e certificato comprende le commissioni del certificato e il fatto che il prezzo del certificato " +
    "è quello di Borsa Italiana (riferimento o ultimo scambio), non il valore dell'indice.";

  const box = $("indice-grafico");
  if (box.offsetParent === null) return;
  const scambi = (storico.certificato_scambi || []).map((p) => ({ t: new Date(p.data).getTime(), v: p.prezzo / emis * 100 }));
  const rif = (storico.certificato || []).map((p) => ({ t: new Date(p.data).getTime(), v: p.prezzo / emis * 100 }));
  const tutti = serie.concat(scambi, rif);
  const W = box.clientWidth || 600, H = box.clientHeight || 220, m = { l: 40, r: 8, t: 10, b: 22 };
  const t0 = Math.min(...tutti.map((p) => p.t)), t1 = Math.max(...tutti.map((p) => p.t));
  let v0 = Math.min(100, ...tutti.map((p) => p.v)), v1 = Math.max(100, ...tutti.map((p) => p.v));
  const pad = (v1 - v0) * 0.1 || 1; v0 -= pad; v1 += pad;
  const x = (t) => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - v0) / (v1 - v0)) * (H - m.t - m.b);
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let i = 0; i <= 3; i++) {
    const v = v0 + (v1 - v0) * i / 3;
    svg += `<line class="griglia" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  svg += `<line class="base" x1="${m.l}" x2="${W - m.r}" y1="${y(100)}" y2="${y(100)}"/>`;
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (t1 - t0) * i / 4;
    svg += `<text class="asse" x="${x(t)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${new Date(t).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })}</text>`;
  }
  if (scambi.length) {
    let d = `M${x(scambi[0].t).toFixed(1)},${y(scambi[0].v).toFixed(1)}`;
    for (let i = 1; i < scambi.length; i++) d += `H${x(scambi[i].t).toFixed(1)}V${y(scambi[i].v).toFixed(1)}`;
    svg += `<path d="${d}" fill="none" stroke="var(--azzurro)" stroke-width="1.4" opacity=".9"/>`;
  }
  rif.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3" fill="var(--linea-cert)"/>`; });
  svg += `<path d="${serie.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}" fill="none" stroke="#F0A030" stroke-width="2.2" stroke-linejoin="round"/>`;
  serie.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="2.2" fill="#F0A030"/>`; });
  box.innerHTML = svg + "</svg>";
}

/* ---------- attribuzione della performance ---------- */
const etichettaPeriodo = (a) => a.mese ? meseIt(a.id) : a.id === "ribilanciamento"
  ? `Dal ribilanciamento (${dataIt(dati.data_esecuzione)})` : `Dall'inizio (${dataIt(dati.data_inizio)})`;

function barreContributi(id, voci) {
  const max = Math.max(0.01, ...voci.map(([, v]) => Math.abs(v)));
  $(id).innerHTML = voci.map(([nome, v]) => {
    const w = Math.abs(v) / max * 50;
    return `<div class="attr-riga"><span class="nome" title="${esc(nome)}">${esc(nome)}</span>
      <div class="attr-barra"><i style="left:${v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${v >= 0 ? "var(--su)" : "var(--giu)"}"></i><span class="centro"></span></div>
      <span class="num ${segno(v)}">${perc(v)}</span></div>`;
  }).join("");
}

function mostraAttribuzione() {
  const lista = dati.attribuzione || [];
  const sel = $("attr-periodo");
  if (!lista.length) { $("attr-totale").textContent = "Dati non ancora disponibili."; return; }
  const scelto = sel.value || lista[0].id;
  sel.innerHTML = lista.map((a) => `<option value="${esc(a.id)}">${esc(etichettaPeriodo(a))}</option>`).join("");
  sel.value = lista.some((a) => a.id === scelto) ? scelto : lista[0].id;
  const a = lista.find((x) => x.id === sel.value);
  $("attr-totale").innerHTML = `<b class="${segno(a.rend)}">${perc(a.rend)}</b> ${esc(etichettaPeriodo(a).toLowerCase())}`;
  const ord = (o) => Object.entries(o || {}).sort((x, y) => y[1] - x[1]);
  barreContributi("attr-classi", ord(a.classi));
  barreContributi("attr-aree", ord(a.aree));
  barreContributi("attr-posizioni", a.posizioni.map((p) => [breve(p.nome), p.contributo]));
}

/* ---------- stress test ---------- */
// Impatto % di uno scenario su ogni strumento: somma di sensibilità × shock.
// Il fattore tassi è un indice obbligazionario: +1 punto di tassi = −duration%.
function impattoStrumento(beta, shock, duration) {
  if (!beta) return 0;
  const f = { azioni: shock.azioni || 0, obbligazioni: -(shock.tassi || 0) * duration, oro: shock.oro || 0, dollaro: shock.dollaro || 0 };
  return Object.keys(f).reduce((t, k) => t + (beta[k] || 0) * f[k], 0);
}

function impattoPortafoglio(pesi, shock) {
  const st = dati.stress;
  const det = pesi.map((p) => ({ ...p, impatto: p.liquidita ? 0 : impattoStrumento(st.beta[p.chiave], shock, st.duration_tassi) }));
  return { totale: det.reduce((t, p) => t + p.peso / 100 * p.impatto, 0), det };
}

function pesiAttuali() {
  return dati.posizioni.map((p) => ({ nome: p.nome, chiave: p.chiave || p.isin, peso: p.peso_attuale, liquidita: p.liquidita }));
}
function pesiProgrammati() {
  const prog = (dati.programmati || [])[0];
  if (!prog) return null;
  const somma = prog.posizioni.reduce((t, p) => t + p.peso, 0) || 100;
  return prog.posizioni.map((p) => ({ nome: p.nome, chiave: p.chiave || p.isin, peso: p.peso / somma * 100, liquidita: p.liquidita }));
}

function testoShock(sh) {
  const parti = [];
  if (sh.azioni) parti.push(`azioni ${perc(sh.azioni, 0)}`);
  if (sh.tassi) parti.push(`tassi ${sh.tassi > 0 ? "+" : ""}${fmt(sh.tassi, 1)} punti`);
  if (sh.oro) parti.push(`oro ${perc(sh.oro, 0)}`);
  if (sh.dollaro) parti.push(`dollaro ${perc(sh.dollaro, 0)}`);
  return parti.join(", ");
}

function inEuro(v) {
  const pat = leggi(K.patrimonio);
  return pat ? ` · ${v >= 0 ? "+" : "−"}${eur(Math.abs(pat * v / 100), 0)}` : "";
}

function mostraStress() {
  const st = dati.stress;
  if (!st) {
    $("stress-nota").textContent = "Dati per lo stress test non ancora disponibili.";
    $("stress-scenari").innerHTML = "";
    return;
  }
  const att = pesiAttuali(), prog = pesiProgrammati();
  const prossimo = (dati.programmati || [])[0];
  $("stress-col-prog").hidden = !prog;
  if (prossimo) $("stress-col-prog").textContent = `Dal ${new Date(prossimo.data).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
  $("stress-nota").textContent = "Perdita o guadagno stimato del portafoglio se succedesse lo scenario. Tocca una riga per vedere le posizioni più colpite." +
    (leggi(K.patrimonio) ? "" : " Inserisci il patrimonio nel simulatore (Gestione) per vedere anche gli importi.");
  $("stress-scenari").innerHTML = st.scenari.map((sc, i) => {
    const a = impattoPortafoglio(att, sc.shock).totale;
    const b = prog ? impattoPortafoglio(prog, sc.shock).totale : null;
    return `<tr data-i="${i}"><td>${esc(sc.nome)}<small>${esc(testoShock(sc.shock))}</small></td>
      <td class="forte ${segno(a)}">${perc(a)}<small>${inEuro(a).replace(/^ · /, "")}</small></td>
      ${prog ? `<td class="forte ${segno(b)}">${perc(b)}</td>` : ""}</tr>`;
  }).join("");
  $("stress-scenari").querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => {
    $("stress-scenari").querySelectorAll("tr").forEach((x) => x.classList.toggle("scelto", x === tr));
    dettaglioStress(st.scenari[Number(tr.dataset.i)]);
  }));
  const senza = [...new Set(att.concat(prog || []).filter((p) => !p.liquidita && !st.beta[p.chiave]).map((p) => breve(p.nome)))];
  $("stress-metodo").textContent = `Metodo: per ogni posizione si stima quanto si muove con azioni (S&P 500 coperto dal cambio), tassi euro, oro e dollaro, ` +
    `sui rendimenti settimanali dell'ultimo anno (${st.settimane} settimane dal ${dataIt(st.dal)}); ` +
    `+1 punto di tassi corrisponde a −${fmt(st.duration_tassi, 1)}% sull'indice obbligazionario. È una stima lineare: negli shock forti le correlazioni cambiano.` +
    (senza.length ? ` Senza storico sufficiente (impatto 0): ${senza.join(", ")}.` : "");
  calcolaStressLibero();
}

function dettaglioStress(sc) {
  const r = impattoPortafoglio(pesiAttuali(), sc.shock);
  const voci = r.det.filter((p) => !p.liquidita).map((p) => ({ ...p, contr: p.peso / 100 * p.impatto }))
    .sort((a, b) => a.contr - b.contr);
  $("stress-dettaglio").hidden = false;
  $("stress-dettaglio").innerHTML = `<h4>${esc(sc.nome)}: ${perc(r.totale)}${inEuro(r.totale)}</h4>
    <div class="tabella-box"><table class="tabella compatta"><thead><tr><th>Posizione</th><th>Impatto</th><th>Sul portafoglio</th></tr></thead>
    <tbody>${voci.map((p) => `<tr><td>${esc(breve(p.nome))}</td><td class="${segno(p.impatto)}">${perc(p.impatto, 1)}</td>
      <td class="forte ${segno(p.contr)}">${perc(p.contr)}</td></tr>`).join("")}</tbody></table></div>`;
}

function calcolaStressLibero() {
  if (!dati || !dati.stress) return;
  const sh = { azioni: numero($("sl-azioni").value), tassi: numero($("sl-tassi").value), oro: numero($("sl-oro").value), dollaro: numero($("sl-dollaro").value) };
  const a = impattoPortafoglio(pesiAttuali(), sh).totale;
  const prog = pesiProgrammati();
  const b = prog ? impattoPortafoglio(prog, sh).totale : null;
  $("stress-libero-esito").innerHTML = `Portafoglio attuale <b class="${segno(a)}">${perc(a)}</b>${inEuro(a)}` +
    (prog ? ` · dal ${dataIt(dati.programmati[0].data)} <b class="${segno(b)}">${perc(b)}</b>` : "");
}

function mostraGrafico() {
  const box = $("grafico");
  if (box.offsetParent === null) return; // scheda nascosta: si disegna quando si apre
  const pt = (arr, campo) => (arr || []).map((p) => ({ t: new Date(p.data).getTime(), v: p[campo] }));
  const nav = pt(storico.nav, "nav");
  const bench = pt(storico.benchmark, "valore");
  // La quotazione del certificato ha una base diversa: la riporto sulla scala
  // del paniere dal primo giorno in comune; nel suggerimento resta il prezzo vero.
  const certVero = pt(storico.certificato, "prezzo").filter((p) => !nav.length || p.t >= nav[0].t);
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
    `<tr data-k="${esc((dati.posizioni.find((x) => x.nome === p.nome) || {}).chiave || "")}"><td>${esc(breve(p.nome))}</td><td data-l="Peso">${fmt(pesi[p.nome])}%</td><td data-l="Volatilità">${fmt(p.vol)}%</td>
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
      <div><span>Certificato</span><b>${c ? eur(c.corrente || c.prezzo) : "—"}</b><span>${c ? perc(((c.corrente || c.prezzo) / emis - 1) * 100) + " dall'emissione" : ""}</span></div>
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
    ${(() => {
      const lista = d.attribuzione || [];
      const am = [...lista].reverse().find((x) => x.mese);
      const ar = lista.find((x) => x.id === "ribilanciamento");
      if (!am && !ar) return "";
      const classi = [...new Set([...Object.keys((am || {}).classi || {}), ...Object.keys((ar || {}).classi || {})])];
      const cella = (x, c) => x ? `<td class="${segno(x.classi[c])}">${perc(x.classi[c] || 0)}</td>` : "";
      return `<h2>Attribuzione della performance</h2>
      <table><thead><tr><th>Classe</th>${am ? `<th>${meseIt(am.id)}</th>` : ""}${ar ? `<th>Dal ${dataIt(d.data_esecuzione)}</th>` : ""}</tr></thead>
      <tbody>${classi.map((c) => `<tr><td>${esc(c)}</td>${cella(am, c)}${cella(ar, c)}</tr>`).join("")}</tbody>
      <tfoot><tr><td>Totale</td>${am ? `<td class="${segno(am.rend)}">${perc(am.rend)}</td>` : ""}${ar ? `<td class="${segno(ar.rend)}">${perc(ar.rend)}</td>` : ""}</tr></tfoot></table>`;
    })()}
    ${d.stress ? `<h2>Stress test (portafoglio attuale)</h2>
    <table><tbody>${d.stress.scenari.map((sc) => { const v = impattoPortafoglio(pesiAttuali(), sc.shock).totale;
      return `<tr><td>${esc(sc.nome)}</td><td>${esc(testoShock(sc.shock))}</td><td class="${segno(v)}">${perc(v)}</td></tr>`; }).join("")}</tbody></table>` : ""}
    ${r ? `<h2>Rischio (portafoglio attuale, ultimo anno)</h2>
    <table><tbody>
      <tr><td>Volatilità annua</td><td>${fmt(r.vol)}%</td><td>${b && b.vol != null ? "benchmark " + fmt(b.vol) + "%" : ""}</td></tr>
      <tr><td>Perdita massima</td><td>${fmt(r.max_drawdown)}%</td><td>${b && b.max_drawdown != null ? "benchmark " + fmt(b.max_drawdown) + "%" : ""}</td></tr>
      <tr><td>VaR 95% a 1 giorno</td><td>−${fmt(r.var95)}%</td><td></td></tr>
    </tbody></table>` : ""}
    <div class="r-piede">Il paniere stimato è un calcolo indicativo basato su pesi e prezzi di carico dei ribilanciamenti e sui prezzi di mercato più recenti; non considera commissioni. Il valore che fa fede è la quotazione ufficiale del certificato. Prezzi: Yahoo Finance e Borsa Italiana. Documento a solo scopo informativo.</div>`;
}

/* ================= dettaglio posizione ================= */
let storicoPosizioni = null;
let dettaglioAperto = null;
let dettaglioPeriodo = "carico";

async function apriDettaglio(chiave) {
  const r = dati.posizioni.find((p) => (p.chiave || p.nome) === chiave);
  if (!r || r.liquidita) return;
  dettaglioAperto = chiave;
  dettaglioPeriodo = "carico";
  document.querySelectorAll("[data-det-periodo]").forEach((b) => b.classList.toggle("attiva", b.dataset.detPeriodo === "carico"));
  $("dettaglio").hidden = false;
  document.body.style.overflow = "hidden";
  await aggiornaDettaglio();
}

// Ridisegna il dettaglio aperto, scaricando lo storico dei prezzi se serve
// (senza cambiare il periodo scelto)
async function aggiornaDettaglio() {
  const chiave = dettaglioAperto;
  mostraDettaglio();
  if (!storicoPosizioni) {
    try {
      const risp = await fetch(`data/posizioni_storico.json?t=${Date.now()}`);
      storicoPosizioni = risp.ok ? await risp.json() : {};
    } catch { storicoPosizioni = {}; }
    if (dettaglioAperto && dettaglioAperto === chiave) mostraDettaglio();
  }
}

function chiudiDettaglio() {
  $("dettaglio").hidden = true;
  dettaglioAperto = null;
  document.body.style.overflow = "";
}

function mostraDettaglio() {
  const r = dati.posizioni.find((p) => (p.chiave || p.nome) === dettaglioAperto);
  if (!r) return chiudiDettaglio();
  const st = dati.stress;
  const beta = st && st.beta[r.chiave];
  const rischio = dati.rischio && dati.rischio.posizioni.find((p) => p.nome === r.nome);
  const prog = (dati.programmati || [])[0];
  const nuovo = prog && prog.posizioni.find((p) => (p.chiave || p.isin) === r.chiave);
  const ch = ((storicoPosizioni || {})[r.chiave] || {}).chiusure || [];

  $("det-nome").textContent = r.nome;
  $("det-codici").textContent = [r.bloomberg, r.isin, r.classe, r.area].filter(Boolean).join(" · ");
  $("det-prezzo").innerHTML = `<b>${fmt(r.prezzo, decPrezzo(r.prezzo))}</b>${colorato(r.var_carico)} dal carico ` +
    `<span class="nota">· ${etichettaGiorno(r)} ${colorato(r.var_giorno)}</span>`;

  // serie per il grafico
  const dal = dettaglioPeriodo === "carico" ? dati.data_esecuzione : null;
  let punti = ch.filter(([d]) => !dal || d >= dal).map(([d, c]) => ({ t: new Date(d).getTime(), v: c }));
  if (dettaglioPeriodo === "carico" && (!punti.length || punti[0].t > new Date(dati.data_esecuzione).getTime())) {
    punti.unshift({ t: new Date(dati.data_esecuzione).getTime(), v: r.prezzo_carico });
  }
  const oggiT = new Date(new Date().toISOString().slice(0, 10)).getTime();
  if (punti.length && punti[punti.length - 1].t < oggiT && r.data_prezzo && r.data_prezzo >= new Date().toISOString().slice(0, 10)) {
    punti.push({ t: oggiT, v: r.prezzo });
  }
  graficoSemplice($("det-grafico"), punti, dettaglioPeriodo === "carico" ? r.prezzo_carico : null,
    storicoPosizioni ? "Storico non disponibile." : "Caricamento…");

  const valori = punti.map((p) => p.v);
  const min = valori.length ? Math.min(...valori) : null, max = valori.length ? Math.max(...valori) : null;
  const met = [
    ["Peso attuale", fmt(r.peso_attuale) + "%", `obiettivo ${fmt(r.peso_obiettivo)}% (${r.scostamento > 0 ? "+" : ""}${fmt(r.scostamento)})`],
    ["Carico", fmt(r.prezzo_carico, decPrezzo(r.prezzo_carico)), `dal ${dataIt(dati.data_esecuzione)}`],
    ["Contributo", perc(r.contributo), "alla performance del periodo"],
    [dettaglioPeriodo === "carico" ? "Min – max dal carico" : "Min – max 1 anno",
      min == null ? "—" : `${fmt(min, decPrezzo(min))} – ${fmt(max, decPrezzo(max))}`,
      min == null ? "" : `oggi ${perc((r.prezzo / min - 1) * 100, 1)} dal minimo, ${perc((r.prezzo / max - 1) * 100, 1)} dal massimo`],
  ];
  if (rischio) {
    met.push(["Volatilità 1 anno", fmt(rischio.vol) + "%", ""]);
    met.push(["Rendimento 1 anno", perc(rischio.rend_1a), ""]);
    met.push(["Quota di rischio", fmt(rischio.contributo_rischio, 1) + "%", `del rischio del portafoglio (peso ${fmt(r.peso_attuale, 1)}%)`]);
  }
  if (prog) met.push([`Dal ${dataIt(prog.data)}`, nuovo ? fmt(nuovo.peso) + "%" : "esce", nuovo ? `oggi ${fmt(r.peso_attuale)}%` : "dal portafoglio"]);
  $("det-metriche").innerHTML = met.map(([a, v, x]) => `<div><span>${a}</span><b>${v}</b><small>${x}</small></div>`).join("");

  $("det-sensibilita").innerHTML = beta ? `<h3>Sensibilità (stress test)</h3><div class="det-sens">
      <div>Azioni −10%<b class="${segno(-10 * beta.azioni)}">${perc(-10 * beta.azioni, 1)}</b></div>
      <div>Tassi +1 punto<b class="${segno(-st.duration_tassi * beta.obbligazioni)}">${perc(-st.duration_tassi * beta.obbligazioni, 1)}</b></div>
      <div>Oro −10%<b class="${segno(-10 * beta.oro)}">${perc(-10 * beta.oro, 1)}</b></div>
      <div>Dollaro −10%<b class="${segno(-10 * beta.dollaro)}">${perc(-10 * beta.dollaro, 1)}</b></div>
    </div><p class="nota">Variazione stimata della posizione in ciascuno scenario; affidabilità della stima (R²) ${fmt((beta.r2 || 0) * 100, 0)}%.</p>` : "";

  const sp = (storicoPosizioni || {})[r.chiave] || {};
  $("det-fonte").textContent = `Prezzo: ${r.fonte || "—"}${r.simbolo ? ` (${r.simbolo})` : ""}, ${r.data_prezzo ? dataIt(r.data_prezzo) : ""}` +
    (sp.storico_da || r.storico_da ? `. Storico (grafico e rischio) ricostruito con ${sp.storico_da || r.storico_da}, riportato al prezzo attuale.` : ".");
  const link = [];
  // justETF solo per ETF/ETC (riconosciuti dall'emittente nel nome), non per i fondi
  const etf = /iShares|Amundi|Lyxor|WisdomTree|Xtrackers|Vanguard|SPDR|Invesco|\bETF\b|\bETC\b/i.test(r.nome);
  if (r.isin) {
    if (etf) link.push(["justETF", `https://www.justetf.com/it/etf-profile.html?isin=${r.isin}`]);
    link.push(["Morningstar", `https://www.morningstar.it/it/funds/SecuritySearchResults.aspx?search=${r.isin}`]);
  }
  if (r.simbolo && !r.simbolo.startsWith("FT:")) link.push(["Yahoo Finance", `https://finance.yahoo.com/quote/${encodeURIComponent(r.simbolo)}`]);
  $("det-link").innerHTML = link.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n} ↗</a>`).join("");
}

// Grafico a una linea, con eventuale linea tratteggiata del prezzo di carico
function graficoSemplice(box, punti, riferimento, messaggio) {
  if (punti.length < 2) { box.innerHTML = `<div class="vuoto">${esc(messaggio)}</div>`; return; }
  const W = box.clientWidth || 560, H = box.clientHeight || 180, m = { l: 48, r: 8, t: 8, b: 20 };
  const t0 = punti[0].t, t1 = Math.max(punti[punti.length - 1].t, t0 + 86400000);
  const vals = punti.map((p) => p.v).concat(riferimento != null ? [riferimento] : []);
  let v0 = Math.min(...vals), v1 = Math.max(...vals);
  const pad = (v1 - v0) * 0.1 || v0 * 0.01 || 1; v0 -= pad; v1 += pad;
  const x = (t) => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - v0) / (v1 - v0)) * (H - m.t - m.b);
  const dec = v1 < 10 ? 3 : v1 < 100 ? 1 : 0;
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let i = 0; i <= 3; i++) {
    const v = v0 + (v1 - v0) * i / 3;
    svg += `<line class="griglia" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="asse" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`;
  }
  const corto = t1 - t0 < 120 * 86400000;
  for (let i = 0; i <= 3; i++) {
    const t = t0 + (t1 - t0) * i / 3;
    const lab = new Date(t).toLocaleDateString("it-IT", corto ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
    svg += `<text class="asse" x="${x(t)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === 3 ? "end" : "middle"}">${lab}</text>`;
  }
  if (riferimento != null) svg += `<line class="carico" x1="${m.l}" x2="${W - m.r}" y1="${y(riferimento)}" y2="${y(riferimento)}"/>`;
  const ultimo = punti[punti.length - 1].v;
  const colore = riferimento == null ? "var(--linea-nav)" : ultimo >= riferimento ? "var(--su)" : "var(--giu)";
  svg += `<path d="${punti.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("")}" fill="none" stroke="${colore}" stroke-width="2" stroke-linejoin="round"/>`;
  box.innerHTML = svg + "</svg>";
}

/* ================= schede e menu ================= */
function mostraScheda(nome) {
  if (!document.querySelector(`[data-pannello="${nome}"]`)) nome = "portafoglio";
  document.querySelectorAll("[data-pannello]").forEach((s) => { s.hidden = s.dataset.pannello !== nome; });
  document.querySelectorAll("[data-scheda]").forEach((b) => b.classList.toggle("attiva", b.dataset.scheda === nome));
  scrivi(K.scheda, nome);
  chiudiMenu();
  window.scrollTo({ top: 0 });
  if (nome === "andamento" && dati) { mostraGrafico(); mostraStoriaCertificato(); mostraIndice(); }
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { chiudiMenu(); chiudiDettaglio(); $("novita").hidden = true; } });
$("menu-aggiorna").addEventListener("click", () => { chiudiMenu(); carica(); });
$("menu-novita").addEventListener("click", mostraNovita);
$("novita-chiudi").addEventListener("click", () => { $("novita").hidden = true; });
$("novita-x").addEventListener("click", () => { $("novita").hidden = true; });
$("novita").addEventListener("click", (e) => { if (e.target === $("novita")) $("novita").hidden = true; });
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
$("attr-periodo").addEventListener("change", () => dati && mostraAttribuzione());
["posizioni", "rischio-posizioni"].forEach((id) => $(id).addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-k]");
  if (tr && tr.dataset.k && dati) apriDettaglio(tr.dataset.k);
}));
$("det-chiudi").addEventListener("click", chiudiDettaglio);
$("dettaglio").addEventListener("click", (e) => { if (e.target === $("dettaglio")) chiudiDettaglio(); });
document.querySelectorAll("[data-det-periodo]").forEach((b) => b.addEventListener("click", () => {
  dettaglioPeriodo = b.dataset.detPeriodo;
  document.querySelectorAll("[data-det-periodo]").forEach((x) => x.classList.toggle("attiva", x === b));
  mostraDettaglio();
}));
["sl-azioni", "sl-tassi", "sl-oro", "sl-dollaro"].forEach((id) => $(id).addEventListener("input", calcolaStressLibero));
window.addEventListener("resize", () => { if (dati) { mostraGrafico(); mostraStoriaCertificato(); mostraIndice(); } });
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
