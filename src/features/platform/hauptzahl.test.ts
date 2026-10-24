import { describe, expect, it } from 'vitest';
import { hauptzahl } from './hauptzahl';
import type { DosisZumAblesen } from './Uebungsinhalt';

const DOSIS: DosisZumAblesen = {
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  duration_seconds: null,
  load: 'Rucksack 3 kg',
  tempo: null,
  rest_seconds: 60,
  double_progression: false,
  hold_seconds: null,
  per_side: false,
  times_per_day: null,
};

/** Die Hauptzahl der Bühne (Handoff 2026-10-24, Abschnitt 3): Zahl und Einheit, nichts gerechnet. */
describe('hauptzahl', () => {
  it.each([
    [{}, '8 bis 12', 'Wiederholungen je Durchgang'],
    [{ reps_min: 10, reps_max: 10 }, '10', 'Wiederholungen je Durchgang'],
    [{ reps_min: 1, reps_max: 1 }, '1', 'Wiederholung je Durchgang'],
    [{ per_side: true }, '8 bis 12', 'Wiederholungen je Seite'],
    [{ reps_min: null, reps_max: null, duration_seconds: 30 }, '30', 'Sekunden je Durchgang'],
    [{ reps_min: null, reps_max: null, duration_seconds: 1 }, '1', 'Sekunde je Durchgang'],
    [
      { reps_min: null, reps_max: null, duration_seconds: 45, per_side: true },
      '45',
      'Sekunden je Seite',
    ],
  ] as const)('macht aus %o „%s“ und „%s“', (teil, zahl, einheit) => {
    expect(hauptzahl({ ...DOSIS, ...teil })).toEqual({ zahl, einheit });
  });
});
