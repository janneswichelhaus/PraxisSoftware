import { describe, expect, it } from 'vitest';
import {
  dateWindow,
  overtimeChoices,
  parseHours,
  problemText,
  signedHours,
  timeOffChoices,
} from './rules';

const ANNAS_TAG = [
  { von: '08:00', bis: '12:00' },
  { von: '13:00', bis: '18:00' },
];

describe('Zeitkonto rechnen (ZK-001, ANN-593)', () => {
  it('schreibt den Saldo mit Vorzeichen und ohne Umbruch', () => {
    expect(signedHours(135)).toBe('+2:15 Std.');
    expect(signedHours(-90)).toBe('−1:30 Std.');
    expect(signedHours(0)).toBe('0:00 Std.');
  });

  it('hält dieselben Fristen wie der Server', () => {
    expect(dateWindow('overtime', '2026-10-17')).toEqual({ from: '2026-09-16', to: '2026-10-17' });
    expect(dateWindow('time_off', '2026-10-17')).toEqual({ from: '2026-09-16', to: '2027-10-17' });
    expect(dateWindow('correction', '2026-10-17')).toEqual({
      from: '2025-10-16',
      to: '2026-10-17',
    });
  });

  it('bietet Mehrarbeit ab Dienstende an, an einem freien Tag nichts', () => {
    expect(overtimeChoices(ANNAS_TAG).map((c) => `${c.label} ${c.von}-${c.bis}`)).toEqual([
      '+0:15 18:00-18:15',
      '+0:30 18:00-18:30',
      '+0:45 18:00-18:45',
      '+1:00 18:00-19:00',
      '+1:30 18:00-19:30',
      '+2:00 18:00-20:00',
    ]);
    expect(overtimeChoices([])).toEqual([]);
    // Nie über Mitternacht.
    expect(overtimeChoices([{ von: '15:00', bis: '23:00' }]).map((c) => c.bis)).toEqual([
      '23:15',
      '23:30',
      '23:45',
      '24:00',
    ]);
  });

  it('bietet Freizeitausgleich am Plan des Tages an', () => {
    expect(timeOffChoices(ANNAS_TAG)).toEqual([
      { label: '1 Std. früher gehen', von: '17:00', bis: '18:00' },
      { label: '2 Std. früher gehen', von: '16:00', bis: '18:00' },
      { label: '1 Std. später kommen', von: '08:00', bis: '09:00' },
      { label: 'Ganzer Tag', von: '08:00', bis: '18:00' },
    ]);
    expect(timeOffChoices([])).toEqual([]);
  });

  it('liest Stunden einer Korrektur, wie man sie tippt', () => {
    expect(parseHours('12:30')).toBe(750);
    expect(parseHours('+0:45')).toBe(45);
    expect(parseHours('-2')).toBe(-120);
    expect(parseHours('−1,5')).toBe(-90);
    expect(parseHours('1.25')).toBe(75);
    for (const falsch of ['', '0', '0:00', 'zwei', '1:75', '1001:00']) {
      expect(parseHours(falsch), falsch).toBeNull();
    }
  });

  it('nennt die Frist je Art', () => {
    expect(problemText('date_out_of_range', 'overtime')).toMatch(/nicht im Voraus/);
    expect(problemText('date_out_of_range', 'time_off')).toMatch(/ein Jahr voraus/);
    expect(problemText('overlaps_working_hours', 'overtime')).toMatch(/außerhalb/);
  });
});
