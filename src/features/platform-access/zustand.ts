import type { Ton } from '@/components/ui/Badge';
import type { Plattformzugang } from './api';

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
