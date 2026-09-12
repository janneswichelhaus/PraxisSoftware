import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { alleEntwuerfeVerwerfen } from '@/features/prescriptions/api';
import { SessionContext, type SessionState } from './sessionContext';

/**
 * Sitzungszustand und die Grenze zwischen zwei Konten (UX-011, ANN-021).
 *
 * Die Anwendung hält Patientendaten im Arbeitsspeicher der Seite — die
 * Tagesliste absichtlich lange, damit ein Funkloch sie nicht vom Bildschirm
 * nimmt. Damit gehört hierher die Frage, wann davon nichts mehr stehen bleiben
 * darf: **beim Wechsel der Identität.**
 *
 * Bisher wurde nur ein einziger Weg abgeräumt — der Abmelden-Knopf in
 * `app/App.tsx`. Alles andere ging daran vorbei: „Alle Sitzungen beenden" ruft
 * den Anmeldedienst unmittelbar, eine Abmeldung im zweiten Tab meldet sich nur
 * als Ereignis, und eine abgelaufene Sitzung meldet sich überhaupt nicht bei
 * der Oberfläche. In all diesen Fällen blieb die Patientenliste des vorigen
 * Kontos im Speicher und wäre der nächsten Anmeldung in diesem Tab sofort
 * angezeigt worden, während im Hintergrund nachgeladen wird (`gcTime` ist
 * fünf Minuten).
 *
 * Deshalb steht die Räumung jetzt an **einer** Stelle, und zwar an der, die
 * jeden Weg sieht: dem Ereignisstrom des Anmeldedienstes.
 *
 * **Verglichen wird die Kennung, nicht die Ereignisart.** Der Strom führt
 * neben `SIGNED_IN` und `SIGNED_OUT` auch `TOKEN_REFRESHED` — das trifft bei
 * `jwt_expiry = 3600` stündlich ein. Ein pauschales Leeren je Ereignis würde
 * die Tagesliste achtmal am Tag wegräumen und damit genau die acht Stunden
 * zerstören, die ANN-021 zusichert. Ein Vergleich der Benutzerkennung
 * unterscheidet zuverlässig: Verlängerung heißt gleiche Kennung, Wechsel heißt
 * andere.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);
  const queryClient = useQueryClient();

  /**
   * Die zuletzt gesehene Kennung. `undefined` heißt „noch keine gesehen" und
   * ist von `null` („niemand angemeldet") zu unterscheiden: Der erste Blick
   * auf eine leere Sitzung ist kein Wechsel und darf nichts abräumen.
   */
  const letzteKennung = useRef<string | null | undefined>(undefined);

  /**
   * Alles wegräumen, was zur vorigen Person gehört.
   *
   * **Nicht** `invalidateQueries`: Das markiert nur als veraltet und zeigt die
   * alten Daten weiter an, während nachgeladen wird — bei einem Kontowechsel
   * wäre genau das die Anzeige, die hier verhindert werden soll. Der
   * Unterschied ist die Sache selbst.
   *
   * `clear()` und nicht `removeQueries()`: Beide werfen die Daten weg und
   * beide lassen eine verspätet eintreffende Antwort nicht mehr in den
   * Speicher (nachgeprüft). `clear()` ist gewählt, weil es keinen Filter
   * braucht — ein Filter wäre eine Liste, die beim nächsten neuen Query-Key
   * unvollständig würde, und diese Stelle soll nichts übrig lassen.
   */
  const raeumen = useCallback(() => {
    queryClient.clear();
    // Verordnungsentwürfe sind an die Person gebunden, die sie begonnen hat
    // (VER-003, ANN-019), und liegen außerhalb des Abfragespeichers.
    alleEntwuerfeVerwerfen();
  }, [queryClient]);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    function uebernehmen(naechste: Session | null) {
      const kennung = naechste?.user.id ?? null;
      const wechsel = letzteKennung.current !== undefined && letzteKennung.current !== kennung;
      letzteKennung.current = kennung;

      if (wechsel) raeumen();

      setSession(naechste);
      setInitialising(false);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      uebernehmen(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      uebernehmen(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [raeumen]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      initialising,
      /**
       * Abmelden verlässt sich auf den Ereignisweg — aber nicht blind.
       *
       * Im Regelfall meldet `signOut` `SIGNED_OUT`, bevor es auflöst; die
       * Räumung oben greift dann auf demselben Weg wie bei jeder anderen
       * Abmeldung, und eine zweite Räumung hier wäre eine zweite Stelle für
       * dieselbe Regel. `supabase-js` kehrt allerdings **vor** dem Entfernen
       * der Sitzung um, wenn schon das Lesen der laufenden Sitzung scheitert
       * (Speicher, Sperre) — dann kommt kein Ereignis, und im Arbeitsspeicher
       * bliebe die Patientenliste stehen, obwohl jemand abgemeldet hat. Für
       * diesen einen Pfad wird hier nachgeräumt.
       */
      signOut: async () => {
        // `scope: 'local'` ausdrücklich, nicht als Weglassung (ANN-045).
        // supabase-js hat den Default `{ scope: 'global' }` - ohne diese
        // Angabe beendete der gewöhnliche Abmelden-Knopf die Sitzungen auf
        // allen Geräten. Damit wäre der Satz „Angemeldete Geräte bleiben
        // angemeldet" auf „Mein Konto" falsch und „Alle Sitzungen beenden"
        // ohne eigenen Zweck. Wer am Praxisrechner Feierabend macht, meldet
        // nicht sein Diensttelefon mit ab.
        const { error } = await getSupabase().auth.signOut({ scope: 'local' });
        if (error) {
          raeumen();
          // Ohne Kontoangabe (ADR-011), wie bei den Kontoereignissen.
          console.error('Die Abmeldung beim Anmeldedienst ist fehlgeschlagen.');
        }
      },
    }),
    [session, initialising, raeumen],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
