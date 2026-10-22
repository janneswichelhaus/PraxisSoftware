import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { tabTitel } from '@/app/tabtitel';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Textlink } from '@/components/ui/Textlink';
import type { Plattformzugang } from '@/features/platform/api';
import type { Einsichtsquelle } from '@/features/platform/einsicht';
import { PlattformApp } from '@/features/platform/PlattformApp';
import {
  EinsichtAbgewiesen,
  einsichtLesen,
  einsichtskontextSchluessel,
  ladeEinsichtskontext,
  rueckwegAusDerEinsicht,
  wegeAusDerEinsicht,
  type Einsichtskontext,
} from './einsicht';

/**
 * Die Einsicht der Praxis in die Plattform einer Person (E-001, DSN-001 D7,
 * Befund B11): dasselbe Gerüst, das die Person sieht, nur lesend - kein
 * Anmelden als die Person, nichts in ihrem Namen.
 *
 *   * **Nur die Praxisinhaber:in** kommt hierher (`AuthenticatedRoutes`);
 *     verbindlich prüft der Server bei jedem Lesen (`platform_preview`).
 *   * **Ein Zugang**, aus der Adresse beim Öffnen (`?zugang=`). Ohne gültige
 *     Kennung geht es zurück auf die Startseite.
 *   * **Ein eigener Abfragespeicher**: Nichts aus der Einsicht mischt sich in
 *     die Praxisseiten, und er fällt mit ihr.
 *   * **Keine Ablage auf dem Gerät** (`PlattformAblage` bleibt weg) und kein
 *     Schreibweg: Die Plattform bekommt `einsichtsApi` eingespeist.
 *   * Am breiten Bildschirm steht die Plattform in einem Telefon
 *     (`max-w-telefon`), am Telefon über die ganze Breite; die Leiste oben
 *     sagt immer, dass es eine Einsicht ist.
 */
export function PlattformEinsicht() {
  const [suche] = useSearchParams();
  // Der Zugang steht beim Öffnen in der Adresse und gilt dann für die ganze
  // Einsicht - ein späterer Suchparameter wählt keinen anderen.
  const [zugangId] = useState(() => {
    const wert = suche.get('zugang');
    return z.string().uuid().safeParse(wert).success ? wert : null;
  });
  if (!zugangId) return <Navigate to="/" replace />;
  return <EigenerSpeicher zugangId={zugangId} />;
}

function EigenerSpeicher({ zugangId }: { zugangId: string }) {
  const [speicher] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={speicher}>
      <Einsicht zugangId={zugangId} />
    </QueryClientProvider>
  );
}

function Einsicht({ zugangId }: { zugangId: string }) {
  useZugangInDerAdresse(zugangId);
  const kontext = useQuery({
    queryKey: einsichtskontextSchluessel(zugangId),
    queryFn: () => ladeEinsichtskontext(zugangId),
    // Eine Sperre soll beim nächsten Öffnen wirken (ADR-023 Punkt 18).
    staleTime: 0,
  });

  // Laden und Fehler stehen ohne Leiste und ohne Plattform in einer Spalte;
  // eine Abweisung des Servers ist endgültig - kein neuer Versuch, auch nicht
  // über einem alten Stand.
  return (
    <Abfragezustand
      abfrage={kontext}
      laden="Die Einsicht wird geladen …"
      fehler="Die Einsicht konnte nicht geladen werden."
      endgueltig={{
        wenn: (fehler) => fehler instanceof EinsichtAbgewiesen,
        titel: 'Diese Einsicht ist nicht möglich.',
      }}
      ausweg={
        <Textlink alleinstehend to="/" className="mt-4">
          Zur Übersicht
        </Textlink>
      }
      rahmen={inEinerSpalte}
    >
      {(daten) => <Ansicht zugangId={zugangId} kontext={daten} />}
    </Abfragezustand>
  );
}

