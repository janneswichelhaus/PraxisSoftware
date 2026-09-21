import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Was diese Function **nicht** darf (MAP-003a, Akzeptanzkriterium 4 und 5).
 *
 * Sie berechnet eine Route und vergisst sie: kein Datenbankzugriff, kein
 * Schreiben, kein Zwischenspeicher (ADR-019 Punkt 16). Und sie spricht mit
 * genau zwei Adressen — dem Kartendienst und dem eigenen Anmeldedienst.
 *
 * Geprüft wird über den Quelltext und nicht über das Verhalten: Ein
 * Datenbankaufruf in einer Ecke, die kein Test durchläuft, bliebe sonst
 * unbemerkt. Dasselbe Verfahren wie in `src/features/preview/trennung.test.ts`.
 */

const VERZEICHNIS = join(import.meta.dirname, '.');

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /@supabase\/supabase-js/, grund: 'Datenbankclient' },
  { muster: /createClient/, grund: 'Datenbankclient' },
  { muster: /\.rpc\s*\(/, grund: 'Serverfunktion' },
  { muster: /\bfrom\s*\(\s*'/, grund: 'Tabellenzugriff' },
  { muster: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv/, grund: 'Persistenz' },
  { muster: /localStorage|sessionStorage/, grund: 'Persistenz' },
];

/**
 * Die beiden Adressen, die vorkommen duerfen.
 *
 * `api.myptv.com` ist der Kartendienst; die eigene Instanz steht als
 * Platzhalter `supabaseUrl` im Quelltext und hat deshalb hier keinen Host.
 * Jede weitere Adresse waere ein dritter Empfaenger - und den gibt es in
 * diesem Datenweg nicht (ADR-019 Punkt 6).
 */
const ERLAUBTE_HOSTS = ['api.myptv.com'];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(VERZEICHNIS, name));
}

function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Abschottung der Edge Function', () => {
  const dateien = quelldateien();

  it('findet die Dateien der Function ueberhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(6);
  });

  it.each(VERBOTEN)('enthaelt keinen $grund ($muster)', ({ muster }) => {
    const treffer = dateien.filter((pfad) =>
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis, nicht aus einer Eingabe.
      muster.test(ohneKommentare(readFileSync(pfad, 'utf8'))),
    );
    expect(treffer).toEqual([]);
  });

  it('spricht mit keiner Adresse ausser dem Kartendienst', () => {
    const fremde = dateien.flatMap((pfad) => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade aus dem eigenen Verzeichnis, nicht aus einer Eingabe.
      const quelltext = ohneKommentare(readFileSync(pfad, 'utf8'));
      return [...quelltext.matchAll(/https?:\/\/([^/'"`\s$]+)/g)]
        .map((treffer) => treffer[1]!)
        .filter((host) => !ERLAUBTE_HOSTS.includes(host));
    });

    expect(fremde).toEqual([]);
  });

  it('wuerde einen Datenbankzugriff tatsaechlich finden', () => {
    // Gegenprobe: Sonst prueft der Test nur, dass Kommentare weggeschnitten
    // werden, und nicht, dass die Muster ueberhaupt greifen.
    const beispiel = ohneKommentare('const c = createClient(url, key); // createClient');
    expect(VERBOTEN.some(({ muster }) => muster.test(beispiel))).toBe(true);
    expect(ohneKommentare('// localStorage')).not.toMatch(/localStorage/);
  });
});
