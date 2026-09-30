-- =============================================================================
-- TRN-006: Kalender, Tagesliste und Detail je Kontext (TRN-EPIC-002)
--
-- CAL-026 hat die Lesegrenze gezogen: app.may_read_appointment_context(kind)
-- in Policy, Kalender und Tagesliste. Niemand stand auf der anderen Seite -
-- die Trainingsbetreuung kam gar nicht in den Kalender, weil der Eingang
-- app.can_read_appointments() die vier Praxisrollen verlangt. Jetzt kommt sie
-- hinein und sieht dort genau eines: Trainingstermine (ADR-022 Punkt 11).
--
--   app.can_read_calendar             Eingang: Praxisrollen oder Training
--   list_appointments                 + Verhaeltnis und Name am Trainingstermin
--   list_day_plan                     + dasselbe
--   get_training_appointment          Detail eines Trainingstermins
--   list_training_client_appointments Termine einer Trainingskund:in
--
-- DER NAME AM TRAININGSTERMIN kommt ueber das Trainingsverhaeltnis, nie ueber
-- die Akte - auch wenn dieselbe Person beide hat (ADR-021 Punkt 3). Er steht in
-- eigenen Spalten: `patient_given_name` bleibt der Name aus der Akte und an
-- einem Trainingstermin leer, damit keine Oberflaeche aus der Spalte auf eine
-- Behandlung schliesst.
--
-- WAS DIE TRAININGSBETREUUNG NICHT SIEHT (ANN-180): Behandlungstermine und
-- interne Termine. Die Belegung erfaehrt sie nur beim Speichern als "belegt"
-- (ADR-022 Punkt 11); das haelt pnpm test:db als Negativfall fest. Die offene
-- Folgefrage "Sieht die Trainingsrolle interne Termine?" bleibt bei der
-- engeren Antwort aus CAL-026.
--
-- PROTOKOLL (ANN-180): wie am Behandlungstermin - Kalender, Tagesliste und
-- Termindetail nicht, jede Aenderung ja (TRN-004). Die Termine einer
-- Trainingskund:in gehoeren zur protokollierten Detailansicht (ANN-175).
-- =============================================================================

create function app.can_read_calendar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_read_appointments() or app.can_read_training_relationships()
$$;

comment on function app.can_read_calendar() is
  'Eingang in Kalender und Tagesliste (TRN-006): die Praxisrollen oder die Rollen des Trainingsbereichs. Welche Termine jemand darin sieht, entscheidet app.may_read_appointment_context(kind) je Zeile (ADR-022 Punkt 11).';

