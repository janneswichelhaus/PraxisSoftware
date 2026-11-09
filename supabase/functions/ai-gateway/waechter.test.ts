import { describe, expect, it } from 'vitest';
import { alltagssprachlich, ausformuliert } from './mock.ts';
import {
  gleicherGehalt,
  masseinheiten,
  pruefeUmformung,
  seiten,
  stuecke,
  unsicher,
  verneinungen,
  zahlen,
} from './waechter.ts';

// Die feste Fallsammlung zum Umformen (ANN-861, PROJECT_PRINCIPLES.md 6.3): was ein Adapter
// liefern kann, auch ein falscher. Ein künftiger Anbieter bekommt dieselben Fälle.

describe('Wächter: was sie lesen', () => {
  it('liest Zahlen als Ziffern, mit Wiederholung, Komma wie Punkt', () => {
    expect(zahlen('Beugung 110 Grad, links 135, NRS 3,5 von 10; 3.5 kg')).toEqual(
      ['10', '110', '135', '3.5', '3.5'].sort(),
    );
    expect(zahlen('zweimal täglich')).toEqual([]);
  });

  it('liest Körperseiten ausgeschrieben und abgekürzt', () => {
    expect(seiten('Knie li. und die rechte Schulter')).toEqual(['links', 'rechts']);
    expect(seiten('bds. Wade, beidseitig gedehnt')).toEqual(['beidseits']);
    expect(seiten('Rechts, RECHTS, rechtem')).toEqual(['rechts']);
    // Kein Wortteil: „Reha“, „Linie“, „Recht“ sind keine Seiten.
    expect(seiten('Reha nach Linie, mit Recht')).toEqual([]);
  });

  it('liest Einheiten als Wort, Zeichen und „3x“', () => {
    expect(masseinheiten('110° und 20 %')).toEqual(['grad', 'prozent']);
    expect(masseinheiten('3x 10 Wdh., 5 Min. Pause, 2 Wochen')).toEqual([
      'mal',
      'min',
      'wdh',
      'woche',
    ]);
    expect(masseinheiten('3 × täglich')).toEqual(['mal']);
    expect(masseinheiten('Typ 2 Xylit, mindestens')).toEqual([]);
  });

  it('zählt Verneinungen und erkennt Unsicherheit', () => {
    expect(verneinungen('Keine Schwellung, nicht warm, ohne Erguss')).toBe(3);
    expect(verneinungen('Nichtraucher, Kniegelenk')).toBe(0);
    expect(unsicher('Vielleicht nächste Woche')).toBe(true);
    expect(unsicher('ca. 10 Minuten')).toBe(true);
    expect(unsicher('Sicher nächste Woche')).toBe(false);
  });

  it('teilt in Sätze je Zeile und hält Abkürzungen und Zahlen zusammen', () => {
    expect(
      stuecke('  knie li. kühlen, 10 Min. \r\n\r\n übungen 2x tägl. weiter. Dann Pause.'),
    ).toEqual([
      { text: 'knie li. kühlen, 10 Min.', zeile: 0 },
      { text: 'übungen 2x tägl. weiter.', zeile: 2 },
      { text: 'Dann Pause.', zeile: 2 },
    ]);
    expect(stuecke('Am 12. kommen, z. B. um 9. Passt das?')).toEqual([
      { text: 'Am 12. kommen, z. B. um 9. Passt das?', zeile: 0 },
    ]);
    expect(stuecke(' \n ')).toEqual([]);
  });

  it('teilt bei einer unbekannten Abkürzung feiner, nie gröber', () => {
    expect(stuecke('Tape lat. anlegen').map((stueck) => stueck.text)).toEqual([
      'Tape lat.',
      'anlegen',
    ]);
  });
});

interface Fall {
  readonly name: string;
  readonly quelle: string;
  readonly besteht: readonly string[];
  readonly faelltDurch: readonly (readonly [string, string])[];
}

