import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Coordinate } from '@/lib/location/contract';
import { fetchWorkingHourExceptions, fetchWorkingHours } from '@/features/scheduling/api';
import { usePlanungsroute } from '@/features/tours/fahrzeitfaktor';
import { fetchStandorte, tagesorte } from '@/features/tours/startort';
import {
  fahrzeitZwischen,
  fetchDayRoute,
  routenplan,
  type Tagesstopp,
} from '@/features/tours/tagesroute';
import { zeitpunktIn } from './api';
import { arbeitszeitBaender, type Zeitband } from './calendar';
import { checkTravelFit, fetchVisitPosition, type Passfrage } from './wegpruefung-api';

// -----------------------------------------------------------------------------
// „Passt es?“ - An- und Weiterfahrt eines geplanten Termins (UBK-012, ANN-238)
//
// Sobald Person, Zeit und Ort feststehen, sagt diese Prüfung, ob der Weg vom
// Termin davor und zum Termin danach in die Zeit passt. Gibt es davor oder
// danach keinen Termin mit Ort, zählt der Arbeitsbeginn bzw. das Arbeitsende
// am Startort der Praxis. Dieselbe Prüfung nutzen Terminformular, die
// Ziehvorschau im Kalender (UBK-013) und - ohne festen Beginn - der
// Lückenfinder (UBK-014).
//
// Zum Kartendienst gehen nur Koordinaten (ADR-019 Punkt 12 und 13), über die
// Route der Praxis mit Fahrzeitfaktor (ANN-237). Gerundet wird allein im
// Server (`check_travel_fit`, ANN-097). Nur Auskunft: Nichts hier sperrt.
// -----------------------------------------------------------------------------

/**
 * ANN-238: Stufen der Luft, dieselben Grenzen wie der Wegbalken (ANN-195):
 * ab fünf Minuten passt es, darunter ist es knapp, unter null zu knapp.
 */
export type Luftstufe = 'passt' | 'knapp' | 'nicht';

export function luftStufe(luftMinuten: number): Luftstufe {
  if (luftMinuten < 0) return 'nicht';
  if (luftMinuten < 5) return 'knapp';
  return 'passt';
}

/** Wo der geplante Termin stattfindet. */
export type Terminort =
  | { readonly art: 'video' }
  | { readonly art: 'practice'; readonly standortId: string }
  /** Ein neuer Hausbesuch: die Anschrift der Akte. */
  | { readonly art: 'home_visit'; readonly patientId: string }
  /**
   * Ein bestehender Hausbesuch: Er behält seine Anschrift (ANN-003); seine
   * Position steht in der Tagesroute seines bisherigen Tages.
   */
  | {
      readonly art: 'bestehend';
      readonly terminId: string;
      readonly datum: string;
      readonly person: string;
    };

export interface Wegfrage {
  readonly person: string;
  /** Kalendertag der Praxis, `YYYY-MM-DD`. */
  readonly datum: string;
  readonly beginnMinute: number;
  readonly endeMinute: number;
  readonly ort: Terminort;
  /** Der Termin selbst (Ändern, Ziehen) ist nicht sein eigener Nachbar. */
  readonly ohneTermin?: string | undefined;
  readonly zeitzone: string;
}

export type Seite =
  /** Kein Termin mit Ort und keine Arbeitszeit auf dieser Seite. */
  | { readonly stand: 'offen' }
  | { readonly stand: 'laedt' }
  | { readonly stand: 'nachbar_nicht_verortet' }
  /** Route oder Prüfung gescheitert, oder eine Ersatzschätzung (ADR-019 Punkt 38). */
  | { readonly stand: 'nicht_geprueft' }
  | {
      readonly stand: 'geprueft';
      readonly luft: number;
      readonly stufe: Luftstufe;
      /** Anfahrt: frühester eigener Beginn; Weiterfahrt: frühester Beginn danach. */
      readonly fruehester: string;
      readonly fahrtMinuten: number;
      readonly nachbar: 'termin' | 'tagesrand';
      /** Ende des Termins davor bzw. Beginn danach, oder der Arbeitsbeginn bzw. das -ende. */
      readonly nachbarZeit: string;
    };

export type Wegpruefung =
  /** Nichts zu prüfen: Video, unvollständige Angaben oder abgeschaltet. */
  | { readonly stand: 'aus' }
  | { readonly stand: 'laedt' }
  | { readonly stand: 'nicht_verortet' }
  /** Die Anschrift am Termin weicht von der Akte ab (ANN-236). */
  | { readonly stand: 'veraltet' }
  | { readonly stand: 'fehler' }
  | { readonly stand: 'bereit'; readonly an: Seite; readonly weiter: Seite };

