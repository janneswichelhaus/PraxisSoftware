import { describe, expect, it } from 'vitest';
import { createPtvMapDisplayConfig } from './ptv-display';
import { createMapDisplayConfig } from './display';

const SCHLUESSEL = 'kachelschluessel-synthetisch';

describe('createPtvMapDisplayConfig', () => {
  it('verwendet die OSM-Variante und liefert eine sichtbare Quellenangabe', () => {
    const config = createPtvMapDisplayConfig(SCHLUESSEL);

    // `maps/v1` liefe auf HERE-Daten und zoege einen weiteren Datenlieferanten
    // in den Datenweg (ADR-019 Punkt 7).
    expect(config.styleUrl).toContain('styles-osm');
    expect(config.styleUrl).not.toContain('/maps/v1');
    expect(config.styleUrl.startsWith('https://')).toBe(true);
    expect(config.attribution).toContain('OpenStreetMap');
  });

  it('gibt den Schluessel als Kopfzeile mit, nicht in der Adresse', () => {
    const config = createPtvMapDisplayConfig(SCHLUESSEL);
    const kachel = 'https://api.myptv.com/maps-osm/v1/vector-tiles/12/2140/1400';

    const angepasst = config.authorizeRequest?.(kachel);

    expect(angepasst?.headers).toEqual({ ApiKey: SCHLUESSEL });
    // Ein Query-Parameter stuende in Proxy- und Browserprotokollen.
    expect(angepasst?.url).toBe(kachel);
    expect(angepasst?.url).not.toContain(SCHLUESSEL);
  });

  it('haengt den Schluessel an keinen fremden Host', () => {
    const config = createPtvMapDisplayConfig(SCHLUESSEL);

    // MapLibre reicht jede Anfrage durch `transformRequest` - auch eine, die
    // ein manipulierter oder fremder Style auf einen anderen Host richtet.
    for (const fremd of [
      'https://fremder-host.invalid/kacheln/1/2/3',
      'https://api.myptv.com.fremder-host.invalid/1/2/3',
      'http://127.0.0.1:5173/sprite.png',
      'sprite.png',
    ]) {
      expect(config.authorizeRequest?.(fremd)).toEqual({ url: fremd });
    }
  });

  it('laesst Style, Sprites und Glyphen ohne Kopfzeile passieren (BEF-021)', () => {
    const config = createPtvMapDisplayConfig(SCHLUESSEL);

    // Der Auslieferungsserver will keinen Schluessel und beantwortet die
    // CORS-Vorabanfrage nicht, die eine fremde Kopfzeile ausloest. Mit Kopf
    // kam der Style nie an und die Karte blieb grau - im Browser gefunden,
    // nicht im Test. Deshalb steht dieser Fall jetzt hier.
    for (const ohneSchluessel of [
      'https://vectormaps-resources.myptv.com/styles-osm/latest/standard-osm.json',
      'https://vectormaps-resources.myptv.com/fonts/latest/Noto%20Sans/0-255.pbf',
      'https://vectormaps-resources.myptv.com/sprites/latest/sprite.png',
    ]) {
      expect(config.authorizeRequest?.(ohneSchluessel)).toEqual({ url: ohneSchluessel });
    }
  });

  it('nennt einen Style, der ohne Schluessel erreichbar ist', () => {
    // Die Style-URL zeigt auf den Auslieferungsserver, nicht auf den
    // Kachelendpunkt: Wer sie dorthin verlegt, holt sich den Fehler von
    // BEF-021 zurueck, weil der Style dann eine Autorisierung braeuchte.
    const config = createPtvMapDisplayConfig(SCHLUESSEL);

    expect(new URL(config.styleUrl).hostname).toBe('vectormaps-resources.myptv.com');
    expect(config.authorizeRequest?.(config.styleUrl)).toEqual({ url: config.styleUrl });
  });
});

describe('createMapDisplayConfig', () => {
  it('liefert ohne Schluessel keine Konfiguration', () => {
    // Kein Schluessel, keine Karte, keine Anfrage: Das Abo liegt bei Jannes
    // und nie im Repository (ADR-019 Punkt 24).
    expect(createMapDisplayConfig(null)).toBeNull();
  });

  it('liefert mit Schluessel eine Konfiguration ohne Anbieternamen im Typ', () => {
    const config = createMapDisplayConfig(SCHLUESSEL);

    expect(config?.styleUrl).toBe(createPtvMapDisplayConfig(SCHLUESSEL).styleUrl);
  });
});
