import { describe, expect, it } from 'vitest';
import { rechne, UngueltigeAntwort } from './rechnen';
import { scoreDefinitionSchema, type ScoreDefinition } from './schema';

/**
 * Der Rechenkern (FRB-008).
 *
 * Synthetische Definitionen, eine je Formelart, mit von Hand nachgerechneten
 * Werten. Die Referenzfälle der echten Definitionen rechnet
 * `referenzfaelle.test.ts` nach.
 */

const LIZENZ = {
  status: 'freigegeben',
  begruendung: 'synthetisch, nur fuer den Test',
  stand: '2026-09-25',
};

function definition(teil: {
  items: Record<string, unknown>[];
  gesamt: Record<string, unknown> | null;
  subskalen?: Record<string, unknown>[];
}): ScoreDefinition {
  return scoreDefinitionSchema.parse({
    meta: {
      id: 'test_score',
      version: '1.0.0',
      name_de: 'Testscore',
      region: 'uebergreifend',
      konstrukt: 'synthetisch',
      ausgefuellt_von: 'patient',
      sprache: 'de',
      prioritaet: 'a',
      quelle: { datei: 'synthetisch.pdf', validierung: 'keine' },
      lizenzstatus: LIZENZ,
      aktiv: true,
    },
    items: teil.items,
    scoring: {
      regel_wortlaut: 'synthetisch',
      gesamt: teil.gesamt,
      subskalen: teil.subskalen ?? [],
      richtung: 'hoch_ist_besser',
      missing_value_regel: 'synthetisch',
    },
    interpretation: { cutoffs: null, mcid: null, mdc: null },
    referenzfaelle: [{ bezeichnung: 'synthetisch', antworten: {}, erwartet: {} }],
  });
}

function skala(id: string, max = 4, abweichung: Record<string, unknown> = {}) {
  return { id, text: id, typ: 'skala', skala: { min: 0, max }, ...abweichung };
}

const bereich = { min: 0, max: 100 };

describe('Rechenkern je Formelart', () => {
  it('summe', () => {
    const def = definition({
      items: [skala('a'), skala('b'), skala('c')],
      gesamt: { formel: { art: 'summe' }, wertebereich: { min: 0, max: 12 } },
    });
    expect(rechne(def, { a: 1, b: 2, c: 4 }).gesamt).toBe(7);
  });

  it('einzelwert', () => {
    const def = definition({
      items: [skala('stufe', 10)],
      gesamt: { formel: { art: 'einzelwert', item: 'stufe' }, wertebereich: { min: 0, max: 10 } },
    });
    expect(rechne(def, { stufe: 6 }).gesamt).toBe(6);
  });

  it('mittelwert', () => {
    const def = definition({
      items: [skala('a', 10), skala('b', 10), skala('c', 10)],
      gesamt: { formel: { art: 'mittelwert' }, wertebereich: { min: 0, max: 10 } },
    });
    expect(rechne(def, { a: 3, b: 4, c: 8 }).gesamt).toBe(5);
  });

  it('summe_prozent mit festem Maximum (ODI: Summe/50 x 100)', () => {
    const def = definition({
      items: [skala('a', 5), skala('b', 5)],
      gesamt: { formel: { art: 'summe_prozent', maximum: 50 }, wertebereich: bereich },
    });
    expect(rechne(def, { a: 5, b: 5 }).gesamt).toBe(20);
  });

  it('summe_prozent aus gewerteten Items: ein fehlendes verkleinert das Maximum (FAAM)', () => {
    const def = definition({
      items: [skala('a'), skala('b'), skala('c')],
      gesamt: {
        formel: { art: 'summe_prozent', maximum: 'aus_gewerteten_items', item_maximum: 4 },
        wertebereich: bereich,
      },
    });
    // 3 + 3 von 8 moeglichen Punkten, c ist "nicht zutreffend".
    const ergebnis = rechne(def, { a: 3, b: 3 });
    expect(ergebnis.gesamt).toBe(75);
    expect(ergebnis.fehlend).toEqual(['c']);
  });

  it('mittelwert_invertiert (KOOS: 100 - Mittelwert x 100 / 4)', () => {
    const def = definition({
      items: [skala('a'), skala('b')],
      gesamt: null,
      subskalen: [
        {
          id: 'schmerz',
          label: 'Schmerz',
          items: ['a', 'b'],
          formel: { art: 'mittelwert_invertiert', item_maximum: 4 },
          wertebereich: bereich,
        },
      ],
    });
    // Mittelwert 1 -> 100 - 25 = 75.
    expect(rechne(def, { a: 0, b: 2 }).subskalen).toEqual({ schmerz: 75 });
  });

  it('gewichtete_subskalensumme (PRWE: Schmerz + Funktion / 2)', () => {
    const def = definition({
      items: [skala('s1', 10), skala('f1', 10), skala('f2', 10)],
      gesamt: {
        formel: { art: 'gewichtete_subskalensumme', gewichte: { schmerz: 1, funktion: 0.5 } },
        wertebereich: bereich,
      },
      subskalen: [
        {
          id: 'schmerz',
          label: 'Schmerz',
          items: ['s1'],
          formel: { art: 'summe' },
          wertebereich: { min: 0, max: 10 },
        },
        {
          id: 'funktion',
          label: 'Funktion',
          items: ['f1', 'f2'],
          formel: { art: 'summe' },
          wertebereich: { min: 0, max: 20 },
        },
      ],
    });
    const ergebnis = rechne(def, { s1: 6, f1: 4, f2: 8 });
    expect(ergebnis.subskalen).toEqual({ schmerz: 6, funktion: 12 });
    expect(ergebnis.gesamt).toBe(12);
  });

  it('keine_berechnung und gesamt null ergeben keinen Wert', () => {
    const def = definition({
      items: [skala('a')],
      gesamt: { formel: { art: 'keine_berechnung' }, wertebereich: { min: 0, max: 1 } },
    });
    expect(rechne(def, { a: 2 }).gesamt).toBeNull();
  });
});

