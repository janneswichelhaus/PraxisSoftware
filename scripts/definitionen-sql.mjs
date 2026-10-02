#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Die Definitionen der Fragebögen als Migration (ABN-014, BEF-101, ANN-219).
//
// Die Anwendung prüft Antworten gegen die Definitionsdateien unter
// src/features/assessments/definitionen/scores/ (Zod). Der Server prüft seit
// ABN-014 dasselbe - gegen dieselben Dateien, nicht gegen eine zweite Fassung
// von Hand: Dieses Skript erzeugt aus ihnen eine Migration, die jede Fassung
// (Kennung@Version) als Zeile in `public.questionnaire_definitions` einträgt,
// dazu die Kennungen der Körperbereiche (`app.questionnaire_body_regions`).
//
// Eine Fassung wird genau einmal eingetragen. Jede erzeugte Zeile trägt einen
// Marker mit der Prüfsumme der Datei; ändert sich eine schon eingetragene
// Fassung, ist das ein Fehler - geänderter Inhalt braucht eine neue Version
// (ANN-084, BEF-101 Punkt 4). Ältere Fassungen liegen unter
// `definitionen/scores/archiv/` und bleiben im Release.
//
// Aufruf:
//   pnpm definitionen:sql             # prüfen; Exit 1, wenn etwas fehlt
//   pnpm definitionen:sql --schreiben # fehlende Fassungen als neue Migration
//
// `scripts/definitionen-sql.test.mjs` hält fest, dass nichts fehlt; der
// Datenbanktest `questionnaire-definitions.test.ts` hält Tabelle und Dateien
// deckungsgleich.
// -----------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCORES = join(wurzel, 'src/features/assessments/definitionen/scores');
const MIGRATIONEN = join(wurzel, 'supabase/migrations');

const DEFINITION_MARKER =
  /^-- definition ([a-z][a-z0-9_]*)@(\d+\.\d+\.\d+) sha256:([0-9a-f]{64})$/gm;
const REGIONEN_MARKER = /^-- koerperbereiche sha256:([0-9a-f]{64})$/gm;

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Alle Fassungen: die aktuellen Dateien und das Archiv. */
export async function sammleDefinitionen(verzeichnis = SCORES) {
  const fassungen = [];
  for (const unter of ['', 'archiv']) {
    let namen;
    try {
      namen = await readdir(join(verzeichnis, unter));
    } catch {
      continue;
    }
    for (const name of namen.filter((n) => n.endsWith('.json')).sort()) {
      const roh = JSON.parse(await readFile(join(verzeichnis, unter, name), 'utf8'));
      const json = JSON.stringify(roh);
      fassungen.push({
        datei: join(unter, name),
        instrument: roh.meta.id,
        version: roh.meta.version,
        json,
        hash: sha256(json),
      });
    }
  }
  return fassungen;
}

/** Die Kennungen der Körperbereiche, aus derselben Datei wie die Oberfläche. */
export async function sammleKoerperbereiche() {
  // Ein fester Pfad: Node liest die TypeScript-Datei selbst (Typen werden
  // entfernt), Vitest übersetzt sie wie jede andere.
  const modul = await import('../src/features/assessments/koerperschema.ts');
  return modul.KOERPERBEREICHE.map((b) => b.id);
}

/** Was die Migrationen schon tragen: Fassungen mit Prüfsumme, Stand der Körperbereiche. */
export function vorhandenerStand(migrationstexte) {
  const fassungen = new Map();
  let regionen = null;
  for (const text of migrationstexte) {
    for (const [, id, version, hash] of text.matchAll(DEFINITION_MARKER)) {
      fassungen.set(`${id}@${version}`, hash);
    }
    for (const [, hash] of text.matchAll(REGIONEN_MARKER)) regionen = hash;
  }
  return { fassungen, regionen };
}

function sqlText(wert) {
  return `'${wert.replaceAll("'", "''")}'`;
}

/**
 * Der SQL-Text der fehlenden Fassungen, oder `null`, wenn nichts fehlt.
 * `fehler` nennt jede schon eingetragene Fassung, deren Datei sich geändert hat.
 */
