import { describe, expect, it } from 'vitest';
import { saetze, setzeZusammen } from './inhaltstreue.ts';
import { NACHGEBILDETES_DIKTAT, ordneZu } from './mock.ts';
import { DIKTAT_ABSCHNITTE } from './zwecke.ts';

// Die feste Fallsammlung zur Inhaltstreue (§6.3, ADR-006 Punkt 8): Sie läuft gegen die
// Nachbildung und gegen jede denkbare Zuordnung; ein künftiger Adapter bekommt dieselben Fälle.

interface Fall {
  readonly name: string;
  readonly transkript: string;
  /** Was nach §6.3 wörtlich erhalten bleiben muss. */
  readonly erhalten: readonly string[];
  /** Die Zuordnung der Nachbildung je Satz. */
  readonly erwartet: readonly string[];
}

const FAELLE: readonly Fall[] = [
  {
    name: 'Nachgebildetes Diktat',
    transkript: NACHGEBILDETES_DIKTAT,
    erhalten: ['drei von zehn', 'rechte Knie', '110 Grad', 'links 135 Grad', 'Keine Schwellung'],
    erwartet: ['Angaben der Patient:in', 'Befund', 'Befund', 'Behandlung', 'Plan'],
  },
  {
    name: 'Verneinung und Seite',
    transkript:
      'Patient gibt an, links nicht mehr taub. Kein Druckschmerz rechts, Streckung links minus 5 Grad.',
    erhalten: ['links nicht mehr taub', 'Kein Druckschmerz rechts', 'minus 5 Grad'],
    erwartet: ['Angaben der Patient:in', 'Befund'],
  },
  {
    name: 'Unsicherheit und Unverständliches',
    transkript:
      'Rötung eher nicht, unklar. Patientin sagt, vielleicht [unverständlich] seit Dienstag. Plan: Kontrolle in 2 Wochen?',
    erhalten: ['eher nicht, unklar', 'vielleicht [unverständlich]', 'in 2 Wochen?'],
    erwartet: ['Befund', 'Angaben der Patient:in', 'Plan'],
  },
  {
    name: 'Einschätzung der Therapeut:in bleibt ihre Aussage',
    transkript:
      'Befund: Gang hinkend. Ich vermute eine Überlastung. Behandlung Gangschule 20 Minuten. Weiter mit Kräftigung, 3 × 10.',
    erhalten: ['Ich vermute eine Überlastung', '20 Minuten', '3 × 10'],
    erwartet: ['Befund', 'Befund', 'Behandlung', 'Plan'],
  },
  {
    name: 'Ohne Satzzeichen',
    transkript: 'Schulter rechts Abduktion 90 Grad schmerzfrei',
    erhalten: ['Abduktion 90 Grad'],
    erwartet: ['Befund'],
  },
];

/** Die Wörter eines Textes - alles zwischen Leerraum, Satzzeichen eingeschlossen. */
function woerter(text: string): string[] {
  return text
    .split(/\s+/u)
    .filter((wort) => wort !== '')
    .sort();
}

function gesamt(abschnitte: readonly { text: string }[]): string {
  return abschnitte.map((abschnitt) => abschnitt.text).join(' ');
}

describe('Inhaltstreue: feste Fälle', () => {
  it.each(FAELLE)('$name: die Nachbildung ordnet wie erwartet zu', (fall) => {
    expect(ordneZu(saetze(fall.transkript), DIKTAT_ABSCHNITTE)).toEqual(fall.erwartet);
  });

  it.each(FAELLE)('$name: jedes Wort genau einmal, Erhaltenes wörtlich', (fall) => {
    const liste = saetze(fall.transkript);
    const abschnitte = setzeZusammen(liste, fall.erwartet, DIKTAT_ABSCHNITTE)!;
    expect(woerter(gesamt(abschnitte))).toEqual(woerter(fall.transkript));
    for (const teil of fall.erhalten) expect(gesamt(abschnitte)).toContain(teil);
    expect(gesamt(abschnitte).split('[unverständlich]').length).toBe(
      fall.transkript.split('[unverständlich]').length,
    );
  });

  it.each(FAELLE)('$name: auch jede andere Zuordnung ändert kein Wort', (fall) => {
    const liste = saetze(fall.transkript);
    // Jeder Satz in jeden Abschnitt, satzweise versetzt: so viele Zuordnungen wie Abschnitte.
    for (let versatz = 0; versatz < DIKTAT_ABSCHNITTE.length; versatz += 1) {
      const zuordnung = liste.map(
        (_satz, stelle) => DIKTAT_ABSCHNITTE[(stelle + versatz) % DIKTAT_ABSCHNITTE.length]!,
      );
      const abschnitte = setzeZusammen(liste, zuordnung, DIKTAT_ABSCHNITTE)!;
      expect(woerter(gesamt(abschnitte))).toEqual(woerter(fall.transkript));
      for (const abschnitt of abschnitte) {
        // Ein Abschnitt ist genau seine Sätze, in der Reihenfolge des Diktats.
        const eigene = liste.filter((_satz, stelle) => zuordnung[stelle] === abschnitt.titel);
        expect(abschnitt.text).toBe(eigene.join(' '));
      }
    }
  });
});

describe('Inhaltstreue: was ein Adapter liefern kann', () => {
  const liste = saetze(NACHGEBILDETES_DIKTAT);
  const passend = ordneZu(liste, DIKTAT_ABSCHNITTE);

  it('setzt die Abschnitte in der Reihenfolge der Vorlage zusammen, leere entfallen', () => {
    const zuordnung = liste.map((_satz, stelle) => (stelle === 0 ? 'Plan' : 'Befund'));
    expect(setzeZusammen(liste, zuordnung, DIKTAT_ABSCHNITTE)!.map((a) => a.titel)).toEqual([
      'Befund',
      'Plan',
    ]);
  });

  it.each([
    ['keine Liste', { Befund: NACHGEBILDETES_DIKTAT }],
    ['zu wenige Einträge', passend.slice(1)],
    ['zu viele Einträge', [...passend, 'Befund']],
    ['einen erfundenen Abschnitt', ['Diagnose', ...passend.slice(1)]],
    ['Text statt Titel', ['Gonarthrose rechts.', ...passend.slice(1)]],
    ['eine Zahl statt Titel', [0, ...passend.slice(1)]],
    ['nichts', null],
  ])('weist eine Zuordnung mit %s ab', (_fall, zuordnung) => {
    expect(setzeZusammen(liste, zuordnung, DIKTAT_ABSCHNITTE)).toBeNull();
  });

  it('trennt Sätze nur an Leerraum nach einem Satzende', () => {
    expect(saetze('Beugung 110,5 Grad. Druck 3.5 kg!  Treppe?\nNein… gut')).toEqual([
      'Beugung 110,5 Grad.',
      'Druck 3.5 kg!',
      'Treppe?',
      'Nein…',
      'gut',
    ]);
    expect(saetze('   ')).toEqual([]);
  });
});
