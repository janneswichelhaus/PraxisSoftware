import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { ErrorState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { findFreeSlots, type SearchParams, type Slot } from '@/features/slot-search/api';
import { fetchDayRoute } from '@/features/tours/tagesroute';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  createAppointment,
  dayKey,
  fetchUpcomingAppointments,
  formatLocalTime,
  kalenderZumTermin,
  todayInTimeZone,
  zeitpunktIn,
  type Appointment,
} from './api';
import { tagePlus } from './calendar';
import {
  nachbarText,
  plane,
  tagKurz,
  urteilAus,
  wegangabe,
  type Kandidat,
  type Urteil,
} from './folgetermin';
import { frageAusFormular, nachbarnDes, useWegpruefung } from './wegpruefung';

/** Höchstens so viele Vorschläge stehen da. */
const VORSCHLAEGE = 3;
/** Höchstens so viele Kandidaten werden geprüft - Nachbarn, Wege, Tagesränder. */
const KANDIDATEN = 6;
/** So weit nach vorn wird gesucht - zwei Wochen ab morgen. */
const SUCHTAGE = 14;

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
 * Tagesränder, `useWegpruefung`), dazu die Termine davor und danach aus der
 * Tagesroute derselben Person - derselbe Zwischenspeicher. Er meldet sein
 * Urteil nach oben; ob er dasteht, entscheidet `plane`.
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
  const tag = useQuery({
    queryKey: ['day-route', slot.slot_date, slot.staff_member_id],
    queryFn: () => fetchDayRoute(slot.slot_date, slot.staff_member_id),
    retry: false,
  });
  const urteil = urteilAus(pruefung, tag.isSuccess || tag.isError);
  const eigenerSchluessel = schluessel(slot);
  useEffect(() => {
    onUrteil(eigenerSchluessel, urteil);
  }, [onUrteil, eigenerSchluessel, urteil]);

  if (!zeigen) return null;

  const { vorher, nachher } = nachbarnDes(
    tag.data ?? [],
    Date.parse(zeitpunktIn(slot.slot_date, minuteAus(slot.start_time), zone)),
    Date.parse(zeitpunktIn(slot.slot_date, minuteAus(slot.end_time), zone)),
  );
  const weg = wegangabe(pruefung, dauer, raster);
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
          {tag.isSuccess ? (
            <span className="block">{nachbarText(vorher, nachher, zone)}</span>
          ) : null}{' '}
          {weg ? (
            <span className="block">
              {weg.ton === 'neutral' ? weg.wort : <StatusMark ton={weg.ton}>{weg.wort}</StatusMark>}
              {weg.dauer ? ` · ${weg.dauer}` : null}
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
 * Steht schon ein nächster Termin, steht er als erledigt da (Leitfaden L3);
 * „Andere Zeit suchen“ führt in die ausführliche Terminsuche.
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
  const [angelegt, setAngelegt] = useState<{ id: string; text: string } | null>(null);

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
    mutationFn: (slot: Slot) =>
      createAppointment(patientId!, {
        staff_member_id: slot.staff_member_id,
        appointment_type: appointment.appointment_type,
        date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        location_id: appointment.location_id ?? '',
      }),
    onSuccess: async (id, slot) => {
      const bei = slot.staff_name ? ` bei ${slot.staff_name}` : '';
      setAngelegt({ id, text: `${tagKurz(slot.slot_date)}, ${slot.start_time} Uhr${bei}` });
      for (const queryKey of [
        ['appointments'],
        ['day-plan'],
        ['day-route'],
        ['patient-upcoming-appointments'],
        ['patient-appointments'],
        ['free-slots'],
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
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
    inhalt = (
      <p className="text-accent text-liste font-semibold" role="status">
        <span aria-hidden="true">✓ </span>
        Folgetermin angelegt: {angelegt.text} ·{' '}
        <Textlink to={mitRueckweg(kalenderZumTermin(angelegt.id), hierher)} className="text-sm">
          Im Kalender
        </Textlink>
      </p>
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
      {inhalt}
    </section>
  );
}
