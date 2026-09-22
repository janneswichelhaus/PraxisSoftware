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
 * Der Navigations-Handoff am Kartenprototyp (MAP-005b, ADR-019 Punkt 20
 * bis 23).
 *
 * **Warum das hier steht.** Die Regel „genau ein Tap, und erst dann verlässt
 * etwas das Gerät" lässt sich nicht am Schreibtisch beurteilen: Ob ein
 * Koordinatenziel auf dem Rad verständlich ankommt und ob die Ziel-App
 * überhaupt im Fahrradmodus öffnet, zeigt sich am Telefon. Diese Seite ist
 * der Ort, an dem das mit **erfundenen Koordinaten** geprüft wird, bevor je
 * eine echte Adresse in eine URL gerät (MAP-005c, Gerätebewertung in
 * `docs/abnahme/etappe-t-kartendienst.md`).
 *
 * **Die Auswahl der Ziel-App ist keine Einstellung.** Sie gilt für diesen
 * Besuch der Seite, steht nur im Arbeitsspeicher und wird nirgends abgelegt —
 * eine Präferenz je Person baut ADR-019 ausdrücklich nicht vor. Sie steht
 * hier, weil die Bewertung sonst drei Knöpfe je Stopp bräuchte.
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
        Ein Tap öffnet die Navigations-App dieses Geräts. Übergeben wird nur die Koordinate und der
        Fahrradmodus — kein Name, keine Uhrzeit, keine Kennung; die Adresse ist hier ohnehin
        erfunden. Die URL entsteht erst beim Tippen und wird nirgends gespeichert.
      </p>

      <p className="text-ink mb-2 text-sm font-medium">Ziel-App für diese Prüfung</p>
      <div
        role="radiogroup"
        aria-label="Ziel-App für diese Prüfung"
        className="flex flex-wrap gap-2"
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

      <h3 className="text-ink mt-4 mb-2 text-sm font-medium">Zu einem Stopp</h3>
      <div className="flex flex-wrap gap-2">
        {stopps.map((stopp, index) => (
          <button
            key={stopp.label}
            type="button"
            className={stoppKnopf}
            aria-label={`Navigation zu Stopp ${stopp.label} starten`}
            onClick={() => navigationOeffnen(buildNavigationUrl(ziele[index]!, app))}
          >
            Stopp {stopp.label}
          </button>
        ))}
      </div>

      <h3 className="text-ink mt-4 mb-2 text-sm font-medium">Der ganze Tag</h3>
      <div className="flex flex-wrap gap-2">
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
      <p className="text-ink-subtle mt-2 text-sm">
        {app === 'system'
          ? 'Die Systemnavigation kennt in einem geo:-Verweis kein Zwischenziel — der Tag steht ' +
            'deshalb Stopp für Stopp.'
          : 'Mehr Stopps als eine URL trägt, werden geteilt statt abgeschnitten: drei ' +
            'Zwischenziele je Abschnitt, die kleinere der beiden dokumentierten Zahlen.'}
      </p>
    </div>
  );
}
