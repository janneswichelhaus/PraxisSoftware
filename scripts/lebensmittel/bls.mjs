// -----------------------------------------------------------------------------
// Bundeslebensmittelschlüssel 4.0 → Zeilen des Katalogs (ERN-004, ANN-659).
//
// Quelle: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS),
// Version 4.0 – Deutsche Nährstoffdatenbank. DOI 10.25826/Data20251217-134202-0,
// Lizenz CC BY 4.0 (https://www.blsdb.de, geprüft 2026-10-19; ANN-657).
//
// Erwartet wird das ZIP der Seite oder die XLSX daraus
// (BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx): ein Blatt, Kopfzeile mit
// "BLS Code", "Lebensmittelbezeichnung", "Food name" und je Nährstoff drei
// Spalten - Wert ("ENERCC Energie (Kilokalorien) [kcal/100g]"), Herkunft und
// Referenz. Gelesen werden nur die Wertspalten der Codes unten; passt eine
// Einheit nicht, bricht der Lauf ab, statt falsche Zahlen zu laden.
//
// Änderungen gegenüber der Quelle (CC BY verlangt den Hinweis; er steht in
// public.food_sources.attribution): Auswahl der Nährstoffe, Salz aus Natrium
// (× 2,5), Spurenwerte als 0, Portionen aus portionen.json.
//
// Aufruf: node scripts/lebensmittel/bls.mjs <zip|xlsx> > bls.ndjson
// Bericht (gelesen, übernommen, übersprungen mit Grund) auf stderr.
// -----------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { erstesBlatt, zipEintraege } from './xlsx.mjs';
import { portionenFuer, runden, zeilenfehler } from './gemeinsam.mjs';

/** Code → Feld, erwartete Einheit, Umrechnung, Stellen. */
export const NAEHRSTOFFE = new Map([
  ['ENERCC', { feld: 'energy_kcal', einheit: 'kcal', faktor: 1, stellen: 1 }],
  ['PROT625', { feld: 'protein_g', einheit: 'g', faktor: 1, stellen: 2 }],
  ['FAT', { feld: 'fat_g', einheit: 'g', faktor: 1, stellen: 2 }],
  ['CHO', { feld: 'carbohydrate_g', einheit: 'g', faktor: 1, stellen: 2 }],
  ['SUGAR', { feld: 'sugar_g', einheit: 'g', faktor: 1, stellen: 2 }],
  ['FIBT', { feld: 'fibre_g', einheit: 'g', faktor: 1, stellen: 2 }],
  ['FASAT', { feld: 'saturated_fat_g', einheit: 'g', faktor: 1, stellen: 2 }],
  // Natrium in mg → Salz in g: × 2,5 / 1000.
  ['NA', { feld: 'salt_g', einheit: 'mg', faktor: 0.0025, stellen: 3 }],
]);

/**
 * Code und Einheit aus einem Wertkopf wie
 * "ENERCC Energie (Kilokalorien) [kcal/100g]" - sonst null.
 */
export function wertkopf(titel) {
  const leer = titel.indexOf(' ');
  const auf = titel.lastIndexOf('[');
  if (leer < 1 || auf < leer || !titel.endsWith(']')) return null;
  const einheit = titel.slice(auf + 1, -1).replace(/\s/g, '');
  if (!einheit.endsWith('/100g')) return null;
  return { code: titel.slice(0, leer), einheit: einheit.slice(0, -'/100g'.length) };
}
/** Spuren und Werte unter der Nachweisgrenze zählen als 0, "-" als unbekannt. */
const NULLWERTE = new Set(['TR', '<LOD', '<LOQ', '<LOD or <LOQ']);

/** Eine Zelle als Zahl: Zahl, Text mit Komma, Spurenzeichen - sonst null. */
export function zahl(zelle) {
  if (typeof zelle === 'number') return Number.isFinite(zelle) ? zelle : null;
  if (typeof zelle !== 'string') return null;
  const t = zelle.trim();
  if (NULLWERTE.has(t)) return 0;
  const n = Number(t.replace(',', '.'));
  return t === '' || !Number.isFinite(n) ? null : n;
}