revoke all on function app.can_read_calendar() from public, anon;
grant execute on function app.can_read_calendar() to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Kalender und Tagesliste
--
-- Aus der jeweils letzten Fassung, geaendert nur an den markierten Stellen.
-- Die Rueckgabe waechst um drei Spalten, deshalb drop und create.
-- -----------------------------------------------------------------------------
drop function public.list_appointments(date, date, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.list_appointments(p_from date, p_to date, p_staff_member_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, location_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, staff_given_name text, staff_family_name text, location_name text, training_relationship_id uuid, training_given_name text, training_family_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-006: Der Kalender ist auch der Trainingsbetreuung offen; welche
  -- Zeilen sie sieht, entscheidet weiter der Kontext (ADR-022 Punkt 11).
  if not app.can_read_calendar() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
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
      l.name,
      a.training_relationship_id,
      tp.given_name,
      tp.family_name
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    -- TRN-006: der Name am Trainingstermin kommt ueber das Verhaeltnis, nie
    -- ueber die Akte (ADR-021 Punkt 3).
    left join public.training_relationships tr on tr.id = a.training_relationship_id
    left join public.persons tp                on tp.id = tr.person_id
    where a.organization_id = v_org
      and app.may_read_appointment_context(a.kind)
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
$function$;

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten, Behandlungen wie Ereignisse (CAL-002, CAL-004, CAL-008a, CAL-015b), seit TRN-006 auch fuer die Trainingsbetreuung - je Zeile nach Kontext gefiltert (ADR-022 Punkt 11), am Trainingstermin mit Verhaeltnis und Namen.';
revoke all on function public.list_appointments(date, date, uuid, uuid, text) from public, anon;
grant execute on function public.list_appointments(date, date, uuid, uuid, text) to authenticated;

drop function public.list_day_plan(date, uuid);

CREATE OR REPLACE FUNCTION public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text, visit_lat double precision, visit_lon double precision, treatment_table_required boolean, take_along_items text[], training_relationship_id uuid, training_given_name text, training_family_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  -- TRN-006: Der Kalender ist auch der Trainingsbetreuung offen; welche
  -- Zeilen sie sieht, entscheidet weiter der Kontext (ADR-022 Punkt 11).
  if not app.can_read_calendar() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_evidence();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016). Am
      -- Trainingstermin gilt dasselbe, und zwar dauerhaft (ADR-022 Punkt 6).
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end,
      v_tz,
      -- MAP-006d: die Kartenposition des Hausbesuchs fuer den Handoff (ANN-018).
      a.visit_lat,
      a.visit_lon,
      -- UX-003b: Behandlungsliege nur am Behandlungstermin (ANN-116).
      case when a.kind = 'therapy' then coalesce(care.treatment_table_required, false) end,
      -- PRX-007: Mitnehmen nur am Behandlungstermin (ANN-138).
      case when a.kind = 'therapy' then coalesce(care.take_along_items, '{}'::text[]) end,
      a.training_relationship_id,
      tp.given_name,
      tp.family_name
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    -- TRN-006: der Name am Trainingstermin kommt ueber das Verhaeltnis, nie
    -- ueber die Akte (ADR-021 Punkt 3).
    left join public.training_relationships tr on tr.id = a.training_relationship_id
    left join public.persons tp                on tp.id = tr.person_id
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$function$;

comment on function public.list_day_plan(date, uuid) is
  'Tagesliste einer Person fuer einen Tag (UX-001) mit Adresse, Rufnummer, Zugangshinweis, seit MAP-006d der Kartenposition des Hausbesuchs, seit UX-003b der Behandlungsliege und seit PRX-007 der Mitnehmen-Liste am Behandlungstermin; seit TRN-006 auch fuer die Trainingsbetreuung, je Zeile nach Kontext gefiltert, am Trainingstermin mit Verhaeltnis und Namen. Abgewiesen mit denied-Eintrag (G6b).';
revoke all on function public.list_day_plan(date, uuid) from public;
grant execute on function public.list_day_plan(date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. get_training_appointment - Detail eines Trainingstermins
--
-- Ein eigener Lesepfad statt appointment_directory: Die Sicht ist
-- security_invoker und verbindet Mitarbeitende ueber `persons`, die die
-- Trainingsbetreuung nach persons_select_scoped nicht sieht; und sie kennt
-- den Namen am Verhaeltnis nicht. Ein anderer Kontext ist "nicht gefunden".
-- -----------------------------------------------------------------------------
create function public.get_training_appointment(p_appointment_id uuid)
returns table (
  id                       uuid,
  training_relationship_id uuid,
  training_basis_id        uuid,
  client_given_name        text,
  client_family_name       text,
  staff_member_id          uuid,
  staff_given_name         text,
  staff_family_name        text,
  location_id              uuid,
  location_name            text,
  appointment_type         text,
  status                   text,
  starts_at                timestamptz,
  ends_at                  timestamptz,
  updated_at               timestamptz,
  visit_street             text,
  visit_house_number       text,
  visit_postal_code        text,
  visit_city               text,
  cancellation_reason      text,
  cancellation_received_at timestamptz,
  organization_time_zone   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read training appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training appointments' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.organization_id = v_org and a.kind = 'training'
  ) then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  return query
    select a.id, a.training_relationship_id, a.training_basis_id,
           tp.given_name, tp.family_name,
           a.staff_member_id, sp.given_name, sp.family_name,
           a.location_id, l.name,
           a.appointment_type, a.status, a.starts_at, a.ends_at, a.updated_at,
           a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city,
           a.cancellation_reason, a.cancellation_received_at,
           o.time_zone
    from public.appointments a
    join public.training_relationships tr on tr.id = a.training_relationship_id
    join public.persons tp                on tp.id = tr.person_id
    join public.staff_members sm          on sm.id = a.staff_member_id
    join public.persons sp                on sp.id = sm.person_id
    join public.organizations o           on o.id = a.organization_id
    left join public.locations l          on l.id = a.location_id
    where a.id = p_appointment_id;
end;
$$;

comment on function public.get_training_appointment(uuid) is
  'TRN-006: ein Trainingstermin mit Kund:in, betreuender Person und Ort. owner, trainer, office; ein anderer Kontext ist nicht gefunden; abgewiesen mit denied unter appointments.read. Nicht protokolliert wie das Termindetail der Behandlung (ANN-180).';
revoke all on function public.get_training_appointment(uuid) from public, anon;
grant execute on function public.get_training_appointment(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. list_training_client_appointments - die Termine einer Trainingskund:in
--
-- Fuer den Abschnitt "Termine" der Detailansicht: alles ab p_from (ohne
-- Angabe: 30 Tage zurueck), hoechstens 100, aufsteigend. Nur Trainingstermine
-- dieses Verhaeltnisses - auch bei einer Person mit Akte keine Behandlung.
-- -----------------------------------------------------------------------------
create function public.list_training_client_appointments(
  p_relationship_id uuid,
  p_from            date default null
)
returns table (
  id                uuid,
  training_basis_id uuid,
  staff_member_id   uuid,
  staff_given_name  text,
  staff_family_name text,
  appointment_type  text,
  status            text,
  starts_at         timestamptz,
  ends_at           timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_tz   text;
  v_from date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'training_relationships.read', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_from := coalesce(p_from, app.training_today(v_org) - 30);

  return query
    select a.id, a.training_basis_id, a.staff_member_id, sp.given_name, sp.family_name,
           a.appointment_type, a.status, a.starts_at, a.ends_at
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    where a.organization_id = v_org
      and a.kind = 'training'
      and a.training_relationship_id = p_relationship_id
      and a.starts_at >= (v_from::timestamp at time zone v_tz)
    order by a.starts_at, a.id
    limit 100;
end;
$$;

comment on function public.list_training_client_appointments(uuid, date) is
  'TRN-006: Trainingstermine einer Trainingskund:in ab einem Tag (Standard: 30 Tage zurueck), hoechstens 100. owner, trainer, office; Teil der protokollierten Detailansicht (ANN-175), abgewiesen mit denied unter training_relationships.read.';
revoke all on function public.list_training_client_appointments(uuid, date) from public, anon;
grant execute on function public.list_training_client_appointments(uuid, date) to authenticated;
