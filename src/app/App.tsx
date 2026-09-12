import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { useSession } from '@/features/auth/sessionContext';
import { LoginPage } from '@/features/auth/LoginPage';
import {
  KeinProfilError,
  ZugangGesperrtError,
  useCurrentUser,
} from '@/features/session/useCurrentUser';
import { ZugangEinrichtenPage } from '@/features/staff/ZugangEinrichtenPage';
import { AuthenticatedRoutes } from '@/routes/AuthenticatedRoutes';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Wortmarke } from '@/components/ui/Wortmarke';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function AuthenticatedApp() {
  const { session, signOut } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const { data: user, isPending, isError, error } = useCurrentUser(userId);

  /**
   * Abmelden räumt den Abfragespeicher mit ab (UX-011, ANN-021) — aber nicht
   * mehr hier.
   *
   * Die Tagesliste hält Anschrift, Rufnummer und Zugangshinweis im
   * Arbeitsspeicher der laufenden Seite, lange genug, dass ein Funkloch sie
   * nicht vom Bildschirm nimmt. Nach einer Abmeldung hat dort nichts davon
   * mehr etwas zu suchen: das nächste Konto in demselben Tab darf sie nicht
   * vorfinden.
   *
   * Diese Stelle sah davon nur einen einzigen Weg — den Knopf in der
   * Kopfzeile. „Alle Sitzungen beenden", die Abmeldung im zweiten Tab und die
   * abgelaufene Sitzung liefen daran vorbei. Die Räumung steht deshalb jetzt
   * im `SessionProvider`, wo jeder Wechsel der Identität ankommt.
   */
  async function abmelden() {
    await signOut();
  }

  if (isPending) return <LoadingState label="Profil wird geladen …" />;

  /**
   * Angemeldet, aber keiner Praxis zugeordnet - der Normalfall direkt nach der
   * Anmeldung über eine Einladungsmail (STAFF-002b). Die Seite bietet an, die
   * Einladung anzunehmen; ohne Einladung bleibt das Konto zugriffslos
   * (ANN-025).
   */
  if (error instanceof KeinProfilError) {
    return (
      <ZugangEinrichtenPage
        onEingerichtet={() => {
          void queryClient.invalidateQueries({ queryKey: ['current-user'] });
        }}
        onAbmelden={() => void abmelden()}
      />
    );
  }

  /**
   * Gesperrt (STAFF-003). Ohne diesen Zweig sähe die Person eine vollständige,
   * aber überall leere Anwendung - genau der unklare Zustand aus §13. Der Text
   * sagt, was los ist und an wen sie sich wendet, mehr nicht.
   */
  if (error instanceof ZugangGesperrtError) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        {/* Dieselbe Begruendung wie beim Fehlerkasten unten: eine Vollseite
            ausserhalb des Anwendungsrahmens traegt die Marke (MARKE-001). */}
        <Wortmarke hoehe={40} className="mb-6" />
        <ErrorState
          title="Dieser Zugang ist gesperrt."
          description="Bitte wenden Sie sich an die Praxisleitung. Ihre bisherige Arbeit bleibt unverändert erhalten."
        />
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void abmelden()}>
          Abmelden
        </Button>
      </main>
    );
  }

  // PROJECT_PRINCIPLES.md 13: Bei unklarem Zustand nichts anzeigen, sondern
  // verständlich abbrechen. Ohne Profil ist keine Organisationszuordnung und
  // damit keine Berechtigungsentscheidung möglich.
  if (isError || !user) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        {/* Die einzige Vollseite außerhalb des Anwendungsrahmens neben der
            Anmeldemaske - und die einzige, die jemand nach erfolgreicher
            Anmeldung zu sehen bekommt. Ohne die Marke stünde hier ein nackter
            Fehlerkasten ohne Absender; 40 px und der Abstand darunter folgen
            der Anmeldemaske (MARKE-001, marke/README.md). */}
        <Wortmarke hoehe={40} className="mb-6" />
        <ErrorState
          title="Zugang nicht vollständig eingerichtet"
          description={error?.message ?? 'Bitte wenden Sie sich an die Praxisleitung.'}
        />
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void abmelden()}>
          Abmelden
        </Button>
      </main>
    );
  }

  return <AuthenticatedRoutes user={user} onSignOut={() => void abmelden()} />;
}

function Gate() {
  const { session, initialising } = useSession();
  if (initialising) return <LoadingState label="Sitzung wird geprüft …" />;
  if (!session) return <LoginPage />;
  return <AuthenticatedApp />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
