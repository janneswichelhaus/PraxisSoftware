import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { tagePlus } from './calendar';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { usePlanungsmatrix } from '@/features/tours/fahrzeitfaktor';
import {
  findFreeSlots,
  rateSlotTravel,
  travelItems,
  travelMatrixRequest,
  type SearchParams,
  type Slot,
  type TravelRating,
} from '@/features/slot-search/api';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  createAppointment,
  dayKey,
  fetchUpcomingAppointments,
  formatLocalTime,
  kalenderZumTermin,
  todayInTimeZone,
  type Appointment,
} from './api';

/** Höchstens so viele Vorschläge stehen als Chips da. */
const VORSCHLAEGE = 3;
/** So weit nach vorn wird gesucht - zwei Wochen ab morgen. */
const SUCHTAGE = 14;

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

/** „Di 20.10." aus einem Kalendertag. */
function tagKurz(tag: string): string {
  const [, monat, t] = tag.split('-');
  return `${WOCHENTAG.format(new Date(`${tag}T12:00:00Z`)).replace('.', '')} ${t}.${monat}.`;
}

/**
 * Die Fahrwege der Vorschläge, bewertet vom Server mit der Rundungsregel aus
 * §8.1 (ANN-136) - derselbe Weg wie `useTravelRatings` der Terminsuche
 * (`SlotSearchPage`). Scheitert die Matrix, heißt das „nicht geprüft", nie
 * „passt".
 */
function useFahrwege(slots: readonly Slot[], aktiv: boolean) {
  const anfrage = useMemo(() => (aktiv ? travelMatrixRequest(slots) : null), [aktiv, slots]);
  const matrix = usePlanungsmatrix(anfrage?.origins ?? [], anfrage?.destinations ?? [], {
    aktiv: anfrage !== null,
  });
  const fertig = anfrage === null || matrix.isSuccess || matrix.isError;
  const dauern = matrix.data?.ok === true ? matrix.data.value.matrix.durationsSeconds : null;
  const items = useMemo(
    () => (aktiv && fertig ? travelItems(slots, anfrage, dauern) : []),
    [aktiv, fertig, slots, anfrage, dauern],
  );
  const bewertung = useQuery({
    queryKey: ['slot-travel', items],
    queryFn: () => rateSlotTravel(items),
    enabled: items.length > 0,
    retry: false,
    gcTime: 30_000,
  });
  return {
    jeIndex: new Map<number, TravelRating>((bewertung.data ?? []).map((r) => [r.item_index, r])),
    prueft: aktiv && slots.length > 0 && (!fertig || bewertung.isPending),
  };
}

/** Was hinter Tag und Uhrzeit steht: nur Abweichungen (UX-005g) und „gleiche Zeit". */
function zusatz(
  slot: Slot,
  gleicheZeit: boolean,
  fahrweg: TravelRating | undefined,
  prueft: boolean,
  hausbesuch: boolean,
): string[] {
  const teile: string[] = [];
  if (gleicheZeit) teile.push('gleiche Zeit');
  if (slot.territory_status === 'outside') teile.push('außerhalb Gebietstag');
  if (hausbesuch) {
    if (fahrweg?.status === 'tight') teile.push('Weg knapp');
    else if (fahrweg?.status === 'unknown') teile.push('Weg ungeprüft');
    else if (!fahrweg && prueft) teile.push('Weg wird geprüft …');
  }
  return teile;
}

/**
 * Der Folgetermin als Vorschläge (Auftrag C1, ANN-477; Muster U2 des
 * Referenzabgleichs): „Nächste Woche, gleiche Zeit“ und die nächsten freien
 * Plätze aus der Terminsuche (`find_free_slots` - Arbeitszeit, Belegung,
 * Gebietstag zuerst), beim Hausbesuch mit geprüftem Fahrweg. Ein Tipp legt
 * den Termin an; `create_appointment` prüft alles noch einmal (§8), nichts
 * ist vorher reserviert.
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
  const hausbesuch = appointment.appointment_type === 'home_visit';
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
  const naechsteTage = { ...basis, from: von, to: tagePlus(von, SUCHTAGE - 1), limit: 20 };
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
  const vorschlaege = useMemo(() => {
    const liste: Slot[] = gleich ? [gleich] : [];
    const tage = new Set(liste.map((s) => s.slot_date));
    for (const slot of frei.data ?? []) {
      if (liste.length >= VORSCHLAEGE) break;
      if (tage.has(slot.slot_date)) continue;
      tage.add(slot.slot_date);
      liste.push(slot);
    }
    return liste;
  }, [gleich, frei.data]);
  const fahrwege = useFahrwege(vorschlaege, hausbesuch);

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
      setAngelegt({ id, text: `${tagKurz(slot.slot_date)}, ${slot.start_time} Uhr` });
      for (const queryKey of [
        ['appointments'],
        ['day-plan'],
        ['patient-upcoming-appointments'],
        ['patient-appointments'],
        ['free-slots'],
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
  });

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
        Folgetermin angelegt: {angelegt.text}{' '}
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
          {formatLocalTime(naechster.starts_at, zone)} Uhr
        </p>
        {andereZeit}
      </>
    );
  } else if (kommende.isError || frei.isError) {
    // Im Funkloch nach dem Besuch (Praxis-Review R2, P2): Die Suche läuft
    // ohne Wiederholung (`retry: false`) - „Erneut suchen" fragt nur nach,
    // was gescheitert ist; die Seite und der Rest von „Danach" bleiben stehen.
    const sucht = kommende.isFetching || frei.isFetching || amTag.isFetching;
    inhalt = (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <Statusmeldung ton="fehler">
            Die freien Zeiten konnten nicht gesucht werden.
          </Statusmeldung>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={sucht}
            onClick={() => {
              for (const abfrage of [kommende, frei, amTag]) {
                if (abfrage.isError) void abfrage.refetch();
              }
            }}
          >
            {sucht ? 'Wird gesucht …' : 'Erneut suchen'}
          </Button>
        </div>
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
    inhalt = (
      <>
        {vorschlaege.length === 0 ? (
          <p className="text-ink-muted text-liste">In den nächsten zwei Wochen ist nichts frei.</p>
        ) : (
          <div role="group" aria-label="Folgetermin anlegen" className="flex flex-wrap gap-2">
            {vorschlaege.map((slot, index) => {
              const teile = zusatz(
                slot,
                slot === gleich,
                fahrwege.jeIndex.get(index),
                fahrwege.prueft,
                hausbesuch,
              );
              return (
                <Chip
                  key={`${slot.slot_date}-${slot.start_time}`}
                  disabled={anlegen.isPending}
                  onClick={() => {
                    if (anlegen.isPending) return;
                    anlegen.mutate(slot);
                  }}
                >
                  <span className="sr-only">Folgetermin anlegen: </span>
                  {tagKurz(slot.slot_date)} · {slot.start_time}
                  {teile.length > 0 ? (
                    <span className="text-ink-muted font-medium"> · {teile.join(' · ')}</span>
                  ) : null}
                </Chip>
              );
            })}
          </div>
        )}
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
