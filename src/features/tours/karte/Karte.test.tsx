import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
  attributionControl?: false | { customAttribution?: string };
  transformRequest?: (url: string) => { url: string; headers?: Record<string, string> };
  minZoom?: number;
  maxZoom?: number;
  locale?: Record<string, string>;
}

const karten: FakeKarte[] = [];
const marker: FakeMarker[] = [];

/** Die Quellenangabe von MapLibre, so weit die Komponente sie braucht. */
class FakeQuellenangabe {
  readonly optionen: { customAttribution?: string };

  constructor(optionen: { customAttribution?: string } = {}) {
    this.optionen = optionen;
  }
}

class FakeKarte {
  readonly optionen: KartenOptionen;
  readonly bedienelemente: unknown[] = [];
  /** Was der Style ueber seine Quellen sagt, und was die geladene Quelle sagt. */
  styleQuellen: Record<string, { attribution?: string }> = {};
  geladeneQuellen: Record<string, { attribution?: string }> = {};
  /** Welche Ebenen welche Quelle benutzen - danach richtet sich die Anzeige. */
  styleEbenen: { id: string; source?: string }[] = [];
  /** Wie bei MapLibre: Die Komponente meldet sich fuer Ereignisse an. */
  readonly melder = new Map<string, (() => void)[]>();
  ausschnitt: [[number, number], [number, number]] | null = null;
  entfernt = false;
  /** Ob der Style steht. MapLibre nimmt vorher keine Ebene an. */
  styleGeladen = false;
  /** Was die Komponente selbst angelegt hat - die Routenebene aus MAP-003b. */
  readonly eigeneQuellen = new Map<string, FakeQuelle>();
  readonly eigeneEbenen = new Map<string, FakeEbene>();

  constructor(optionen: KartenOptionen) {
    this.optionen = optionen;
    karten.push(this);
  }

  addControl(bedienelement: unknown) {
    this.bedienelemente.push(bedienelement);
  }

  on(ereignis: string, melder: () => void) {
    this.melder.set(ereignis, [...(this.melder.get(ereignis) ?? []), melder]);
  }

  off(ereignis: string, melder: () => void) {
    this.melder.set(
      ereignis,
      (this.melder.get(ereignis) ?? []).filter((einer) => einer !== melder),
    );
  }

  isStyleLoaded() {
    return this.styleGeladen;
  }

  addSource(kennung: string, spezifikation: { data: unknown }) {
    this.eigeneQuellen.set(kennung, new FakeQuelle(spezifikation.data));
  }

  addLayer(ebene: FakeEbene) {
    this.eigeneEbenen.set(ebene.id, ebene);
  }

  getLayer(kennung: string) {
    return this.eigeneEbenen.get(kennung);
  }

  removeLayer(kennung: string) {
    this.eigeneEbenen.delete(kennung);
  }

  removeSource(kennung: string) {
    this.eigeneQuellen.delete(kennung);
  }

  /** Nur im Test: loest aus, was MapLibre im Browser meldet. */
  ausloesen(ereignis: string) {
    act(() => {
      for (const melder of this.melder.get(ereignis) ?? []) melder();
    });
  }

  getStyle() {
    return { sources: this.styleQuellen, layers: this.styleEbenen };
  }

  getSource(kennung: string) {
    return this.eigeneQuellen.get(kennung) ?? this.geladeneQuellen[kennung];
  }

  /** Die Quellenangabe, die nach dem Laden dazugekommen ist. */
  quellenangabe(): FakeQuellenangabe | undefined {
    return this.bedienelemente.find(
      (eines): eines is FakeQuellenangabe => eines instanceof FakeQuellenangabe,
    );
  }

  fitBounds(ausschnitt: [[number, number], [number, number]]) {
    this.ausschnitt = ausschnitt;
  }

  remove() {
    this.entfernt = true;
  }
}

/** Eine GeoJSON-Quelle, so weit die Komponente sie braucht. */
class FakeQuelle {
  daten: unknown;

  constructor(daten: unknown) {
    this.daten = daten;
  }

  setData(daten: unknown) {
    this.daten = daten;
  }
}

