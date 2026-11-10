import { describe, expect, it } from 'vitest';
import { einheiten, ordne, verbinde } from './inhaltstreue.ts';
import { erstelleAssistenznachbildung, ordneZu } from './mock.ts';
import { DIKTAT_ABSCHNITTE } from './zwecke.ts';

// Ordnen als Bauart (ANN-861): Der Vorschlag enthält genau die Sätze des getippten Textes, jeden
// einmal und im Wortlaut. Die Fälle laufen gegen die Nachbildung und gegen falsche Zuordnungen.

const VORLAGE = DIKTAT_ABSCHNITTE;

/** Alle Sätze des Vorschlags, wie die Seite sie zählt: zeilenweise, ohne Titel. */
function saetzeDesVorschlags(abschnitte: readonly { text: string }[]): string[] {
  return abschnitte.flatMap((abschnitt) => einheiten(abschnitt.text, []).map((e) => e.text));
}

function geordnet(text: string) {
  const liste = einheiten(text, VORLAGE);
  const frei = liste.filter((einheit) => einheit.titel === null).map((einheit) => einheit.text);
  return { liste, abschnitte: ordne(liste, ordneZu(frei, VORLAGE), VORLAGE) };
}

const FAELLE: readonly { name: string; text: string; erhalten: readonly string[] }[] = [
  {
    name: 'freie Notizen in einer Zeile',
    text: 'Patientin berichtet, rechtes Knie besser, 3 von 10. Keine Schwellung. Beugung rechts 110 Grad. Mobilisation Knie rechts. Nächstes Mal Treppe.',
    erhalten: ['3 von 10', 'Keine Schwellung', 'rechts 110 Grad'],
  },
  {
    name: 'Stichpunkte je Zeile ohne Satzzeichen',
    text: 'Pat. sagt Schmerz nachts\nBeugung li 95 Grad\nkein Erguss\nweiter mit Kräftigung',
    erhalten: ['Beugung li 95 Grad', 'kein Erguss'],
  },
  {
    name: 'Unsicherheit und Verneinung',
    text: 'Rötung eher nicht, unklar. Vielleicht Meniskus? Nicht belastet.',
    erhalten: ['eher nicht, unklar', 'Vielleicht Meniskus?', 'Nicht belastet.'],
  },
  {
    name: 'schon geordnet und Freies dahinter',
    text: 'Befund\nBeugung rechts 110 Grad. Keine Schwellung.\n\nPlan\nTreppe üben.\n\nPatient gibt an, nachts ruhig. Massage Wade links.',
    erhalten: ['Beugung rechts 110 Grad.', 'Treppe üben.', 'nachts ruhig', 'Wade links'],
  },
];

describe('Ordnen: feste Fälle', () => {
  it.each(FAELLE)('$name: jeder Satz genau einmal und im Wortlaut', ({ text, erhalten }) => {
    const { liste, abschnitte } = geordnet(text);
    expect(abschnitte).not.toBeNull();
    expect(saetzeDesVorschlags(abschnitte!).sort()).toEqual(liste.map((e) => e.text).sort());
    const gesamt = abschnitte!.map((abschnitt) => abschnitt.text).join('\n');
    for (const stelle of erhalten) expect(gesamt).toContain(stelle);
  });

  it.each(FAELLE)('$name: Abschnitte in der Reihenfolge der Vorlage', ({ text }) => {
    const titel = geordnet(text).abschnitte!.map((abschnitt) => abschnitt.titel);
    expect(titel).toEqual(VORLAGE.filter((eintrag) => titel.includes(eintrag)));
  });

  it.each(FAELLE)('$name: ein zweites Ordnen ändert nichts', ({ text }) => {
    const einmal = geordnet(text).abschnitte!;
    const alsText = einmal.map((abschnitt) => `${abschnitt.titel}\n${abschnitt.text}`).join('\n\n');
    expect(geordnet(alsText).abschnitte).toEqual(einmal);
  });
});