/** Laden und Fehler in einer Spalte mit `main`, ohne Leiste und ohne Plattform. */
function inEinerSpalte(zustand: ReactNode) {
  return <main className="max-w-formular mx-auto w-full px-5 py-8">{zustand}</main>;
}

function Ansicht({ zugangId, kontext }: { zugangId: string; kontext: Einsichtskontext }) {
  const { pathname } = useLocation();
  const rollbereich = useRef<HTMLDivElement>(null);
  const rueckweg = rueckwegAusDerEinsicht(kontext);
  // Die Plattform bekommt den Zugang so, wie die Person ihn sieht - ohne
  // Name und Verhältnis, die nur die Leiste braucht.
  const zugaenge = useMemo<Plattformzugang[]>(
    () => [
      {
        access_id: kontext.access_id,
        organization_name: kontext.organization_name,
        relationship_kind: kontext.relationship_kind,
        status: kontext.status,
        readable: kontext.readable,
        read_until: kontext.read_until,
        access_kind: kontext.access_kind,
        represented_name: kontext.represented_name,
        own_name: kontext.own_name,
        practice_phone: kontext.practice_phone,
      },
    ],
    [kontext],
  );
  const quelle = useCallback<Einsichtsquelle>(
    (funktion, argumente) => einsichtLesen(zugangId, funktion, argumente),
    [zugangId],
  );
  // Was die Einsicht nicht öffnet, öffnet die Praxis an seinem Ort (ANN-527).
  const einsicht = useMemo(
    () => ({ zugangId, quelle, wege: wegeAusDerEinsicht(kontext) }),
    [zugangId, quelle, kontext],
  );

  // Der Tab trägt nie einen Namen (BEF-050); eine neue Seite beginnt oben.
  useEffect(() => {
    document.title = tabTitel(pathname);
  }, [pathname]);
  useLayoutEffect(() => {
    rollbereich.current?.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="sm:bg-surface-sunken flex h-dvh flex-col">
      <section
        aria-label="Einsicht der Praxis"
        className="bg-surface-inverse text-surface flex shrink-0 flex-wrap items-center justify-between gap-x-4 px-4 py-1"
      >
        <p className="py-2 text-sm">
          <span className="font-semibold">Einsicht</span> · So sieht {kontext.person_name} die
          Plattform · nur lesen
        </p>
        {/* Auf Tiefgrün ist der Link Papier, nicht Hauptfarbe (wie in „Mein Tag“). */}
        <Link
          to={rueckweg.ziel}
          className="text-surface focus-visible:outline-surface inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-3"
        >
          {rueckweg.beschriftung}
        </Link>
      </section>
      <div className="min-h-0 flex-1 sm:px-4 sm:py-6">
        {/* `transform-gpu` macht den Rahmen zum Bezug der festen Reiterleiste:
            Sie steht unten im Telefon, nicht unten im Fenster. */}
        <div className="sm:max-w-telefon sm:border-line sm:rounded-card relative mx-auto h-full w-full transform-gpu overflow-hidden sm:border">
          <div ref={rollbereich} className="h-full overflow-y-auto">
            <PlattformApp
              zugaenge={zugaenge}
              email={undefined}
              onAbmelden={ohneAbmelden}
              einsicht={einsicht}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** In der Einsicht meldet sich niemand ab - der Knopf steht dort nicht. */
function ohneAbmelden() {}

/**
 * Hält den Zugang in der Adresse: Die Plattform verlinkt ihre Seiten ohne
 * ihn, und Neuladen soll die Einsicht behalten.
 */
function useZugangInDerAdresse(zugangId: string) {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const suche = new URLSearchParams(search);
    if (suche.get('zugang') === zugangId) return;
    suche.set('zugang', zugangId);
    void navigate({ pathname, search: `?${suche.toString()}`, hash }, { replace: true });
  }, [pathname, search, hash, zugangId, navigate]);
}
