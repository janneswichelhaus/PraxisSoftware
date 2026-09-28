import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  appointmentTypeLabels,
  appointmentTypeSchema,
  fetchAssignableTherapists,
  schreibeTerminVorbelegung,
  todayInTimeZone,
  type AppointmentType,
} from '@/features/appointments/api';
import { DAUER_PARAM } from '@/features/appointments/terminformular';
import { fetchPatient, fullName } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { PRAXISPROFIL } from '@/features/tours/tagesroute';
import { fetchWaitlist, windowsText, type TimeWindow } from '@/features/waitlist/api';
import { formatDate } from '@/lib/datum';
import { useMatrix } from '@/lib/location/matrix';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  MAX_DAYS,
  TRAVEL_CHECK_LIMIT,
  findFreeSlots,
  orderByTravel,
  rateSlotTravel,
  travelItems,
  travelMatrixRequest,
  type SearchParams,
  type Slot,
  type TravelRating,
} from './api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

function dayLabel(iso: string): string {
  return `${WEEKDAY.format(new Date(`${iso}T00:00:00Z`))} ${formatDate(iso)}`;
}

function TravelBadge({
  rating,
  checking,
}: {
  rating: TravelRating | undefined;
  checking: boolean;
}) {
  if (!rating) {
    return checking ? <Badge>Fahrweg wird geprüft …</Badge> : null;
  }
  if (rating.status === 'ok') return <Badge ton="positiv">Fahrweg passt</Badge>;
  if (rating.status === 'tight') {
    return <Badge ton="warnung">Fahrweg knapp: {rating.shortfall_minutes} Min. zu wenig</Badge>;
  }
  return <Badge>Fahrweg nicht geprüft</Badge>;
}

function TerritoryBadge({ status }: { status: Slot['territory_status'] }) {
  if (status === 'match') return <Badge ton="positiv">Im Gebietstag</Badge>;
  if (status === 'outside') return <Badge ton="warnung">Außerhalb des Gebietstags</Badge>;
  return null;
}

/**
 * Die Fahrzeiten der ersten Vorschläge (ANN-136): eine Matrix beim eigenen
 * Dienst, bewertet vom Server mit der Rundungsregel aus §8.1. Scheitert die
 * Matrix, bewertet der Server trotzdem — ohne Fahrzeit heißt das „nicht
 * geprüft", nie „passt".
 */
function useTravelRatings(slots: readonly Slot[], active: boolean) {
  const checked = useMemo(() => slots.slice(0, TRAVEL_CHECK_LIMIT), [slots]);
  const request = useMemo(() => (active ? travelMatrixRequest(checked) : null), [active, checked]);
  const matrix = useMatrix(request?.origins ?? [], request?.destinations ?? [], PRAXISPROFIL, {
    aktiv: request !== null,
  });
  const matrixSettled = request === null || matrix.isSuccess || matrix.isError;
  const durations = matrix.data?.ok === true ? matrix.data.value.matrix.durationsSeconds : null;
  const items = useMemo(
    () => (active && matrixSettled ? travelItems(checked, request, durations) : []),
    [active, matrixSettled, checked, request, durations],
  );
  const ratings = useQuery({
    queryKey: ['slot-travel', items],
    queryFn: () => rateSlotTravel(items),
    enabled: items.length > 0,
    retry: false,
    gcTime: 30_000,
  });
  const byIndex = new Map((ratings.data ?? []).map((r) => [r.item_index, r]));
  return {
    byIndex,
    checking: active && (!matrixSettled || ratings.isPending) && checked.length > 0,
    checkedCount: checked.length,
  };
}

/**
 * Terminsuche als Vorschlagsliste (PRX-003).
 *
 * Aus dem Wartelisteneintrag (mit dessen Wunschzeiten, Dauer, Art und
 * Therapeut:in) oder aus der Akte. Der Tipp auf einen Vorschlag öffnet das
 * gewohnte Terminformular, vorbelegt — der Termin entsteht erst dort, und
 * der Server prüft dort alles noch einmal. Reserviert wird nichts (§8).
 */
