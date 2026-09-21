import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Nach der CSS des Renderers: Sie bringt die Bedienelemente auf Tippgröße und
// ersetzt deren Schatten durch eine Linie.
import './karte.css';
import type { MapDisplayConfig, MapOverlayStop } from '@/lib/location/contract';

/**
 * Eine Karte mit eigenen, nummerierten Stopps (MAP-002, ADR-019).
 *
 * Die Komponente kennt den Kartendienst nicht. Sie bekommt eine
 * `MapDisplayConfig` - Style-URL, Quellenangabe, Autorisierungs-Hook - und
 * eine Liste von Stopps, beides aus `src/lib/location/contract.ts`. Wer die
 * Kacheln liefert, steht ausschließlich im Adapter; fällt der Anbieter am Gate
 * aus ADR-019 Punkt 9 durch, bleibt diese Datei unverändert.
 *
 * **Die Stopps verlassen den Browser nicht.** Marker und Nummern sind eigene
 * DOM-Knoten der Anwendung, die MapLibre nur positioniert - keine
 * Anbieter-Marker, keine Beschriftung über die Glyphen des Anbieters. Zum
 * Kartendienst gehen deshalb nur Kachelkoordinaten, Style, Sprites und
 * Glyphen (ADR-019 Punkt 12 und 15).
 *
 * Ohne Konfiguration wird **keine** Karte erzeugt und keine Anfrage gestellt.
 */

interface KarteProps {
  /** `null`, solange kein Kachelschlüssel konfiguriert ist. */
  readonly config: MapDisplayConfig | null;
  readonly stopps: readonly MapOverlayStop[];
  /** Zugänglicher Name der Karte, zum Beispiel „Karte mit acht Teststopps". */
  readonly beschriftung: string;
}

export function Karte({ config, stopps, beschriftung }: KarteProps) {
  if (config === null) return <OhneKartenmaterial />;
  return <Kartenflaeche config={config} stopps={stopps} beschriftung={beschriftung} />;
}

/**
 * Der Hinweis anstelle der Karte.
 *
 * Kein Fehlerzustand in Rot: Ein fehlender Kachelschlüssel ist ein
 * Einrichtungsschritt, kein Defekt. Der Text sagt, was zu tun ist, und nennt
 * keine internen Details (Oberflächen-Checkliste Punkt 6).
 */
function OhneKartenmaterial() {
  return (
    <div className="rounded-card border-line bg-surface-sunken border border-dashed px-4 py-8 text-center">
      <p className="text-ink text-[0.9375rem] font-medium">Kartenkacheln nicht konfiguriert</p>
      <p className="text-ink-muted mx-auto mt-1.5 max-w-prose text-sm">
        Ohne Kachelschlüssel zeigt diese Seite keine Karte und fragt keinen Kartendienst an. Der
        Schlüssel gehört als <code>VITE_PTV_TILE_API_KEY</code> in die lokale{' '}
        <code>.env.local</code> und nie ins Repository.
      </p>
    </div>
  );
}

