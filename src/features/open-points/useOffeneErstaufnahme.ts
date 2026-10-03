import { useQuery } from '@tanstack/react-query';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';
import { fetchIntakeChecklist, type IntakeItem } from './intake-api';

/**
 * Was zur Erstaufnahme einer Person noch fehlt (PRX-013) - nur für die Rollen
 * der Kartei und nur, solange sie in Versorgung ist.
 *
 * Im Kopf der Akte trägt es seit AKTE-007 nur noch die Zeile „Anmeldebogen
 * fehlt" (ANN-224); die Tagesliste und „Offene Punkte" nennen alle offenen
 * Punkte. Die Abfrage ist dieselbe, unter demselben Schlüssel.
 */
export function useOffeneErstaufnahme(
  patientId: string,
  aktiv: boolean,
  user: CurrentUser,
): IntakeItem[] {
  const darf = canReadPatientDirectory(user.roles) && aktiv;
  const { data } = useQuery({
    queryKey: ['open-points', 'intake', patientId],
    queryFn: () => fetchIntakeChecklist(patientId),
    enabled: darf,
    retry: false,
  });
  if (!darf) return [];
  return (data ?? []).filter((punkt) => punkt.state === 'open').map((punkt) => punkt.item);
}
