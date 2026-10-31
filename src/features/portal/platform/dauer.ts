import type { Dosis } from '@/features/exercise/exercises/plans/dosierung';

/**
 * Wie lange eine Einheit etwa dauert (Handoff 2026-10-24, Abschnitt 0,
 * Frage 1; ANN-704): aus der Dosierung geschätzt, nirgends gespeichert - eine
 * reine Anzeige („3 Übungen · etwa 10 Minuten“), kein Feld der Fachperson.
 *
 * Je Übung: Durchgänge × (Wiederholungen bis × 4 s oder die Dauer, mal 2 bei
 * „je Seite“) + (Durchgänge − 1) × Pause + 30 s Vorbereitung. Die Summe auf
 * volle 5 Minuten gerundet, mindestens 5. Fehlen einer Übung Wiederholungen
 * und Dauer, gibt es keine Schätzung - lieber keine Angabe als eine falsche.
 * Das Halten je Wiederholung zählt nicht mit.
 */
export function dauerDerEinheit(
  uebungen: readonly Pick<
    Dosis,
    'sets' | 'reps_min' | 'reps_max' | 'duration_seconds' | 'rest_seconds' | 'per_side'
  >[],
): number | null {
  if (uebungen.length === 0) return null;
  let sekunden = 0;
  for (const u of uebungen) {
    const wiederholungen = u.reps_max ?? u.reps_min;
    const jeDurchgang =
      wiederholungen !== null && wiederholungen > 0
        ? wiederholungen * SEKUNDEN_JE_WIEDERHOLUNG
        : u.duration_seconds;
    if (jeDurchgang === null || jeDurchgang <= 0) return null;
    sekunden +=
      u.sets * jeDurchgang * (u.per_side ? 2 : 1) +
      Math.max(0, u.sets - 1) * (u.rest_seconds ?? 0) +
      VORBEREITUNG_SEKUNDEN;
  }
  return Math.max(RASTER_MINUTEN, Math.round(sekunden / 60 / RASTER_MINUTEN) * RASTER_MINUTEN);
}

/**
 * „etwa 10 Minuten“ - nie genauer, als die Schätzung ist. Zahl und Einheit
 * bleiben in einer Zeile.
 */
export function dauerText(minuten: number): string {
  return `etwa ${minuten}\u00a0Minuten`;
}

const SEKUNDEN_JE_WIEDERHOLUNG = 4;
const VORBEREITUNG_SEKUNDEN = 30;
const RASTER_MINUTEN = 5;
