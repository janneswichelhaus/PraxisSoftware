import { useQuery } from '@tanstack/react-query';
import { aboSchluessel, ladeAbo, type Plattformzugang } from './api';
import { inLesefrist } from './hauptsache';

/**
 * Ob der Zugang in der Lesefrist ist, sagt der Server (ANN-809). Nach dem Abo gefragt wird nur
 * für den Satz, wenn sie in der Behandlung gilt: Er nennt dann das Ende des Abos (ANN-274).
 */
export function useLesefrist(zugang: Plattformzugang) {
  const lesefrist = inLesefrist(zugang);
  const abo = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => ladeAbo(zugang.access_id),
    enabled: lesefrist && zugang.relationship_kind === 'treatment',
  });
  return { lesefrist, abo };
}
