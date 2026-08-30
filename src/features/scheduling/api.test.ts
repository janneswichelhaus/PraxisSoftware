import { describe, expect, it } from 'vitest';
import { bloeckeText, istRasterWert, wochenBloecke, type WorkingHour } from './api';

/**
 * Reine Aufbereitung der Arbeitszeiten (CAL-005).
 *
 * Alles hier rechnet auf Ortszeiten als Zeichenketten. Es wird ausdrücklich
 * kein `Date` gebildet: eine Uhrzeit ohne Datum hat keine Zeitzone.
 */

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';

function zeit(
  staffMemberId: string,
  weekday: number,
  starts_at: string,
  ends_at: string,
): WorkingHour {
  return {
    id: `${staffMemberId}-${weekday}-${starts_at}`,
    staff_member_id: staffMemberId,
    weekday,
    starts_at,
    ends_at,
  };
}

describe('istRasterWert', () => {
  it.each([[5], [10], [15]])('erkennt %s als zulaessig', (wert) => {
    expect(istRasterWert(wert)).toBe(true);
  });

  it.each([[0], [1], [7], [20], [30], [60]])('weist %s ab', (wert) => {
    expect(istRasterWert(wert)).toBe(false);
  });

  it('weist einen fehlenden Wert ab', () => {
    expect(istRasterWert(null)).toBe(false);
    expect(istRasterWert(undefined)).toBe(false);
  });
});

describe('wochenBloecke', () => {
  const zeiten: WorkingHour[] = [
    zeit(ANNA, 1, '13:00', '18:00'),
    zeit(ANNA, 1, '08:00', '12:00'),
    zeit(ANNA, 2, '09:00', '15:00'),
    zeit(TIM, 1, '10:00', '16:00'),
  ];

  it('liefert nur die Bloecke der gefragten Person und des Wochentags', () => {
    expect(wochenBloecke(zeiten, ANNA, 1)).toEqual([
      { von: '08:00', bis: '12:00' },
      { von: '13:00', bis: '18:00' },
    ]);
  });

  it('sortiert nach Beginn, unabhaengig von der Reihenfolge der Daten', () => {
    expect(wochenBloecke(zeiten, ANNA, 1).map((b) => b.von)).toEqual(['08:00', '13:00']);
  });

  it('liefert fuer einen Wochentag ohne Eintrag eine leere Liste', () => {
    expect(wochenBloecke(zeiten, ANNA, 6)).toEqual([]);
  });

  it('vermischt zwei Personen nicht', () => {
    expect(wochenBloecke(zeiten, TIM, 1)).toEqual([{ von: '10:00', bis: '16:00' }]);
  });
});

describe('bloeckeText', () => {
  it('setzt mehrere Bloecke zusammen', () => {
    expect(
      bloeckeText([
        { von: '08:00', bis: '12:00' },
        { von: '13:00', bis: '18:00' },
      ]),
    ).toBe('08:00–12:00, 13:00–18:00');
  });

  it('zeigt ohne Block einen Gedankenstrich', () => {
    // Kein Block ist eine Aussage - "an diesem Tag keine Termine" -, keine
    // fehlende Angabe.
    expect(bloeckeText([])).toBe('—');
  });
});
