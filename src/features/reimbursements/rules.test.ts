import { describe, expect, it } from 'vitest';
import {
  electricityCents,
  electricityFormula,
  ibanValid,
  normalizeIban,
  reimbursementTitle,
  selectableMonths,
} from './rules';

describe('Regeln der Erstattungen (ERS-001)', () => {
  it('rechnet den Ladestrom auf Cent wie die Bedingung am Server (ANN-599)', () => {
    expect(electricityCents(18, 500, 37)).toBe(333);
    // 17 × 0,5 × 37 = 314,5 Cent: kaufmännisch aufgerundet.
    expect(electricityCents(17, 500, 37)).toBe(315);
    expect(electricityCents(1, 500, 37)).toBe(19);
    expect(electricityFormula(18, 500, 37)).toBe('18 × 0,5 kWh × 0,37\u00a0€');
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
