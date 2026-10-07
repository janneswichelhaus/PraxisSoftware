import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EINWILLIGUNGSFASSUNG, EINWILLIGUNGSTEXTE, PLATTFORM_ZWECKE } from './einwilligungen';

/**
 * Die Fassung der Einwilligungstexte steht an zwei Stellen: hier für die
 * Seite und in `app.platform_consent_wording_version()` für den Server
 * (ANN-262). Weichen sie ab, wiese der Server jede Einwilligung ab - oder,
 * schlimmer, nähme eine zu einem geänderten Text unter der alten Fassung an.
 */

const MIGRATIONEN = join(import.meta.dirname, '../../../supabase/migrations');

/** Der Rumpf der jüngsten `create [or replace] function` über alle Migrationen. */
function letzteDefinition(funktion: string): string {
  const kopf = `function ${funktion}(`;
  const rumpfe = readdirSync(MIGRATIONEN)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((name) => {
      const sql = readFileSync(join(MIGRATIONEN, name), 'utf8');
      const klein = sql.toLowerCase();
      const funde: string[] = [];
      for (let i = klein.indexOf(kopf); i !== -1; i = klein.indexOf(kopf, i + 1)) {
        const davor = klein.slice(Math.max(0, i - 20), i).trimEnd();
        if (!davor.endsWith('create') && !davor.endsWith('or replace')) continue;
        const rest = sql.slice(i);
        funde.push(rest.slice(0, rest.indexOf('$$;') + 3));
      }
      return funde;
    });
  const rumpf = rumpfe.at(-1);
  if (!rumpf) throw new Error(`${funktion} nicht gefunden`);
  return rumpf;
}

describe('Einwilligungstexte (ANN-262)', () => {
  it('die Fassung der Seite ist die des Servers', () => {
    const sql = letzteDefinition('app.platform_consent_wording_version');
    expect(sql).toContain(`'${EINWILLIGUNGSFASSUNG}'::text`);
  });

  it('die Zwecke je Bereich sind die des Servers', () => {
    const sql = letzteDefinition('app.platform_consent_purposes');
    // POR-016: Behandlung. Training kommt mit POR-017.
    for (const [bereich, zwecke] of Object.entries(PLATTFORM_ZWECKE).filter(
      ([b]) => b === 'treatment',
    )) {
      const liste = zwecke.map((z) => `'${z}'`).join(', ');
      expect(sql).toContain(`when '${bereich}' then array[${liste}]`);
    }
  });

  it('jeder Zweck hat Titel und Text in kurzen Sätzen', () => {
    for (const text of Object.values(EINWILLIGUNGSTEXTE)) {
      expect(text.titel.length).toBeGreaterThan(0);
      for (const satz of text.text.split(/(?<=\.)\s/)) {
        expect(satz.split(' ').length).toBeLessThanOrEqual(30);
      }
    }
  });
});
