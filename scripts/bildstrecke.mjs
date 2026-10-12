#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Bildstrecke: die ganze angemeldete Anwendung als Bilder (Selbstsichtung).
//
// Jede Route aus scripts/bildstrecke/routen.mjs wird je Konto bei 375 x 812
// (Telefon, Touch) und 1280 x 800 als Vollseite aufgenommen und dabei
// geprueft: waagerechtes Scrollen, Konsolenfehler, gescheiterte Anfragen,
// Zielseite erreicht (keine Umleitung zur Anmeldung oder auf die Startseite),
// sichtbarer Fehler- oder Ladezustand, leere Seite. Ein Lesewaechter haelt
// schreibende Anfragen an (scripts/bildstrecke/lesewaechter.mjs) - die
// Bildstrecke laeuft oft gegen einen gemeinsam genutzten Stack.
//
// Aufruf (Anwendung und Supabase-Stack laufen, docs/DEVELOPMENT.md):
//   pnpm bildstrecke                                   # alles, Ordner .tmp/bildstrecke/<Zeit>
//   pnpm bildstrecke --nur=abrechnung,/training        # Bereich oder Teil der Route
//   pnpm bildstrecke --konten=owner --breiten=375      # Teilmenge
//   pnpm bildstrecke --ziel=nachher --vergleich=vorher # dazu vergleich.html
//   pnpm bildstrecke --ziel=nachher --vergleich=vorher --nur-bogen  # nur die Boegen neu
//
// Weitere Optionen: --parallel=4 (Browserkontexte), --neu-laden (jede Seite
// als frisches Dokument statt Wechsel in der Anwendung; langsamer), --streng
// (Ausgang 1 bei Befunden). Adresse der Anwendung: E2E_BASE_URL (Standard
// http://127.0.0.1:5173). Im Ordner: die PNGs, index.html (Kontaktbogen nach
// Bereich, 375 und 1280 nebeneinander, Befunde markiert) und ergebnis.json.
// -----------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  ANMELDUNG_VORAUSSETZUNG,
  KONTEN,
  STARTBILD_MERKER,
  anmelden,
  browserOptionen,
  startbildAbwarten,
  startbildUeberspringen,
} from './testkonten.mjs';
import { BEREICHE, ROUTEN } from './bildstrecke/routen.mjs';
import { lesewaechterAnbringen } from './bildstrecke/lesewaechter.mjs';
import { kontaktbogenHtml, kurzname, vergleichHtml } from './bildstrecke/kontaktbogen.mjs';

const BASIS = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const ZONE = 'Europe/Berlin';
const BREITEN = new Map([
  [375, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }],
  [1280, { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false }],
]);

// --- Argumente ---------------------------------------------------------------
const argumente = process.argv.slice(2);
function option(name) {
  const eintrag = argumente.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (eintrag === undefined) return undefined;
  return eintrag.includes('=') ? eintrag.slice(eintrag.indexOf('=') + 1) : true;
}
const liste = (wert) =>
  typeof wert === 'string'
    ? wert
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

if (option('hilfe') || option('help')) {
  console.log(
    'Aufruf: pnpm bildstrecke [--ziel=ordner] [--vergleich=vorher-ordner] [--nur=bereich|route-teil,…]\n' +
      '                         [--konten=owner,…] [--breiten=375,1280] [--parallel=4] [--neu-laden]\n' +
      '                         [--nur-bogen] [--streng]',
  );
  process.exit(0);
}

const zeitstempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ZIEL = path.resolve(
  typeof option('ziel') === 'string' ? option('ziel') : `.tmp/bildstrecke/${zeitstempel}`,
);
const VERGLEICH =
  typeof option('vergleich') === 'string' ? path.resolve(option('vergleich')) : null;
const NUR = liste(option('nur')).map((t) => t.toLowerCase());
const NUR_KONTEN = liste(option('konten'));
const NUR_BREITEN = liste(option('breiten')).map(Number);
const PARALLEL = Math.max(1, Math.min(12, Number(option('parallel') ?? 4) || 4));
const NEU_LADEN = Boolean(option('neu-laden'));