const FAELLE: readonly Fall[] = [
  {
    name: 'Zahl und Einheit',
    quelle: 'übungen 2x tägl. je 10 min',
    besteht: [
      'Übungen 2-mal täglich je 10 Minuten.',
      'Bitte die Übungen 2x täglich je 10 Minuten machen.',
    ],
    faelltDurch: [
      ['andere Zahl', 'Übungen 3-mal täglich je 10 Minuten.'],
      ['Zahl fehlt', 'Übungen 2-mal täglich.'],
      ['Zahl als Wort', 'Übungen zweimal täglich je zehn Minuten.'],
      ['andere Einheit', 'Übungen 2-mal täglich je 10 Stunden.'],
      ['Zahl dazu', 'Übungen 2-mal täglich je 10 Minuten, 6 Wochen lang.'],
    ],
  },
  {
    name: 'Körperseite',
    quelle: 'knie li. kühlen',
    besteht: ['Das linke Knie kühlen.', 'Knie links kühlen.'],
    faelltDurch: [
      ['andere Seite', 'Das rechte Knie kühlen.'],
      ['Seite fehlt', 'Das Knie kühlen.'],
      ['Seite dazu', 'Das linke und rechte Knie kühlen.'],
    ],
  },
  {
    name: 'Verneinung',
    quelle: 'treppe noch nicht, keine sprünge',
    besteht: ['Noch nicht Treppe steigen, keine Sprünge.', 'Treppe noch nicht und ohne Sprünge.'],
    faelltDurch: [
      ['Verneinung fehlt', 'Treppe steigen, keine Sprünge.'],
      ['ins Gegenteil', 'Treppe und Sprünge sind in Ordnung.'],
      ['Verneinung dazu', 'Treppe noch nicht, keine Sprünge, nie ohne Schiene.'],
    ],
  },
  {
    name: 'Unsicherheit',
    quelle: 'vielleicht ab nächster woche joggen?',
    besteht: ['Vielleicht können Sie ab nächster Woche joggen?'],
    faelltDurch: [
      ['Unsicherheit fehlt', 'Ab nächster Woche joggen?'],
      ['Frage wird Aussage', 'Vielleicht ab nächster Woche joggen.'],
      ['Gewissheit', 'Ab nächster Woche können Sie joggen.'],
    ],
  },
  {
    name: 'Sichere Aussage',
    quelle: 'termin am dienstag passt',
    besteht: ['Der Termin am Dienstag passt.'],
    faelltDurch: [
      ['Unsicherheit dazu', 'Der Termin am Dienstag passt vielleicht.'],
      ['Rat angefügt', 'Der Termin am Dienstag passt. Bitte vorher kühlen.'],
      ['Frage dazu', 'Passt der Termin am Dienstag?'],
      ['leer', '   '],
      [
        'viel länger',
        'Der Termin am Dienstag passt, und bis dahin sollten Sie das Knie regelmäßig bewegen, hochlagern und abends mit einem Tuch umwickelt für eine Weile kühlen, damit es sich gut erholt.',
      ],
    ],
  },
  {
    name: 'Unverständliches',
    quelle: 'weiter mit [unverständlich] am abend',
    besteht: ['Weiter mit [unverständlich] am Abend.'],
    faelltDurch: [['geraten', 'Weiter mit Dehnen am Abend.']],
  },
];

describe('Wächter: feste Fälle', () => {
  it.each(FAELLE.flatMap((fall) => fall.besteht.map((satz) => [fall.name, fall.quelle, satz])))(
    '%s: „%s“ → „%s“ besteht',
    (_name, quelle, satz) => {
      expect(gleicherGehalt(quelle, satz)).toBe(true);
      expect(pruefeUmformung([quelle], [satz])).toEqual([{ text: satz, unveraendert: false }]);
    },
  );

  it.each(
    FAELLE.flatMap((fall) =>
      fall.faelltDurch.map(([grund, satz]) => [fall.name, grund, fall.quelle, satz]),
    ),
  )('%s, %s: Es bleibt die Quelle im Wortlaut', (_name, _grund, quelle, satz) => {
    expect(pruefeUmformung([quelle], [satz])).toEqual([{ text: quelle, unveraendert: true }]);
  });

  it('lässt die Quelle selbst immer bestehen', () => {
    for (const { quelle } of FAELLE) {
      expect(pruefeUmformung([quelle], [quelle])).toEqual([{ text: quelle, unveraendert: true }]);
    }
  });

  it('prüft jeden Satz für sich und behält die Reihenfolge', () => {
    expect(
      pruefeUmformung(
        ['knie li. kühlen', 'übungen 2x tägl.'],
        ['Das rechte Knie kühlen.', 'Übungen 2-mal täglich.'],
      ),
    ).toEqual([
      { text: 'knie li. kühlen', unveraendert: true },
      { text: 'Übungen 2-mal täglich.', unveraendert: false },
    ]);
  });

  it('erlaubt je Stück genau einen Satz - ein angefügter fällt auf', () => {
    expect(
      pruefeUmformung(
        ['Knie ist gut.', 'Übungen weiter.'],
        ['Das Knie ist gut.', 'Die Übungen laufen weiter. Bis bald.'],
      ),
    ).toEqual([
      { text: 'Das Knie ist gut.', unveraendert: false },
      { text: 'Übungen weiter.', unveraendert: true },
    ]);
  });

  it('zählt Abkürzungen der Quelle nicht als Platz für einen weiteren Satz', () => {
    const quelle = 'knie li. kühlen, 10 Min.';
    expect(stuecke(quelle)).toHaveLength(1);
    expect(pruefeUmformung([quelle], ['Knie links kühlen, 10 Minuten. Bitte hochlagern.'])).toEqual(
      [{ text: quelle, unveraendert: true }],
    );
  });

  it('erkennt einen angefügten Nebensatz ohne Zahl, Seite oder Verneinung nicht', () => {
    // Die Grenze der Wächter: Deshalb steht auf der Seite jede Quelle neben ihrem Satz, und
    // gesendet wird erst nach ausdrücklicher Übernahme (ANN-861, ADR-005 Punkt 7).
    expect(
      pruefeUmformung(['knie li. kühlen'], ['Knie links kühlen und bitte hochlagern.']),
    ).toEqual([{ text: 'Knie links kühlen und bitte hochlagern.', unveraendert: false }]);
  });

  it('glättet Leerraum, bevor es vergleicht', () => {
    expect(pruefeUmformung(['termin passt'], ['  Der Termin\n passt.  '])).toEqual([
      { text: 'Der Termin passt.', unveraendert: false },
    ]);
  });

  it.each([
    ['keine Liste', { 0: 'Der Termin passt.' }],
    ['ein Satz zu wenig', []],
    ['ein Satz zu viel', ['Der Termin passt.', 'Bitte kühlen.']],
    ['eine Zahl statt Text', [7]],
    ['ein Objekt statt Text', [{ text: 'Der Termin passt.' }]],
    ['nichts', null],
  ])('weist die ganze Antwort ab: %s', (_fall, behauptung) => {
    expect(pruefeUmformung(['termin passt'], behauptung)).toBeNull();
  });
});

