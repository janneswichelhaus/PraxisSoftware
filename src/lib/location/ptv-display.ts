/**
 * Anzeigeadapter für die Vektorkacheln von PTV Developer (MAP-002, ADR-019).
 *
 * Der Adapter ist die **einzige** Stelle, an der der Name des Anbieters, seine
 * Hosts und sein Schlüsselformat stehen. Die Kartenkomponente kennt nur
 * `MapDisplayConfig` aus `contract.ts`; fällt der Anbieter am Gate aus
 * ADR-019 Punkt 9 durch, wird diese Datei ersetzt und sonst nichts
 * (ADR-019 Punkt 1 und 6).
 *
 * Kacheln sind der **einzige** direkte Kontakt des Browsers zum Kartendienst.
 * Sie tragen Kartenausschnitt und Zoom - keine Adresse, keinen Namen, keine
 * Kennung, keine Uhrzeit (ADR-019 Punkt 12 und 15). Marker und Nummern zeichnet
 * die Anwendung selbst.
 */

import type { MapDisplayConfig } from './contract';

/**
 * Style, Kachel-, Sprite- und Glyphen-URLs der **OSM**-Variante.
 *
 * Bewusst `maps-osm`/`styles-osm` und nicht `maps/v1`: Die Nicht-OSM-Variante
 * läuft auf HERE-Daten und zöge einen weiteren Datenlieferanten in den
 * Datenweg (ADR-019 Punkt 7).
 *
 * Herkunft der Werte: `docs/decisions/providerpruefung-kartendienst.md`,
 * Teil 1 Zeile 1. Kachel-URL und Schlüsselübergabe sind dort aus PTVs
 * offiziellen Clients belegt, **Style-URL und Attributionstext nur aus einem
 * Suchauszug** - die Webhosts des Anbieters sind aus der Entwicklungsumgebung
 * gesperrt. Beides bestätigt sich beim ersten lokalen Lauf mit Schlüssel:
 * Lädt die Karte, stimmen sie; lädt sie nicht, wird genau diese Konstante
 * korrigiert.
 */
const STYLE_URL = 'https://vectormaps-resources.myptv.com/styles-osm/latest/standard-osm.json';

/** Sichtbare Quellenangabe. Lizenzbedingung des Anbieters und der OSM-Daten. */
const ATTRIBUTION = '© PTV Group, © OpenStreetMap-Mitwirkende';

/**
 * Hosts, an die der Kachelschlüssel gehen darf.
 *
 * MapLibre reicht **jede** Anfrage durch `transformRequest`, auch solche an
 * fremde Hosts aus einem Style. Der Schlüssel hängt deshalb an einer
 * ausdrücklichen Liste und nicht an „irgendeine URL, die gerade geladen wird".
 */
const KACHEL_HOSTS: readonly string[] = ['api.myptv.com', 'vectormaps-resources.myptv.com'];

/** Zoombereich der OSM-Vektorkacheln laut Prüfdokument (minzoom 0, maxzoom 17). */
const MIN_ZOOM = 0;
const MAX_ZOOM = 17;

function gehoertZumKartendienst(url: string): boolean {
  if (!URL.canParse(url)) return false;
  return KACHEL_HOSTS.includes(new URL(url).hostname);
}

/**
 * Baut die Anzeigekonfiguration für einen vorhandenen Kachelschlüssel.
 *
 * Der Schlüssel geht als Header `ApiKey` mit, nicht als Query-Parameter:
 * Beides unterstützt der Anbieter, aber ein Query-Parameter stünde in
 * Proxy- und Browserprotokollen und in jedem geteilten Bildschirmfoto der
 * Netzwerkansicht.
 */
export function createPtvMapDisplayConfig(apiKey: string): MapDisplayConfig {
  return {
    styleUrl: STYLE_URL,
    attribution: ATTRIBUTION,
    authorizeRequest: (url) =>
      gehoertZumKartendienst(url) ? { url, headers: { ApiKey: apiKey } } : { url },
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };
}
