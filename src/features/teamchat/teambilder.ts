import { useQuery } from '@tanstack/react-query';
import { AVATARE_KEY, fetchAvatare, ladeProfilbild, profilbildKey, type Avatar } from './api';

/** Farbe und Bild ändern sich selten; ohne sie stehen die Initialen auf Schiefer. */
const AVATARE_FRISCH_MS = 5 * 60_000;

/** Farbe und Bildkennung je Person der Praxis - einmal geladen, für jedes Bild. */
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

/**
 * Ein Profilbild als Objekt-URL (TEAM-007). Unveränderlich unter seiner
 * Kennung: einmal geladen, nie wieder gefragt. Ohne Kennung kein Abruf.
 */
export function useProfilbild(pictureId: string | null | undefined) {
  return useQuery({
    queryKey: profilbildKey(pictureId ?? ''),
    queryFn: () => ladeProfilbild(pictureId!),
    enabled: Boolean(pictureId),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