interface FakeEbene {
  id: string;
  type: string;
  source: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
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
  AttributionControl: FakeQuellenangabe,
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

/** Die eine Karte, die entstanden sein muss - sonst prueft der Test nichts. */
function angelegteKarte(): FakeKarte {
  const karte = karten[0];
  if (karte === undefined) throw new Error('Es wurde keine Karte angelegt.');
  return karte;
}

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

  it('uebernimmt Style und Zoomgrenzen aus der Konfiguration', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);

    const optionen = karten[0]?.optionen;
    expect(optionen?.style).toBe(KONFIGURATION.styleUrl);
    expect(optionen?.minZoom).toBe(0);
    expect(optionen?.maxZoom).toBe(17);
    expect(optionen?.locale?.['Map.Title']).toBe('Karte');
  });

  it('zeigt die eigene Quellenangabe, wenn der Style keine nennt (BEF-022)', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);

    // Vor dem Laden steht nichts - die Frage laesst sich erst danach
    // beantworten.
    expect(karten[0]?.optionen.attributionControl).toBe(false);
    expect(karten[0]?.quellenangabe()).toBeUndefined();

    karten[0]?.ausloesen('load');

    expect(karten[0]?.quellenangabe()?.optionen.customAttribution).toBe(KONFIGURATION.attribution);
  });

  it('haelt sich zurueck, wenn der Style seine Quelle selbst nennt (BEF-022)', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);
    const karte = angelegteKarte();

    // Genau der Fall des Anbieters: Die geladene Quelle bringt ihre Angabe
    // mit. Eine zweite danebenzusetzen ergaebe dieselbe Aussage zweimal.
    karte.styleQuellen = { basis: {} };
    karte.geladeneQuellen = { basis: { attribution: '© Quelle aus dem Style' } };
    karte.styleEbenen = [{ id: 'strassen', source: 'basis' }];
    karte.ausloesen('load');

    expect(karte.quellenangabe()).toBeDefined();
    expect(karte.quellenangabe()?.optionen.customAttribution).toBeUndefined();
  });

  it('erkennt die Quelle auch, wenn erst der Style sie beschreibt (BEF-022)', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);
    const karte = angelegteKarte();

    // Manche Styles tragen die Angabe direkt bei der Quelle, ohne TileJSON.
    karte.styleQuellen = { basis: { attribution: '© Quelle aus dem Style' } };
    karte.styleEbenen = [{ id: 'strassen', source: 'basis' }];
    karte.ausloesen('load');

    expect(karte.quellenangabe()?.optionen.customAttribution).toBeUndefined();
  });

  it('springt ein, wenn keine Ebene die Quelle mit der Angabe benutzt (BEF-022)', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(1)} beschriftung="Karte" />);
    const karte = angelegteKarte();

    // MapLibre zeigt die Angabe einer Quelle nur, wenn eine Ebene sie
    // benutzt. Wer hier blosses Vorhandensein genuegen liesse, legte die
    // eigene Angabe still - und die Karte stuende ganz ohne Quelle da.
    karte.styleQuellen = { ungenutzt: { attribution: '© Niemand sieht mich' } };
    karte.styleEbenen = [{ id: 'hintergrund' }];
    karte.ausloesen('load');

    expect(karte.quellenangabe()?.optionen.customAttribution).toBe(KONFIGURATION.attribution);
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

  it('sagt es, wenn kein Kartenmaterial ankommt (BEF-021)', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" />);

    const hinweis = /Kartenmaterial konnte nicht geladen werden/;
    expect(screen.queryByText(hinweis)).not.toBeInTheDocument();

    // Genau das passierte im Browser: Der Style kam nicht an, die Marker
    // standen trotzdem - und die Seite schwieg dazu.
    karten[0]?.ausloesen('error');

    expect(screen.getByText(hinweis)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('nimmt den Hinweis zurueck, sobald die Karte doch laedt', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" />);

    karten[0]?.ausloesen('error');
    karten[0]?.ausloesen('load');

    expect(
      screen.queryByText(/Kartenmaterial konnte nicht geladen werden/),
    ).not.toBeInTheDocument();
  });

  it('baut die Karte nicht neu, wenn der Aufrufer die Stoppliste neu berechnet', () => {
    const { rerender } = render(
      <Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" />,
    );
    expect(karten).toHaveLength(1);

    // Gleiche Stopps, neue Arrayidentitaet - so, wie sie bei einem Aufrufer
    // entstuende, der sie je Rendern berechnet (ab MAP-003 der Regelfall).
    // Haengt die Karte an der Liste, entsteht hier eine zweite: Kacheln neu
    // geladen, Bildausschnitt zurueckgesetzt, und im schlimmsten Fall in
    // jedem Rendern erneut.
    rerender(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" />);

    expect(karten).toHaveLength(1);
    expect(karten[0]?.entfernt).toBe(false);
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

describe('Route auf der Karte (MAP-003b)', () => {
  const LINIE = [
    { lat: 48.52, lon: 9.05 },
    { lat: 48.525, lon: 9.055 },
    { lat: 48.53, lon: 9.06 },
  ];

  beforeEach(() => {
    karten.length = 0;
    marker.length = 0;
  });

  /** Die Routenebene, wie die Komponente sie angelegt hat. */
  function routenebene(karte: FakeKarte) {
    return karte.eigeneEbenen.get('route-linie');
  }

  function routenquelle(karte: FakeKarte) {
    return karte.eigeneQuellen.get('route');
  }

  it('zeichnet die Linie erst, wenn der Style steht', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" route={LINIE} />);
    const karte = angelegteKarte();

    // Vorher nimmt MapLibre keine Ebene an - eine Karte ohne Style hat keine.
    expect(routenebene(karte)).toBeUndefined();

    karte.styleGeladen = true;
    karte.ausloesen('load');

    expect(routenebene(karte)?.type).toBe('line');
  });

  it('legt die Linie als GeoJSON in Laenge-vor-Breite ab', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" route={LINIE} />);
    const karte = angelegteKarte();
    karte.ausloesen('load');

    expect(routenquelle(karte)?.daten).toEqual({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        // Wie bei den Markern: [lon, lat]. Vertauscht laege die Route im
        // Indischen Ozean.
        coordinates: [
          [9.05, 48.52],
          [9.055, 48.525],
          [9.06, 48.53],
        ],
      },
    });
  });

  it('zeichnet in der Farbe der Marker und nicht in irgendeiner', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" route={LINIE} />);
    const karte = angelegteKarte();
    karte.ausloesen('load');

    expect(routenebene(karte)?.paint?.['line-color']).toBe('#004429');
  });

  it('haelt die Farbe mit dem Entwurfssystem zusammen', () => {
    // MapLibre liest keine CSS-Variable und kennt kein `oklch()`; die Farbe
    // steht deshalb zweimal im Baum. Aendert jemand das Token, faellt diese
    // Pruefung - und nicht erst jemandem im Browser auf, dass die Linie eine
    // andere Farbe hat als die Marker.
    const stile = readFileSync('src/index.css', 'utf8');
    expect(stile).toContain('--color-accent: oklch(34.1% 0.0781 159.2)');
  });

  it('legt ohne Route keine Ebene an', () => {
    render(<Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" />);
    const karte = angelegteKarte();
    karte.ausloesen('load');

    expect(routenebene(karte)).toBeUndefined();
    expect(routenquelle(karte)).toBeUndefined();
  });

  it('ersetzt die Linie, statt eine zweite Ebene anzulegen', () => {
    const { rerender } = render(
      <Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" route={LINIE} />,
    );
    const karte = angelegteKarte();
    karte.styleGeladen = true;
    karte.ausloesen('load');

    rerender(
      <Karte
        config={KONFIGURATION}
        stopps={stopps(3)}
        beschriftung="Karte"
        route={[...LINIE, { lat: 48.54, lon: 9.07 }]}
      />,
    );

    expect(karte.eigeneEbenen.size).toBe(1);
    const daten = routenquelle(karte)?.daten as { geometry: { coordinates: number[][] } };
    expect(daten.geometry.coordinates).toHaveLength(4);
  });

  it('raeumt die Routenebene beim Verlassen der Seite ab', () => {
    const { unmount } = render(
      <Karte config={KONFIGURATION} stopps={stopps(3)} beschriftung="Karte" route={LINIE} />,
    );
    const karte = angelegteKarte();
    karte.styleGeladen = true;
    karte.ausloesen('load');
    expect(routenebene(karte)).toBeDefined();

    unmount();

    expect(routenebene(karte)).toBeUndefined();
    expect(routenquelle(karte)).toBeUndefined();
  });
});
