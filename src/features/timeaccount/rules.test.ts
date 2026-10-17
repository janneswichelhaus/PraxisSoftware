import { describe, expect, it } from 'vitest';
import {
  dateWindow,
  outsideWindow,
  overtimeEnd,
  overtimeMax,
  overtimeStart,
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

  it('beginnt Überstunden am Dienstende, an einem freien Tag um 08:00 (ANN-606)', () => {
    expect(overtimeStart(ANNAS_TAG)).toBe('18:00');
    expect(overtimeStart([])).toBe('08:00');
    expect(overtimeEnd('18:00', 75)).toBe('19:15');
    expect(overtimeEnd('', 75)).toBe('');
  });

  it('reicht mit dem Regler höchstens sechs Stunden und nie über Mitternacht', () => {
    expect(overtimeMax('08:00')).toBe(360);
    expect(overtimeMax('21:00')).toBe(180);
    expect(overtimeMax('23:45')).toBe(15);
    expect(overtimeMax('')).toBe(360);
    expect(overtimeEnd('21:00', overtimeMax('21:00'))).toBe('24:00');
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

  it('nennt die Frist je Art', () => {
    expect(problemText('date_out_of_range', 'overtime')).toMatch(/nicht im Voraus/);
    expect(problemText('date_out_of_range', 'time_off')).toMatch(/ein Jahr voraus/);
    expect(problemText('overlaps_working_hours', 'overtime')).toMatch(/nur davor oder danach/);
    expect(problemText('correction_invalid', 'correction')).toMatch(/^Minusstunden ziehen nur ab/);
  });

  it('lässt Termine nur außerhalb der freien Zeit stehen (Praxis-Review Überholung 9, Runde 2)', () => {
    expect(outsideWindow('16:00', '18:00')).toEqual([
      { von: '00:00', bis: '16:00' },
      { von: '18:00', bis: '23:59' },
    ]);
    expect(outsideWindow('00:00', '10:00')).toEqual([{ von: '10:00', bis: '23:59' }]);
  });
});
