import { useCallback, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Route, RouterProvider, Routes, createBrowserRouter, useLocation } from 'react-router-dom';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { Sitzungssperre } from '@/features/auth/sitzungssperre/Sitzungssperre';
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
import { EinladungPage } from '@/features/platform/EinladungPage';
import { EINLADUNG_PFAD } from '@/features/platform/einladung';
import { KONTEXT_SCHLUESSEL, ladePlattformkontext } from '@/features/platform/api';
import { PlattformApp } from '@/features/platform/PlattformApp';
import { AuthenticatedRoutes } from '@/routes/AuthenticatedRoutes';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Absturzseite, Startfehlergrenze } from './Absturz';
import { NachladefehlerContext } from './nachladefehler';
import { Startbild } from './Startbild';
import { Vollseite } from './Vollseite';
import { startbildFaellig } from '@/lib/startbildMerker';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

/**
 * Die angemeldete Anwendung, davor einmal je Sitzung das Startbild (RAH-009,
 * ANN-243).
 *
 * Das Intro liegt **über** der Anwendung und hält nichts an: Profil und
 * Tagesliste laden darunter weiter, und steht die Seite nach 1,8 s noch nicht,
 * erscheint der Ladezustand wie bisher. Ob es fällig ist, sagt der Merker der
 * Sitzung; ohne Sitzung kommt diese Stelle nie dran - die Anmeldemaske zeigt
 * kein Intro, es folgt nach der Anmeldung.
 */
function AuthenticatedApp() {
  const [startbild, setStartbild] = useState(startbildFaellig);
  const startbildFertig = useCallback(() => setStartbild(false), []);
  return (
    <>
      {startbild ? <Startbild onFertig={startbildFertig} /> : null}
      <AngemeldeterInhalt />
    </>
  );
}

function AngemeldeterInhalt() {
  const { session, signOut } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const { data: user, isPending, isError, error, refetch } = useCurrentUser(userId);

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

  // Auch der Ladezustand steht in der Hülle der Vollseiten, mit `main` und
  // Marke (AUTH-13) - sonst stand hier ein nackter Satz ohne Absender.
  if (isPending) {
    return (
      <Vollseite>
        <LoadingState label="Profil wird geladen …" />
      </Vollseite>
    );
  }

  /**
   * Angemeldet, aber keiner Praxis zugeordnet - der Normalfall direkt nach der
   * Anmeldung über eine Einladungsmail (STAFF-002b). Die Seite bietet an, die
   * Einladung anzunehmen; ohne Einladung bleibt das Konto zugriffslos
   * (ANN-025).
   */
  if (error instanceof KeinProfilError) {
    return (
      <OhneProfil
        email={session?.user.email}
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
   * sagt, was los ist und an wen sie sich wendet, mehr nicht. Entsperren kann
   * nur die Praxisinhaber:in (`canManageStaffAccounts`, WRT-12).
   */
  if (error instanceof ZugangGesperrtError) {
    return (
      <Vollseite titel="Zugang gesperrt">
        <ErrorState
          title="Dieser Zugang ist gesperrt."
          description="Bitte wenden Sie sich an die Praxisinhaber:in. Ihre bisherige Arbeit bleibt unverändert erhalten."
        />
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void abmelden()}>
          Abmelden
        </Button>
      </Vollseite>
    );
  }

  /**
   * Das Erstladen ist gescheitert (BEF-046). PROJECT_PRINCIPLES.md 13: Ohne
   * Profil ist keine Organisationszuordnung und damit keine
   * Berechtigungsentscheidung möglich - hier wird nichts gezeigt, sondern
   * verständlich abgebrochen.
   *
   * Bis UX-006b hieß die Seite „Zugang nicht vollständig eingerichtet" und
   * zeigte `error.message`; ihr einziger Knopf war „Abmelden". Meist ist aber
   * nur das Netz weg, und Abmelden löscht dann eine Sitzung, die sich ohne
   * Netz nicht neu anlegen lässt. Deshalb ein fester Satz ohne Vermutung über
   * die Ursache, „Erneut versuchen" als Hauptknopf und „Abmelden" darunter.
   */
  if (!user) {
    return (
      <Vollseite titel="Anwendung nicht geladen">
        <ErrorState
          title="Die Anwendung konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen. Sie bleiben angemeldet."
        />
        <Button className="mt-4 w-full" onClick={() => void refetch()}>
          Erneut versuchen
        </Button>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => void abmelden()}>
          Abmelden
        </Button>
      </Vollseite>
    );
  }

  // Ein geladenes Profil bleibt stehen, auch wenn das Nachladen scheitert
  // (BEF-046): Die Zeile im Rahmen sagt es, die Anwendung läuft weiter.
  return (
    <NachladefehlerContext.Provider
      value={isError ? { satz: PROFIL_NICHT_AKTUALISIERT, erneut: refetch } : null}
    >
      <AuthenticatedRoutes user={user} onSignOut={() => void abmelden()} />
    </NachladefehlerContext.Provider>
  );
}

