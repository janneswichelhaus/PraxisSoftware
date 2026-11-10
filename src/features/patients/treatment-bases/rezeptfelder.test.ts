import { describe, expect, it } from 'vitest';
import type { Fundstelle } from '@/lib/ki/verordnung';
import { feldvorschlaege, tagAus, uebernimm, type Formularstand } from './rezeptfelder';

// Feste Regeln vom Wert zum Formular (ADR-005 Punkt 6): Was sich nicht sicher zuordnen lässt,
// wird gezeigt, aber nicht eingetragen; eingetragen wird nur in leere Felder.

const PROBST = '77777777-7777-4777-8777-000000000001';
const HAUSARZT = '77777777-7777-4777-8777-000000000002';
const KONTEXT = {
  verordnende: [
    { id: PROBST, name: 'Dr. med. Petra Probst' },
    { id: HAUSARZT, name: 'Hendrik Hausarzt' },
  ],
  // Im Fenster prüft `ICD10_MUSTER`; hier genügen zwei bekannte Codes.
  icd: (roh: string) => {
    const code = roh.trim().toUpperCase();
    return ['M17.1', 'M54.5'].includes(code) ? code : null;
  },
  heute: '2026-11-10',
};

function fund(feld: Fundstelle['feld'], wert: string, zeile = wert): Fundstelle {
  return { feld, wert, zeile };
}

const LEER: Formularstand = {
  issuedOn: '',
  kind: '',
  prescriberId: '',
  icd: '',
  diagnose: '',
  zeilen: [{ id: null, remedy: '', anzahl: '' }],
  hausbesuch: false,
};

describe('feldvorschlaege', () => {
  it('ordnet die Werte der Nachbildung vollständig zu', () => {
    const vorschlaege = feldvorschlaege(
      [
        fund('ausgestellt_am', '02.11.2026', 'Ausgestellt am 02.11.2026'),
        fund('art', 'Folgeverordnung'),
        fund('verordnende', 'Dr. med. Petra Probst'),
        fund('icd10', 'M17.1', 'ICD-10: M17.1'),
        fund('diagnose', 'Gonarthrose rechts, Belastungsschmerz'),
        fund('heilmittel', 'Krankengymnastik 6 x'),
        fund('heilmittel', 'Manuelle Therapie 6 x'),
        fund('hausbesuch', 'Hausbesuch: ja'),
      ],
      KONTEXT,
    );
    expect(vorschlaege.map((v) => [v.feld, v.wert, v.anzahl, v.grund])).toEqual([
      ['issued_on', '2026-11-02', null, null],
      ['kind', 'follow_up', null, null],
      ['prescriber_id', PROBST, null, null],
      ['icd', 'M17.1', null, null],
      ['diagnose', 'Gonarthrose rechts, Belastungsschmerz', null, null],
      ['position', 'Krankengymnastik', 6, null],
      ['position', 'Manuelle Therapie', 6, null],
      ['hausbesuch', 'ja', null, null],
    ]);
    expect(vorschlaege[0]!.quelle).toBe('Ausgestellt am 02.11.2026');
    expect(vorschlaege[2]!.anzeige).toBe('Dr. med. Petra Probst');
  });

  it.each([
    ['ein Tag, den es nicht gibt', fund('ausgestellt_am', '31.02.2026'), 'Kein Datum'],
    ['ein Tag in der Zukunft', fund('ausgestellt_am', '01.12.2026'), 'Liegt in der Zukunft'],
    ['eine unbekannte Art', fund('art', 'Privatrezept'), 'Keine bekannte Art'],
    [
      'eine Ärzt:in außerhalb des Verzeichnisses',
      fund('verordnende', 'Dr. Erna Fremd'),
      'Nicht im Verzeichnis',
    ],
    ['ein Code ohne ICD-Form', fund('icd10', 'Knie'), 'Kein ICD-10-Code'],
    [
      'ein Heilmittel außerhalb des Katalogs',
      fund('heilmittel', 'Wärmetherapie 6 x'),
      'Nicht im Katalog',
    ],
    ['ein Heilmittel ohne Anzahl', fund('heilmittel', 'Krankengymnastik'), 'Anzahl fehlt'],
    ['ein Hausbesuch ohne Kreuz', fund('hausbesuch', 'Hausbesuch: nein'), 'Nicht angekreuzt'],
  ])('trägt nichts ein für %s und sagt warum', (_fall, eingabe, grund) => {
    const [vorschlag] = feldvorschlaege([eingabe], KONTEXT);
    expect(vorschlag).toMatchObject({ wert: null, grund, anzeige: eingabe.wert });
  });

  it('erkennt Kürzel, Doppelbehandlung und zweistellige Jahre', () => {
    const vorschlaege = feldvorschlaege(
      [
        fund('heilmittel', 'KG 10x'),
        fund('heilmittel', 'MT Doppelbehandlung 6 mal'),
        fund('ausgestellt_am', '2.11.26'),
        fund('art', 'Erstverordnung'),
      ],
      KONTEXT,
    );
    expect(vorschlaege.map((v) => [v.wert, v.anzahl])).toEqual([
      ['Krankengymnastik', 10],
      ['Manuelle Therapie als Doppelbehandlung', 6],
      ['2026-11-02', null],
      ['first', null],
    ]);
  });

  it('findet eine Ärzt:in auch ohne Titel - aber nur eindeutig', () => {
    expect(feldvorschlaege([fund('verordnende', 'Petra Probst')], KONTEXT)[0]!.wert).toBe(PROBST);
    const doppelt = {
      ...KONTEXT,
      verordnende: [...KONTEXT.verordnende, { id: 'x', name: 'Dr. Paul Probst' }],
    };
    expect(feldvorschlaege([fund('verordnende', 'Probst')], doppelt)[0]!.wert).toBeNull();
  });

  it('nimmt keine Anzahl über der Grenze der Datenbank', () => {
    expect(feldvorschlaege([fund('heilmittel', 'KG 600 x')], KONTEXT)[0]!.grund).toBe(
      'Anzahl fehlt',
    );
  });
});

