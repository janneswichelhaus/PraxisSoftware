import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import type { Matrixergebnis } from '@/lib/location/matrix';
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

/** Dasselbe für die Matrix aus MAP-004: geprüft wird die Seite, nicht der Abruf. */
const { useMatrix } = vi.hoisted(() => ({ useMatrix: vi.fn() }));
vi.mock('@/lib/location/matrix', () => ({ useMatrix, MAX_MATRIX_PUNKTE: 25 }));

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

/**
 * Eine Matrix über alle acht Stopps: Fahrzeit gleich Abstand der Nummern in
 * Minuten. Erfunden wie die Stopps - geprüft wird, dass die Seite zeigt, was
 * sie bekommt, nicht ob die Zahl stimmt.
 */
const MATRIX: Matrixergebnis = {
  ok: true,
  value: {
    matrix: {
      durationsSeconds: TESTSTOPPS.map((_, zeile) =>
        TESTSTOPPS.map((__, spalte) => Math.abs(zeile - spalte) * 60),
      ),
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
    useMatrix.mockReset();
    useMatrix.mockReturnValue({ data: MATRIX, isFetching: false, refetch: vi.fn() });
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
    expect(within(liste).getByText('48,5216 · 9,0576')).toBeInTheDocument();
  });

  it('traegt den Handoff an der Stoppliste, ohne vorab eine URL zu bauen', () => {
    // MAP-005b: Der Knopf steht an seinem Stopp, das Ziel nirgends. Was er
    // baut, prueft `NavigationHandoff.test.tsx`; hier zaehlt, dass die Seite
    // ihn traegt und dass vor dem Tippen nichts im Quelltext steht.
    const { container } = renderWithProviders(<KartePage />, '/touren/karte');

    const liste = screen.getByRole('list', { name: 'Die Stopps' });
    expect(
      within(liste).getByRole('button', { name: 'Navigation zu Stopp 1 starten' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/übergibt eine erfundene Koordinate/)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('google.com/maps');

    // Und kein zweiter Abschnitt daneben: die Stopps stehen genau einmal.
    expect(screen.getAllByRole('list', { name: 'Die Stopps' })).toHaveLength(1);
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

    expect(screen.getAllByText('Kein Kartendienst eingerichtet').length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('list', { name: 'Die Stopps' })).getAllByRole('listitem'),
    ).toHaveLength(TESTSTOPPS.length);
  });

  it('fragt die Matrix ueber dieselben Stopps ab - nur im gewaehlten Profil', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    expect(useMatrix).toHaveBeenCalledTimes(1);
    const [starts, ziele, profil] = useMatrix.mock.calls[0] as [unknown[], unknown[], string];
    const punkte = TESTSTOPPS.map((stopp) => stopp.position);
    expect(starts).toEqual(punkte);
    expect(ziele).toEqual(punkte);
    // Kein zweiter Abruf zum Vergleich: Wo eine Planung ein Profil braucht,
    // ist es das gewaehlte (MAP-003c, entschieden 2026-09-22).
    expect(profil).toBe('cargo_bicycle');
  });

  it('zeigt die Fahrzeiten als Tabelle mit einer Zeile je Stopp', () => {
    renderWithProviders(<KartePage />, '/touren/karte');

    const tabelle = screen.getByRole('table');
    // Kopfzeile plus acht Stopps.
    expect(within(tabelle).getAllByRole('row')).toHaveLength(TESTSTOPPS.length + 1);
    expect(within(tabelle).getByRole('cell', { name: /von 1 nach 8/ })).toHaveTextContent('7 Min.');
  });

  it('zeigt die Stopps auch dann, wenn keine Matrix kommt', () => {
    useMatrix.mockReturnValue({
      data: { ok: false, error: { code: 'rate_limited', message: 'x' } },
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<KartePage />, '/touren/karte');

    expect(screen.getByText('Kontingent erschöpft')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Die Stopps' })).getAllByRole('listitem'),
    ).toHaveLength(TESTSTOPPS.length);
    // Die Route bleibt davon unberuehrt: zwei Abrufe, zwei Zustaende.
    expect(screen.getByText(/12,4 km/)).toBeInTheDocument();
  });
});
