#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Der Übungskatalog im Seed (UEB-012, ANN-382).
//
// Die Anwendung trägt den Katalog unter src/features/exercises/katalog/; die
// Praxis übernimmt ihn per Knopf (`public.import_exercise_catalog`, owner).
// Damit die Seed-Praxis - lokal, in der CI und in der Test-Umgebung - den
// ganzen Katalog schon hat, erzeugt dieses Skript aus denselben Dateien einen
// Abschnitt in supabase/seed.sql: einen Aufruf von
// `app.import_exercise_catalog_for` mit festen Kennungen. Geprüft wird dabei
// am Server genauso wie beim Knopf; ein Namenskonflikt bricht den Seed ab.
//
// Aufruf:
//   pnpm katalog:sql             # prüfen; Exit 1, wenn der Abschnitt veraltet ist
//   pnpm katalog:sql --schreiben # den Abschnitt neu schreiben
//
// `scripts/katalog-sql.test.mjs` hält fest, dass der Abschnitt aktuell ist.
// Die Eintragsdateien importieren nur Typen; Node liest sie ohne Bundler.
// -----------------------------------------------------------------------------
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const EINTRAEGE = join(wurzel, 'src/features/exercises/katalog/eintraege');
const SEED = join(wurzel, 'supabase/seed.sql');

/** Organisation und owner der Seed-Praxis (Jannes Test). */
export const SEED_ORGANISATION = '22222222-2222-4222-8222-000000000001';
export const SEED_OWNER = '11111111-1111-4111-8111-000000000001';

/** Die Reihenfolge der Gruppen wie in src/features/exercises/katalog/typen.ts. */
export const GRUPPEN = [
  'bt',
  'hw',
  'bw',
  'lw',
  'sh',
  'eh',
  'hu',
  'kn',
  'fu',
  'gg',
  'af',
  'at',
  'ne',
  'au',
];

export const ANFANG = '-- katalog:anfang';
export const ENDE = '-- katalog:ende';
const TAG = '$katalog$';

/** Alle Einträge des Katalogs in der Reihenfolge der Gruppen. */
export async function sammleKatalog(verzeichnis = EINTRAEGE) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfad unter dem Repository, fest im Quelltext.
  const dateien = new Set(await readdir(verzeichnis));
  const eintraege = [];
  for (const gruppe of GRUPPEN) {
    const datei = `${gruppe}.ts`;
    if (!dateien.has(datei)) throw new Error(`Gruppendatei fehlt: ${datei}`);
    const modul = await import(pathToFileURL(join(verzeichnis, datei)).href);
    eintraege.push(...modul.EINTRAEGE);
  }
  return eintraege;
}

/** Der Abschnitt für supabase/seed.sql - je Eintrag eine Zeile JSON. */
export function abschnitt(eintraege) {
  const zeilen = eintraege.map((e) => JSON.stringify(e));
  if (zeilen.some((z) => z.includes(TAG))) throw new Error(`Ein Eintrag enthält ${TAG}.`);
  return [
    `${ANFANG} - erzeugt von scripts/katalog-sql.mjs (pnpm katalog:sql --schreiben), nicht von Hand aendern.`,
    '-- Der mitgelieferte Uebungskatalog (UEB-012, ANN-382), uebernommen wie per Knopf, mit',
    '-- festen Kennungen. Ein Namenskonflikt mit den Uebungen oben bricht den Seed ab.',
    'do $seed$',
    'declare',
    '  v_ergebnis jsonb;',
    'begin',
    '  v_ergebnis := app.import_exercise_catalog_for(',
    `    '${SEED_ORGANISATION}',`,
    `    '${SEED_OWNER}',`,
    `    ${TAG}[`,
    zeilen.join(',\n'),
    `]${TAG}::jsonb,`,
    '    true);',
    "  if jsonb_array_length(v_ergebnis -> 'conflicts') > 0 then",
    "    raise exception 'Katalog im Seed: Namenskonflikt %', v_ergebnis -> 'conflicts';",
    '  end if;',
    'end',
    '$seed$;',
    ENDE,
  ].join('\n');
}

/** Der Seed mit neuem Abschnitt; ohne Markierungen ein Fehler. */
export function ersetze(seed, neu) {
  const von = seed.indexOf(ANFANG);
  const bis = seed.indexOf(ENDE);
  if (von < 0 || bis < von) {
    throw new Error(`supabase/seed.sql hat keinen Abschnitt ${ANFANG} … ${ENDE}.`);
  }
  return seed.slice(0, von) + neu + seed.slice(bis + ENDE.length);
}

export async function pruefen() {
  const seed = await readFile(SEED, 'utf8');
  const neu = ersetze(seed, abschnitt(await sammleKatalog()));
  return { aktuell: neu === seed, neu };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { aktuell, neu } = await pruefen();
  if (aktuell) {
    console.log('Der Übungskatalog im Seed ist aktuell.');
  } else if (process.argv.includes('--schreiben')) {
    await writeFile(SEED, neu);
    console.log('supabase/seed.sql: Übungskatalog neu geschrieben.');
  } else {
    console.error(
      'Der Übungskatalog im Seed ist veraltet. `pnpm katalog:sql --schreiben` schreibt ihn neu.',
    );
    process.exit(1);
  }
}
