import { describe, expect, it } from 'vitest';
import { auszugssaetze, setzeAuszug, type Quelleintrag } from './auszug.ts';
import { ersterUndLetzter } from './mock.ts';
import { AUSZUG_HOECHST_JE_EINTRAG, DIKTAT_ABSCHNITTE } from './zwecke.ts';

// Der Auszug als Bauart (ANN-861): Ein Adapter nennt nur Stellen, der Gateway setzt die Sätze
// im Wortlaut. Ein Satz, der in keiner Quelle steht, hat in der Antwort keinen Platz.

const EINS = '88888888-8888-4888-8888-000000000001';
const ZWEI = '88888888-8888-4888-8888-000000000002';

const EINTRAEGE: readonly Quelleintrag[] = [
  {
    id: EINS,
    saetze: ['Patientin berichtet Schmerz 3 von 10.', 'Beugung 110 Grad.', 'Weiter üben.'],
  },
  { id: ZWEI, saetze: ['Keine Schwellung.'] },
];

describe('Auszug: was ein Adapter liefern kann', () => {
  it('setzt die gewählten Sätze im Wortlaut, je Eintrag in dessen Reihenfolge', () => {
    expect(
      setzeAuszug(
        EINTRAEGE,
        [
          { eintrag: 1, satz: 0 },
          { eintrag: 0, satz: 2 },
          { eintrag: 0, satz: 0 },
        ],
        2,
      ),
    ).toEqual([
      { id: EINS, saetze: ['Patientin berichtet Schmerz 3 von 10.', 'Weiter üben.'] },
      { id: ZWEI, saetze: ['Keine Schwellung.'] },
    ]);
  });

  it('lässt einen Eintrag ohne gewählten Satz weg und nimmt eine leere Auswahl an', () => {
    expect(setzeAuszug(EINTRAEGE, [{ eintrag: 1, satz: 0 }], 2)).toEqual([
      { id: ZWEI, saetze: ['Keine Schwellung.'] },
    ]);
    expect(setzeAuszug(EINTRAEGE, [], 2)).toEqual([]);
  });

  it.each([
    ['keine Liste', { eintrag: 0, satz: 0 }],
    ['Text statt Stelle', ['Insgesamt rückläufige Beschwerden.']],
    [
      'ein Satz als Feld',
      [
        { eintrag: 0, satz: 0, text: 'Insgesamt besser.' },
        { eintrag: 0, satz: 'x' },
      ],
    ],
    ['einen Eintrag, den es nicht gibt', [{ eintrag: 2, satz: 0 }]],
    ['einen Satz, den es nicht gibt', [{ eintrag: 1, satz: 1 }]],
    ['eine negative Stelle', [{ eintrag: 0, satz: -1 }]],
    ['eine gebrochene Stelle', [{ eintrag: 0, satz: 0.5 }]],
    [
      'denselben Satz zweimal',
      [
        { eintrag: 0, satz: 1 },
        { eintrag: 0, satz: 1 },
      ],
    ],
    [
      'mehr Sätze je Eintrag als erlaubt',
      [
        { eintrag: 0, satz: 0 },
        { eintrag: 0, satz: 1 },
        { eintrag: 0, satz: 2 },
      ],
    ],
    ['nichts', null],
  ])('weist eine Auswahl ab: %s', (_fall, auswahl) => {
    expect(setzeAuszug(EINTRAEGE, auswahl, 2)).toBeNull();
  });

  it('gibt nie ein Feld der Auswahl weiter - nur Kennung und Wortlaut der Quelle', () => {
    const auszuege = setzeAuszug(EINTRAEGE, [{ eintrag: 0, satz: 1, bewertung: 'besser' }], 2);
    expect(auszuege).toEqual([{ id: EINS, saetze: ['Beugung 110 Grad.'] }]);
  });
});

describe('Auszug: Sätze eines Eintrags', () => {
  it('nimmt die Titel der Vorlage als Gliederung, nie als Satz', () => {
    const text =
      'Angaben der Patient:in\nPatientin berichtet, besser.\n\nBefund:\nBeugung 110 Grad. Keine Schwellung.\n\nPLAN\nTreppe üben.';
    expect(auszugssaetze(text, DIKTAT_ABSCHNITTE)).toEqual([
      'Patientin berichtet, besser.',
      'Beugung 110 Grad.',
      'Keine Schwellung.',
      'Treppe üben.',
    ]);
  });

  it.each([
    ['Patientin sagt, sie gehe wieder 30 Min. am Stück.'],
    ['Kein Erguss seit der 2. Woche, aber li. deutliche Schwellung.'],
    ['Schmerzfrei bis ca. 20 Min. Gehen, danach max. 6 von 10 Punkten.'],
    ['Übungen 2x tägl. weiter, ggf. bds. kühlen.'],
  ])('schneidet nach einer Abkürzung keinen halben Satz ab: %s', (satz) => {
    expect(auszugssaetze(`${satz} Weiter üben.`, DIKTAT_ABSCHNITTE)).toEqual([
      satz,
      'Weiter üben.',
    ]);
  });

  it('lässt nach einer Zahl mit Punkt lieber zwei Sätze beisammen, als einen zu teilen', () => {
    expect(auszugssaetze('Schmerz 6 von 10. Weiter üben.', DIKTAT_ABSCHNITTE)).toEqual([
      'Schmerz 6 von 10. Weiter üben.',
    ]);
  });

  it('trennt an der Zeile und lässt Leerzeilen aus', () => {
    expect(auszugssaetze('Erste Zeile ohne Punkt\r\n\r\n  Zweite. Dritte!  ', [])).toEqual([
      'Erste Zeile ohne Punkt',
      'Zweite.',
      'Dritte!',
    ]);
    expect(auszugssaetze(' \n ', DIKTAT_ABSCHNITTE)).toEqual([]);
    expect(auszugssaetze('Befund\nPlan:', DIKTAT_ABSCHNITTE)).toEqual([]);
  });
});

describe('Nachbildung: Auszug', () => {
  it('nennt je Eintrag den ersten und den letzten Satz und hält die Grenze ein', () => {
    const stellen = ersterUndLetzter(EINTRAEGE.map((eintrag) => eintrag.saetze));
    expect(stellen).toEqual([
      { eintrag: 0, satz: 0 },
      { eintrag: 0, satz: 2 },
      { eintrag: 1, satz: 0 },
    ]);
    expect(setzeAuszug(EINTRAEGE, stellen, AUSZUG_HOECHST_JE_EINTRAG)).toEqual([
      { id: EINS, saetze: ['Patientin berichtet Schmerz 3 von 10.', 'Weiter üben.'] },
      { id: ZWEI, saetze: ['Keine Schwellung.'] },
    ]);
  });

  it('nennt für einen Eintrag ohne Satz nichts', () => {
    expect(ersterUndLetzter([[], ['Nur ein Satz.']])).toEqual([{ eintrag: 1, satz: 0 }]);
  });
});
