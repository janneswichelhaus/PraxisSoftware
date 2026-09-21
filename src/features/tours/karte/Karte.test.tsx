import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MapDisplayConfig, MapOverlayStop } from '@/lib/location/contract';

/**
 * MapLibre braucht WebGL und einen echten Layoutbaum; beides hat jsdom nicht.
 *
 * Die Attrappe bildet deshalb genau das nach, worauf sich die Komponente
 * verlässt: Sie merkt sich die Optionen, mit denen die Karte entsteht, und
 * hängt den Markerknoten - wie MapLibre es tut - in den Container der Karte.
 * Was der echte Renderer daraus macht, prüft der Browser, nicht dieser Test.
 */
interface KartenOptionen {
  container: HTMLElement;
  style: string;
  attributionControl?: { customAttribution?: string };
  transformRequest?: (url: string) => { url: string; headers?: Record<string, string> };
  minZoom?: number;
  maxZoom?: number;
  locale?: Record<string, string>;
}

const karten: FakeKarte[] = [];
const marker: FakeMarker[] = [];

class FakeKarte {
  readonly optionen: KartenOptionen;
  readonly bedienelemente: unknown[] = [];
  ausschnitt: [[number, number], [number, number]] | null = null;
  entfernt = false;

  constructor(optionen: KartenOptionen) {
    this.optionen = optionen;
    karten.push(this);
  }

  addControl(bedienelement: unknown) {
    this.bedienelemente.push(bedienelement);
  }

  fitBounds(ausschnitt: [[number, number], [number, number]]) {
    this.ausschnitt = ausschnitt;
  }

  remove() {
    this.entfernt = true;
  }
}

class FakeMarker {
  readonly element: HTMLElement;
  position: [number, number] | null = null;

  constructor({ element }: { element: HTMLElement }) {
    this.element = element;
    marker.push(this);
  }

  setLngLat(position: [number, number]) {
    this.position = position;
    return this;
  }

  addTo(karte: FakeKarte) {
    karte.optionen.container.append(this.element);
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

const { Karte } = await import('./Karte');

const KONFIGURATION: MapDisplayConfig = {
  styleUrl: 'https://kartendienst.invalid/styles-osm/latest/standard-osm.json',
  attribution: '© Kartendienst, © OpenStreetMap-Mitwirkende',
  authorizeRequest: (url) => ({ url, headers: { ApiKey: 'test-schluessel' } }),
  minZoom: 0,
  maxZoom: 17,
};

/**
 * Feste Koordinaten statt gerechneter.
 *
 * `48.52 + 2 / 100` ergibt 48.540000000000006 - der Test praefte dann die
 * Gleitkommaarithmetik seiner eigenen Vorgabe und nicht die Komponente.
 */
const KOORDINATEN = [
  { lat: 48.52, lon: 9.05 },
  { lat: 48.53, lon: 9.06 },
  { lat: 48.54, lon: 9.07 },
  { lat: 48.55, lon: 9.08 },
  { lat: 48.51, lon: 9.04 },
  { lat: 48.5, lon: 9.03 },
  { lat: 48.56, lon: 9.09 },
  { lat: 48.49, lon: 9.02 },
] as const;

function stopps(anzahl: number): MapOverlayStop[] {
  return KOORDINATEN.slice(0, anzahl).map((position, index) => ({
    position,
    label: String(index + 1),
  }));
}

const anfragen: string[] = [];

describe('Karte', () => {
  beforeEach(() => {
    karten.length = 0;
    marker.length = 0;
    anfragen.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((eingabe: unknown) => {
        anfragen.push(String(eingabe));
        return Promise.resolve(new Response(''));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zeigt fuer n Stopps n Marker mit den Nummern 1 bis n', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(8)} beschriftung="Karte mit Teststopps" />);

    expect(marker).toHaveLength(8);
    expect(marker.map((einer) => einer.element.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    // Die Nummern stehen wirklich im Dokument und nicht nur in einem
    // losgeloesten Knoten: MapLibre haengt den Marker in die Karte.
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Karte mit Teststopps' })).toContainElement(
      screen.getByText('1'),
    );
  });

  it('setzt jeden Marker auf seine Koordinate, Laenge vor Breite', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(2)} beschriftung="Karte" />);

    // MapLibre erwartet [lon, lat]. Vertauscht laegen die Tuebinger Stopps
    // im Indischen Ozean - ein Fehler, den kein Typ faengt.
    expect(marker[0]?.position).toEqual([9.05, 48.52]);
    expect(marker[1]?.position).toEqual([9.06, 48.53]);
  });

  it('richtet den Ausschnitt beim Laden auf alle Stopps', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" />);

    expect(karten[0]?.ausschnitt).toEqual([
      [9.05, 48.52],
      [9.07, 48.54],
    ]);
  });

  it('uebernimmt Style, Quellenangabe und Zoomgrenzen aus der Konfiguration', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);

    const optionen = karten[0]?.optionen;
    expect(optionen?.style).toBe(KONFIGURATION.styleUrl);
    expect(optionen?.attributionControl?.customAttribution).toBe(KONFIGURATION.attribution);
    expect(optionen?.minZoom).toBe(0);
    expect(optionen?.maxZoom).toBe(17);
    expect(optionen?.locale?.['Map.Title']).toBe('Karte');
  });

  it('reicht die Autorisierung des Adapters durch und kennt selbst keinen Schluessel', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);

    const angepasst = karten[0]?.optionen.transformRequest?.('https://kartendienst.invalid/1/2/3');
    expect(angepasst?.headers).toEqual({ ApiKey: 'test-schluessel' });
    // Der Schluessel steht im Kopf der Anfrage, nicht in der Adresse.
    expect(angepasst?.url).toBe('https://kartendienst.invalid/1/2/3');
  });

  it('zeigt ohne Konfiguration den Hinweis und fragt keinen Kartendienst', () => {
    render(<Karte config={null} stopps={stopps(8)} beschriftung="Karte" />);

    expect(screen.getByText('Kartenkacheln nicht konfiguriert')).toBeInTheDocument();
    expect(karten).toHaveLength(0);
    expect(marker).toHaveLength(0);
    expect(anfragen).toEqual([]);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('raeumt Karte und Marker beim Verlassen der Seite ab', () => {
    const { unmount } = render(
      <Karte config={KONFIGURATION} stopps={stopps(2)} beschriftung="Karte" />,
    );

    unmount();

    expect(karten[0]?.entfernt).toBe(true);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
