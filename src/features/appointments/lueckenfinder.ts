import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { Coordinate } from '@/lib/location/contract';
import { usePlanungsmatrizen } from '@/features/tours/fahrzeitfaktor';
import { fetchStandorte, tagesorte } from '@/features/tours/startort';
import { fetchDayRoute, type Tagesstopp } from '@/features/tours/tagesroute';
import { minutesOfDay, zeitpunktIn } from './api';
import type { Zeitband } from './calendar';
import { luftStufe, type Luftstufe } from './wegpruefung';
import { checkTravelFit, fetchVisitPosition, type Passfrage } from './wegpruefung-api';

// -----------------------------------------------------------------------------
// Lückenfinder (UBK-014, ANN-239; Teil 2 von CAL-015c, IDEA-PRX-029)
//
// Ist im Kalender eine Patient:in gewählt (`?patient=` - nur die Kennung,
// ADR-011), färbt die Tagesansicht jede freie Lücke in der Arbeitszeit:
// passt, knapp oder passt nicht - gerechnet vom Termin davor (oder vom
// Startort zum Arbeitsbeginn) zur Adresse dieser Person und weiter zum Termin
// danach (oder zum Startort bis Arbeitsende). Nur Auskunft: Jede Lücke bleibt
// antippbar, nichts sperrt (ANN-097).
//
// Die Fahrzeiten kommen aus zwei Matrizen je Spalte - von jedem Ort des
// Tages zur Person und von ihr zu jedem Ort -, mit dem Fahrzeitfaktor
// (ANN-237). Zum Kartendienst gehen nur Koordinaten (ADR-019 Punkt 12, 13).
// Die Matrix-Schnittstelle ist gegen den echten Dienst noch nicht geprüft;
// scheitert sie, steht „nicht geprüft" statt Farben.
// -----------------------------------------------------------------------------

/** Kürzer zeigt der Lückenfinder keine Lücke - ein Streifen wäre nicht lesbar. */
export const MIN_LUECKE_MINUTEN = 15;

export interface LueckenSpalte {
  /** Kennung der Spalte im Gitter. */
  readonly id: string;
  readonly person: string;
  /** Arbeitszeit; `null`, solange sie nicht geladen ist. */
  readonly baender: readonly Zeitband[] | null;
  /** Was die Person an diesem Tag belegt: Termine (ohne Absagen) und Fehlzeiten. */
  readonly belegt: readonly Zeitband[];
}

export type Lueckenstufe = Luftstufe | 'zu_kurz' | 'ungeprueft' | 'laedt';

export interface BewerteteLuecke {
  readonly vonMinute: number;
  readonly bisMinute: number;
  readonly stufe: Lueckenstufe;
  /** Frühester Beginn nach der Anfahrt, als Zeitpunkt. */
  readonly ab: string | null;
}

export type Lueckenfinder =
  | { readonly stand: 'aus' }
  | { readonly stand: 'laedt' }
  | { readonly stand: 'nicht_verortet' }
  | {
      readonly stand: 'bereit';
      readonly jeSpalte: ReadonlyMap<string, readonly BewerteteLuecke[]>;
      /** Mindestens eine Lücke blieb ungeprüft - die Seite sagt es dazu. */
      readonly ungeprueft: boolean;
    };

/**
 * Die freien Lücken innerhalb der Arbeitszeit: Bänder minus Belegtes, ab
 * `minLaenge` Minuten. Überschneidungen im Belegten werden zusammengelegt.
 */
export function freieLuecken(
  baender: readonly Zeitband[],
  belegt: readonly Zeitband[],
  minLaenge: number = MIN_LUECKE_MINUTEN,
): Zeitband[] {
  const besetzt = [...belegt].sort((a, b) => a.vonMinute - b.vonMinute);
  const luecken: Zeitband[] = [];
  for (const band of [...baender].sort((a, b) => a.vonMinute - b.vonMinute)) {
    let stand = band.vonMinute;
    for (const b of besetzt) {
      if (b.bisMinute <= stand || b.vonMinute >= band.bisMinute) continue;
      if (b.vonMinute > stand) luecken.push({ vonMinute: stand, bisMinute: b.vonMinute });
      stand = Math.max(stand, b.bisMinute);
      if (stand >= band.bisMinute) break;
    }
    if (stand < band.bisMinute) luecken.push({ vonMinute: stand, bisMinute: band.bisMinute });
  }
  return luecken.filter((l) => l.bisMinute - l.vonMinute >= minLaenge);
}

function schluessel(position: Coordinate): string {
  return `${position.lat},${position.lon}`;
}

function positionDes(stopp: Tagesstopp): Coordinate | null {
  if (stopp.address_outdated === true || stopp.lat === null || stopp.lon === null) return null;
  return { lat: stopp.lat, lon: stopp.lon };
}

