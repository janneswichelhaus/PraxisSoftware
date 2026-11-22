import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { BikeModel3D } from '@/features/fleet/bike3d/BikeModel3D';
import {
  CHECK_ITEM_VIEWS,
  type BikeMarker,
  type BikePick,
  type ZoneView,
} from '@/features/fleet/bike3d/ansichten';
import { CHECK_ITEMS, zonesOfCheckItem } from '@/features/fleet/zones';

/**
 * Prüfseite des 3D-Rads: drei Stellen aus dem Entwurf „Stellen am Rad“
 * (Handoff Lastenrad 3D, Abschnitt 4), das letzte Antippen als Text.
 * `?hoehe=` setzt die Höhe des Betrachters, `?zeige=a,b` leuchtet und zeigt
 * Bauteile, `?punkt=` die Bauteile eines Prüfpunkts aus dessen Blickwinkel.
 */

// Ohne Punkt: Gespeichert wird nur das Bauteil, die Nadel steht in dessen Mitte (ANN-871).
const STELLEN: BikeMarker[] = [
  { id: 's1', zone: 'riemen', point: null, severity: 'problem', number: 1 },
  { id: 's2', zone: 'bremse-vorne', point: null, severity: 'problem', number: 2 },
  { id: 's3', zone: 'reifen-hinten', point: null, severity: 'beobachten', number: 3 },
];

function startfokus(): { zones: string[]; view?: ZoneView; token: number } | null {
  const angaben = new URLSearchParams(window.location.search);
  const punkt = CHECK_ITEMS.find((item) => item.key === angaben.get('punkt'));
  if (punkt) {
    const view = CHECK_ITEM_VIEWS[punkt.key];
    return { zones: zonesOfCheckItem(punkt.key), ...(view ? { view } : {}), token: 1 };
  }
  const zeige = angaben.get('zeige');
  return zeige ? { zones: zeige.split(','), token: 1 } : null;
}

export function Seite() {
  const hoehe = Number(new URLSearchParams(window.location.search).get('hoehe') ?? 340);
  const [treffer, setTreffer] = useState<BikePick | null>(null);
  const [fokus, setFokus] = useState(startfokus);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <BikeModel3D
        hoehe={hoehe}
        markers={STELLEN}
        activeMarkerId={treffer?.markerId ?? null}
        highlight={treffer?.zone ? [treffer.zone] : (fokus?.zones ?? [])}
        focus={fokus}
        onPick={setTreffer}
      />
      <p data-testid="treffer" className="mt-4">
        {treffer
          ? `${treffer.zone}${treffer.markerId ? ` · ${treffer.markerId}` : ''}`
          : 'kein Treffer'}
      </p>
      <button
        type="button"
        className="mt-2 underline"
        onClick={() => setFokus((v) => ({ zones: ['bremse-vorne'], token: (v?.token ?? 0) + 1 }))}
      >
        Bremse vorne zeigen
      </button>
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (wurzel) {
  createRoot(wurzel).render(
    <StrictMode>
      <Seite />
    </StrictMode>,
  );
}
