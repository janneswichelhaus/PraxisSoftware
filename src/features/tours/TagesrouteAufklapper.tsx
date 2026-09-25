import { Suspense, lazy, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
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
      className="border-line mt-6 border-t pt-3 print:hidden"
      onToggle={(ereignis) => setOffen(ereignis.currentTarget.open)}
    >
      <summary className="text-ink-muted hover:text-ink flex min-h-11 cursor-pointer items-center text-sm">
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
    return <Statusmeldung ton="fehler">Die Tagesroute konnte nicht geladen werden.</Statusmeldung>;
  }
  if (stopps.length === 0) {
    return <p className="text-ink-muted mt-2 text-sm">Heute gibt es keinen Besuch mit Ort.</p>;
  }

  return (
    <div className="mt-3">
      <Suspense fallback={<LoadingState label="Karte wird geladen …" />}>
        <TagesrouteKarte start={startpunkt(standorte.data?.[0])} stopps={stopps} />
      </Suspense>
      <Link
        to={`/touren?person=${staffMemberId}&tag=${datum}`}
        className="text-accent hover:text-accent-hover mt-3 inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
      >
        Zur Tour mit Fahrzeiten →
      </Link>
    </div>
  );
}
