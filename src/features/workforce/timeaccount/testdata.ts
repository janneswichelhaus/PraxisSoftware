import type { Entry, EntryPreview, TimeAccount } from './api';

/**
 * Synthetisches Zeitkonto für die Tests (ZK-001): Annas Konto, ihr Tag wie im
 * Seed Montag bis Freitag 08:00-12:00 und 13:00-18:00.
 */
export const ANNA = '55555555-5555-4555-8555-000000000002';
export const TIM = '55555555-5555-4555-8555-000000000004';

export const ANNAS_TAG = [
  { von: '08:00', bis: '12:00' },
  { von: '13:00', bis: '18:00' },
];

export function testEntry(change: Partial<Entry> = {}): Entry {
  return {
    id: 'eintrag-1',
    kind: 'overtime',
    on_date: '2026-10-15',
    starts_at: '18:00',
    ends_at: '18:45',
    minutes: 45,
    note: null,
    status: 'valid',
    entered_at: '2026-10-15T16:50:00Z',
    entered_by_name: null,
    rejected_at: null,
    rejected_by_name: null,
    rejection_note: null,
    withdrawn_at: null,
    can_withdraw: true,
    can_reject: false,
    ...change,
  };
}

export function testTimeAccount(change: Partial<TimeAccount> = {}): TimeAccount {
  return {
    my_staff_member_id: ANNA,
    can_book_others: false,
    can_reject: false,
    account: { staff_member_id: ANNA, name: 'Anna Beispiel', balance_minutes: 90, entries: [] },
    accounts: [],
    ...change,
  };
}

export function testPreview(change: Partial<EntryPreview> = {}): EntryPreview {
  return {
    day: { kind: 'plan', blocks: ANNAS_TAG },
    minutes: null,
    problems: [],
    remaining: [],
    appointments: 0,
    balance_minutes: 90,
    balance_after: null,
    ...change,
  };
}
