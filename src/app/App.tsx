import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, RouterProvider, Routes, createBrowserRouter, useLocation } from 'react-router-dom';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { useSession } from '@/features/auth/sessionContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { KennwortNeuPage } from '@/features/auth/KennwortNeuPage';
import { ZugangPage } from '@/features/auth/ZugangPage';
import {
  WIEDERHERSTELLUNG_PFAD,
  ZUGANG_PFAD,
  istEinloesePfad,
} from '@/features/auth/linkEinloesen';
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

/**
 * Die Seiten, die ohne Sitzung erreichbar sind.
 *
 * Der Auffangpfad ist die Anmeldemaske und nicht ein Fehler: Wer ohne Sitzung
 * irgendeine Adresse der Anwendung öffnet, soll sich anmelden können und nicht
 * erfahren, ob es diese Seite gibt. `tests/e2e/login.spec.ts` hält das fest.
 */
function OeffentlicheRouten() {
  return (
    <Routes>
      <Route path={WIEDERHERSTELLUNG_PFAD} element={<KennwortNeuPage />} />
      <Route path={ZUGANG_PFAD} element={<ZugangPage />} />
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}

/**
 * Entscheidet, welche der drei Welten die Person zu sehen bekommt.
 *
 * Die Bedingung auf den Pfad ist **nicht** überflüssig neben `!session`, und
 * zwar wegen der Reihenfolge beim Einlösen: Sobald eine der beiden Seiten den
 * Link eingelöst hat, existiert eine Sitzung. Ohne die zusätzliche Bedingung
 * schwenkte diese Stelle im selben Augenblick auf die angemeldete Anwendung,
 * deren Auffangroute den Pfad auf „/" umleitet — die Seite käme nie dazu,
 * fertig zu werden. Beide Seiten verlassen ihren Pfad selbst, wenn sie es
 * sind.
 *
 * Gefragt wird `istEinloesePfad` und nicht eine Aufzählung an dieser Stelle:
 * Die Liste gehört zu den Seiten, nicht zum Gate. `/zugang` war hier zuerst
 * vergessen, und die Folge war still — mit bestehender Sitzung wurde der Link
 * nie eingelöst und die Person landete im Konto der vorigen.
 */
function Gate() {
  const { session, initialising } = useSession();
  const { pathname } = useLocation();
  if (initialising) return <LoadingState label="Sitzung wird geprüft …" />;
  if (!session || istEinloesePfad(pathname)) return <OeffentlicheRouten />;
  return <AuthenticatedApp />;
}

/**
 * Was ein Renderfehler zeigt (FIX-EPIC-003).
 *
 * Ein Data Router fängt einen geworfenen Fehler selbst ab. Ohne eigenes
 * `errorElement` zeigt er dabei seine eingebaute Seite — englisch, mit
 * Stacktrace, auch im Produktionsbuild. Das wäre in einer Praxis mit
 * Gesundheitsdaten die falsche Antwort gleich zweimal: unverständlich für die
 * Person davor (`PROJECT_PRINCIPLES.md` §13) und gesprächiger, als ein
 * Fehlerbild sein muss (ADR-011).
 *
 * Kein „Erneut versuchen": Was geworfen hat, wirft nach einem Neurendern
 * wieder. Das Neuladen liegt beim Browser, und die Seite sagt es.
 */
function Absturzseite() {
  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <Wortmarke hoehe={40} className="mb-6" />
      <ErrorState
        title="Da ist etwas schiefgegangen."
        description="Die Seite konnte nicht angezeigt werden. Bitte laden Sie die Anwendung neu. Ihre gespeicherte Arbeit bleibt unverändert erhalten."
      />
    </main>
  );
}

/**
 * Ein **Data Router** statt `<BrowserRouter>` (FIX-EPIC-003).
 *
 * Der Grund ist einziger und benannt: `useBlocker` — der einzige Weg, eine
 * angefangene Navigation innerhalb der Anwendung anzuhalten und zurückzugeben —
 * verlangt den Data-Router-Kontext und wirft unter `<BrowserRouter>`. Ohne ihn
 * bliebe ungespeicherte Behandlungsdokumentation bei jedem Tap im Hauptmenü,
 * bei jedem Patientenwechsel und beim Zurück des Browsers still verloren
 * (`PROJECT_PRINCIPLES.md` §13).
 *
 * Es bleibt bei **einer** Route mit Platzhalter: Die Routentabelle selbst
 * ändert sich nicht. `Gate`, `OeffentlicheRouten` und `AuthenticatedRoutes`
 * arbeiten unverändert mit `<Routes>` weiter — verschachtelte `<Routes>` sind
 * unter einem Data Router ausdrücklich vorgesehen. Damit kostet der Wechsel
 * keine Umstellung von zwanzig Routen auf Routenobjekte, und die Rollenprüfung
 * bleibt dort, wo sie steht (ADR-004). Was er bringt, ist allein der Kontext.
 *
 * Der Router entsteht **einmal je Anwendung**, nicht einmal je Modul:
 * `createBrowserRouter` liest die Adresse des Fensters beim Erzeugen. Ein
 * Router im Modulrumpf läse sie beim Import — in der Anwendung derselbe
 * Augenblick, in einem Test aber lange vor dem `pushState`, das die zu
 * prüfende Adresse setzt (`Gate.test.tsx`).
 */
export function App() {
  const [router] = useState(() =>
    createBrowserRouter([{ path: '*', element: <Gate />, errorElement: <Absturzseite /> }]),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  );
}
