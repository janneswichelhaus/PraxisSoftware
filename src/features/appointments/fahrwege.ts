import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { Coordinate } from '@/lib/location/contract';
import type { Routenquelle } from '@/lib/location/route';
import { usePlanungsrouten } from '@/features/tours/fahrzeitfaktor';
import { fetchStandorte, tagesorte } from '@/features/tours/startort';
import {
  fahrzeitZwischen,
  fetchDayRoute,
  routenplan,
  streckeZwischen,
  type Tagesstopp,
} from '@/features/tours/tagesroute';
import { minutesOfDay } from './api';

// -----------------------------------------------------------------------------
// Fahrwege als Blöcke im Kalender (UBK-005, ANN-235, ADR-019 Punkt 3)
//
// Vor jedem Besuch steht im Raster ein Block so lang wie die Fahrzeit dorthin
// - vom Besuch davor oder, beim ersten des Tages, vom Startort der Praxis.
// Die Fahrzeit kommt aus derselben Route, die Übersicht und Tour abrufen:
// die Punkte des Tages (`list_day_route`, nur Kennung, Zeit und Koordinate)
// und eine Route über die eigene Function, an die nur Koordinaten und das
// Profil gehen (ADR-019 Punkte 12, 13 und 15). Gespeichert wird nichts
// (Punkt 16): Die Blöcke leben im Zwischenspeicher der Seite.
//
// Ein Block ist Darstellung, keine Prüfung. Ob ein Übergang zu knapp ist,
// entscheidet allein der Server mit der Rundungsregel aus §8.1 (ANN-097,
// `FahrpufferHinweis`); der Block zeigt nur, wie weit die Fahrt reicht.
// -----------------------------------------------------------------------------

/**
 * ANN-235: Der Kalender ruft Fahrwege **beim Anzeigen** ab, für jede Spalte
 * einer Person und eines Tages ab heute. Steht der Schalter auf `false`,
 * fragt der Kalender nichts mehr an, und die Blöcke entfallen ohne weitere
 * Änderung.
 */
export const FAHRWEGE_IM_KALENDER = true;

/** Ein Block im Raster: die Minuten des Tages, in denen gefahren wird. */
export interface Fahrweg {
  /** Der Termin, zu dem gefahren wird. */
  terminId: string;
  vonMinute: number;
  bisMinute: number;
  /** Die Fahrzeit in ganzen Minuten. */
  minuten: number;
  /** Die Strecke in Metern, wenn der Kartendienst sie nennt (UBK-016). */
  meter?: number | null;
  /**
   * Der Rückweg nach dem letzten Besuch zur Garage oder Praxis (UBK-015):
   * Er beginnt am Ende dieses Termins, statt vor seinem Beginn zu enden.
   */
  rueckweg?: boolean;
  /**
   * Die Anschrift am Termin weicht von der Akte ab (ANN-236): keine Fahrzeit,
   * sondern ein Warnblock fester Länge (`VERALTET_MINUTEN`).
   */
  veraltet?: boolean;
}

/** Länge des Warnblocks vor einem Termin mit veralteter Anschrift - nur Darstellung. */
export const VERALTET_MINUTEN = 15;

/**
 * Warnblöcke für die Termine, deren Anschrift nicht mehr zur Akte passt
 * (ANN-236). Der Server gibt für sie keine Koordinate; statt still keinen
 * Weg zu zeigen, sagt der Kalender, warum.
 */
export function veralteteWege(punkte: readonly Tagesstopp[], zeitzone: string): Fahrweg[] {
  return punkte
    .filter((punkt) => punkt.address_outdated === true)
    .map((punkt) => {
      const beginn = minutesOfDay(punkt.starts_at, zeitzone);
      return {
        terminId: punkt.id,
        vonMinute: beginn - VERALTET_MINUTEN,
        bisMinute: beginn,
        minuten: 0,
        veraltet: true,
      };
    });
}

/** Eine Spalte, für die Fahrwege gefragt sind: eine Person an einem Tag. */
export interface FahrwegSpalte {
  id: string;
  datum: string;
  person: string;
}

