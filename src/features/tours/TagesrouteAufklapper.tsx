import { Suspense, lazy, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Aufklappzeichen } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Textlink } from '@/components/ui/Textlink';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import type { DayPlanEntry } from '@/features/today/api';
import { fetchStandorte, startpunkt } from './startort';
import { fetchDayRoute, stoppsDesTages } from './tagesroute';

const TagesrouteKarte = lazy(() => import('./TagesrouteKarte'));

/**
 * Die eigene Tagesroute in der Übersicht (MAP-006b).
 *
 * Zugeklappt, und erst beim Aufklappen wird etwas geladen: die Stopps, die
 * Karte, die Route. Die Übersicht ist die meistgeöffnete Seite — sie soll
 * nicht bei jedem Öffnen Kacheln und eine Route anfragen, wenn niemand die
 * Karte ansieht.
 *
 * Der Kopf trägt das Aufklappzeichen wie jeder Aufklapper der Übersicht
 * (UEB-03, UIK-07): Ohne es sah „Tagesroute auf der Karte" aus wie eine
 * graue Textzeile.
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
    <details
      className="group border-line mt-6 border-t pt-3 print:hidden"
      onToggle={(ereignis) => setOffen(ereignis.currentTarget.open)}
    >
      <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
        <Aufklappzeichen />
        Tagesroute auf der Karte
      </summary>
      {offen ? <Inhalt datum={datum} staffMemberId={staffMemberId} plan={plan} /> : null}
    </details>
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
    return <p className="text-ink-muted mt-2 text-sm">Heute gibt es keinen Besuch mit Ort.</p>;
  }

  return (
    <div className="mt-3">
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
