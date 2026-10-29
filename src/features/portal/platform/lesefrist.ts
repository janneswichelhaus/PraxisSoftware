import { useQuery } from '@tanstack/react-query';
import { aboSchluessel, ladeAbo, type Plattformzugang } from './api';
import { inLesefrist } from './hauptsache';

/**
 * Ob der eigene Zugang in der Lesefrist ist. Sie beginnt erst nach einem Nachsorge-Abo (ANN-274),
 * wie auf der Übersicht; nach dem Abo gefragt wird nur, wenn sie überhaupt in Frage kommt.
 */
export function useLesefrist(zugang: Plattformzugang) {
  const abo = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => ladeAbo(zugang.access_id),
    enabled: inLesefrist(zugang) && zugang.relationship_kind === 'treatment',
  });
  const aboLaeuft = abo.data?.state === 'running' || abo.data?.state === 'ending';
  return { lesefrist: inLesefrist(zugang, aboLaeuft), abo };
}
