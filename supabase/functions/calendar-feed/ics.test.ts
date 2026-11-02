import { describe, expect, it } from 'vitest';
import { baueKalender, standText } from './ics.ts';
import type { Eintrag, Kalender } from './typen.ts';

const JETZT = new Date('2026-11-02T20:05:00Z');
const UID_A = 'a'.repeat(64);
const UID_B = 'b'.repeat(64);
const UID_C = 'c'.repeat(64);
const KODIERER = new TextEncoder();

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
  {
    uid: UID_C,
    beginn: new Date('2026-11-03T12:00:00Z'),
    ende: new Date('2026-11-03T13:00:00Z'),
    art: 'internal',
  },
];
const KALENDER: Kalender = { zeitzone: 'Europe/Berlin', eintraege: EINTRAEGE };

/** RFC 5545 3.1: gefaltete Zeilen wieder zusammensetzen. */
function entfaltet(text: string): string {
  return text.replace(/\r\n /g, '');
}

describe('Kalenderdatei nach RFC 5545 (ANN-838)', () => {
  it('nennt je Termin nur Kennung, Zeit, Art und den Stand des Abrufs', () => {
    const text = entfaltet(baueKalender(KALENDER, JETZT));
    expect(text).toContain(
      [
        'BEGIN:VEVENT',
        `UID:${UID_A}`,
        'DTSTAMP:20261102T200500Z',
        'DTSTART:20261103T090000Z',
        'DTEND:20261103T094500Z',
        'SUMMARY:Hausbesuch',
        'DESCRIPTION:Stand 02.11. 21:05. Absagen und Änderungen zeigt Own Motion sofort\\, ' +
          'dieser Kalender erst beim nächsten Abruf.',
        'CLASS:PRIVATE',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      ].join('\r\n'),
    );
    expect(text).toContain('DTSTART:20261103T103000Z');
    expect(text).toContain('SUMMARY:Video');
    // Eine Fehlzeit heißt so, nie nach ihrem Titel.
    expect(text).toContain('SUMMARY:Fehlzeit');
    const felder = text.split('\r\n').map((zeile) => zeile.split(/[:;]/)[0]);
    for (const feld of ['LOCATION', 'ATTENDEE', 'ORGANIZER', 'URL', 'GEO', 'ATTACH', 'CONTACT']) {
      expect(felder).not.toContain(feld);
    }
  });

  it('nennt den Stand in der Zeitzone der Praxis', () => {
    expect(standText(JETZT, 'Europe/Berlin')).toMatch(/^Stand 02\.11\. 21:05\. /);
    expect(standText(JETZT, 'America/New_York')).toMatch(/^Stand 02\.11\. 15:05\. /);
    expect(standText(new Date('2026-07-01T22:30:00Z'), 'Europe/Berlin')).toMatch(
      /^Stand 02\.07\. 00:30\. /,
    );
  });

  it('ist ein gültiger Kalender mit CRLF, gefaltet nach höchstens 75 Oktetten', () => {
    for (const text of [baueKalender(KALENDER, JETZT), baueKalender(null, JETZT)]) {
      expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
      expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
      const zeilen = text.split('\r\n').slice(0, -1);
      for (const zeile of zeilen) {
        expect(zeile.includes('\n')).toBe(false);
        expect(KODIERER.encode(zeile).length).toBeLessThanOrEqual(75);
      }
      expect(text).toContain('X-WR-CALNAME:Own Motion');
    }
    // Die Notiz ist länger als eine Zeile und wird tatsächlich gefaltet.
    expect(baueKalender(KALENDER, JETZT)).toMatch(/\r\n [^\r\n]/);
  });

  it('ist leer ohne Kalender oder ohne Termin', () => {
    for (const kalender of [null, { zeitzone: 'Europe/Berlin', eintraege: [] }]) {
      const text = baueKalender(kalender, JETZT);
      expect(text).not.toContain('BEGIN:VEVENT');
      expect(text).not.toContain('DESCRIPTION');
    }
  });
});