/** Die Zeile über der Anwendung nach einem gescheiterten Nachladen (BEF-046). */
const PROFIL_NICHT_AKTUALISIERT = 'Ihr Profil ließ sich gerade nicht aktualisieren.';
const ZUGANG_NICHT_AKTUALISIERT = 'Ihr Zugang ließ sich gerade nicht aktualisieren.';

/**
 * Ein Konto ohne Praxisprofil: Plattformkonto oder Konto mit offener
 * Praxiseinladung (ADR-023 Punkt 25).
 *
 * Die Weiche fragt die Plattformprojektion. Liefert sie Zugänge, ist es ein
 * Plattformkonto und bekommt das Gerüst unter `/p` - nie die
 * Praxisoberfläche. Sonst geht es weiter wie bisher: Annahme einer
 * Praxiseinladung, ohne Einladung zugriffslos (ANN-025). Die Weiche dient
 * der Bedienung; der Schutz liegt in der Datenbank (Punkte 19 bis 21).
 */
function OhneProfil({
  email,
  onEingerichtet,
  onAbmelden,
}: {
  email: string | undefined;
  onEingerichtet: () => void;
  onAbmelden: () => void;
}) {
  // Immer frisch beim Öffnen: Eine Sperre soll bei der nächsten Anfrage
  // wirken (ADR-023 Punkt 18), nicht nach Ablauf eines Zwischenspeichers.
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: KONTEXT_SCHLUESSEL,
    queryFn: ladePlattformkontext,
    staleTime: 0,
  });
  if (isPending) {
    return (
      <Vollseite>
        <LoadingState label="Zugang wird geladen …" />
      </Vollseite>
    );
  }
  // Wie beim Praxisprofil (BEF-046): Nur ohne geladenen Zugang ersetzt der
  // Fehler die Seite. Ein gescheitertes Nachladen - nach jedem Wieder-online -
  // lässt die Plattform stehen; die Projektionen prüfen den Zugang ohnehin bei
  // jeder Anfrage (ADR-023 Punkt 18).
  if (data === undefined) {
    return (
      <Vollseite titel="Zugang nicht geladen">
        <ErrorState
          title="Ihr Zugang konnte nicht geladen werden."
          description="Bitte prüfen Sie die Verbindung."
          onErneut={refetch}
        />
        <Button variant="secondary" className="mt-4 w-full" onClick={onAbmelden}>
          Abmelden
        </Button>
      </Vollseite>
    );
  }
  if (data.length > 0) {
    return (
      <NachladefehlerContext.Provider
        value={isError ? { satz: ZUGANG_NICHT_AKTUALISIERT, erneut: refetch } : null}
      >
        <PlattformApp zugaenge={data} email={email} onAbmelden={onAbmelden} />
      </NachladefehlerContext.Provider>
    );
  }
  return <ZugangEinrichtenPage onEingerichtet={onEingerichtet} onAbmelden={onAbmelden} />;
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
      <Route path={EINLADUNG_PFAD} element={<EinladungPage />} />
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
  if (initialising) {
    return (
      <Vollseite>
        <LoadingState label="Sitzung wird geprüft …" />
      </Vollseite>
    );
  }
  if (!session || istEinloesePfad(pathname)) return <OeffentlicheRouten />;
  // Die Sitzungssperre steht vor allem, was angemeldet zu sehen ist - Praxis
  // wie Plattform (SEC-EPIC-001, ADR-025): erst prüfen, dann zeigen.
  return (
    // Je Konto eine eigene Sperre: Meldet sich in einem zweiten Tab ein
    // anderes Konto an, fällt eine festgehaltene Seite weg (Zweitreview).
    <Sitzungssperre key={session.user.id}>
      <AuthenticatedApp />
    </Sitzungssperre>
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
 *
 * Was oberhalb des Routers scheitert - der erste Zugriff auf den
 * Anmeldedienst bei unvollständiger Konfiguration -, fängt die
 * `Startfehlergrenze` (AUTH-15). Bis UXR-002 blieb dann eine leere Fläche.
 */
export function App() {
  const [router] = useState(() =>
    createBrowserRouter([{ path: '*', element: <Gate />, errorElement: <Absturzseite /> }]),
  );

  return (
    <Startfehlergrenze>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </Startfehlergrenze>
  );
}