interface Umfeld {
  /** Wo die Person vor der Lücke ist - `null`, wenn unbekannt. */
  vor: Coordinate | null;
  /** Wohin sie nach der Lücke muss - `null`, wenn unbekannt. */
  nach: Coordinate | null;
}

/**
 * Wo die Person vor und nach einer Lücke ist: der letzte Stopp, der davor
 * endet, sonst der Startort; der erste, der danach beginnt, sonst der
 * Startort zum Feierabend. Ein Stopp ohne Koordinate macht die Seite
 * unbekannt - ungeprüft ist nicht „passt" (MAP-004b).
 */
export function umfeldDer(
  luecke: Zeitband,
  stopps: readonly Tagesstopp[],
  orte: { start: Coordinate | null; ende: Coordinate | null },
  zeitzone: string,
): Umfeld {
  let vorher: Tagesstopp | null = null;
  let nachher: Tagesstopp | null = null;
  for (const stopp of stopps) {
    const ende = minutesOfDay(stopp.ends_at, zeitzone);
    const beginn = minutesOfDay(stopp.starts_at, zeitzone);
    if (ende <= luecke.vonMinute && (!vorher || ende > minutesOfDay(vorher.ends_at, zeitzone))) {
      vorher = stopp;
    }
    if (
      beginn >= luecke.bisMinute &&
      (!nachher || beginn < minutesOfDay(nachher.starts_at, zeitzone))
    ) {
      nachher = stopp;
    }
  }
  return {
    vor: vorher ? positionDes(vorher) : orte.start,
    nach: nachher ? positionDes(nachher) : orte.ende,
  };
}

