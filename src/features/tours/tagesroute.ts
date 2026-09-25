import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type {
  Coordinate,
  MapOverlayStop,
  NavigationTarget,
  TravelProfile,
} from '@/lib/location/contract';
import { navigationsZiel } from '@/lib/location/navigation';
import type { DayPlanEntry } from '@/features/today/api';

/**
 * Die Stopps der Tagesroute (MAP-006b, ADR-019).
 *
 * Zwei Lesepfade, zwei Zwecke: `list_day_plan` liefert, was die Person in der
 * Liste liest — Name, Anschrift, Rufnummer —, `list_day_route` liefert, was
 * die Karte braucht — Punkte, sonst nichts. Zusammengeführt wird hier im
 * Arbeitsspeicher; auf die Karte und zum Kartendienst gelangen allein die
 * Koordinaten und eine Nummer (ADR-019 Punkt 2 und 12). Gespeichert wird
 * nichts.
 */

const tagesstoppSchema = z.object({
  id: z.string(),
  kind: z.string(),
  appointment_type: z.enum(['home_visit', 'practice']),
  status: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  geocode_precision: z.enum(['address', 'street', 'locality', 'unknown']).nullable(),
  position_source: z.enum(['visit', 'location']),
});

export type Tagesstopp = z.infer<typeof tagesstoppSchema>;

export async function fetchDayRoute(datum: string, staffMemberId: string): Promise<Tagesstopp[]> {
  const { data, error } = (await getSupabase().rpc('list_day_route', {
    p_date: datum,
    p_staff_member_id: staffMemberId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Die Tagesroute konnte nicht geladen werden.');
  return z.array(tagesstoppSchema).parse(data ?? []);
}

/** Ein Stopp in der Liste: Nummer, Termin aus der Tagesliste, Punkt aus der Route. */
export interface Stopp {
  readonly nummer: number;
  readonly termin: DayPlanEntry;
  /** `null`, wenn die Adresse (noch) nicht verortet ist — der Stopp fehlt dann auf der Karte. */
  readonly position: Coordinate | null;
  readonly genauigkeit: Tagesstopp['geocode_precision'];
}

/**
 * Führt Tagesliste und Tagesroute zusammen, in Terminreihenfolge.
 *
 * Maßgeblich für **welche** Termine Stopps sind, ist die Route (ein Ort, nicht
 * abgesagt); die Tagesliste liefert nur die lesbaren Angaben dazu. Ein Termin,
 * den die Tagesliste nicht kennt, wird ausgelassen statt ohne Namen gezeigt.
 */
export function stoppsDesTages(
  plan: readonly DayPlanEntry[],
  route: readonly Tagesstopp[],
): Stopp[] {
  const nachId = new Map(plan.map((termin) => [termin.id, termin]));
  const stopps: Stopp[] = [];
  for (const punkt of [...route].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const termin = nachId.get(punkt.id);
    if (!termin) continue;
    stopps.push({
      nummer: stopps.length + 1,
      termin,
      position:
        punkt.lat !== null && punkt.lon !== null ? { lat: punkt.lat, lon: punkt.lon } : null,
      genauigkeit: punkt.geocode_precision,
    });
  }
  return stopps;
}

/**
 * Das Fahrprofil der Praxis: das Lastenrad (Entscheidung Jannes, 2026-09-22,
 * `TravelProfile` in `src/lib/location/contract.ts`). Eine Einstellung gibt
 * es nicht.
 */
export const PRAXISPROFIL: TravelProfile = 'cargo_bicycle';

/** Beschriftung des Startpunkts auf der Karte. */
export const START_LABEL = 'S';

/**
 * Die Marker der Karte — Koordinate und Nummer, **nie ein Name** (ANN-096).
 *
 * `MapOverlayStop` hat kein Feld für mehr; was hier nicht steht, kann die
 * Karte nicht zeigen und der Anbieter nicht sehen (ADR-019 Punkt 2 und 12).
 */
export function kartenmarker(start: Coordinate | null, stopps: readonly Stopp[]): MapOverlayStop[] {
  const marker: MapOverlayStop[] = start ? [{ position: start, label: START_LABEL }] : [];
  for (const stopp of stopps) {
    if (stopp.position) marker.push({ position: stopp.position, label: String(stopp.nummer) });
  }
  return marker;
}

/**
 * Die Wegpunkte der Route in Fahrtreihenfolge — und wo jeder Stopp darin liegt.
 *
 * Start (falls gewählt), dann jeder Stopp mit Position. Aufeinanderfolgende
 * gleiche Punkte (zwei Termine am selben Ort) fallen zusammen — dazwischen
 * wird nicht gefahren. `index[i]` ist der Wegpunkt des i-ten Stopps oder
 * `null`, wenn er keine Position hat.
 */
export function routenplan(
  start: Coordinate | null,
  stopps: readonly Stopp[],
): { readonly punkte: Coordinate[]; readonly index: (number | null)[] } {
  const punkte: Coordinate[] = [];
  const hinzu = (punkt: Coordinate): number => {
    const vorher = punkte.at(-1);
    if (vorher && vorher.lat === punkt.lat && vorher.lon === punkt.lon) return punkte.length - 1;
    punkte.push(punkt);
    return punkte.length - 1;
  };
  if (start) hinzu(start);
  const index = stopps.map((stopp) => (stopp.position ? hinzu(stopp.position) : null));
  return { punkte, index };
}

/**
 * Die Fahrzeit zwischen zwei aufeinanderfolgenden Stopps aus den Abschnitten
 * der Route, in Sekunden.
 *
 * `null`, wenn einem der beiden die Position fehlt oder die Route fehlt —
 * ungeprüft ist nicht „kurz" (MAP-004b). Liegen beide am selben Ort, ist sie 0.
 */
export function fahrzeitZwischen(
  von: number | null,
  nach: number | null,
  abschnitte: readonly { readonly durationSeconds: number }[] | null,
): number | null {
  if (von === null || nach === null || abschnitte === null) return null;
  if (nach < von) return null;
  let summe = 0;
  for (let i = von; i < nach; i += 1) {
    const abschnitt = abschnitte[i];
    if (!abschnitt) return null;
    summe += abschnitt.durationSeconds;
  }
  return summe;
}

/**
 * Das Navigationsziel eines Stopps (MAP-006d, ANN-018): die Koordinate, sonst
 * die Anschrift ohne Namen. Ein Praxistermin hat keines.
 */
export function zielDesStopps(stopp: Stopp): NavigationTarget | null {
  if (stopp.position && stopp.termin.appointment_type === 'home_visit') {
    return { kind: 'coordinate', position: stopp.position };
  }
  return navigationsZiel(stopp.termin);
}
