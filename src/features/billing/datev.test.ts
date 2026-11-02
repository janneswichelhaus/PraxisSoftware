import { describe, expect, it } from 'vitest';
import {
  DatevFehler,
  SPALTENZAHL,
  buchungsstapel,
  buchungszeile,
  dateiname,
  inWindows1252,
  kopfzeile,
  sortiert,
  stapelname,
  type DatevBuchung,
  type DatevLauf,
} from './datev';

function buchung(teil: Partial<DatevBuchung>): DatevBuchung {
  return {
    kind: 'invoice',
    document_date: '2026-09-03',
    invoice_number: 'RG-2026-0101',
    document_number: null,
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    small_business: false,
    amount_cents: 14000,
    direction: null,
    method: null,
    currency: 'EUR',
    ...teil,
  };
}

const zahlung = (teil: Partial<DatevBuchung> = {}) =>
  buchung({
    kind: 'payment',
    tax_treatment: null,
    tax_rate_permille: null,
    direction: 'incoming',
    method: 'bank_transfer',
    ...teil,
  });

function lauf(teil: Partial<DatevLauf> = {}): DatevLauf {
  return {
    id: 'a',
    service_area: 'therapy',
    period_month: '2026-09-01',
    sequence: 1,
    consultant_number: 1001,
    client_number: 1,
    chart_of_accounts: 'SKR03',
    created_stamp: '20261003101500123',
    bookings: [],
    ...teil,
  };
}

describe('Buchungszeile (ANN-828)', () => {
  it('bucht die Rechnung Debitor an Erlöskonto je Steuerkennzeichen', () => {
    expect(buchungszeile(buchung({}), 'SKR03')).toEqual({
      umsatzCent: 14000,
      sollHaben: 'S',
      konto: 10000,
      gegenkonto: 8100,
      belegdatum: '2026-09-03',
      belegfeld1: 'RG-2026-0101',
      buchungstext: 'Rechnung RG-2026-0101',
    });
    const regelsatz = buchung({ tax_treatment: 'taxable', tax_rate_permille: 190 });
    expect(buchungszeile(regelsatz, 'SKR03').gegenkonto).toBe(8400);
    expect(buchungszeile(regelsatz, 'SKR04').gegenkonto).toBe(4400);
    expect(buchungszeile(buchung({ tax_treatment: 'not_taxable' }), 'SKR04').gegenkonto).toBe(4200);
    expect(buchungszeile(buchung({ small_business: true }), 'SKR03').gegenkonto).toBe(8195);
  });

  it('dreht das Storno um und nennt sein Dokument', () => {
    const zeile = buchungszeile(
      buchung({ kind: 'cancellation', document_number: 'RG-2026-0105' }),
      'SKR03',
    );
    expect(zeile).toMatchObject({ sollHaben: 'H', konto: 10000, gegenkonto: 8100 });
    expect(zeile.buchungstext).toBe('Storno RG-2026-0105 zu RG-2026-0101');
  });

  it('bucht Zahlung, Erstattung und Verrechnung über das passende Geldkonto', () => {
    expect(buchungszeile(zahlung(), 'SKR03')).toMatchObject({
      sollHaben: 'S',
      konto: 1200,
      gegenkonto: 10000,
      buchungstext: 'Zahlung RG-2026-0101',
    });
    expect(buchungszeile(zahlung({ direction: 'refund', method: 'other' }), 'SKR04')).toMatchObject(
      { sollHaben: 'H', konto: 1600, buchungstext: 'Erstattung RG-2026-0101' },
    );
    expect(buchungszeile(zahlung({ method: 'offset' }), 'SKR03')).toMatchObject({
      konto: 1360,
      buchungstext: 'Verrechnung RG-2026-0101',
    });
  });

  it('bucht die Karte über Geldtransit, bis der Zahlungsdienst auszahlt (ANN-836)', () => {
    expect(buchungszeile(zahlung({ method: 'card' }), 'SKR03')).toMatchObject({
      sollHaben: 'S',
      konto: 1360,
      gegenkonto: 10000,
      buchungstext: 'Zahlung Karte RG-2026-0101',
    });
    expect(buchungszeile(zahlung({ method: 'card', direction: 'refund' }), 'SKR04')).toMatchObject({
      sollHaben: 'H',
      konto: 1460,
      buchungstext: 'Erstattung Karte RG-2026-0101',
    });
  });

  it('kehrt beim Zahlungsstorno die Richtung der Zahlung um', () => {
    expect(buchungszeile(zahlung({ kind: 'payment_void' }), 'SKR03')).toMatchObject({
      sollHaben: 'H',
      buchungstext: 'Storno Zahlung RG-2026-0101',
    });
    expect(
      buchungszeile(zahlung({ kind: 'payment_void', direction: 'refund' }), 'SKR03').sollHaben,
    ).toBe('S');
  });

  it('bricht ab statt zu raten: fremde Währung, Satz ohne Konto, unpassende Nummer', () => {
    expect(() => buchungszeile(buchung({ currency: 'CHF' }), 'SKR03')).toThrow(DatevFehler);
    expect(() =>
      buchungszeile(buchung({ tax_treatment: 'taxable', tax_rate_permille: 160 }), 'SKR03'),
    ).toThrow(/fehlt ein Erlöskonto \(16 %\)/);
    expect(() => buchungszeile(buchung({ invoice_number: 'RG 2026/ä' }), 'SKR03')).toThrow(
      /Belegfeld/,
    );
    expect(() => buchungszeile(buchung({ amount_cents: 0 }), 'SKR03')).toThrow(DatevFehler);
  });
});

