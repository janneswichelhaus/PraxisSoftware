import { describe, expect, it } from 'vitest';
import { feiertag, feiertage, ostersonntag } from './feiertage';

describe('Feiertage BW und NW (ANN-577)', () => {
  it('rechnet Ostern nach Gauß', () => {
    expect(ostersonntag(2026)).toBe('2026-04-05');
    expect(ostersonntag(2027)).toBe('2027-03-28');
    expect(ostersonntag(2024)).toBe('2024-03-31');
    expect(ostersonntag(2019)).toBe('2019-04-21');
  });

  it('kennt die Feiertage 2026 in Baden-Württemberg', () => {
    expect(feiertage(2026, 'BW').map((f) => f.tag)).toEqual([
      '2026-01-01',
      '2026-01-06',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-05-14',
      '2026-05-25',
      '2026-06-04',
      '2026-10-03',
      '2026-11-01',
      '2026-12-25',
      '2026-12-26',
    ]);
  });

  it('kennt die beweglichen Feiertage 2027 und lässt Hl. Drei Könige in NW weg', () => {
    const nw = feiertage(2027, 'NW').map((f) => f.tag);
    expect(nw).not.toContain('2027-01-06');
    expect(nw).toEqual(
      expect.arrayContaining([
        '2027-03-26',
        '2027-03-29',
        '2027-05-06',
        '2027-05-17',
        '2027-05-27',
      ]),
    );
    expect(nw).toHaveLength(11);
    expect(feiertage(2027, 'BW')).toHaveLength(12);
  });

  it('nennt den Feiertag an einem Tag, sonst nichts', () => {
    expect(feiertag('2026-06-04', 'NW')).toBe('Fronleichnam');
    expect(feiertag('2026-01-06', 'NW')).toBeNull();
    expect(feiertag('2026-01-06', 'BW')).toBe('Heilige Drei Könige');
    // Rosenmontag ist kein gesetzlicher Feiertag.
    expect(feiertag('2026-02-16', 'NW')).toBeNull();
  });
});
