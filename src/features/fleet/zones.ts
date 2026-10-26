/**
 * Bauteile und Prüfpunkte des Lastenrads. Die Schlüssel stehen so in der Datenbank
 * (`fleet_spots.zone`, Prüfpunkte im Check-Up); `supabase/tests/fleet.test.ts` hält beide gleich.
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

interface ZoneDefinition {
  label: string;
  /** Der Prüfpunkt, dessen Bewertung eine Stelle anhebt, oder keiner. */
  check: CheckItemKey | null;
}

/** Die 27 Bauteile des Rads (Handoff, Abschnitt 5). */
export const BIKE_ZONES = {
  'reifen-vorne': { label: 'Reifen vorne', check: 'reifen' },
  'reifen-hinten': { label: 'Reifen hinten', check: 'reifen' },
  'laufrad-vorne': { label: 'Speichen und Felge vorne', check: 'speichen' },
  'laufrad-hinten': { label: 'Speichen und Felge hinten', check: 'speichen' },
  'bremse-vorne': { label: 'Bremse vorne', check: 'bremsen' },
  'bremse-hinten': { label: 'Bremse hinten', check: 'bremsen' },
  bremsgriffe: { label: 'Bremsgriffe', check: 'bremsen' },
  riemen: { label: 'Riemen und Riemenscheiben', check: 'antrieb' },
  nabenschaltung: { label: 'Nabenschaltung', check: 'antrieb' },
  kurbeln: { label: 'Kurbeln und Pedale', check: 'antrieb' },
  motor: { label: 'Motor', check: 'antrieb' },
  akku: { label: 'Akku', check: 'akku' },
  'licht-vorne': { label: 'Licht vorne', check: 'licht_vorne' },
  'licht-hinten': { label: 'Licht hinten', check: 'licht_hinten' },
  sattel: { label: 'Sattel und Sattelstütze', check: 'schrauben_sattel' },
  klingel: { label: 'Klingel', check: 'klingel' },
  'schutzblech-vorne': { label: 'Schutzblech vorne', check: 'schutzbleche' },
  'schutzblech-hinten': { label: 'Schutzblech hinten', check: 'schutzbleche' },
  staender: { label: 'Ständer', check: 'staender' },
  transportbox: { label: 'Transportbox', check: 'transportbox' },
  rahmen: { label: 'Rahmen', check: null },
  lenker: { label: 'Lenker und Griffe', check: null },
  display: { label: 'Display', check: null },
  lenkung: { label: 'Lenkstange', check: null },
  gabel: { label: 'Federgabel', check: null },
  daempfer: { label: 'Dämpfer hinten', check: null },
  gepaecktraeger: { label: 'Gepäckträger', check: null },
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

/** Die Bauteile, die zu einem Prüfpunkt gehören - für „Wo genau?“ im Check-Up. */
export function zonesOfCheckItem(item: CheckItemKey): ZoneKey[] {
  return ZONE_KEYS.filter((zone) => BIKE_ZONES[zone].check === item);
}

/**
 * Alle Bauteile für die Auswahl, nach Prüfpunkt: wenige kurze Gruppen, damit die Liste am
 * Telefon mit einer Hand trifft. Punkte mit einem Bauteil stehen zusammen, die übrigen zuletzt.
 */
export const ZONE_GROUPS: readonly { label: string; zones: readonly ZoneKey[] }[] = [
  ...CHECK_ITEMS.filter((item) => zonesOfCheckItem(item.key).length > 1).map((item) => ({
    label: item.label,
    zones: zonesOfCheckItem(item.key),
  })),
  {
    label: 'Weitere Prüfpunkte',
    zones: CHECK_ITEMS.flatMap((item) => {
      const zonen = zonesOfCheckItem(item.key);
      return zonen.length === 1 ? zonen : [];
    }),
  },
  { label: 'Ohne Prüfpunkt', zones: ZONE_KEYS.filter((zone) => BIKE_ZONES[zone].check === null) },
];

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
