import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  musterformular,
  praxisAnschrift,
  VERTRAGSFASSUNG,
  widerrufsbelehrung,
  type Praxisangaben,
} from './vertragstexte';

/**
 * Die Fassung der Vertragstexte steht an zwei Stellen: hier für die Seite und
 * in `app.training_contract_wording_version()` für den Server (ANN-288).
 * Weichen sie ab, wiese der Server jeden Vertrag ab – oder nähme einen zu
 * einer geänderten Belehrung unter der alten Fassung an.
 */

const MIGRATIONEN = join(import.meta.dirname, '../../../supabase/migrations');

function letzteDefinition(funktion: string): string {
  const kopf = `function ${funktion}(`;
  const rumpfe = readdirSync(MIGRATIONEN)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((name) => {
      const sql = readFileSync(join(MIGRATIONEN, name), 'utf8');
      const klein = sql.toLowerCase();
      // Nur eine Definition zählt, kein `revoke … on function`.
      const i = Math.max(
        klein.lastIndexOf(`create ${kopf}`),
        klein.lastIndexOf(`create or replace ${kopf}`),
      );
      if (i === -1) return [];
      const rest = sql.slice(i);
      return [rest.slice(0, rest.indexOf('$$;') + 3)];
    });
  const rumpf = rumpfe.at(-1);
  if (!rumpf) throw new Error(`${funktion} nicht gefunden`);
  return rumpf;
}

const PRAXIS: Praxisangaben = {
  name: 'Test Praxis Tuebingen',
  street: 'Praxisweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tübingen',
  phone: null,
  email: 'praxis@praxis.invalid',
};

describe('Vertragstexte (ANN-288)', () => {
  it('die Fassung der Seite ist die des Servers', () => {
    expect(letzteDefinition('app.training_contract_wording_version')).toContain(
      `'${VERTRAGSFASSUNG}'::text`,
    );
  });

  it('setzt Name und Anschrift der Praxis ein, ohne leere Teile', () => {
    expect(praxisAnschrift(PRAXIS)).toBe(
      'Test Praxis Tuebingen, Praxisweg 1, 72070 Tübingen, E-Mail praxis@praxis.invalid',
    );
    expect(widerrufsbelehrung(PRAXIS)[0]!.absaetze.join(' ')).toContain('Praxisweg 1');
    expect(musterformular(PRAXIS)[1]).toBe(`An ${praxisAnschrift(PRAXIS)}:`);
  });

  it('nennt Frist, Widerrufsfunktion und Wertersatz', () => {
    const text = widerrufsbelehrung(PRAXIS)
      .flatMap((a) => a.absaetze)
      .join(' ');
    expect(text).toMatch(/binnen vierzehn Tagen/);
    expect(text).toMatch(/„Vertrag widerrufen“/);
    expect(text).toMatch(/während der Widerrufsfrist beginnen/);
  });
});
