import { describe, expect, it } from 'vitest';
import { bibliothek } from './bibliothek';
import {
  dokumentationstext,
  istMesswert,
  seiteUmstellen,
  seitlicheRegion,
  ungueltigeMesswerte,
  type Auswahl,
} from './dokumentationstext';
import type { BausteinRegion } from './schema';

/**
 * Die Regeln des Generators (Arbeitsauftrag §2, Plan P3, Form nach ANN-130):
 * ohne Angabe nichts, Reihenfolge = Definition, leerer Block ohne Überschrift,
 * je Test `<Zeichen> <Label>< Seite>< Messwert>< – Notiz>`, „Nicht getestet"
 * gesammelt am Ende des Absatzes, die Seite einer Region in der Überschrift.
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
        {
          id: 'knie_eccentric_step',
          label: 'Eccentric Step',
          type: 'test',
          bilateral: true,
          result_type: 'befund',
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
        {
          id: 'knie_arthrogen',
          label: 'Arthrogen',
          type: 'technik',
          bilateral: true,
          result_type: 'durchgefuehrt',
          subitems: [
            { id: 'knie_arthrogen_tibiofemoral', label: 'Tibiofemorale Mobilisation' },
            { id: 'knie_arthrogen_kompression', label: 'Mobilisation mit Kompression' },
          ],
        },
      ],
    },
  ],
};

const RECHTS = { knie: 'rechts' } as const;

describe('Dokumentationstext', () => {
  it('nennt die Seite der Region in der Überschrift und das Ergebnis als Zeichen', () => {
    const auswahl: Auswahl = {
      'knie_lachmann_test.rechts': { ergebnis: 'positiv', notiz: 'Weicher Anschlag.' },
    };
    expect(dokumentationstext([knie], auswahl, RECHTS)).toBe(
      'Knie rechts – Weiterführende Untersuchung\n❗ Lachmann-Test – Weicher Anschlag.',
    );
  });

  it('schreibt ohne Angabe nichts', () => {
    expect(dokumentationstext([knie], {}, RECHTS)).toBe('');
  });

  it('folgt der Reihenfolge der Definition, nicht der des Antippens', () => {
    const auswahl: Auswahl = {
      'knie_mmb.rechts': { ergebnis: 'durchgefuehrt' },
      'knie_lachmann_test.rechts': { ergebnis: 'ohne_befund' },
      'knie_kniebeuge.rechts': { ergebnis: 'ohne_befund' },
    };
    expect(dokumentationstext([knie], auswahl, RECHTS)).toBe(
      [
        'Basisuntersuchung Knie rechts\n✅ Kniebeuge',
        'Knie rechts – Weiterführende Untersuchung\n✅ Lachmann-Test',
        'Knie rechts – Therapie\n• MMB',
      ].join('\n\n'),
    );
  });

  it('sammelt „nicht getestet“ ausgeschrieben am Ende des Absatzes', () => {
    const auswahl: Auswahl = {
      'knie_eccentric_step.links': { ergebnis: 'nicht_getestet' },
      'knie_let_mill.links': { ergebnis: 'nicht_getestet', notiz: 'Schmerz\nbei Streckung' },
      'knie_lachmann_test.links': { ergebnis: 'positiv' },
    };
    expect(dokumentationstext([knie], auswahl, { knie: 'links' })).toBe(
      'Knie links – Weiterführende Untersuchung\n' +
        '❗ Lachmann-Test\n' +
        'Nicht getestet: Mill´s Test (Schmerz bei Streckung); Eccentric Step',
    );
  });

  it('rückt Unterpunkte unter ihrer Gruppe ein, bei Techniken wie bei Tests', () => {
    const auswahl: Auswahl = {
      'knie_let_cozen.rechts': { ergebnis: 'positiv' },
      'knie_eccentric_step.rechts': { ergebnis: 'ohne_befund' },
      'knie_arthrogen_kompression.rechts': { ergebnis: 'durchgefuehrt', notiz: '3 × 30 s' },
    };
    expect(dokumentationstext([knie], auswahl, RECHTS)).toBe(
      'Knie rechts – Weiterführende Untersuchung\n' +
        'LET:\n' +
        '  ❗ Cozen-Test\n' +
        '✅ Eccentric Step\n\n' +
        'Knie rechts – Therapie\n' +
        'Arthrogen:\n' +
        '  • Mobilisation mit Kompression – 3 × 30 s',
    );
  });

  it('schreibt im Seitenvergleich gleiche Seiten als „bds.“, verschiedene je Zeile', () => {
    const auswahl: Auswahl = {
      'knie_kniebeuge.links': { ergebnis: 'ohne_befund' },
      'knie_kniebeuge.rechts': { ergebnis: 'ohne_befund' },
      'knie_lachmann_test.links': { ergebnis: 'ohne_befund' },
      'knie_lachmann_test.rechts': { ergebnis: 'positiv' },
    };
    expect(dokumentationstext([knie], auswahl, { knie: 'beidseits' })).toBe(
      'Basisuntersuchung Knie\n✅ Kniebeuge bds.\n\n' +
        'Knie – Weiterführende Untersuchung\n✅ Lachmann-Test li.\n❗ Lachmann-Test re.',
    );
  });

  it('misst immer je Seite und setzt den Wert nur als Zahl hinter den Test', () => {
    // Auch wenn die Region nur rechts untersucht wird: Der Vergleich ist der Sinn.
    const auswahl: Auswahl = {
      'knie_knee_to_wall.rechts': { ergebnis: 'positiv', messwert: '5', notiz: 'Ferse hebt ab.' },
      'knie_knee_to_wall.links': { ergebnis: 'ohne_befund', messwert: '9' },
    };
    expect(dokumentationstext([knie], auswahl, RECHTS)).toBe(
      'Basisuntersuchung Knie rechts\n' +
        '✅ Knee to Wall Test li. 9 cm\n' +
        '❗ Knee to Wall Test re. 5 cm – Ferse hebt ab.',
    );
    expect(
      dokumentationstext(
        [knie],
        { 'knie_knee_to_wall.rechts': { ergebnis: 'positiv', messwert: 'acht' } },
        RECHTS,
      ),
    ).toBe('Basisuntersuchung Knie rechts\n❗ Knee to Wall Test re.');
    // Zwei gleiche Ergebnisse mit Wert bleiben zwei Zeilen — die Werte sind der Befund.
    expect(
      dokumentationstext(
        [knie],
        {
          'knie_knee_to_wall.links': { ergebnis: 'ohne_befund', messwert: '9' },
          'knie_knee_to_wall.rechts': { ergebnis: 'ohne_befund', messwert: '9' },
        },
        RECHTS,
      ),
    ).toBe(
      'Basisuntersuchung Knie rechts\n✅ Knee to Wall Test li. 9 cm\n✅ Knee to Wall Test re. 9 cm',
    );
  });

  it('erkennt einen ungültigen Messwert auf jeder Seite', () => {
    expect(ungueltigeMesswerte([knie], {})).toBe(false);
    expect(
      ungueltigeMesswerte([knie], {
        'knie_knee_to_wall.rechts': { ergebnis: 'positiv', messwert: 'x' },
      }),
    ).toBe(true);
  });

  it('lässt die Ausgangsstellung weg und ordnet die Hüfte darunter (Jannes 2026-09-26)', () => {
    const auswahl: Auswahl = {
      'huefte_rueckenlage_flexion.rechts': { ergebnis: 'ohne_befund' },
      'huefte_bauchlage_beweglichkeit_extension_innenrotation_aussenrotation.rechts': {
        ergebnis: 'positiv',
        notiz: 'endgradig Leiste',
      },
      'huefte_weiterfuehrende_untersuchung_fadir.rechts': { ergebnis: 'positiv' },
      'huefte_weiterfuehrende_untersuchung_scour_test.rechts': { ergebnis: 'nicht_getestet' },
    };
    expect(dokumentationstext(bibliothek.bausteine, auswahl, { huefte: 'rechts' })).toBe(
      'Untersuchung Hüfte rechts\n' +
        '✅ Flexion\n' +
        '❗ Beweglichkeit Extension, Innenrotation & Außenrotation – endgradig Leiste\n' +
        'Weiterführende Untersuchung (bei Bedarf):\n' +
        '  ❗ FADIR (+ Kompression)\n' +
        'Nicht getestet: Scour Test',
    );
  });

  it('fragt an der Wirbelsäule die Seite je Test, nicht je Region (ANN-129)', () => {
    const lws = bibliothek.bausteine.find((r) => r.id === 'lws');
    expect(lws && seitlicheRegion(lws)).toBe(false);
    expect(seitlicheRegion(knie)).toBe(true);

    const auswahl: Auswahl = {
      lws_prone_instability_test: { ergebnis: 'ohne_befund' },
      'lws_nervenprovokationstests_straight_leg_raise.rechts': {
        ergebnis: 'positiv',
        notiz: 'ab 40°',
      },
      'lws_nervenprovokationstests_straight_leg_raise.links': { ergebnis: 'ohne_befund' },
      'lws_nervenprovokationstests_slump.links': { ergebnis: 'nicht_getestet' },
      'lws_nervenprovokationstests_slump.rechts': { ergebnis: 'nicht_getestet' },
    };
    expect(dokumentationstext(bibliothek.bausteine, auswahl)).toBe(
      'LWS – Weiterführende Untersuchung\n✅ Prone Instability Test\n\n' +
        'LWS – Neurologische Untersuchungen (bei Bedarf)\n' +
        'Nervenprovokationstests:\n' +
        '  ✅ Straight leg raise (evtl. mit Add/Ir) li.\n' +
        '  ❗ Straight leg raise (evtl. mit Add/Ir) re. – ab 40°\n' +
        'Nicht getestet: SLUMP (evtl. mit Add/Ir) bds.',
    );
  });
});

describe('Seite der Region umstellen (ANN-129)', () => {
  const auswahl: Auswahl = {
    'knie_lachmann_test.rechts': { ergebnis: 'positiv' },
    'knie_knee_to_wall.links': { ergebnis: 'ohne_befund', messwert: '9' },
  };

  it('nimmt die Angaben von einer Seite auf die andere mit', () => {
    expect(seiteUmstellen(knie, auswahl, 'rechts', 'links')).toEqual({
      'knie_lachmann_test.links': { ergebnis: 'positiv' },
      'knie_knee_to_wall.links': { ergebnis: 'ohne_befund', messwert: '9' },
    });
  });

  it('behält beim Wechsel in den Seitenvergleich alles', () => {
    expect(seiteUmstellen(knie, auswahl, 'rechts', 'beidseits')).toBe(auswahl);
  });

  it('lässt vom Seitenvergleich auf eine Seite die andere fallen, nie einen Messwert', () => {
    const beide: Auswahl = {
      ...auswahl,
      'knie_lachmann_test.links': { ergebnis: 'ohne_befund' },
    };
    expect(seiteUmstellen(knie, beide, 'beidseits', 'rechts')).toEqual(auswahl);
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
