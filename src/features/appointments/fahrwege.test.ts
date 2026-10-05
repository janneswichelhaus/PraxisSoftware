import { describe, expect, it } from 'vitest';
import type { Tagesstopp } from '@/features/tours/tagesroute';
import { VERALTET_MINUTEN, fahrwegeAusRoute, veralteteWege, wegpunkte } from './fahrwege';

const ZONE = 'Europe/Berlin';
const START = { lat: 48.5, lon: 9.05 };

/** Ein Punkt der Tagesroute; 07:00 UTC ist 09:00 in Berlin (Sommerzeit). */
function punkt(id: string, um: string, lat: number | null): Tagesstopp {
  return {
    id,
    kind: 'therapy',
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: `2027-05-12T${um}:00.000Z`,
    ends_at: `2027-05-12T${um}:00.000Z`,
    lat,
    lon: lat === null ? null : 9.05,
    geocode_precision: lat === null ? null : 'address',
    position_source: 'visit',
  };
}

/** Abschnitte der Route in Minuten. */
function abschnitte(...minuten: number[]) {
  return minuten.map((m) => ({ durationSeconds: m * 60 }));
}

describe('Fahrwege im Kalender (UBK-005, ANN-235)', () => {
  it('legt vor jeden Besuch einen Block bis zu seinem Beginn, den ersten vom Startort', () => {
    const punkte = [punkt('b', '09:00', 48.52), punkt('a', '07:00', 48.51)];
    expect(wegpunkte(punkte, START)).toHaveLength(3);
    expect(fahrwegeAusRoute(punkte, START, abschnitte(12, 19.6), ZONE)).toEqual([
      { terminId: 'a', vonMinute: 9 * 60 - 12, bisMinute: 9 * 60, minuten: 12, meter: null },
      { terminId: 'b', vonMinute: 11 * 60 - 20, bisMinute: 11 * 60, minuten: 20, meter: null },
    ]);
  });

  it('zeichnet den Rueckweg nach dem letzten Besuch zur Garage oder Praxis (UBK-015)', () => {
    const punkte = [punkt('a', '07:00', 48.51), punkt('b', '09:00', 48.52)];
    const GARAGE = { lat: 48.49, lon: 9.04 };
    expect(wegpunkte(punkte, GARAGE, GARAGE)).toHaveLength(4);
    const mitStrecke = [10, 15, 18].map((m) => ({
      durationSeconds: m * 60,
      distanceMeters: m * 250,
    }));
    expect(fahrwegeAusRoute(punkte, GARAGE, mitStrecke, ZONE, GARAGE)).toEqual([
      { terminId: 'a', vonMinute: 9 * 60 - 10, bisMinute: 9 * 60, minuten: 10, meter: 2500 },
      { terminId: 'b', vonMinute: 11 * 60 - 15, bisMinute: 11 * 60, minuten: 15, meter: 3750 },
      // Vom Ende des letzten Besuchs an, nicht vor einem Beginn.
      {
        terminId: 'b',
        vonMinute: 11 * 60,
        bisMinute: 11 * 60 + 18,
        minuten: 18,
        meter: 4500,
        rueckweg: true,
      },
    ]);
  });

  it('zeichnet ohne Startort keinen ersten Weg - ungeprueft ist nicht kurz', () => {
    const punkte = [punkt('a', '07:00', 48.51), punkt('b', '09:00', 48.52)];
    expect(fahrwegeAusRoute(punkte, null, abschnitte(15), ZONE)).toEqual([
      { terminId: 'b', vonMinute: 11 * 60 - 15, bisMinute: 11 * 60, minuten: 15, meter: null },
    ]);
  });

  it('laesst Wege ohne Position, ohne Route und am selben Ort aus', () => {
    const ohnePosition = [punkt('a', '07:00', 48.51), punkt('b', '09:00', null)];
    expect(fahrwegeAusRoute(ohnePosition, null, abschnitte(), ZONE)).toEqual([]);
    const punkte = [punkt('a', '07:00', 48.51), punkt('b', '09:00', 48.52)];
    expect(fahrwegeAusRoute(punkte, null, null, ZONE)).toEqual([]);
    // Zwei Termine am selben Ort: dazwischen wird nicht gefahren.
    const gleich = [punkt('a', '07:00', 48.51), punkt('b', '09:00', 48.51)];
    expect(wegpunkte(gleich, null)).toHaveLength(1);
    expect(fahrwegeAusRoute(gleich, null, abschnitte(), ZONE)).toEqual([]);
  });

  it('legt vor einen Termin mit veralteter Anschrift einen Warnblock statt eines Wegs (ANN-236)', () => {
    const punkte = [
      punkt('a', '07:00', 48.51),
      { ...punkt('b', '09:00', null), address_outdated: true },
    ];
    expect(veralteteWege(punkte, ZONE)).toEqual([
      {
        terminId: 'b',
        vonMinute: 11 * 60 - VERALTET_MINUTEN,
        bisMinute: 11 * 60,
        minuten: 0,
        veraltet: true,
      },
    ]);
    // Ohne Position gibt es auch keinen Weg dorthin.
    expect(fahrwegeAusRoute(punkte, null, [], ZONE)).toEqual([]);
  });
});
