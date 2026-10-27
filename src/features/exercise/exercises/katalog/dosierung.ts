import type { Dosis } from '@/features/exercise/exercise-plans/dosierung';
import type { Dosierung } from './typen';

/**
 * Die Standarddosierung des Katalogs in der Form einer Planposition
 * (ANN-384). Vorbelegt wird damit nur, was für alle gleich ist - nie aus
 * Angaben einer Person (ADR-006 Punkt 10).
 */
export function alsDosis(d: Dosierung): Dosis {
  const [von, bis] =
    d.wiederholungen === undefined
      ? [null, null]
      : typeof d.wiederholungen === 'number'
        ? [d.wiederholungen, d.wiederholungen]
        : d.wiederholungen;
  return {
    sets: d.saetze ?? 1,
    reps_min: von,
    reps_max: bis,
    duration_seconds: d.dauer_s ?? null,
    load: null,
    tempo: null,
    rest_seconds: null,
    double_progression: false,
    hold_seconds: d.halten_s ?? null,
    per_side: d.je_seite ?? false,
    times_per_day: d.taeglich ?? null,
  };
}
