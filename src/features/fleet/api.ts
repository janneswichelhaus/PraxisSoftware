import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { dateiAblehnungsgrund, dateiInhaltAblehnungsgrund } from '@/features/files/dokumentarten';
import { nachSrgb } from '@/features/files/farbe';
import { alleBytes, bereinigeBild } from '@/features/files/metadaten';
import { ABSCHLUSSARTEN, type Abschlussart } from './pannenablauf';
import { BIKE_TYPES, type CheckRating, type ModelPoint, type Severity } from './bike3d/zones';
import { SEITEN, type SeitenKey, type Werbeflaechen } from './checkupablauf';

/**
 * Radflotte (FLT-EPIC-001): Lesen und Schreiben über die Serverfunktionen aus
 * `supabase/migrations/20261119100000_flt_001_radflotte.sql` und
 * `…110000_flt_002_fotos_am_rad.sql`.
 *
 * Ob jemand ein Rad anlegt, freigibt oder einen Schlüssel nimmt, entscheidet
 * der Server (BEF-066, ANN-550); die Oberfläche fragt `can_manage` und
 * `can_release` nur ab, um nicht anzubieten, was abgewiesen würde (ADR-004).
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const pointSchema = z
  .tuple([z.coerce.number(), z.coerce.number(), z.coerce.number()])
  .transform((p): ModelPoint => [p[0], p[1], p[2]]);

const depotSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
});
export type Depot = z.infer<typeof depotSchema>;

const staffSchema = z.object({ id: z.string(), name: z.string() });
export type FleetStaff = z.infer<typeof staffSchema>;

const bikeSchema = z.object({
  id: z.string(),
  name: z.string(),
  bike_type: z.enum(BIKE_TYPES),
  home_depot_id: z.string(),
  current_depot_id: z.string().nullable(),
  special_location: z.string().nullable(),
  is_spare: z.boolean(),
  regular_rider: staffSchema.nullable(),
  planned_weekdays: z.array(z.number().int().min(1).max(7)),
  battery: z.string().nullable(),
  note: z.string().nullable(),
  updated_at: z.string(),
  key: z
    .object({
      holder_staff_id: z.string(),
      holder_name: z.string().nullable(),
      taken_at: z.string(),
    })
    .nullable(),
  block: z
    .object({
      id: z.string(),
      blocked_at: z.string(),
      reason: z.string().nullable(),
      breakdown_id: z.string().nullable(),
    })
    .nullable(),
  open_spots: z.number().int(),
  open_problems: z.number().int(),
  last_checkup_at: z.string().nullable(),
});
export type Bike = z.infer<typeof bikeSchema>;

const fleetSchema = z.object({
  can_manage: z.boolean(),
  can_release: z.boolean(),
  /** FLT-008 (ANN-569): die Meldungen aller Räder - owner und team_lead. */
  can_read_reports: z.boolean(),
  /** FLT-009 (ANN-570): Check-Up-Rhythmus in Tagen; `null` heißt keine Hinweise. */
  checkup_interval_days: z.number().int().nullable(),
  my_staff_member_id: z.string().nullable(),
  depots: z.array(depotSchema),
  bikes: z.array(bikeSchema),
  staff: z.array(staffSchema),
  unavailable: z.array(z.object({ staff_member_id: z.string(), on_date: z.string() })),
});
export type Fleet = z.infer<typeof fleetSchema>;

const spotSchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  zone: z.string(),
  point: pointSchema.nullable(),
  model_version: z.number().int(),
  severity: z.enum(['problem', 'beobachten']),
  note: z.string().nullable(),
  source: z.enum(['checkup', 'breakdown']),
  source_id: z.string(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type Spot = z.infer<typeof spotSchema>;

const checkItemResultSchema = z.object({
  key: z.string(),
  rating: z.enum(['ok', 'beobachten', 'problem']),
  note: z.string().nullable(),
});

const checkupSchema = z.object({
  id: z.string(),
  checked_at: z.string(),
  checked_by_name: z.string().nullable(),
  items: z.array(checkItemResultSchema),
  note: z.string().nullable(),
});
export type Checkup = z.infer<typeof checkupSchema>;

const breakdownSchema = z.object({
  id: z.string(),
  reported_at: z.string(),
  reported_by_name: z.string().nullable(),
  outcome: z.enum(ABSCHLUSSARTEN),
  blocks: z.boolean(),
  summary: z.string(),
  remark: z.string().nullable(),
  location_note: z.string().nullable(),
  transport: z.enum(['carsharing', 'fahrdienst']).nullable(),
});
export type Breakdown = z.infer<typeof breakdownSchema>;

const blockSchema = z.object({
  id: z.string(),
  breakdown_id: z.string().nullable(),
  reason: z.string().nullable(),
  blocked_at: z.string(),
  blocked_by_name: z.string().nullable(),
  released_at: z.string().nullable(),
  released_by_name: z.string().nullable(),
});
export type Block = z.infer<typeof blockSchema>;

const keyHandoverSchema = z.object({
  holder_name: z.string().nullable(),
  taken_at: z.string(),
  returned_at: z.string().nullable(),
});
export type KeyHandover = z.infer<typeof keyHandoverSchema>;

const bikeDetailSchema = z.object({
  bike: bikeSchema,
  spots: z.array(spotSchema),
  checkups: z.array(checkupSchema),
  breakdowns: z.array(breakdownSchema),
  blocks: z.array(blockSchema),
  keys: z.array(keyHandoverSchema),
});
export type BikeDetail = z.infer<typeof bikeDetailSchema>;

const workshopSheetSchema = z.object({
  name: z.string(),
  bike_type: z.enum(BIKE_TYPES),
  blocked_since: z.string().nullable(),
  spots: z.array(
    z.object({
      id: z.string(),
      number: z.number().int(),
      zone: z.string(),
      point: pointSchema.nullable(),
      model_version: z.number().int(),
      severity: z.enum(['problem', 'beobachten']),
      note: z.string().nullable(),
      source: z.enum(['checkup', 'breakdown']),
      source_at: z.string(),
    }),
  ),
});
export type WorkshopSheet = z.infer<typeof workshopSheetSchema>;

const seitenSchema = z.enum(SEITEN.map((seite) => seite.key) as [SeitenKey, ...SeitenKey[]]);

const photoSchema = z.object({
  id: z.string(),
  spot_id: z.string().nullable(),
  checkup_id: z.string().nullable(),
  /** FLT-007 (ANN-568): die Seite eines Seitenfotos im Check-Up. */
  side: seitenSchema.nullable(),
  created_at: z.string(),
  verified: z.boolean(),
  may_delete: z.boolean(),
});
export type FleetPhoto = z.infer<typeof photoSchema>;

const reportBase = {
  id: z.string(),
  bike_id: z.string(),
  bike_name: z.string(),
  bike_type: z.enum(BIKE_TYPES),
  at: z.string(),
  by_name: z.string().nullable(),
  spots: z.array(spotSchema),
  photos: z.array(
    z.object({ id: z.string(), spot_id: z.string().nullable(), side: seitenSchema.nullable() }),
  ),
};

const reportSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('checkup'),
    ...reportBase,
    items: z.array(checkItemResultSchema),
    note: z.string().nullable(),
    ad_surfaces: z.enum(['wiped', 'not_possible']).nullable(),
    ad_surfaces_note: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('breakdown'),
    ...reportBase,
    outcome: z.enum(ABSCHLUSSARTEN),
    blocks: z.boolean(),
    summary: z.string(),
    remark: z.string().nullable(),
    location_note: z.string().nullable(),
    transport: z.enum(['carsharing', 'fahrdienst']).nullable(),
  }),
]);
/** Ein Check-Up oder eine Panne in der Liste für den Arbeitgeber (FLT-008, ANN-569). */
export type FleetReport = z.infer<typeof reportSchema>;

// -----------------------------------------------------------------------------
// Schlüssel der Abfragen
// -----------------------------------------------------------------------------

export const FLOTTE_SCHLUESSEL = ['radflotte'] as const;

