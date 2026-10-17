import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KANAELE_KEY, markiereGelesen, type Kanal } from './api';

/**
 * Als gelesen markieren, sobald Ungelesenes zu sehen ist - nur der eigene
 * Stand, niemand sonst erfährt davon (ANN-609).
 */
export function useGelesen(kanal: Kanal, geladen: unknown) {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: () => markiereGelesen(kanal.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KANAELE_KEY }),
  });
  useEffect(() => {
    if (geladen && kanal.unread > 0) mutate();
  }, [geladen, kanal.unread, mutate]);
}

/** Warum nichts mehr geschrieben werden kann - oder `null`. */
export function gesperrtSatz(kanal: Kanal): string | null {
  if (kanal.archived) return 'Archiviert – nur noch lesbar.';
  if (kanal.kind === 'direct' && kanal.partner_active === false) {
    return `${kanal.partner_name ?? 'Diese Person'} ist nicht mehr im Team.`;
  }
  return null;
}
