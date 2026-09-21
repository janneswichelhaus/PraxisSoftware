import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import type { Routenergebnis } from '@/lib/location/route';
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
  off() {}
  /** Ohne geladenen Style legt die Komponente keine Routenebene an. */
  isStyleLoaded() {
    return false;
  }
  getSource() {
    return undefined;
  }
  getLayer() {
    return undefined;
  }
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

/**
 * Der Routenabruf ist hier ausgetauscht.
 *
 * Die Seite soll geprueft werden, nicht die Function: Ob der Aufruf stimmt,
 * steht in `src/lib/location/route.test.ts`, und was die Function antwortet,
 * in `supabase/functions/location-provider/`. Hier zaehlt, dass die Seite das
 * Ergebnis zeigt - und dass sie ohne Ergebnis nichts behauptet.
 */
const { useRoute } = vi.hoisted(() => ({ useRoute: vi.fn() }));
vi.mock('@/lib/location/route', () => ({ useRoute }));

const { KartePage } = await import('./KartePage');

const ROUTE: Routenergebnis = {
  ok: true,
  value: {
    route: {
      distanceMeters: 12_449,
      durationSeconds: 2880,
      legs: [
        { distanceMeters: 3150, durationSeconds: 762 },
        { distanceMeters: 9299, durationSeconds: 2118 },
      ],
      geometry: TESTSTOPPS.map((stopp) => stopp.position),
    },
    quelle: 'anbieter',
  },
};

/** Das Lastenradprofil antwortet mit eigenen Zahlen - sonst pruefte nichts den Vergleich. */
const LASTENRAD: Routenergebnis = {
  ok: true,
  value: {
    route: {
      distanceMeters: 12_949,
      durationSeconds: 3300,
      legs: [{ distanceMeters: 12_949, durationSeconds: 3300 }],
      geometry: TESTSTOPPS.map((stopp) => stopp.position),
    },
    quelle: 'anbieter',
  },
};

function antwortet(ergebnis: Routenergebnis | undefined, laedt = false) {
  useRoute.mockImplementation((_wegpunkte: unknown, profil: string) =>
    profil === 'cargo_bicycle'
      ? { data: LASTENRAD, isFetching: false, refetch: vi.fn() }
      : { data: ergebnis, isFetching: laedt, refetch: vi.fn() },
  );
}

describe('KartePage', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    useRoute.mockReset();
    antwortet(ROUTE);
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

  it('sagt, dass die Koordinaten fuer die Route hinausgehen', () => {
    // Seit MAP-003 stimmt „zum Kartendienst gehen nur Kacheln" nicht mehr.
    // Ein Banner, der das verschweigt, waere die Unwahrheit auf der Seite,
    // die ihn traegt (ehrlichkeit.test.tsx).
    renderWithProviders(<KartePage />, '/touren/karte');

    expect(
      screen.getByText(/Koordinaten über den eigenen Server an den Kartendienst/),
    ).toBeInTheDocument();
  });

  it('zeigt jeden Stopp auch als Liste, nicht nur auf der Karte', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    const liste = screen.getByRole('list', { name: 'Die Stopps' });
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

  it('fragt beide Fahrprofile auf denselben Stopps ab (MAP-003c)', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    const profile = useRoute.mock.calls.map((aufruf) => aufruf[1] as string);
    expect(profile).toEqual(expect.arrayContaining(['bicycle', 'cargo_bicycle']));

    const wegpunkte = useRoute.mock.calls[0]?.[0] as unknown[];
    expect(wegpunkte).toEqual(TESTSTOPPS.map((stopp) => stopp.position));
  });

  it('zeigt Strecke und Fahrzeit der Route', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    expect(screen.getByText(/12,4 km/)).toBeInTheDocument();
    expect(screen.getByText(/48 Min\./)).toBeInTheDocument();
  });

  it('zeigt die Stopps auch dann, wenn keine Route kommt', () => {
    antwortet({ ok: false, error: { code: 'not_configured', message: 'x' } });

    renderWithProviders(<KartePage />, '/touren/karte');

    expect(screen.getByText('Kein Kartendienst eingerichtet')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Die Stopps' })).getAllByRole('listitem'),
    ).toHaveLength(TESTSTOPPS.length);
  });
});
