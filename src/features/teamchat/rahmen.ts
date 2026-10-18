import { useOutletContext } from 'react-router-dom';
import type { CurrentUser } from '@/features/session/types';
import type { Spalten } from './flaeche';

/** Was der Rahmen des Teamchats seinen Seiten mitgibt (`TeamchatRahmen`). */
export interface TeamchatKontext {
  user: CurrentUser;
  spalten: Spalten;
}

/** Für die Seiten im Rahmen: Konto und Spaltenzahl. */
export function useTeamchat(): TeamchatKontext {
  return useOutletContext<TeamchatKontext>();
}
