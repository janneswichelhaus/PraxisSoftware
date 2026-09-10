import {
  buildGoogleMapsDayUrls,
  buildGoogleMapsUrl,
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
 */

const knopf =
  'nicht-drucken border-line-strong bg-surface text-ink hover:bg-surface-sunken ' +
  'inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors';

/** „Navigation starten" für einen einzelnen Hausbesuch. */
export function NavigationZumTermin({ termin }: { termin: Besuchsadresse }) {
  const ziel = navigationsZiel(termin);
  if (!ziel) return null;

  return (
    <button
      type="button"
      className={knopf}
      onClick={() => navigationOeffnen(buildGoogleMapsUrl(ziel))}
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

  const abschnitte = buildGoogleMapsDayUrls(ziele);

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