export function SlotSearchPage({ user }: { user: CurrentUser }) {
  const { patientId = '' } = useParams();
  const [search] = useSearchParams();
  const back = leseRueckweg(search, `/patienten/${patientId}/termine`);
  const entryId = search.get('warteliste');
  const waitlistId = entryId && UUID.test(entryId) ? entryId : null;
  const basisParam = search.get('verordnung');
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: UUID.test(patientId),
    retry: false,
  });
  const entry = useQuery({
    queryKey: ['waitlist', 'open', patientId],
    queryFn: () => fetchWaitlist('open', patientId),
    enabled: waitlistId !== null,
    retry: false,
    select: (rows) => rows.find((r) => r.id === waitlistId) ?? null,
  });
  const therapists = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  if (waitlistId && entry.isPending) return <LoadingState label="Eintrag wird geladen …" />;

  const e = entry.data ?? null;
  const basisId =
    e?.treatment_basis_id ?? (basisParam && UUID.test(basisParam) ? basisParam : null);

  return (
    <>
      <Rueckweg standard={back} />
      <PageHeader
        title="Freie Termine suchen"
        description={
          patient.data
            ? `${fullName(patient.data)} · Vorschläge, nichts ist reserviert. Der Termin entsteht erst im Formular.`
            : 'Vorschläge, nichts ist reserviert. Der Termin entsteht erst im Formular.'
        }
      />
      {waitlistId && !e ? (
        <Statusmeldung ton="warnung" className="mb-4">
          Der Wartelisteneintrag ist nicht mehr offen; gesucht wird ohne seine Wunschzeiten.
        </Statusmeldung>
      ) : null}
      <SearchForm
        key={e?.id ?? 'ohne'}
        patientId={patientId}
        today={today}
        initial={{
          type: e?.appointment_type ?? 'home_visit',
          duration: e?.duration_minutes ?? 60,
          staffMemberId: e?.preferred_staff_member_id ?? null,
          windows: e?.time_windows ?? [],
          from: e?.earliest_on && e.earliest_on > today ? e.earliest_on : today,
        }}
        therapists={therapists.data ?? []}
        link={(slot, type, duration) => {
          const vorbelegung = schreibeTerminVorbelegung({
            datum: slot.slot_date,
            beginn: slot.start_time,
            ende: slot.end_time,
            art: type,
            person: slot.staff_member_id,
          });
          const params = new URLSearchParams(vorbelegung.slice(1));
          params.set(DAUER_PARAM, String(duration));
          if (basisId) params.set('verordnung', basisId);
          if (e) params.set('warteliste', e.id);
          const here = `/patienten/${patientId}/plaetze?${search.toString()}`;
          return mitRueckweg(`/patienten/${patientId}/termine/neu?${params.toString()}`, here);
        }}
      />
    </>
  );
}

