import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Segment } from '@/components/ui/Segment';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { BIKE_ZONES, checkItemLabels, isZoneKey } from '../zones';
import {
  VIEW_PRESETS,
  type BikeMarker,
  type BikePick,
  type ModelPoint,
  type ViewId,
  type ZoneView,
} from './ansichten';
import type { BikeViewer } from './viewer';

/**
 * Das 3D-Rad als Baustein (ANN-868); three.js lädt erst hier, nie im Einstiegsbundle (ANN-556).
 * Ohne WebGL geht das Markieren über die Bauteil-Liste weiter: Das Rad ist nie der einzige Weg.
 * Nur waagrechtes Ziehen dreht (`touch-pan-y`), sonst finge das Rad am Telefon den Daumen ab.
 */

/** Höhe von Hinweiszeile (oben) und Ansichtswechsel (unten) samt Abstand, in px. */
const BEDIENRAND = 104;
/** Ohne Ansichtswechsel bleibt nur die Hinweiszeile oben. */
const BEDIENRAND_OHNE_ANSICHTEN = 56;

export interface BikeFocus {
  /** Die Bauteile, zu denen die Kamera fliegt; leer mit `preset` für eine feste Ansicht. */
  zones: readonly string[];
  /** Blickwinkel; ohne Angabe der des Bauteils oder ein eingepasster. */
  view?: ZoneView;
  /** Eine der festen Ansichten statt der Bauteile, etwa „Schräg“ für den Überblick. */
  preset?: ViewId;
  /** Neue Zahl, neuer Flug - auch zum selben Bauteil. */
  token: number;
}

/**
 * Das Modul kam nicht an (ohne Netz oder weil eine vor der Auslieferung geöffnete Seite eine
 * Datei sucht, die es nicht mehr gibt), oder der Browser hat kein WebGL 2. Nur im zweiten Fall
 * liegt es am Browser; im ersten hilft Neuladen.
 */
type Zustand = 'laden' | 'bereit' | 'nichtGeladen' | 'ohneWebgl';

export function BikeModel3D({
  hoehe,
  markers,
  draft = null,
  activeMarkerId = null,
  highlight = [],
  focus = null,
  hinweis = 'Ziehen dreht das Rad · Antippen wählt ein Bauteil',
  ansichten = true,
  ersatz = 'Bauteile weiter über die Liste',
  neuLaden = true,
  onPick,
  onUnavailable,
}: {
  /**
   * Höhe in px (Telefon 300 bis 340, Rechner 520; Handoff Abschnitt 4) oder
   * als CSS-Wert, etwa `100%` in der Bühne des geführten Check-Ups.
   */
  hoehe: number | string;
  markers: readonly BikeMarker[];
  draft?: { zone: string; point: ModelPoint | null; number: number } | null;
  activeMarkerId?: string | null;
  highlight?: readonly string[];
  focus?: BikeFocus | null;
  hinweis?: string;
  /**
   * Die festen Ansichten unten im Bild. Im geführten Check-Up führt die Kamera selbst; ohne
   * den Wechsel bleibt mehr vom Rad zu sehen.
   */
  ansichten?: boolean;
  /**
   * Der Weg ohne 3D-Rad, als Satz unter der Meldung. Ohne Angabe die
   * Bauteil-Liste; der geführte Check-Up geht über seine Knöpfe weiter.
   */
  ersatz?: string;
  /** „Neu laden“ anbieten; nicht mitten in einem Ablauf, den es ohne Netz verlöre. */
  neuLaden?: boolean;
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
  const stand = useRef({
    markers,
    draft,
    activeMarkerId,
    highlight,
    focus,
    ansichten,
    onPick,
    onUnavailable,
  });
  useEffect(() => {
    stand.current = {
      markers,
      draft,
      activeMarkerId,
      highlight,
      focus,
      ansichten,
      onPick,
      onUnavailable,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let abgebrochen = false;
    const ohne = (grund: Zustand) => {
      // Die Liste trägt weiter.
      if (abgebrochen) return;
      setZustand(grund);
      stand.current.onUnavailable?.();
    };
    import('./viewer').then(
      ({ BikeViewer }) => {
        if (abgebrochen) return;
        BikeViewer.create(canvas, {
          onPick: (hit) => stand.current.onPick?.(hit),
          onHover: setHover,
          onViewChange: setAnsicht,
          // Hinweis oben und Ansichtswechsel unten liegen über dem Bild;
          // ein Wechsel von `ansichten` passt nur den Rand an (unten).
          rand: stand.current.ansichten ? BEDIENRAND : BEDIENRAND_OHNE_ANSICHTEN,
        }).then(
          (viewer) => {
            // Verlassen, bevor das Rad stand: gleich wieder freigeben.
            if (abgebrochen) {
              viewer.dispose();
              return;
            }
            viewerRef.current = viewer;
            setZustand('bereit');
          },
          // three.js braucht WebGL 2; ohne Kontext wirft der Renderer.
          () => ohne('ohneWebgl'),
        );
      },
      // Ohne Netz und noch nicht im Zwischenspeicher, oder die Datei des
      // Moduls gibt es nach einer Auslieferung nicht mehr.
      () => ohne('nichtGeladen'),
    );
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

  useEffect(() => {
    viewerRef.current?.setRand(ansichten ? BEDIENRAND : BEDIENRAND_OHNE_ANSICHTEN);
  }, [ansichten, zustand]);

  const focusToken = focus?.token ?? null;
  useEffect(() => {
    const ziel = stand.current.focus;
    if (focusToken === null || !ziel || !viewerRef.current) return;
    if (ziel.preset) {
      viewerRef.current.setView(ziel.preset);
      setAnsicht(ziel.preset);
    } else if (ziel.zones.length > 0) {
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
        className="absolute inset-0 block h-full w-full cursor-grab touch-pan-y"
      />
      {/* Ohne 3D-Rad die Zustände als Bausteine: Fehlt WebGL, ist das ein Leerzustand; kam
          das Modul nicht an, ein Fehler mit dem Weg hinaus. */}
      {zustand === 'ohneWebgl' ? (
        <div className="bg-surface-sunken absolute inset-0 flex items-center justify-center p-4">
          <EmptyState title="Kein 3D in diesem Browser (WebGL 2 fehlt)" description={ersatz} />
        </div>
      ) : zustand === 'nichtGeladen' ? (
        <div className="bg-surface-sunken absolute inset-0 flex flex-col justify-center gap-3 p-4">
          <ErrorState title="3D-Modell nicht geladen" description={ersatz} />
          {/* Neu laden holt den aktuellen Stand; ungespeicherte Eingaben
              schützt die Seite selbst (Textverlustschutz). */}
          {neuLaden ? (
            <div>
              <Button
                variant="secondary"
                groesse="kompakt"
                onClick={() => window.location.reload()}
              >
                Neu laden
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* Links neben den Zoomknöpfen (44 px und Rand), in Tinte: Unterwegs liest man in der Sonne. */}
          <div className="pointer-events-none absolute top-3 right-16 left-3">
            <p
              className={`rounded-pill inline-block px-3 py-1.5 text-sm font-semibold ${
                zone ? 'bg-accent text-surface' : 'bg-surface/95 text-ink'
              }`}
            >
              {zustand === 'laden' ? '3D-Rad wird geladen …' : info}
            </p>
          </div>
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
          {ansichten ? (
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
          ) : null}
        </>
      )}
    </div>
  );
}