/** Die Punkte eines Tages in Fahrtreihenfolge, mit Position, wo sie bekannt ist. */
function stoppsAus(punkte: readonly Tagesstopp[]) {
  return [...punkte]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((punkt) => ({
      punkt,
      position:
        punkt.lat !== null && punkt.lon !== null ? { lat: punkt.lat, lon: punkt.lon } : null,
    }));
}

/**
 * Die Wegpunkte der Route einer Spalte - dieselben wie in der Tour mit ihrer
 * Voreinstellung (UBK-015): Start, die Stopps, das Ende.
 */
export function wegpunkte(
  punkte: readonly Tagesstopp[],
  start: Coordinate | null,
  ende: Coordinate | null = null,
): Coordinate[] {
  return routenplan(start, mitEnde(stoppsAus(punkte), ende)).punkte;
}

function mitEnde<T extends { position: Coordinate | null }>(
  stopps: readonly T[],
  ende: Coordinate | null,
): { position: Coordinate | null }[] {
  return ende && stopps.length > 0 ? [...stopps, { position: ende }] : [...stopps];
}

/**
 * Die Fahrwege eines Tages aus seinen Punkten und den Abschnitten der Route.
 *
 * Kein Block entsteht, wo die Fahrzeit unbekannt ist (Position fehlt, Route
 * fehlt, kein Startort vor dem ersten Stopp) oder wo nicht gefahren wird (zwei
 * Termine am selben Ort): ungeprüft ist nicht „kurz" (MAP-004b), und eine
 * Ersatzschätzung ist keine Fahrzeit (ADR-019 Punkt 38). Gerundet wird auf
 * Minuten wie in Tour und Übersicht.
 */
export function fahrwegeAusRoute(
  punkte: readonly Tagesstopp[],
  start: Coordinate | null,
  abschnitte:
    readonly { readonly durationSeconds: number; readonly distanceMeters?: number }[] | null,
  zeitzone: string,
  ende: Coordinate | null = null,
): Fahrweg[] {
  const stopps = stoppsAus(punkte);
  const { index } = routenplan(start, mitEnde(stopps, ende));
  const strecke = (von: number | null, nach: number | null) =>
    abschnitte && abschnitte.every((a) => typeof a.distanceMeters === 'number')
      ? streckeZwischen(von, nach, abschnitte as readonly { readonly distanceMeters: number }[])
      : null;
  const wege: Fahrweg[] = [];
  stopps.forEach(({ punkt }, i) => {
    const hier = index.at(i) ?? null;
    const davor = i === 0 ? (start ? 0 : null) : (index.at(i - 1) ?? null);
    const sekunden = fahrzeitZwischen(davor, hier, abschnitte);
    if (sekunden === null) return;
    const minuten = Math.round(sekunden / 60);
    if (minuten <= 0) return;
    const beginn = minutesOfDay(punkt.starts_at, zeitzone);
    wege.push({
      terminId: punkt.id,
      vonMinute: beginn - minuten,
      bisMinute: beginn,
      minuten,
      meter: strecke(davor, hier),
    });
  });
  // UBK-015: der Rückweg vom letzten Besuch zur Garage oder Praxis.
  const letzter = stopps.at(-1);
  if (ende && letzter) {
    const von = index.at(stopps.length - 1) ?? null;
    const nach = index.at(stopps.length) ?? null;
    const sekunden = fahrzeitZwischen(von, nach, abschnitte);
    const minuten = sekunden === null ? 0 : Math.round(sekunden / 60);
    if (minuten > 0) {
      const ab = minutesOfDay(letzter.punkt.ends_at, zeitzone);
      wege.push({
        terminId: letzter.punkt.id,
        vonMinute: ab,
        bisMinute: ab + minuten,
        minuten,
        meter: strecke(von, nach),
        rueckweg: true,
      });
    }
  }
  return wege;
}

export interface Fahrwege {
  /** Die Blöcke je Spalte; eine Spalte ohne Eintrag hat keine. */
  jeSpalte: ReadonlyMap<string, readonly Fahrweg[]>;
  /** Ob eine der Routen eine Nachbildung ohne Kartendienst ist - die Seite sagt es dazu. */
  nachbildung: boolean;
}

