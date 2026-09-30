import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Was der Zugangsdienst nicht darf (POR-003, ADR-023 Punkt 9, ADR-011).
 *
 * Er spricht nur mit der eigenen Instanz und dem Versandweg, schreibt nichts
 * auf die Konsole und hat keinen eigenen Datenbankclient: Jeder Zugriff geht
 * über die zwei Funktionen des Zugangsdienstes bzw. die Sitzung der
 * einladenden Person. Geprüft über den Quelltext, wie beim Kartendienst.
 */

const VERZEICHNIS = join(import.meta.dirname, '.');

const VERBOTEN: { muster: RegExp; grund: string }[] = [
  { muster: /@supabase\/supabase-js|createClient/, grund: 'Datenbankclient' },
  { muster: /\bconsole\s*\./, grund: 'Betriebslog' },
  {
    muster:
      /\/rest\/v1\/(?!rpc\/(platform_invitation_lookup|redeem_platform_invitation|platform_invitation_failed|platform_invitation_mail)\b)/,
    grund: 'andere Datenbankpfade',
  },
  { muster: /Deno\.writeTextFile|Deno\.writeFile|Deno\.openKv/, grund: 'Persistenz' },
  { muster: /localStorage|sessionStorage/, grund: 'Persistenz' },
];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(VERZEICHNIS, name));
}

function ohneKommentare(inhalt: string): string {
  return inhalt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Abschottung des Zugangsdienstes', () => {
  const dateien = quelldateien();

  it('findet die Dateien ueberhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(5);
  });

  it.each(VERBOTEN)('enthaelt keinen Zugriff: $grund', ({ muster }) => {
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
    // Eigene Instanz, Anwendung und Postfach kommen aus der Umgebung.
    expect(fremde).toEqual([]);
  });

  it('wuerde einen fremden Datenbankpfad tatsaechlich finden', () => {
    const muster = VERBOTEN.find((v) => v.grund === 'andere Datenbankpfade')!.muster;
    expect(muster.test("'/rest/v1/patients'")).toBe(true);
    expect(muster.test("'/rest/v1/rpc/redeem_platform_invitation'")).toBe(false);
  });
});
