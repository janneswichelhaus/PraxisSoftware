import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type { Coordinate } from '@/lib/location/contract';
import { useRoute } from '@/lib/location/route';
import { fetchDayPlan } from '@/features/today/api';
import {
  PRAXISPROFIL,
  fahrzeitZwischen,
  fetchDayRoute,
  routenplan,
  stoppsDesTages,
  type Stopp,
} from './tagesroute';

/**
 * Fahrzeiten und Fahrpuffer der Tagesroute (MAP-006c, §8.1, ANN-097).
 *
 * Die Fahrzeit kommt aus der Route, die ohnehin für die Karte abgerufen wird
 * — ein Aufruf beim Anbieter, nicht einer je Paar. Ob sie zwischen zwei
 * Termine passt, entscheidet **nicht** diese Datei, sondern
 * `check_travel_buffers` mit der Rundungsregel aus §8.1. Nichts davon wird
 * gespeichert: Route und Prüfung leben im Zwischenspeicher der Seite.
 */

const pruefungSchema = z.object({
  from_appointment_id: z.string(),
  to_appointment_id: z.string(),
  travel_seconds: z.number(),
  earliest_start: z.string(),
  shortfall_minutes: z.number(),
});

export type Pufferpruefung = z.infer<typeof pruefungSchema>;

export interface Paar {
  readonly from: string;
  readonly to: string;
  readonly travel_seconds: number;
}

export async function checkTravelBuffers(paare: readonly Paar[]): Promise<Pufferpruefung[]> {
  if (paare.length === 0) return [];
  const { data, error } = (await getSupabase().rpc('check_travel_buffers', {
    p_legs: paare,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Der Fahrpuffer konnte nicht geprüft werden.');
  return z.array(pruefungSchema).parse(data ?? []);
}

/** Tagesliste und Tagesroute einer Person, zusammengeführt (MAP-006b). */
export function useTagesstopps(tag: string, person: string, stand = '') {
  const plan = useQuery({
    queryKey: ['day-plan', tag, person, stand],
    queryFn: () => fetchDayPlan(tag, person),
    enabled: person !== '',
    retry: false,
  });
  const route = useQuery({
    queryKey: ['day-route', tag, person, stand],
    queryFn: () => fetchDayRoute(tag, person),
    enabled: person !== '',
    retry: false,
  });
  const stopps = useMemo(
    () => (plan.data && route.data ? stoppsDesTages(plan.data, route.data) : []),
    [plan.data, route.data],
  );
  return {
    stopps,
    laedt: person !== '' && (plan.isPending || route.isPending),
    fehler: plan.isError || route.isError,
  };
}

/**
 * Die Route über die Stopps und die Prüfung jedes aufeinanderfolgenden Paares.
 *
 * `zwischen[i]` gehört zum Übergang von Stopp i zu Stopp i+1: die Fahrzeit
 * (oder `null`, wenn sie unbekannt ist) und, sobald geprüft, das Ergebnis des
 * Servers.
 */
export function useFahrten(start: Coordinate | null, stopps: readonly Stopp[]) {
  const plan = useMemo(() => routenplan(start, stopps), [start, stopps]);
  const route = useRoute(plan.punkte, PRAXISPROFIL);
  const abschnitte = route.data?.ok === true ? route.data.value.route.legs : null;

  const fahrzeiten = useMemo(
    () =>
      stopps.slice(1).map((stopp, i) => ({
        from: stopps[i]!.termin.id,
        to: stopp.termin.id,
        sekunden: fahrzeitZwischen(plan.index[i] ?? null, plan.index[i + 1] ?? null, abschnitte),
      })),
    [stopps, plan.index, abschnitte],
  );

  const paare: Paar[] = fahrzeiten.flatMap((f) =>
    f.sekunden === null ? [] : [{ from: f.from, to: f.to, travel_seconds: Math.round(f.sekunden) }],
  );

  const pruefung = useQuery({
    queryKey: ['travel-buffers', paare],
    queryFn: () => checkTravelBuffers(paare),
    enabled: paare.length > 0,
    retry: false,
    gcTime: 30_000,
  });

  const nachVon = new Map((pruefung.data ?? []).map((p) => [p.from_appointment_id, p]));
  const zwischen = fahrzeiten.map((f) => ({
    sekunden: f.sekunden,
    pruefung: nachVon.get(f.from) ?? null,
  }));

  return { route, zwischen, pruefungFehler: pruefung.isError };
}
