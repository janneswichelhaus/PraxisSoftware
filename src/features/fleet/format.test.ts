import { describe, expect, it } from 'vitest';
import {
  dateinameWerkstatt,
  formatTag,
  formatZeitpunkt,
  kalendertag,
  tageDerWoche,
  wochentagVon,
  wochentageKurz,
} from './format';
import { tagePlus, wochenBeginn } from '@/lib/datum';

describe('Wochentage nach ISO (1 Montag … 7 Sonntag)', () => {
  it('rechnet Wochentag und Montag der Woche ohne Zeitzone', () => {
    expect(wochentagVon('2026-10-12')).toBe(1);
    expect(wochentagVon('2026-10-18')).toBe(7);
    expect(wochenBeginn('2026-10-15')).toBe('2026-10-12');
    expect(wochenBeginn('2026-10-18')).toBe('2026-10-12');
    expect(wochenBeginn('2026-10-12')).toBe('2026-10-12');
  });

  it('bleibt über die Zeitumstellung und den Jahreswechsel beim richtigen Tag', () => {
    // Sommerzeit endet am 25.10.2026, ein Sonntag.
    expect(tagePlus('2026-10-24', 1)).toBe('2026-10-25');
    expect(tagePlus('2026-10-25', 1)).toBe('2026-10-26');
    expect(wochenBeginn('2027-01-01')).toBe('2026-12-28');
    expect(tageDerWoche('2026-12-28')[5]).toBe('2027-01-01');
  });

  it('schreibt die Tage in ihrer Reihenfolge, ungeordnet oder nicht', () => {
    expect(wochentageKurz([5, 1, 2, 4])).toBe('Mo, Di, Do, Fr');
    expect(wochentageKurz([])).toBe('');
  });
});

describe('Zeitpunkte in der Zone der Praxis', () => {
  it('zeigt einen Zeitpunkt als Ortszeit, auch über Mitternacht', () => {
    // 22:30 UTC ist in Tübingen im Oktober schon der nächste Tag.
    expect(formatZeitpunkt('2026-10-15T22:30:00Z', 'Europe/Berlin')).toBe('16.10.2026, 00:30');
    expect(formatTag('2026-10-15T22:30:00Z', 'Europe/Berlin')).toBe('16.10.2026');
    expect(kalendertag('2026-10-15T22:30:00Z', 'Europe/Berlin')).toBe('2026-10-16');
  });

  it('sagt bei einem unlesbaren Wert „–“ statt „Invalid Date“', () => {
    expect(formatZeitpunkt('kaputt', 'Europe/Berlin')).toBe('–');
    expect(formatTag('', 'Europe/Berlin')).toBe('–');
  });
});

describe('Dateiname der Unterlage für die Werkstatt', () => {
  it('besteht aus Rad, Zweck und Tag, ohne Leer- und Sonderzeichen', () => {
    expect(dateinameWerkstatt('Lastenrad 3', '2026-10-08')).toBe(
      'Lastenrad-3_Werkstatt_2026-10-08',
    );
    expect(dateinameWerkstatt('Lastenrad 5 (Ersatz)', '2026-10-08')).toBe(
      'Lastenrad-5-Ersatz_Werkstatt_2026-10-08',
    );
    expect(dateinameWerkstatt('Süd/Rad #2', '2026-10-08')).toBe('Süd-Rad-2_Werkstatt_2026-10-08');
    expect(dateinameWerkstatt('  ', '2026-10-08')).toBe('Rad_Werkstatt_2026-10-08');
  });
});
