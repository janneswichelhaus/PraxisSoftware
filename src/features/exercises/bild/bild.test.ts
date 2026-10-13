import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KATALOG } from '../katalog';
import { MASSE, STRICH, abstand, punkt, umriss, type Figur } from './figur';
import { GRUND } from './grundstellungen';
import { figuren, flaecheBei, grundhoehe, sitzhoehe, zwischen, umgebung } from './loeser';
import {
  BILD_HOECHSTENS_BYTES,
  GRUNDSTELLUNGEN,
  bildBytes,
  bildOderNichts,
  uebungsbildSchema,
  type Uebungsbild,
} from './schema';
import { szene } from './szene';

/**
 * Das Übungsbild (ANN-381): Geometrie, Fassung und Größe.
 *
 * Was jsdom nicht sieht - wie das Bild aussieht -, zeigt die Prüfseite
 * `tests/e2e/fixtures/uebungsbilder.html`. Hier steht, was sich rechnen
 * lässt: Glieder behalten ihre Länge, die Figur liegt auf, nichts ragt aus
 * dem Bild, und dieselbe Beschreibung ergibt immer dasselbe Bild.
 */

/** Eine Stellung je Grundstellung, dazu die Bilder des Katalogs. */
const GRUNDBILDER: [string, Uebungsbild][] = GRUNDSTELLUNGEN.map((basis) => [
  `Grundstellung ${basis}`,
  { v: 1, basis, start: {}, ende: {} },
]);
const KATALOGBILDER: [string, Uebungsbild][] = KATALOG.flatMap((e) =>
  e.bild ? [[e.schluessel, e.bild] as [string, Uebungsbild]] : [],
);
const ALLE = [...GRUNDBILDER, ...KATALOGBILDER];

function laengen(f: Figur): number[] {
  return f.seiten.flatMap((s) =>
    f.ansicht === 'seite'
      ? [
          abstand(s.huefte, s.knie) - MASSE.oberschenkel,
          abstand(s.knie, s.knoechel) - MASSE.unterschenkel,
          abstand(s.schulterpunkt, s.ellbogen) - MASSE.oberarm,
          abstand(s.ellbogen, s.hand) - MASSE.unterarm,
          abstand(f.becken, f.schulter) - MASSE.rumpf,
        ]
      : [
          // Vorn: Die Arme liegen in der Bildebene, die Beine verkürzt die Beugung.
          abstand(s.schulterpunkt, s.ellbogen) - MASSE.oberarm,
          abstand(s.ellbogen, s.hand) - MASSE.unterarm,
          abstand(f.becken, f.schulter) - MASSE.rumpf,
        ],
  );
}

function tiefsterPunkt(f: Figur): number {
  return Math.min(...umriss(f).map(([p, r]) => p[1] - r));
}

