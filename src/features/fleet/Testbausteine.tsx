import { useLocation } from 'react-router-dom';
import { leseMeldung } from '@/features/appointments/terminformular';
import type { BikeFocus } from './bike3d/BikeModel3D';
import type { BikeMarker, BikePick, ModelPoint } from './bike3d/zones';

/** Das Ziel eines Vorgangs im Test: Pfad, Suchteil und mitgegebene Meldung. */
export function Zielanzeige() {
  const ort = useLocation();
  return (
    <div>
      <p data-testid="ziel">{`${ort.pathname}${ort.search}`}</p>
      <p data-testid="ziel-meldung">{leseMeldung(ort.state) ?? ''}</p>
    </div>
  );
}

/**
 * Der Stellvertreter des 3D-Rads in jsdom (kein WebGL): zeigt die Nadeln als
 * Text und bietet je Bauteil einen Knopf, der wie ein Antippen am Rad wirkt.
 */
export function RadStellvertreter({
  markers,
  draft,
  highlight = [],
  focus = null,
  hinweis = '',
  onPick,
}: {
  markers: readonly BikeMarker[];
  draft?: { zone: string; point: ModelPoint | null; number: number } | null;
  highlight?: readonly string[];
  focus?: BikeFocus | null;
  hinweis?: string;
  onPick?: (hit: BikePick | null) => void;
}) {
  return (
    <div data-testid="rad3d">
      <p data-testid="hinweis">{hinweis}</p>
      <p data-testid="hervorgehoben">{highlight.join(' ')}</p>
      <p data-testid="fokus">{focus ? (focus.preset ?? focus.zones.join(' ')) : ''}</p>
      <p data-testid="nadeln">
        {markers.map((nadel) => `${nadel.number}:${nadel.zone}:${nadel.severity}`).join(' ')}
      </p>
      <p data-testid="neue-nadel">{draft ? `${draft.number}:${draft.zone}` : ''}</p>
      <button
        type="button"
        onClick={() => onPick?.({ zone: 'bremse-vorne', point: [1.05, 0.31, -0.06] })}
      >
        Bremse vorne antippen
      </button>
      <button type="button" onClick={() => onPick?.({ zone: 'rahmen', point: [0.1, 0.5, 0] })}>
        Rahmen antippen
      </button>
      {markers.map((nadel) => (
        <button
          key={nadel.id}
          type="button"
          onClick={() => onPick?.({ zone: nadel.zone, point: nadel.point, markerId: nadel.id })}
        >
          Nadel {nadel.number} antippen
        </button>
      ))}
    </div>
  );
}