for (const konto of NUR_KONTEN) {
  if (konto !== 'ohne' && !KONTEN.has(konto)) {
    console.error(`Unbekanntes Konto "${konto}". Bekannt: ohne, ${[...KONTEN.keys()].join(', ')}`);
    process.exit(1);
  }
}
for (const breite of NUR_BREITEN) {
  if (!BREITEN.has(breite)) {
    console.error(`Breite ${breite} gibt es nicht. Bekannt: ${[...BREITEN.keys()].join(', ')}`);
    process.exit(1);
  }
}

// --- Hilfen ------------------------------------------------------------------
function heute() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
}

function pfadAufloesen(pfad) {
  return pfad.replaceAll('{heute}', heute());
}

function pfadname(adresse) {
  const name = new URL(adresse, BASIS).pathname.replace(/\/+$/, '');
  return name === '' ? '/' : name;
}

function routePasst(route) {
  if (NUR.length === 0) return true;
  return NUR.some(
    (teil) =>
      route.bereich.toLowerCase() === teil ||
      kurzname(route.bereich) === teil ||
      route.muster.toLowerCase().includes(teil) ||
      route.pfad.toLowerCase().includes(teil),
  );
}

function dateiname(route, konto, breite) {
  const teil = kurzname(route.muster.replace(/:/g, '')) || 'start';
  return `${kurzname(route.bereich)}--${teil}--${konto}--${breite}.png`;
}

