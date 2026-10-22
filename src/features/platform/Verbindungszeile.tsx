import { useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useIstVerbunden } from '@/app/verbindung';
import { geruestSpalte } from './geruestbreite';
import { uhrzeit } from './zeit';

/**
 * Die Verbindungszeile unter dem Kopf der Plattform (DR-118, Handoff
 * 2026-10-22 Abschnitt 3).
 *
 * Ohne Netz blieb „Ihre Termine werden geladen …“ einfach stehen, und das
 * Gerüst sagte nicht, warum - die Praxis hat dafür ihre
 * `Verbindungsanzeige`. Hier steht eine ruhige Zeile statt einer Warnung: Der
 * Inhalt bleibt, und die Zeile sagt, von wann er ist. Die Uhrzeit ist der
 * letzte erfolgreiche Abruf; gibt es keinen, steht keine da - geraten wird
 * sie nie.
 *
 * Quelle ist wie in der Praxis allein `navigator.onLine` (ANN-015); die Zeile
 * sagt deshalb nur, was das Gerät meldet.
 */
export function Verbindungszeile({ rechner = false }: { rechner?: boolean }) {
  const verbunden = useIstVerbunden();
  const queryClient = useQueryClient();
  // Beim Abreißen einmal ermittelt: Was ohne Netz noch in den Speicher kommt,
  // etwa eine Übung, die auf dem Gerät gespeichert wird, ist kein Abruf.
  const stand = useMemo(
    () => (verbunden ? 0 : letzterAbruf(queryClient)),
    [verbunden, queryClient],
  );

  // Die Zeile steht immer im Baum, nur ihr Inhalt wechselt: Eine Live-Region,
  // die erst mit ihrem Text entsteht, sagt Vorlesesoftware unzuverlässig an
  // (NAV-11, wie `Verbindungsanzeige`).
  return (
    <div role="status" className="nicht-drucken">
      {verbunden ? null : (
        <div className="bg-surface-sunken text-ink">
          <p className={`${geruestSpalte(rechner)} flex items-start gap-3 py-2.5`}>
            <OhneNetzSymbol />
            <span>
              Keine Verbindung.
              {stand > 0
                ? ` Sie sehen den Stand von ${uhrzeit(new Date(stand).toISOString())} Uhr.`
                : null}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Der jüngste erfolgreiche Abruf im Speicher der Abfragen; 0, wenn es keinen gab. */
function letzterAbruf(queryClient: QueryClient): number {
  return Math.max(
    0,
    ...queryClient
      .getQueryCache()
      .getAll()
      .map((abfrage) => abfrage.state.dataUpdatedAt),
  );
}

/**
 * Das durchgestrichene WLAN-Zeichen, 22 px (Raster 20, Strich 1,75, wie
 * `MikrofonSymbol`). Für Vorlesesoftware ausgeblendet; der Satz sagt es.
 */
function OhneNetzSymbol() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="mt-0.5 size-5.5 shrink-0"
    >
      <path d="M2.5 7.4a10.8 10.8 0 0 1 15 0M5 10.1a7.2 7.2 0 0 1 10 0M7.5 12.75a3.6 3.6 0 0 1 5 0M10 15.75h.01M3 3l14 14" />
    </svg>
  );
}
