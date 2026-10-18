import { describe, expect, it } from 'vitest';
import {
  electricityCents,
  electricityCentsFromKm,
  electricityCentsFromMinutes,
  electricityFormula,
  electricityFormulaOf,
  electricityHoursFormula,
  electricityKmFormula,
  hoursText,
  ibanValid,
  normalizeIban,
  reimbursementTitle,
  selectableMonths,
} from './rules';
import { testOldElectricity, testPurchase, testReimbursement } from './testdata';

describe('Regeln der Erstattungen (ERS-001)', () => {
  it('rechnet den Ladestrom auf Cent wie die Bedingung am Server (ANN-599)', () => {
    expect(electricityCents(18, 500, 37)).toBe(333);
    // 17 × 0,5 × 37 = 314,5 Cent: kaufmännisch aufgerundet.
    expect(electricityCents(17, 500, 37)).toBe(315);
    expect(electricityCents(1, 500, 37)).toBe(19);
    expect(electricityFormula(18, 500, 37)).toBe('18 × 0,5 kWh × 0,37\u00a0€');
  });

  it('rechnet seit BEF-181 km × Wh/km × ct auf Cent wie record_electricity_tour_distance', () => {
    // 412 km × 18 Wh = 7,416 kWh × 37 ct = 274,392 ct.
    expect(electricityCentsFromKm(412, 18, 37)).toBe(274);
    // 25 km × 10 Wh × 30 ct = 7,5 ct: kaufmännisch aufgerundet.
    expect(electricityCentsFromKm(25, 10, 30)).toBe(8);
    expect(electricityKmFormula(412, 18, 37)).toBe('412 km × 18 Wh/km × 0,37\u00a0€/kWh');
    expect(
      electricityFormulaOf(
        testReimbursement({ km_per_hour: null, tour_km: 412, amount_cents: 274 }),
      ),
    ).toBe('412 km × 18 Wh/km × 0,37\u00a0€/kWh');
  });

  it('rechnet seit ORG-008 Stunden × km/h × Wh/km × ct auf Cent wie app.electricity_amount_cents', () => {
    // 160 h × 6 km × 18 Wh = 17,28 kWh × 37 ct = 639,36 ct.
    expect(electricityCentsFromMinutes(9_600, 6, 18, 37)).toBe(639);
    // 2,5 h × 6 km × 18 Wh = 0,27 kWh × 37 ct = 9,99 ct; 2,5 h × 10 × 10 × 30 = 7,5 ct: aufgerundet.
    expect(electricityCentsFromMinutes(150, 6, 18, 37)).toBe(10);
    expect(electricityCentsFromMinutes(150, 10, 10, 30)).toBe(8);
    expect(electricityCentsFromMinutes(0, 6, 18, 37)).toBe(0);
    // Die Grenzen der Einstellung: 31 Tage rund um die Uhr bleiben weit unter 2^53.
    expect(electricityCentsFromMinutes(44_640, 30, 100, 200)).toBe(446_400);
    expect(hoursText(9_600)).toBe('160 h');
    expect(hoursText(7_230)).toBe('120,5 h');
    expect(hoursText(7_235)).toBe('120,58 h');
    expect(electricityHoursFormula(9_600, 6, 18, 37)).toBe(
      '160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh',
    );
  });

  it('nennt die Rechnung eines Antrags in der Form, in der er gestellt wurde', () => {
    expect(electricityFormulaOf(testReimbursement())).toBe(
      '160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh',
    );
    expect(electricityFormulaOf(testOldElectricity())).toBe('18 × 0,5 kWh × 0,37 €');
    expect(electricityFormulaOf(testPurchase())).toBeUndefined();
  });

  it('bietet die zwölf abgeschlossenen Monate vor dem laufenden, den jüngsten zuerst', () => {
    const monate = selectableMonths('2026-10-16');
    expect(monate).toHaveLength(12);
    expect(monate[0]).toBe('2026-09-01');
    expect(monate[11]).toBe('2025-10-01');
    expect(selectableMonths('2026-01-31')[0]).toBe('2025-12-01');
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
