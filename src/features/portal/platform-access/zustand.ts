import { useQuery } from '@tanstack/react-query';
import type { Ton } from '@/components/ui/Badge';
import {
  getPlatformAccess,
  zugangsschluessel,
  type Plattformzugang,
  type Verhaeltnisart,
} from './api';

export const ZUSTAND: Record<string, { text: string; ton: Ton }> = {
  none: { text: 'Kein Zugang', ton: 'neutral' },
  invited: { text: 'Eingeladen', ton: 'akzent' },
  expired: { text: 'Einladung abgelaufen', ton: 'warnung' },
  active: { text: 'Aktiv', ton: 'positiv' },
  locked: { text: 'Gesperrt', ton: 'warnung' },
  revoked: { text: 'Entzogen', ton: 'neutral' },
};

/** Welcher Zustand angezeigt wird. Ein eingeladener Zugang ohne gültige Einladung ist abgelaufen. */
export function anzeigezustand(zugang: Plattformzugang | null): keyof typeof ZUSTAND {
  if (!zugang || zugang.id === null || zugang.status === null) return 'none';
  if (zugang.status === 'invited' && zugang.invitation_id === null) return 'expired';
  return zugang.status;
}

/**
 * Lässt sich der Zugang sperren oder entziehen? Aktiv, gesperrt oder mit
 * gültiger Einladung - dieselben Zustände, in denen der Abschnitt „Plattform“
 * „Entziehen“ anbietet.
 */
export function zugangBeendbar(zugang: Plattformzugang | null | undefined): boolean {
  const zustand = anzeigezustand(zugang ?? null);
  return zustand === 'active' || zustand === 'locked' || zustand === 'invited';
}

/**
 * Der Zugang eines Verhältnisses mit demselben Abfrageschlüssel wie der
 * Abschnitt „Plattform“ - eine Anfrage für beide. Für Seiten, die wissen
 * müssen, ob es am Ende etwas zu beenden gibt (`PlattformzugangBeenden`).
 */
export function usePlattformzugang(
  art: Verhaeltnisart,
  verhaeltnisId: string,
  aktiviert = true,
): Plattformzugang | null | undefined {
  const { data } = useQuery({
    queryKey: zugangsschluessel(art, verhaeltnisId),
    queryFn: () => getPlatformAccess(art, verhaeltnisId),
    enabled: aktiviert,
  });
  return data;
}
