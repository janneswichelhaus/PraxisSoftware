import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { useSession } from '@/features/auth/sessionContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { useCurrentUser } from '@/features/session/useCurrentUser';
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
  const userId = session?.user.id;
  const { data: user, isPending, isError, error } = useCurrentUser(userId);

  if (isPending) return <LoadingState label="Profil wird geladen …" />;

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
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
          Abmelden
        </Button>
      </main>
    );
  }

  return <AuthenticatedRoutes user={user} onSignOut={() => void signOut()} />;
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
