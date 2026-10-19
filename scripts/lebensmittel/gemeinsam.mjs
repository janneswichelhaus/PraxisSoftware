// -----------------------------------------------------------------------------
// Gemeinsames der Umwandler (ERN-004): Suchschlüssel, Prüfung, Portionen.
//
// Die Prüfung spiegelt die Constraints von public.food_catalog, damit eine
// fehlerhafte Zeile der Quelle übersprungen und gezählt wird, statt den
// ganzen Stapel im Import abzubrechen. Verbindlich bleibt die Datenbank.
// -----------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const UMLAUTE = new Map(
  [...'äöüàáâãåèéêëìíîïòóôõùúûçñ'].map((z, i) => [z, 'aouaaaaaeeeeiiiioooouuucn'.charAt(i)]),
);

/** Wie app.food_search_key in der Datenbank (Migration ERN-004). */
export function suchschluessel(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[äöüàáâãåèéêëìíîïòóôõùúûçñ]/g, (z) => UMLAUTE.get(z))
    .replace(/ß/g, 'ss')
    .replace(/([aou])e/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const REGELN = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'portionen.json'), 'utf8'),
).regeln.map((r) => ({
  // eslint-disable-next-line security/detect-non-literal-regexp -- Muster aus portionen.json im Repository, keine Eingabe
  muster: new RegExp(r.muster),
  portionen: r.portionen,
}));

/** Die Startportionen für einen allgemeinen Namen, sonst keine. */
export function portionenFuer(name) {
  const schluessel = suchschluessel(name);
  return REGELN.find((r) => r.muster.test(schluessel))?.portionen ?? [];
}

const ZWINGEND = ['energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g'];
const FREIWILLIG = ['sugar_g', 'fibre_g', 'saturated_fat_g', 'salt_g'];

/** Auf höchstens `stellen` Nachkommastellen, wie die Spalten sie halten. */
export function runden(wert, stellen) {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return null;
  const f = 10 ** stellen;
  return Math.round(wert * f) / f;
}

/**
 * Prüft eine umgewandelte Zeile gegen die Regeln des Katalogs.
 *
 * @returns {string | null} der Grund, warum sie nicht passt, sonst null
 */
export function zeilenfehler(zeile, quelle) {
  const werte = new Map(Object.entries(zeile));
  if (quelle === 'bls' && !/^[A-Z][0-9]{6}$/.test(zeile.source_code ?? '')) return 'Schlüssel';
  if (quelle === 'off' && !/^[0-9]{8,14}$/.test(zeile.source_code ?? '')) return 'Barcode';
  const name = (zeile.name ?? '').trim();
  if (name.length < 1 || name.length > 300) return 'Name';
  if (zeile.brand !== undefined && zeile.brand !== null) {
    if (quelle !== 'off') return 'Marke';
    if (zeile.brand.trim().length < 1 || zeile.brand.trim().length > 200) return 'Marke';
  }
  for (const feld of ZWINGEND) {
    const w = werte.get(feld);
    if (typeof w !== 'number' || !Number.isFinite(w)) return `${feld} fehlt`;
  }
  if (zeile.energy_kcal < 0 || zeile.energy_kcal > 950) return 'Energie';
  for (const feld of [...ZWINGEND.slice(1), ...FREIWILLIG]) {
    const w = werte.get(feld);
    if (w !== null && w !== undefined && (w < 0 || w > 100)) return feld;
  }
  if (zeile.protein_g + zeile.fat_g + zeile.carbohydrate_g > 105) return 'Summe der Makros';
  return null;
}