/**
 * Die Nachbarn eines geplanten Termins in der Tagesroute seiner Person:
 * davor der Stopp, der zuletzt endet, ohne den Beginn zu überschneiden;
 * danach der, der zuerst beginnt, nach dem Ende. Überschneidungen meldet der
 * Server beim Speichern - sie sind kein Nachbar.
 */
export function nachbarnDes(
  stopps: readonly Tagesstopp[],
  beginn: number,
  ende: number,
  ohne?: string,
): { vorher: Tagesstopp | null; nachher: Tagesstopp | null } {
  let vorher: Tagesstopp | null = null;
  let nachher: Tagesstopp | null = null;
  for (const stopp of stopps) {
    if (stopp.id === ohne) continue;
    const stoppEnde = Date.parse(stopp.ends_at);
    const stoppBeginn = Date.parse(stopp.starts_at);
    if (stoppEnde <= beginn && (!vorher || stoppEnde > Date.parse(vorher.ends_at))) {
      vorher = stopp;
    }
    if (stoppBeginn >= ende && (!nachher || stoppBeginn < Date.parse(nachher.starts_at))) {
      nachher = stopp;
    }
  }
  return { vorher, nachher };
}

/** Arbeitsbeginn und -ende eines Tages in Minuten, oder `null` ohne Arbeitszeit. */
export function tagesrand(baender: readonly Zeitband[]): { beginn: number; ende: number } | null {
  if (baender.length === 0) return null;
  return {
    beginn: Math.min(...baender.map((b) => b.vonMinute)),
    ende: Math.max(...baender.map((b) => b.bisMinute)),
  };
}

/** Die Position eines Stopps der Tagesroute - `null` ohne Koordinate oder mit veralteter Anschrift. */
function positionDes(stopp: Tagesstopp): Coordinate | null {
  if (stopp.address_outdated === true || stopp.lat === null || stopp.lon === null) return null;
  return { lat: stopp.lat, lon: stopp.lon };
}

interface Nachbar {
  readonly position: Coordinate | null;
  readonly zeit: string;
  readonly art: 'termin' | 'tagesrand';
}

/** „hh:mm“ als Minuten seit Mitternacht, sonst `null`. */
function minuteAus(zeit: string): number | null {
  const treffer = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(zeit);
  return treffer ? Number(treffer[1]) * 60 + Number(treffer[2]) : null;
}

/**
 * Die Frage aus einem Terminformular - `null`, solange Person, Tag, Zeit oder
 * Ort fehlen. `bestehend` ist der Hausbesuch, der bearbeitet wird und seine
 * Anschrift behält.
 */
export function frageAusFormular(
  werte: {
    staff_member_id: string;
    appointment_type: string;
    date: string;
    start_time: string;
    end_time: string;
    location_id: string;
  },
  {
    patientId,
    zeitzone,
    bestehend,
    ohneTermin,
  }: {
    patientId: string | null;
    zeitzone: string | null;
    bestehend?: { terminId: string; datum: string; person: string } | null;
    /** Der bearbeitete Termin, auch wenn er kein Hausbesuch ist. */
    ohneTermin?: string | undefined;
  },
): Wegfrage | null {
  const beginn = minuteAus(werte.start_time);
  const ende = minuteAus(werte.end_time);
  if (!zeitzone || !werte.staff_member_id || !werte.date || beginn === null || ende === null) {
    return null;
  }
  let ort: Terminort;
  if (werte.appointment_type === 'practice') {
    if (!werte.location_id) return null;
    ort = { art: 'practice', standortId: werte.location_id };
  } else if (werte.appointment_type === 'home_visit') {
    if (bestehend) ort = { art: 'bestehend', ...bestehend };
    else if (patientId) ort = { art: 'home_visit', patientId };
    else return null;
  } else {
    ort = { art: 'video' };
  }
  return {
    person: werte.staff_member_id,
    datum: werte.date,
    beginnMinute: beginn,
    endeMinute: ende,
    ort,
    ohneTermin: ohneTermin ?? bestehend?.terminId,
    zeitzone,
  };
}