export function fehlendeMigration(fassungen, koerperbereiche, stand) {
  const fehler = [];
  const zeilen = [];
  const gesehen = new Set();
  for (const f of fassungen) {
    const schluessel = `${f.instrument}@${f.version}`;
    if (gesehen.has(schluessel)) {
      fehler.push(`${f.datei}: Fassung ${schluessel} liegt doppelt vor.`);
      continue;
    }
    gesehen.add(schluessel);
    const eingetragen = stand.fassungen.get(schluessel);
    if (eingetragen === f.hash) continue;
    if (eingetragen !== undefined) {
      fehler.push(
        `${f.datei}: Fassung ${schluessel} ist schon eingetragen und hat sich geändert - geänderter Inhalt braucht eine neue Version (ANN-084).`,
      );
      continue;
    }
    zeilen.push(
      `-- definition ${schluessel} sha256:${f.hash}`,
      'insert into public.questionnaire_definitions (instrument_id, version, definition) values',
      `  (${sqlText(f.instrument)}, ${sqlText(f.version)}, ${sqlText(f.json)}::jsonb);`,
      '',
    );
  }
  const regionenHash = sha256(JSON.stringify(koerperbereiche));
  if (regionenHash !== stand.regionen) {
    zeilen.push(
      `-- koerperbereiche sha256:${regionenHash}`,
      'create or replace function app.questionnaire_body_regions()',
      'returns text[]',
      'language sql',
      'immutable',
      "set search_path = ''",
      'as $$',
      `  select array[${koerperbereiche.map(sqlText).join(', ')}]::text[]`,
      '$$;',
      '',
      "comment on function app.questionnaire_body_regions() is 'Kennungen der Koerperbereiche aus src/features/assessments/koerperschema.ts, erzeugt von scripts/definitionen-sql.mjs (ABN-014).';",
      '',
    );
  }
  if (zeilen.length === 0) return { sql: null, fehler };
  const kopf = [
    '-- =============================================================================',
    '-- Erzeugt von scripts/definitionen-sql.mjs - nicht von Hand aendern.',
    '-- Fassungen der Fragebogen-Definitionen fuer die Serverpruefung (ABN-014,',
    '-- BEF-101, ANN-219). Quelle: src/features/assessments/definitionen/scores/.',
    '-- =============================================================================',
    '',
  ];
  return { sql: [...kopf, ...zeilen].join('\n'), fehler };
}

/** Der nächste Zeitstempel: nach der jüngsten Migration und nicht vor jetzt. */
export function naechsterZeitstempel(dateinamen, jetzt = new Date()) {
  const zahl = (s) => Number(s);
  const juengste = dateinamen
    .map((n) => /^(\d{14})_/.exec(n)?.[1])
    .filter(Boolean)
    .map(zahl)
    .reduce((a, b) => Math.max(a, b), 0);
  const heute = zahl(jetzt.toISOString().replace(/\D/g, '').slice(0, 14));
  return String(Math.max(juengste + 100, heute));
}

export async function pruefen() {
  const dateinamen = (await readdir(MIGRATIONEN)).filter((n) => n.endsWith('.sql')).sort();
  const texte = await Promise.all(dateinamen.map((n) => readFile(join(MIGRATIONEN, n), 'utf8')));
  const ergebnis = fehlendeMigration(
    await sammleDefinitionen(),
    await sammleKoerperbereiche(),
    vorhandenerStand(texte),
  );
  return { ...ergebnis, dateinamen };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { sql, fehler, dateinamen } = await pruefen();
  if (fehler.length > 0) {
    console.error(fehler.join('\n'));
    process.exit(1);
  }
  if (sql === null) {
    console.log('Alle Fassungen der Fragebögen sind als Migration eingetragen.');
  } else if (process.argv.includes('--schreiben')) {
    const name = `${naechsterZeitstempel(dateinamen)}_questionnaire_definitions.sql`;
    await writeFile(join(MIGRATIONEN, name), sql);
    console.log(`Neue Migration: supabase/migrations/${name}`);
  } else {
    console.error(
      'Fassungen der Fragebögen fehlen in den Migrationen. `pnpm definitionen:sql --schreiben` erzeugt sie.',
    );
    process.exit(1);
  }
}
