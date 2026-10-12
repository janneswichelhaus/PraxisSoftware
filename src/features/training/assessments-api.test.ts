import { describe, expect, it } from 'vitest';
import {
  ergebnisText,
  nachTitel,
  seitenProzent,
  seitenText,
  wiedervorlagen,
  zahlAusEingabe,
  type Assessment,
} from './assessments-api';

function assessment(teil: Partial<Assessment>): Assessment {
  return {
    id: crypto.randomUUID(),
    title: 'Sprungtests Knie',
    performed_on: '2026-10-12',
    conditions: null,
    next_due_on: null,
    created_by_name: null,
    results: [],
    ...teil,
  };
}

describe('Seitenvergleich (ANN-365)', () => {
  it('ist die kleinere Seite in Prozent der größeren, offen gerechnet', () => {
    expect(seitenProzent(112, 140)).toBe(80);
    expect(seitenProzent(140, 112)).toBe(80);
    expect(seitenProzent(40, 40)).toBe(100);
    expect(seitenProzent(0, 0)).toBeNull();
    expect(seitenProzent(0, 12)).toBe(0);
    expect(seitenProzent(-5, 10)).toBeNull();
  });

  it('nennt Werte und Verhältnis ohne Einordnung', () => {
    const e = { label: 'Sprung', unit: 'cm', value: null, left: 112.5, right: 140 };
    expect(ergebnisText(e)).toBe('L 112,5 · R 140 cm');
    expect(seitenText(e)).toBe('kleinere Seite 80 % der größeren');
    const einzeln = { label: 'Kniebeugen', unit: null, value: 18, left: null, right: null };
    expect(ergebnisText(einzeln)).toBe('18');
    expect(seitenText(einzeln)).toBeNull();
    // Kein Wort, das eine Grenze zieht.
    expect(seitenText(e)).not.toMatch(/ausreichend|frei|defizit|gut|schlecht/i);
  });
});

describe('Eingabe und Wiedervorlage', () => {
  it('liest Zahlen mit Komma oder Punkt, sonst nichts', () => {
    expect(zahlAusEingabe('12,5')).toBe(12.5);
    expect(zahlAusEingabe(' 12.5 ')).toBe(12.5);
    expect(zahlAusEingabe('-3')).toBe(-3);
    expect(zahlAusEingabe('')).toBeNull();
    expect(zahlAusEingabe('12 cm')).toBeNull();
    expect(zahlAusEingabe('1,2,3')).toBeNull();
    // Kein stilles Umdeuten (Zweitreview): Tausenderpunkt und dritte Nachkommastelle.
    expect(zahlAusEingabe('1.200')).toBeNull();
    expect(zahlAusEingabe('12,345')).toBeNull();
    expect(zahlAusEingabe('1200')).toBe(1200);
    expect(zahlAusEingabe('10000000')).toBeNull();
  });

  it('gruppiert nach Test und nimmt die Wiederholung des jüngsten', () => {
    const liste = [
      assessment({ performed_on: '2026-10-12', next_due_on: '2026-11-23' }),
      assessment({ title: 'Griffkraft', performed_on: '2026-10-01', next_due_on: '2026-10-10' }),
      assessment({ performed_on: '2026-09-01', next_due_on: '2026-10-12' }),
      assessment({ title: 'Ohne', performed_on: '2026-09-01' }),
    ];
    expect(nachTitel(liste).map(([t, l]) => [t, l.length])).toEqual([
      ['Sprungtests Knie', 2],
      ['Griffkraft', 1],
      ['Ohne', 1],
    ]);
    expect(wiedervorlagen(liste, '2026-10-12')).toEqual([
      { titel: 'Griffkraft', am: '2026-10-10', faellig: true },
      { titel: 'Sprungtests Knie', am: '2026-11-23', faellig: false },
    ]);
  });
});