describe('Buchungsstapel', () => {
  it('schreibt Kopf mit 31 Feldern, 125 Spalten und Zeilen mit CR LF', () => {
    const inhalt = buchungsstapel(
      lauf({
        bookings: [
          zahlung({ document_date: '2026-09-20', amount_cents: 16380 }),
          buchung({ tax_treatment: 'taxable', tax_rate_permille: 190, amount_cents: 2380 }),
          buchung({}),
        ],
      }),
    );
    const zeilen = inhalt.split('\r\n');
    expect(zeilen.at(-1)).toBe('');
    expect(zeilen[0]!.split(';')).toHaveLength(31);
    expect(zeilen[1]!.split(';')).toHaveLength(SPALTENZAHL);
    expect(SPALTENZAHL).toBe(125);
    expect(zeilen[2]!.split(';')).toHaveLength(125);
    expect(zeilen.slice(2, 5).map((z) => z.split(';').slice(0, 14).join(';'))).toEqual([
      '140,00;"S";"EUR";;;;10000;8100;;0309;"RG-2026-0101";;;"Rechnung RG-2026-0101"',
      '23,80;"S";"EUR";;;;10000;8400;;0309;"RG-2026-0101";;;"Rechnung RG-2026-0101"',
      '163,80;"S";"EUR";;;;1200;10000;;2009;"RG-2026-0101";;;"Zahlung RG-2026-0101"',
    ]);
  });

  it('füllt den Kopf mit Berater, Mandant, Wirtschaftsjahr, Zeitraum und Kontenrahmen', () => {
    expect(kopfzeile(lauf({ chart_of_accounts: 'SKR04', sequence: 2 }))).toBe(
      '"EXTF";700;21;"Buchungsstapel";13;20261003101500123;;"RE";"";"";1001;1;20260101;4;20260901;20260930;"Behandlung 2026-09 Nachtrag 1";"";1;0;0;"EUR";;"";;;"04";;;"";""',
    );
  });

  it('nennt Stapel und Datei nach Bereich, Monat und Lauf', () => {
    const training = { service_area: 'training', period_month: '2026-02-01', sequence: 1 } as const;
    expect(stapelname(training)).toBe('Training 2026-02');
    expect(dateiname(training)).toBe('EXTF_Buchungsstapel_Training_2026-02.csv');
    expect(dateiname({ ...training, sequence: 3 })).toBe(
      'EXTF_Buchungsstapel_Training_2026-02_Nachtrag-2.csv',
    );
    expect(kopfzeile(lauf({ period_month: '2028-02-01' }))).toContain('20280201;20280229');
  });

  it('ordnet fest, gleich in welcher Folge der Server liefert', () => {
    const a = [zahlung({ document_date: '2026-09-02' }), buchung({ document_date: '2026-09-02' })];
    expect(sortiert(a).map((b) => b.kind)).toEqual(['invoice', 'payment']);
    expect(buchungsstapel(lauf({ bookings: a }))).toBe(
      buchungsstapel(lauf({ bookings: [...a].reverse() })),
    );
  });

  it('weist eine Buchung außerhalb des Monats ab', () => {
    expect(() =>
      buchungsstapel(lauf({ bookings: [buchung({ document_date: '2026-10-01' })] })),
    ).toThrow(/außerhalb des Monats/);
  });
});

describe('Windows-1252', () => {
  it('schreibt Umlaute, ß und € als ein Byte', () => {
    expect(inWindows1252('ä ß €')).toEqual(Uint8Array.from([0xe4, 0x20, 0xdf, 0x20, 0x80]));
    expect(inWindows1252('ü')).toEqual(Uint8Array.from([0xfc]));
    expect(inWindows1252('\r\n')).toEqual(Uint8Array.from([0x0d, 0x0a]));
  });

  it('bricht bei einem Zeichen außerhalb ab', () => {
    expect(() => inWindows1252('Łódź')).toThrow(DatevFehler);
  });
});
