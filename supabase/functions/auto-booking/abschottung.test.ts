import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Was die Function nicht darf (ANN-865, ADR-011, ADR-019 Punkt 16): nichts speichern, nichts loggen, kein
// Datenbankclient, kein Admin-Schlüssel; die Datenbank nur in `datenbank.ts` und nur über die beiden
// eigenen Funktionen; der Kartendienst nur über den Adapter von `location-provider`.

const VERZEICHNIS = join(import.meta.dirname, '.');

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /@supabase\/supabase-js|createClient/, grund: 'Datenbankclient' },
  { muster: /\.rpc\s*\(/, grund: 'Serverfunktion über einen Client' },
  { muster: /\bfrom\s*\(\s*'/, grund: 'Tabellenzugriff' },
  { muster: /\/storage\/v1\//, grund: 'Ablage' },
  { muster: /\/rest\/v1\/(?!rpc\/\$\{funktion\})/, grund: 'andere Datenbankpfade' },
  { muster: /service_role|SERVICE_ROLE|ADMIN_KEY|SERVICE_KEY/, grund: 'Admin-Schlüssel' },
  {
    muster: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv|Deno\.makeTemp|caches\./,
    grund: 'Persistenz',
  },
  { muster: /localStorage|sessionStorage|indexedDB/, grund: 'Persistenz' },
  { muster: /api\.myptv\.com|\bfetch\s*\(/, grund: 'Anbieter am Adapter vorbei' },
  { muster: /\bconsole\s*\./, grund: 'Betriebslog' },
];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(VERZEICHNIS, name));
}

function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lies(pfad: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis, nicht aus einer Eingabe.
  return ohneKommentare(readFileSync(pfad, 'utf8'));
}

describe('Abschottung der automatischen Buchung', () => {
  const dateien = quelldateien();

  it('findet die Dateien der Function überhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(6);
  });

  it.each(VERBOTEN)('enthält keinen Zugriff: $grund', ({ muster }) => {
    expect(dateien.filter((pfad) => muster.test(lies(pfad)))).toEqual([]);
  });

  it('nennt keine feste Adresse', () => {
    const adressen = dateien.flatMap((pfad) =>
      [...lies(pfad).matchAll(/https?:\/\/([^/'"`\s$]+)/g)].map((treffer) => treffer[1]!),
    );
    expect(adressen).toEqual([]);
  });

  it('fragt die Datenbank nur in datenbank.ts und nur über die beiden eigenen Funktionen', () => {
    const mitPfad = dateien.filter((pfad) => /\/rest\/v1\//.test(lies(pfad)));
    expect(mitPfad.map((pfad) => pfad.split('/').pop())).toEqual(['datenbank.ts']);
    // Jeder Name einer Serverfunktion in der Datei: Verb, Unterstrich, Rest.
    const namen = [
      ...lies(join(VERZEICHNIS, 'datenbank.ts')).matchAll(
        /'((?:plan|book|create|cancel|update|delete|find|list|record|set|get)_[a-z_]+)'/g,
      ),
    ].map((t) => t[1]!);
    expect([...new Set(namen)].sort()).toEqual(['book_next_appointment', 'plan_auto_booking']);
  });

  it('würde einen fremden Datenbankpfad tatsächlich finden', () => {
    const pfade = VERBOTEN.find((v) => v.grund === 'andere Datenbankpfade')!.muster;
    expect(pfade.test("'/rest/v1/appointments'")).toBe(true);
    expect(pfade.test("'/rest/v1/rpc/create_appointment'")).toBe(true);
    expect(pfade.test('`${adresse}/rest/v1/rpc/${funktion}`')).toBe(false);
  });
});
