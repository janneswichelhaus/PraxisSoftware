import { describe, expect, it } from 'vitest';
import { barometerHinweise } from './barometerHinweis';
import { zeitraum } from './fragen';
import { etwasBeantwortet, medianText, skalenSumme, verteilungText } from './inhalt';

/** ORG-006: Texte der Rückmeldungen und der Barometer-Hinweis (ANN-603, ANN-607). */

describe('Auswertung in Worten', () => {
  it('fasst die Verteilung in drei Gruppen und den Median mit Komma', () => {
    expect(verteilungText([1, 0, 1, 0, 2, 0, 1, 1, 1])).toBe('niedrig 2 · mittel 2 · hoch 3');
    expect(medianText(6)).toBe('6');
    expect(medianText(6.5)).toBe('6,5');
    expect(skalenSumme({ enough: false })).toBe('Zu wenige Antworten auf diese Frage');
  });

  it('nennt den Zeitraum über Monate und Jahre', () => {
    expect(zeitraum('2026-09-01', '2026-09-01')).toBe('September 2026');
    expect(zeitraum('2026-07-01', '2026-09-01')).toBe('Juli bis September 2026');
    expect(zeitraum('2025-12-01', '2026-01-01')).toBe('Dezember 2025 bis Januar 2026');
  });

  it('erkennt ein leeres Barometer', () => {
    const leer = { mood: null, tours: null, team: null, easier: '  ', more: '' };
    expect(etwasBeantwortet(leer)).toBe(false);
    expect(etwasBeantwortet({ ...leer, tours: 1 })).toBe(true);
  });
});

describe('barometerHinweise', () => {
  const stand = {
    can_take_part: true,
    can_read: false,
    month: '2026-10-01',
    barometer_submitted: false,
  };

  it('bietet Beschäftigten den Hinweis des Monats an, mit dem Monat im Schlüssel', () => {
    expect(barometerHinweise(stand)).toEqual([
      {
        schluessel: 'barometer-2026-10',
        titel: 'Barometer Oktober',
        text: 'Fünf kurze Fragen, wie es dir gerade geht – mit oder ohne Namen.',
        ziel: '/betrieb/barometer?zurueck=%2F',
      },
    ]);
  });

  it('nie für owner und nie nach der Abgabe', () => {
    expect(barometerHinweise({ ...stand, can_take_part: false, can_read: true })).toEqual([]);
    expect(barometerHinweise({ ...stand, barometer_submitted: true })).toEqual([]);
  });
});
