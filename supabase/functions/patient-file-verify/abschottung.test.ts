import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Was diese Function nicht darf (ABN-025, ADR-017 Punkte 50 und 52).
 *
 * Sie liest ein Objekt und schreibt ein Ergebnis - kein Hochladen, kein
 * Überschreiben, kein Löschen am Objekt, keine Persistenz, keine fremde
 * Adresse, und das Log trägt nie Bytes, Namen oder Objektschlüssel. Geprüft
 * über den Quelltext wie bei `location-provider`.
 */

const VERZEICHNIS = join(import.meta.dirname, '.');

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /@supabase\/supabase-js|createClient/, grund: 'Client-Paket' },
  { muster: /method:\s*'(PUT|DELETE|PATCH)'/, grund: 'Schreiben am Objekt' },
  { muster: /\/storage\/v1\/object\/(?!\$\{encodeURIComponent)/, grund: 'anderer Speicherweg' },
  { muster: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv/, grund: 'Persistenz' },
  {
    muster: /object_key\s*[,}]?\s*\.\.\.|console\.log\([^)]*object_key/,
    grund: 'Schluessel im Log',
  },
];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(VERZEICHNIS, name));
}

function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Abschottung der Edge Function patient-file-verify', () => {
  const dateien = quelldateien();

  it('findet die Dateien der Function', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(5);
  });

  it.each(VERBOTEN)('enthaelt kein $grund', ({ muster }) => {
    const treffer = dateien.filter((pfad) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis, nicht aus einer Eingabe.
      muster.test(ohneKommentare(readFileSync(pfad, 'utf8'))),
    );
    expect(treffer).toEqual([]);
  });

  it('spricht nur mit der eigenen Instanz - keine feste Adresse', () => {
    const adressen = dateien.flatMap((pfad) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis, nicht aus einer Eingabe.
      [...ohneKommentare(readFileSync(pfad, 'utf8')).matchAll(/https?:\/\/[^\s'"`]+/g)].map(
        (t) => t[0],
      ),
    );
    expect(adressen).toEqual([]);
  });

  it('protokolliert nur Kennung, Klasse und Dauer', () => {
    const typen = readFileSync(join(VERZEICHNIS, 'typen.ts'), 'utf8');
    const eintrag = typen.slice(typen.indexOf('interface Protokolleintrag'));
    const felder = [...eintrag.slice(0, eintrag.indexOf('\n}')).matchAll(/readonly (\w+)/g)].map(
      (t) => t[1],
    );
    expect(felder).toEqual(['dateiId', 'klasse', 'dauerMs']);
  });
});
