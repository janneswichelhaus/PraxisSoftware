import { describe, expect, it } from 'vitest';
import { dauerDerEinheit, dauerText } from './dauer';

/** Eine Übung mit Wiederholungen; was ein Fall braucht, setzt er selbst. */
function uebung(teil: Partial<Parameters<typeof dauerDerEinheit>[0][number]> = {}) {
  return {
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    duration_seconds: null,
    rest_seconds: 60,
    per_side: false,
    ...teil,
  };
}

/**
 * Die Dauer der Einheit (Handoff 2026-10-24, Frage 1; ANN-704): geschätzt aus
 * der Dosierung, auf 5 Minuten gerundet, mindestens 5 - und keine Angabe,
 * wenn einer Übung Wiederholungen und Dauer fehlen.
 */
describe('dauerDerEinheit', () => {
  it('rechnet Wiederholungen bis × 4 s, die Pausen zwischen den Durchgängen und 30 s je Übung', () => {
    // 3 × 12 × 4 s = 144 s, 2 × 60 s Pause, 30 s: 294 s, knapp 5 Minuten.
    expect(dauerDerEinheit([uebung()])).toBe(5);
  });

  it('nimmt die Dauer, wo es keine Wiederholungen gibt, und je Seite doppelt', () => {
    const plan = [
      uebung(), // 294 s
      uebung({
        reps_min: null,
        reps_max: null,
        duration_seconds: 30,
        rest_seconds: 30,
        per_side: true,
      }), // 3 × 60 + 2 × 30 + 30 = 270 s
      uebung({ sets: 2, reps_min: 10, reps_max: 10, rest_seconds: null }), // 2 × 40 + 30 = 110 s
    ];
    // 674 s sind gut 11 Minuten: gerundet 10.
    expect(dauerDerEinheit(plan)).toBe(10);
  });

  it('rundet auf volle 5 Minuten, ab der Hälfte nach oben', () => {
    // Je Übung 3 × 12 × 4 + 2 × 60 + 30 = 294 s; acht Übungen sind 39,2 Minuten.
    expect(dauerDerEinheit(Array.from({ length: 8 }, () => uebung()))).toBe(40);
    // Sieben sind 34,3 Minuten.
    expect(dauerDerEinheit(Array.from({ length: 7 }, () => uebung()))).toBe(35);
    // Eine kurze Übung bleibt bei 5 Minuten, nie bei 0.
    expect(dauerDerEinheit([uebung({ sets: 1, reps_max: 5, reps_min: 5 })])).toBe(5);
  });

  it('nimmt die untere Zahl, wenn nur sie eingetragen ist', () => {
    expect(dauerDerEinheit([uebung({ reps_max: null, reps_min: 60, rest_seconds: 0 })])).toBe(
      // 3 × 60 × 4 s = 720 s + 30 s: 12,5 Minuten, gerundet 15.
      15,
    );
  });

  it('schätzt nichts, wenn einer Übung Wiederholungen und Dauer fehlen', () => {
    const ohne = uebung({ reps_min: null, reps_max: null, duration_seconds: null });
    expect(dauerDerEinheit([uebung(), ohne])).toBeNull();
    expect(
      dauerDerEinheit([uebung({ reps_min: null, reps_max: null, duration_seconds: 0 })]),
    ).toBeNull();
    expect(dauerDerEinheit([])).toBeNull();
  });
});

describe('dauerText', () => {
  it('sagt „etwa“ und Minuten', () => {
    expect(dauerText(10)).toBe('etwa 10 Minuten');
    expect(dauerText(5)).toBe('etwa 5 Minuten');
  });
});
