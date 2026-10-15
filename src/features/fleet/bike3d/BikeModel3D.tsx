import { useEffect, useRef, useState } from 'react';
import { Segment } from '@/components/ui/Segment';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import {
  BIKE_ZONES,
  VIEW_PRESETS,
  checkItemLabels,
  isZoneKey,
  type BikeMarker,
  type BikePick,
  type ModelPoint,
  type ViewId,
  type ZoneView,
} from './zones';
import type { BikeViewer } from './viewer';

/**
 * Das 3D-Rad als Baustein: Betrachter mit Nadeln, Hinweiszeile, Zoom und
 * festen Ansichten (Handoff Lastenrad 3D, Abschnitt 4 und 5).
 *
 * three.js lädt erst hier, per dynamischem Import von `./viewer` - nie im
 * Einstiegsbundle (AC 8, ANN-556; `einstieg.test.ts` wacht). Ohne WebGL steht
 * eine Meldung da, und das Markieren geht über die Bauteil-Liste weiter, die
 * jede Seite neben dem Rad anbietet (AC 7). Das Rad ist deshalb nie der
 * einzige Weg: Bedienung ohne Ziehen und ohne Tippen auf kleine Flächen.
 */

export interface BikeFocus {
  zones: readonly string[];
  /** Blickwinkel; ohne Angabe der des Bauteils oder ein eingepasster. */
  view?: ZoneView;
  /** Neue Zahl, neuer Flug - auch zum selben Bauteil. */
  token: number;
}

type Zustand = 'laden' | 'bereit' | 'ohne';

export function BikeModel3D({
  hoehe,
  markers,
  draft = null,
  activeMarkerId = null,
  highlight = [],
  focus = null,
  hinweis = 'Ziehen dreht das Rad · Antippen wählt ein Bauteil',
  onPick,
  onUnavailable,
}: {
  /** Höhe in px (Telefon 300 bis 340, Rechner 520; Handoff Abschnitt 4). */
  hoehe: number;
  markers: readonly BikeMarker[];
  draft?: { zone: string; point: ModelPoint | null; number: number } | null;
  activeMarkerId?: string | null;
  highlight?: readonly string[];
  focus?: BikeFocus | null;
  hinweis?: string;
  onPick?: (hit: BikePick | null) => void;
  /** Meldet, dass es kein 3D-Rad gibt - die Seite stellt dann die Liste nach vorn. */
  onUnavailable?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<BikeViewer | null>(null);
  const [zustand, setZustand] = useState<Zustand>('laden');
  const [ansicht, setAnsicht] = useState<ViewId | null>('schraeg');
  const [hover, setHover] = useState<string | null>(null);
  // Die jüngsten Angaben über eine Ref: Ein neuer Rückruf oder ein neues
  // Feld mit denselben Nadeln baut den Betrachter nicht neu und setzt die
  // Nadeln nicht ein zweites Mal.
  const stand = useRef({ markers, draft, activeMarkerId, highlight, focus, onPick, onUnavailable });
  useEffect(() => {
    stand.current = { markers, draft, activeMarkerId, highlight, focus, onPick, onUnavailable };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let abgebrochen = false;
    import('./viewer')
      .then(({ BikeViewer }) => {
        if (abgebrochen) return;
        viewerRef.current = new BikeViewer(canvas, {
          onPick: (hit) => stand.current.onPick?.(hit),
          onHover: setHover,
          onViewChange: setAnsicht,
        });
        setZustand('bereit');
      })
      .catch(() => {
        // Kein WebGL, oder das Modul ließ sich nicht laden (ohne Netz und noch
        // nicht im Zwischenspeicher): Die Liste trägt weiter.
        if (abgebrochen) return;
        setZustand('ohne');
        stand.current.onUnavailable?.();
      });
    return () => {
      abgebrochen = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, []);

  const markerSchluessel = JSON.stringify([markers, draft, activeMarkerId]);
  useEffect(() => {
    const { markers: nadeln, draft: neu, activeMarkerId: aktiv } = stand.current;
    viewerRef.current?.setMarkers(nadeln, neu, aktiv);
  }, [markerSchluessel, zustand]);

  const highlightSchluessel = highlight.join(',');
  useEffect(() => {
    viewerRef.current?.setHighlight(stand.current.highlight);
  }, [highlightSchluessel, zustand]);

  const focusToken = focus?.token ?? null;
  useEffect(() => {
    const ziel = stand.current.focus;
    if (focusToken !== null && ziel && ziel.zones.length > 0 && viewerRef.current) {
      viewerRef.current.focusZones(ziel.zones, ziel.view);
      setAnsicht(null);
    }
  }, [focusToken, zustand]);

  const zone = hover && isZoneKey(hover) ? BIKE_ZONES[hover] : null;
  const info = zone
    ? `${zone.label} · ${zone.check ? `Prüfpunkt „${checkItemLabels[zone.check]}“` : 'kein eigener Prüfpunkt'}`
    : hinweis;
  const anzahl = markers.length;
  const stellen =
    anzahl === 0
      ? 'Keine Stelle markiert.'
      : anzahl === 1
        ? 'Eine Stelle markiert.'
        : `${anzahl} Stellen markiert.`;

  return (
    <div
      className="bg-surface-sunken rounded-image relative w-full overflow-hidden"
      style={{ height: hoehe }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`3D-Modell des Lastenrads Load 60 mit Riemen und Transportbox. ${stellen}`}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none"
      />
      {zustand === 'ohne' ? (
        <div className="bg-surface-sunken text-ink-muted absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
          Das 3D-Modell lässt sich in diesem Browser nicht anzeigen. Bauteile können Sie weiter über
          die Liste wählen.
        </div>
      ) : (
        <>
          <p
            className={`rounded-pill pointer-events-none absolute top-3 left-3 max-w-[calc(100%-5.5rem)] px-3 py-1.5 text-sm font-semibold ${
              zone ? 'bg-accent text-surface' : 'bg-surface/95 text-ink-muted'
            }`}
          >
            {zustand === 'laden' ? '3D-Rad wird geladen …' : info}
          </p>
          <div
            role="group"
            aria-label="Zoom"
            className="bg-surface border-line rounded-button absolute top-3 right-3 flex flex-col border"
          >
            <Symbolknopf
              beschriftung="Vergrößern"
              disabled={zustand !== 'bereit'}
              onClick={() => viewerRef.current?.zoomBy(0.8)}
            >
              <svg
                viewBox="0 0 20 20"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M10 4v12M4 10h12" />
              </svg>
            </Symbolknopf>
            <Symbolknopf
              beschriftung="Verkleinern"
              disabled={zustand !== 'bereit'}
              onClick={() => viewerRef.current?.zoomBy(1.25)}
            >
              <svg
                viewBox="0 0 20 20"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 10h12" />
              </svg>
            </Symbolknopf>
          </div>
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-center">
            <div className="bg-surface rounded-button pointer-events-auto">
              <Segment
                beschriftung="Ansicht"
                wahlen={VIEW_PRESETS.map((preset) => ({ wert: preset.id, text: preset.label }))}
                gewaehlt={ansicht}
                onWaehlen={(id) => {
                  viewerRef.current?.setView(id);
                  setAnsicht(id);
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
