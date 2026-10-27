import { describe, expect, it } from 'vitest';
import {
  KENNZAHLEN,
  alsCsv,
  auslastungProzent,
  csvDateiname,
  monatsauswahl,
  monatsname,
  zielAlsEingabe,
  zielAusEingabe,
  zielstand,
  type Ziele,
} from './kennzahlen';
import { beispielKennzahlen } from './testdaten';

const keineZiele: Ziele = {
  revenue_cents: null,
  open_items_cents: null,
  utilization_percent: null,
  ending_bases: null,
  absences: null,
};

describe('Kennzahlen (STA-003, ANN-155)', () => {
  it('fuehrt genau fuenf Kennzahlen, jede mit einer Handlung', () => {
    expect(KENNZAHLEN.map((k) => k.ziel)).toEqual([
      'revenue_cents',
      'open_items_cents',
      'utilization_percent',
      'ending_bases',
      'absences',
    ]);
    for (const kennzahl of KENNZAHLEN) {
      expect(kennzahl.handlung.to).toMatch(/^\//);
    }
  });

  it('misst Umsatz und Auslastung als Mindestwert, den Rest als Hoechstwert', () => {
    const richtung = Object.fromEntries(KENNZAHLEN.map((k) => [k.ziel, k.richtung]));
    expect(richtung).toEqual({
      revenue_cents: 'mindestens',
      open_items_cents: 'hoechstens',
      utilization_percent: 'mindestens',
      ending_bases: 'hoechstens',
      absences: 'hoechstens',
    });
  });

  it('bewertet das Ziel nur, wenn Wert und Ziel da sind', () => {
    expect(zielstand(100, 90, 'mindestens')).toBe('erreicht');
    expect(zielstand(90, 90, 'mindestens')).toBe('erreicht');
    expect(zielstand(80, 90, 'mindestens')).toBe('verfehlt');
    expect(zielstand(3, 4, 'hoechstens')).toBe('erreicht');
    expect(zielstand(5, 4, 'hoechstens')).toBe('verfehlt');
    expect(zielstand(null, 4, 'hoechstens')).toBeNull();
    expect(zielstand(5, null, 'hoechstens')).toBeNull();
  });

  it('rechnet die Auslastung in ganzen Prozent und ohne Arbeitszeit gar nicht', () => {
    expect(auslastungProzent({ booked_minutes: 4_500, available_minutes: 6_000 })).toBe(75);
    expect(auslastungProzent({ booked_minutes: 0, available_minutes: 0 })).toBeNull();
  });

  it('zaehlt als Ausfall Absagen und Nichtantreffen', () => {
    const ausfall = KENNZAHLEN.find((k) => k.ziel === 'absences')!;
    expect(ausfall.wert(beispielKennzahlen())).toBe(4);
  });

  it('liest Zielwerte aus der Eingabe und weist Unsinn ab', () => {
    expect(zielAusEingabe('', 'cent')).toEqual({ ok: true, wert: null });
    expect(zielAusEingabe('12000', 'cent')).toEqual({ ok: true, wert: 1_200_000 });
    expect(zielAusEingabe('12.000,50', 'cent')).toEqual({ ok: true, wert: 1_200_050 });
    expect(zielAusEingabe('zwoelf', 'cent')).toEqual({ ok: false });
    expect(zielAusEingabe('85', 'prozent')).toEqual({ ok: true, wert: 85 });
    expect(zielAusEingabe('101', 'prozent')).toEqual({ ok: false });
    expect(zielAusEingabe('2,5', 'anzahl')).toEqual({ ok: false });
    expect(zielAlsEingabe(1_200_050, 'cent')).toBe('12000,50');
    expect(zielAlsEingabe(null, 'anzahl')).toBe('');
  });

  it('bietet die letzten zwoelf Monate an, ueber den Jahreswechsel', () => {
    const monate = monatsauswahl('2026-02-10');
    expect(monate).toHaveLength(12);
    expect(monate[0]).toBe('2026-02-01');
    expect(monate[2]).toBe('2025-12-01');
    expect(monatsname('2026-09-01')).toBe('September 2026');
  });
});

describe('CSV (STA-003)', () => {
  it('traegt jede Kennzahl mit Zeitraum, Vergleich und Ziel - nur Summen', () => {
    const csv = alsCsv(beispielKennzahlen(), { ...keineZiele, revenue_cents: 1_200_000 });
    const zeilen = csv.trimEnd().split('\r\n');
    expect(zeilen[0]).toBe('Kennzahl;Zeitraum;Wert;Vergleich;Vergleichszeitraum;Ziel;Einheit');
    expect(zeilen).toContain(
      'Umsatz (Rechnungsstellung, brutto);September 2026;12345,00;11000,00;August 2026;12000,00;EUR',
    );
    expect(zeilen).toContain(
      'Zahlungseingang (Zufluss);September 2026;9800,00;10500,00;August 2026;;EUR',
    );
    expect(zeilen).toContain('Auslastung;29.09.2026 bis 12.10.2026;75;;;;Prozent');
    expect(zeilen).toContain('Ausfälle;02.09.2026 bis 29.09.2026;4;2;vier Wochen davor;;Anzahl');
    expect(csv).not.toMatch(/patient|Patientin|Rechnungsnummer/i);
  });

  it('benennt die Datei nach Monat und Stichtag, ohne Namen', () => {
    expect(csvDateiname(beispielKennzahlen())).toBe('statistik-2026-09-stand-2026-09-29.csv');
  });
});
