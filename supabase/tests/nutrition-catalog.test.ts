import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Die Ernährungsberatung in der Preisliste (ERN-003, ADR-027 Punkt 15,
 * ADR-009 Punkte 15 und 16, ANN-622): eine eigene Positionsart, je Bereich
 * eine Position, ohne Heilmittel; das Steuerkennzeichen trägt der Posten.
 */

const { users } = SEED;
const ENTWURF = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
const SCHREIBEN = 'select public.write_service_catalog_items($1::uuid, $2::jsonb) as anzahl';

function position(werte: Record<string, unknown>) {
  return {
    code: 'ERN',
    label: 'Ernährungsberatung (Sitzung)',
    item_kind: 'nutrition_counselling',
    unit_price_cents: 7500,
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    service_area: 'therapy',
    ...werte,
  };
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

describe('Ernährungsberatung in der Preisliste (ERN-003)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('steht im Seed je Bereich, steuerpflichtig zum Regelsatz', async () => {
    const { rows } = await asPostgres<{ service_area: string; tax: string }>(
      `select service_area, tax_treatment || ' ' || tax_rate_permille as tax
         from public.service_catalog_items
        where item_kind = 'nutrition_counselling' and catalog_version_id <> $1
        order by service_area`,
      [ENTWURF],
    );
    expect(rows).toEqual([
      { service_area: 'therapy', tax: 'taxable 190' },
      { service_area: 'training', tax: 'taxable 190' },
    ]);
  });

  it('owner legt sie in beiden Bereichen an; ohne Heilmittel; im Training nie steuerfrei', async () => {
    const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, SCHREIBEN, [
      ENTWURF,
      JSON.stringify([position({}), position({ code: 'ERN-T', service_area: 'training' })]),
    ]);
    expect(rows[0]!.anzahl).toBe(2);
    expect(
      await fehler(
        asUser(users.ownerTherapist, SCHREIBEN, [
          ENTWURF,
          JSON.stringify([position({ remedy: 'Krankengymnastik' })]),
        ]),
      ),
    ).toBe('23514');
    expect(
      await fehler(
        asUser(users.ownerTherapist, SCHREIBEN, [
          ENTWURF,
          JSON.stringify([
            position({
              service_area: 'training',
              tax_treatment: 'exempt_healthcare',
              tax_rate_permille: 0,
            }),
          ]),
        ]),
      ),
    ).toBe('23514');
    // Das Kennzeichen ist voreingestellt, nicht erzwungen (ADR-027 Punkt 15):
    // In der Behandlung entscheidet die Steuerberatung (G13).
    await asUserCommitted(users.ownerTherapist, SCHREIBEN, [
      ENTWURF,
      JSON.stringify([position({ tax_treatment: 'exempt_healthcare', tax_rate_permille: 0 })]),
    ]);
    // Die Preisliste schreibt weiter allein owner.
    expect(
      await fehler(asUser(users.office, SCHREIBEN, [ENTWURF, JSON.stringify([position({})])])),
    ).toBe('42501');
  });
});
