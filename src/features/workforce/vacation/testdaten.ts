import type {
  FremdesKonto,
  OffenerAntrag,
  Urlaubskonto,
  Urlaubsstand,
  Urlaubsvorschau,
} from './api';

/**
 * Synthetische Antworten der Urlaubsfunktionen für Komponententests
 * (URL-001). Namen und Kennungen wie im Seed; nichts davon ist echt.
 */

export const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

export function testKonto(overrides: Partial<Urlaubskonto> = {}): Urlaubskonto {
  return {
    year: 2026,
    entitlement: 30,
    carryover: 0,
    approved: 18,
    requested: 0,
    rest: 12,
    ...overrides,
  };
}

/** Ein fremdes Konto für owner: laufendes Jahr und Folgejahr (noch ohne Anspruch). */
export function testFremdesKonto(overrides: Partial<FremdesKonto> = {}): FremdesKonto {
  return {
    staff_member_id: STAFF.anna,
    name: 'Anna Beispiel',
    balance: testKonto(),
    next_balance: testKonto({
      year: 2027,
      entitlement: null,
      carryover: null,
      approved: 0,
      requested: 0,
      rest: null,
    }),
    ...overrides,
  };
}

export function testOffenerAntrag(overrides: Partial<OffenerAntrag> = {}): OffenerAntrag {
  return {
    id: 'abababab-abab-4bab-8bab-000000000001',
    kind: 'leave',
    refers_to: null,
    staff_member_id: STAFF.anna,
    name: 'Anna Beispiel',
    starts_on: '2026-11-02',
    ends_on: '2026-11-13',
    days: 10,
    days_following_year: 0,
    requested_at: '2026-10-12T08:00:00Z',
    balance: testKonto({ requested: 10 }),
    team: [],
    appointments: 3,
    exception_days: [],
    ...overrides,
  };
}

export function testUrlaub(overrides: Partial<Urlaubsstand> = {}): Urlaubsstand {
  return {
    my_staff_member_id: STAFF.anna,
    can_decide: false,
    self_entered: false,
    can_manage_entitlements: false,
    federal_state: 'BW',
    balance: testKonto(),
    own: [],
    to_decide: [],
    team: [],
    balances: [],
    ...overrides,
  };
}

export function testVorschau(overrides: Partial<Urlaubsvorschau> = {}): Urlaubsvorschau {
  return {
    days: 9,
    days_following_year: 0,
    balance: testKonto(),
    overlaps_own: false,
    team: [
      {
        staff_member_id: STAFF.tim,
        name: 'Tim Teamleitung',
        starts_on: '2026-11-05',
        ends_on: '2026-11-06',
      },
    ],
    self_entered: false,
    appointment_days: [],
    exception_days: [],
    ...overrides,
  };
}
