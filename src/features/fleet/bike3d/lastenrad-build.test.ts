import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { BIKE_ZONES } from '../zones';
import { BAUTEILE, buildLastenrad } from './lastenrad-build';

/**
 * Das Modell kommt aus dem Entwurf und wird hier nicht geändert: Teile, Materialien, Farben und
 * Geometrie stehen fest. Schlägt die Prüfsumme an, braucht es eine neue Übergabe, keinen neuen Wert.
 */

type Teil = Mesh & { material: MeshStandardMaterial };

/** Node kennt weder Bild noch Zeichenfläche; die Wortmarke lädt oder fehlt je nach `mitMarke`. */
function attrappen(mitMarke: boolean) {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 5330.93;
      naturalHeight = 2492.83;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_adresse: string) {
        queueMicrotask(() => (mitMarke ? this.onload?.() : this.onerror?.()));
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
}

function teile(model: Group): Teil[] {
  const liste: Teil[] = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if ((o as Partial<Mesh>).isMesh) liste.push(o as Teil);
  });
  return liste;
}

function dreiecke(liste: readonly Teil[]): number {
  return liste.reduce((summe, { geometry }) => {
    const ecken = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
    return summe + ecken / 3;
  }, 0);
}

/** Namen und Eckpunkte in Weltkoordinaten, auf einen Zehntelmillimeter gerundet. */
function pruefsumme(liste: readonly Teil[]): string {
  const summe = createHash('sha256');
  const punkt = new Vector3();
  for (const teil of liste) {
    summe.update(`${teil.name}|${teil.material.name}|`);
    const ecken = teil.geometry.getAttribute('position');
    for (let i = 0; i < ecken.count; i += 1) {
      punkt.fromBufferAttribute(ecken, i).applyMatrix4(teil.matrixWorld);
      const werte = punkt.toArray().map((wert) => (Math.round(wert * 1e4) / 1e4 || 0).toFixed(4));
      summe.update(`${werte.join(',')};`);
    }
  }
  return summe.digest('hex');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Modell des Lastenrads aus dem Entwurf', () => {
  it('trägt 154 benannte Teile, 9 Materialien und 38.616 Dreiecke', async () => {
    attrappen(true);
    const liste = teile(await buildLastenrad());
    expect(new Set(liste.map((teil) => teil.name)).size).toBe(154);
    expect(liste.every((teil) => teil.name.length > 0)).toBe(true);
    expect(new Set(liste.map((teil) => teil.material)).size).toBe(9);
    expect(dreiecke(liste)).toBe(38616);
  });

  it('führt die Farben der Marke und die Materialnamen des Entwurfs', async () => {
    attrappen(true);
    const farben = new Map(
      teile(await buildLastenrad()).map(({ material }) => [
        material.name,
        `#${material.color.getHexString()}`,
      ]),
    );
    expect(Object.fromEntries(farben)).toEqual({
      aluminium: '#c6c3bd',
      box_papier: '#f6f7f4',
      hauptfarbe: '#004429',
      kunststoff: '#111e17',
      ladeflaeche: '#111e17',
      reifen: '#151515',
      rueckstrahler: '#b5121b',
      tiefgruen: '#042c1b',
      wortmarke: '#ffffff',
    });
  });

  it('hat die Geometrie des Entwurfs (Prüfsumme über alle Eckpunkte)', async () => {
    attrappen(true);
    expect(pruefsumme(teile(await buildLastenrad()))).toBe(
      'e318fc734137bb2e6dfd24b909b7b967f055b9941a5a86e3772e288f3b838aa5',
    );
  });

  it('fasst für die Anzeige je Material zusammen, mit denselben Dreiecken', async () => {
    attrappen(true);
    const liste = teile(await buildLastenrad({ merge: true }));
    expect(liste).toHaveLength(9);
    expect(dreiecke(liste)).toBe(38616);
  });

  it('lässt die Box ohne Wortmarke unbedruckt', async () => {
    attrappen(false);
    const liste = teile(await buildLastenrad());
    expect(liste).toHaveLength(151);
    expect(liste.some((teil) => teil.name.startsWith('werbeflaeche_'))).toBe(false);
  });

  it('holt die Wortmarke aus der ausgelieferten Marke, nicht von fremden Servern', async () => {
    const adressen: string[] = [];
    attrappen(false);
    const Bild = globalThis.Image;
    vi.stubGlobal(
      'Image',
      class extends Bild {
        override set src(adresse: string) {
          adressen.push(adresse);
          super.src = adresse;
        }
      },
    );
    await buildLastenrad();
    expect(adressen).toEqual(['/marke/own-motion-block-unterzeile-farbig.svg']);
  });
});

