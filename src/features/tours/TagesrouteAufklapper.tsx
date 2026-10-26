import { Suspense, lazy, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Disclosure } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Textlink } from '@/components/ui/Textlink';
import { fetchStandorte, startpunkt } from './startort';
import { fetchDayRoute, stoppsDesTages } from './tagesroute';
import type { DayPlanEntry } from '@/features/day-plan/api';

const TagesrouteKarte = lazy(() => import('./TagesrouteKarte'));

/**
 * Die eigene Tagesroute in der Übersicht (MAP-006b).
 *
 * Zugeklappt, und erst beim Aufklappen wird die Karte geladen. Die Übersicht
 * ist die meistgeöffnete Seite — sie soll nicht bei jedem Öffnen Kacheln
 * anfragen, wenn niemand die Karte ansieht.
 *
 * Die Punkte und die Route des Tages ruft die Übersicht seit dem UI-Redesign
 * vom 2026-10-01 schon beim Öffnen ab, weil der Wegbalken die Fahrzeit
 * braucht (ANN-194, `src/features/today/fahrzeiten.ts`). Dieselben Abfragen
 * mit denselben Schlüsseln: Wer die Karte aufklappt, löst keinen zweiten
 * Aufruf aus. MapLibre und die Kacheln bleiben beim Aufklappen.
 *
 * Derselbe Aufklapper wie „Nachzuholen" und „Tagesplan des Teams" (`Disclosure`
 * als Karte, Titel in 600; Design-Review R2, U5): Bis dahin stand er als
 * eigenes `<details>` ohne Karte mit grauem Kopf da - drei Stile auf einer
 * Seite.
 */
export function TagesrouteAufklapper({
  datum,
  staffMemberId,
  plan,
}: {
  readonly datum: string;
  readonly staffMemberId: string;
  readonly plan: readonly DayPlanEntry[];
}) {
  const [offen, setOffen] = useState(false);

  return (
    <section className="mt-6 print:hidden">
      <Disclosure
        inKarte
        kopf="betont"
        summary={<h2>Tagesroute auf der Karte</h2>}
        onUmschalten={setOffen}
      >
        {offen ? <Inhalt datum={datum} staffMemberId={staffMemberId} plan={plan} /> : null}
      </Disclosure>
    </section>
  );
}

function Inhalt({
  datum,
  staffMemberId,
  plan,
}: {
  readonly datum: string;
  readonly staffMemberId: string;
  readonly plan: readonly DayPlanEntry[];
}) {
  const route = useQuery({
    queryKey: ['day-route', datum, staffMemberId],
    queryFn: () => fetchDayRoute(datum, staffMemberId),
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['standorte'], queryFn: fetchStandorte, retry: false });
  const stopps = useMemo(
    () => (route.data ? stoppsDesTages(plan, route.data) : []),
    [plan, route.data],
  );

  if (route.isPending) return <LoadingState label="Tagesroute wird geladen …" />;
  if (route.isError) {
    // Mit dem nächsten Schritt und einem Weg hinaus, der die Seite stehen
    // lässt (WRT-01, ZST-04, ANN-021).
    return (
      <ErrorState
        title="Die Tagesroute konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => route.refetch()}
      />
    );
  }
  if (stopps.length === 0) {
    return <p className="text-ink-muted text-sm">Heute gibt es keinen Besuch mit Ort.</p>;
  }

  return (
    <div>
      <Suspense fallback={<LoadingState label="Karte wird geladen …" />}>
        <TagesrouteKarte start={startpunkt(standorte.data?.[0])} stopps={stopps} />
      </Suspense>
      {/* Der Pfeil gehört nicht zum Namen des Links (WRT-08). */}
      <Textlink
        alleinstehend
        to={`/touren?person=${staffMemberId}&tag=${datum}`}
        className="text-liste mt-3 gap-1 font-medium"
      >
        Zur Tour mit Fahrzeiten
        <span aria-hidden="true">→</span>
      </Textlink>
    </div>
  );
}