export function flotteSchluessel(wochenbeginn: string | null) {
  return [...FLOTTE_SCHLUESSEL, 'liste', wochenbeginn] as const;
}

export function radSchluessel(bikeId: string) {
  return [...FLOTTE_SCHLUESSEL, 'rad', bikeId] as const;
}

export function werkstattSchluessel(bikeId: string) {
  return [...FLOTTE_SCHLUESSEL, 'werkstatt', bikeId] as const;
}

export function fotosSchluessel(bikeId: string) {
  return [...FLOTTE_SCHLUESSEL, 'fotos', bikeId] as const;
}

export function meldungenSchluessel(ab: string | null) {
  return [...FLOTTE_SCHLUESSEL, 'meldungen', ab] as const;
}

// -----------------------------------------------------------------------------
// Fehler in Sätzen der Praxis
// -----------------------------------------------------------------------------

type Fehler = { message?: string; code?: string } | null;

const SAETZE: readonly (readonly [string, string])[] = [
  ['key already with this person', 'Der Schlüssel liegt schon bei dieser Person.'],
  ['key already taken', 'Der Schlüssel ist schon entnommen. Bitte die Liste neu laden.'],
  ['bike is blocked', 'Das Rad ist gesperrt. Den Schlüssel gibt es erst nach der Freigabe.'],
  ['key is not taken', 'Der Schlüssel liegt schon im Tresor.'],
  ['key is taken', 'Erst den Schlüssel zurücklegen.'],
  ['no staff member for this account', 'Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz.'],
  ['staff member is required', 'Bitte eine Person wählen.'],
  ['bike name already in use', 'Diesen Namen trägt schon ein Rad.'],
  ['bike name is required', 'Bitte einen Namen angeben (höchstens 60 Zeichen).'],
  ['depot name already in use', 'Dieses Depot gibt es schon.'],
  ['depot name is required', 'Bitte einen Namen angeben (höchstens 80 Zeichen).'],
  ['depot still has bikes', 'In diesem Depot stehen noch Räder oder gehören dorthin.'],
  ['either a current depot or a named location', 'Bitte ein Depot oder einen anderen Ort angeben.'],
  ['was changed meanwhile', 'Das Rad wurde inzwischen geändert. Bitte neu laden.'],
  [
    'a spot raises its check item',
    'Eine Stelle am Rad hebt ihren Prüfpunkt an. Bitte die Bewertung prüfen.',
  ],
  ['checkup needs every check item', 'Bitte alle Prüfpunkte bewerten.'],
  ['checkup must be confirmed', 'Bitte die Prüfung bestätigen.'],
  ['ad surfaces must be wiped or explained', 'Bitte die Werbeflächen abwischen.'],
  ['ad surfaces reason is required', 'Bitte sagen, warum die Werbeflächen nicht gingen.'],
  ['side already has a photo', 'Für diese Seite gibt es schon ein Foto.'],
  ['checkup interval must be between', 'Bitte zwischen 1 und 90 Tagen wählen.'],
  ['since must lie within the last year', 'Höchstens ein Jahr zurück.'],
  ['nothing to release', 'Es gibt nichts freizugeben.'],
  ['bike is already blocked', 'Das Rad ist schon gesperrt.'],
  ['reason is required', 'Bitte einen Grund angeben.'],
  ['summary is required', 'Der Abschluss fehlt.'],
  ['too many spots', 'Höchstens 20 Stellen je Meldung.'],
  ['too many photos', 'Höchstens vier Fotos je Stelle.'],
  ['reference not found', 'Fotos lassen sich nur am selben Tag zur eigenen Meldung hinzufügen.'],
  ['is too long', 'Ein Eintrag ist zu lang.'],
  ['bike not found', 'Dieses Rad gibt es nicht mehr.'],
  ['depot not found', 'Dieses Depot gibt es nicht mehr.'],
  ['staff member not found', 'Diese Person gibt es nicht im Mitarbeiterstamm.'],
  ['photo not found', 'Dieses Foto gibt es nicht mehr.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

function meldung(error: Fehler, rest: string): Error {
  const text = error?.message ?? '';
  const treffer = SAETZE.find(([schluessel]) => text.includes(schluessel));
  return new Error(treffer ? treffer[1] : rest);
}

async function rufe(funktion: string, argumente: Record<string, unknown>, rest: string) {
  const { data, error } = (await getSupabase().rpc(funktion, argumente)) as {
    data: unknown;
    error: Fehler;
  };
  if (error) throw meldung(error, rest);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

const LADEN = 'Die Radflotte konnte nicht geladen werden.';

/** `wochenbeginn`: Montag der Woche, für „frei, weil abwesend“ in der Wochenübersicht. */
export async function fetchFleet(wochenbeginn: string | null): Promise<Fleet> {
  const data = await rufe('list_fleet', { p_week_start: wochenbeginn }, LADEN);
  return antwort(fleetSchema, data, LADEN);
}

const RAD_LADEN = 'Das Rad konnte nicht geladen werden.';

export async function fetchBike(bikeId: string): Promise<BikeDetail> {
  const data = await rufe('get_fleet_bike', { p_bike_id: bikeId }, RAD_LADEN);
  return antwort(bikeDetailSchema, data, RAD_LADEN);
}

const BLATT_LADEN = 'Die Unterlage für die Werkstatt konnte nicht geladen werden.';

export async function fetchWorkshopSheet(bikeId: string): Promise<WorkshopSheet> {
  const data = await rufe('get_fleet_workshop_sheet', { p_bike_id: bikeId }, BLATT_LADEN);
  return antwort(workshopSheetSchema, data, BLATT_LADEN);
}

const FOTOS_LADEN = 'Die Fotos konnten nicht geladen werden.';

/** FLT-008 (ANN-569): Check-Ups und Pannen aller Räder ab `ab` (ohne Angabe 90 Tage). */
export async function fetchFleetReports(ab: string | null): Promise<FleetReport[]> {
  const rest = 'Die Meldungen konnten nicht geladen werden.';
  const data = await rufe('list_fleet_reports', { p_since: ab }, rest);
  return antwort(z.array(reportSchema), data, rest);
}

/** FLT-009 (ANN-570): Check-Up-Rhythmus der Praxis in Tagen, `null` = aus. Nur owner. */
export async function setCheckupInterval(tage: number | null): Promise<void> {
  await rufe(
    'set_fleet_checkup_interval',
    { p_days: tage },
    'Der Rhythmus konnte nicht gespeichert werden.',
  );
}

export async function fetchFleetPhotos(bikeId: string): Promise<FleetPhoto[]> {
  const data = await rufe('list_fleet_photos', { p_bike_id: bikeId }, FOTOS_LADEN);
  return antwort(z.array(photoSchema), data ?? [], FOTOS_LADEN);
}

// -----------------------------------------------------------------------------
// Depots und Räder (owner)
// -----------------------------------------------------------------------------

export async function saveDepot(depot: {
  id: string | null;
  name: string;
  note: string;
}): Promise<string> {
  const data = await rufe(
    'save_fleet_depot',
    { p_depot_id: depot.id, p_name: depot.name, p_note: depot.note },
    'Das Depot konnte nicht gespeichert werden.',
  );
  return antwort(z.string(), data, 'Das Depot konnte nicht gespeichert werden.');
}

export async function deleteDepot(depotId: string): Promise<void> {
  await rufe(
    'delete_fleet_depot',
    { p_depot_id: depotId },
    'Das Depot konnte nicht entfernt werden.',
  );
}

export interface BikeInput {
  id: string | null;
  name: string;
  homeDepotId: string;
  /** Ein Depot oder ein benannter anderer Ort - genau eines. */
  currentDepotId: string | null;
  specialLocation: string;
  isSpare: boolean;
  regularRiderId: string | null;
  plannedWeekdays: number[];
  battery: string;
  note: string;
  /** Der gelesene Stand, gegen gleichzeitige Änderung (40001). */
  expectedUpdatedAt: string | null;
}

export async function saveBike(rad: BikeInput): Promise<string> {
  const data = await rufe(
    'save_fleet_bike',
    {
      p_bike_id: rad.id,
      p_name: rad.name,
      p_bike_type: 'load60_riemen',
      p_home_depot_id: rad.homeDepotId,
      p_current_depot_id: rad.currentDepotId,
      p_special_location: rad.currentDepotId ? null : rad.specialLocation,
      p_is_spare: rad.isSpare,
      p_regular_rider_id: rad.isSpare ? null : rad.regularRiderId,
      p_planned_weekdays: rad.isSpare ? [] : rad.plannedWeekdays,
      p_battery: rad.battery,
      p_note: rad.note,
      p_expected_updated_at: rad.expectedUpdatedAt,
    },
    'Das Rad konnte nicht gespeichert werden.',
  );
  return antwort(z.string(), data, 'Das Rad konnte nicht gespeichert werden.');
}

/** `deleted` ohne Verlauf, `archived` mit (ANN-557). */
export async function removeBike(bikeId: string): Promise<'deleted' | 'archived'> {
  const data = await rufe(
    'remove_fleet_bike',
    { p_bike_id: bikeId },
    'Das Rad konnte nicht entfernt werden.',
  );
  return antwort(z.enum(['deleted', 'archived']), data, 'Das Rad konnte nicht entfernt werden.');
}

// -----------------------------------------------------------------------------
// Schlüssel
// -----------------------------------------------------------------------------

/** Ohne `holderStaffId` nimmt die angemeldete Person den Schlüssel selbst. */
export async function takeKey(bikeId: string, holderStaffId: string | null): Promise<void> {
  await rufe(
    'take_fleet_key',
    { p_bike_id: bikeId, p_holder_staff_id: holderStaffId },
    'Der Schlüssel konnte nicht eingetragen werden.',
  );
}

/**
 * Übergibt einen Schlüssel, der bei jemandem liegt, in einem Vorgang an eine
 * andere Person aus dem Mitarbeiterstamm (Überholung 6, ANN-575): Der offene
 * Vorgang endet, ein neuer beginnt - ohne den Umweg über den Tresor.
 */
export async function handOverKey(bikeId: string, holderStaffId: string): Promise<void> {
  await rufe(
    'hand_over_fleet_key',
    { p_bike_id: bikeId, p_holder_staff_id: holderStaffId },
    'Der Schlüssel konnte nicht übergeben werden.',
  );
}

export async function returnKey(bikeId: string): Promise<void> {
  await rufe(
    'return_fleet_key',
    { p_bike_id: bikeId },
    'Der Schlüssel konnte nicht zurückgelegt werden.',
  );
}

// -----------------------------------------------------------------------------
// Check-Up, Panne, Sperre, Freigabe
// -----------------------------------------------------------------------------

/** Eine Stelle, wie sie zum Server geht (ANN-555). */
export interface SpotInput {
  zone: string;
  severity: Severity;
  point: ModelPoint | null;
  note: string;
}

const meldungsSchema = z.object({
  spot_ids: z.array(z.string()),
});

export async function recordCheckup(eingabe: {
  bikeId: string;
  items: { key: string; rating: CheckRating; note: string }[];
  note: string;
  spots: SpotInput[];
  werbeflaechen: Werbeflaechen;
}): Promise<{ checkupId: string; spotIds: string[] }> {
  const rest = 'Der Check-Up konnte nicht gespeichert werden.';
  const data = await rufe(
    'record_fleet_checkup',
    {
      p_bike_id: eingabe.bikeId,
      p_items: eingabe.items.map((item) => ({
        key: item.key,
        rating: item.rating,
        note: item.note.trim() || null,
      })),
      p_note: eingabe.note,
      p_spots: eingabe.spots.map((spot) => ({ ...spot, note: spot.note.trim() || null })),
      p_confirmed: true,
      p_ad_surfaces: eingabe.werbeflaechen.wert,
      p_ad_surfaces_note:
        eingabe.werbeflaechen.wert === 'not_possible' ? eingabe.werbeflaechen.grund.trim() : null,
    },
    rest,
  );
  const ergebnis = antwort(meldungsSchema.extend({ checkup_id: z.string() }), data, rest);
  return { checkupId: ergebnis.checkup_id, spotIds: ergebnis.spot_ids };
}

export async function recordBreakdown(eingabe: {
  bikeId: string;
  outcome: Abschlussart;
  summary: string;
  remark: string;
  locationNote: string;
  transport: 'carsharing' | 'fahrdienst' | null;
  spots: SpotInput[];
}): Promise<{ breakdownId: string; spotIds: string[]; blocked: boolean }> {
  const rest = 'Die Panne konnte nicht gemeldet werden.';
  const data = await rufe(
    'record_fleet_breakdown',
    {
      p_bike_id: eingabe.bikeId,
      p_outcome: eingabe.outcome,
      p_summary: eingabe.summary,
      p_remark: eingabe.remark,
      p_location_note: eingabe.locationNote,
      p_transport: eingabe.transport,
      p_spots: eingabe.spots.map((spot) => ({
        zone: spot.zone,
        point: spot.point,
        note: spot.note.trim() || null,
      })),
    },
    rest,
  );
  const ergebnis = antwort(
    meldungsSchema.extend({ breakdown_id: z.string(), blocked: z.boolean() }),
    data,
    rest,
  );
  return {
    breakdownId: ergebnis.breakdown_id,
    spotIds: ergebnis.spot_ids,
    blocked: ergebnis.blocked,
  };
}

export async function blockBike(bikeId: string, reason: string): Promise<void> {
  await rufe(
    'block_fleet_bike',
    { p_bike_id: bikeId, p_reason: reason },
    'Das Rad konnte nicht gesperrt werden.',
  );
}

export async function releaseBike(
  bikeId: string,
): Promise<{ released: boolean; resolvedSpots: number }> {
  const rest = 'Das Rad konnte nicht freigegeben werden.';
  const data = await rufe('release_fleet_bike', { p_bike_id: bikeId }, rest);
  const ergebnis = antwort(
    z.object({ released: z.boolean(), resolved_spots: z.number().int() }),
    data,
    rest,
  );
  return { released: ergebnis.released, resolvedSpots: ergebnis.resolved_spots };
}

// -----------------------------------------------------------------------------
// Fotos am Rad (ANN-552): derselbe Weg wie die Dateien der Akte (ADR-017
// Punkt 7), mit eigenen Funktionen.
// -----------------------------------------------------------------------------

async function pruefsumme(datei: Blob): Promise<string> {
  const bytes = await alleBytes(datei);
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const vorbereitetSchema = z.object({
  photo_id: z.string(),
  bucket_id: z.string(),
  object_key: z.string(),
});

/** Was die Person liest, wenn der Server ein Foto verwirft (ADR-017 Punkt 52). */
export const FOTO_VERWORFEN =
  'Das Foto wurde bei der Prüfung am Server verworfen. Bitte erneut aufnehmen.';

/**
 * Ein Foto zur eigenen Stelle oder zum eigenen Check-Up hochladen.
 *
 * Wie `ladeDateiHoch` in `src/features/files/api.ts`: Format und Inhalt
 * prüfen, Farbe nach sRGB, Metadaten verlustfrei entfernen (ADR-017 Punkte 34
 * und 53 - ein Foto aus der Kamera trägt sonst den Ort), Prüfsumme der
 * bereinigten Bytes, dann (a) vorbereiten, (b) hochladen, (c) bestätigen.
 * Scheitert (b) oder (c), wird die Vorbereitung verworfen.
 */
export async function uploadFleetPhoto(auftrag: {
  spotId: string | null;
  checkupId: string | null;
  /** FLT-007: die Seite eines Seitenfotos im Check-Up. */
  side?: SeitenKey | null;
  foto: Blob;
}): Promise<string> {
  const grund = dateiAblehnungsgrund(auftrag.foto);
  if (grund) throw new Error(grund);
  const inhaltsGrund = await dateiInhaltAblehnungsgrund(auftrag.foto);
  if (inhaltsGrund) throw new Error(inhaltsGrund);
  const datei = await bereinigeBild(await nachSrgb(auftrag.foto));
  if (datei.type !== 'image/jpeg') throw new Error('Fotos am Rad gehen nur als JPEG.');
  const summe = await pruefsumme(datei);

  const rest = 'Das Foto konnte nicht angenommen werden.';
  const data = await rufe(
    'prepare_fleet_photo_upload',
    {
      p_spot_id: auftrag.spotId,
      p_checkup_id: auftrag.checkupId,
      p_byte_size: datei.size,
      p_checksum_sha256: summe,
      p_side: auftrag.side ?? null,
    },
    rest,
  );
  const vorbereitet = antwort(z.array(vorbereitetSchema), data ?? [], rest)[0];
  if (!vorbereitet) throw new Error(rest);

  try {
    // ADR-017 Punkte 8 und 16: kein Überschreiben, kein Zwischenspeicher.
    const { error: uploadFehler } = await getSupabase()
      .storage.from(vorbereitet.bucket_id)
      .upload(vorbereitet.object_key, datei, {
        contentType: datei.type,
        cacheControl: '0',
        upsert: false,
      });
    if (uploadFehler) throw new Error('Das Foto konnte nicht übertragen werden.');
    await rufe(
      'confirm_fleet_photo_upload',
      { p_photo_id: vorbereitet.photo_id },
      'Das übertragene Foto stimmte nicht mit dem angekündigten überein.',
    );
  } catch (fehler) {
    try {
      await getSupabase().rpc('discard_fleet_photo_upload', { p_photo_id: vorbereitet.photo_id });
    } catch {
      // Der ursprüngliche Grund ist die Meldung; der tägliche Lauf räumt auf.
    }
    throw fehler;
  }

  if ((await pruefeAmServer(vorbereitet.photo_id)) === 'rejected') {
    throw new Error(FOTO_VERWORFEN);
  }
  return vorbereitet.photo_id;
}

/** Prüfung am Inhalt (Edge Function `patient-file-verify`); ohne Function kein Fehler. */
async function pruefeAmServer(photoId: string): Promise<string | null> {
  try {
    const { data, error } = (await getSupabase().functions.invoke<unknown>('patient-file-verify', {
      body: { photo_id: photoId },
    })) as { data: unknown; error: unknown };
    if (error) return null;
    const pruefung = z.object({ ergebnis: z.string() }).safeParse(data);
    return pruefung.success ? pruefung.data.ergebnis : null;
  } catch {
    return null;
  }
}

/** Gültigkeit eines signierten Verweises in Sekunden (ADR-017 Punkt 15). */
const VERWEIS_GUELTIGKEIT_SEKUNDEN = 60;

/**
 * Ein Foto zum Ansehen laden - in den Speicher der Seite, nicht auf das Gerät
 * (ADR-017 Punkt 54): erst die einmalige Freigabe, dann der Verweis, dann
 * `fetch` ohne Zwischenspeicher. Der Verweis verlässt diese Funktion nicht.
 */
export async function loadFleetPhoto(photoId: string): Promise<Blob> {
  const rest = 'Das Foto konnte nicht geöffnet werden.';
  const data = await rufe('issue_fleet_photo_link', { p_photo_id: photoId }, rest);
  const freigabe = antwort(
    z.array(z.object({ bucket_id: z.string(), object_key: z.string(), mime_type: z.string() })),
    data ?? [],
    rest,
  )[0];
  if (!freigabe) throw new Error(rest);
  const { data: signiert, error } = await getSupabase()
    .storage.from(freigabe.bucket_id)
    .createSignedUrl(freigabe.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN);
  if (error || !signiert?.signedUrl)
    throw new Error('Das Foto ist in der Ablage nicht auffindbar.');
  const abruf = await fetch(signiert.signedUrl, { cache: 'no-store' });
  if (!abruf.ok) throw new Error('Das Foto konnte nicht geladen werden.');
  return new Blob([await abruf.arrayBuffer()], { type: freigabe.mime_type });
}

export async function deleteFleetPhoto(photoId: string): Promise<void> {
  await rufe(
    'delete_fleet_photo',
    { p_photo_id: photoId },
    'Das Foto konnte nicht gelöscht werden.',
  );
}
