import { describe, expect, it, vi } from 'vitest';
import type { Coordinate } from '../location-provider/typen.ts';
import type { Kartendienst, Matrixantwort } from './kartendienst.ts';
import type { Weg } from './typen.ts';
import { berechneFahrzeiten } from './wege.ts';

const ZIEL = { lat: 48.53, lon: 9.05 };
const punkt = (i: number) => ({ lat: 48.5 + i / 1000, lon: 9 + i / 1000 });
const hin = (i: number): Weg => ({ key: `hin-${i}`, from: punkt(i), to: ZIEL });
const weiter = (i: number): Weg => ({ key: `weiter-${i}`, from: ZIEL, to: punkt(i) });

type Frage = (origins: readonly Coordinate[], destinations: readonly Coordinate[]) => Matrixantwort;

function dienstMit(antworte: Frage) {
  const matrix = vi.fn(
    (_authorization: string, origins: readonly Coordinate[], destinations: readonly Coordinate[]) =>
      Promise.resolve(antworte(origins, destinations)),
  );
  return { kartendienst: { matrix } satisfies Kartendienst, matrix };
}

/** Je Paar eine Fahrzeit aus den Koordinaten, damit Verwechslungen auffallen. */
const gerechnet: Frage = (origins, destinations) => ({
  ok: true,
  sekunden: origins.map((o) => destinations.map((d) => Math.round((o.lat + d.lat - 97) * 1e5))),
});
const rechne = (kartendienst: Kartendienst, wege: Weg[]) =>
  berechneFahrzeiten({ kartendienst, authorization: 'Bearer person', ziel: ZIEL, wege });

describe('berechneFahrzeiten', () => {
  it('fragt je eine Matrix zur Adresse hin und von ihr weg, mit dem Token der Person', async () => {
    const { kartendienst, matrix } = dienstMit(gerechnet);
    const ergebnis = await rechne(kartendienst, [hin(1), hin(2), weiter(3)]);

    expect(matrix.mock.calls).toEqual([
      ['Bearer person', [punkt(1), punkt(2)], [ZIEL]],
      ['Bearer person', [ZIEL], [punkt(3)]],
    ]);
    expect(ergebnis).toEqual({
      ok: true,
      fahrzeiten: [
        { key: 'hin-1', seconds: Math.round((punkt(1).lat + ZIEL.lat - 97) * 1e5) },
        { key: 'hin-2', seconds: Math.round((punkt(2).lat + ZIEL.lat - 97) * 1e5) },
        { key: 'weiter-3', seconds: Math.round((ZIEL.lat + punkt(3).lat - 97) * 1e5) },
      ],
    });
  });

  it('teilt mehr als 25 Punkte auf mehrere Anfragen auf', async () => {
    const { kartendienst, matrix } = dienstMit(gerechnet);
    const wege = Array.from({ length: 30 }, (_, i) => hin(i + 1));
    const ergebnis = await rechne(kartendienst, wege);
    expect(matrix.mock.calls.map(([, origins]) => origins.length)).toEqual([25, 5]);
    expect(ergebnis.ok && ergebnis.fahrzeiten.map((f) => f.key)).toEqual(wege.map((w) => w.key));
  });

  it.each(['not_configured', 'unavailable'] as const)(
    'gibt kein Ergebnis, wenn der Kartendienst %s meldet, und fragt dann nicht weiter',
    async (grund) => {
      const { kartendienst, matrix } = dienstMit(() => ({ ok: false, grund }));
      expect(await rechne(kartendienst, [hin(1), weiter(2)])).toEqual({ ok: false, grund });
      expect(matrix).toHaveBeenCalledTimes(1);
    },
  );

  it('macht aus einem Absturz der Anfrage ebenfalls kein Ergebnis', async () => {
    const kartendienst: Kartendienst = { matrix: () => Promise.reject(new Error('Netz weg')) };
    expect(await rechne(kartendienst, [weiter(1)])).toEqual({ ok: false, grund: 'unavailable' });
  });

  it.each([null, Number.NaN, -1, 86_401, Number.POSITIVE_INFINITY])(
    'lässt eine fehlende oder unsinnige Fahrzeit (%s) ungeprüft statt sie zu schätzen',
    async (wert) => {
      const { kartendienst } = dienstMit(() => ({ ok: true, sekunden: [[wert]] }));
      expect(await rechne(kartendienst, [hin(1)])).toEqual({
        ok: true,
        fahrzeiten: [{ key: 'hin-1', seconds: null }],
      });
    },
  );

  it('fragt einen Weg nicht an, der die Adresse nicht berührt', async () => {
    const { kartendienst, matrix } = dienstMit(gerechnet);
    const fremd: Weg = { key: 'fremd', from: punkt(1), to: punkt(2) };
    expect(await rechne(kartendienst, [fremd])).toEqual({
      ok: true,
      fahrzeiten: [{ key: 'fremd', seconds: null }],
    });
    expect(matrix).not.toHaveBeenCalled();
  });

  it('rundet auf ganze Sekunden', async () => {
    const { kartendienst } = dienstMit(() => ({ ok: true, sekunden: [[612.6]] }));
    expect(await rechne(kartendienst, [hin(1)])).toEqual({
      ok: true,
      fahrzeiten: [{ key: 'hin-1', seconds: 613 }],
    });
  });
});