describe('Nachbildung: Ausformulieren', () => {
  it.each([
    ['knie treppe ok', 'Knie treppe ok.'],
    ['übungen 2x tägl. weiter', 'Übungen 2-mal täglich weiter.'],
    ['knie li. kühlen, 10 Min.', 'Knie links kühlen, 10 Minuten.'],
    ['evtl. bds. tapen, 3 × 15 Wdh.', 'Eventuell beidseits tapen, 3-mal 15 Wiederholungen.'],
    ['Schon ein Satz.', 'Schon ein Satz.'],
    ['geht das?', 'Geht das?'],
  ])('schreibt „%s“ als „%s“', (stichpunkt, satz) => {
    expect(ausformuliert(stichpunkt)).toBe(satz);
  });

  it('schreibt eine Seite vor einem Hauptwort nicht aus - dort bleibt die Quelle stehen', () => {
    // „am rechts Knie“ wäre falsch; mit dem Punkt der Abkürzung besteht der Satz die Wächter nicht.
    const quelle = 'kühlen am re. Knie';
    expect(ausformuliert(quelle)).toBe('Kühlen am re. Knie.');
    expect(pruefeUmformung([quelle], [ausformuliert(quelle)])).toEqual([
      { text: quelle, unveraendert: true },
    ]);
    expect(alltagssprachlich('Ödem am li. Knöchel.')).toBe('Ödem (Schwellung) am li. Knöchel.');
  });

  it('besteht mit jedem Stichpunkt die Wächter', () => {
    const quellen = [
      'knie treppe ok',
      'übungen 2x tägl. weiter',
      'knie li. kühlen, 10 Min.',
      'evtl. bds. tapen, 3 × 15 Wdh.',
      'keine sprünge, nicht joggen',
      'vielleicht ab nächster woche?',
    ];
    const ergebnis = pruefeUmformung(quellen, quellen.map(ausformuliert));
    expect(ergebnis?.map((satz) => satz.unveraendert)).toEqual(quellen.map(() => false));
  });
});

describe('Nachbildung: Alltagssprache', () => {
  it.each([
    ['Die Flexion ist besser.', 'Die Flexion (Beugung) ist besser.'],
    [
      'Ödem lateral am Knöchel li., LWS frei.',
      'Ödem (Schwellung) lateral (außen) am Knöchel links, LWS (Lendenwirbelsäule) frei.',
    ],
    [
      'Kein Hämatom, Quadrizeps 3x 10 Wdh.',
      'Kein Hämatom (Bluterguss), Quadrizeps (vorderer Oberschenkelmuskel) 3-mal 10 Wiederholungen.',
    ],
    // Schon erklärt oder nicht in der Liste: bleibt, wie es ist.
    ['Flexion (Beugung) bis 110 Grad.', 'Flexion (Beugung) bis 110 Grad.'],
    ['Bitte weiter üben.', 'Bitte weiter üben.'],
    // Kein Wortteil: „medialisiert“ ist nicht „medial“.
    ['Patella medialisiert?', 'Patella (Kniescheibe) medialisiert?'],
  ])('erklärt „%s“', (satz, erwartet) => {
    expect(alltagssprachlich(satz)).toBe(erwartet);
  });

  it('besteht mit jedem Satz die Wächter und ändert nichts zweimal', () => {
    const quellen = [
      'Ödem lateral am Knöchel li., LWS frei.',
      'Kein Hämatom, Quadrizeps 3x 10 Wdh.',
      'Vielleicht Kontraktur?',
      'Bitte weiter üben.',
    ];
    const einmal = quellen.map(alltagssprachlich);
    expect(pruefeUmformung(quellen, einmal)?.map((satz) => satz.unveraendert)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(einmal.map(alltagssprachlich)).toEqual(einmal);
  });
});
