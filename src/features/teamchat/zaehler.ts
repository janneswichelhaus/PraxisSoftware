import { useQuery } from '@tanstack/react-query';
import { isStaff, type CurrentUser } from '@/features/core/session/types';
import { ZAEHLER_KEY, ZAEHLER_MS, fetchZaehler } from './api';

/**
 * Die Zahl am Bereich „Nachrichten“ (TEAM-002, ANN-647): neue Direkt- und
 * Gruppennachrichten, Erwähnungen und fällige Erinnerungen - Benachrichtigung
 * in der App, kein Push (ADR-024 Punkt 12). Sieht alle 30 Sekunden nach,
 * nur für Konten mit Teamchat; ohne Netz bleibt die letzte Zahl stehen.
 */
export function useTeamchatZaehler(user: CurrentUser): number {
  const zaehler = useQuery({
    queryKey: ZAEHLER_KEY,
    queryFn: fetchZaehler,
    refetchInterval: ZAEHLER_MS,
    enabled: isStaff(user.roles),
    retry: false,
  });
  return zaehler.data?.badge ?? 0;
}