/** Die Prüfung für ein Formular, die Ziehvorschau oder eine Lücke. */
export function useWegpruefung(
  frage: Wegfrage | null,
  { aktiv = true }: { aktiv?: boolean } = {},
): Wegpruefung {
  const gueltig =
    aktiv &&
    frage !== null &&
    frage.ort.art !== 'video' &&
    frage.person !== '' &&
    /^\d{4}-\d{2}-\d{2}$/.test(frage.datum) &&
    frage.endeMinute > frage.beginnMinute;

  const standorte = useQuery({
    queryKey: ['standorte'],
    queryFn: fetchStandorte,
    enabled: gueltig,
    retry: false,
  });
  const tag = useQuery({
    queryKey: ['day-route', frage?.datum, frage?.person],
    queryFn: () => fetchDayRoute(frage!.datum, frage!.person),
    enabled: gueltig,
    retry: false,
  });
  const ort = frage?.ort;
  const bestehend = ort?.art === 'bestehend' ? ort : null;
  const eigenerTag = useQuery({
    queryKey: ['day-route', bestehend?.datum, bestehend?.person],
    queryFn: () => fetchDayRoute(bestehend!.datum, bestehend!.person),
    enabled: gueltig && bestehend !== null,
    retry: false,
  });
  const patientId = ort?.art === 'home_visit' ? ort.patientId : null;
  const adresse = useQuery({
    queryKey: ['visit-position', patientId],
    queryFn: () => fetchVisitPosition(patientId!),
    enabled: gueltig && patientId !== null,
    retry: false,
  });
  const wochenplan = useQuery({
    queryKey: ['working-hours'],
    queryFn: fetchWorkingHours,
    enabled: gueltig,
    retry: false,
  });
  const ausnahmen = useQuery({
    queryKey: ['working-hour-exceptions', frage?.datum, frage?.datum],
    queryFn: () => fetchWorkingHourExceptions(frage!.datum, frage!.datum),
    enabled: gueltig,
    retry: false,
  });

  // Die eigene Position: Standort, Anschrift der Akte oder der bestehende Stopp.
  const eigen = useMemo(():
    | { stand: 'laedt' | 'fehler' | 'nicht_verortet' | 'veraltet' }
    | {
        stand: 'ok';
        position: Coordinate;
      } => {
    if (!gueltig || !ort) return { stand: 'laedt' };
    if (ort.art === 'practice') {
      if (standorte.isError) return { stand: 'fehler' };
      if (!standorte.data) return { stand: 'laedt' };
      const standort = standorte.data.find((s) => s.id === ort.standortId);
      if (!standort || standort.lat === null || standort.lon === null) {
        return { stand: 'nicht_verortet' };
      }
      return { stand: 'ok', position: { lat: standort.lat, lon: standort.lon } };
    }
    if (ort.art === 'home_visit') {
      if (adresse.isError) return { stand: 'fehler' };
      if (adresse.data === undefined) return { stand: 'laedt' };
      return adresse.data === null
        ? { stand: 'nicht_verortet' }
        : { stand: 'ok', position: adresse.data };
    }
    if (ort.art === 'bestehend') {
      if (eigenerTag.isError) return { stand: 'fehler' };
      if (!eigenerTag.data) return { stand: 'laedt' };
      const stopp = eigenerTag.data.find((s) => s.id === ort.terminId);
      if (!stopp) return { stand: 'fehler' };
      if (stopp.address_outdated === true) return { stand: 'veraltet' };
      const position = positionDes(stopp);
      return position ? { stand: 'ok', position } : { stand: 'nicht_verortet' };
    }
    return { stand: 'laedt' };
  }, [
    gueltig,
    ort,
    standorte.data,
    standorte.isError,
    adresse.data,
    adresse.isError,
    eigenerTag.data,
    eigenerTag.isError,
  ]);

  // Die Nachbarn: Termine mit Ort, sonst Arbeitsbeginn und -ende am Startort.
  const umgebung = useMemo((): { an: Nachbar | null; weiter: Nachbar | null } | null => {
    if (!gueltig || !frage || !tag.data || !standorte.data) return null;
    if (!wochenplan.data && !wochenplan.isError) return null;
    if (!ausnahmen.data && !ausnahmen.isError) return null;
    const beginnIso = zeitpunktIn(frage.datum, frage.beginnMinute, frage.zeitzone);
    const endeIso = zeitpunktIn(frage.datum, frage.endeMinute, frage.zeitzone);
    const { vorher, nachher } = nachbarnDes(
      tag.data,
      Date.parse(beginnIso),
      Date.parse(endeIso),
      frage.ohneTermin,
    );
    const rand = tagesrand(
      arbeitszeitBaender(frage.person, frage.datum, wochenplan.data ?? [], ausnahmen.data ?? []),
    );
    const orte = tagesorte(standorte.data);

    const an: Nachbar | null = vorher
      ? { position: positionDes(vorher), zeit: vorher.ends_at, art: 'termin' }
      : rand && orte.start
        ? {
            position: orte.start,
            zeit: zeitpunktIn(frage.datum, rand.beginn, frage.zeitzone),
            art: 'tagesrand',
          }
        : null;
    const weiter: Nachbar | null = nachher
      ? { position: positionDes(nachher), zeit: nachher.starts_at, art: 'termin' }
      : rand && orte.ende
        ? {
            position: orte.ende,
            zeit: zeitpunktIn(frage.datum, rand.ende, frage.zeitzone),
            art: 'tagesrand',
          }
        : null;
    return { an, weiter };
  }, [
    gueltig,
    frage,
    tag.data,
    standorte.data,
    wochenplan.data,
    wochenplan.isError,
    ausnahmen.data,
    ausnahmen.isError,
  ]);

  // Eine Route über höchstens drei Punkte: davor, hier, danach.
  const plan = useMemo(() => {
    if (eigen.stand !== 'ok' || !umgebung) return null;
    const punkte: { position: Coordinate | null }[] = [];
    const anPos = umgebung.an?.position ?? null;
    const weiterPos = umgebung.weiter?.position ?? null;
    if (anPos) punkte.push({ position: anPos });
    punkte.push({ position: eigen.position });
    if (weiterPos) punkte.push({ position: weiterPos });
    const { punkte: wegpunkte, index } = routenplan(null, punkte);
    const hier = anPos ? 1 : 0;
    return {
      wegpunkte,
      an: anPos ? { von: index[0] ?? null, nach: index[hier] ?? null } : null,
      weiter: weiterPos ? { von: index[hier] ?? null, nach: index[hier + 1] ?? null } : null,
    };
  }, [eigen, umgebung]);

  const route = usePlanungsroute(plan?.wegpunkte ?? [], { aktiv: plan !== null });
  const routeFertig =
    plan !== null && (plan.wegpunkte.length < 2 || route.isSuccess || route.isError);
  const abschnitte = route.data?.ok === true ? route.data.value.route.legs : null;

  const sekunden = (abschnitt: { von: number | null; nach: number | null } | null) => {
    if (!abschnitt || abschnitt.von === null || abschnitt.nach === null) return null;
    // Derselbe Ort: Es wird nicht gefahren, auch ohne Route.
    if (abschnitt.von === abschnitt.nach) return 0;
    return fahrzeitZwischen(abschnitt.von, abschnitt.nach, abschnitte);
  };
  const anSekunden = routeFertig ? sekunden(plan?.an ?? null) : null;
  const weiterSekunden = routeFertig ? sekunden(plan?.weiter ?? null) : null;

  const passfrage = useMemo((): Passfrage | null => {
    if (!frage || !umgebung || !routeFertig) return null;
    const anfrage: Passfrage = {
      index: 0,
      duration_minutes: frage.endeMinute - frage.beginnMinute,
      starts_at: zeitpunktIn(frage.datum, frage.beginnMinute, frage.zeitzone),
    };
    if (umgebung.an && anSekunden !== null) {
      anfrage.previous_end = umgebung.an.zeit;
      anfrage.travel_to_seconds = Math.round(anSekunden);
    }
    if (umgebung.weiter && weiterSekunden !== null) {
      anfrage.next_start = umgebung.weiter.zeit;
      anfrage.travel_from_seconds = Math.round(weiterSekunden);
    }
    return anfrage.previous_end || anfrage.next_start ? anfrage : null;
  }, [frage, umgebung, routeFertig, anSekunden, weiterSekunden]);

  const pruefung = useQuery({
    queryKey: ['travel-fit', passfrage],
    queryFn: () => checkTravelFit([passfrage!]),
    enabled: passfrage !== null,
    retry: false,
    gcTime: 30_000,
  });

  if (!gueltig || !frage) return { stand: 'aus' };
  if (eigen.stand !== 'ok') return eigen;
  if (tag.isError || standorte.isError) return { stand: 'fehler' };
  if (!umgebung) return { stand: 'laedt' };

  const antwort = pruefung.data?.[0];
  const seite = (
    nachbar: Nachbar | null,
    fahrt: number | null,
    luft: number | null | undefined,
    fruehester: string | null | undefined,
  ): Seite => {
    if (!nachbar) return { stand: 'offen' };
    if (!nachbar.position) return { stand: 'nachbar_nicht_verortet' };
    if (!routeFertig) return { stand: 'laedt' };
    if (fahrt === null) return { stand: 'nicht_geprueft' };
    if (pruefung.isError) return { stand: 'nicht_geprueft' };
    if (!antwort) return { stand: 'laedt' };
    if (luft === null || luft === undefined || !fruehester) return { stand: 'nicht_geprueft' };
    return {
      stand: 'geprueft',
      luft,
      stufe: luftStufe(luft),
      fruehester,
      fahrtMinuten: Math.round(fahrt / 60),
      nachbar: nachbar.art,
      nachbarZeit: nachbar.zeit,
    };
  };

  return {
    stand: 'bereit',
    an: seite(
      umgebung.an,
      anSekunden,
      antwort?.arrival_slack_minutes,
      antwort?.arrival_earliest_start,
    ),
    weiter: seite(
      umgebung.weiter,
      weiterSekunden,
      antwort?.departure_slack_minutes,
      antwort?.next_earliest_start,
    ),
  };
}
