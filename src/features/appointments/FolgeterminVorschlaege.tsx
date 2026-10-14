import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { fetchWorkingHourExceptions, fetchWorkingHours } from '@/features/scheduling/api';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { findFreeSlots, type SearchParams, type Slot } from '@/features/slot-search/api';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  cancelAppointment,
  createAppointment,
  dayKey,
  fetchAppointment,
  fetchAppointments,
  fetchUpcomingAppointments,
  formatLocalTime,
  kalenderZumTermin,
  todayInTimeZone,
  zeitpunktIn,
  type Appointment,
} from './api';
import { arbeitszeitBaender, tagePlus } from './calendar';
import { AufDerPlattformSichtbar, undoAppointmentCreation } from './folgetermin-api';
import {
  dauerangabe,
  freieMinuten,
  nachbarText,
  nachbarZeiten,
  plane,
  tagKurz,
  urteilAus,
  wegangabe,
  type Kandidat,
  type Urteil,
} from './folgetermin';
import { frageAusFormular, useWegpruefung } from './wegpruefung';

/** Höchstens so viele Vorschläge stehen da. */
const VORSCHLAEGE = 3;
/** Höchstens so viele Kandidaten werden geprüft - Nachbarn, Wege, Tagesränder. */
const KANDIDATEN = 6;
/** So weit nach vorn wird gesucht - zwei Wochen ab morgen. */
const SUCHTAGE = 14;

/** Der eben angelegte Folgetermin - solange die Meldung steht, lässt er sich zurücknehmen. */
interface Angelegt {
  readonly id: string;
  readonly slot: Slot;
  /** `updated_at` direkt nach dem Anlegen; `null`, wenn er sich nicht lesen ließ. */
  readonly stand: string | null;
}

/** Die Abfragen, die einen neuen oder zurückgenommenen Termin zeigen. */
const TERMINABFRAGEN = [
  ['appointments'],
  ['day-plan'],
  ['day-route'],
  ['patient-upcoming-appointments'],
  ['patient-appointments'],
  ['free-slots'],
] as const;

function schluessel(slot: Slot): string {
  return `${slot.staff_member_id}|${slot.slot_date}|${slot.start_time}`;
}

/** „hh:mm“ als Minute des Tages. */
function minuteAus(zeit: string): number {
  const [stunde, minute] = zeit.split(':').map(Number) as [number, number];
  return stunde * 60 + minute;
}

/** Plus, 20er-Raster wie die übrigen Zeichen (DESIGN.md 9.15): Ein Tipp legt an. */
function Plus() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="text-accent size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

/**
 * Ein Kandidat: geprüft wie „Passt es?“ im Terminformular (Nachbarn und
 * Tagesränder, `useWegpruefung`), dazu die Belegung des Tages derselben
 * Person - alle ihre Termine, auch Video und Ereignisse, und ihre Arbeitszeit
 * mit Pausen, über dieselben Abfragen wie Kalender und „Passt es?“. Daraus
 * stehen die Termine davor und danach und die mögliche Dauer da. Er meldet
 * sein Urteil nach oben; ob er dasteht, entscheidet `plane`.
 */
