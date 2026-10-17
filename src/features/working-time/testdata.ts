import type { OpenRequest, OwnRequest, WorkingTime } from './api';
import type { Block, Week } from './rules';

/**
 * Synthetische Arbeitszeit für die Tests (AZ-001): Annas Wochenplan wie im
 * Seed, Montag bis Freitag 08:00-12:00 und 13:00-18:00.
 */
export const ANNAS_TAG: Block[] = [
  { von: '08:00', bis: '12:00' },
  { von: '13:00', bis: '18:00' },
];

export function testWeek(days: Partial<Record<number, Block[]>> = {}): Week {
  const week: Week = {};
  for (let day = 1; day <= 7; day += 1)
    week[String(day)] = days[day] ?? (day <= 5 ? ANNAS_TAG : []);
  return week;
}

export function testWorkingTime(change: Partial<WorkingTime> = {}): WorkingTime {
  return {
    my_staff_member_id: '55555555-5555-4555-8555-000000000002',
    can_decide: false,
    self_entered: false,
    today: '2026-10-16',
    plan: { has_plan: true, current: testWeek(), next_from: null, next: null },
    own: [],
    to_decide: [],
    ...change,
  };
}

export function testOwnRequest(change: Partial<OwnRequest> = {}): OwnRequest {
  return {
    id: 'antrag-1',
    kind: 'once',
    on_date: '2026-10-20',
    blocks: [
      { von: '07:00', bis: '12:00' },
      { von: '13:00', bis: '17:00' },
    ],
    previous_blocks: ANNAS_TAG,
    previous_minutes: 540,
    new_minutes: 540,
    message: null,
    status: 'requested',
    requested_at: '2026-10-16T08:00:00Z',
    decided_at: null,
    decided_by_name: null,
    decision_note: null,
    self_entered: false,
    ...change,
  } as OwnRequest;
}

export function testOpenRequest(change: Partial<OpenRequest> = {}): OpenRequest {
  return {
    id: 'antrag-1',
    kind: 'permanent',
    on_date: '2026-12-01',
    staff_member_id: '55555555-5555-4555-8555-000000000002',
    name: 'Anna Beispiel',
    blocks: testWeek({
      2: [
        { von: '08:00', bis: '12:30' },
        { von: '13:30', bis: '18:00' },
      ],
    }),
    previous_blocks: testWeek(),
    previous_minutes: 45 * 60,
    new_minutes: 45 * 60,
    message: 'Dienstags hole ich die Kinder später ab.',
    requested_at: '2026-10-16T08:00:00Z',
    appointment_days: [{ on_date: '2026-12-01', appointments: 2 }],
    ...change,
  } as OpenRequest;
}
