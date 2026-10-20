import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { Schieberegler } from '@/components/ui/Schieberegler';
import {
  VERGROESSERUNG_MAX,
  ausschnitt,
  begrenzt,
  type Ausschnittstand,
  type Foto,
} from './profilbild';

/** Kantenlänge der Ansicht in CSS-Pixeln (`size-64`) - passt bei 375 px. */
const ANSICHT_PX = 256;
/** Ein Pfeiltastendruck verschiebt um so viele Pixel der Ansicht. */
const TASTENSCHRITT_PX = 16;
/** Ein Tipp auf „−“ oder „+“ ändert die Vergrößerung um so viel. */
const ZOOMSCHRITT = 0.25;

const faktor = (wert: number) =>
  `${wert.toLocaleString('de-DE', { maximumFractionDigits: 2 })}-fach`;

/**
 * Den Ausschnitt eines Profilbilds wählen (BEF-190, ADR-017 Fassung 11): Das Foto liegt in einem Quadrat, der Kreis zeigt, was im Chat
 * zu sehen sein wird. Ziehen verschiebt, der Regler vergrößert - am Telefon
 * mit einem Daumen. Ohne Eingriff bleibt der feste Ausschnitt von bisher
 * (Mitte, beim Hochformat oben).
 *
 * Gerechnet wird erst beim Speichern, auf dem Gerät (`rechneProfilbild`);
 * hier wird nur gezeigt. Die Ansicht nimmt den Fokus: Pfeiltasten
 * verschieben, Plus und Minus vergrößern. `touch-none` mit Absicht: Auf dem
 * Quadrat zieht der Daumen das Bild in beide Richtungen, statt die Seite zu
 * rollen.
 */
export function ProfilbildZuschnitt({
  foto,
  stand,
  onStand,
}: {
  foto: Foto;
  stand: Ausschnittstand;
  onStand: (neu: Ausschnittstand) => void;
}) {
  const ziehen = useRef<{ zeiger: number; x: number; y: number } | null>(null);
  const { x, y, seite } = ausschnitt(foto.breite, foto.hoehe, stand);
  const massstab = ANSICHT_PX / seite;

  const setze = (neu: Ausschnittstand) => onStand(begrenzt(foto.breite, foto.hoehe, neu));
  // Pixel der Ansicht in Bildpunkte des Fotos: Wer das Bild nach rechts
  // zieht, holt Linkes ins Quadrat - die Mitte wandert nach links.
  const verschiebe = (dx: number, dy: number) =>
    setze({ ...stand, mitteX: stand.mitteX - dx / massstab, mitteY: stand.mitteY - dy / massstab });
  const vergroessere = (wert: number) => setze({ ...stand, vergroesserung: wert });

  const runter = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    ziehen.current = { zeiger: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const bewegt = (event: PointerEvent<HTMLDivElement>) => {
    const z = ziehen.current;
    if (!z || z.zeiger !== event.pointerId) return;
    verschiebe(event.clientX - z.x, event.clientY - z.y);
    ziehen.current = { ...z, x: event.clientX, y: event.clientY };
  };
  const los = () => {
    ziehen.current = null;
  };

  const taste = (event: KeyboardEvent<HTMLDivElement>) => {
    const schritte: Record<string, () => void> = {
      ArrowLeft: () => verschiebe(TASTENSCHRITT_PX, 0),
      ArrowRight: () => verschiebe(-TASTENSCHRITT_PX, 0),
      ArrowUp: () => verschiebe(0, TASTENSCHRITT_PX),
      ArrowDown: () => verschiebe(0, -TASTENSCHRITT_PX),
      '+': () => vergroessere(stand.vergroesserung + ZOOMSCHRITT),
      '-': () => vergroessere(stand.vergroesserung - ZOOMSCHRITT),
    };
    const schritt = schritte[event.key];
    if (!schritt) return;
    event.preventDefault();
    schritt();
  };

  return (
    <div className="flex w-64 max-w-full flex-col gap-3">
      <div
        role="img"
        aria-label="Ausschnitt des Profilbilds – ziehen oder mit den Pfeiltasten verschieben"
        tabIndex={0}
        data-zuschnitt
        className="bg-surface-sunken rounded-image relative size-64 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={runter}
        onPointerMove={bewegt}
        onPointerUp={los}
        onPointerCancel={los}
        onKeyDown={taste}
      >
        <img
          src={foto.adresse}
          alt=""
          draggable={false}
          className="pointer-events-none absolute top-0 left-0 max-w-none"
          style={{
            width: foto.breite * massstab,
            height: foto.hoehe * massstab,
            transform: `translate(${-x * massstab}px, ${-y * massstab}px)`,
          }}
        />
        {/* Außerhalb des Kreises abgedunkelt: so erscheint das Bild im Chat. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <path
            fillRule="evenodd"
            d="M0 0H100V100H0Z M50 0A50 50 0 1 0 50 100A50 50 0 1 0 50 0Z"
            className="fill-ink/45"
          />
          {/* Der Rand des Kreises, auf jedem Foto zu sehen. */}
          <circle
            cx="50"
            cy="50"
            r="49.5"
            className="stroke-surface fill-none"
            strokeWidth="0.75"
          />
        </svg>
      </div>
      <Schieberegler
        beschriftung="Vergrößern"
        wert={stand.vergroesserung}
        min={1}
        max={VERGROESSERUNG_MAX}
        schritt={0.05}
        knopfschritt={ZOOMSCHRITT}
        wertText={faktor}
        weniger="Weniger vergrößern"
        mehr="Mehr vergrößern"
        onAendern={vergroessere}
      />
    </div>
  );
}
