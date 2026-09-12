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
        // `scope: 'local'` ausdrücklich, nicht als Weglassung (ANN-044).
        // supabase-js hat den Default `{ scope: 'global' }` - ohne diese
        // Angabe beendete der gewöhnliche Abmelden-Knopf die Sitzungen auf
        // allen Geräten. Damit wäre der Satz „Angemeldete Geräte bleiben
        // angemeldet" auf „Mein Konto" falsch und „Alle Sitzungen beenden"
        // ohne eigenen Zweck. Wer am Praxisrechner Feierabend macht, meldet
        // nicht sein Diensttelefon mit ab.
        await getSupabase().auth.signOut({ scope: 'local' });
        // Verordnungsentwürfe sind an die abmeldende Person gebunden (VER-003,
        // ANN-019) und sollen keine spätere Anmeldung in diesem Tab betreffen.
        alleEntwuerfeVerwerfen();
      },
    }),
    [session, initialising],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