function Vorschlag({
  slot,
  appointment,
  gleicheZeit,
  dauer,
  raster,
  zeigen,
  onUrteil,
  onWaehlen,
}: {
  slot: Slot;
  appointment: Appointment;
  gleicheZeit: boolean;
  dauer: number;
  raster: number | null;
  zeigen: boolean;
  onUrteil: (schluessel: string, urteil: Urteil) => void;
  onWaehlen: (slot: Slot) => void;
}) {
  const zone = appointment.organization_time_zone;
  const frage = useMemo(
    () =>
      frageAusFormular(
        {
          staff_member_id: slot.staff_member_id,
          appointment_type: appointment.appointment_type,
          date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          location_id: appointment.location_id ?? '',
        },
        { patientId: appointment.patient_id, zeitzone: zone },
      ),
    [slot, appointment.appointment_type, appointment.location_id, appointment.patient_id, zone],
  );
  const pruefung = useWegpruefung(frage);
  // Die Tagesroute kennt nur Termine mit Ort; davor, danach und die mögliche
  // Dauer brauchen jeden Termin der Person an diesem Tag (Befund B8).
  const folgetag = tagePlus(slot.slot_date, 1);
  const kalender = useQuery({
    queryKey: ['appointments', slot.slot_date, folgetag, slot.staff_member_id, null, 'active'],
    queryFn: () =>
      fetchAppointments({
        von: slot.slot_date,
        bis: folgetag,
        person: slot.staff_member_id,
        standort: null,
        status: 'active',
      }),
    retry: false,
  });
  const wochenplan = useQuery({
    queryKey: ['working-hours'],
    queryFn: fetchWorkingHours,
    retry: false,
  });
  const ausnahmen = useQuery({
    queryKey: ['working-hour-exceptions', slot.slot_date, slot.slot_date],
    queryFn: () => fetchWorkingHourExceptions(slot.slot_date, slot.slot_date),
    retry: false,
  });
  const urteil = urteilAus(
    pruefung,
    [kalender, wochenplan, ausnahmen].every((abfrage) => abfrage.isSuccess || abfrage.isError),
  );
  const eigenerSchluessel = schluessel(slot);
  useEffect(() => {
    onUrteil(eigenerSchluessel, urteil);
  }, [onUrteil, eigenerSchluessel, urteil]);

  if (!zeigen) return null;

  const beginn = Date.parse(zeitpunktIn(slot.slot_date, minuteAus(slot.start_time), zone));
  const { vorher, nachher } = nachbarZeiten(
    kalender.data ?? [],
    beginn,
    Date.parse(zeitpunktIn(slot.slot_date, minuteAus(slot.end_time), zone)),
  );
  const frei =
    kalender.isSuccess && wochenplan.isSuccess && ausnahmen.isSuccess
      ? freieMinuten({
          beginn,
          beginnMinute: minuteAus(slot.start_time),
          nachher,
          baender: arbeitszeitBaender(
            slot.staff_member_id,
            slot.slot_date,
            wochenplan.data,
            ausnahmen.data,
          ),
        })
      : 'unbekannt';
  const weg = wegangabe(pruefung);
  const moeglich = dauerangabe(pruefung, { dauer, raster, frei });
  const wer = [
    slot.staff_name,
    gleicheZeit ? 'gleiche Zeit' : null,
    slot.territory_status === 'outside' ? 'außerhalb Gebietstag' : null,
  ]
    .filter((teil): teil is string => !!teil)
    .join(' · ');

  return (
    <ListRow
      onClick={() => onWaehlen(slot)}
      titel={
        <>
          <span className="sr-only">Folgetermin anlegen:</span> {tagKurz(slot.slot_date)} ·{' '}
          {slot.start_time}–{slot.end_time}
        </>
      }
      // Die Zeilen der Nebenzeile mit Leerzeichen dazwischen: Vorgelesen
      // wird der Knopf als ein Satz, auch wo kein Stil die Blöcke trennt.
      meta={
        <>
          {wer ? <span className="block">{wer}</span> : null}{' '}
          {kalender.isSuccess ? (
            <span className="block">{nachbarText(vorher, nachher, zone)}</span>
          ) : null}{' '}
          {weg || moeglich ? (
            <span className="block">
              {weg?.ton === 'warnung' ? (
                <StatusMark ton="warnung">{weg.wort}</StatusMark>
              ) : (
                weg?.wort
              )}
              {weg && moeglich ? ' · ' : null}
              {moeglich}
            </span>
          ) : null}
        </>
      }
      status={<Plus />}
    />
  );
}

/**
 * Der Folgetermin als Vorschläge (Auftrag C1, ANN-477; Muster U2 des
 * Referenzabgleichs; Befund B8): „Nächste Woche, gleiche Zeit“ und die
 * nächsten freien Plätze aus der Terminsuche (`find_free_slots` -
 * Arbeitszeit, Belegung, Gebietstag zuerst), je Tag einer. Jede Zeile sagt,
 * bei wem der Termin liegt, was davor und danach kommt und ob die Wege
 * aufgehen; was nicht aufgeht, steht gar nicht erst da (`plane`). Ein Tipp
 * auf die Zeile legt den Termin an; `create_appointment` prüft alles noch
 * einmal (§8), nichts ist vorher reserviert.
 *
 * Solange die Meldung „Folgetermin angelegt“ steht, nimmt „Rückgängig“ den
 * Termin zurück (`undo_appointment_creation`); danach stehen die Vorschläge
 * wieder da. Steht schon ein nächster Termin, steht er als erledigt da
 * (Leitfaden L3); „Andere Zeit suchen“ führt in die ausführliche Terminsuche.
 */
