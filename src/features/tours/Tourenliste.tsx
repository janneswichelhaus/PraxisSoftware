import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import type { NavigationApp, NavigationTarget } from '@/lib/location/contract';
import {
  buildNavigationDayUrls,
  buildNavigationUrl,
  navigationOeffnen,
  stoppsJeAbschnitt,
} from '@/lib/location/navigation';
import { mitRueckweg } from '@/lib/rueckweg';
import { formatLocalTimeRange, terminBezeichnung } from '@/features/appointments/api';
import { zielDesStopps, type Stopp } from './tagesroute';

/**
 * Die Tourenliste mit Navigations-Handoff (MAP-006b und MAP-006d).
 *
 * **Hier — nicht auf der Karte — stehen Name und Anschrift** (ANN-096). Die
 * Nummer verbindet beides; die Liste ist zugleich das Papier des Tages, der
 * Browserdruck lässt nur die Knöpfe weg.
 *
 * **Handoff mit Koordinate** (ANN-018): Hat die Adresse eine Position, geht
 * nur sie an die Navigations-App, sonst die Anschrift ohne Namen. Die URL
 * entsteht erst im Tap-Handler; ein `<a href>` gibt es nicht (ADR-019
 * Punkt 20). Ein Knopf am Stopp, der ganze Tag darüber, die Ziel-App
 * weggeklappt — sie gehört der Gerätebewertung, nicht dem Arbeitsschritt
 * (BEF-032), und wird nirgends gespeichert.
 */

const ZIEL_APPS: readonly { readonly wert: NavigationApp; readonly label: string }[] = [
  { wert: 'google_maps', label: 'Google Maps' },
  { wert: 'apple_maps', label: 'Apple Maps' },
  { wert: 'system', label: 'Systemnavigation' },
];

const stoppKnopf = kartenAktionKlassen();
const tagKnopf = kartenAktionKlassen('primary');

function anschrift(stopp: Stopp): string {
  const t = stopp.termin;
  if (t.appointment_type === 'practice') return t.location_name ?? 'Praxis';
  const strasse = [t.visit_street, t.visit_house_number].filter(Boolean).join(' ');
  return [strasse, [t.visit_postal_code, t.visit_city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

export function Tourenliste({
  stopps,
  zeitzone,
  startGewaehlt,
  zwischen,
}: {
  readonly stopps: readonly Stopp[];
  readonly zeitzone: string;
  readonly startGewaehlt: boolean;
  /** Was zwischen Stopp i und i+1 steht — Fahrzeit und Fahrpuffer (MAP-006c). */
  readonly zwischen?: (index: number) => ReactNode;
}) {
  const [app, setApp] = useState<NavigationApp>('google_maps');

  // Nur Stopps mit Ziel; Praxistermine haben keinen Handoff.
  const ziele = stopps.map(zielDesStopps).filter((ziel): ziel is NavigationTarget => ziel !== null);
  // Gerechnet wird beim Rendern nur die Zahl der Abschnitte, gebaut erst beim Tippen.
  const abschnitte = ziele.length === 0 ? 0 : Math.ceil(ziele.length / stoppsJeAbschnitt(app));

  return (
    <div>
      {app === 'system' ? (
        <p className="text-ink-muted mb-3 text-sm print:hidden">
          Die Systemnavigation kennt kein Zwischenziel. Für den ganzen Tag gibt es deshalb keinen
          Knopf — Stopp für Stopp geht es unten.
        </p>
      ) : abschnitte > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2 print:hidden">
          {Array.from({ length: abschnitte }, (_, index) => (
            <button
              key={index}
              type="button"
              className={tagKnopf}
              onClick={() => navigationOeffnen(buildNavigationDayUrls(ziele, app)[index]!)}
            >
              {abschnitte === 1
                ? `Ganzer Tag (${ziele.length} ${ziele.length === 1 ? 'Stopp' : 'Stopps'})`
                : `Ganzer Tag – Abschnitt ${index + 1} von ${abschnitte}`}
            </button>
          ))}
        </div>
      ) : null}

      <ol aria-label="Stopps in Fahrtreihenfolge" className="border-line border-y">
        {startGewaehlt ? (
          <li className="border-line text-ink-muted flex items-center gap-3 border-b py-2 text-sm">
            <Nummer>S</Nummer>
            Start an der Praxis
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
                  <p className="text-ink text-[0.9375rem] font-medium">
                    <span className="tabular-nums">
                      {formatLocalTimeRange(stopp.termin.starts_at, stopp.termin.ends_at, zeitzone)}
                    </span>{' '}
                    ·{' '}
                    <Link
                      to={mitRueckweg(`/termine/${stopp.termin.id}`, '/touren')}
                      className="hover:underline"
                    >
                      {terminBezeichnung(stopp.termin)}
                    </Link>
                  </p>
                  <p className="text-ink-muted text-sm">
                    {anschrift(stopp)}
                    {stopp.position === null ? ' · ohne Kartenposition' : ''}
                  </p>
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
      </ol>

      <details className="mt-4 print:hidden">
        <summary className="text-ink-muted marker:text-ink-subtle cursor-pointer text-sm">
          Andere Ziel-App prüfen (für die Gerätebewertung)
        </summary>
        <div
          role="radiogroup"
          aria-label="Ziel-App für die Gerätebewertung"
          className="mt-3 flex flex-wrap gap-2"
        >
          {ZIEL_APPS.map((option) => (
            <label
              key={option.wert}
              className={`rounded-button inline-flex min-h-11 cursor-pointer items-center border px-4 text-[0.9375rem] ${
                app === option.wert
                  ? 'border-accent bg-accent-soft text-accent font-medium'
                  : 'border-line-strong bg-surface text-ink-muted'
              }`}
            >
              <input
                type="radio"
                name="ziel-app"
                className="sr-only"
                checked={app === option.wert}
                onChange={() => setApp(option.wert)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="text-ink-subtle mt-2 text-sm">
          Keine Einstellung: Die Wahl gilt für diesen Besuch der Seite und wird nicht gespeichert.
        </p>
      </details>
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
