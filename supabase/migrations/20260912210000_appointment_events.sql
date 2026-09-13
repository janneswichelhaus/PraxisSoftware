-- =============================================================================
-- Zwei Terminlaengen und Termine ohne Patient:in (CAL-015b)
--
-- Umsetzung von PROJECT_PRINCIPLES.md 0.9 Abschnitt 8.1, Festlegung des
-- Projektinhabers vom 2026-09-12:
--
--   "Behandlungstermine haben standardmaessig 60 Minuten einschliesslich
--    Dokumentation; 45 Minuten sind ebenfalls moeglich."
--   "Meetings, Teambesprechungen und andere Ereignisse lassen sich mit frei
--    waehlbarem Beginn und Ende innerhalb des Praxisrasters eintragen. Sie
--    benoetigen weder Patient noch Verordnung und erzeugen keine
--    Behandlungsleistung."
--
-- Zwei Aenderungen, die zusammengehoeren:
--
--   1. Aus der EINEN zulaessigen Fensterlaenge werden ZWEI. 60 bleibt die
--      Vorbelegung; eine dritte Laenge weist der Server weiterhin ab. Das ist
--      E12 Punkt 1 - beantwortet ohne das Verfahren, das die Frage dort anbot
--      (keine begruendete Abweichung, kein Auditvermerk dafuer).
--   2. Der Termin bekommt eine ART: `treatment` oder `event`. Ein Ereignis hat
--      KEINE Patient:in, keine Verordnung, keinen Behandlungsnachweis und
--      keine Laengenregel - dafuer einen Titel.
--
-- Warum ein Ereignis in derselben Tabelle steht und nicht in einer eigenen:
-- Es belegt denselben Kalender und denselben Zeitraum. Die EXCLUDE-Constraint,
-- die Ueberschneidungen verhindert, wirkt nur INNERHALB einer Tabelle - eine
-- zweite Tabelle haette die Belegungspruefung in Anwendungscode verlagert, und
-- genau die ist hier der Schutz vor Doppelbuchung. Der Preis ist die
-- Fallunterscheidung in den Schreibpfaden; sie steht an den Stellen, an denen
-- sie faellt, und die Constraints halten sie zusammen.
--
-- Was ein Ereignis NICHT kann - und zwar ausdruecklich: abgeschlossen werden,
-- dokumentiert werden, als "nicht angetroffen" vermerkt werden. Damit kann aus
-- ihm auch keine abrechenbare Leistung entstehen (19, ADR-009): Die
-- Leistungserfassung in ABR-002 haengt an "durchgefuehrt", und dorthin kommt
-- ein Ereignis gar nicht erst.
--
-- Die Entscheidung, beides in EINER Tabelle zu fuehren, steht als ANN-049 im
-- Annahmenregister - samt dem, was daran unsicher ist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Die zulaessigen Laengen, an genau einer Stelle
-- -----------------------------------------------------------------------------
create function app.appointment_window_options()
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select array[60, 45]
$$;

comment on function app.appointment_window_options() is
  'Zulaessige Laengen eines angebotenen Behandlungstermins in Minuten (PROJECT_PRINCIPLES.md 0.9 Abschnitt 8.1, CAL-015b). Genau zwei; eine dritte weist der Schreibpfad ab. Die erste ist die Vorbelegung.';

comment on function app.appointment_window_minutes() is
  'VORBELEGUNG der Laenge eines angebotenen Terminfensters in Minuten (PROJECT_PRINCIPLES.md 8.1, CAL-010a, CAL-015b). Welche Laengen zulaessig sind, sagt app.appointment_window_options(); ob sie je Praxis einstellbar werden, ist E12 Punkt 2 und offen.';

create function app.is_valid_treatment_window(p_laenge interval)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(app.appointment_window_options()) as minuten
    where p_laenge = make_interval(mins => minuten)
  )
$$;

comment on function app.is_valid_treatment_window(interval) is
  'Ist diese Laenge fuer einen BEHANDLUNGSTERMIN zulaessig? Fuer Ereignisse gilt sie nicht (CAL-015b).';

