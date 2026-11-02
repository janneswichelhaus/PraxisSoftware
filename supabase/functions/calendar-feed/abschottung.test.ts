import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Was die Function des Kalender-Abos nicht darf (ANN-839, ADR-011): Sie ruft mit ihrem eigenen
// Schlüssel genau `calendar_feed`, schreibt nichts in die Konsole und speichert nichts.

const VERZEICHNIS = join(import.meta.dirname, '.');

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /@supabase\/supabase-js|createClient/, grund: 'Datenbankclient' },
  { muster: /\bconsole\s*\./, grund: 'Betriebslog' },
  { muster: /\/rest\/v1\/(?!rpc\/calendar_feed\b)|\/auth\/v1|\/storage\/v1/, grund: 'andere Pfade' },
  { muster: /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL/, grund: 'Vorgaben der Laufzeit' },
  { muster: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv/, grund: 'Persistenz' },
  { muster: /localStorage|sessionStorage|caches\./, grund: 'Persistenz' },
];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(VERZEICHNIS, name));
}

function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Abschottung des Kalender-Abos', () => {
  const dateien = quelldateien();

  it('findet die Dateien überhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(5);
  });

  it.each(VERBOTEN)('enthält keinen Zugriff: $grund', ({ muster }) => {
    const treffer = dateien.filter((pfad) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis.
      muster.test(ohneKommentare(readFileSync(pfad, 'utf8'))),
    );
    expect(treffer).toEqual([]);
  });

  it('nennt keine feste fremde Adresse', () => {
    const fremde = dateien.flatMap((pfad) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis.
      const quelltext = ohneKommentare(readFileSync(pfad, 'utf8'));
      return [...quelltext.matchAll(/https?:\/\/([^/'"`\s$]+)/g)].map((treffer) => treffer[1]!);
    });
    expect(fremde).toEqual([]);
  });

  it('würde einen fremden Datenbankpfad tatsächlich finden', () => {
    const pfade = VERBOTEN.find((v) => v.grund === 'andere Pfade')!.muster;
    expect(pfade.test("'/rest/v1/appointments'")).toBe(true);
    expect(pfade.test("'/rest/v1/rpc/calendar_feeds'")).toBe(true);
    expect(pfade.test("'/rest/v1/rpc/calendar_feed'")).toBe(false);
  });
});
