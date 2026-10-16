/**
 * Bauteile und Prüfpunkte des Lastenrads, ohne three.js.
 *
 * Quelle ist der Entwurf `docs/design/lastenrad-3d/kanvas/Lastenrad3D.dc.html`
 * (`BIKE_ZONES`, Handoff Lastenrad 3D, Abschnitt 5). Die Datei lädt kein
 * three.js: Liste, Prüfpunkte, PDF-Tabelle und Tests kommen ohne das Modell
 * aus, und der Betrachter lädt seine Bibliothek erst auf Abruf.
 *
 * Die Schlüssel der Bauteile und Prüfpunkte stehen so in der Datenbank
 * (`fleet_spots.zone`, Prüfpunkt-Schlüssel im Check-Up); ein Test hält beide
 * Listen deckungsgleich (`supabase/tests/fleet.test.ts`).
 */

/** Bauarten der Flotte. Heute nur das Load 60 mit Riemen (Handoff, Abschnitt 2). */
export const BIKE_TYPES = ['load60_riemen'] as const;
export type BikeType = (typeof BIKE_TYPES)[number];

export const bikeTypeLabels: Record<BikeType, { kurz: string; lang: string }> = {
  load60_riemen: {
    kurz: 'Load 60 · Riemenantrieb',
    lang: 'Load 60 · Riemenantrieb mit Nabenschaltung',
  },
};

/**
 * Der Riss im Antrieb, wie ihn der Pannenablauf bei „Wie groß ist der
 * Schaden?“ nennt (Handoff, Vorschlag 8): Die Köln-Vorlage sagte
 * „Kettenriss“; das Load 60 fährt mit Riemen.
 */
export const antriebsriss: Record<BikeType, string> = { load60_riemen: 'Riemenriss' };

/**
 * Fassung der Geometrie je Bauart. Eine Stelle speichert ihren Punkt in
 * Modellkoordinaten und dazu die Fassung, an der er gesetzt wurde (ANN-555):
 * Ändert sich die Geometrie, zeigt eine alte Stelle auf die Mitte ihres
 * Bauteils statt auf einen Punkt, der nicht mehr am Rad liegt.
 */
export const MODEL_VERSION: Record<BikeType, number> = { load60_riemen: 1 };

/** Prüfpunkte der Bauart Load 60 mit Riemen (Handoff, Abschnitt 5 und AC 3). */
export const CHECK_ITEMS = [
  { key: 'reifen', label: 'Reifen und Luftdruck' },
  { key: 'speichen', label: 'Speichen' },
  { key: 'bremsen', label: 'Bremsen' },
  { key: 'antrieb', label: 'Riemen und Antrieb' },
  { key: 'licht_vorne', label: 'Licht vorne' },
  { key: 'licht_hinten', label: 'Licht hinten' },
  { key: 'akku', label: 'Akku-Zustand' },
  { key: 'schrauben_sattel', label: 'Schrauben und Sattel fest' },
  { key: 'klingel', label: 'Klingel' },
  { key: 'schutzbleche', label: 'Schutzbleche' },
  { key: 'staender', label: 'Ständer' },
  { key: 'transportbox', label: 'Transportbox' },
] as const;

export type CheckItemKey = (typeof CHECK_ITEMS)[number]['key'];

export const checkItemLabels = Object.fromEntries(
  CHECK_ITEMS.map((item) => [item.key, item.label]),
) as Record<CheckItemKey, string>;

/**
 * Blickwinkel für „Am Rad zeigen“: θ und φ in Grad, Abstand in Metern (oder
 * `null` für „eingepasst“). Aus dem Entwurf übernommen.
 */
export type ZoneView = readonly [theta: number, phi: number, radius: number | null];

interface ZoneDefinition {
  label: string;
  /** Der Prüfpunkt, dessen Bewertung eine Stelle anhebt, oder keiner. */
  check: CheckItemKey | null;
  view: ZoneView;
}

