import type { CheckItemKey, Severity, ZoneKey } from '../zones';

/**
 * Was die 3D-Ansicht über Bauteile wissen muss, ohne three.js: Blickwinkel, feste Ansichten und
 * Nadeln (Stand cc3ebbbb, Übergabe Lastenrad 2). Die Bauteile selbst stehen in `../zones.ts`.
 */

/** Blickwinkel: θ und φ in Grad, Abstand in Metern oder `null` für „eingepasst“. */
export type ZoneView = readonly [theta: number, phi: number, radius: number | null];

/**
 * Blick je Bauteil für „Am Rad zeigen“, aus dem Entwurf; am neuen Modell (Übergabe 2) je Bauteil
 * angesehen. Klingel und Ständer sitzen dort anders und haben einen eigenen Blick.
 */
export const ZONE_VIEWS: Record<ZoneKey, ZoneView> = {
  'reifen-vorne': [60, 76, 1.6],
  'reifen-hinten': [-40, 76, 1.8],
  'laufrad-vorne': [60, 78, 1.5],
  'laufrad-hinten': [-40, 78, 1.7],
  'bremse-vorne': [150, 80, 1.5],
  'bremse-hinten': [-150, 80, 1.5],
  bremsgriffe: [-90, 48, 1.3],
  riemen: [-6, 82, 1.8],
  nabenschaltung: [-30, 80, 1.2],
  kurbeln: [25, 80, 1.4],
  motor: [20, 82, 1.3],
  akku: [15, 74, 1.3],
  'licht-vorne': [70, 72, 1.3],
  'licht-hinten': [-110, 72, 1.3],
  sattel: [-35, 62, 1.4],
  klingel: [-160, 62, 0.8],
  'schutzblech-vorne': [65, 66, 1.5],
  'schutzblech-hinten': [-60, 66, 1.8],
  staender: [0, 88, 1.3],
  transportbox: [45, 64, 2.2],
  rahmen: [20, 74, 3.0],
  lenker: [-110, 52, 1.4],
  display: [-90, 42, 1.0],
  lenkung: [25, 86, 2.0],
  gabel: [70, 78, 1.5],
  daempfer: [10, 72, 1.3],
  gepaecktraeger: [-55, 55, 1.7],
};

/**
 * Blickwinkel für Prüfpunkte mit mehreren Bauteilen (Entwurf `CHECK_VIEWS`): Reifen, Speichen und
 * Schutzbleche vorne und hinten zugleich, die Bremsen von links. Prüfpunkte mit einem Bauteil
 * nehmen dessen Blickwinkel.
 */
export const CHECK_ITEM_VIEWS: Partial<Record<CheckItemKey, ZoneView>> = {
  reifen: [12, 80, null],
  speichen: [12, 80, null],
  bremsen: [180, 80, null],
  antrieb: [-10, 82, 2.4],
  schutzbleche: [10, 74, null],
};

/** Mittelpunkt, auf den die Kamera in den festen Ansichten schaut (Meter). */
export const BIKE_CENTER = [0.0, 0.53, 0] as const;

/**
 * Feste Ansichten. Der Entwurf hatte fünf; DESIGN.md lässt im `Segment` zwei bis vier zu. „Vorne“
 * entfällt: Transportbox, Licht vorne und Gabel zeigt schon „Schräg“, die Rückseite nur „Hinten“.
 */
export const VIEW_PRESETS = [
  { id: 'schraeg', label: 'Schräg', theta: 38, phi: 70 },
  { id: 'rechts', label: 'Rechts', theta: 0, phi: 84 },
  { id: 'links', label: 'Links', theta: 180, phi: 84 },
  { id: 'hinten', label: 'Hinten', theta: -90, phi: 72 },
] as const;

export type ViewId = (typeof VIEW_PRESETS)[number]['id'];

/**
 * Farben der Nadeln (Handoff, Abschnitt 3). Die gelbe Nadel trägt eine dunkle Kontur, damit sie auf
 * der hellen Fläche 3 : 1 erreicht (WCAG 1.4.11; der Entwurf lag bei 1,7 : 1).
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
  /** Ohne Punkt sitzt die Nadel in der Mitte des Bauteils (ANN-871: gespeichert wird kein Punkt). */
  point: ModelPoint | null;
  severity: Severity;
  /** Nummer an der Nadel, in der Liste und in der Unterlage für die Werkstatt. */
  number: number;
}

/** Was ein Antippen am Rad getroffen hat. */
export interface BikePick {
  zone: string;
  point: ModelPoint | null;
  /** Gesetzt, wenn eine Nadel getroffen wurde. */
  markerId?: string;
}
