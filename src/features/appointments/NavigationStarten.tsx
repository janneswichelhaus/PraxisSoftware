import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import {
  buildNavigationDayUrls,
  buildNavigationUrl,
  navigationOeffnen,
  navigationsZiel,
  type Besuchsadresse,
} from '@/lib/location/navigation';

/**
 * Navigations-Handoff (UX-002, ADR-019 Punkt 20 bis 23).
 *
 * Bewusst eine Schaltfläche und **kein Link mit `href`**: Die URL entsteht
 * erst im Klickhandler. Ein `href` stünde ab dem Rendern im Seitenquelltext,
 * ließe sich kopieren und würde vom Vorausladen des Browsers unter Umständen
 * ohne Zutun der Person angefasst. „Nur auf Aktion, nie automatisch" ist die
 * Bedingung, unter der ADR-019 den Handoff überhaupt erlaubt, und eine
 * Prüfregel im Review - keine Gestaltungsfrage.
 *
 * Übergeben wird nur das Ziel und der Fahrradmodus (ANN-018). Der
 * Zugangshinweis bleibt in der Anwendung.
 *
 * **Ziel-App ist hier Google Maps**, obwohl `buildNavigationUrl` seit MAP-005
 * alle drei aus ADR-019 Punkt 22 kennt. Eine Auswahl gehört erst in die
 * Tagesliste, wenn die Gerätebewertung (MAP-005c) gezeigt hat, welche App auf
 * den Geräten der Praxis zuverlässig im Fahrradmodus öffnet - bis dahin wäre
 * sie eine vorgebaute Präferenz (ADR-019, „Bewusst nicht Bestandteil").
 */

const knopf = kartenAktionKlassen();

/** „Navigation starten" für einen einzelnen Hausbesuch. */
export function NavigationZumTermin({ termin }: { termin: Besuchsadresse }) {
  const ziel = navigationsZiel(termin);
  if (!ziel) return null;

  return (
    <button
      type="button"
      className={knopf}
      onClick={() => navigationOeffnen(buildNavigationUrl(ziel, 'google_maps'))}
    >
      Navigation starten
    </button>
  );
}

/**
 * Der ganze Tag in Terminreihenfolge.
 *
 * Reicht das Wegpunktlimit der Ziel-App nicht, entstehen mehrere Abschnitte -
 * dann steht je Abschnitt eine eigene Schaltfläche, statt dass still Stopps
 * verloren gehen. Wer keinen navigierbaren Stopp hat, sieht gar nichts.
 */
export function NavigationFuerDenTag({ termine }: { termine: readonly Besuchsadresse[] }) {
  const ziele = termine
    .map(navigationsZiel)
    .filter((ziel): ziel is NonNullable<typeof ziel> => ziel !== null);

  if (ziele.length === 0) return null;

  const abschnitte = buildNavigationDayUrls(ziele, 'google_maps');

  return (
    <div className="flex flex-wrap gap-2">
      {abschnitte.map((url, index) => (
        <button key={url} type="button" className={knopf} onClick={() => navigationOeffnen(url)}>
          {abschnitte.length === 1
            ? `Ganzer Tag (${ziele.length} ${ziele.length === 1 ? 'Stopp' : 'Stopps'})`
            : `Ganzer Tag – Abschnitt ${index + 1} von ${abschnitte.length}`}
        </button>
      ))}
    </div>
  );
}
