import { describe, expect, it } from 'vitest';
import { baueKalender } from './ics.ts';
import type { Eintrag } from './typen.ts';

const JETZT = new Date('2026-11-02T20:05:00Z');
const UID_A = 'a'.repeat(64);
const UID_B = 'b'.repeat(64);

const EINTRAEGE: Eintrag[] = [
  {
    uid: UID_A,
    beginn: new Date('2026-11-03T09:00:00Z'),
    ende: new Date('2026-11-03T09:45:00Z'),
    art: 'home_visit',
  },
  {
    uid: UID_B,
    beginn: new Date('2026-11-03T10:30:00.500Z'),
    ende: new Date('2026-11-03T11:00:00Z'),
    art: 'video',
  },
];

describe('Kalenderdatei nach RFC 5545 (ANN-838)', () => {
  it('nennt je Termin nur Kennung, Zeit und Art', () => {
    const text = baueKalender(EINTRAEGE, JETZT);
    expect(text).toContain(
      [
        'BEGIN:VEVENT',
        `UID:${UID_A}`,
        'DTSTAMP:20261102T200500Z',
        'DTSTART:20261103T090000Z',
        'DTEND:20261103T094500Z',
        'SUMMARY:Hausbesuch',
        'CLASS:PRIVATE',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      ].join('\r\n'),
    );
    expect(text).toContain('DTSTART:20261103T103000Z');
    expect(text).toContain('SUMMARY:Video');
    const felder = text.split('\r\n').map((zeile) => zeile.split(/[:;]/)[0]);
    for (const feld of ['LOCATION', 'DESCRIPTION', 'ATTENDEE', 'ORGANIZER', 'URL', 'GEO']) {
      expect(felder).not.toContain(feld);
    }
  });

  it('ist ein gültiger Kalender mit CRLF und Zeilen unter 75 Zeichen, auch ohne Termin', () => {
    for (const text of [baueKalender(EINTRAEGE, JETZT), baueKalender([], JETZT)]) {
      expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
      expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
      const zeilen = text.split('\r\n').slice(0, -1);
      expect(zeilen.every((zeile) => !zeile.includes('\n') && zeile.length <= 75)).toBe(true);
      expect(text).toContain('X-WR-CALNAME:Own Motion');
    }
    expect(baueKalender([], JETZT)).not.toContain('BEGIN:VEVENT');
  });
});
