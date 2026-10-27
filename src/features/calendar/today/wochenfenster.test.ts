import { describe, expect, it } from 'vitest';
import { fensterAnfang, fensterTage, kopfDatum, tagesName, terminAnzahl } from './wochenfenster';

/** Die Wochenleiste der Übersicht (Jannes, 2026-10-11). */
describe('Wochenfenster', () => {
  const heute = '2026-10-11';

  it('beginnt heute und springt nicht, solange der Tag in den sieben Tagen ab heute liegt', () => {
    expect(fensterAnfang('2026-10-11', heute)).toBe('2026-10-11');
    expect(fensterAnfang('2026-10-17', heute)).toBe('2026-10-11');
    expect(fensterTage('2026-10-14', heute)).toEqual([
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
  });

  it('schiebt in ganzen Wochen weiter - auch zurück', () => {
    expect(fensterAnfang('2026-10-18', heute)).toBe('2026-10-18');
    expect(fensterAnfang('2026-10-10', heute)).toBe('2026-10-04');
    expect(fensterAnfang('2026-10-04', heute)).toBe('2026-10-04');
  });

  it('zählt Behandlung und Training, keine Fehlzeit und nichts Abgesagtes', () => {
    expect(
      terminAnzahl([
        { kind: 'therapy', status: 'confirmed' },
        { kind: 'training', status: 'completed' },
        { kind: 'internal', status: 'confirmed' },
        { kind: 'therapy', status: 'cancelled' },
        { kind: 'therapy', status: 'no_show' },
      ]),
    ).toBe(3);
  });

  it('nennt den Tag für Vorlesesoftware mit Zahl der Termine', () => {
    expect(tagesName('2026-10-12', heute, 4)).toBe('Montag, 12. Oktober: 4 Termine');
    expect(tagesName('2026-10-11', heute, 1)).toBe('Sonntag, 11. Oktober, heute: 1 Termin');
    expect(tagesName('2026-10-17', heute, 0)).toBe('Samstag, 17. Oktober: keine Termine');
    expect(tagesName('2026-10-13', heute, undefined)).toBe('Dienstag, 13. Oktober');
  });

  it('schreibt den Kopf eines Tagesblocks kurz', () => {
    expect(kopfDatum('2026-10-12')).toBe('Montag, 12.10.');
  });
});
