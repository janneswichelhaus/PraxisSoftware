import type { Leistungsumsatz, Personenumsatz, Umsatzmonat } from './api';
import { letzteMonate } from './diagramme';
import type { Kennzahlen } from './kennzahlen';

/** Synthetische Kennzahlen fuer Komponententests (STA-003). */
export function beispielKennzahlen(rest: Partial<Kennzahlen> = {}): Kennzahlen {
  return {
    time_zone: 'Europe/Berlin',
    today: '2026-09-29',
    month: '2026-09-01',
    previous_month: '2026-08-01',
    revenue_cents: 1_234_500,
    revenue_therapy_cents: 1_134_500,
    revenue_training_cents: 100_000,
    revenue_previous_cents: 1_100_000,
    payments_cents: 980_000,
    payments_previous_cents: 1_050_000,
    open_count: 3,
    open_cents: 22_500,
    open_not_due_count: 1,
    open_not_due_cents: 4_500,
    open_overdue_1_30_count: 1,
    open_overdue_1_30_cents: 9_000,
    open_overdue_31_60_count: 0,
    open_overdue_31_60_cents: 0,
    open_overdue_over_60_count: 1,
    open_overdue_over_60_cents: 9_000,
    utilization_from: '2026-09-29',
    utilization_to: '2026-10-12',
    available_minutes: 6_000,
    booked_minutes: 4_500,
    ending_bases: 2,
    uncovered_appointments: 3,
    absences_from: '2026-09-02',
    absences_to: '2026-09-29',
    patient_cancellations: 3,
    no_shows: 1,
    absences_with_fee: 2,
    absence_fee_cents: 9_000,
    absences_previous: 2,
    absence_fee_previous_cents: 4_500,
    ...rest,
  };
}

/** Zwölf synthetische Monate bis September 2026 (STA-007). */
export function beispielMonate(): Umsatzmonat[] {
  const umsatz = [
    980_000, 1_120_000, 1_040_000, 870_000, 1_210_000, 1_160_000, 1_300_000, 1_250_000, 1_180_000,
    1_020_000, 1_100_000, 1_234_500,
  ];
  return letzteMonate('2026-09-29', 12).map((month, i) => ({
    month,
    revenue_cents: umsatz[i]!,
    revenue_therapy_cents: umsatz[i]! - 100_000,
    revenue_training_cents: 100_000,
    payments_cents: Math.round(umsatz[i]! * (i % 3 === 0 ? 0.85 : 0.97)),
  }));
}

export function beispielLeistungen(): Leistungsumsatz[] {
  return [
    { code: 'MT', label: 'Manuelle Therapie', revenue_cents: 462_000 },
    { code: 'KG', label: 'Krankengymnastik', revenue_cents: 405_000 },
    { code: 'MLD', label: 'Manuelle Lymphdrainage', revenue_cents: 198_000 },
    { code: 'PT', label: 'Personal Training', revenue_cents: 100_000 },
    { code: 'HB', label: 'Hausbesuch', revenue_cents: 69_500 },
  ];
}

/** Drei synthetische Personen aus dem Seed, sechs Monate. */
export function beispielJePerson(): Personenumsatz[] {
  const personen = [
    ['55555555-5555-4555-8555-000000000002', 'Anna Beispiel', 520_000],
    ['55555555-5555-4555-8555-000000000001', 'Jannes Test', 410_000],
    ['55555555-5555-4555-8555-000000000004', 'Tim Teamleitung', 300_000],
  ] as const;
  return letzteMonate('2026-09-29', 6).flatMap((month, i) =>
    personen.map(([id, name, basis]) => ({
      month,
      staff_member_id: id,
      staff_name: name,
      revenue_cents: basis + ((i * 37_000) % 90_000),
    })),
  );
}
