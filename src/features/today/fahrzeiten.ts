import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Coordinate } from '@/lib/location/contract';
import { useRoute, type Routenquelle } from '@/lib/location/route';
import { fetchStandorte, startpunkt } from '@/features/tours/startort';
import {
  PRAXISPROFIL,
  fahrzeitZwischen,
  fetchDayRoute,
  routenplan,
  stoppsDesTages,
  type Stopp,
} from '@/features/tours/tagesroute';
import type { DayPlanEntry } from './api';
import type { Anfahrt } from './tagesstart';

// -----------------------------------------------------------------------------
// Fahrzeiten des eigenen Tages für die Übersicht (Design-Handoff 2026-10-01)
//
// Der Wegbalken und die Übergänge im Zeitstrahl brauchen die geschätzte
// Fahrzeit zu jedem Besuch. Sie kommt aus derselben Route, die Tour und
// Kalender schon abrufen (MAP-006b/c): Koordinaten in Fahrtreihenfolge über
// die eigene Function, keine Namen, keine Kennungen, keine Uhrzeiten (ADR-019
// Punkt 12, 13 und 15). Gespeichert wird nichts - die Route lebt im
// Zwischenspeicher der Seite und ist danach fort (ADR-019 Punkt 16).
// -----------------------------------------------------------------------------

/**
 * ANN-194: Die Übersicht ruft die Route des eigenen Tages **beim Öffnen** ab,
 * solange noch ein Besuch mit Ort aussteht.
 *
 * Bis zum Design-Handoff vom 2026-10-01 geschah das auf der Übersicht erst
 * beim Aufklappen der Karte; ohne Fahrzeit gäbe es aber keinen Wegbalken, und
 * der ist die Auskunft, mit der der Tag beginnt. Dies ist die eine Stelle, an
 * der die Annahme greift: Steht der Schalter auf `false`, fragt die Übersicht
 * nichts mehr an, und Wegbalken, Übergänge und „Anfahrt ≈ …" entfallen ohne
 * weitere Änderung. Die Karte mit ihren Kacheln lädt weiterhin erst, wenn sie
 * jemand aufklappt (`TagesrouteAufklapper`).
 */
export const FAHRZEITEN_BEIM_OEFFNEN = true;

/**
 * Die Anfahrt zu jedem Stopp der Tagesroute, nach Terminkennung.
 *
 * Die Fahrzeit eines Stopps ist der Abschnitt der Route vom Wegpunkt davor -
 * dem Stopp davor oder, beim ersten, dem Startort der Praxis. Kein Eintrag
 * entsteht, wo die Fahrzeit unbekannt ist (Position fehlt, Route fehlt, kein
 * Startort vor dem ersten Stopp) oder wo nicht gefahren wird (zwei Termine am
 * selben Ort): ungeprüft ist nicht „kurz" (MAP-004b).
 *
 * Gerundet wird auf Minuten wie in der Tour (`formatiereFahrzeit`).
 */
export function anfahrtenAusRoute(
  stopps: readonly Stopp[],
  start: Coordinate | null,
  abschnitte: readonly { readonly durationSeconds: number }[] | null,
): Map<string, Anfahrt> {
  const { index } = routenplan(start, stopps);
  const anfahrten = new Map<string, Anfahrt>();
  stopps.forEach((stopp, i) => {
    const hier = index.at(i) ?? null;
    const davor = i === 0 ? (start ? 0 : null) : (index.at(i - 1) ?? null);
    const sekunden = fahrzeitZwischen(davor, hier, abschnitte);
    if (sekunden === null) return;
    const minuten = Math.round(sekunden / 60);
    if (minuten <= 0) return;
    anfahrten.set(stopp.termin.id, { minuten, vorher: i === 0 ? null : stopps[i - 1]!.termin });
  });
  return anfahrten;
}

/** Steht heute noch ein Besuch mit Ort aus? Sonst gibt es keinen Weg zu rechnen. */
function hatAusstehendenWeg(plan: readonly DayPlanEntry[]): boolean {
  return plan.some(
    (termin) =>
      termin.status === 'confirmed' &&
      (termin.kind === 'therapy' || termin.kind === 'training') &&
      (termin.appointment_type === 'home_visit' || termin.appointment_type === 'practice'),
  );
}

export interface Tagesfahrzeiten {
  /** Die Anfahrt je Termin; leer, solange nichts bekannt ist. */
  anfahrten: ReadonlyMap<string, Anfahrt>;
  /**
   * Woher die Fahrzeiten stammen. Eine Nachbildung ohne Kartendienst sieht
   * aus wie eine Fahrzeit - die Seite muss es dazusagen.
   */
  quelle: Routenquelle | null;
}

const KEINE: ReadonlyMap<string, Anfahrt> = new Map();

/**
 * Die Fahrzeiten des eigenen Tages.
 *
 * Drei Abfragen, die die Tour ebenso stellt und mit denselben Schlüsseln -
 * der Zwischenspeicher teilt sie: die Punkte der Tagesroute
 * (`list_day_route`), der Startort der Praxis und **eine** Route über alle
 * Stopps. Scheitert eine davon, bleibt die Übersicht ohne Fahrzeiten stehen;
 * einen Fehlerkasten gibt es dafür nicht, weil nichts fehlt, was sie
 * versprochen hätte.
 */
export function useTagesfahrzeiten({
  datum,
  staffMemberId,
  plan,
  aktiv,
}: {
  datum: string;
  staffMemberId: string;
  plan: readonly DayPlanEntry[] | undefined;
  /** Darf die Rolle die Tagesroute lesen? Der Server gibt sie nur Praxisrollen. */
  aktiv: boolean;
}): Tagesfahrzeiten {
  const fragen = FAHRZEITEN_BEIM_OEFFNEN && aktiv && plan !== undefined && hatAusstehendenWeg(plan);

  const tagesroute = useQuery({
    queryKey: ['day-route', datum, staffMemberId],
    queryFn: () => fetchDayRoute(datum, staffMemberId),
    enabled: fragen,
    retry: false,
  });
  const standorte = useQuery({
    queryKey: ['standorte'],
    queryFn: fetchStandorte,
    enabled: fragen,
    retry: false,
  });

  const stopps = useMemo(
    () => (plan && tagesroute.data ? stoppsDesTages(plan, tagesroute.data) : []),
    [plan, tagesroute.data],
  );
  // Erst wenn feststeht, ob es einen Startort gibt: Sonst gingen zwei Routen
  // hinaus - eine ohne und gleich darauf eine mit Startpunkt.
  const start = useMemo(() => startpunkt(standorte.data?.[0]), [standorte.data]);
  const punkte = useMemo(() => routenplan(start, stopps).punkte, [start, stopps]);
  const route = useRoute(punkte, PRAXISPROFIL, { aktiv: fragen && !standorte.isPending });

  return useMemo(() => {
    if (route.data?.ok !== true) return { anfahrten: KEINE, quelle: null };
    return {
      anfahrten: anfahrtenAusRoute(stopps, start, route.data.value.route.legs),
      quelle: route.data.value.quelle,
    };
  }, [route.data, stopps, start]);
}
