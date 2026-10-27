import { describe, expect, it } from 'vitest';
import {
  electricityFormulaOf,
  electricityPurpose,
  ibanValid,
  normalizeIban,
  reimbursementTitle,
} from './rules';
import { testOldElectricity, testPurchase, testReimbursement } from './testdata';

describe('Regeln der Erstattungen (ERS-001)', () => {
  it('nennt den Rechenweg eines älteren Ladestrom-Antrags in der Form, in der er gestellt wurde', () => {
    // Nach Stunden: 160 h × 6 km × 18 Wh = 17,28 kWh × 37 ct.
    expect(electricityFormulaOf(testReimbursement())).toBe(
      '160 h × 6 km/h × 18 Wh/km × 0,37\u00a0€/kWh',
    );
    expect(electricityFormulaOf(testReimbursement({ working_minutes: 7_230 }))).toBe(
      '120,5 h × 6 km/h × 18 Wh/km × 0,37\u00a0€/kWh',
    );
    expect(electricityFormulaOf(testReimbursement({ working_minutes: 7_235 }))).toBe(
      '120,58 h × 6 km/h × 18 Wh/km × 0,37\u00a0€/kWh',
    );
    // Aus den Kilometern der Touren.
    expect(
      electricityFormulaOf(
        testReimbursement({ km_per_hour: null, tour_km: 412, amount_cents: 274 }),
      ),
    ).toBe('412 km × 18 Wh/km × 0,37\u00a0€/kWh');
    // Nach Tagen, vor der Rechnung nach Stunden (ANN-599).
    expect(electricityFormulaOf(testOldElectricity())).toBe('18 × 0,5 kWh × 0,37\u00a0€');
  });

  it('nennt keinen Rechenweg ohne Satz (Büro, ANN-616) und keinen beim Einkauf', () => {
    expect(
      electricityFormulaOf(
        testReimbursement({
          km_per_hour: null,
          wh_per_km: null,
          tour_km: null,
          rate_cents_per_kwh: null,
        }),
      ),
    ).toBeUndefined();
    expect(electricityFormulaOf(testPurchase())).toBeUndefined();
  });

  it('belegt den Zweck des Ladestroms mit dem jüngsten abgeschlossenen Monat vor (ANN-749)', () => {
    expect(electricityPurpose('2026-10-26')).toBe('Ladestrom September 2026');
    expect(electricityPurpose('2026-10-01')).toBe('Ladestrom September 2026');
    expect(electricityPurpose('2026-01-31')).toBe('Ladestrom Dezember 2025');
  });

  it('prüft die IBAN nach ISO 13616 wie app.iban_checksum_ok', () => {
    expect(ibanValid('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(ibanValid('de89370400440532013000')).toBe(true);
    expect(ibanValid('AT61 1904 3002 3457 3201')).toBe(true);
    expect(ibanValid('DE89 3704 0044 0532 0130 01')).toBe(false);
    expect(ibanValid('DE89')).toBe(false);
    expect(ibanValid('')).toBe(false);
    expect(normalizeIban(' de89 3704 ')).toBe('DE893704');
  });

  it('nennt den Antrag mit Monat oder Zweck', () => {
    expect(
      reimbursementTitle({ kind: 'electricity', period_month: '2026-09-01', receipts: [] }),
    ).toBe('Ladestrom September 2026');
    expect(
      reimbursementTitle({
        kind: 'purchase',
        period_month: null,
        receipts: [
          {
            id: 'a',
            amount_cents: 1,
            purpose: 'Massageöl',
            mime_type: 'image/jpeg',
            verified: false,
          },
          {
            id: 'b',
            amount_cents: 1,
            purpose: 'Tape',
            mime_type: 'application/pdf',
            verified: false,
          },
        ],
      }),
    ).toBe('Einkauf: Massageöl, Tape');
  });
});
