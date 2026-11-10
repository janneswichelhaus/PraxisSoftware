import { describe, expect, it } from 'vitest';
import { erkannteZeilen, setzeFelder } from './felder.ts';
import { NACHGEBILDETE_VERORDNUNG, findeFelder } from './mock.ts';
import { VERORDNUNG_FELDER } from './zwecke.ts';

// Felder vom Foto als Bauart (ANN-861): Der Adapter nennt Stellen im erkannten Text, den Wert
// schneidet der Gateway aus. Was dort nicht steht, kann nicht im Vorschlag stehen.

const ZEILEN = ['Ausgestellt am 02.11.2026', 'Dr. med. Petra Probst', 'Krankengymnastik 6 x'];

describe('erkannteZeilen', () => {
  it('nimmt Zeilen ohne Rand und ohne Leerzeilen', () => {
    expect(erkannteZeilen(['  Folgeverordnung ', '', '   ', 'KG 6 x'], 80, 200)).toEqual([
      'Folgeverordnung',
      'KG 6 x',
    ]);
    expect(erkannteZeilen([], 80, 200)).toEqual([]);
  });

  it.each([
    ['keine Liste', 'Folgeverordnung'],
    ['eine Zahl als Zeile', ['Folgeverordnung', 6]],
    ['einen Zeilenwechsel in einer Zeile', ['Folgeverordnung\nKG 6 x']],
    ['eine zu lange Zeile', ['a'.repeat(201)]],
    ['zu viele Zeilen', Array.from({ length: 81 }, () => 'KG 6 x')],
  ])('verwirft %s', (_fall, wert) => {
    expect(erkannteZeilen(wert, 80, 200)).toBeNull();
  });
});

describe('setzeFelder', () => {
  it('schneidet den Wortlaut aus der Zeile und ordnet nach Feld und Zeile', () => {
    expect(
      setzeFelder(
        ZEILEN,
        [
          { feld: 'heilmittel', zeile: 2, von: 0, bis: 20 },
          { feld: 'verordnende', zeile: 1, von: 0, bis: 21 },
          { feld: 'ausgestellt_am', zeile: 0, von: 15, bis: 25 },
        ],
        VERORDNUNG_FELDER,
      ),
    ).toEqual([
      { feld: 'ausgestellt_am', wert: '02.11.2026', zeile: 'Ausgestellt am 02.11.2026' },
      { feld: 'verordnende', wert: 'Dr. med. Petra Probst', zeile: 'Dr. med. Petra Probst' },
      { feld: 'heilmittel', wert: 'Krankengymnastik 6 x', zeile: 'Krankengymnastik 6 x' },
    ]);
  });

  it('nimmt keine Fundstelle als leere Antwort an', () => {
    expect(setzeFelder(ZEILEN, [], VERORDNUNG_FELDER)).toEqual([]);
  });

  it('übernimmt nie einen Wert, den der Adapter mitschickt', () => {
    const gesetzt = setzeFelder(
      ZEILEN,
      [{ feld: 'icd10', zeile: 1, von: 0, bis: 3, wert: 'M17.1' }],
      VERORDNUNG_FELDER,
    );
    expect(gesetzt).toEqual([{ feld: 'icd10', wert: 'Dr.', zeile: 'Dr. med. Petra Probst' }]);
  });

  it.each([
    ['keine Liste', { feld: 'art', zeile: 0, von: 0, bis: 3 }],
    ['ein unbekanntes Feld', [{ feld: 'name', zeile: 1, von: 0, bis: 21 }]],
    ['ein Feld aus dem Prototyp', [{ feld: 'toString', zeile: 1, von: 0, bis: 3 }]],
    ['eine Zeile, die es nicht gibt', [{ feld: 'art', zeile: 3, von: 0, bis: 3 }]],
    ['eine negative Zeile', [{ feld: 'art', zeile: -1, von: 0, bis: 3 }]],
    ['eine gebrochene Stelle', [{ feld: 'art', zeile: 0, von: 0.5, bis: 3 }]],
    ['eine Stelle als Text', [{ feld: 'art', zeile: '0', von: 0, bis: 3 }]],
    ['ein Ende vor dem Anfang', [{ feld: 'art', zeile: 0, von: 5, bis: 5 }]],
    ['ein Ende hinter der Zeile', [{ feld: 'art', zeile: 0, von: 15, bis: 26 }]],
    ['nur Leerraum', [{ feld: 'art', zeile: 0, von: 11, bis: 12 }]],
    [
      'dieselbe Stelle zweimal',
      [
        { feld: 'heilmittel', zeile: 2, von: 0, bis: 20 },
        { feld: 'heilmittel', zeile: 2, von: 0, bis: 20 },
      ],
    ],
    [
      'ein Feld öfter als erlaubt',
      [
        { feld: 'verordnende', zeile: 1, von: 0, bis: 3 },
        { feld: 'verordnende', zeile: 1, von: 4, bis: 8 },
      ],
    ],
    ['nichts', null],
  ])('weist eine Antwort ab: %s', (_fall, fundstellen) => {
    expect(setzeFelder(ZEILEN, fundstellen, VERORDNUNG_FELDER)).toBeNull();
  });
});

describe('Nachbildung: Felder vom Foto', () => {
  it('findet die Felder ihrer festen Verordnung, jeden Wert im Wortlaut', () => {
    const stellen = findeFelder(NACHGEBILDETE_VERORDNUNG, Object.keys(VERORDNUNG_FELDER));
    expect(setzeFelder(NACHGEBILDETE_VERORDNUNG, stellen, VERORDNUNG_FELDER)).toEqual([
      { feld: 'ausgestellt_am', wert: '02.11.2026', zeile: 'Ausgestellt am 02.11.2026' },
      { feld: 'art', wert: 'Folgeverordnung', zeile: 'Folgeverordnung' },
      { feld: 'verordnende', wert: 'Dr. med. Petra Probst', zeile: 'Dr. med. Petra Probst' },
      { feld: 'icd10', wert: 'M17.1', zeile: 'ICD-10: M17.1' },
      {
        feld: 'diagnose',
        wert: 'Gonarthrose rechts, Belastungsschmerz',
        zeile: 'Gonarthrose rechts, Belastungsschmerz',
      },
      { feld: 'heilmittel', wert: 'Krankengymnastik 6 x', zeile: 'Krankengymnastik 6 x' },
      { feld: 'heilmittel', wert: 'Manuelle Therapie 6 x', zeile: 'Manuelle Therapie 6 x' },
      { feld: 'hausbesuch', wert: 'Hausbesuch: ja', zeile: 'Hausbesuch: ja' },
    ]);
  });

  it('nennt nur Felder, nach denen gefragt ist, und erfindet ohne Treffer nichts', () => {
    expect(findeFelder(NACHGEBILDETE_VERORDNUNG, ['icd10'])).toEqual([
      { feld: 'icd10', zeile: 4, von: 8, bis: 13 },
    ]);
    expect(findeFelder(['Unleserlich', '[unleserlich]'], Object.keys(VERORDNUNG_FELDER))).toEqual(
      [],
    );
  });
});