function SearchForm({
  patientId,
  today,
  initial,
  therapists,
  link,
}: {
  patientId: string;
  today: string;
  initial: {
    type: AppointmentType;
    duration: number;
    staffMemberId: string | null;
    windows: TimeWindow[];
    from: string;
  };
  therapists: { staff_member_id: string; display_name: string }[];
  link: (slot: Slot, type: AppointmentType, duration: number) => string;
}) {
  const [type, setType] = useState<AppointmentType>(initial.type);
  const [duration, setDuration] = useState(String(initial.duration));
  const [staff, setStaff] = useState(initial.staffMemberId ?? '');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(plusDays(initial.from, 13));
  const [useWindows, setUseWindows] = useState(initial.windows.length > 0);
  const [error, setError] = useState<string | null>(null);

  const build = (): SearchParams => ({
    patientId,
    staffMemberId: staff || null,
    type,
    duration: Number(duration),
    from,
    to,
    windows: useWindows ? initial.windows : [],
  });
  const [params, setParams] = useState<SearchParams>(build);

  const result = useQuery({
    queryKey: ['free-slots', params],
    queryFn: () => findFreeSlots(params),
    retry: false,
  });
  const slots = result.data ?? [];
  const travel = useTravelRatings(slots, params.type === 'home_visit');
  const ordered = orderByTravel(slots, travel.byIndex);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) {
      setError('Die Dauer liegt zwischen 5 und 240 Minuten.');
      return;
    }
    if (!from || !to || to < from || to > plusDays(from, MAX_DAYS - 1) || to < today) {
      setError(`Der Zeitraum muss in der Zukunft liegen und höchstens ${MAX_DAYS} Tage umfassen.`);
      return;
    }
    setError(null);
    setParams(build());
  }

  return (
    <>
      <Section titel="Suche">
        <form onSubmit={submit} noValidate className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <Select
            label="Terminart"
            value={type}
            onChange={(ev) => setType(appointmentTypeSchema.parse(ev.target.value))}
          >
            {appointmentTypeSchema.options.map((t) => (
              <option key={t} value={t}>
                {appointmentTypeLabels[t]}
              </option>
            ))}
          </Select>
          <Field
            label="Dauer in Minuten"
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            step={5}
            value={duration}
            onChange={(ev) => setDuration(ev.target.value)}
          />
          <Select label="Therapeut:in" value={staff} onChange={(ev) => setStaff(ev.target.value)}>
            <option value="">Alle</option>
            {therapists.map((t) => (
              <option key={t.staff_member_id} value={t.staff_member_id}>
                {t.display_name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Von"
              type="date"
              min={today}
              value={from}
              onChange={(ev) => setFrom(ev.target.value)}
            />
            <Field
              label="Bis"
              type="date"
              min={from}
              value={to}
              onChange={(ev) => setTo(ev.target.value)}
            />
          </div>
          {initial.windows.length > 0 ? (
            <div className="sm:col-span-2">
              <Checkbox
                label={`Nur in den Wunschzeiten: ${windowsText(initial.windows)}`}
                checked={useWindows}
                onChange={(ev) => setUseWindows(ev.target.checked)}
              />
            </div>
          ) : null}
          {error ? (
            <Statusmeldung ton="fehler" className="sm:col-span-2">
              {error}
            </Statusmeldung>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={result.isFetching}>
              {result.isFetching ? 'Wird gesucht …' : 'Suchen'}
            </Button>
          </div>
        </form>
      </Section>

      <Section
        titel="Vorschläge"
        hinweis={
          params.type === 'home_visit'
            ? `Im Gebietstag zuerst, dann nach Datum. Den Fahrweg prüft die Anwendung für die ersten ${TRAVEL_CHECK_LIMIT}; ein knapper Weg steht hinten.`
            : 'Nach Datum und Uhrzeit.'
        }
      >
        {result.isPending ? <LoadingState label="Freie Plätze werden gesucht …" /> : null}
        {result.isError ? (
          <ErrorState
            title="Die freien Plätze konnten nicht gesucht werden."
            description={result.error.message}
            onErneut={() => void result.refetch()}
          />
        ) : null}
        {result.data && slots.length === 0 ? (
          <EmptyState
            title="Kein freier Platz"
            description="Zeitraum verlängern, eine andere Therapeut:in wählen oder die Wunschzeiten weglassen."
          />
        ) : null}
        {slots.length > 0 ? (
          <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
            {ordered.map(({ slot, index }) => (
              <li
                key={`${slot.staff_member_id}-${slot.slot_date}-${slot.start_time}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-ink text-liste font-medium">
                    {dayLabel(slot.slot_date)} · {slot.start_time}–{slot.end_time} Uhr
                  </p>
                  <p className="text-ink-muted text-sm">{slot.staff_name ?? 'Therapeut:in'}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <TerritoryBadge status={slot.territory_status} />
                    {params.type === 'home_visit' && index < travel.checkedCount ? (
                      <TravelBadge rating={travel.byIndex.get(index)} checking={travel.checking} />
                    ) : null}
                  </div>
                </div>
                <ButtonLink
                  to={link(slot, params.type, params.duration)}
                  variant="secondary"
                  groesse="kompakt"
                >
                  Übernehmen
                </ButtonLink>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </>
  );
}