export function FolgeterminVorschlaege({
  appointment,
  user,
  hierher,
}: {
  appointment: Appointment;
  user: CurrentUser;
  /** Die Seite selbst - Rückweg aus der Terminsuche. */
  hierher: string;
}) {
  const queryClient = useQueryClient();
  const patientId = appointment.patient_id;
  const zone = appointment.organization_time_zone;
  const darf = canManageAppointments(user.roles) && appointment.kind === 'therapy' && !!patientId;
  const datum = dayKey(appointment.starts_at, zone);
  const beginn = formatLocalTime(appointment.starts_at, zone);
  const dauer = Math.round(
    (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60_000,
  );
  const heute = todayInTimeZone(zone);
  const von = tagePlus(datum > heute ? datum : heute, 1);
  const naechsteWoche = tagePlus(datum, 7);
  const [angelegt, setAngelegt] = useState<Angelegt | null>(null);
  const [zurueckgenommen, setZurueckgenommen] = useState(false);
  // Sah die Person den Termin auf der Plattform, wurde er abgesagt statt
  // gelöscht (ANN-534) - die Meldung sagt es.
  const [alsAbsage, setAlsAbsage] = useState(false);
  // Die Meldung nimmt den Fokus: Der getippte Knopf verschwindet mit dem
  // Anlegen bzw. Zurücknehmen, sonst fiele der Fokus an den Seitenanfang.
  const meldung = useRef<HTMLDivElement>(null);
  const [meldungNr, setMeldungNr] = useState(0);
  useEffect(() => {
    if (meldungNr > 0) meldung.current?.focus();
  }, [meldungNr]);

  const kommende = useQuery({
    queryKey: ['patient-upcoming-appointments', patientId],
    queryFn: () => fetchUpcomingAppointments(patientId!, 5),
    enabled: darf,
    retry: false,
  });
  const naechster = (kommende.data ?? []).find(
    (t) => t.status === 'confirmed' && Date.parse(t.starts_at) >= Date.parse(appointment.ends_at),
  );
  const suchen = darf && kommende.isSuccess && !naechster && !angelegt;

  const basis: Omit<SearchParams, 'from' | 'to'> = {
    patientId: patientId ?? '',
    staffMemberId: appointment.staff_member_id,
    type: appointment.appointment_type,
    duration: dauer,
    windows: [],
  };
  const gleicheWoche = { ...basis, from: naechsteWoche, to: naechsteWoche, limit: 50 };
  // Je Tag steht einer; fällt ein Platz weg, rückt der nächste nach - auch am
  // selben Tag. Deshalb so viele Plätze, wie der Server hergibt.
  const naechsteTage = { ...basis, from: von, to: tagePlus(von, SUCHTAGE - 1), limit: 50 };
  const amTag = useQuery({
    queryKey: ['free-slots', gleicheWoche],
    queryFn: () => findFreeSlots(gleicheWoche),
    enabled: suchen && naechsteWoche >= von,
    retry: false,
  });
  const frei = useQuery({
    queryKey: ['free-slots', naechsteTage],
    queryFn: () => findFreeSlots(naechsteTage),
    enabled: suchen,
    retry: false,
  });

  const gleich =
    amTag.data?.find(
      (s) => s.start_time === beginn && s.staff_member_id === appointment.staff_member_id,
    ) ?? null;
  // Gleiche Zeit nächste Woche zuerst, dann die Plätze in der Reihenfolge des
  // Servers (Gebietstag, Tag, Beginn).
  const kandidaten = useMemo(() => {
    const liste: Slot[] = gleich ? [gleich] : [];
    const gesehen = new Set(liste.map(schluessel));
    for (const slot of frei.data ?? []) {
      if (gesehen.has(schluessel(slot))) continue;
      gesehen.add(schluessel(slot));
      liste.push(slot);
    }
    return liste;
  }, [gleich, frei.data]);

  const [urteile, setUrteile] = useState<ReadonlyMap<string, Urteil>>(() => new Map());
  const melde = useCallback((kandidat: string, urteil: Urteil) => {
    setUrteile((alt) => (alt.get(kandidat) === urteil ? alt : new Map(alt).set(kandidat, urteil)));
  }, []);
  const plan = useMemo(
    () =>
      plane(
        kandidaten.map((slot): Kandidat => ({ schluessel: schluessel(slot), tag: slot.slot_date })),
        urteile,
        { ziel: VORSCHLAEGE, hoechstens: KANDIDATEN },
      ),
    [kandidaten, urteile],
  );

  const anlegen = useMutation({
    mutationFn: async (slot: Slot): Promise<Angelegt> => {
      const id = await createAppointment(patientId!, {
        staff_member_id: slot.staff_member_id,
        appointment_type: appointment.appointment_type,
        date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        location_id: appointment.location_id ?? '',
      });
      // Der Stand gleich nach dem Anlegen ist der, den „Rückgängig“ meint.
      // Scheitert das Lesen, ist der Termin trotzdem angelegt.
      const neu = await fetchAppointment(id).catch(() => null);
      return { id, slot, stand: neu?.updated_at ?? null };
    },
    onSuccess: async (neu) => {
      setAngelegt(neu);
      setZurueckgenommen(false);
      zuruecknehmen.reset();
      setMeldungNr((n) => n + 1);
      for (const queryKey of TERMINABFRAGEN) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  // Zurücknehmen prüft der Server ganz: Person, Zeit, Zustand, was daran
  // hängt - und dass seit dem Anlegen niemand den Termin geändert hat
  // (`updated_at = created_at`). Ließ sich der Stand nach dem Anlegen nicht
  // lesen, wird er deshalb jetzt gelesen und genauso geprüft. Sieht die Person
  // ihre Termine auf der Plattform, sagt „Rückgängig“ den Termin als Praxis ab
  // - ohne Gebühr, und die Person sieht die Absage (ANN-534, ADR-018 Punkt 2).
  const zuruecknehmen = useMutation({
    mutationFn: async (termin: Angelegt): Promise<'geloescht' | 'abgesagt'> => {
      let stand = termin.stand;
      if (stand === null) {
        const jetzt = await fetchAppointment(termin.id);
        if (!jetzt) throw new Error('Den Termin gibt es nicht mehr.');
        stand = jetzt.updated_at;
      }
      try {
        await undoAppointmentCreation(termin.id, stand);
        return 'geloescht';
      } catch (fehler) {
        if (!(fehler instanceof AufDerPlattformSichtbar)) throw fehler;
        await cancelAppointment(termin.id, stand, 'practice_request');
        return 'abgesagt';
      }
    },
    onSuccess: async (ergebnis) => {
      // Erst nachladen, dann umschalten: Sonst stünde der zurückgenommene
      // Termin einen Augenblick als „Nächster Termin“ da.
      await Promise.all(
        TERMINABFRAGEN.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      anlegen.reset();
      setAngelegt(null);
      setZurueckgenommen(true);
      setAlsAbsage(ergebnis === 'abgesagt');
      setMeldungNr((n) => n + 1);
    },
  });
  const waehlen = useCallback(
    (slot: Slot) => {
      if (anlegen.isPending) return;
      anlegen.mutate(slot);
    },
    [anlegen],
  );

  if (!darf) return null;

  const suche = mitRueckweg(`/patienten/${patientId}/plaetze`, hierher);
  const andereZeit = (
    <Textlink alleinstehend to={suche} className="gap-1 text-sm font-semibold">
      Andere Zeit suchen <span aria-hidden="true">→</span>
    </Textlink>
  );

  let inhalt;
  if (angelegt) {
    const bei = angelegt.slot.staff_name ? ` bei ${angelegt.slot.staff_name}` : '';
    inhalt = (
      <div ref={meldung} tabIndex={-1} className="outline-none">
        <p className="text-accent text-liste font-semibold" role="status">
          <span aria-hidden="true">✓ </span>
          Folgetermin angelegt: {tagKurz(angelegt.slot.slot_date)}, {angelegt.slot.start_time} Uhr
          {bei}
        </p>
        {/* Zwei Ziele mit voller Höhe und 12 px Abstand in jeder Richtung:
            Ein knapper Tipp auf „Im Kalender“ nimmt den Termin nicht zurück. */}
        <div className="flex flex-wrap items-center gap-3">
          <Textlink
            alleinstehend
            to={mitRueckweg(kalenderZumTermin(angelegt.id), hierher)}
            className="text-sm"
          >
            Im Kalender
          </Textlink>
          {/* Leise: der Weg zurück für den Fehltipp, kein zweiter Hauptknopf. */}
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            disabled={zuruecknehmen.isPending}
            aria-busy={zuruecknehmen.isPending || undefined}
            onClick={() => {
              if (zuruecknehmen.isPending) return;
              zuruecknehmen.mutate(angelegt);
            }}
          >
            {zuruecknehmen.isPending ? 'Wird zurückgenommen …' : 'Rückgängig'}
            <span className="sr-only">: Folgetermin zurücknehmen</span>
          </Button>
        </div>
        {zuruecknehmen.isError ? (
          <Statusmeldung ton="fehler">{zuruecknehmen.error.message}</Statusmeldung>
        ) : null}
      </div>
    );
  } else if (naechster) {
    inhalt = (
      <>
        <p className="text-accent text-liste font-semibold">
          <span aria-hidden="true">✓ </span>
          Nächster Termin: {tagKurz(dayKey(naechster.starts_at, zone))},{' '}
          {formatLocalTime(naechster.starts_at, zone)} Uhr bei {naechster.staff_given_name}{' '}
          {naechster.staff_family_name}
        </p>
        {andereZeit}
      </>
    );
  } else if (kommende.isError || frei.isError) {
    // Im Funkloch nach dem Besuch (Praxis-Review R2, P2): Die Suche läuft
    // ohne Wiederholung (`retry: false`). Der Fehler steht wie überall
    // (DESIGN.md Regel 8; Design-Review R2, P2): „Erneut versuchen" fragt
    // nur nach, was gescheitert ist, und wartet auf alle diese Abfragen; die
    // Seite und der Rest von „Danach" bleiben stehen.
    inhalt = (
      <>
        <ErrorState
          title="Die freien Zeiten konnten nicht gesucht werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() =>
            Promise.all(
              [kommende, frei, amTag]
                .filter((abfrage) => abfrage.isError)
                .map((abfrage) => abfrage.refetch()),
            )
          }
        />
        {andereZeit}
      </>
    );
  } else if (kommende.isPending || frei.isPending || (naechsteWoche >= von && amTag.isPending)) {
    inhalt = (
      <p className="text-ink-muted text-sm" role="status">
        Freie Zeiten werden gesucht …
      </p>
    );
  } else {
    const keinerPasst = kandidaten.length > 0 && !plan.offen && plan.zeigen.length === 0;
    inhalt = (
      <>
        {kandidaten.length === 0 ? (
          <p className="text-ink-muted text-liste">In den nächsten zwei Wochen ist nichts frei.</p>
        ) : null}
        {keinerPasst ? (
          <p className="text-ink-muted text-liste">
            Die nächsten freien Plätze passen nicht zu den Wegen.
          </p>
        ) : null}
        <ListRows rahmen={false}>
          {kandidaten
            .filter((slot) => plan.pruefen.has(schluessel(slot)))
            .map((slot) => (
              <Vorschlag
                key={schluessel(slot)}
                slot={slot}
                appointment={appointment}
                gleicheZeit={slot === gleich}
                dauer={dauer}
                raster={user.appointmentGridMinutes}
                zeigen={plan.zeigen.includes(schluessel(slot))}
                onUrteil={melde}
                onWaehlen={waehlen}
              />
            ))}
        </ListRows>
        {plan.offen ? (
          <p className="text-ink-muted text-sm" role="status">
            {plan.zeigen.length === 0
              ? 'Freie Zeiten werden geprüft …'
              : 'Weitere Zeiten werden geprüft …'}
          </p>
        ) : null}
        {anlegen.isPending ? <Statusmeldung>Folgetermin wird angelegt …</Statusmeldung> : null}
        {anlegen.isError ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {anlegen.error.message}
          </Statusmeldung>
        ) : null}
        {andereZeit}
      </>
    );
  }

  return (
    <section aria-labelledby={`folgetermin-${appointment.id}`}>
      <Zwischentitel id={`folgetermin-${appointment.id}`}>Folgetermin</Zwischentitel>
      {zurueckgenommen && !angelegt ? (
        <div ref={meldung} tabIndex={-1} className="outline-none">
          <Statusmeldung ton="erfolg">
            {alsAbsage
              ? 'Folgetermin abgesagt – die Person sieht ihn auf der Plattform als abgesagt.'
              : 'Folgetermin zurückgenommen.'}
          </Statusmeldung>
        </div>
      ) : null}
      {inhalt}
    </section>
  );
}