function gitAngabe(...befehl) {
  try {
    return execFileSync('git', befehl, { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

async function json(datei) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner aus dem eigenen Aufruf (--ziel/--vergleich)
  return JSON.parse(await readFile(datei, 'utf8'));
}

async function schreiben(datei, inhalt) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner aus dem eigenen Aufruf (--ziel)
  await writeFile(datei, inhalt);
}

async function boegenSchreiben(ergebnis) {
  await schreiben(path.join(ZIEL, 'index.html'), kontaktbogenHtml(ergebnis));
  console.log(`Kontaktbogen: ${path.join(ZIEL, 'index.html')}`);
  if (VERGLEICH) {
    const vorher = await json(path.join(VERGLEICH, 'ergebnis.json'));
    const relativ = path.relative(ZIEL, VERGLEICH).split(path.sep).join('/') || '.';
    await schreiben(path.join(ZIEL, 'vergleich.html'), vergleichHtml(vorher, ergebnis, relativ));
    console.log(`Vergleich:    ${path.join(ZIEL, 'vergleich.html')}`);
  }
}

// --- Nur die Boegen neu schreiben --------------------------------------------
if (option('nur-bogen')) {
  const ergebnis = await json(path.join(ZIEL, 'ergebnis.json'));
  await boegenSchreiben(ergebnis);
  process.exit(0);
}

// --- Auftraege ---------------------------------------------------------------
const breiten = NUR_BREITEN.length > 0 ? NUR_BREITEN : [...BREITEN.keys()];
const gruppen = new Map(); // "konto|breite" -> { konto, breite, auftraege, aktiv }
let auftragsZahl = 0;
for (const route of ROUTEN.filter(routePasst)) {
  for (const konto of route.konten) {
    if (NUR_KONTEN.length > 0 && !NUR_KONTEN.includes(konto)) continue;
    for (const breite of breiten) {
      const schluessel = `${konto}|${breite}`;
      if (!gruppen.has(schluessel)) {
        gruppen.set(schluessel, { konto, breite, auftraege: [], aktiv: 0 });
      }
      gruppen
        .get(schluessel)
        .auftraege.push({ route, konto, breite, pfad: pfadAufloesen(route.pfad) });
      auftragsZahl += 1;
    }
  }
}

if (auftragsZahl === 0) {
  console.error('Keine Route passt zu dieser Auswahl.');
  console.error(`Bereiche: ${BEREICHE.join(', ')}`);
  process.exit(1);
}

try {
  const antwort = await fetch(BASIS + '/');
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
} catch (fehler) {
  console.error(`Die Anwendung antwortet unter ${BASIS} nicht (${String(fehler)}).`);
  console.error(ANMELDUNG_VORAUSSETZUNG);
  process.exit(1);
}

// eslint-disable-next-line security/detect-non-literal-fs-filename -- Ordner aus dem eigenen Aufruf (--ziel)
await mkdir(ZIEL, { recursive: true });
console.log(
  `${auftragsZahl} Bilder in ${gruppen.size} Gruppen, ${PARALLEL} parallel, gegen ${BASIS}`,
);
console.log(`Ziel: ${ZIEL}\n`);

// --- Aufnahme ----------------------------------------------------------------
const browser = await chromium.launch(browserOptionen());
const ergebnisse = [];
let erledigt = 0;
const beginn = Date.now();

/** Die Gruppe mit der meisten Arbeit je Kontext; eine laufende nur, wenn sich ein zweiter Kontext lohnt. */
function naechsteGruppe(bisher) {
  if (bisher && bisher.auftraege.length > 0) return bisher;
  let beste = null;
  let bester = -1;
  for (const gruppe of gruppen.values()) {
    const rest = gruppe.auftraege.length;
    if (rest === 0) continue;
    if (gruppe.aktiv > 0 && rest / gruppe.aktiv < 8) continue;
    const wert = rest / (gruppe.aktiv + 1);
    if (wert > bester) {
      bester = wert;
      beste = gruppe;
    }
  }
  return beste;
}

async function kontextOeffnen(gruppe) {
  const kontext = await browser.newContext({
    ...BREITEN.get(gruppe.breite),
    deviceScaleFactor: 1,
    locale: 'de-DE',
    timezoneId: ZONE,
    reducedMotion: 'reduce',
  });
  await kontext.addInitScript(startbildUeberspringen, STARTBILD_MERKER);
  const beobachtung = { aktuell: null, offen: 0, zuletzt: Date.now() };
  await lesewaechterAnbringen(kontext, (beschreibung) => {
    beobachtung.aktuell?.blockiert.add(beschreibung);
  });
  const seite = await kontext.newPage();
  // Offene Anfragen zaehlen - fuer die Netzruhe nach einem Wechsel innerhalb
  // der Anwendung, bei dem `goto` mit `networkidle` nicht hilft.
  const offen = (schritt) => () => {
    beobachtung.offen = Math.max(0, beobachtung.offen + schritt);
    beobachtung.zuletzt = Date.now();
  };
  seite.on('request', offen(1));
  seite.on('requestfinished', offen(-1));
  seite.on('requestfailed', offen(-1));
  seite.on('dialog', (dialog) => void dialog.accept().catch(() => undefined));
  seite.on('console', (nachricht) => {
    // „Failed to load resource" nennt die Datei nicht - die kommt genauer aus
    // dem response-Ereignis unten.
    if (nachricht.type() === 'error' && !nachricht.text().startsWith('Failed to load resource')) {
      beobachtung.aktuell?.konsole.push(nachricht.text());
    }
  });
  seite.on('pageerror', (fehler) => beobachtung.aktuell?.konsole.push(String(fehler)));
  seite.on('response', (antwort) => {
    // /favicon.ico fragt der Browser von sich aus an (wie scripts/screenshots.mjs).
    if (antwort.status() >= 400 && !antwort.url().endsWith('/favicon.ico')) {
      const url = new URL(antwort.url());
      beobachtung.aktuell?.anfragen.push(`${antwort.status()} ${url.pathname}`);
    }
  });
  seite.on('requestfailed', (anfrage) => {
    const grund = anfrage.failure()?.errorText ?? '';
    if (grund.includes('ERR_BLOCKED_BY_CLIENT') || grund.includes('ERR_ABORTED')) return;
    beobachtung.aktuell?.anfragen.push(`${grund} ${new URL(anfrage.url()).pathname}`);
  });
  if (gruppe.konto !== 'ohne') {
    beobachtung.aktuell = { blockiert: new Set(), konsole: [], anfragen: [] };
    await anmelden(seite, BASIS, gruppe.konto);
    beobachtung.aktuell = null;
  }
  return { gruppe, kontext, seite, beobachtung, neuLaden: true };
}

/** Wartet, bis 500 ms lang keine Anfrage offen war (hoechstens `grenze` ms). */
async function netzruhe(sitzung, grenze = 20_000) {
  const ende = Date.now() + grenze;
  await sitzung.seite.waitForTimeout(150);
  while (Date.now() < ende) {
    const { offen, zuletzt } = sitzung.beobachtung;
    if (offen === 0 && Date.now() - zuletzt >= 500) return true;
    await sitzung.seite.waitForTimeout(100);
  }
  return false;
}

/**
 * Oeffnet einen Pfad. Innerhalb eines Kontexts wechselt die Bildstrecke die
 * Seite wie die Anwendung selbst - ohne das Dokument neu zu laden, ueber den
 * Verlauf, auf den React Router hoert. Das ist um ein Vielfaches schneller als
 * ein Neuladen mit dem Entwicklungsserver. Neu geladen wird die erste Seite
 * eines Kontexts, jede Seite nach einem Fehler und mit `--neu-laden` jede.
 */
async function oeffnen(sitzung, pfad) {
  const { seite } = sitzung;
  if (sitzung.neuLaden || NEU_LADEN) {
    await seite.goto(BASIS + pfad, { waitUntil: 'networkidle', timeout: 30_000 });
    sitzung.neuLaden = false;
    return;
  }
  await seite.evaluate((ziel) => {
    /* eslint-disable no-undef -- laeuft im Browser */
    const idx = (window.history.state?.idx ?? 0) + 1;
    const key = Math.random().toString(36).slice(2, 10);
    window.history.pushState({ usr: null, key, idx }, '', ziel);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    window.scrollTo(0, 0);
    /* eslint-enable no-undef */
  }, pfad);
  if (!(await netzruhe(sitzung))) throw new Error('Zeitueberschreitung: keine Netzruhe nach 20 s');
}

/** Misst im Browser; laeuft dort, nicht in Node. */
/* eslint-disable no-undef -- document gibt es nur im Browser */
function messen() {
  const doc = document.documentElement;
  const sichtbar = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const haupt = document.querySelector('main') ?? document.body;
  const text = (haupt.innerText ?? '').replace(/\s+/g, ' ').trim();
  const zeile = (el) =>
    (el.innerText ?? '')
      .split('\n')
      .map((teil) => teil.trim())
      .find(Boolean)
      ?.slice(0, 160) ?? '';
  return {
    ueberbreit: doc.scrollWidth - doc.clientWidth,
    hoehe: doc.scrollHeight,
    textlaenge: text.length,
    medien: haupt.querySelectorAll('img, svg, canvas, video').length,
    fehler: [...document.querySelectorAll('[role="alert"]')]
      .filter((el) => sichtbar(el) && el.classList.contains('bg-danger-soft'))
      .map(zeile)
      .slice(0, 3),
    laedt: [...document.querySelectorAll('[role="status"]')]
      .filter((el) => sichtbar(el) && /…$/.test((el.innerText ?? '').trim()))
      .map(zeile)
      .slice(0, 3),
    anmeldemaske: [...document.querySelectorAll('summary')].some(
      (el) => (el.textContent ?? '').trim() === 'Testkonten',
    ),
    titel: zeile(document.querySelector('h1') ?? document.createElement('h1')),
  };
}
/* eslint-enable no-undef */

async function aufnehmen(sitzung, auftrag) {
  const { route, konto, breite, pfad } = auftrag;
  const datei = dateiname(route, konto, breite);
  const befunde = [];
  const hinweise = [];
  const beobachtung = { blockiert: new Set(), konsole: [], anfragen: [] };
  sitzung.beobachtung.aktuell = beobachtung;
  const start = Date.now();
  const { seite } = sitzung;
  let messung = null;
  try {
    try {
      await oeffnen(sitzung, pfad);
    } catch (fehler) {
      befunde.push({ art: 'aufnahme', text: `Laden: ${String(fehler).split('\n')[0]}` });
    }
    await startbildAbwarten(seite);
    // Ein Ladezustand darf noch kurz stehen, bevor er als Befund zaehlt.
    await seite
      .waitForFunction(
        () =>
          // eslint-disable-next-line no-undef -- laeuft im Browser
          ![...document.querySelectorAll('[role="status"]')].some((el) =>
            /…$/.test((el.textContent ?? '').trim()),
          ),
        null,
        { timeout: 4_000 },
      )
      .catch(() => undefined);
    await seite.waitForTimeout(250);
    messung = await seite.evaluate(messen);
    // Feste Leisten (Tableiste, Aktionsleiste) stuenden in einer Vollseite
    // mitten im Bild, an der Unterkante des ersten Bildschirms. Fuer die
    // Aufnahme waechst das Fenster deshalb auf die Seitenhoehe - so stehen sie
    // unten, wie nach dem Scrollen - und danach wieder zurueck.
    const fenster = BREITEN.get(breite).viewport;
    const hoehe = Math.min(messung.hoehe, 16_000);
    if (hoehe > fenster.height) {
      await seite.setViewportSize({ width: fenster.width, height: hoehe });
      await seite.waitForTimeout(200);
    }
    await seite.screenshot({ path: path.join(ZIEL, datei), fullPage: true });
    if (hoehe > fenster.height) await seite.setViewportSize(fenster);
  } catch (fehler) {
    befunde.push({ art: 'aufnahme', text: String(fehler).split('\n')[0] });
  }
  sitzung.beobachtung.aktuell = null;

  const ziel = pfadname(seite.url());
  const erwartet = pfadname(route.ziel ?? pfad);
  const erwartetLeer = Boolean(route.ohneDaten);
  const melden = (art, text, erwartbar = false) =>
    (erwartbar && erwartetLeer ? hinweise : befunde).push({ art, text });

  if (messung) {
    if (konto !== 'ohne' && messung.anmeldemaske) {
      befunde.push({ art: 'anmeldung', text: `statt ${erwartet}` });
    } else if (ziel !== erwartet) {
      befunde.push({ art: 'umleitung', text: `${ziel} statt ${erwartet}` });
    }
    if (messung.ueberbreit > 2)
      befunde.push({ art: 'querscroll', text: `${messung.ueberbreit} px zu breit` });
    for (const text of messung.fehler) melden('fehlerzustand', text, true);
    for (const text of messung.laedt) befunde.push({ art: 'laedt', text });
    if (messung.textlaenge < 40 && messung.medien === 0) {
      befunde.push({ art: 'leer', text: `${messung.textlaenge} Zeichen Inhalt` });
    }
  }
  for (const text of new Set(beobachtung.konsole)) melden('konsole', text.slice(0, 300), true);
  for (const text of new Set(beobachtung.anfragen)) melden('anfrage', text, true);
  for (const text of beobachtung.blockiert) befunde.push({ art: 'schreibversuch', text });
  if (route.ohneDaten) hinweise.unshift({ art: 'ohne Daten', text: route.ohneDaten });
  // Nach einem Fehler beginnt die naechste Seite mit einem frischen Dokument:
  // Ein abgestuerzter Baum soll nicht in das naechste Bild hineinreichen.
  if (
    befunde.some((b) => ['aufnahme', 'leer', 'konsole', 'anmeldung'].includes(b.art)) ||
    hinweise.some((h) => h.art === 'konsole')
  ) {
    sitzung.neuLaden = true;
  }

  const eintrag = {
    schluessel: `${route.muster}|${konto}|${breite}`,
    muster: route.muster,
    pfad,
    bereich: route.bereich,
    etikett: route.etikett,
    konto,
    breite,
    datei: messung ? datei : null,
    ziel,
    titel: messung?.titel ?? '',
    hoehe: messung?.hoehe ?? null,
    befunde,
    hinweise,
    dauerMs: Date.now() - start,
  };
  ergebnisse.push(eintrag);
  erledigt += 1;
  if (befunde.length > 0) {
    console.log(
      `[${erledigt}/${auftragsZahl}] ${konto} ${breite} ${pfad}\n` +
        befunde.map((b) => `    ${b.art}: ${b.text}`).join('\n'),
    );
  } else if (erledigt % 25 === 0) {
    console.log(`[${erledigt}/${auftragsZahl}] …`);
  }
}

async function arbeiter() {
  let sitzung = null;
  for (;;) {
    const gruppe = naechsteGruppe(sitzung?.gruppe);
    if (!gruppe) break;
    if (sitzung?.gruppe !== gruppe) {
      if (sitzung) {
        sitzung.gruppe.aktiv -= 1;
        await sitzung.kontext.close();
        sitzung = null;
      }
      gruppe.aktiv += 1;
      try {
        sitzung = await kontextOeffnen(gruppe);
      } catch (fehler) {
        gruppe.aktiv -= 1;
        // Ohne Anmeldung kein Bild: alle Auftraege der Gruppe als Befund.
        const grund = `Anmeldung als ${gruppe.konto} gescheitert: ${String(fehler).split('\n')[0]}`;
        console.error(`${grund}\n${ANMELDUNG_VORAUSSETZUNG}`);
        for (const auftrag of gruppe.auftraege.splice(0)) {
          erledigt += 1;
          ergebnisse.push({
            schluessel: `${auftrag.route.muster}|${auftrag.konto}|${auftrag.breite}`,
            muster: auftrag.route.muster,
            pfad: auftrag.pfad,
            bereich: auftrag.route.bereich,
            etikett: auftrag.route.etikett,
            konto: auftrag.konto,
            breite: auftrag.breite,
            datei: null,
            ziel: null,
            titel: '',
            hoehe: null,
            befunde: [{ art: 'aufnahme', text: grund }],
            hinweise: [],
            dauerMs: 0,
          });
        }
        continue;
      }
    }
    const auftrag = sitzung.gruppe.auftraege.shift();
    if (auftrag) await aufnehmen(sitzung, auftrag);
  }
  if (sitzung) {
    sitzung.gruppe.aktiv -= 1;
    await sitzung.kontext.close();
  }
}

await Promise.all(Array.from({ length: PARALLEL }, () => arbeiter()));
await browser.close();

// --- Ergebnis ----------------------------------------------------------------
const reihenfolge = new Map(ROUTEN.map((route, index) => [route.muster, index]));
const kontoReihe = ['ohne', ...KONTEN.keys()];
ergebnisse.sort(
  (a, b) =>
    (reihenfolge.get(a.muster) ?? 0) - (reihenfolge.get(b.muster) ?? 0) ||
    kontoReihe.indexOf(a.konto) - kontoReihe.indexOf(b.konto) ||
    a.breite - b.breite,
);
const nachArt = {};
for (const bild of ergebnisse) {
  for (const befund of bild.befunde) nachArt[befund.art] = (nachArt[befund.art] ?? 0) + 1;
}
const mitBefund = ergebnisse.filter((b) => b.befunde.length > 0);
const ergebnis = {
  version: 1,
  erstellt: new Date().toISOString(),
  basis: BASIS,
  commit: gitAngabe('rev-parse', '--short', 'HEAD'),
  branch: gitAngabe('rev-parse', '--abbrev-ref', 'HEAD'),
  dauerSekunden: Math.round((Date.now() - beginn) / 1000),
  breiten,
  auswahl: { nur: NUR, konten: NUR_KONTEN, breiten: NUR_BREITEN },
  zusammenfassung: {
    bilder: ergebnisse.length,
    mitBefund: mitBefund.length,
    befundeNachArt: nachArt,
  },
  bilder: ergebnisse,
};
await schreiben(path.join(ZIEL, 'ergebnis.json'), `${JSON.stringify(ergebnis, null, 2)}\n`);
await boegenSchreiben(ergebnis);

console.log(
  `\n${ergebnisse.length} Bilder in ${ergebnis.dauerSekunden} s, ${mitBefund.length} mit Befund` +
    (mitBefund.length > 0
      ? ` (${Object.entries(nachArt)
          .map(([art, zahl]) => `${art} ${zahl}`)
          .join(', ')})`
      : ''),
);
if (option('streng') && mitBefund.length > 0) process.exit(1);
