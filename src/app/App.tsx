import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { useSession } from '@/features/auth/sessionContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { KeinProfilError, useCurrentUser } from '@/features/session/useCurrentUser';
import { ZugangEinrichtenPage } from '@/features/staff/ZugangEinrichtenPage';
import { AuthenticatedRoutes } from '@/routes/AuthenticatedRoutes';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';

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
   * Abmelden räumt den Abfragespeicher mit ab (UX-011).
   *
   * Die Tagesliste hält Anschrift, Rufnummer und Zugangshinweis im
   * Arbeitsspeicher der laufenden Seite - lange genug, dass ein Funkloch sie
   * nicht vom Bildschirm nimmt (ANN-021). Nach einer Abmeldung hat dort
   * nichts davon mehr etwas zu suchen, auch nicht bis zum Ablauf einer Frist:
   * das nächste Konto in demselben Tab darf sie nicht vorfinden.
   */
  async function abmelden() {
    await signOut();
    queryClient.clear();
  }

  if (isPending) return <LoadingState label="Profil wird geladen …" />;

  /**
   * Angemeldet, aber keiner Praxis zugeordnet - der Normalfall direkt nach der
   * Anmeldung über eine Einladungsmail (STAFF-002b). Die Seite bietet an, die
   * Einladung anzunehmen; ohne Einladung bleibt das Konto zugriffslos
   * (ANN-023).
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

  // PROJECT_PRINCIPLES.md 13: Bei unklarem Zustand nichts anzeigen, sondern
  // verständlich abbrechen. Ohne Profil ist keine Organisationszuordnung und
  // damit keine Berechtigungsentscheidung möglich.
  if (isError || !user) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
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
