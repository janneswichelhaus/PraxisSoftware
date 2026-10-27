import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type { Coordinate, GeocodeResult } from '@/lib/location/contract';

/**
 * Startort der Tagesroute (MAP-006a/b, TOUR-001): das Depot des Standorts.
 *
 * Eine Praxisadresse, keine Personenadresse. Ein persönlicher Startort — etwa
 * die eigene Wohnung — ist bewusst nicht gebaut: Er wäre eine Beschäftigten-
 * adresse beim Kartendienst und braucht eine eigene Prüfung nach §20.
 */

const standortSchema = z.object({
  id: z.string(),
  name: z.string(),
  street: z.string().nullable(),
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  geocode_precision: z.enum(['address', 'street', 'locality', 'unknown']).nullable(),
  // UBK-015, ANN-240: die Garage (Abstellort der Räder). Optional, damit
  // Standorte ohne die Angabe weiter gelesen werden.
  garage_street: z.string().nullable().optional(),
  garage_house_number: z.string().nullable().optional(),
  garage_postal_code: z.string().nullable().optional(),
  garage_city: z.string().nullable().optional(),
  garage_lat: z.number().nullable().optional(),
  garage_lon: z.number().nullable().optional(),
  garage_geocode_precision: z
    .enum(['address', 'street', 'locality', 'unknown'])
    .nullable()
    .optional(),
});

export type Standort = z.infer<typeof standortSchema>;

export async function fetchStandorte(): Promise<Standort[]> {
  const { data, error } = await getSupabase()
    .from('locations')
    .select(
      'id, name, street, house_number, postal_code, city, lat, lon, geocode_precision, ' +
        'garage_street, garage_house_number, garage_postal_code, garage_city, ' +
        'garage_lat, garage_lon, garage_geocode_precision',
    )
    .order('name', { ascending: true });
  if (error) throw new Error('Die Standorte konnten nicht geladen werden.');
  return z.array(standortSchema).parse(data ?? []);
}

/** Die Koordinate des Standorts — oder `null`, solange er nicht verortet ist. */
export function startpunkt(standort: Standort | undefined): Coordinate | null {
  if (!standort || standort.lat === null || standort.lon === null) return null;
  return { lat: standort.lat, lon: standort.lon };
}

/** Die Koordinate der Garage - oder `null`, solange keine gesetzt und verortet ist. */
export function garagenpunkt(standort: Standort | undefined): Coordinate | null {
  if (!standort || standort.garage_lat == null || standort.garage_lon == null) return null;
  return { lat: standort.garage_lat, lon: standort.garage_lon };
}

/**
 * ANN-240: Wo der Tag am Rad beginnt und endet - die Garage, falls gesetzt,
 * sonst der Startort der Praxis; ohne beides `null`. Von hier rechnen
 * Übersicht, Kalender, „Passt es?“ und der Lückenfinder; die Tour lässt die
 * Wahl, mit dieser als Voreinstellung.
 */
export function tagesorte(standorte: readonly Standort[] | undefined): {
  start: Coordinate | null;
  ende: Coordinate | null;
} {
  const standort = standorte?.[0];
  const ort = garagenpunkt(standort) ?? startpunkt(standort);
  return { start: ort, ende: ort };
}

export async function saveTourStart(
  standortId: string,
  anschrift: { street: string; houseNumber: string; postalCode: string; city: string },
  treffer: GeocodeResult,
  bestaetigt: boolean,
): Promise<void> {
  const { error } = await getSupabase().rpc('set_location_tour_start', {
    p_location_id: standortId,
    p_street: anschrift.street,
    p_house_number: anschrift.houseNumber,
    p_postal_code: anschrift.postalCode,
    p_city: anschrift.city,
    p_lat: treffer.position.lat,
    p_lon: treffer.position.lon,
    p_precision: treffer.precision,
    p_confirmed: bestaetigt,
  });
  if (error) throw new Error('Der Startort konnte nicht gespeichert werden.');
}

/** Garage setzen (UBK-015) - verbindlich prüft `set_location_garage`, nur owner. */
export async function saveGarage(
  standortId: string,
  anschrift: { street: string; houseNumber: string; postalCode: string; city: string },
  treffer: GeocodeResult,
  bestaetigt: boolean,
): Promise<void> {
  const { error } = await getSupabase().rpc('set_location_garage', {
    p_location_id: standortId,
    p_street: anschrift.street,
    p_house_number: anschrift.houseNumber,
    p_postal_code: anschrift.postalCode,
    p_city: anschrift.city,
    p_lat: treffer.position.lat,
    p_lon: treffer.position.lon,
    p_precision: treffer.precision,
    p_confirmed: bestaetigt,
  });
  if (error) throw new Error('Die Garage konnte nicht gespeichert werden.');
}

/** Garage entfernen - danach beginnt und endet die Tour an der Praxis. */
export async function clearGarage(standortId: string): Promise<void> {
  const { error } = await getSupabase().rpc('clear_location_garage', {
    p_location_id: standortId,
  });
  if (error) throw new Error('Die Garage konnte nicht entfernt werden.');
}
