import { appointmentTypeLabels } from '@/features/appointments/api';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import { formatDate } from '@/lib/datum';
import { windowsText, type WaitlistEntry } from './api';

/** „Folgeverordnung vom 18. Juni 2026" oder „ohne Grundlage". */
export function basisText(entry: WaitlistEntry): string {
  if (!entry.treatment_basis_kind || !entry.treatment_basis_issued_on) return 'ohne Grundlage';
  const { bauart, praeposition } = grundlageBezeichnung({
    treatment_basis_kind: entry.treatment_basis_kind,
  });
  return `${bauart} ${praeposition} ${formatDate(entry.treatment_basis_issued_on)}`;
}

/** Eine Zeile mit Art, Dauer, Wunschzeiten und Therapeut:in. */
export function wishText(entry: WaitlistEntry): string {
  return [
    appointmentTypeLabels[entry.appointment_type],
    `${entry.duration_minutes} Min.`,
    windowsText(entry.time_windows),
    entry.preferred_staff_name ? `bei ${entry.preferred_staff_name}` : 'Therapeut:in egal',
  ].join(' · ');
}
