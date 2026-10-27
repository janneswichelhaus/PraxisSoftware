import { describe, expect, it } from 'vitest';
import { daysBetween, waitingText, windowsError, windowsText } from './api';

describe('Warteliste: Hilfen (PRX-001)', () => {
  it('schreibt Wunschzeiten sortiert und kurz', () => {
    expect(
      windowsText([
        { weekday: 3, from: '14:00', to: '18:00' },
        { weekday: 1, from: '08:00', to: '12:00' },
      ]),
    ).toBe('Mo 08:00–12:00 · Mi 14:00–18:00');
  });

  it('sagt „jederzeit", wenn keine Wunschzeit angegeben ist', () => {
    expect(windowsText([])).toBe('jederzeit');
  });

  it('rechnet die Wartezeit in Kalendertagen', () => {
    expect(daysBetween('2026-09-01', '2026-09-28')).toBe(27);
    expect(waitingText('2026-09-28T08:00:00+00:00', '2026-09-28')).toBe('seit heute');
    expect(waitingText('2026-09-27T08:00:00+00:00', '2026-09-28')).toBe('seit gestern');
    expect(waitingText('2026-09-20T08:00:00+00:00', '2026-09-28')).toBe('seit 8 Tagen');
  });

  it('prüft die Wunschzeiten wie der Server', () => {
    expect(windowsError([{ weekday: 1, from: '08:00', to: '12:00' }])).toBeNull();
    expect(windowsError([{ weekday: 1, from: '12:00', to: '08:00' }])).toMatch(/vor ihrem Beginn/);
    expect(windowsError([{ weekday: 1, from: '', to: '08:00' }])).toMatch(/Beginn und Ende/);
    expect(
      windowsError(Array.from({ length: 15 }, () => ({ weekday: 1, from: '08:00', to: '09:00' }))),
    ).toMatch(/Höchstens 14/);
  });
});