function Kartenflaeche({
  config,
  stopps,
  beschriftung,
}: KarteProps & { config: MapDisplayConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [karte, setKarte] = useState<MapLibreMap | null>(null);

  /**
   * Je Stopp ein eigener DOM-Knoten, den React über ein Portal füllt und
   * MapLibre anschließend an die richtige Stelle hängt.
   *
   * Der Knoten entsteht außerhalb des React-Baums, weil MapLibre ihn in seinen
   * eigenen Container verschiebt. Der Container der Karte bleibt deshalb ohne
   * React-Kinder - sonst stritten sich zwei Systeme um dieselben Knoten.
   */
  const marker = useMemo(
    () => stopps.map((stopp) => ({ stopp, knoten: document.createElement('div') })),
    [stopps],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const karte = new MapLibreMap({
      container,
      style: config.styleUrl,
      // Ohne Stopps bliebe die Kamera sonst auf [0, 0] im Atlantik stehen.
      center: [mittelwert(stopps, 'lon'), mittelwert(stopps, 'lat')],
      zoom: 11,
      ...(config.minZoom === undefined ? {} : { minZoom: config.minZoom }),
      ...(config.maxZoom === undefined ? {} : { maxZoom: config.maxZoom }),
      // Lizenzbedingung des Anbieters: Die Quellenangabe ist sichtbar.
      attributionControl: { customAttribution: config.attribution },
      ...(config.authorizeRequest === undefined
        ? {}
        : { transformRequest: erlaubeAnfrage(config.authorizeRequest) }),
      // MapLibres eigene Bedienelemente sprechen sonst Englisch.
      locale: {
        'Map.Title': 'Karte',
        'NavigationControl.ZoomIn': 'Hineinzoomen',
        'NavigationControl.ZoomOut': 'Herauszoomen',
        'NavigationControl.ResetBearing': 'Nach Norden ausrichten',
        'AttributionControl.ToggleAttribution': 'Quellenangabe ein- und ausblenden',
      },
    });

    // Zoomen muss auch ohne Mausrad und ohne Geste gehen: Die Schaltflächen
    // sind mit der Tastatur erreichbar (Oberflächen-Checkliste Punkt 7).
    karte.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    setKarte(karte);

    return () => {
      karte.remove();
      setKarte(null);
    };
  }, [config, stopps]);

  useEffect(() => {
    if (karte === null) return;

    const angehaengt = marker.map(({ stopp, knoten }) =>
      new Marker({ element: knoten })
        .setLngLat([stopp.position.lon, stopp.position.lat])
        .addTo(karte),
    );

    const rechteck = umschliessendesRechteck(marker.map(({ stopp }) => stopp));
    if (rechteck !== null) {
      // `duration: 0` statt einer Animation: Beim Öffnen soll das Bild stehen,
      // nicht erst hinfliegen.
      karte.fitBounds(rechteck, { padding: 48, maxZoom: 15, duration: 0 });
    }

    return () => {
      for (const einer of angehaengt) einer.remove();
    };
  }, [karte, marker]);

  return (
    <div className="rounded-card border-line overflow-hidden border">
      <div
        ref={containerRef}
        role="region"
        aria-label={beschriftung}
        className="h-[60vh] max-h-[560px] min-h-[320px] w-full"
      />
      {marker.map(({ stopp, knoten }) =>
        createPortal(
          // Der weisse Rand hebt den Marker von der Karte ab - eine Linie,
          // kein Schatten und kein `ring-*` (das Tailwind als `box-shadow`
          // setzt): Ebenen entstehen in diesem System aus Fläche oder Linie.
          <span className="bg-accent rounded-pill flex h-7 min-w-7 items-center justify-center border-2 border-white px-1.5 text-sm font-semibold text-white">
            {stopp.label}
          </span>,
          knoten,
          stopp.label,
        ),
      )}
    </div>
  );
}

/**
 * Reicht den Autorisierungs-Hook des Adapters an MapLibre durch.
 *
 * MapLibre schickt **jede** Anfrage hier hindurch, auch solche an fremde Hosts
 * aus einem Style. Ob ein Schlüssel mitgeht, entscheidet allein der Adapter -
 * diese Komponente kennt keinen.
 */
function erlaubeAnfrage(autorisieren: NonNullable<MapDisplayConfig['authorizeRequest']>) {
  return (url: string) => {
    const angepasst = autorisieren(url);
    return { url: angepasst.url, headers: { ...angepasst.headers } };
  };
}

function mittelwert(stopps: readonly MapOverlayStop[], achse: 'lat' | 'lon'): number {
  if (stopps.length === 0) return 0;
  return stopps.reduce((summe, stopp) => summe + stopp.position[achse], 0) / stopps.length;
}

/**
 * Das kleinste Rechteck, in dem alle Stopps liegen - Grundlage für den
 * Bildausschnitt beim Laden.
 */
function umschliessendesRechteck(
  stopps: readonly MapOverlayStop[],
): [[number, number], [number, number]] | null {
  const erster = stopps[0];
  if (erster === undefined) return null;

  let west = erster.position.lon;
  let ost = erster.position.lon;
  let sued = erster.position.lat;
  let nord = erster.position.lat;

  for (const { position } of stopps) {
    west = Math.min(west, position.lon);
    ost = Math.max(ost, position.lon);
    sued = Math.min(sued, position.lat);
    nord = Math.max(nord, position.lat);
  }

  return [
    [west, sued],
    [ost, nord],
  ];
}
