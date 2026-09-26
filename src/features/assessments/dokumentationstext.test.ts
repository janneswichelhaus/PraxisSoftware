import { describe, expect, it } from 'vitest';
import { bibliothek } from './bibliothek';
import { dokumentationstext, istMesswert, type Auswahl } from './dokumentationstext';
import type { BausteinRegion } from './schema';

/**
 * Die Regeln des Generators aus dem Arbeitsauftrag §2 und dem Plan (P3):
 * `nicht_durchgefuehrt` erscheint nicht, Reihenfolge = Definition, leerer
 * Block ohne Überschrift, Format `<Label><, Seite><: Ergebnis><, Messwert>.`.
 */

const knie: BausteinRegion = {
  id: 'knie',
  label: 'Knie',
  version: '1.0.0',
  blocks: [
    {
      id: 'basis',
      label: 'Basisuntersuchung Knie',
      art: 'basis',
      items: [
        {
          id: 'knie_kniebeuge',
          label: 'Kniebeuge',
          type: 'test',
          bilateral: true,
          result_type: 'befund',
        },
        {
          id: 'knie_knee_to_wall',
          label: 'Knee to Wall Test',
          type: 'test',
          bilateral: true,
          result_type: 'befund',
          value_field: { label: 'Messwert', unit: 'cm', input: 'zahl' },
        },
      ],
    },
    {
      id: 'weiterfuehrend',
      label: 'Weiterführende Untersuchung',
      art: 'weiterfuehrend',
      items: [
        {
          id: 'knie_lachmann_test',
          label: 'Lachmann-Test',
          type: 'test',
          bilateral: true,
          result_type: 'befund',
        },
        {
          id: 'knie_let',
          label: 'LET',
          type: 'test',
          bilateral: true,
          result_type: 'befund',
          subitems: [
            { id: 'knie_let_cozen', label: 'Cozen-Test' },
            { id: 'knie_let_mill', label: 'Mill´s Test' },
          ],
        },
      ],
    },
    {
      id: 'therapie',
      label: 'Therapie',
      art: 'therapie',
      items: [
        {
          id: 'knie_mmb',
          label: 'MMB',
          type: 'technik',
          bilateral: true,
          result_type: 'durchgefuehrt',
        },
      ],
    },
  ],
};

describe('Dokumentationstext', () => {
  it('schreibt das Beispiel des Arbeitsauftrags wörtlich', () => {
    const auswahl: Auswahl = {
      knie_lachmann_test: { ergebnis: 'positiv', seite: 'rechts', notiz: 'Weicher Anschlag.' },
    };
    expect(dokumentationstext([knie], auswahl)).toBe(
      'Knie – Weiterführende Untersuchung\nLachmann-Test, rechts: positiv. Weicher Anschlag.',
    );
  });

  it('lässt nicht durchgeführte Tests weg und schreibt ohne Angabe nichts', () => {
    expect(dokumentationstext([knie], {})).toBe('');
    expect(
      dokumentationstext([knie], { knie_kniebeuge: { ergebnis: 'nicht_durchgefuehrt' } }),
    ).toBe('');
  });

  it('folgt der Reihenfolge der Definition, nicht der des Antippens', () => {
    const auswahl: Auswahl = {
      knie_mmb: { ergebnis: 'durchgefuehrt' },
      knie_lachmann_test: { ergebnis: 'negativ' },
      knie_kniebeuge: { ergebnis: 'ohne_befund' },
    };
    expect(dokumentationstext([knie], auswahl)).toBe(
      [
        'Basisuntersuchung Knie\nKniebeuge: ohne Befund.',
        'Knie – Weiterführende Untersuchung\nLachmann-Test: negativ.',
        'Knie – Therapie\nMMB: durchgeführt.',
      ].join('\n\n'),
    );
  });

  it('setzt den Messwert mit Einheit hinter das Ergebnis, aber nur als Zahl', () => {
    expect(
      dokumentationstext([knie], {
        knie_knee_to_wall: { ergebnis: 'ohne_befund', seite: 'links', messwert: '8,5' },
      }),
    ).toBe('Basisuntersuchung Knie\nKnee to Wall Test, links: ohne Befund, 8,5 cm.');
    expect(
      dokumentationstext([knie], { knie_knee_to_wall: { ergebnis: 'positiv', messwert: 'acht' } }),
    ).toBe('Basisuntersuchung Knie\nKnee to Wall Test: positiv.');
  });

  it('schreibt Unterpunkte mit ihrer Gruppe und hält die Notiz auf einer Zeile', () => {
    const auswahl: Auswahl = {
      knie_let_mill: { ergebnis: 'nicht_beurteilbar', notiz: 'Schmerz\nbei Streckung' },
      knie_let_cozen: { ergebnis: 'positiv', seite: 'beidseits' },
    };
    expect(dokumentationstext([knie], auswahl)).toBe(
      'Knie – Weiterführende Untersuchung\n' +
        'LET – Cozen-Test, beidseits: positiv.\n' +
        'LET – Mill´s Test: nicht beurteilbar. Schmerz bei Streckung',
    );
  });

  it('kennt eine Region nur aus der Definition', () => {
    // Die echte Bibliothek: dieselbe Kennung ergibt denselben Text.
    const text = dokumentationstext(bibliothek.bausteine, {
      knie_lachmann_test: { ergebnis: 'positiv', seite: 'rechts' },
    });
    expect(text).toBe('Knie – Weiterführende Untersuchung\nLachmann-Test, rechts: positiv.');
  });
});

describe('Messwert', () => {
  it.each([
    ['8', true],
    ['8,5', true],
    ['1.25', true],
    ['-1', false],
    ['1e3', false],
    ['', false],
  ])('%s als Zahl: %s', (text, gueltig) => {
    expect(istMesswert(text, 'zahl')).toBe(gueltig);
  });

  it('nimmt als Ganzzahl kein Komma', () => {
    expect(istMesswert('8,5', 'ganzzahl')).toBe(false);
    expect(istMesswert('8', 'ganzzahl')).toBe(true);
  });
});
