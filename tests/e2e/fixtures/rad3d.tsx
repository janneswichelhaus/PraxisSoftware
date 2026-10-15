import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { BikeModel3D } from '@/features/fleet/bike3d/BikeModel3D';
import type { BikeMarker, BikePick } from '@/features/fleet/bike3d/zones';

/**
 * Prüfseite des 3D-Rads: drei Stellen aus dem Entwurf „Stellen am Rad“
 * (Handoff Lastenrad 3D, Abschnitt 4), das letzte Antippen als Text.
 * `?hoehe=` setzt die Höhe des Betrachters.
 */

const STELLEN: BikeMarker[] = [
  { id: 's1', zone: 'riemen', point: [-0.55, 0.397, 0.09], severity: 'problem', number: 1 },
  { id: 's2', zone: 'bremse-vorne', point: [1.05, 0.31, -0.06], severity: 'problem', number: 2 },
  {
    id: 's3',
    zone: 'reifen-hinten',
    point: [-1.151, 0.119, 0.027],
    severity: 'beobachten',
    number: 3,
  },
];

function Seite() {
  const hoehe = Number(new URLSearchParams(window.location.search).get('hoehe') ?? 340);
  const [treffer, setTreffer] = useState<BikePick | null>(null);
  const [fokus, setFokus] = useState<{ zones: string[]; token: number } | null>(null);
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <BikeModel3D
        hoehe={hoehe}
        markers={STELLEN}
        activeMarkerId={treffer?.markerId ?? null}
        highlight={treffer?.zone ? [treffer.zone] : []}
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
