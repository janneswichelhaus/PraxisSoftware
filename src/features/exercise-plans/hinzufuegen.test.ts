import { describe, expect, it, vi } from 'vitest';
import { katalogeintrag } from '@/features/exercises/katalog';
import type { Katalogeintrag } from '@/features/exercises/katalog/typen';
import type { KatalogUebernahme, PositionEingabe } from './api';
import {
  OHNE_STANDARD,
  fuegeHinzu,
  hinzugefuegtSatz,
  mitKatalog,
  neuePosition,
  nichtSatz,
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

describe('mitKatalog (Befund B9, O-002)', () => {
  const KN01 = katalogeintrag('KN-01')!;
  const KN07 = katalogeintrag('KN-07')!;
  const HU01 = katalogeintrag('HU-01')!;
  const dosis = { ...OHNE_STANDARD, sets: 2 };

  it('übernimmt nur, was im Katalog steht, in einem Aufruf - und behält die Reihenfolge der Wahl', async () => {
    const uebernehmen = vi.fn<(plan: string, e: Katalogeintrag[]) => Promise<KatalogUebernahme>>(
      () =>
        Promise.resolve({
          variants: { 'KN-01': 'neu-kn01', 'KN-07': 'da-kn07' },
          imported: ['KN-01'],
          conflicts: [],
        }),
    );
    const { positionen, nicht } = await mitKatalog(
      'p1',
      [
        { variante: { id: 'katalog:KN-07' }, dosis, eintrag: KN07 },
        { variante: { id: 'v-eigene' }, dosis },
        { variante: { id: 'katalog:KN-01' }, dosis, eintrag: KN01 },
      ],
      uebernehmen,
    );
    expect(uebernehmen).toHaveBeenCalledTimes(1);
    expect(uebernehmen.mock.calls[0]![0]).toBe('p1');
    expect(uebernehmen.mock.calls[0]![1].map((e) => e.schluessel)).toEqual(['KN-07', 'KN-01']);
    expect(positionen.map((p) => p.variantId)).toEqual(['da-kn07', 'v-eigene', 'neu-kn01']);
    expect(positionen.every((p) => p.saetze === 2 && p.planId === 'p1')).toBe(true);
    expect(nicht).toEqual([]);
  });

  it('ruft ohne Katalogeintrag nichts auf', async () => {
    const uebernehmen = vi.fn();
    const { positionen } = await mitKatalog('p1', [{ variante: { id: 'v1' }, dosis }], uebernehmen);
    expect(uebernehmen).not.toHaveBeenCalled();
    expect(positionen.map((p) => p.variantId)).toEqual(['v1']);
  });

  it('lässt weg, was der Server nicht genommen hat, und sagt warum', async () => {
    const { positionen, nicht } = await mitKatalog(
      'p1',
      [
        { variante: { id: 'katalog:KN-01' }, dosis, eintrag: KN01 },
        { variante: { id: 'katalog:KN-07' }, dosis, eintrag: KN07 },
        { variante: { id: 'katalog:HU-01' }, dosis, eintrag: HU01 },
      ],
      () =>
        Promise.resolve({
          variants: { 'HU-01': 'v-hu01' },
          imported: ['HU-01'],
          conflicts: [
            { catalog_key: 'KN-01', name: KN01.name, reason: 'archived' },
            { catalog_key: 'KN-07', name: KN07.name, reason: 'name' },
          ],
        }),
    );
    expect(positionen.map((p) => p.variantId)).toEqual(['v-hu01']);
    expect(nicht).toEqual([
      { name: KN01.name, grund: 'archived' },
      { name: KN07.name, grund: 'name' },
    ]);
    expect(nichtSatz(nicht)).toBe(
      `Nicht hinzugefügt: ${KN01.name} (archiviert), ${KN07.name} (Name schon vergeben).`,
    );
    expect(nichtSatz([])).toBeNull();
  });

  it('sagt „nicht in der Bibliothek“, wenn nur owner übernehmen dürfte (ANN-293)', async () => {
    const { positionen, nicht } = await mitKatalog(
      'p1',
      [
        { variante: { id: 'katalog:KN-01' }, dosis, eintrag: KN01 },
        { variante: { id: 'katalog:KN-07' }, dosis, eintrag: KN07 },
      ],
      () =>
        Promise.resolve({
          variants: { 'KN-01': 'da-kn01' },
          imported: [],
          conflicts: [{ catalog_key: 'KN-07', name: KN07.name, reason: 'missing' }],
        }),
    );
    expect(positionen.map((p) => p.variantId)).toEqual(['da-kn01']);
    expect(nicht).toEqual([{ name: KN07.name, grund: 'fehlt' }]);
    expect(nichtSatz(nicht)).toBe(`Nicht hinzugefügt: ${KN07.name} (nicht in der Bibliothek).`);
  });

  it('legt nichts an, wenn die Übernahme scheitert', async () => {
    await expect(
      mitKatalog('p1', [{ variante: { id: 'katalog:KN-01' }, dosis, eintrag: KN01 }], () =>
        Promise.reject(new Error('Die Übungen konnten nicht übernommen werden.')),
      ),
    ).rejects.toThrow('Die Übungen konnten nicht übernommen werden.');
  });
});
