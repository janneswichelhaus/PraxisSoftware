import { beforeAll, describe, expect, it } from 'vitest';
import { ERFASSUNGSGROESSEN } from '@/lib/erfassungsgroessen';
import { asPostgres, resetDatabase } from './helpers/db';

/**
 * Der Katalog der Erfassungsgrößen (TRK-001, ANN-348) hat zwei Hälften:
 * Schlüssel, Takt und Bereich in `app.tracking_parameters()`, Frage und
 * Kurzname in `src/lib/erfassungsgroessen.ts`. Eine Größe, die nur auf einer
 * Seite steht, wäre entweder unbeschriftet oder nicht speicherbar.
 */
describe('Erfassungsgrößen (TRK-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('Datenbank und Oberfläche führen dieselben Größen mit denselben Bereichen', async () => {
    const { rows } = await asPostgres<{
      parameter_key: string;
      cadence: string;
      min_value: number;
      max_value: number;
    }>(
      `select parameter_key, cadence, min_value, max_value
       from app.tracking_parameters() order by cadence desc, sort_order`,
    );
    expect(rows).toEqual(
      ERFASSUNGSGROESSEN.map((g) => ({
        parameter_key: g.key,
        cadence: g.takt,
        min_value: g.min,
        max_value: g.max,
      })),
    );
  });

  it('nimmt nur ganze Werte im Bereich der Größe und ihres Takts', async () => {
    const pruefe = async (key: string, takt: string, wert: number) => {
      const { rows } = await asPostgres<{ ok: boolean }>(
        'select app.tracking_value_valid($1, $2, $3) as ok',
        [key, takt, wert],
      );
      return rows[0]!.ok;
    };
    expect(await pruefe('session_pain', 'session', 0)).toBe(true);
    expect(await pruefe('session_pain', 'session', 10)).toBe(true);
    expect(await pruefe('session_pain', 'session', 11)).toBe(false);
    expect(await pruefe('session_pain', 'session', -1)).toBe(false);
    // Richtige Größe, falscher Takt.
    expect(await pruefe('session_pain', 'checkin', 3)).toBe(false);
    expect(await pruefe('morning_stiffness_minutes', 'checkin', 240)).toBe(true);
    expect(await pruefe('unbekannt', 'checkin', 1)).toBe(false);
  });
});
