import { FreigabeVorschlag } from '@/features/patients/treatment-bases/Freigabe';
import { useAbrechnungslage } from './useAbrechnungslage';

/**
 * Nach dem Haken in der Übersicht (B7, BEF-157): Ist die Grundlage mit diesem
 * Haken vollständig erbracht und dokumentiert, steht der Vorschlag „In die
 * Abrechnung stellen“ gleich unter der Meldung. Sonst nichts.
 *
 * Der Stand kommt aus derselben Abfrage wie die Kachel am Termin; der Haken
 * lädt sie neu (`['appointment', id]`).
 */
export function FreigabeNachHaken({
  appointmentId,
  patientId,
}: {
  appointmentId: string;
  patientId: string | null;
}) {
  const { data } = useAbrechnungslage(appointmentId);
  if (!data?.treatment_basis_id || !data.can_release || !data.basis_complete) return null;
  return (
    <FreigabeVorschlag treatmentBasisId={data.treatment_basis_id} patientId={patientId} mitStand />
  );
}
