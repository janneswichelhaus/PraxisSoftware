import { describe, expect, it, vi } from 'vitest';
import type { Anbieteradapter, MatrixErgebnis, MatrixRequest } from '../location-provider/typen.ts';
import type { Weg } from './typen.ts';
import { PROFIL, berechneFahrzeiten } from './wege.ts';

const ZIEL = { lat: 48.53, lon: 9.05 };
const punkt = (i: number) => ({ lat: 48.5 + i / 1000, lon: 9 + i / 1000 });
const hin = (i: number): Weg => ({ key: `hin-${i}`, from: punkt(i), to: ZIEL });
const weiter = (i: number): Weg => ({ key: `weiter-${i}`, from: ZIEL, to: punkt(i) });

function adapterMit(
  antworte: (anfrage: MatrixRequest) => MatrixErgebnis | Promise<MatrixErgebnis>,
) {
  const matrix = vi.fn((anfrage: MatrixRequest) => Promise.resolve(antworte(anfrage)));
  const adapter = { id: 'probe', quelle: 'nachbildung', matrix } as unknown as Anbieteradapter;
  return { adapter, matrix };
}

/** Je Paar eine Fahrzeit aus den Indizes, damit Verwechslungen auffallen. */
const gerechnet = (anfrage: MatrixRequest): MatrixErgebnis => ({
  ok: true,
  value: {
    durationsSeconds: anfrage.origins.map((o) =>
      anfrage.destinations.map((d) => Math.round((o.lat + d.lat - 97) * 1e5)),
    ),
  },
});

describe('berechneFahrzeiten', () => {
  it('fragt je eine Matrix zur Adresse hin und von ihr weg, nur mit Koordinaten', async () => {
    const { adapter, matrix } = adapterMit(gerechnet);
    const wege = [hin(1), hin(2), weiter(3)];
    const ergebnis = await berechneFahrzeiten({
      adapter,
      ziel: ZIEL,
      wege,
    });

    expect(matrix.mock.calls.map(([anfrage]) => anfrage)).toEqual([
      { origins: [punkt(1), punkt(2)], destinations: [ZIEL], profile: PROFIL },
      { origins: [ZIEL], destinations: [punkt(3)], profile: PROFIL },
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
    const { adapter, matrix } = adapterMit(gerechnet);
    const wege = Array.from({ length: 30 }, (_, i) => hin(i + 1));
    const ergebnis = await berechneFahrzeiten({
      adapter,
      ziel: ZIEL,
      wege,
    });
    expect(matrix.mock.calls.map(([anfrage]) => anfrage.origins.length)).toEqual([25, 5]);
    expect(ergebnis.ok && ergebnis.fahrzeiten.map((f) => f.key)).toEqual(wege.map((w) => w.key));
  });

  it('gibt kein Ergebnis, wenn der Kartendienst scheitert, und fragt dann nicht weiter', async () => {
    const { adapter, matrix } = adapterMit(() => ({
      ok: false,
      error: { code: 'timeout', message: 'egal' },
    }));
    const ergebnis = await berechneFahrzeiten({ adapter, ziel: ZIEL, wege: [hin(1), weiter(2)] });
    expect(ergebnis).toEqual({ ok: false });
    expect(matrix).toHaveBeenCalledTimes(1);
  });

  it('macht aus einem Absturz des Adapters ebenfalls kein Ergebnis', async () => {
    const adapter = {
      id: 'probe',
      quelle: 'anbieter',
      matrix: () => Promise.reject(new Error('Netz weg')),
    } as unknown as Anbieteradapter;
    expect(await berechneFahrzeiten({ adapter, ziel: ZIEL, wege: [weiter(1)] })).toEqual({
      ok: false,
    });
  });

  it.each([null, undefined, Number.NaN, -1, 86_401, Number.POSITIVE_INFINITY])(
    'lässt eine fehlende oder unsinnige Fahrzeit (%s) ungeprüft statt sie zu schätzen',
    async (wert) => {
      const { adapter } = adapterMit(() => ({
        ok: true,
        value: { durationsSeconds: [[wert as number | null]] },
      }));
      const ergebnis = await berechneFahrzeiten({
        adapter,
        ziel: ZIEL,
        wege: [hin(1)],
      });
      expect(ergebnis).toEqual({ ok: true, fahrzeiten: [{ key: 'hin-1', seconds: null }] });
    },
  );

  it('fragt einen Weg nicht an, der die Adresse nicht berührt', async () => {
    const { adapter, matrix } = adapterMit(gerechnet);
    const fremd: Weg = { key: 'fremd', from: punkt(1), to: punkt(2) };
    const ergebnis = await berechneFahrzeiten({
      adapter,
      ziel: ZIEL,
      wege: [fremd],
    });
    expect(matrix).not.toHaveBeenCalled();
    expect(ergebnis).toEqual({ ok: true, fahrzeiten: [{ key: 'fremd', seconds: null }] });
  });

  it('rundet auf ganze Sekunden', async () => {
    const { adapter } = adapterMit(() => ({ ok: true, value: { durationsSeconds: [[612.6]] } }));
    const ergebnis = await berechneFahrzeiten({
      adapter,
      ziel: ZIEL,
      wege: [hin(1)],
    });
    expect(ergebnis).toEqual({ ok: true, fahrzeiten: [{ key: 'hin-1', seconds: 613 }] });
  });
});
