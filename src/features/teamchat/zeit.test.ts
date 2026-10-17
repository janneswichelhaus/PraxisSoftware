import { describe, expect, it } from 'vitest';
import { erwaehnte } from './erwaehnung';
import { nachrichtenzeit } from './zeit';

describe('nachrichtenzeit', () => {
  const jetzt = new Date('2026-10-17T12:00:00Z');
  it('zeigt heute nur die Uhrzeit, gestern mit Wort, sonst mit Tag', () => {
    expect(nachrichtenzeit('2026-10-17T07:05:00Z', 'Europe/Berlin', jetzt)).toBe('09:05');
    expect(nachrichtenzeit('2026-10-16T07:05:00Z', 'Europe/Berlin', jetzt)).toBe('gestern, 09:05');
    expect(nachrichtenzeit('2026-10-02T07:05:00Z', 'Europe/Berlin', jetzt)).toBe('2.10., 09:05');
    expect(nachrichtenzeit('2025-12-30T07:05:00Z', 'Europe/Berlin', jetzt)).toBe(
      '30.12.2025, 08:05',
    );
  });

  it('rechnet den Tag in der Zeitzone der Praxis', () => {
    // 23:30 UTC am 16. ist in Berlin schon der 17.
    expect(nachrichtenzeit('2026-10-16T23:30:00Z', 'Europe/Berlin', jetzt)).toBe('01:30');
  });
});

describe('erwaehnte', () => {
  const team = [
    { staff_member_id: 't', name: 'Tim Teamleitung' },
    { staff_member_id: 'o', name: 'Olivia Office' },
  ];
  it('nimmt nur, wer noch mit @ im Text steht', () => {
    expect(erwaehnte('@Tim Teamleitung bitte', team)).toEqual(['t']);
    expect(erwaehnte('Tim Teamleitung ohne at', team)).toEqual([]);
  });
});
