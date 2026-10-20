import { useQuery } from '@tanstack/react-query';
import {
  AVATARE_KEY,
  ZAEHLER_MS,
  fetchAvatare,
  ladeProfilbild,
  profilbildKey,
  type Avatar,
} from './api';

/**
 * Farbe und Bildkennung je Person der Praxis - einmal geladen, für jedes Bild.
 *
 * BEF-191: Die Liste galt fünf Minuten als frisch und wurde bei
 * offenem Chat nie nachgeladen (kein Neuladen beim Fensterwechsel). Wer sein
 * Bild änderte, stand bei den anderen weiter mit dem alten oder den Initialen
 * da - auch an Nachrichten, die schon dastanden. Jetzt lädt die Liste im Takt
 * der Zähler nach; jedes Bild an jeder Nachricht folgt ihr.
 */
export function useAvatare() {
  return useQuery({
    queryKey: AVATARE_KEY,
    queryFn: fetchAvatare,
    staleTime: ZAEHLER_MS,
    refetchInterval: ZAEHLER_MS,
  });
}

/** Die eigene Zeile, wie der Server sie markiert. */
export function eigenerAvatar(avatare: readonly Avatar[] | undefined): Avatar | undefined {
  return avatare?.find((a) => a.own);
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
