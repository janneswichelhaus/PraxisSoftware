import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import type { Coordinate } from '@/lib/location/contract';
import type { AppointmentType } from '@/features/appointments/api';
import type { TimeWindow } from '@/features/waitlist/api';

/**
 * Terminsuche als Vorschlagsliste (PRX-003).
 *
 * Der Server zählt freie Plätze auf (`find_free_slots`) — aus Arbeitszeit,
 * Belegung der Therapeut:innen und der Patient:in, Raster, Dauer und
 * Wunschzeiten, Gebietstag zuerst. Er reserviert nichts: Ein Vorschlag wird
 * erst im Terminformular zum Termin, und dort prüft `create_appointment`
 * alles noch einmal (§8).
 *
 * Die Fahrzeit beim Hausbesuch kommt live aus dem eigenen Kartendienst — eine
 * Matrix für die angezeigten Vorschläge — und wird mit der Rundungsregel aus
 * §8.1 im Server bewertet (`rate_slot_travel`, **ANN-136**). Gespeichert wird
 * nichts (ANN-097).
 */

const slotSchema = z.object({
  staff_member_id: z.string(),
  staff_name: z.string().nullable(),
  slot_date: z.string(),
  start_time: z.string().transform((t) => t.slice(0, 5)),
  end_time: z.string().transform((t) => t.slice(0, 5)),
  territory_status: z.enum(['none', 'match', 'outside']),
  prev_appointment_id: z.string().nullable(),
  prev_lat: z.number().nullable(),
  prev_lon: z.number().nullable(),
  next_appointment_id: z.string().nullable(),
  next_lat: z.number().nullable(),
  next_lon: z.number().nullable(),
  target_lat: z.number().nullable(),
  target_lon: z.number().nullable(),
});
export type Slot = z.infer<typeof slotSchema>;

export interface SearchParams {
  patientId: string;
  staffMemberId: string | null;
  type: AppointmentType;
  duration: number;
  from: string;
  to: string;
  windows: TimeWindow[];
  limit?: number;
}

/** Höchstens so viele Tage auf einmal — dieselbe Grenze wie im Server. */
export const MAX_DAYS = 42;
export const DEFAULT_LIMIT = 20;
/** So viele Hausbesuchsvorschläge bekommen eine Fahrzeitprüfung (ANN-136). */
export const TRAVEL_CHECK_LIMIT = 10;

