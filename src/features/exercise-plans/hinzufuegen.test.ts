import { describe, expect, it, vi } from 'vitest';
import type { PositionEingabe } from './api';
import {
  OHNE_STANDARD,
  fuegeHinzu,
  hinzugefuegtSatz,
  neuePosition,
  standardDosis,
} from './hinzufuegen';

/** Mehrere Übungen in einem Zug, je mit Standarddosierung (Welle B, ANN-384). */

describe('Standarddosierung als Position', () => {
  it('übernimmt die Standarddosierung und nimmt ohne sie die bisherige Vorbelegung', () => {
    expect(standardDosis({ default_dosage: null })).toEqual(OHNE_STANDARD);
    expect(
      standardDosis({
        default_dosage: {
          sets: 2,
          reps_min: 10,
          reps_max: 10,
          duration_seconds: null,
          hold_seconds: 5,
          per_side: true,
          times_per_day: 3,
        },
      }),
    ).toEqual({
      ...OHNE_STANDARD,
      sets: 2,
      reps_min: 10,
      reps_max: 10,
      hold_seconds: 5,
      per_side: true,
      times_per_day: 3,
    });
  });

  it('setzt Halten nur zu Wiederholungen und lässt Hinweis und Schritt leer', () => {
    const mitDauer = neuePosition('p1', 'v1', {
      ...OHNE_STANDARD,
      reps_min: null,
      reps_max: null,
      duration_seconds: 30,
      hold_seconds: 5,
    });
    expect(mitDauer).toEqual(
      expect.objectContaining({ wdhVon: null, wdhBis: null, dauer: 30, halten: null }),
    );
    const mitWdh = neuePosition('p1', 'v1', { ...OHNE_STANDARD, hold_seconds: 5 });
    expect(mitWdh).toEqual(
      expect.objectContaining({
        planId: 'p1',
        variantId: 'v1',
        wdhVon: 10,
        wdhBis: 12,
        dauer: null,
        halten: 5,
        hinweis: '',
        achse: null,
        richtung: null,
      }),
    );
  });
});

describe('fuegeHinzu', () => {
  const eingaben = ['a', 'b', 'c'].map((id) => neuePosition('p1', id, OHNE_STANDARD));

  it('fügt nacheinander in der gewählten Reihenfolge hinzu und meldet den Fortschritt', async () => {
    const reihenfolge: string[] = [];
    const fortschritt = vi.fn<(fertig: number) => void>();
    const ergebnis = await fuegeHinzu(
      eingaben,
      (e: PositionEingabe) => {
        reihenfolge.push(e.variantId);
        return Promise.resolve('ok');
      },
      fortschritt,
    );
    expect(reihenfolge).toEqual(['a', 'b', 'c']);
    expect(fortschritt.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(ergebnis).toEqual({ hinzugefuegt: 3, fehler: null });
    expect(hinzugefuegtSatz(ergebnis, 3)).toBe('3 Übungen hinzugefügt.');
  });

  it('hört beim ersten Fehler auf und sagt, wie viele angekommen sind', async () => {
    const speichern = vi
      .fn()
      .mockResolvedValueOnce('ok')
      .mockRejectedValueOnce(new Error('Ein Plan hat höchstens 30 Übungen.'));
    const ergebnis = await fuegeHinzu(eingaben, speichern);
    expect(speichern).toHaveBeenCalledTimes(2);
    expect(ergebnis).toEqual({ hinzugefuegt: 1, fehler: 'Ein Plan hat höchstens 30 Übungen.' });
    expect(hinzugefuegtSatz(ergebnis, 3)).toBe(
      '1 von 3 Übungen hinzugefügt. Ein Plan hat höchstens 30 Übungen.',
    );
  });
});
