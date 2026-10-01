import { useQuery } from '@tanstack/react-query';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';
import { fetchIntakeChecklist, type IntakeItem } from './intake-api';

/**
 * Was zur Erstaufnahme einer Person noch fehlt (PRX-013) - nur für die Rollen
 * der Kartei und nur, solange sie in Versorgung ist.
 *
 * Bis zum Design-Handoff vom 2026-10-01 stand das als Zeile `IntakeHint` im
 * Kopf der Akte; jetzt trägt es eine Kachel (Abschnitt 7). Die Abfrage ist
 * dieselbe, unter demselben Schlüssel.
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
