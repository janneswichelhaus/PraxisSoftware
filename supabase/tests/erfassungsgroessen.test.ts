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
      role: string;
    }>(
      `select parameter_key, cadence, min_value, max_value, role
       from app.tracking_parameters() order by cadence desc, sort_order`,
    );
    expect(rows).toEqual(
      ERFASSUNGSGROESSEN.map((g) => ({
        parameter_key: g.key,
        cadence: g.takt,
        min_value: g.min,
        max_value: g.max,
        role: g.rolle === 'kontext' ? 'context' : 'question',
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

  it('kennt Bewegungssicherheit und den differenzierten Schmerz (TRK-004, ANN-353, ANN-354)', async () => {
    const pruefe = async (key: string, takt: string, wert: number) => {
      const { rows } = await asPostgres<{ ok: boolean }>(
        'select app.tracking_value_valid($1, $2, $3) as ok',
        [key, takt, wert],
      );
      return rows[0]!.ok;
    };
    expect(await pruefe('session_confidence', 'session', 10)).toBe(true);
    expect(await pruefe('movement_confidence', 'checkin', 0)).toBe(true);
    for (const key of ['pain_after_load', 'pain_night', 'pain_morning']) {
      expect(await pruefe(key, 'checkin', 10)).toBe(true);
      expect(await pruefe(key, 'checkin', 11)).toBe(false);
    }
    expect(await pruefe('pain_recovery_hours', 'checkin', 72)).toBe(true);
    expect(await pruefe('pain_recovery_hours', 'checkin', 73)).toBe(false);
    // Eine Auswahl: 1 bis 5, nicht 0 (ANN-354).
    expect(await pruefe('pain_quality', 'checkin', 1)).toBe(true);
    expect(await pruefe('pain_quality', 'checkin', 5)).toBe(true);
    expect(await pruefe('pain_quality', 'checkin', 0)).toBe(false);
    expect(await pruefe('pain_quality', 'checkin', 6)).toBe(false);
  });

  it('kennt Schlafdauer und Bedarfsmedikation als Fragen (ALT-001, ANN-368)', async () => {
    const pruefe = async (key: string, wert: number) => {
      const { rows } = await asPostgres<{ ok: boolean }>(
        "select app.tracking_value_valid($1, 'checkin', $2) as ok",
        [key, wert],
      );
      return rows[0]!.ok;
    };
    expect(await pruefe('sleep_hours', 0)).toBe(true);
    expect(await pruefe('sleep_hours', 16)).toBe(true);
    expect(await pruefe('sleep_hours', 17)).toBe(false);
    expect(await pruefe('painkiller_days_7d', 7)).toBe(true);
    expect(await pruefe('painkiller_days_7d', 8)).toBe(false);
    expect(await pruefe('painkiller_days_7d', -1)).toBe(false);
    const { rows } = await asPostgres<{ parameter_key: string; role: string }>(
      `select parameter_key, role from app.tracking_parameters()
       where parameter_key in ('sleep_hours', 'painkiller_days_7d') order by parameter_key`,
    );
    expect(rows).toEqual([
      { parameter_key: 'painkiller_days_7d', role: 'question' },
      { parameter_key: 'sleep_hours', role: 'question' },
    ]);
  });
});