/**
 * Wandelt die Zeilen des Blatts in Katalogzeilen.
 *
 * @param {(string | number | null)[][]} blatt
 * @returns {{ zeilen: object[], uebersprungen: Record<string, number>, gelesen: number }}
 */
export function blsZeilen(blatt) {
  const kopfIndex = blatt.findIndex((z) => z.some((c) => c === 'BLS Code'));
  if (kopfIndex < 0) throw new Error('Keine Kopfzeile mit "BLS Code" - keine Datei des BLS 4.0?');
  const kopf = blatt.at(kopfIndex).map((c) => (typeof c === 'string' ? c.trim() : ''));
  const codeSpalte = kopf.indexOf('BLS Code');
  const nameSpalte = kopf.indexOf('Lebensmittelbezeichnung');
  if (nameSpalte < 0) throw new Error('Spalte "Lebensmittelbezeichnung" fehlt.');

  const spalten = new Map();
  kopf.forEach((titel, i) => {
    const k = wertkopf(titel);
    const naehrstoff = k && NAEHRSTOFFE.get(k.code);
    if (!naehrstoff) return;
    if (k.einheit !== naehrstoff.einheit) {
      throw new Error(`Einheit von ${k.code} ist ${k.einheit}, erwartet ${naehrstoff.einheit}.`);
    }
    spalten.set(k.code, i);
  });
  for (const code of ['ENERCC', 'PROT625', 'FAT', 'CHO']) {
    if (!spalten.has(code)) throw new Error(`Spalte ${code} fehlt.`);
  }

  const zeilen = [];
  const uebersprungen = new Map();
  let gelesen = 0;
  for (const z of blatt.slice(kopfIndex + 1)) {
    const zellen = new Map(z.entries());
    const rohCode = zellen.get(codeSpalte);
    const code = typeof rohCode === 'string' ? rohCode.trim() : null;
    if (!code) continue;
    gelesen++;
    const rohName = zellen.get(nameSpalte);
    const name = typeof rohName === 'string' ? rohName.trim() : '';
    const werte = [...NAEHRSTOFFE].map(([c, n]) => {
      const roh = spalten.has(c) ? zahl(zellen.get(spalten.get(c))) : null;
      return [n.feld, roh === null ? null : runden(roh * n.faktor, n.stellen)];
    });
    const zeile = { source_code: code, name, ...Object.fromEntries(werte) };
    const grund = zeilenfehler(zeile, 'bls');
    if (grund) {
      uebersprungen.set(grund, (uebersprungen.get(grund) ?? 0) + 1);
      continue;
    }
    zeilen.push({ ...zeile, base_unit: 'g', portions: portionenFuer(name) });
  }
  return { zeilen, uebersprungen: Object.fromEntries(uebersprungen), gelesen };
}

/** Die Datentabelle aus dem ZIP der Seite oder die XLSX selbst. */
export function blsBlatt(datei) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Datei aus dem eigenen Aufruf
  const inhalt = readFileSync(datei);
  if (datei.toLowerCase().endsWith('.xlsx')) return erstesBlatt(inhalt);
  const eintraege = zipEintraege(inhalt);
  const name = [...eintraege.keys()].find((k) => /Daten.*\.xlsx$/i.test(k));
  if (!name) throw new Error('Im ZIP liegt keine Datei *Daten*.xlsx.');
  return erstesBlatt(eintraege.get(name));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const datei = process.argv[2];
  if (!datei) {
    process.stderr.write('Aufruf: node scripts/lebensmittel/bls.mjs <zip|xlsx> > bls.ndjson\n');
    process.exit(2);
  }
  const { zeilen, uebersprungen, gelesen } = blsZeilen(blsBlatt(datei));
  for (const z of zeilen) process.stdout.write(JSON.stringify(z) + '\n');
  process.stderr.write(
    `BLS: ${gelesen} gelesen, ${zeilen.length} übernommen, übersprungen: ${JSON.stringify(uebersprungen)}\n`,
  );
}
