import type { ElectricityPreview, Overview, PayoutDetails, Reimbursement } from './api';

/**
 * Synthetische Erstattungen für die Tests (ERS-001): Anna mit hinterlegter
 * IBAN, Tim mit einem genehmigten Ladestrom. Ausschließlich erfundene Werte.
 */
export const ANNA = '55555555-5555-4555-8555-000000000002';
export const TIM = '55555555-5555-4555-8555-000000000004';

export function testReimbursement(change: Partial<Reimbursement> = {}): Reimbursement {
  return {
    id: 'erstattung-1',
    staff_member_id: ANNA,
    name: 'Anna Beispiel',
    kind: 'electricity',
    period_month: '2026-09-01',
    working_days: 18,
    energy_wh_per_day: 500,
    rate_cents_per_kwh: 37,
    amount_cents: 333,
    status: 'requested',
    self_entered: false,
    requested_at: '2026-10-02T07:15:00Z',
    decided_at: null,
    decided_by_name: null,
    decision_note: null,
    withdrawn_at: null,
    paid_at: null,
    paid_by_name: null,
    receipts: [],
    ...change,
  };
}

export function testPurchase(change: Partial<Reimbursement> = {}): Reimbursement {
  return testReimbursement({
    id: 'erstattung-2',
    kind: 'purchase',
    period_month: null,
    working_days: null,
    energy_wh_per_day: null,
    rate_cents_per_kwh: null,
    amount_cents: 1290,
    receipts: [
      {
        id: 'beleg-1',
        amount_cents: 1290,
        purpose: 'Massageöl',
        mime_type: 'image/jpeg',
        verified: true,
      },
    ],
    ...change,
  });
}

export function testOverview(change: Partial<Overview> = {}): Overview {
  return {
    my_staff_member_id: ANNA,
    can_decide: false,
    can_read_all: false,
    wh_per_day: 500,
    cents_per_kwh: 37,
    person: {
      staff_member_id: ANNA,
      name: 'Anna Beispiel',
      account: { iban_masked: 'DE89 •••• 3000', since: '2026-09-30T10:00:00Z' },
      reimbursements: [],
    },
    to_decide: [],
    to_pay: [],
    people: [],
    ...change,
  };
}

export function testPreview(change: Partial<ElectricityPreview> = {}): ElectricityPreview {
  return {
    month: '2026-09-01',
    days_in_month: 30,
    suggested_days: 18,
    wh_per_day: 500,
    cents_per_kwh: 37,
    already_requested: false,
    ...change,
  };
}

export function testPayout(change: Partial<PayoutDetails> = {}): PayoutDetails {
  return {
    ...testReimbursement({
      id: 'erstattung-3',
      staff_member_id: TIM,
      name: 'Tim Teamleitung',
      status: 'approved',
    }),
    iban: 'DE02120300000000202051',
    account_since: '2026-10-14T09:00:00Z',
    ...change,
  };
}