/** Die 27 Bauteile des Modells (Handoff, Abschnitt 5). */
export const BIKE_ZONES = {
  'reifen-vorne': { label: 'Reifen vorne', check: 'reifen', view: [60, 76, 1.6] },
  'reifen-hinten': { label: 'Reifen hinten', check: 'reifen', view: [-40, 76, 1.8] },
  'laufrad-vorne': { label: 'Speichen und Felge vorne', check: 'speichen', view: [60, 78, 1.5] },
  'laufrad-hinten': { label: 'Speichen und Felge hinten', check: 'speichen', view: [-40, 78, 1.7] },
  'bremse-vorne': { label: 'Bremse vorne', check: 'bremsen', view: [150, 80, 1.5] },
  'bremse-hinten': { label: 'Bremse hinten', check: 'bremsen', view: [-150, 80, 1.5] },
  bremsgriffe: { label: 'Bremsgriffe', check: 'bremsen', view: [-90, 48, 1.3] },
  riemen: { label: 'Riemen und Riemenscheiben', check: 'antrieb', view: [-6, 82, 1.8] },
  nabenschaltung: { label: 'Nabenschaltung', check: 'antrieb', view: [-30, 80, 1.2] },
  kurbeln: { label: 'Kurbeln und Pedale', check: 'antrieb', view: [25, 80, 1.4] },
  motor: { label: 'Motor', check: 'antrieb', view: [20, 82, 1.3] },
  akku: { label: 'Akku', check: 'akku', view: [15, 74, 1.3] },
  'licht-vorne': { label: 'Licht vorne', check: 'licht_vorne', view: [70, 72, 1.3] },
  'licht-hinten': { label: 'Licht hinten', check: 'licht_hinten', view: [-110, 72, 1.3] },
  sattel: { label: 'Sattel und Sattelstütze', check: 'schrauben_sattel', view: [-35, 62, 1.4] },
  klingel: { label: 'Klingel', check: 'klingel', view: [-140, 50, 1.1] },
  'schutzblech-vorne': { label: 'Schutzblech vorne', check: 'schutzbleche', view: [65, 66, 1.5] },
  'schutzblech-hinten': {
    label: 'Schutzblech hinten',
    check: 'schutzbleche',
    view: [-60, 66, 1.8],
  },
  staender: { label: 'Ständer', check: 'staender', view: [30, 84, 1.8] },
  transportbox: { label: 'Transportbox', check: 'transportbox', view: [45, 64, 2.2] },
  rahmen: { label: 'Rahmen', check: null, view: [20, 74, 3.0] },
  lenker: { label: 'Lenker und Griffe', check: null, view: [-110, 52, 1.4] },
  display: { label: 'Display', check: null, view: [-90, 42, 1.0] },
  lenkung: { label: 'Lenkstange', check: null, view: [25, 86, 2.0] },
  gabel: { label: 'Federgabel', check: null, view: [70, 78, 1.5] },
  daempfer: { label: 'Dämpfer hinten', check: null, view: [10, 72, 1.3] },
  gepaecktraeger: { label: 'Gepäckträger', check: null, view: [-55, 55, 1.7] },
} as const satisfies Record<string, ZoneDefinition>;

export type ZoneKey = keyof typeof BIKE_ZONES;

export const ZONE_KEYS = Object.keys(BIKE_ZONES) as ZoneKey[];

export function isZoneKey(value: string): value is ZoneKey {
  return Object.hasOwn(BIKE_ZONES, value);
}

export function zoneLabel(zone: string): string {
  return isZoneKey(zone) ? BIKE_ZONES[zone].label : zone;
}

export function zoneCheckItem(zone: string): CheckItemKey | null {
  return isZoneKey(zone) ? BIKE_ZONES[zone].check : null;
}

/**
 * Die Bauteile für die Auswahl ohne 3D-Rad (Handoff, Abschnitt 4): erst die mit
 * Prüfpunkt, dann die weiteren Stellen - in der Reihenfolge des Modells.
 */
export const ZONE_GROUPS: readonly { label: string; zones: readonly ZoneKey[] }[] = [
  { label: 'Mit Prüfpunkt', zones: ZONE_KEYS.filter((zone) => BIKE_ZONES[zone].check !== null) },
  { label: 'Weitere Stellen', zones: ZONE_KEYS.filter((zone) => BIKE_ZONES[zone].check === null) },
];

/** Die Bauteile, die zu einem Prüfpunkt gehören - für „Am Rad zeigen“ in der Prüfliste. */
export function zonesOfCheckItem(item: CheckItemKey): ZoneKey[] {
  return ZONE_KEYS.filter((zone) => BIKE_ZONES[zone].check === item);
}

/**
 * Blickwinkel für Prüfpunkte mit mehreren Bauteilen (Entwurf `CHECK_VIEWS`):
 * Reifen, Speichen und Schutzbleche vorne und hinten zugleich, die Bremsen von
 * links. Prüfpunkte mit einem Bauteil nehmen dessen Blickwinkel.
 */