describe('Geometrie der Figur', () => {
  it.each(ALLE)('%s: Glieder behalten ihre Länge', (_, bild) => {
    const { start, ende } = figuren(bild);
    for (const f of [start, ende]) {
      for (const abweichung of laengen(f)) expect(Math.abs(abweichung)).toBeLessThan(0.01);
    }
  });

  it.each(ALLE)('%s: liegt auf - nichts unter der Fläche, nichts schwebt', (_, bild) => {
    const { start, ende, umgebung: u } = figuren(bild);
    for (const f of [start, ende]) {
      // Nichts ragt in den Boden oder die Unterlage.
      expect(tiefsterPunkt(f)).toBeGreaterThanOrEqual(Math.min(0, grundhoehe(u)) - 0.05);
      const s = f.stellung;
      if (s.sitz) {
        // Das Becken sitzt auf - oder die Füße stehen, und das Becken schwebt kaum.
        const gesaess = f.becken[1] - (f.ansicht === 'front' ? 6 : STRICH.rumpf / 2);
        expect(gesaess - sitzhoehe(s.sitz)).toBeGreaterThanOrEqual(-0.05);
        expect(gesaess - sitzhoehe(s.sitz)).toBeLessThan(4);
      } else if (s.stuetze) {
        const p = punkt(f, s.stuetze);
        expect(Math.abs(p[1] - flaecheBei(u, p[0]))).toBeLessThan(STRICH.oberschenkel);
      } else {
        expect(Math.abs(tiefsterPunkt(f) - grundhoehe(u))).toBeLessThan(0.05);
      }
    }
  });

  it.each(ALLE)('%s: alles liegt im Bildausschnitt', (_, bild) => {
    const s = szene(bild, 'bewegung');
    const [x0, yOben, breite, hoehe] = s.viewBox.split(' ').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const { start, ende } = figuren(bild);
    for (const f of [start, ende]) {
      for (const [p, r] of umriss(f)) {
        expect(p[0] - r).toBeGreaterThanOrEqual(x0);
        expect(p[0] + r).toBeLessThanOrEqual(x0 + breite);
        // Im SVG zeigt y nach unten.
        expect(-p[1] - r).toBeGreaterThanOrEqual(yOben);
        expect(-p[1] + r).toBeLessThanOrEqual(yOben + hoehe);
      }
    }
    // 4:3 für Bilder, 1:1 für die Vorschau.
    expect(breite / hoehe).toBeCloseTo(4 / 3, 2);
    const [, , vb, vh] = szene(bild, 'vorschau').viewBox.split(' ').map(Number);
    expect(vb! / vh!).toBeCloseTo(1, 2);
  });

  it.each(ALLE)('%s: zeichnet nur Zahlen, nie NaN', (_, bild) => {
    for (const darstellung of ['start', 'ende', 'bewegung', 'vorschau'] as const) {
      const s = szene(bild, darstellung);
      const pfade = [s.boden, ...s.unten, ...s.geist, ...s.figur, ...s.pfeile].map((x) => x.d);
      for (const d of pfade) expect(d).toMatch(/^[MLQZa0-9 .-]+$/);
      expect(s.viewBox).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    }
  });

  it.each(ALLE)('%s: dieselbe Beschreibung ergibt dasselbe Bild', (_, bild) => {
    expect(szene(structuredClone(bild), 'bewegung')).toEqual(szene(bild, 'bewegung'));
  });

  it('beginnt und endet die Bewegung in Start und Ende', () => {
    for (const [schluessel, bild] of KATALOGBILDER) {
      const u = umgebung(bild);
      const { start, ende } = figuren(bild);
      for (const [t, f] of [
        [0, start],
        [1, ende],
      ] as const) {
        const z = zwischen(bild, u, t);
        expect(abstand(z.becken, f.becken), schluessel).toBeLessThan(1);
        expect(abstand(z.kopf, f.kopf), schluessel).toBeLessThan(1);
      }
    }
  });

  it('greift mit der Hand an die Lehne, auch mitten in der Bewegung', () => {
    const bild: Uebungsbild = {
      v: 1,
      basis: 'stand',
      start: { haende: ['lehne', 'lehne'] },
      ende: { rumpf: 30, huefte: [80, 80], knie: [80, 80], haende: ['lehne', 'lehne'] },
      hilfsmittel: [{ art: 'stuhl', x: 24 }],
    };
    const u = umgebung(bild);
    for (const t of [0.5, 0.7, 1]) {
      const hand = zwischen(bild, u, t).seiten[0].hand;
      expect(Math.abs(hand[0] - 24)).toBeLessThan(0.5);
    }
  });

  it('löst die Brücke: Schulter und Fuß liegen zugleich auf', () => {
    const bild: Uebungsbild = {
      v: 1,
      basis: 'rueckenlage_angestellt',
      start: {},
      ende: {
        huefte: [10, 10],
        knie: [80, 80],
        loesen: { winkel: 'rumpf', gleich: ['schulter', 'ferse_nah'] },
      },
    };
    const { ende } = figuren(bild);
    const schulter = ende.schulter[1] - STRICH.rumpf / 2;
    const ferse = ende.seiten[0].ferse[1] - STRICH.fuss / 2;
    expect(Math.abs(schulter - ferse)).toBeLessThan(0.05);
    expect(ende.becken[1]).toBeGreaterThan(20);
  });
});

