// -----------------------------------------------------------------------------
// Open Food Facts → Auszug Deutschland für den Katalog (ERN-004, ANN-659).
//
// Quelle: der CSV-Export von Open Food Facts
// (https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz),
// Open Database License 1.0 (ODbL), Quellenangabe in der Anwendung
// (public.food_sources). Der Betrieb lädt die Datei herunter und ruft dieses
// Skript - die Anwendung fragt Open Food Facts nie (ADR-027 Punkt 8).
//
// Übernommen wird ein Produkt, wenn es in Deutschland verkauft wird
// (countries_tags enthält en:germany), einen Barcode mit 8 bis 14 Ziffern, einen
// Namen und Energie, Eiweiß, Fett und Kohlenhydrate je 100 g bzw. 100 ml hat.
// Fehlt die Energie in kcal, wird sie aus kJ gerechnet (÷ 4,184). Ein Produkt
// mit Menge in ml, cl oder l gilt je 100 ml. Die Portion der Verpackung wird
// übernommen, wenn sie eine Menge trägt.
//
// Aufruf: node scripts/lebensmittel/off.mjs <products.csv.gz|csv> > off.ndjson
// -----------------------------------------------------------------------------
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { runden, zeilenfehler } from './gemeinsam.mjs';

/** Eine Zahl aus der CSV oder null. */
function zahl(text) {
  if (text === undefined || text === null || text.trim() === '') return null;
  const n = Number(text.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Die erste Marke, ohne Leerraum. */
function marke(brands) {
  const erste = (brands ?? '').split(',')[0]?.trim() ?? '';
  return erste === '' ? null : erste.slice(0, 200);
}

/**
 * Eine Zeile der CSV als Katalogzeile - oder der Grund, warum nicht.
 *
 * @param {Record<string, string>} p Spalten nach Kopf
 * @returns {{ zeile?: object, grund?: string }}
 */
export function offZeile(p) {
  const laender = (p.countries_tags ?? '').split(',').map((l) => l.trim());
  if (!laender.includes('en:germany')) return { grund: 'nicht in Deutschland' };
  const name = (p.product_name_de || p.product_name || '').replace(/\s+/g, ' ').trim();
  let kcal = zahl(p['energy-kcal_100g']);
  if (kcal === null) {
    const kj = zahl(p.energy_100g) ?? zahl(p['energy-kj_100g']);
    kcal = kj === null ? null : kj / 4.184;
  }
  const zeile = {
    source_code: (p.code ?? '').trim(),
    name: name.slice(0, 300),
    brand: marke(p.brands),
    energy_kcal: runden(kcal, 1),
    protein_g: runden(zahl(p.proteins_100g), 2),
    fat_g: runden(zahl(p.fat_100g), 2),
    carbohydrate_g: runden(zahl(p.carbohydrates_100g), 2),
    sugar_g: runden(zahl(p.sugars_100g), 2),
    fibre_g: runden(zahl(p.fiber_100g), 2),
    saturated_fat_g: runden(zahl(p['saturated-fat_100g']), 2),
    salt_g: runden(zahl(p.salt_100g), 3),
  };
  const grund = zeilenfehler(zeile, 'off');
  if (grund) return { grund };
  zeile.base_unit = /\d\s*(ml|cl|l)\b/i.test(p.quantity ?? '') ? 'ml' : 'g';
  const menge = zahl(p.serving_quantity);
  const angabe = (p.serving_size ?? '').trim();
  zeile.portions =
    menge !== null && menge > 0 && menge <= 5000
      ? [
          {
            label: (angabe ? `1 Portion (${angabe})` : '1 Portion').slice(0, 60),
            amount: runden(menge, 1),
          },
        ]
      : [];
  return { zeile };
}

/**
 * Liest die CSV zeilenweise und ruft `ausgabe` je übernommenem Produkt; ein
 * Barcode zählt nur einmal.
 */
export async function offLesen(eingabe, ausgabe) {
  const zeilen = createInterface({ input: eingabe, crlfDelay: Infinity });
  let kopf = null;
  const gesehen = new Set();
  const uebersprungen = new Map();
  const bericht = { gelesen: 0, uebernommen: 0 };
  for await (const zeile of zeilen) {
    const felder = zeile.split('\t');
    if (!kopf) {
      kopf = felder;
      continue;
    }
    bericht.gelesen++;
    const p = Object.fromEntries(kopf.map((k, i) => [k, felder.at(i)]));
    const { zeile: z, grund } = offZeile(p);
    const fehler = grund ?? (gesehen.has(z.source_code) ? 'doppelt' : null);
    if (fehler) {
      uebersprungen.set(fehler, (uebersprungen.get(fehler) ?? 0) + 1);
      continue;
    }
    gesehen.add(z.source_code);
    bericht.uebernommen++;
    ausgabe(z);
  }
  return { ...bericht, uebersprungen: Object.fromEntries(uebersprungen) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const datei = process.argv[2];
  if (!datei) {
    process.stderr.write('Aufruf: node scripts/lebensmittel/off.mjs <csv.gz|csv> > off.ndjson\n');
    process.exit(2);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Datei aus dem eigenen Aufruf
  const roh = createReadStream(datei);
  const eingabe = datei.endsWith('.gz') ? roh.pipe(createGunzip()) : roh;
  const bericht = await offLesen(eingabe, (z) => process.stdout.write(JSON.stringify(z) + '\n'));
  process.stderr.write(`OFF: ${JSON.stringify(bericht)}\n`);
}
