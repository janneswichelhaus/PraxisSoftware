import type { Art, Kalender } from './typen.ts';

// Die Kalenderdatei nach RFC 5545: Zeiten in UTC, das Kalenderprogramm zeigt die eigene Zone. Nur
// feste Wörter, nichts aus der Akte; lange Zeilen werden nach 75 Oktetten gefaltet.

export const ART_TEXT: Readonly<Record<Art, string>> = {
  home_visit: 'Hausbesuch',
  practice: 'Praxis',
  video: 'Video',
  internal: 'Fehlzeit',
};

const KODIERER = new TextEncoder();

function utc(zeitpunkt: Date): string {
  return zeitpunkt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** Ein TEXT-Wert nach RFC 5545 3.3.11. */
function text(wert: string): string {
  return wert
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 3.1: höchstens 75 Oktette je Zeile, eine Fortsetzung beginnt mit einem Leerzeichen. */
function falten(zeile: string): string {
  const teile: string[] = [];
  let teil = '';
  let oktette = 0;
  for (const zeichen of zeile) {
    const laenge = KODIERER.encode(zeichen).length;
    if (oktette + laenge > (teile.length === 0 ? 75 : 74)) {
      teile.push(teil);
      teil = '';
      oktette = 0;
    }
    teil += zeichen;
    oktette += laenge;
  }
  teile.push(teil);
  return teile.join('\r\n ');
}

// Absagen erreichen das Telefon erst beim nächsten Abruf; jeder Termin sagt deshalb, wie alt er
// ist und wo es sofort stimmt (Praxis-Review).
export function standText(jetzt: Date, zeitzone: string): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: zeitzone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(jetzt);
  const teil = (art: Intl.DateTimeFormatPartTypes) => teile.find((t) => t.type === art)?.value;
  return (
    `Stand ${teil('day')}.${teil('month')}. ${teil('hour')}:${teil('minute')}. Absagen und ` +
    'Änderungen zeigt Own Motion sofort, dieser Kalender erst beim nächsten Abruf.'
  );
}

/** Ohne Kalender (Adresse unbekannt oder beendet) eine leere Datei: Das Abo im Telefon leert sich. */
export function baueKalender(kalender: Kalender | null, jetzt: Date): string {
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
  if (kalender !== null && kalender.eintraege.length > 0) {
    const notiz = falten(`DESCRIPTION:${text(standText(jetzt, kalender.zeitzone))}`);
    for (const eintrag of kalender.eintraege) {
      zeilen.push(
        'BEGIN:VEVENT',
        `UID:${eintrag.uid}`,
        `DTSTAMP:${stempel}`,
        `DTSTART:${utc(eintrag.beginn)}`,
        `DTEND:${utc(eintrag.ende)}`,
        `SUMMARY:${ART_TEXT[eintrag.art]}`,
        notiz,
        'CLASS:PRIVATE',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      );
    }
  }
  zeilen.push('END:VCALENDAR');
  return `${zeilen.join('\r\n')}\r\n`;
}
