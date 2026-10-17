import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Was diese Function nicht darf (BEF-181, ADR-019 Fassung 6 und Punkte 16
 * bis 18): keine Persistenz außer dem einen Eintrag am Antrag, kein Log,
 * keine fremde Adresse, kein Client-Paket, keine Tabelle. Geprüft über den
 * Quelltext wie bei `location-provider` und `patient-file-verify`.
 */

const DIRECTORY = join(import.meta.dirname, '.');

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /@supabase\/supabase-js|createClient/, reason: 'Client-Paket' },
  {
    pattern: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv|localStorage/,
    reason: 'Persistenz',
  },
  { pattern: /\bconsole\s*\./, reason: 'Log (ADR-011 Punkt 6)' },
  { pattern: /\/rest\/v1\/(?!rpc\/)/, reason: 'Tabellenzugriff' },
];

function sourceFiles(): string[] {
  return readdirSync(DIRECTORY)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(DIRECTORY, name));
}

function withoutComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sources(): string[] {
  return sourceFiles().map((path) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis, nicht aus einer Eingabe.
    withoutComments(readFileSync(path, 'utf8')),
  );
}

describe('Abschottung der Edge Function electricity-distance', () => {
  it('findet die Dateien der Function', () => {
    expect(sourceFiles().length).toBeGreaterThanOrEqual(4);
  });

  it.each(FORBIDDEN)('enthält kein $reason', ({ pattern }) => {
    expect(sources().filter((content) => pattern.test(content))).toEqual([]);
  });

  it('spricht nur mit der eigenen Instanz - keine feste Adresse', () => {
    const addresses = sources().flatMap((content) =>
      [...content.matchAll(/https?:\/\/[^\s'"`]+/g)].map((t) => t[0]),
    );
    expect(addresses).toEqual([]);
  });

  it('ruft genau zwei Wege der Datenbank: Wegpunkte lesen und die Summe eintragen', () => {
    const calls = sources().flatMap((content) =>
      [...content.matchAll(/'(electricity_[a-z_]+|record_[a-z_]+)'/g)].map((t) => t[1]),
    );
    expect([...new Set(calls)].sort()).toEqual([
      'electricity_tour_points',
      'record_electricity_tour_distance',
    ]);
  });
});
