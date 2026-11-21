import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mesh } from 'three';
import { buildLastenrad } from '@/components/ui/lastenrad3d/build';
import { TEILE_JE_BAUTEIL, bauteilVonTeil } from './radteile';
import { ZONE_KEYS } from './zones';

/** Die Zuordnung deckt das Modell aus dem Entwurf vollständig: kein Teil ohne Bauteil, keins doppelt. */
describe('Teile des 3D-Modells je Bauteil', () => {
  let teile: string[] = [];

  beforeAll(async () => {
    // Node kennt kein Bild und keine Zeichenfläche; die Wortmarke lädt hier als Attrappe.
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 5330.93;
        naturalHeight = 2492.83;
        onload: (() => void) | null = null;
        set src(_adresse: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
      }),
    });
    const model = await buildLastenrad();
    model.traverse((o) => {
      if ((o as Partial<Mesh>).isMesh) teile.push(o.name);
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    teile = [];
  });

  it('ordnet jedes der 154 Teile genau einem Bauteil zu', () => {
    expect(teile).toHaveLength(154);
    expect(teile.filter((teil) => bauteilVonTeil(teil) === null)).toEqual([]);
    const genannt = Object.values(TEILE_JE_BAUTEIL).flat();
    expect(new Set(genannt).size).toBe(genannt.length);
    expect(genannt.filter((teil) => !teile.includes(teil))).toEqual([]);
  });

  it('gibt jedem Bauteil ein Teil am Rad, nur dem Gepäckträger nicht', () => {
    const ohneTeil = ZONE_KEYS.filter((zone) => TEILE_JE_BAUTEIL[zone].length === 0);
    expect(ohneTeil).toEqual(['gepaecktraeger']);
  });

  it('zählt die Kette des Modells als Riemen, Schaltwerk und Nabe als Nabenschaltung', () => {
    expect(bauteilVonTeil('kette_oben')).toBe('riemen');
    expect(bauteilVonTeil('kassette')).toBe('riemen');
    expect(bauteilVonTeil('schaltwerk')).toBe('nabenschaltung');
    expect(bauteilVonTeil('hinterrad_nabe')).toBe('nabenschaltung');
    expect(bauteilVonTeil('gibt_es_nicht')).toBeNull();
  });
});
