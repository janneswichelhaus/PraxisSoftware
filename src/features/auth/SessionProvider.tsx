import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { alleEntwuerfeVerwerfen } from '@/features/prescriptions/api';
import { SessionContext, type SessionState } from './sessionContext';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitialising(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitialising(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      session,
      initialising,
      signOut: async () => {
        await getSupabase().auth.signOut();
        // Verordnungsentwürfe sind an die abmeldende Person gebunden (VER-003,
        // ANN-019) und sollen keine spätere Anmeldung in diesem Tab betreffen.
        alleEntwuerfeVerwerfen();
      },
    }),
    [session, initialising],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
