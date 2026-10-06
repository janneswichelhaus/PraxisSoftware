import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Der Plattformcode ist ein eigenes Feature (ADR-023 Punkt 26).
 *
 * Er spricht nur Plattformprojektionen an und importiert keine Datenzugriffe
 * der Praxisfeatures. Gemeinsam sind Bausteine (`@/components`), Hilfen
 * (`@/lib`), die Anmeldung, die für alle Konten gleich ist (Punkt 17), und
 * `marke/`. Geprüft über den Quelltext wie `src/features/preview/trennung.test.ts`:
 * Ein Import in einer Ecke, die kein Test durchläuft, bliebe sonst unbemerkt.
 */

const VERZEICHNIS = join(import.meta.dirname, '.');

/** Was von außerhalb des Features kommen darf. Ein neuer Eintrag ist Teil des Reviews. */
const ERLAUBT: readonly RegExp[] = [
  /^react$/,
  /^react-router-dom$/,
  /^zod$/,
  /^@tanstack\/react-query$/,
  /^@\/components\//,
  /^@\/lib\//,
  /^@\/app\/Vollseite$/,
  // Anmeldung und Sitzung gelten für Praxis- und Plattformkonten gleich (Punkt 17).
  /^@\/features\/auth\/(fokus|fremdeSitzung|sessionContext)$/,
  // Die Kennwortregel (ANN-027) - eine Regel, keine Praxisdaten.
  /^@\/features\/account\/(api|kennwortFehler)$/,
  /^\.\//,
];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(VERZEICHNIS, name));
}

function importe(pfad: string): string[] {
  const quelltext = readFileSync(pfad, 'utf8');
  return [...quelltext.matchAll(/from\s+'([^']+)'/g)].map((treffer) => treffer[1]!);
}

describe('Trennung des Plattformcodes (ADR-023 Punkt 26)', () => {
  const dateien = quelldateien();

  it('findet die Dateien ueberhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(4);
  });

  it('importiert nichts aus den Praxisfeatures', () => {
    const fremd = dateien.flatMap((pfad) =>
      importe(pfad)
        .filter((ziel) => !ERLAUBT.some((muster) => muster.test(ziel)))
        .map((ziel) => `${pfad.slice(VERZEICHNIS.length + 1)}: ${ziel}`),
    );
    expect(fremd).toEqual([]);
  });

  it('ruft nur Plattformprojektionen und den Zugangsdienst auf', () => {
    const aufrufe = dateien.flatMap((pfad) => {
      const quelltext = readFileSync(pfad, 'utf8');
      return [
        ...[...quelltext.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((t) => `rpc:${t[1]!}`),
        ...[...quelltext.matchAll(/\.from\(\s*'([^']+)'/g)].map((t) => `tabelle:${t[1]!}`),
        ...[...quelltext.matchAll(/functions\.invoke[^(]*\(\s*'([^']+)'/g)].map(
          (t) => `function:${t[1]!}`,
        ),
      ];
    });
    // POR-007: „Wer für mich Zugang hat" und das Beenden einer Begleitung -
    // beide prüfen den Zugang über app.platform_access_allows.
    expect([...new Set(aufrufe)].sort()).toEqual([
      'function:platform-access',
      'rpc:end_platform_companion',
      // POR-009: die eigenen Wünsche, einen Termin wünschen, zurückziehen.
      'rpc:platform_appointment_requests',
      // POR-008: die eigenen Termine.
      'rpc:platform_appointments',
      'rpc:platform_context',
      'rpc:platform_representatives',
      'rpc:request_platform_appointment',
      // POR-010: Termin ändern oder absagen als Wunsch.
      'rpc:request_platform_appointment_change',
      'rpc:withdraw_platform_appointment_request',
    ]);
  });

  it('wuerde einen Import aus einem Praxisfeature tatsaechlich finden', () => {
    expect(ERLAUBT.some((muster) => muster.test('@/features/patients/api'))).toBe(false);
    expect(ERLAUBT.some((muster) => muster.test('@/features/session/useCurrentUser'))).toBe(false);
  });
});
