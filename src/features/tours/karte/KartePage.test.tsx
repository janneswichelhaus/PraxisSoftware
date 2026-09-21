import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { TESTSTOPPS } from './teststopps';

/** Wie in `Karte.test.tsx`: MapLibre braucht WebGL, jsdom hat keins. */
class FakeKarte {
  readonly container: HTMLElement;

  constructor(optionen: { container: HTMLElement }) {
    this.container = optionen.container;
  }

  addControl() {}
  fitBounds() {}
  /** Die Komponente meldet sich fuer `error` und `load` an; hier passiert nichts. */
  on() {}
  remove() {}
}

class FakeMarker {
  readonly element: HTMLElement;

  constructor(optionen: { element: HTMLElement }) {
    this.element = optionen.element;
  }

  setLngLat() {
    return this;
  }

  addTo(karte: FakeKarte) {
    karte.container.append(this.element);
    return this;
  }

  remove() {
    this.element.remove();
    return this;
  }
}

vi.mock('maplibre-gl', () => ({
  Map: FakeKarte,
  Marker: FakeMarker,
  NavigationControl: class {},
}));

const { KartePage } = await import('./KartePage');

describe('KartePage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ist als Vorschau ohne Patientendaten gekennzeichnet', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    expect(screen.getByText('Vorschau')).toBeInTheDocument();
    expect(screen.getByText(/Keine Adresse, kein Termin, keine Person/)).toBeInTheDocument();
    // Das Gate aus ADR-019 steht auf der Seite und nicht nur in den Akten.
    expect(
      screen.getByText('Der Kartendienst ist geprüft, aber nicht freigegeben'),
    ).toBeInTheDocument();
  });

  it('zeigt jeden Stopp auch als Liste, nicht nur auf der Karte', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    const liste = screen.getByRole('list');
    expect(within(liste).getAllByRole('listitem')).toHaveLength(TESTSTOPPS.length);
    expect(within(liste).getByText(/48,5216 Nord · 9,0576 Ost/)).toBeInTheDocument();
  });

  it('zeigt ohne Kachelschluessel den Hinweis statt einer Karte', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    expect(screen.getByText('Kartenkacheln nicht konfiguriert')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('zeigt mit Kachelschluessel die Karte mit allen Stopps', () => {
    vi.stubEnv('VITE_PTV_TILE_API_KEY', 'kachelschluessel-synthetisch');

    renderWithProviders(<KartePage />, '/touren/karte');

    const karte = screen.getByRole('region', {
      name: `Karte mit ${TESTSTOPPS.length} synthetischen Teststopps in Tübingen`,
    });
    expect(karte).toBeInTheDocument();
    expect(screen.queryByText('Kartenkacheln nicht konfiguriert')).not.toBeInTheDocument();
    for (const stopp of TESTSTOPPS) {
      expect(within(karte).getByText(stopp.label)).toBeInTheDocument();
    }
  });
});