describe('tagAus', () => {
  it('liest nur Tage, die es gibt', () => {
    expect(tagAus('29.02.2028')).toBe('2028-02-29');
    expect(tagAus('29.02.2027')).toBeNull();
    expect(tagAus('2026-11-02')).toBeNull();
    expect(tagAus('02.11.2026 ')).toBe('2026-11-02');
  });
});

describe('uebernimm', () => {
  const vorschlaege = feldvorschlaege(
    [
      fund('ausgestellt_am', '02.11.2026'),
      fund('verordnende', 'Dr. Erna Fremd'),
      fund('icd10', 'M17.1'),
      fund('heilmittel', 'KG 6 x'),
      fund('hausbesuch', 'Hausbesuch: ja'),
    ],
    KONTEXT,
  );

  it('füllt leere Felder und lässt Werte ohne Zuordnung leer', () => {
    const { stand, uebernommen, belassen } = uebernimm(LEER, vorschlaege);
    expect(stand).toEqual({
      ...LEER,
      issuedOn: '2026-11-02',
      icd: 'M17.1',
      zeilen: [{ id: null, remedy: 'Krankengymnastik', anzahl: '6' }],
      hausbesuch: true,
    });
    expect([uebernommen, belassen]).toEqual([4, 0]);
  });

  it('überschreibt nichts, was schon dasteht', () => {
    const ausgefuellt: Formularstand = {
      ...LEER,
      issuedOn: '2026-10-30',
      icd: 'M17.1',
      zeilen: [{ id: null, remedy: 'Manuelle Therapie', anzahl: '10' }],
    };
    const { stand, uebernommen, belassen } = uebernimm(ausgefuellt, vorschlaege);
    expect(stand).toEqual({ ...ausgefuellt, hausbesuch: true });
    expect([uebernommen, belassen]).toEqual([1, 2]);
  });
});
