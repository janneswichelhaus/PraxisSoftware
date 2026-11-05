import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Textlink } from '@/components/ui/Textlink';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import type { NavigationApp, NavigationTarget } from '@/lib/location/contract';
import {
  buildNavigationDayUrls,
  buildNavigationUrl,
  navigationOeffnen,
  stoppsJeAbschnitt,
} from '@/lib/location/navigation';
import { mitRueckweg } from '@/lib/rueckweg';
import { zielDesStopps, type Stopp } from './tagesroute';
import { formatLocalTimeRange } from '@/lib/datum';
import { terminBezeichnung, terminPfad } from '@/lib/termin';

/**
 * Name und Anschrift stehen hier, nicht auf der Karte (ANN-096); an die Navigations-App geht nur
 * das Ziel, die URL entsteht erst beim Tippen (ANN-018, ADR-019 Punkt 20).
 */

const app: NavigationApp = 'google_maps';

const stoppKnopf = kartenAktionKlassen();
// Am Handy über die ganze Breite (Runde 3, Handoff Kalender und Tour).
const tagKnopf = kartenAktionKlassen('primary', 'max-sm:w-full');

function anschrift(stopp: Stopp): string {
  const t = stopp.termin;
  if (t.appointment_type === 'practice') return t.location_name ?? 'Praxis';
  const strasse = [t.visit_street, t.visit_house_number].filter(Boolean).join(' ');
  return [strasse, [t.visit_postal_code, t.visit_city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

/**
 * Beschriftung des Tagesknopfs: Er übergibt an die Navigations-App und sagt
 * das (UEB-10) - „Ganzer Tag" allein las sich wie ein Filter. Mit einem
 * Abschnitt heißt er wie in der Übersicht (`NavigationFuerDenTag`).
 *
 * Mit mehreren Abschnitten bleibt „Ganzer Tag" im Namen, anders als in der
 * Übersicht („Navigation: Abschnitt 1 von 2"): Die Browserprüfung
 * `tests/e2e/karte.spec.ts` zählt die Tippziele dieser Liste über
 * `/Navigation zu Stopp|Ganzer Tag/`. Ändert sich das Muster dort, wird
 * diese Zeile der Übersicht gleich.
 */
function tagesknopfText(abschnitt: number, abschnitte: number, stopps: number): string {
  return abschnitte === 1
    ? `Navigation: ganzer Tag (${stopps} ${stopps === 1 ? 'Stopp' : 'Stopps'})`
    : `Navigation: Ganzer Tag – Abschnitt ${abschnitt} von ${abschnitte}`;
}

export function Tourenliste({
  stopps,
  zeitzone,
  startGewaehlt,
  startText = 'Start an der Praxis',
  ende = null,
  zwischen,
  rueckweg,
}: {
  readonly stopps: readonly Stopp[];
  readonly zeitzone: string;
  readonly startGewaehlt: boolean;
  /** „Start an der Garage“ oder „… an der Praxis“ (UBK-015). */
  readonly startText?: string;
  /**
   * Das Ende der Tour mit dem Rückweg dorthin (UBK-015) - die letzte Zeile.
   * Ohne Angabe endet die Liste mit dem letzten Besuch.
   */
  readonly ende?: { readonly text: string; readonly fahrt: ReactNode } | null;
  /** Was zwischen Stopp i und i+1 steht — Fahrzeit und Fahrpuffer (MAP-006c). */
  readonly zwischen?: (index: number) => ReactNode;
  /**
   * Wohin der Termin eines Stopps zurückführt (TER-03). Die Tourenseite gibt
   * Tag und Person ausdrücklich mit, auch wenn die Adresszeile sie noch nicht
   * trägt; ohne Angabe gilt die aktuelle Adresse.
   */
  readonly rueckweg?: string | undefined;
}) {
  const ort = useLocation();
  const hier = rueckweg ?? `${ort.pathname}${ort.search}`;

  // Nur Stopps mit Ziel; Praxistermine haben keinen Handoff.
  const ziele = stopps.map(zielDesStopps).filter((ziel): ziel is NavigationTarget => ziel !== null);
  // Gerechnet wird beim Rendern nur die Zahl der Abschnitte, gebaut erst beim Tippen.
  const abschnitte = ziele.length === 0 ? 0 : Math.ceil(ziele.length / stoppsJeAbschnitt(app));

  return (
    <div>
      {abschnitte > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 print:hidden">
          {Array.from({ length: abschnitte }, (_, index) => (
            <button
              key={index}
              type="button"
              className={tagKnopf}
              onClick={() => navigationOeffnen(buildNavigationDayUrls(ziele, app)[index]!)}
            >
              {tagesknopfText(index + 1, abschnitte, ziele.length)}
            </button>
          ))}
        </div>
      ) : null}

      <ol aria-label="Stopps in Fahrtreihenfolge" className="border-line border-y">
        {startGewaehlt ? (
          <li className="border-line text-ink-muted flex items-center gap-3 border-b py-2 text-sm">
            <Nummer>S</Nummer>
            {startText}
          </li>
        ) : null}
        {stopps.map((stopp, index) => {
          const ziel = zielDesStopps(stopp);
          return (
            <li key={stopp.termin.id} className="border-line border-b last:border-b-0">
              {index > 0 && zwischen ? zwischen(index - 1) : null}
              <div className="flex items-center gap-3 py-3">
                <Nummer>{stopp.nummer}</Nummer>
                <div className="min-w-0 flex-1">
                  {/* Der Name ist der einzige Weg vom Stopp in den Termin:
                      als Link erkennbar und 44 px hoch (TER-17, RSP-06). Das
                      Tippziel ist ein eigener Kasten in der Zeile; ohne
                      `wrap-anywhere` liefe ein langer Name aus ihr heraus. */}
                  <p className="text-ink text-liste font-medium">
                    <span className="tabular-nums">
                      {formatLocalTimeRange(stopp.termin.starts_at, stopp.termin.ends_at, zeitzone)}
                    </span>{' '}
                    ·{' '}
                    <Textlink
                      alleinstehend
                      to={mitRueckweg(terminPfad(stopp.termin), hier)}
                      className="wrap-anywhere"
                    >
                      {terminBezeichnung(stopp.termin)}
                    </Textlink>
                  </p>
                  <p className="text-ink-muted text-sm">
                    {anschrift(stopp)}
                    {stopp.position === null && !stopp.veraltet ? ' · ohne Kartenposition' : ''}
                  </p>
                  {/* ANN-236: Die Akte nennt inzwischen eine andere Anschrift -
                      ohne Position, ohne Fahrzeit, bis der Termin umgestellt ist. */}
                  {stopp.veraltet ? (
                    <p className="text-warnung text-sm font-medium">
                      <span aria-hidden="true">! </span>
                      Fahrzeit nicht verfügbar – Adresse am Termin veraltet
                    </p>
                  ) : null}
                </div>
                {ziel ? (
                  <button
                    type="button"
                    className={`${stoppKnopf} shrink-0 print:hidden`}
                    aria-label={`Navigation zu Stopp ${stopp.nummer} starten`}
                    onClick={() => navigationOeffnen(buildNavigationUrl(ziel, app))}
                  >
                    Navigation
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
        {ende ? (
          <li data-testid="tour-ende" className="border-line border-t">
            {ende.fahrt}
            <div className="text-ink-muted flex items-center gap-3 py-2 text-sm">
              <Nummer>Z</Nummer>
              {ende.text}
            </div>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function Nummer({ children }: { readonly children: ReactNode }) {
  return (
    <span className="bg-accent-soft text-accent rounded-pill flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold">
      {children}
    </span>
  );
}
