import type { EigenerPlan } from './api';

/**
 * Synthetische Pläne für die Komponententests der Plattform (UEB-009,
 * UEB-010). Nur von Tests importiert; kein Datenzugriff.
 */
export function eigenerPlan(teil: Partial<EigenerPlan> = {}): EigenerPlan {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    service_area: 'therapy',
    title: 'Heimprogramm Knie',
    status: 'assigned',
    sessions_per_week: 3,
    assigned_on: '2026-10-07',
    runs_from: '2026-10-07',
    runs_until: '2026-11-18',
    ended_on: null,
    can_exercise: true,
    note_allowed: true,
    open_session: null,
    recent_sessions: [],
    items: [
      {
        id: 'bbbbbbbb-0000-4000-8000-000000000001',
        position: 1,
        variant_lay_name: 'Am Geländer in die Hocke',
        instruction: 'Festhalten.',
        equipment: ['Geländer'],
        sets: 3,
        reps_min: 10,
        reps_max: 12,
        duration_seconds: null,
        load: null,
        tempo: null,
        rest_seconds: 30,
        double_progression: false,
        note: 'Langsam ablassen.',
      },
    ],
    ...teil,
  };
}
