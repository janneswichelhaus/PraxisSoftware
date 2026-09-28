import { describe, expect, it } from 'vitest';
import { formatMonat, formatZeitpunkt, ortszeitAlsZeitpunkt } from './format';
import { erzeugeVorschauzustand } from './vorschauZustand';

/**
 * Zeitpunkte der Vorschau stehen in der Zeitzone der Praxis (VOR-06).
 *
 * Bis dahin formatierte die Vorschau in UTC, und die synthetischen Daten
 * trugen Ortszeit mit „Z": Eine Aktion um 08:56 Uhr stand als 06:56, und der
 * Schlüsselverlauf meldete eine Rückgabe vor der Entnahme.
 */

describe('formatZeitpunkt', () => {
  it('zeigt einen Augenblick in der Praxiszeitzone, mit vierstelligem Jahr', () => {
    // 06:56 UTC ist im Sommer 08:56 Uhr in Tübingen.
    expect(formatZeitpunkt('2026-09-27T06:56:00.000Z')).toBe('27.09.2026, 08:56');
  });

  it('nimmt die Zeitzone der Praxis, wenn es eine gibt', () => {
    expect(formatZeitpunkt('2026-09-27T06:56:00.000Z', 'Europe/London')).toBe('27.09.2026, 07:56');
    expect(formatZeitpunkt('2026-09-27T06:56:00.000Z', null)).toBe('27.09.2026, 08:56');
  });

  it('nennt einen fehlenden Zeitpunkt als Strich und laesst Unlesbares stehen', () => {
    expect(formatZeitpunkt('')).toBe('–');
    expect(formatZeitpunkt('kein Datum')).toBe('kein Datum');
  });
});

describe('ortszeitAlsZeitpunkt', () => {
  it('macht aus einer Uhrzeit der Praxis den richtigen Augenblick, Sommer wie Winter', () => {
    expect(ortszeitAlsZeitpunkt('2026-09-27', '07:25')).toBe('2026-09-27T05:25:00.000Z');
    expect(ortszeitAlsZeitpunkt('2026-01-15', '07:25')).toBe('2026-01-15T06:25:00.000Z');
  });

  it('rechnet an beiden Umstellungstagen mit dem Versatz, der zur Uhrzeit gilt', () => {
    expect(ortszeitAlsZeitpunkt('2026-03-29', '07:25')).toBe('2026-03-29T05:25:00.000Z');
    expect(ortszeitAlsZeitpunkt('2026-10-25', '07:25')).toBe('2026-10-25T06:25:00.000Z');
  });

  it('zeigt die Uhrzeit wieder so an, wie sie gemeint war', () => {
    expect(formatZeitpunkt(ortszeitAlsZeitpunkt('2026-12-01', '17:40'))).toBe('01.12.2026, 17:40');
  });
});

describe('Zeitpunkte der synthetischen Daten', () => {
  const zustand = erzeugeVorschauzustand(new Date('2026-09-27T10:00:00Z'));

  it('zeigt die Uhrzeit der Vorlage als Ortszeit der Praxis', () => {
    const rad = zustand.raeder.find((eintrag) => eintrag.id === 'r5');
    expect(formatZeitpunkt(rad?.schluesselSeit ?? '')).toBe('27.09.2026, 07:25');
  });

  it('liegt vor einer Rueckgabe, die in derselben Sitzung spaeter geschieht', () => {
    // Nachgestellt aus VOR-06: Rückgabe um 08:57 Uhr, entnommen um 07:25 Uhr.
    const rad = zustand.raeder.find((eintrag) => eintrag.id === 'r5');
    const rueckgabe = Date.parse('2026-09-27T06:57:00Z');
    expect(Date.parse(rad?.schluesselSeit ?? '')).toBeLessThan(rueckgabe);
  });
});

describe('formatMonat', () => {
  it('schreibt einen Monat aus, statt ihn roh zu zeigen (VOR-24)', () => {
    expect(formatMonat('2026-08')).toBe('August 2026');
    expect(formatMonat('2025-12')).toBe('Dezember 2025');
  });

  it('laesst Leeres und Unlesbares stehen', () => {
    expect(formatMonat('')).toBe('');
    expect(formatMonat('August')).toBe('August');
  });
});