const KEINE: Fahrwege = { jeSpalte: new Map(), nachbildung: false };

/**
 * Die Fahrwege der gezeigten Spalten.
 *
 * Je Spalte die Punkte des Tages und eine Route, mit denselben Schlüsseln wie
 * Übersicht (`useTagesfahrzeiten`) und Tour: Der Zwischenspeicher teilt sie,
 * und dieselben Stopps kosten beim Anbieter nur einmal. Scheitert eine
 * Abfrage, bleibt die Spalte ohne Blöcke; einen Fehlerkasten gibt es nicht,
 * weil der Kalender ohne sie vollständig ist.
 */
export function useFahrwege({
  spalten,
  heute,
  zeitzone,
  aktiv,
}: {
  spalten: readonly FahrwegSpalte[];
  heute: string;
  zeitzone: string | null;
  /** Darf die Rolle die Tagesroute lesen? Der Server gibt sie nur Praxisrollen. */
  aktiv: boolean;
}): Fahrwege {
  // Ein vergangener Tag wird nicht mehr geplant (ANN-235): keine Abfrage.
  const gefragt = FAHRWEGE_IM_KALENDER && aktiv && zeitzone !== null;
  const offen = gefragt ? spalten.filter((s) => s.datum >= heute) : [];

  const standorte = useQuery({
    queryKey: ['standorte'],
    queryFn: fetchStandorte,
    enabled: offen.length > 0,
    retry: false,
  });
  // UBK-015, ANN-240: Beginn und Ende an der Garage, falls gesetzt.
  const orte = useMemo(() => tagesorte(standorte.data), [standorte.data]);
  const start = orte.start;

  const tagesrouten = useQueries({
    queries: offen.map((s) => ({
      queryKey: ['day-route', s.datum, s.person],
      queryFn: () => fetchDayRoute(s.datum, s.person),
      retry: false,
    })),
  });

  // Erst wenn feststeht, ob es einen Startort gibt - sonst gingen je Spalte
  // zwei Routen hinaus, eine ohne und gleich darauf eine mit Startpunkt.
  const startBekannt = !standorte.isPending;
  const punkteJeSpalte = offen.map((_, i) =>
    startBekannt && tagesrouten[i]?.data ? wegpunkte(tagesrouten[i].data, start, orte.ende) : [],
  );

  // Eine Route je verschiedener Folge von Wegpunkten: Zwei Spalten mit
  // denselben Punkten teilen sich die Antwort, und eine Spalte ohne Fahrt
  // fragt gar nicht.
  const folgen = [
    ...new Map(
      punkteJeSpalte.filter((punkte) => punkte.length >= 2).map((p) => [JSON.stringify(p), p]),
    ).entries(),
  ];
  // Derselbe Schlüssel wie in Übersicht und Tour: Sie teilen die Antwort,
  // und der Fahrzeitfaktor greift an derselben Stelle (UBK-010).
  const routen = usePlanungsrouten(folgen.map(([, punkte]) => punkte));
  const routeZu = new Map(folgen.map(([schluessel], i) => [schluessel, routen[i]?.data]));

  if (!gefragt || zeitzone === null) return KEINE;
  const jeSpalte = new Map<string, readonly Fahrweg[]>();
  let quelle: Routenquelle | null = null;
  offen.forEach((spalte, i) => {
    const punkte = tagesrouten[i]?.data;
    if (!punkte) return;
    const antwort = routeZu.get(JSON.stringify(punkteJeSpalte[i]));
    const wege = veralteteWege(punkte, zeitzone);
    if (antwort?.ok === true) {
      if (antwort.value.quelle === 'nachbildung') quelle = 'nachbildung';
      wege.push(...fahrwegeAusRoute(punkte, start, antwort.value.route.legs, zeitzone, orte.ende));
    }
    if (wege.length > 0) jeSpalte.set(spalte.id, wege);
  });
  return { jeSpalte, nachbildung: quelle === 'nachbildung' };
}