revoke all on function app.appointment_window_options() from public, anon, authenticated;
revoke all on function app.is_valid_treatment_window(interval) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Die Terminart am Datensatz
--
-- `kind` mit Vorgabe 'treatment': Jeder Bestandstermin ist eine Behandlung,
-- und zwar ohne dass irgendetwas nachgerechnet werden muesste - vor dieser
-- Migration konnte es nichts anderes geben (patient_id war not null).
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column kind  text not null default 'treatment',
  add column title text;

alter table public.appointments
  alter column patient_id drop not null;

comment on column public.appointments.kind is
  'treatment = Behandlungstermin mit Patient:in; event = Ereignis des Praxisbetriebs ohne Patient:in (Besprechung, Teamtermin). CAL-015b, PROJECT_PRINCIPLES.md 8.1.';
comment on column public.appointments.title is
  'Bezeichnung eines Ereignisses ("Teambesprechung"). Nur bei kind = event, und ausdruecklich KEIN Freitext ueber Patient:innen - der Termin enthaelt keine klinischen Inhalte (PROJECT_PRINCIPLES.md 4.6, 5).';

alter table public.appointments
  add constraint appointments_kind_values check (kind in ('treatment', 'event'));

-- Die Trennung als Constraint und nicht als Absprache: Eine Behandlung ohne
-- Patient:in waere ein Termin ohne Gegenueber, ein Ereignis mit Patient:in ein
-- Behandlungstermin, der sich der Laengenregel entzieht.
alter table public.appointments
  add constraint appointments_kind_fields check (
    (kind = 'treatment'
      and patient_id is not null
      and title      is null)
    or (kind = 'event'
      and patient_id      is null
      and prescription_id is null
      and title           is not null
      and length(btrim(title)) between 1 and 120)
  );

-- Ein Ereignis hat keine Patientenanschrift, also auch keinen Hausbesuch.
alter table public.appointments
  add constraint appointments_event_type check (
    kind <> 'event' or appointment_type in ('practice', 'video')
  );

create index appointments_kind_starts_idx
  on public.appointments (organization_id, kind, starts_at);

-- -----------------------------------------------------------------------------
-- create_appointment: zwei zulaessige Laengen
--
-- Unveraendert aus 20260912160000_appointment_series.sql bis auf die
-- Laengenpruefung und das ausdrueckliche `kind`. PostgreSQL kennt kein
-- teilweises Ersetzen einer Funktion.
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment(
  p_patient_id      uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date            date,
  p_start_time      time,
  p_end_time        time,
  p_location_id     uuid default null,
  p_allow_outside_working_hours boolean default false,
  p_prescription_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_patient_status text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_location_id    uuid;
  v_appointment_id uuid;
  v_grid           smallint;
  v_ausserhalb     boolean;
  v_verordnung     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.9 Abschnitt 8.1: jedes NEU ANGELEGTE Zeitfenster
  -- einer Behandlung hat eine der beiden zulaessigen Laengen (CAL-010a,
  -- CAL-015b).
  if not app.is_valid_treatment_window(p_end_time - p_start_time) then
    raise exception 'appointment window must be % minutes',
      array_to_string(app.appointment_window_options(), ' or ') using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select p.status into v_patient_status
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if v_patient_status <> 'active' then
    raise exception 'patient is not in active care' using errcode = '22023';
  end if;

  -- Die Verordnung muss zur Organisation UND zu derselben Patient:in gehoeren.
  -- Eine fremde und eine unbekannte ID erzeugen dieselbe Meldung und taugen
  -- damit nicht als Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  if p_prescription_id is not null then
    select p.id into v_verordnung
    from public.prescriptions p
    where p.id = p_prescription_id
      and p.organization_id = v_org
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'prescription not found' using errcode = 'P0002';
    end if;
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    select
      nullif(btrim(c.street), ''),
      nullif(btrim(c.house_number), ''),
      nullif(btrim(c.postal_code), ''),
      nullif(btrim(c.city), '')
      into v_street, v_house, v_postal, v_city
    from public.patient_contact_details c
    where c.patient_id = p_patient_id;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete patient address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, patient_id, staff_member_id, location_id,
      appointment_type, kind, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      prescription_id, created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'treatment', 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_verordnung, v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.created', 'appointment', v_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'staff_member_id', p_staff_member_id,
      -- Eine ID, kein Inhalt: die Verordnung selbst traegt die klinischen
      -- Felder, und die gehoeren nicht ins Auditlog (ADR-010 Punkt 3).
      'prescription_id', v_verordnung,
      'outside_working_hours', v_ausserhalb
    )
  );

  return v_appointment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_appointment_event: ein Ereignis, mehrere Kalender