/** Für die Praxissoftware (Übergabe 2): Bauteile, eigene Materialien, Trefferflächen. */
describe('Modell mit Bauteilen', () => {
  it('führt dieselben 27 Bauteile in derselben Reihenfolge wie BIKE_ZONES', () => {
    expect([...BAUTEILE]).toEqual(Object.keys(BIKE_ZONES));
  });

  it('gibt jedem Mesh ein gültiges Bauteil und jedem Bauteil mindestens ein Mesh', async () => {
    attrappen(true);
    for (const merge of [false, true]) {
      const liste = teile(await buildLastenrad({ bauteile: true, merge }));
      const zonen = liste.map((teil) => teil.userData.zone as unknown);
      expect(zonen.every((zone) => typeof zone === 'string' && zone in BIKE_ZONES)).toBe(true);
      expect(new Set(zonen)).toEqual(new Set(BAUTEILE));
    }
  });

  it('teilt kein Material zwischen zwei Bauteilen, alle sichtbaren deckend', async () => {
    attrappen(true);
    const liste = teile(await buildLastenrad({ bauteile: true, merge: true }));
    const zonenJeMaterial = new Map<MeshStandardMaterial, Set<unknown>>();
    for (const teil of liste) {
      zonenJeMaterial.set(
        teil.material,
        (zonenJeMaterial.get(teil.material) ?? new Set()).add(teil.userData.zone),
      );
    }
    expect([...zonenJeMaterial.values()].every((zonen) => zonen.size === 1)).toBe(true);
    const sichtbar = liste.filter((teil) => !teil.userData.trefferflaeche);
    expect(sichtbar).toHaveLength(52);
    expect(sichtbar.every(({ material }) => material.visible && material.opacity === 1)).toBe(true);
    expect(sichtbar.every(({ material }) => material.name.startsWith(`${teil(material)}|`))).toBe(
      true,
    );
    expect(dreiecke(sichtbar)).toBe(38616);

    function teil(material: MeshStandardMaterial) {
      return String([...zonenJeMaterial.get(material)!][0]);
    }
  });

  it('hat unsichtbare Trefferflächen für dünne Teile und den Gepäckträger', async () => {
    attrappen(true);
    const treffer = teile(await buildLastenrad({ bauteile: true, merge: true })).filter(
      (teil) => teil.userData.trefferflaeche === true,
    );
    expect(treffer.every(({ material }) => !material.visible)).toBe(true);
    expect(new Set(treffer.map((teil) => teil.userData.zone as unknown))).toEqual(
      new Set([
        'laufrad-vorne',
        'laufrad-hinten',
        'bremsgriffe',
        'klingel',
        'lenkung',
        'licht-vorne',
        'licht-hinten',
        'staender',
        'gepaecktraeger',
      ]),
    );
  });

  it('lässt die Geometrie ohne Bauteile unverändert', async () => {
    attrappen(true);
    expect(pruefsumme(teile(await buildLastenrad({ bauteile: false })))).toBe(
      'e318fc734137bb2e6dfd24b909b7b967f055b9941a5a86e3772e288f3b838aa5',
    );
  });
});
