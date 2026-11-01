import { describe, expect, it } from 'vitest';
import { saetze, setzeZusammen } from './inhaltstreue.ts';
import { NACHGEBILDETES_DIKTAT, erstelleNachbildung, ordneZu } from './mock.ts';
import { DIKTAT_ABSCHNITTE } from './zwecke.ts';

// Die Nachbildung: ein festes, synthetisches Diktat und eine Zuordnung ganzer Sätze nach
// Signalwörtern. Die Wortgleichheit des Vorschlags sichert der Gateway (`inhaltstreue.test.ts`).

const SIGNAL = new AbortController().signal;

const BEISPIELE = [
  NACHGEBILDETES_DIKTAT,
  'Befund: Knie links warm. Patient sagt, er habe nachts Schmerzen, etwa fünf von zehn. Behandlung Lymphdrainage 30 Minuten. Plan: nächste Woche Kontrolle.',
  'Keine Rötung, kein Erguss.   Druckschmerz medial?   Vielleicht Meniskus, unklar [unverständlich] [unverständlich].',
  'Ohne Satzzeichen am Ende und ohne Signalwort',
  'Gangschule mit Unterarmgehstützen, 3 × 10 m.\nPatientin gibt an, die Treppe gehe noch nicht.\n\nWeiter mit Kräftigung z. B. Brücke.',
  '',
  '   ',
  '[unverständlich]',
];

describe('Nachbildung: das Diktat', () => {
  it('hört die Aufnahme nicht an und liefert immer denselben Text', async () => {
    const adapter = erstelleNachbildung();
    const eins = await adapter.transkribiere(
      { audio: new Uint8Array([1, 2, 3]), mime: 'audio/webm', sprache: 'de' },
      SIGNAL,
    );
    const zwei = await adapter.transkribiere(
      { audio: new Uint8Array(500), mime: 'audio/mp4', sprache: 'de' },
      SIGNAL,
    );
    expect(eins).toEqual({ ok: true, value: { transkript: NACHGEBILDETES_DIKTAT } });
    expect(zwei).toEqual(eins);
    expect(adapter.quelle).toBe('nachbildung');
    expect(adapter.id).toBe('mock');
  });

  it('enthält alles, was die Inhaltstreue erhalten muss (6.3)', () => {
    // Zahl und Einheit, Körperseite, Verneinung, Unsicherheit, unverständlich,
    // Aussage der Patientin neben der eigenen Beobachtung.
    expect(NACHGEBILDETES_DIKTAT).toMatch(/drei von zehn/);
    expect(NACHGEBILDETES_DIKTAT).toMatch(/110 Grad/);
    expect(NACHGEBILDETES_DIKTAT).toMatch(/rechte Knie/);
    expect(NACHGEBILDETES_DIKTAT).toMatch(/links 135 Grad/);
    expect(NACHGEBILDETES_DIKTAT).toMatch(/Keine Schwellung/);
    expect(NACHGEBILDETES_DIKTAT).toMatch(/vielleicht/);
    expect(NACHGEBILDETES_DIKTAT).toContain('[unverständlich]');
    expect(NACHGEBILDETES_DIKTAT).toMatch(/Patientin berichtet/);
  });
});

/** Der Vorschlag, wie der Gateway ihn aus der Zuordnung der Nachbildung zusammensetzt. */
function ordneEin(text: string, vorlage: readonly string[]) {
  const liste = saetze(text);
  return setzeZusammen(liste, ordneZu(liste, vorlage), vorlage)!;
}

describe('Nachbildung: die Zuordnung', () => {
  it('ordnet das Diktat den vier Abschnitten zu, Aussage und Beobachtung getrennt', () => {
    expect(ordneEin(NACHGEBILDETES_DIKTAT, DIKTAT_ABSCHNITTE)).toEqual([
      {
        titel: 'Angaben der Patient:in',
        text: 'Patientin berichtet, das rechte Knie sei seit dem letzten Termin besser, Schmerz drei von zehn.',
      },
      { titel: 'Befund', text: 'Keine Schwellung. Beugung rechts 110 Grad, links 135 Grad.' },
      { titel: 'Behandlung', text: 'Mobilisation Knie rechts und Kräftigung Quadrizeps.' },
      {
        titel: 'Plan',
        text: 'Eigenübungen weiter, vielleicht nächstes Mal Treppe [unverständlich].',
      },
    ]);
  });

  it.each(BEISPIELE.map((text) => [text.slice(0, 40), text]))(
    'gibt je Satz genau einen Titel der Vorlage: „%s …"',
    (_kurz, text) => {
      const liste = saetze(text);
      const zuordnung = ordneZu(liste, DIKTAT_ABSCHNITTE);
      expect(zuordnung).toHaveLength(liste.length);
      for (const titel of zuordnung) expect(DIKTAT_ABSCHNITTE).toContain(titel);
    },
  );

  it('folgt einer Ansage am Satzanfang und stellt berichtete Rede vor alles andere', () => {
    expect(ordneZu(['Befund: Knie warm.'], DIKTAT_ABSCHNITTE)).toEqual(['Befund']);
    expect(ordneZu(['Anamnese seit Jahren Rücken.'], DIKTAT_ABSCHNITTE)).toEqual([
      'Angaben der Patient:in',
    ]);
    expect(ordneZu(['Patientin sagt, die Mobilisation habe geholfen.'], DIKTAT_ABSCHNITTE)).toEqual(
      ['Angaben der Patient:in'],
    );
  });

  it('hängt einen Satz ohne Signal an den vorigen, am Anfang an den Befund', () => {
    expect(ordneEin('Heute müde. Dehnung Wade.', DIKTAT_ABSCHNITTE)).toEqual([
      { titel: 'Befund', text: 'Heute müde.' },
      { titel: 'Behandlung', text: 'Dehnung Wade.' },
    ]);
    expect(ordneEin('Dehnung Wade. Danach besser.', DIKTAT_ABSCHNITTE)).toEqual([
      { titel: 'Behandlung', text: 'Dehnung Wade. Danach besser.' },
    ]);
  });

  it('verliert keinen Satz, wenn die Vorlage einen Abschnitt nicht kennt', () => {
    const text = 'Plan: Kontrolle. Keine Schwellung.';
    expect(ordneEin(text, ['Befund'])).toEqual([
      { titel: 'Befund', text: 'Plan: Kontrolle. Keine Schwellung.' },
    ]);
  });

  it('ist deterministisch', async () => {
    const adapter = erstelleNachbildung();
    const anfrage = {
      saetze: saetze(NACHGEBILDETES_DIKTAT),
      sprache: 'de' as const,
      regeln: '',
      abschnitte: DIKTAT_ABSCHNITTE,
    };
    expect(await adapter.ordneZu(anfrage, SIGNAL)).toEqual(await adapter.ordneZu(anfrage, SIGNAL));
  });
});