--
-- Eine Teambesprechung, die nur in einem Kalender steht, ist eine Falle: Sie
-- sagt den uebrigen Beteiligten nicht, dass ihre Zeit belegt ist. Deshalb
-- nimmt die Funktion mehrere Personen entgegen und legt JE PERSON eine Zeile
-- an - alles oder nichts, in einer Transaktion, wie die Terminserie (CAL-007).
--
-- Damit belegt das Ereignis in jedem betroffenen Kalender seinen Zeitraum, und
-- die Ueberschneidungspruefung ist dieselbe EXCLUDE-Constraint wie bei jedem
-- anderen Termin. Der Preis: Jede Zeile ist danach ein eigener Vorgang -
-- absagen und verschieben geschieht je Person. Eine gemeinsame Kennung waere
-- der naechste Schritt und ist es heute nicht wert (ADR-014).
--
-- Rollenschnitt: Wer Termine anlegen darf, darf auch ein Ereignis anlegen. Die
-- Beteiligten muessen KEINE therapeutischen Rollen sein - an einer
-- Teambesprechung nimmt das Buero teil, und `is_assignable_therapist` waere
-- hier die falsche Frage.
-- -----------------------------------------------------------------------------
create function public.create_appointment_event(
  p_title            text,
  p_staff_member_ids uuid[],
  p_appointment_type text,
  p_date             date,
  p_start_time       time,
  p_end_time         time,
  p_location_id      uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_person      uuid;
  v_ausserhalb  boolean;
  v_id          uuid;
  v_anzahl      integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_staff_member_ids is null or array_length(p_staff_member_ids, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Ein Ereignis findet in der Praxis oder als Video statt. Ein Hausbesuch
  -- ohne Patient:in waere ein Termin ohne Anschrift.
  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Frei waehlbar heisst frei im RASTER: Beide Enden liegen auf einem
  -- Rasterpunkt. Beim Behandlungstermin genuegt der Beginn, weil die Laenge
  -- fest ist; hier ist sie es nicht (PROJECT_PRINCIPLES.md 8.1).
  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  foreach v_person in array p_staff_member_ids
  loop
    -- Eigene Pruefung statt is_assignable_therapist: Beteiligte eines
    -- Ereignisses sind Beschaeftigte, nicht notwendig Behandelnde.
    if not exists (
      select 1 from public.staff_members sm
      where sm.id = v_person
        and sm.organization_id = v_org
        and sm.employment_status = 'active'
    ) then
      raise exception 'staff member not found' using errcode = 'P0002';
    end if;

    v_ausserhalb := not app.is_within_working_hours(
      v_person, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;

    begin
      insert into public.appointments (
        organization_id, patient_id, staff_member_id, location_id,
        appointment_type, kind, title, status, starts_at, ends_at, created_by
      )
      values (
        v_org, null, v_person, v_location_id,
        p_appointment_type, 'event', v_titel, 'confirmed', v_starts_at, v_ends_at, v_actor
      )
      returning id into v_id;
    exception
      when exclusion_violation then
        raise exception 'appointment overlaps an existing one' using errcode = '23P01';
    end;

    -- Je Zeile ein Auditeintrag, wie bei jedem anderen Termin auch. Kein
    -- Sammelereignis: Der auditpflichtige Vorgang ist der einzelne Termin
    -- (ADR-010).
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'appointment.created', 'appointment', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        -- Kein Personenbezug ueber die Beteiligten hinaus: Ein Ereignis hat
        -- keine Patient:in, und der Titel gehoert der Zeile (ADR-011).
        'kind', 'event',
        'staff_member_id', v_person,
        'outside_working_hours', v_ausserhalb
      )
    );

    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.create_appointment_event(text, uuid[], text, date, time, time, uuid, boolean) is
  'Legt ein Ereignis des Praxisbetriebs (Besprechung, Teamtermin) je beteiligter Person als eigenen Termin im Zustand confirmed an - alles oder nichts. Ohne Patient:in, ohne Verordnung, ohne Laengenregel; Beginn und Ende muessen auf dem Praxisraster liegen (CAL-015b, PROJECT_PRINCIPLES.md 8.1).';

revoke all on function public.create_appointment_event(text, uuid[], text, date, time, time, uuid, boolean)
  from public, anon;
grant execute on function public.create_appointment_event(text, uuid[], text, date, time, time, uuid, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- update_appointment: die Laengenregel gilt nur fuer Behandlungen
--
-- Unveraendert aus 20260912150000_appointment_window.sql bis auf drei Stellen:
-- die Laengenpruefung (zwei Werte statt einem, und nur bei `treatment`), die
-- Rasterpruefung fuer das Ende eines Ereignisses, und die Terminart, die ein
-- Ereignis nicht auf `home_visit` wechseln laesst. Der Titel bleibt, wie er
-- ist - ihn aendert diese Funktion nicht.
-- -----------------------------------------------------------------------------
create or replace function public.update_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_staff_member_id     uuid,
  p_appointment_type    text,
  p_date                date,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_location_id uuid;
  v_street      text;
  v_house       text;
  v_postal      text;
  v_city        text;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
  v_zeit        boolean := false;
  v_organisch   boolean := false;
  v_aktion      text;
  v_grid        smallint;
  v_ausserhalb  boolean := false;
  v_alt_laenge  interval;
  v_neu_laenge  interval;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.location_id, a.appointment_type,
         a.kind, a.status, a.starts_at, a.ends_at, a.updated_at,
         a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Abgesagte Termine sind terminal (ADR-018 Punkt 2).
  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  -- Durchgefuehrt und nicht angetroffen sind nicht terminal, aber auch nicht
  -- direkt aenderbar: erst wieder oeffnen, dann bearbeiten (CAL-004, CAL-008c).
  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Dokumentiert und abgerechnet haben keinen Rueckweg (ADR-018 Punkt 2).
  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  -- Ein Ereignis hat keine Patientenanschrift, also auch keinen Hausbesuch.
  if v_alt.kind = 'event' and p_appointment_type = 'home_visit' then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 8.1, ANN-037: geprueft wird die Laenge, und nur wenn
  -- sie sich aendert. Beide Laengen in Ortszeit, damit ein Bestandstermin an
  -- einem Umstellungstag nicht allein deshalb als geaendert gilt.
  --
  -- Fuer ein Ereignis gilt die Regel gar nicht (CAL-015b): Seine Laenge ist
  -- frei, gebunden ist es nur ans Raster - und das an beiden Enden.
  v_alt_laenge := (v_alt.ends_at   at time zone v_tz)
                - (v_alt.starts_at at time zone v_tz);
  v_neu_laenge := p_end_time - p_start_time;

  if v_alt.kind = 'treatment' then
    if v_neu_laenge is distinct from v_alt_laenge
       and not app.is_valid_treatment_window(v_neu_laenge) then
      raise exception 'appointment window must be % minutes',
        array_to_string(app.appointment_window_options(), ' or ') using errcode = '22023';
    end if;
  elsif not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;

  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if v_starts_at is distinct from v_alt.starts_at
     and not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- Behandeln darf nur, wer zuordenbar ist; an einem Ereignis nimmt auch das
  -- Buero teil (CAL-015b).
  if v_alt.kind = 'treatment' then
    if not app.is_assignable_therapist(p_staff_member_id, v_org) then
      raise exception 'staff member not assignable' using errcode = 'P0002';
    end if;
  elsif not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
      and sm.employment_status = 'active'
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  if v_starts_at is distinct from v_alt.starts_at
     or v_ends_at is distinct from v_alt.ends_at
     or p_staff_member_id is distinct from v_alt.staff_member_id then
    v_ausserhalb := not app.is_within_working_hours(
      p_staff_member_id, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    if v_alt.appointment_type = 'home_visit' then
      v_street := v_alt.visit_street;
      v_house  := v_alt.visit_house_number;
      v_postal := v_alt.visit_postal_code;
      v_city   := v_alt.visit_city;
    else
      select
        nullif(btrim(c.street), ''),
        nullif(btrim(c.house_number), ''),
        nullif(btrim(c.postal_code), ''),
        nullif(btrim(c.city), '')
        into v_street, v_house, v_postal, v_city
      from public.patient_contact_details c
      where c.patient_id = v_alt.patient_id;

      if v_street is null or v_house is null or v_postal is null or v_city is null then
        raise exception 'home visit requires a complete patient address' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_alt.staff_member_id is distinct from p_staff_member_id then
    v_geaendert := array_append(v_geaendert, 'staff_member_id');
    v_organisch := true;
  end if;
  if v_alt.appointment_type is distinct from p_appointment_type then
    v_geaendert := array_append(v_geaendert, 'appointment_type');
    v_organisch := true;
  end if;
  if v_alt.location_id is distinct from v_location_id then
    v_geaendert := array_append(v_geaendert, 'location_id');
    v_organisch := true;
  end if;
  if v_alt.starts_at is distinct from v_starts_at then
    v_geaendert := array_append(v_geaendert, 'starts_at');
    v_zeit := true;
  end if;
  if v_alt.ends_at is distinct from v_ends_at then
    v_geaendert := array_append(v_geaendert, 'ends_at');
    v_zeit := true;
  end if;

  if array_length(v_geaendert, 1) is null then
    return p_appointment_id;
  end if;

  begin
    update public.appointments
       set staff_member_id    = p_staff_member_id,
           appointment_type   = p_appointment_type,
           location_id        = v_location_id,
           starts_at          = v_starts_at,
           ends_at            = v_ends_at,
           visit_street       = v_street,
           visit_house_number = v_house,
           visit_postal_code  = v_postal,
           visit_city         = v_city,
           updated_at         = now()
     where id = p_appointment_id
       and updated_at = p_expected_updated_at;

    if not found then
      raise exception 'appointment was changed meanwhile' using errcode = '40001';
    end if;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  v_aktion := case
    when v_zeit and not v_organisch then 'appointment.rescheduled'
    else 'appointment.updated'
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, v_aktion, 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', p_staff_member_id,
      'changed_fields', to_jsonb(v_geaendert),
      'outside_working_hours', v_ausserhalb
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid, boolean) is
  'Aendert einen bestaetigten Termin. Prueft eine geaenderte Laenge gegen die zulaessigen Terminfenster (nur Behandlungen), einen geaenderten Beginn gegen das Raster und eine Neuplanung gegen die Arbeitszeit (CAL-003, CAL-005, CAL-010a, CAL-015b, ADR-018).';

-- -----------------------------------------------------------------------------
-- Was an einem Ereignis nicht geht
--
-- Abschliessen, dokumentieren und "nicht angetroffen" setzen allesamt eine
-- Behandlung voraus. Ein Ereignis kommt damit nie in einen Zustand, aus dem
-- ABR-002 spaeter eine Leistung erzeugen koennte (19).
-- -----------------------------------------------------------------------------
create or replace function public.complete_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'event' then
    raise exception 'event cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'no-show appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'appointment is already completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'completed',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.completed', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.complete_appointment(uuid, timestamptz) is
  'Schliesst einen bestaetigten Behandlungstermin ab und protokolliert appointment.completed. Ein Ereignis wird abgewiesen - aus ihm entsteht keine Leistung (CAL-004, CAL-015b, ADR-018).';

-- -----------------------------------------------------------------------------
-- record_no_show: nicht an einem Ereignis
--
-- Unveraendert aus 20260912200000_cancellation_notice.sql bis auf die
-- Artpruefung. "Nicht angetroffen" setzt jemanden voraus, den man antreffen
-- koennte.
-- -----------------------------------------------------------------------------
create or replace function public.record_no_show(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'event' then
    raise exception 'event cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status              = 'no_show',
         no_show_recorded_at = now(),
         no_show_recorded_by = v_actor,
         updated_at          = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Ohne 'fee': Aus dem Vermerk allein entsteht keine Gebuehr, und ein
  -- Schluessel, der immer `false` traegt, waere eine Zusicherung, die niemand
  -- gegeben hat (ADR-018 Fassung 2 Punkt 8, E14).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.no_show', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.record_no_show(uuid, timestamptz) is
  'Vermerkt einen bestaetigten Behandlungstermin als nicht angetroffen und protokolliert appointment.no_show. Ohne Gebuehrenentscheidung; an einem Ereignis nicht moeglich (CAL-014b, CAL-015b, ADR-018 Fassung 2 Punkt 8).';

-- -----------------------------------------------------------------------------
-- create_treatment_note: kein Nachweis an einem Ereignis
--
-- Unveraendert aus 20260912120000_appointment_no_show.sql bis auf die
-- Artpruefung.
-- -----------------------------------------------------------------------------
create or replace function public.create_treatment_note(
  p_appointment_id uuid,
  p_content        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_note   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.kind
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Ein Ereignis des Praxisbetriebs hat keine Patient:in - eine
  -- Behandlungsdokumentation daran haette kein Gegenueber (CAL-015b).
  if v_termin.kind = 'event' then
    raise exception 'event cannot be documented' using errcode = '22023';
  end if;

  -- Eine Absage sagt aus, dass die Behandlung NICHT stattgefunden hat.
  -- Bestaetigte und abgeschlossene Termine sind dokumentierbar - der laufende
  -- Hausbesuch ist der Regelfall und noch nicht abgeschlossen.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nicht angetroffen heisst: keine Behandlung, also auch kein Nachweis
  -- (CAL-008c). Wer sich vertan hat, oeffnet den Termin wieder.
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor
    )
    returning id into v_note;
  exception
    when unique_violation then
      raise exception 'treatment note already exists' using errcode = '23505';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.created', 'treatment_note', v_note, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'patient_id', v_termin.patient_id
    )
  );

  return v_note;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_staff_day sagt Behandlungen ab, keine Besprechungen
--
-- Unveraendert aus 20260912200000_cancellation_notice.sql bis auf die
-- Artbedingung in der Auswahl. "Tag umplanen" ist der Vorgang, nach dem eine
-- Anrufliste entsteht: Die Patient:innen muessen angerufen werden. Eine
-- Teambesprechung gehoert nicht dazu und faellt nicht mit - wer sie absagen
-- will, tut das ausdruecklich.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_staff_day(
  p_staff_member_id uuid,
  p_date            date,
  p_reason          text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_termin  record;
  v_anzahl  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_staff_member_id is null or p_date is null then
    raise exception 'staff member and date are required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  for v_termin in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
      and a.kind = 'treatment'
    order by a.starts_at, a.id
    for update
  loop
    perform public.cancel_appointment(v_termin.id, v_termin.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.cancel_staff_day(uuid, date, text) is
  'Sagt alle bestaetigten BEHANDLUNGSTERMINE einer Person an einem Kalendertag in einer Transaktion ab und liefert ihre Anzahl (CAL-009, CAL-015b). Ereignisse bleiben stehen. Ruft je Termin cancel_appointment auf; deren Regeln gelten unveraendert.';

-- -----------------------------------------------------------------------------
-- Lesepfade: der Kalender zeigt Ereignisse mit
--
-- Der INNER JOIN auf `patients` liess bisher keinen Termin ohne Patient:in zu -
-- er haette Ereignisse aus jeder Ansicht fallen lassen, ohne dass jemand es
-- bemerkt. Aus ihm wird ein LEFT JOIN, und Art und Titel kommen dazu.
--
-- Die Rueckgabespalten aendern sich, also abraeumen und neu anlegen.
-- -----------------------------------------------------------------------------
drop function public.list_appointments(date, date, uuid, uuid, text);

create function public.list_appointments(
  p_from            date,
  p_to              date,
  p_staff_member_id uuid default null,
  p_location_id     uuid default null,
  p_status          text default 'active'
)
returns table (
  id                  uuid,
  patient_id          uuid,
  staff_member_id     uuid,
  location_id         uuid,
  appointment_type    text,
  kind                text,
  title               text,
  status              text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  patient_given_name  text,
  patient_family_name text,
  staff_given_name    text,
  staff_family_name   text,
  location_name       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_from is null or p_to is null then
    raise exception 'from and to are required' using errcode = '22023';
  end if;

  if p_to <= p_from then
    raise exception 'to must be after from' using errcode = '22023';
  end if;

  if p_to - p_from > 31 then
    raise exception 'requested range is too large' using errcode = '22023';
  end if;

  if p_status is null
     or p_status not in (
       'confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced',
       'active', 'done', 'all'
     ) then
    raise exception 'unknown status filter' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.location_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
      and (p_location_id     is null or a.location_id     = p_location_id)
      and (
        p_status = 'all'
        or (p_status = 'active' and a.status <> 'cancelled')
        or (p_status = 'done'   and a.status in ('completed', 'documented', 'invoiced'))
        or a.status = p_status
      )
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$$;

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten, Behandlungen wie Ereignisse (CAL-002, CAL-004, CAL-008a, CAL-015b).';

revoke all on function public.list_appointments(date, date, uuid, uuid, text) from public, anon;
grant execute on function public.list_appointments(date, date, uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- list_staff_future_appointments: auch die Besprechungen der Person
--
-- Die Frage hinter dieser Funktion ist "was haengt noch an dieser Person, wenn
-- ich sie deaktiviere?". Ein Ereignis haengt daran genauso wie eine
-- Behandlung; der INNER JOIN haette es verschwiegen.
-- -----------------------------------------------------------------------------
drop function public.list_staff_future_appointments(uuid);

create function public.list_staff_future_appointments(p_staff_member_id uuid)
returns table (
  id                  uuid,
  starts_at           timestamptz,
  ends_at             timestamptz,
  appointment_type    text,
  kind                text,
  title               text,
  patient_id          uuid,
  patient_given_name  text,
  patient_family_name text,
  location_name       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_employment() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs.
  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.kind,
      a.title,
      a.patient_id,
      pp.given_name,
      pp.family_name,
      l.name
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    left join public.locations l on l.id = a.location_id
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.status = 'confirmed'
      and a.ends_at > now()
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_staff_future_appointments(uuid) is
  'Offene zukuenftige Termine einer Person - Behandlungen und Ereignisse (STAFF-003, CAL-015b). Nur fuer Rollen, die Beschaeftigung verwalten duerfen.';

revoke all on function public.list_staff_future_appointments(uuid) from public, anon;
grant execute on function public.list_staff_future_appointments(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Die Terminsicht fuehrt Art und Titel
--
-- Unveraendert aus 20260912200000_cancellation_notice.sql bis auf den LEFT
-- JOIN auf die Patient:in und die beiden neuen Spalten.
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.status,
  a.starts_at,
  a.ends_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.updated_at,
  a.cancelled_at,
  a.cancellation_reason,
  a.cancellation_received_at,
  a.completed_at,
  a.no_show_recorded_at,
  a.fee_basis,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone,
  -- Nur die Wege, nicht wer wann vermerkt hat: Akteure stehen im Auditlog
  -- (ADR-010), und die Detailansicht zeigt sie auch sonst nicht.
  coalesce(
    (select array_agg(distinct n.channel order by n.channel)
     from public.appointment_notifications n
     where n.appointment_id = a.id
       and n.notified_at >= a.updated_at),
    array[]::text[]
  ) as notification_channels
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010).';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;