describe('Fehlende und ungueltige Antworten', () => {
  const summenScore = definition({
    items: [
      skala('a'),
      skala('b'),
      { id: 'notiz', text: 'Notiz', typ: 'freitext', gewertet: false },
      {
        id: 'nicht_gewertet',
        text: 'Frage ohne Wertung',
        typ: 'einzelauswahl',
        optionen: [
          { label: 'ja', wert: 1 },
          { label: 'nein', wert: 0 },
        ],
        gewertet: false,
      },
    ],
    gesamt: { formel: { art: 'summe' }, wertebereich: { min: 0, max: 8 } },
  });

  it('gibt keinen Wert, solange ein gewertetes Item fehlt (ANN-098)', () => {
    const ergebnis = rechne(summenScore, { a: 4 });
    expect(ergebnis.gesamt).toBeNull();
    expect(ergebnis.fehlend).toEqual(['b']);
  });

  it('zaehlt ein nicht gewertetes Item nicht mit und verlangt es nicht', () => {
    const ergebnis = rechne(summenScore, { a: 1, b: 1, nicht_gewertet: 1 });
    expect(ergebnis.gesamt).toBe(2);
    expect(ergebnis.fehlend).toEqual([]);
  });

  it('weist ein unbekanntes Item zurueck', () => {
    expect(() => rechne(summenScore, { a: 1, b: 1, c: 1 })).toThrow(UngueltigeAntwort);
  });

  it('weist einen Wert ausserhalb der Skala zurueck', () => {
    expect(() => rechne(summenScore, { a: 5, b: 1 })).toThrow(/ausserhalb|außerhalb/);
  });

  it('weist einen Wert zurueck, der keine Antwortoption ist', () => {
    const def = definition({
      items: [
        {
          id: 'frage',
          text: 'Frage',
          typ: 'einzelauswahl',
          optionen: [
            { label: 'nie', wert: 0 },
            { label: 'immer', wert: 4 },
          ],
        },
      ],
      gesamt: { formel: { art: 'summe' }, wertebereich: { min: 0, max: 4 } },
    });
    expect(() => rechne(def, { frage: 2 })).toThrow(/keine Antwortoption/);
  });

  it('weist eine Mehrfachauswahl in einer Rechnung zurueck', () => {
    expect(() => rechne(summenScore, { a: [1, 2], b: 1 })).toThrow(/Mehrfachauswahl/);
  });

  it('rundet nicht', () => {
    const def = definition({
      items: [skala('a', 10), skala('b', 10), skala('c', 10)],
      gesamt: { formel: { art: 'mittelwert' }, wertebereich: { min: 0, max: 10 } },
    });
    expect(rechne(def, { a: 1, b: 1, c: 2 }).gesamt).toBeCloseTo(4 / 3, 10);
  });
});
