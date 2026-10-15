import { describe, expect, it } from 'vitest';
import { NACHGEBILDETES_DIKTAT, erstelleNachbildung, ordneEin, saetze } from './mock.ts';
import { DIKTAT_ABSCHNITTE } from './zwecke.ts';

/**
 * Die Nachbildung (KI-EPIC-001): ein festes, synthetisches Diktat und eine
 * Einordnung, die nur ganze Sätze verschiebt. Der Kern ist die Wortgleichheit:
 * Jedes Wort des Transkripts steht genau einmal im Vorschlag - nichts ergänzt,
 * nichts ausgelassen, nichts umformuliert (PROJECT_PRINCIPLES.md 6.3).
 */

/** Die Wörter eines Textes - alles zwischen Leerraum, Satzzeichen eingeschlossen. */
function woerter(text: string): string[] {
  return text.split(/\s+/u).filter((wort) => wort !== '');
}

/** Gleiche Wörter gleich oft, unabhängig von der Reihenfolge der Abschnitte. */
function sortiert(liste: string[]): string[] {
  return [...liste].sort();
}

function vorschlagstext(abschnitte: readonly { text: string }[]): string {
  return abschnitte.map((abschnitt) => abschnitt.text).join(' ');
}

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

describe('Nachbildung: die Einordnung', () => {
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
    'lässt jedes Wort genau einmal stehen: „%s …"',
    (_kurz, text) => {
      const abschnitte = ordneEin(text, DIKTAT_ABSCHNITTE);
      expect(sortiert(woerter(vorschlagstext(abschnitte)))).toEqual(sortiert(woerter(text)));
    },
  );

  it.each(BEISPIELE.map((text) => [text.slice(0, 40), text]))(
    'verschiebt nur ganze Sätze in ihrer Reihenfolge: „%s …"',
    (_kurz, text) => {
      const alle = saetze(text);
      for (const abschnitt of ordneEin(text, DIKTAT_ABSCHNITTE)) {
        const eigene = alle.filter((satz) => abschnitt.text.includes(satz));
        // Der Abschnitt ist genau seine Sätze, in der Reihenfolge des Diktats.
        expect(abschnitt.text).toBe(eigene.join(' '));
      }
    },
  );

  it('kennt nur Abschnitte der Vorlage und lässt leere weg', () => {
    for (const text of BEISPIELE) {
      const abschnitte = ordneEin(text, DIKTAT_ABSCHNITTE);
      const titel = abschnitte.map((abschnitt) => abschnitt.titel);
      expect(DIKTAT_ABSCHNITTE.filter((t) => titel.includes(t))).toEqual(titel);
      expect(abschnitte.every((abschnitt) => abschnitt.text.trim() !== '')).toBe(true);
    }
    expect(ordneEin('', DIKTAT_ABSCHNITTE)).toEqual([]);
  });

  it('folgt einer Ansage am Satzanfang und stellt berichtete Rede vor alles andere', () => {
    expect(ordneEin('Befund: Knie warm.', DIKTAT_ABSCHNITTE)[0]!.titel).toBe('Befund');
    expect(ordneEin('Anamnese seit Jahren Rücken.', DIKTAT_ABSCHNITTE)[0]!.titel).toBe(
      'Angaben der Patient:in',
    );
    expect(
      ordneEin('Patientin sagt, die Mobilisation habe geholfen.', DIKTAT_ABSCHNITTE)[0]!.titel,
    ).toBe('Angaben der Patient:in');
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
    const abschnitte = ordneEin(text, ['Befund']);
    expect(abschnitte).toEqual([{ titel: 'Befund', text: 'Plan: Kontrolle. Keine Schwellung.' }]);
  });

  it('ist deterministisch', async () => {
    const adapter = erstelleNachbildung();
    const anfrage = {
      transkript: NACHGEBILDETES_DIKTAT,
      sprache: 'de' as const,
      regeln: '',
      abschnitte: DIKTAT_ABSCHNITTE,
    };
    expect(await adapter.strukturiere(anfrage, SIGNAL)).toEqual(
      await adapter.strukturiere(anfrage, SIGNAL),
    );
  });
});
