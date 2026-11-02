import type { Art, Eintrag } from './typen.ts';

// Die Kalenderdatei nach RFC 5545: Zeiten in UTC, das Kalenderprogramm zeigt die eigene Zone. Nur
// feste Wörter, nichts aus der Akte; jede Zeile bleibt unter 75 Zeichen und braucht kein Falten.

export const ART_TEXT: Readonly<Record<Art, string>> = {
  home_visit: 'Hausbesuch',
  practice: 'Praxis',
  video: 'Video',
};

function utc(zeitpunkt: Date): string {
  return zeitpunkt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function baueKalender(eintraege: readonly Eintrag[], jetzt: Date): string {
  const stempel = utc(jetzt);
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Own Motion//Kalender-Abo//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Own Motion',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const eintrag of eintraege) {
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${eintrag.uid}`,
      `DTSTAMP:${stempel}`,
      `DTSTART:${utc(eintrag.beginn)}`,
      `DTEND:${utc(eintrag.ende)}`,
      `SUMMARY:${ART_TEXT[eintrag.art]}`,
      'CLASS:PRIVATE',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  zeilen.push('END:VCALENDAR');
  return `${zeilen.join('\r\n')}\r\n`;
}