export async function findFreeSlots(params: SearchParams): Promise<Slot[]> {
  const fallback = 'Die freien Plätze konnten nicht gesucht werden.';
  const { data, error } = (await getSupabase().rpc('find_free_slots', {
    p_patient_id: params.patientId,
    p_staff_member_id: params.staffMemberId,
    p_appointment_type: params.type,
    p_duration_minutes: params.duration,
    p_from: params.from,
    p_to: params.to,
    p_windows: params.windows,
    p_limit: params.limit ?? DEFAULT_LIMIT,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) {
    if (error.message?.includes('invalid duration')) {
      throw new Error('Diese Dauer passt nicht ins Praxisraster.');
    }
    if (error.message?.includes('date range')) {
      throw new Error(
        `Der Zeitraum muss in der Zukunft liegen und höchstens ${MAX_DAYS} Tage umfassen.`,
      );
    }
    throw new Error(fallback);
  }
  return antwort(z.array(slotSchema), data ?? [], fallback);
}

export type TravelStatus = 'ok' | 'tight' | 'unknown';

const ratingSchema = z.object({
  item_index: z.number(),
  status: z.enum(['ok', 'tight', 'unknown']),
  shortfall_minutes: z.number(),
});
export type TravelRating = z.infer<typeof ratingSchema>;

export interface TravelItem {
  index: number;
  staff_member_id: string;
  date: string;
  start: string;
  end: string;
  prev_appointment_id?: string;
  travel_to_seconds?: number | null;
  next_appointment_id?: string;
  travel_from_seconds?: number | null;
}

export async function rateSlotTravel(items: readonly TravelItem[]): Promise<TravelRating[]> {
  const fallback = 'Der Fahrweg konnte nicht geprüft werden.';
  if (items.length === 0) return [];
  const { data, error } = (await getSupabase().rpc('rate_slot_travel', { p_items: items })) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(fallback);
  return antwort(z.array(ratingSchema), data ?? [], fallback);
}

function key(c: Coordinate): string {
  return `${c.lat},${c.lon}`;
}

function coordinate(lat: number | null, lon: number | null): Coordinate | null {
  return lat === null || lon === null ? null : { lat, lon };
}

/**
 * Die eine Matrix für die ersten Vorschläge: Ursprünge sind die Vorgänger und
 * das Ziel, Ziele sind das Ziel und die Nachfolger. Doppelte Punkte stehen nur
 * einmal darin. Ohne Koordinate des Ziels gibt es nichts zu fragen.
 */
export function travelMatrixRequest(slots: readonly Slot[]): {
  origins: Coordinate[];
  destinations: Coordinate[];
} | null {
  const target = slots[0] ? coordinate(slots[0].target_lat, slots[0].target_lon) : null;
  if (!target) return null;
  const origins = new Map<string, Coordinate>();
  const destinations = new Map<string, Coordinate>([[key(target), target]]);
  for (const slot of slots) {
    const prev = coordinate(slot.prev_lat, slot.prev_lon);
    const next = coordinate(slot.next_lat, slot.next_lon);
    if (prev) origins.set(key(prev), prev);
    if (next) destinations.set(key(next), next);
  }
  origins.set(key(target), target);
  return { origins: [...origins.values()], destinations: [...destinations.values()] };
}

/**
 * Aus der Matrix die Fahrzeiten je Vorschlag. Ein Nachbar ohne Koordinate
 * oder ohne Weg bekommt `null` — der Server macht daraus „nicht geprüft",
 * nie „passt".
 */
export function travelItems(
  slots: readonly Slot[],
  request: { origins: Coordinate[]; destinations: Coordinate[] } | null,
  durations: ReadonlyArray<ReadonlyArray<number | null>> | null,
): TravelItem[] {
  const originIndex = new Map(request?.origins.map((c, i) => [key(c), i]) ?? []);
  const destinationIndex = new Map(request?.destinations.map((c, i) => [key(c), i]) ?? []);
  const target = slots[0] ? coordinate(slots[0].target_lat, slots[0].target_lon) : null;

  function seconds(from: Coordinate | null, to: Coordinate | null): number | null {
    if (!from || !to || !durations) return null;
    const i = originIndex.get(key(from));
    const j = destinationIndex.get(key(to));
    if (i === undefined || j === undefined) return null;
    const value = durations[i]?.[j];
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  }

  return slots.map((slot, index) => {
    const item: TravelItem = {
      index,
      staff_member_id: slot.staff_member_id,
      date: slot.slot_date,
      start: slot.start_time,
      end: slot.end_time,
    };
    if (slot.prev_appointment_id) {
      item.prev_appointment_id = slot.prev_appointment_id;
      item.travel_to_seconds = seconds(coordinate(slot.prev_lat, slot.prev_lon), target);
    }
    if (slot.next_appointment_id) {
      item.next_appointment_id = slot.next_appointment_id;
      item.travel_from_seconds = seconds(target, coordinate(slot.next_lat, slot.next_lon));
    }
    return item;
  });
}

/**
 * Knappe Wege nach hinten, sonst bleibt die Reihenfolge des Servers
 * (Gebietstag, Tag, Beginn). Ungeprüfte gelten nicht als knapp.
 */
export function orderByTravel<T>(
  slots: readonly T[],
  ratings: ReadonlyMap<number, TravelRating>,
): { slot: T; index: number }[] {
  return slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => {
      const ka = ratings.get(a.index)?.status === 'tight' ? 1 : 0;
      const kb = ratings.get(b.index)?.status === 'tight' ? 1 : 0;
      return ka - kb || a.index - b.index;
    });
}
