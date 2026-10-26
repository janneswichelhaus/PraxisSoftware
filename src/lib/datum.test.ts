import { describe, expect, it } from 'vitest';
import {
  dateDayMonth,
  dateLong,
  formatDate,
  isoWochentag,
  monatKurz,
  monatLang,
  tagKurz,
  tagePlus,
  wochenBeginn,
  zeitraumText,
} from './datum';

describe('formatDate', () => {
  it('formatiert ein Datum deutsch', () => {
    expect(formatDate('2026-02-10')).toBe('10.02.2026');
  });

  it('zeigt einen Platzhalter statt eines leeren Feldes', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('zeigt denselben Platzhalter bei einem unlesbaren Wert', () => {
    expect(formatDate('kein datum')).toBe('—');
  });
});

describe('isoWochentag', () => {
  it.each([
    ['2027-05-10', 1],
    ['2027-05-12', 3],
    ['2027-05-15', 6],
    ['2027-05-16', 7],
  ])('bestimmt fuer %s den Wochentag %s', (tag, erwartet) => {
    expect(isoWochentag(tag)).toBe(erwartet);
  });

  it('bleibt mit dem Montag der Woche ueber den Jahreswechsel stimmig', () => {
    expect(wochenBeginn('2027-01-01')).toBe('2026-12-28');
    expect(wochenBeginn('2026-10-18')).toBe('2026-10-12');
    expect(wochenBeginn('2026-10-12')).toBe('2026-10-12');
  });
});

describe('Kalendertage als Text', () => {
  it('schreibt Wochentag, Tag und Monat aus', () => {
    expect(dateLong('2026-11-03')).toBe('Dienstag, 3. November');
    expect(dateDayMonth('2026-12-01')).toBe('1. Dezember');
  });

  it('nennt Monate kurz nach dem Duden und lang mit Jahr', () => {
    expect(monatKurz('2026-09-01')).toBe('Sept.');
    expect(monatKurz('2026-03-15')).toBe('März');
    expect(monatLang('2026-10-01')).toBe('Oktober 2026');
    expect(tagKurz('2026-10-03')).toBe('3. Okt.');
  });

  it('kürzt einen Zeitraum im selben Monat und Jahr', () => {
    expect(zeitraumText('2027-08-04', '2027-08-15')).toBe('4.–15. Aug. 2027');
    expect(zeitraumText('2027-07-28', '2027-08-06')).toBe('28. Juli – 6. Aug. 2027');
    expect(zeitraumText('2027-12-28', '2028-01-08')).toBe('28. Dez. 2027 – 8. Jan. 2028');
    expect(zeitraumText('2027-08-04', '2027-08-04')).toBe('4. Aug. 2027');
  });

  it('lässt das laufende Jahr weg', () => {
    expect(zeitraumText('2027-08-04', '2027-08-15', 2027)).toBe('4.–15. Aug.');
    expect(zeitraumText('2027-12-28', '2028-01-08', 2027)).toBe('28. Dez. 2027 – 8. Jan. 2028');
  });
});

describe('tagePlus', () => {
  it('rechnet auch rückwärts über den Monatswechsel und die Zeitumstellung', () => {
    // Die Sommerzeit endet am 25.10.2026; ein Kalendertag bleibt trotzdem ein Tag.
    expect(tagePlus('2026-11-01', -1)).toBe('2026-10-31');
    expect(tagePlus('2026-10-26', -2)).toBe('2026-10-24');
  });
});