/** Die Lücken eines Tages mit Patient:in, Arbeitszeit, Belegung und Route. */
export function useLueckenfinder({
  spalten,
  datum,
  patientId,
  zeitzone,
  dauer,
  aktiv,
  abMinute = 0,
}: {
  spalten: readonly LueckenSpalte[];
  datum: string;
  patientId: string | null;
  zeitzone: string | null;
  /** Länge des Termins, für den eine Lücke gesucht wird. */
  dauer: number;
  /** Rolle darf die Tagesroute lesen, Tag ab heute, Tagesansicht. */
  aktiv: boolean;
  /** Heute: Eine Lücke beginnt frühestens in dieser Minute; was davor endet, entfällt. */
  abMinute?: number;
}): Lueckenfinder {
  const an = aktiv && patientId !== null && zeitzone !== null && spalten.length > 0;

  const adresse = useQuery({
    queryKey: ['visit-position', patientId],
    queryFn: () => fetchVisitPosition(patientId!),
    enabled: an,
    retry: false,
  });
  const standorte = useQuery({
    queryKey: ['standorte'],
    queryFn: fetchStandorte,
    enabled: an,
    retry: false,
  });
  const routen = useQueries({
    queries: (an ? spalten : []).map((s) => ({
      queryKey: ['day-route', datum, s.person],
      queryFn: () => fetchDayRoute(datum, s.person),
      retry: false,
    })),
  });

  const ziel = adresse.data ?? null;
  const orte = useMemo(() => tagesorte(standorte.data), [standorte.data]);

  // Je Spalte: Lücken, ihr Umfeld und die Orte für die beiden Matrizen.
  const plan = useMemo(() => {
    if (!an || !ziel || !standorte.data || zeitzone === null) return null;
    return spalten.map((s, i) => {
      const stopps = routen[i]?.data;
      if (!s.baender || !stopps) return null;
      // Heute beginnt eine Lücke frühestens jetzt: Der Server rechnet die
      // Anfahrt ab ihrem Beginn, und was davor liegt, ist vorbei.
      const ab = s.baender
        .map((b) => ({ vonMinute: Math.max(b.vonMinute, abMinute), bisMinute: b.bisMinute }))
        .filter((b) => b.bisMinute > b.vonMinute);
      const luecken = freieLuecken(ab, s.belegt);
      const umfeld = luecken.map((l) => umfeldDer(l, stopps, orte, zeitzone));
      const orteDerSpalte = [
        ...new Map(
          umfeld
            .flatMap((u) => [u.vor, u.nach])
            .filter((p): p is Coordinate => p !== null)
            .map((p) => [schluessel(p), p]),
        ).values(),
      ];
      return { spalte: s.id, luecken, umfeld, orte: orteDerSpalte };
    });
    // `routen` ist je Rendern ein neues Feld; gezählt wird sein Stand.
  }, [
    an,
    ziel,
    standorte.data,
    zeitzone,
    spalten,
    abMinute,
    orte,
    routen.map((r) => r.dataUpdatedAt).join(),
  ]);

  // Zwei Matrizen je Spalte: von jedem Ort zur Person, von ihr zu jedem Ort.
  const anfragen = useMemo(
    () =>
      (plan ?? []).flatMap((p) =>
        p && p.orte.length > 0 && ziel
          ? [
              { origins: p.orte, destinations: [ziel] },
              { origins: [ziel], destinations: p.orte },
            ]
          : [],
      ),
    [plan, ziel],
  );
  const matrizen = usePlanungsmatrizen(anfragen);

  // Je Spalte die Fragen an den Server: ohne festen Beginn, frühester nach der Anfahrt.
  const fragen = useMemo(() => {
    if (!plan || zeitzone === null) return [];
    let m = 0;
    return plan.map((p) => {
      if (!p || p.orte.length === 0) return null;
      const hin = matrizen[m];
      const zurueck = matrizen[m + 1];
      m += 2;
      if (!hin?.data || !zurueck?.data) {
        return hin?.isError || zurueck?.isError ? { fehler: true as const } : null;
      }
      if (!hin.data.ok || !zurueck.data.ok) return { fehler: true as const };
      const zuIhr = hin.data.value.matrix.durationsSeconds;
      const vonIhr = zurueck.data.value.matrix.durationsSeconds[0] ?? [];
      const index = new Map(p.orte.map((o, i) => [schluessel(o), i]));
      const items: Passfrage[] = [];
      p.luecken.forEach((l, i) => {
        const { vor, nach } = p.umfeld[i]!;
        if (l.bisMinute - l.vonMinute < dauer || !vor || !nach) return;
        const hinSek = zuIhr[index.get(schluessel(vor)) ?? -1]?.[0] ?? null;
        const zurueckSek = vonIhr[index.get(schluessel(nach)) ?? -1] ?? null;
        if (hinSek === null || zurueckSek === null) return;
        items.push({
          index: i,
          duration_minutes: dauer,
          previous_end: zeitpunktIn(datum, l.vonMinute, zeitzone),
          travel_to_seconds: Math.round(hinSek),
          next_start: zeitpunktIn(datum, l.bisMinute, zeitzone),
          travel_from_seconds: Math.round(zurueckSek),
        });
      });
      return { items };
    });
  }, [plan, matrizen, dauer, datum, zeitzone]);

  const pruefungen = useQueries({
    queries: fragen.map((f) => ({
      queryKey: ['travel-fit', f && 'items' in f ? f.items : null],
      queryFn: () => checkTravelFit(f && 'items' in f ? f.items : []),
      enabled: f !== null && 'items' in f && f.items.length > 0,
      retry: false,
      gcTime: 30_000,
    })),
  });

  if (!an) return { stand: 'aus' };
  if (adresse.isError || standorte.isError) {
    return { stand: 'bereit', jeSpalte: new Map(), ungeprueft: true };
  }
  if (adresse.data === undefined || !standorte.data) return { stand: 'laedt' };
  if (adresse.data === null) return { stand: 'nicht_verortet' };
  if (!plan) return { stand: 'laedt' };

  const jeSpalte = new Map<string, BewerteteLuecke[]>();
  let ungeprueft = false;
  plan.forEach((p, i) => {
    if (!p) return;
    const frage = fragen[i];
    const pruefung = pruefungen[i];
    const fehler =
      (frage !== null && frage !== undefined && 'fehler' in frage) || pruefung?.isError === true;
    const antworten = new Map((pruefung?.data ?? []).map((a) => [a.item_index, a]));
    const bewertet = p.luecken.map((l, k): BewerteteLuecke => {
      if (l.bisMinute - l.vonMinute < dauer) {
        return { ...l, stufe: 'zu_kurz', ab: null };
      }
      const antwort = antworten.get(k);
      if (fehler || !p.umfeld[k]!.vor || !p.umfeld[k]!.nach) {
        ungeprueft = true;
        return { ...l, stufe: 'ungeprueft', ab: null };
      }
      const gefragt = frage && 'items' in frage && frage.items.some((it) => it.index === k);
      // Gefragt wird nicht, wenn eine Fahrzeit fehlt (Ersatzschätzung, ADR-019
      // Punkt 38): Diese Lücke bleibt ungeprüft.
      if (frage && 'items' in frage && !gefragt) {
        ungeprueft = true;
        return { ...l, stufe: 'ungeprueft', ab: null };
      }
      if (!antwort) return { ...l, stufe: 'laedt', ab: null };
      if (antwort.departure_slack_minutes === null) {
        ungeprueft = true;
        return { ...l, stufe: 'ungeprueft', ab: null };
      }
      return { ...l, stufe: luftStufe(antwort.departure_slack_minutes), ab: antwort.starts_at };
    });
    jeSpalte.set(p.spalte, bewertet);
  });
  return { stand: 'bereit', jeSpalte, ungeprueft };
}