describe('Ordnen: Gliederung im Text', () => {
  it('nimmt eine Zeile, die nur ein Titel der Vorlage ist, als Gliederung', () => {
    const liste = einheiten('befund:\nBeugung 110 Grad.\nKein Erguss.\n\nfrei danach', VORLAGE);
    expect(liste).toEqual([
      { text: 'Beugung 110 Grad.', zeile: 1, titel: 'Befund' },
      { text: 'Kein Erguss.', zeile: 2, titel: 'Befund' },
      { text: 'frei danach', zeile: 4, titel: null },
    ]);
  });

  it('lässt unter einem Titel stehen, was dort steht - auch gegen die Signalwörter', () => {
    const { abschnitte } = geordnet('Plan\nPatientin berichtet weiter Schmerz.');
    expect(abschnitte).toEqual([{ titel: 'Plan', text: 'Patientin berichtet weiter Schmerz.' }]);
  });

  it('nimmt einen Titel mitten im Satz nicht als Gliederung', () => {
    const liste = einheiten('Befund unauffällig.\nPlan: Kontrolle in 2 Wochen.', VORLAGE);
    expect(liste.map((einheit) => einheit.titel)).toEqual([null, null]);
  });

  it('kennt nur die Titel der Vorlage', () => {
    expect(einheiten('Diagnose\nGonarthrose.', VORLAGE).map((e) => e.text)).toEqual([
      'Diagnose',
      'Gonarthrose.',
    ]);
  });

  it('hält Sätze einer Zeile zusammen und Zeilen getrennt', () => {
    const liste = einheiten('Eins. Zwei.\nDrei', VORLAGE);
    expect(verbinde(liste)).toBe('Eins. Zwei.\nDrei');
  });

  it('schickt nichts zum Zuordnen, wenn alles unter einem Titel steht', () => {
    const liste = einheiten('Befund\nBeugung 110 Grad.', VORLAGE);
    expect(ordne(liste, [], VORLAGE)).toEqual([{ titel: 'Befund', text: 'Beugung 110 Grad.' }]);
  });

  it.each(['', '   \n\n', 'Befund\n\nPlan:\n'])('findet in %j keinen Satz', (text) => {
    expect(einheiten(text, VORLAGE)).toEqual([]);
    expect(ordne([], [], VORLAGE)).toEqual([]);
  });
});

describe('Ordnen: was ein Adapter liefern kann', () => {
  const liste = einheiten(
    'Befund\nSchon geordnet.\n\nErster freier Satz. Zweiter freier Satz.',
    VORLAGE,
  );

  it('nimmt eine passende Zuordnung der freien Sätze', () => {
    expect(ordne(liste, ['Plan', 'Befund'], VORLAGE)).toEqual([
      { titel: 'Befund', text: 'Schon geordnet.\nZweiter freier Satz.' },
      { titel: 'Plan', text: 'Erster freier Satz.' },
    ]);
  });

  it.each([
    ['keine Liste', { 0: 'Befund', 1: 'Plan' }],
    ['zu wenige Einträge', ['Befund']],
    ['zu viele Einträge', ['Befund', 'Plan', 'Plan']],
    ['einen Eintrag je Satz statt je freiem Satz', ['Befund', 'Befund', 'Plan']],
    ['einen erfundenen Abschnitt', ['Diagnose', 'Plan']],
    ['Text statt Titel', ['Gonarthrose rechts.', 'Plan']],
    ['eine Zahl statt Titel', [1, 'Plan']],
    ['nichts', null],
  ])('weist eine Zuordnung mit %s ab', (_fall, zuordnung) => {
    expect(ordne(liste, zuordnung, VORLAGE)).toBeNull();
  });
});

describe('Nachbildung: Ordnen', () => {
  it('gibt sich als Nachbildung zu erkennen und ordnet nach denselben Signalwörtern', async () => {
    const adapter = erstelleAssistenznachbildung();
    expect(adapter.id).toBe('mock');
    expect(adapter.quelle).toBe('nachbildung');
    const saetze = ['Patient sagt, es zieht.', 'Beugung 100 Grad.', 'Weiter mit Dehnung.'];
    const antwort = await adapter.ordneZu(
      { saetze, sprache: 'de', regeln: '', abschnitte: VORLAGE },
      new AbortController().signal,
    );
    expect(antwort).toEqual({
      ok: true,
      value: { zuordnung: ['Angaben der Patient:in', 'Befund', 'Plan'] },
    });
  });
});