describe('Fassung 1 bleibt zeichenbar', () => {
  // Ein eingefrorenes Bild (ANN-300) wird mit diesen Werten gezeichnet. Ändern
  // sie sich, ändert sich jedes zugewiesene Bild - das ist eine neue Fassung,
  // keine stille Korrektur.
  it('hält Maße und Grundstellungen fest', () => {
    expect({ MASSE, STRICH, GRUND }).toMatchSnapshot();
  });

  it.each(GRUNDBILDER.slice(0, 6))('hält die Pfade fest: %s', (_, bild) => {
    expect(szene(bild, 'bewegung')).toMatchSnapshot();
  });
});

describe('Posen-Beschreibung', () => {
  it('nimmt jedes Bild des Katalogs an', () => {
    for (const [schluessel, bild] of KATALOGBILDER) {
      expect(uebungsbildSchema.safeParse(bild).success, schluessel).toBe(true);
      expect(bildBytes(bild), schluessel).toBeLessThanOrEqual(BILD_HOECHSTENS_BYTES);
    }
  });

  it('weist Unbekanntes ab: fremde Schlüssel, Zeichenketten statt Zahlen, spätere Fassungen', () => {
    const gut = { v: 1, basis: 'stand', start: {}, ende: {} };
    expect(uebungsbildSchema.safeParse(gut).success).toBe(true);
    expect(uebungsbildSchema.safeParse({ ...gut, v: 2 }).success).toBe(false);
    expect(uebungsbildSchema.safeParse({ ...gut, farbe: 'red' }).success).toBe(false);
    expect(uebungsbildSchema.safeParse({ ...gut, start: { rumpf: '10' } }).success).toBe(false);
    expect(uebungsbildSchema.safeParse({ ...gut, start: { rumpf: '<script>' } }).success).toBe(
      false,
    );
    expect(uebungsbildSchema.safeParse({ ...gut, basis: 'handstand' }).success).toBe(false);
    expect(
      uebungsbildSchema.safeParse({ ...gut, hilfsmittel: [{ art: 'stuhl', x: 'links' }] }).success,
    ).toBe(false);
  });

  it('macht aus einem unlesbaren Bild kein Bild statt eines falschen', () => {
    expect(bildOderNichts(null)).toBeNull();
    expect(bildOderNichts({ v: 2 })).toBeNull();
    expect(bildOderNichts('kniebeuge')).toBeNull();
    expect(bildOderNichts({ v: 1, basis: 'stand', start: {}, ende: {} })).not.toBeNull();
  });

  it('zählt die Größe in Bytes wie der Server', () => {
    expect(bildBytes({ a: 'ü', b: [1, 2] })).toBe(
      new TextEncoder().encode('{"a": "ü", "b": [1, 2]}').length,
    );
    const gross = { v: 1, basis: 'stand', start: {}, ende: {}, x: 'a'.repeat(5000) };
    expect(bildBytes(gross)).toBeGreaterThan(BILD_HOECHSTENS_BYTES);
  });
});

describe('Zeichnen ohne Zeichenketten aus den Daten', () => {
  it('setzt nirgends rohes HTML', () => {
    const verzeichnis = join(process.cwd(), 'src/features/exercises/bild');
    for (const datei of readdirSync(verzeichnis).filter(
      (d) => /\.tsx?$/.test(d) && !d.endsWith('.test.ts'),
    )) {
      const text = readFileSync(join(verzeichnis, datei), 'utf8');
      expect(text, datei).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
    }
  });
});
