import { useState } from 'react';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import type { MapOverlayStop, NavigationApp, NavigationTarget } from '@/lib/location/contract';
import {
  buildNavigationDayUrls,
  buildNavigationUrl,
  navigationOeffnen,
  stoppsJeAbschnitt,
} from '@/lib/location/navigation';

/**
 * Die Stopps mit ihrem Navigations-Handoff (MAP-005b, ADR-019 Punkt 20
 * bis 23).
 *
 * **Warum das hier steht.** Die Regel „genau ein Tap, und erst dann verlässt
 * etwas das Gerät" lässt sich nicht am Schreibtisch beurteilen: Ob ein
 * Koordinatenziel auf dem Rad verständlich ankommt und ob die Ziel-App
 * überhaupt im Fahrradmodus öffnet, zeigt sich am Telefon. Diese Seite ist
 * der Ort, an dem das mit **erfundenen Koordinaten** geprüft wird, bevor je
 * eine echte Adresse in eine URL gerät (MAP-005c).
 *
 * **Ein Knopf steht am Stopp, nicht in einer Knopfwand** (BEF-032). Die erste
 * Fassung stellte acht Stopp-Knöpfe, acht Tagesabschnitte und drei Ziel-Apps
 * nebeneinander — neunzehn Bedienelemente für eine Handlung, die aus einem Tap
 * besteht. Wer fährt, sucht den Stopp, nicht die Auswahl: Die Liste ist die
 * Führung, der Knopf hängt an ihrer Zeile, und die Ziel-App liegt weggeklappt,
 * weil sie **nur** zur Gerätebewertung gebraucht wird.
 *
 * **Die Auswahl der Ziel-App ist keine Einstellung.** Sie gilt für diesen
 * Besuch der Seite, steht nur im Arbeitsspeicher und wird nirgends abgelegt —
 * eine Präferenz je Person baut ADR-019 ausdrücklich nicht vor.
 *
 * **Keine URL ohne Tap.** `buildNavigationUrl` und `buildNavigationDayUrls`
 * laufen ausschließlich in den Klickhandlern; das Rendern rechnet nur, wie
 * viele Abschnitte es gäbe. Ein `<a href>` gibt es deshalb nicht — ein href
 * stünde ab dem Rendern im Seitenquelltext. `NavigationHandoff.test.tsx` hält
 * das mit einem Spy fest.
 */

const ZIEL_APPS: readonly { readonly wert: NavigationApp; readonly label: string }[] = [
  { wert: 'google_maps', label: 'Google Maps' },
  { wert: 'apple_maps', label: 'Apple Maps' },
  { wert: 'system', label: 'Systemnavigation' },
];

const stoppKnopf = kartenAktionKlassen();
const tagKnopf = kartenAktionKlassen('primary');

export function NavigationHandoff({ stopps }: { readonly stopps: readonly MapOverlayStop[] }) {
  const [app, setApp] = useState<NavigationApp>('google_maps');

  if (stopps.length === 0) return null;

  /**
   * Die Stopps als Navigationsziele — Koordinate, sonst nichts.
   *
   * Dass hier `MapOverlayStop` steht und nicht ein Termin, ist der Grund,
   * warum der Handoff auf dieser Seite nichts preisgeben kann: Der Typ trägt
   * Koordinate und Nummer, keinen Namen und keine Uhrzeit (ADR-019 Punkt 12).
   */
  const ziele: NavigationTarget[] = stopps.map((stopp) => ({
    kind: 'coordinate',
    position: stopp.position,
  }));

  // Nur die Zahl der Abschnitte, keine URL: gerechnet wird beim Rendern, gebaut
  // erst beim Tippen.
  const abschnitte = Math.ceil(ziele.length / stoppsJeAbschnitt(app));

  return (
    <div>
      <p className="text-ink-muted mb-3 text-sm">
        Ein Tap öffnet die Navigations-App dieses Geräts — übergeben wird nur die Koordinate und der
        Fahrradmodus. Die Adresse ist hier ohnehin erfunden, und gespeichert wird nichts.
      </p>

      {/*
        Der ganze Tag zuerst: Wer losfährt, will die Runde, nicht den einzelnen
        Punkt. Die Systemnavigation kann das nicht — dort stünden acht
        gleich aussehende Knöpfe, und deshalb steht dort ein Satz.
      */}
      {app === 'system' ? (
        <p className="text-ink-muted mb-4 text-sm">
          Die Systemnavigation kennt in einem <code>geo:</code>-Verweis kein Zwischenziel. Für den
          ganzen Tag gibt es hier deshalb keinen Knopf — Stopp für Stopp geht es unten.
        </p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: abschnitte }, (_, index) => (
            <button
              key={index}
              type="button"
              className={tagKnopf}
              onClick={() => navigationOeffnen(buildNavigationDayUrls(ziele, app)[index]!)}
            >
              {abschnitte === 1
                ? `Ganzer Tag (${ziele.length} Stopps)`
                : `Ganzer Tag – Abschnitt ${index + 1} von ${abschnitte}`}
            </button>
          ))}
        </div>
      )}

      <ol aria-label="Die Stopps" className="border-line border-y">
        {stopps.map((stopp, index) => (
          <li
            key={stopp.label}
            className="border-line flex items-center gap-3 border-b py-2 last:border-b-0"
          >
            <span className="bg-accent-soft text-accent rounded-pill flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold">
              {stopp.label}
            </span>
            {/* Kurz genug, dass der Knopf bei 375 px in derselben Zeile bleibt
                — die Himmelsrichtungen stehen für Vorlesesoftware daneben. */}
            <span className="text-ink flex-1 text-[0.9375rem] tabular-nums">
              <span aria-hidden="true">
                {koordinate(stopp.position.lat)} · {koordinate(stopp.position.lon)}
              </span>
              <span className="sr-only">
                {koordinate(stopp.position.lat)} Nord, {koordinate(stopp.position.lon)} Ost
              </span>
            </span>
            <button
              type="button"
              className={`${stoppKnopf} shrink-0`}
              aria-label={`Navigation zu Stopp ${stopp.label} starten`}
              onClick={() => navigationOeffnen(buildNavigationUrl(ziele[index]!, app))}
            >
              Navigation
            </button>
          </li>
        ))}
      </ol>

      {/*
        Weggeklappt, weil es nur die Gerätebewertung angeht: Im Alltag gibt es
        eine Ziel-App und keine Wahl (ADR-019, „Bewusst nicht Bestandteil").
      */}
      <details className="mt-4">
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
          Welche App die Praxis später vorwählt, entscheidet die Gerätebewertung.
        </p>
      </details>
    </div>
  );
}

/** Dezimalgrad in deutscher Schreibweise, auf rund elf Meter genau. */
function koordinate(wert: number): string {
  return wert.toFixed(4).replace('.', ',');
}
