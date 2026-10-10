import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface SessionState {
  session: Session | null;
  initialising: boolean;
  /**
   * Die letzte Sitzung endete von außen, nicht durch „Abmelden" auf dieser
   * Seite (BEF-047). Optional, damit Vorschauen und Tests ohne Angabe
   * auskommen; fehlt sie, gilt `false`.
   */
  endeVonAussen?: boolean;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | undefined>(undefined);

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession muss innerhalb von SessionProvider verwendet werden.');
  return context;
}
