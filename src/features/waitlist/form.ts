import type { AppointmentType } from '@/features/appointments/api';
import {
  DURATION_MAX,
  DURATION_MIN,
  NOTE_MAX,
  windowsError,
  type EntryValues,
  type Reason,
  type TimeWindow,
  type WaitlistEntry,
} from './api';

/** Die Formularwerte als Zeichenketten, wie die Felder sie halten. */
export interface FormState {
  treatmentBasisId: string;
  staffMemberId: string;
  type: AppointmentType;
  duration: string;
  windows: TimeWindow[];
  earliestOn: string;
  neededBy: string;
  reason: Reason;
  note: string;
}

export type FieldName = 'duration' | 'windows' | 'dates' | 'note';

export const EMPTY: FormState = {
  treatmentBasisId: '',
  staffMemberId: '',
  type: 'home_visit',
  duration: '60',
  windows: [],
  earliestOn: '',
  neededBy: '',
  reason: 'patient_wish',
  note: '',
};

export function fromEntry(entry: WaitlistEntry): FormState {
  return {
    treatmentBasisId: entry.treatment_basis_id ?? '',
    staffMemberId: entry.preferred_staff_member_id ?? '',
    type: entry.appointment_type,
    duration: String(entry.duration_minutes),
    windows: entry.time_windows,
    earliestOn: entry.earliest_on ?? '',
    neededBy: entry.needed_by ?? '',
    reason: entry.priority_reason,
    note: entry.note ?? '',
  };
}

/** Prüft das Formular. Liefert die Werte für den Server oder die Fehler je Feld. */
export function validate(
  state: FormState,
): { values: EntryValues } | { errors: Partial<Record<FieldName, string>> } {
  const errors: Partial<Record<FieldName, string>> = {};
  const duration = Number(state.duration);
  if (!Number.isInteger(duration) || duration < DURATION_MIN || duration > DURATION_MAX) {
    errors.duration = `Die Dauer liegt zwischen ${DURATION_MIN} und ${DURATION_MAX} Minuten.`;
  }
  const windows = windowsError(state.windows);
  if (windows) errors.windows = windows;
  if (state.earliestOn && state.neededBy && state.neededBy < state.earliestOn) {
    errors.dates = '„Bis spätestens" liegt vor „Frühestens ab".';
  }
  if (state.note.trim().length > NOTE_MAX) {
    errors.note = `Höchstens ${NOTE_MAX} Zeichen.`;
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    values: {
      treatmentBasisId: state.treatmentBasisId || null,
      staffMemberId: state.staffMemberId || null,
      type: state.type,
      duration,
      windows: state.windows,
      earliestOn: state.earliestOn || null,
      neededBy: state.neededBy || null,
      reason: state.reason,
      note: state.note.trim() || null,
    },
  };
}
