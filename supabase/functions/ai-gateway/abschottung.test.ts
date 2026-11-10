import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Was der Gateway nicht darf (ADR-005, ADR-011): nichts speichern, kein Datenbankclient, kein
// Admin-Schlüssel, keine feste fremde Adresse. Die Datenbank fragt er nur über die genannten
// Prüffunktionen, mit dem Token der Person; geprüft am Quelltext wie beim Kartendienst.

/** Die Prüffunktionen der Datenbank, die der Gateway fragen darf - jede antwortet nur Ja oder Nein. */
const PRUEFFUNKTIONEN = [
  'check_dictation_access',
  'check_note_arrangement_access',
  'check_answer_wording_access',
  'check_history_excerpt_access',
  'check_prescription_scan_access',
];

const VERZEICHNIS = join(import.meta.dirname, '.');

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /@supabase\/supabase-js|createClient/, grund: 'Datenbankclient' },
  { muster: /\.rpc\s*\(/, grund: 'Serverfunktion über einen Client' },
  { muster: /\bfrom\s*\(\s*'/, grund: 'Tabellenzugriff' },
  { muster: /\/storage\/v1\//, grund: 'Ablage' },
  {
    // eslint-disable-next-line security/detect-non-literal-regexp -- feste Liste dieser Datei, keine Eingabe.
    muster: new RegExp(`/rest/v1/(?!rpc/(?:${PRUEFFUNKTIONEN.join('|')})\\b)`),
    grund: 'andere Datenbankpfade',
  },
  { muster: /service_role|SERVICE_ROLE|ADMIN_KEY/, grund: 'Admin-Schlüssel' },
  {
    muster: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv|Deno\.makeTemp|caches\./,
    grund: 'Persistenz',
  },
  { muster: /localStorage|sessionStorage|indexedDB/, grund: 'Persistenz' },
  { muster: /\bconsole\s*\./, grund: 'Betriebslog ausserhalb der erklärten Ausgänge' },
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

describe('Abschottung des AI Gateways', () => {
  const dateien = quelldateien();

  it('findet die Dateien der Function überhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(8);
  });

  it.each(VERBOTEN)('enthält keinen Zugriff: $grund', ({ muster }) => {
    expect(dateien.filter((pfad) => muster.test(lies(pfad)))).toEqual([]);
  });

  it('nennt keine feste Adresse', () => {
    const adressen = dateien.flatMap((pfad) =>
      [...lies(pfad).matchAll(/https?:\/\/([^/'"`\s$]+)/g)].map((treffer) => treffer[1]!),
    );
    // Die eigene Instanz kommt aus der Umgebung (SUPABASE_URL).
    expect(adressen).toEqual([]);
  });

  it('fragt die Datenbank nur an einer Stelle', () => {
    const mitPfad = dateien.filter((pfad) => /\/rest\/v1\//.test(lies(pfad)));
    expect(mitPfad.map((pfad) => pfad.split('/').pop())).toEqual(['berechtigung.ts']);
  });

  it('nennt jede Prüffunktion der Liste und keine weitere', () => {
    const genannt = [
      ...lies(join(VERZEICHNIS, 'berechtigung.ts')).matchAll(/\/rest\/v1\/rpc\/(\w+)/g),
    ].map((treffer) => treffer[1]!);
    expect(genannt.sort()).toEqual([...PRUEFFUNKTIONEN].sort());
  });

  it('würde einen fremden Datenbankpfad und eine Ablage tatsächlich finden', () => {
    const pfade = VERBOTEN.find((v) => v.grund === 'andere Datenbankpfade')!.muster;
    expect(pfade.test("'/rest/v1/treatment_notes'")).toBe(true);
    expect(pfade.test("'/rest/v1/rpc/create_treatment_note'")).toBe(true);
    expect(pfade.test('`${adresse}/rest/v1/rpc/check_dictation_access`')).toBe(false);
    expect(pfade.test("'/rest/v1/rpc/check_note_arrangement_access'")).toBe(false);
    // Ein ähnlicher Name ist keine Prüffunktion der Liste.
    expect(pfade.test("'/rest/v1/rpc/check_note_arrangement_access_all'")).toBe(true);
    expect(pfade.test('`${adresse}/rest/v1/rpc/${name}`')).toBe(true);
    expect(ohneKommentare('// localStorage')).not.toMatch(/localStorage/);
  });
});
