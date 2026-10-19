import { useQuery } from '@tanstack/react-query';
import { AVATARE_KEY, fetchAvatare, type Avatar } from './api';

/** Die Farben ändern sich selten; ohne sie stehen die Initialen auf Schiefer. */
const AVATARE_FRISCH_MS = 5 * 60_000;

/** Farbe je Person der Praxis (TEAM-006) - einmal geladen, für jedes Bild. */
export function useAvatare() {
  return useQuery({ queryKey: AVATARE_KEY, queryFn: fetchAvatare, staleTime: AVATARE_FRISCH_MS });
}

export function avatarVon(
  avatare: readonly Avatar[] | undefined,
  staffMemberId: string | null | undefined,
): Avatar | undefined {
  if (!staffMemberId) return undefined;
  return avatare?.find((a) => a.staff_member_id === staffMemberId);
}
