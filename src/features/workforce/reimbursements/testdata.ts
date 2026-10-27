import type { Overview, PayoutDetails, Reimbursement } from './api';

/**
 * Synthetische Erstattungen für die Tests (ERS-001, ORG-008): Anna mit
 * hinterlegter IBAN, Tim mit einem genehmigten Ladestrom. Ausschließlich
 * erfundene Werte. `testOldElectricity` ist ein Antrag vor ORG-008 (Tage).
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
    working_days: null,
    energy_wh_per_day: null,
    working_minutes: 9_600,
    km_per_hour: 6,
    wh_per_km: 18,
    tour_km: null,
    rate_cents_per_kwh: 37,
    // 160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh = 17,28 kWh × 37 ct = 639,36 ct.
    amount_cents: 639,
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
    working_minutes: null,
    km_per_hour: null,
    wh_per_km: null,
    tour_km: null,
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

/** Ein Ladestrom vor ORG-008: Tage × Ladung × Satz, wie er am Antrag steht. */
export function testOldElectricity(change: Partial<Reimbursement> = {}): Reimbursement {
  return testReimbursement({
    id: 'erstattung-alt',
    period_month: '2026-08-01',
    working_days: 18,
    energy_wh_per_day: 500,
    working_minutes: null,
    km_per_hour: null,
    wh_per_km: null,
    tour_km: null,
    amount_cents: 333,
    ...change,
  });
}
