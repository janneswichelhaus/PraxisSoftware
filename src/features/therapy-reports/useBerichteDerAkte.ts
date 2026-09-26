import { useQuery } from '@tanstack/react-query';
import { canReadTreatmentNote, type CurrentUser } from '@/features/session/types';
import { berichteQueryKey, fetchBerichteDerAkte } from './api';

/**
 * Die Therapieberichte einer Akte - einmal geladen, an jeder Verordnung
 * gefiltert. Wer klinische Inhalte nicht lesen darf, fragt gar nicht erst.
 */
export function useBerichteDerAkte(patientId: string, user: CurrentUser) {
  return useQuery({
    queryKey: berichteQueryKey(patientId),
    queryFn: () => fetchBerichteDerAkte(patientId),
    enabled: canReadTreatmentNote(user.roles),
  });
}