export const CHECK_ITEM_VIEWS: Partial<Record<CheckItemKey, ZoneView>> = {
  reifen: [12, 80, null],
  speichen: [12, 80, null],
  bremsen: [180, 80, null],
  antrieb: [-10, 82, 2.4],
  schutzbleche: [10, 74, null],
};

// -----------------------------------------------------------------------------
// Einstufung
// -----------------------------------------------------------------------------

export type Severity = 'problem' | 'beobachten';

export type CheckRating = 'ok' | 'beobachten' | 'problem';

export const checkRatingLabels: Record<CheckRating, string> = {
  ok: 'In Ordnung',
  beobachten: 'Beobachten',
  problem: 'Problem',
};

const RATING_ORDER: Record<CheckRating, number> = { ok: 0, beobachten: 1, problem: 2 };

/**
 * Eine Stelle hebt die Bewertung ihres Prüfpunkts an, nie ab (Handoff,
 * Vorschlag 3, ANN-555): „Problem“ an der Bremse setzt „Bremsen“ auf
 * „Problem“; eine Stelle „Beobachten“ lässt ein „Problem“ stehen.
 */
export function raiseRating(rating: CheckRating, severity: Severity): CheckRating {
  return RATING_ORDER[severity] > RATING_ORDER[rating] ? severity : rating;
}

/** Die Bewertung eines Prüfpunkts mit allen Stellen, die zu ihm gehören. */
export function ratingWithSpots(
  item: CheckItemKey,
  rating: CheckRating,
  spots: readonly { zone: string; severity: Severity }[],
): CheckRating {
  return spots
    .filter((spot) => zoneCheckItem(spot.zone) === item)
    .reduce<CheckRating>((stand, spot) => raiseRating(stand, spot.severity), rating);
}

// -----------------------------------------------------------------------------
// Ansichten und Nadeln
// -----------------------------------------------------------------------------

/** Mittelpunkt, auf den die Kamera in den festen Ansichten schaut (Meter). */
export const BIKE_CENTER = [0.0, 0.53, 0] as const;

/**
 * Feste Ansichten. Der Entwurf hatte fünf; DESIGN.md lässt im `Segment` zwei
 * bis vier zu. „Vorne“ entfällt: Transportbox, Licht vorne und Gabel zeigt
 * schon „Schräg“, die Rückseite mit Licht hinten und Gepäckträger nur „Hinten“.
 */
export const VIEW_PRESETS = [
  { id: 'schraeg', label: 'Schräg', theta: 38, phi: 70 },
  { id: 'rechts', label: 'Rechts', theta: 0, phi: 84 },
  { id: 'links', label: 'Links', theta: 180, phi: 84 },
  { id: 'hinten', label: 'Hinten', theta: -90, phi: 72 },
] as const;

export type ViewId = (typeof VIEW_PRESETS)[number]['id'];

/**
 * Farben der Nadeln (Handoff, Abschnitt 3). Die gelbe Nadel trägt eine dunkle
 * Kontur, damit sie auf der hellen Fläche 3 : 1 erreicht (WCAG 1.4.11; der
 * Entwurf lag bei 1,7 : 1).
 */
export const PIN_COLORS = {
  problem: { fill: '#b3261e', ink: '#ffffff', kontur: '#ffffff' },
  beobachten: { fill: '#f0b43c', ink: '#2a1e00', kontur: '#2a1e00' },
  neu: { fill: '#004429', ink: '#ffffff', kontur: '#ffffff' },
} as const;

export type PinKind = keyof typeof PIN_COLORS;

/** Ein Punkt in Modellkoordinaten: x nach vorn, y nach oben, z zur Antriebsseite (Meter). */
export type ModelPoint = readonly [x: number, y: number, z: number];

/** Eine Nadel am Rad: gespeicherte Stelle oder die gerade angelegte. */
export interface BikeMarker {
  id: string;
  zone: string;
  /** Ohne Punkt sitzt die Nadel in der Mitte des Bauteils (Weg über die Liste). */
  point: ModelPoint | null;
  severity: Severity;
  /** Nummer an der Nadel, in der Liste und in der PDF (Handoff, Abschnitt 4). */
  number: number;
}

/** Was ein Antippen am Rad getroffen hat. */
export interface BikePick {
  zone: string;
  point: ModelPoint | null;
  /** Gesetzt, wenn eine Nadel getroffen wurde. */
  markerId?: string;
}
