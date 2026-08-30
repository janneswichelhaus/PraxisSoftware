-- =============================================================================
-- Termine anlegen (CAL-001)
--
-- Vierter schreibender Fachvorgang, nach dem Muster von create_patient und
-- update_patient: eine SECURITY-DEFINER-RPC statt direkter INSERT-Rechte.
-- authenticated behaelt auf public.appointments ausschliesslich SELECT.
--
-- Drei Punkte sind hier anders als bei den Stammdaten:
--
--   * Zeit. Die RPC nimmt Kalendertag und Uhrzeiten entgegen, NICHT einen
--     fertigen Zeitstempel. Die Umrechnung nach timestamptz passiert
--     serverseitig mit der Zeitzone der Organisation. Damit kann weder eine
--     Browser- noch eine Serverzeitzone in die Fachlogik einsickern.
--   * Ueberschneidungen. Sie werden von einer EXCLUDE-Constraint verhindert,
--     nicht von einer Abfrage. Ein SELECT-dann-INSERT waere zwischen Pruefung
--     und Einfuegung angreifbar; zwei gleichzeitige Anlagen koennten beide
--     erfolgreich sein (PROJECT_PRINCIPLES.md 13).
--   * Ort. Welche Ortsangaben zulaessig sind, haengt an der Terminart. Das
--     steht als CHECK-Constraint im Schema und nicht nur in der RPC - sonst
--     waere es eine Zusicherung des Aufrufers.
--
-- Keine klinischen Inhalte: der Termin ist ein organisatorischer Datensatz
-- (PROJECT_PRINCIPLES.md 4.6, 5).
-- =============================================================================

-- btree_gist liefert die Gleichheits-Operatorklasse fuer uuid im GiST-Index.
-- Ohne sie laesst sich staff_member_id nicht mit einem Bereichsoperator in
-- derselben EXCLUDE-Constraint kombinieren.
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- appointments
-- -----------------------------------------------------------------------------
create table public.appointments (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  patient_id         uuid not null references public.patients (id)      on delete restrict,
  staff_member_id    uuid not null references public.staff_members (id) on delete restrict,
  location_id        uuid references public.locations (id) on delete restrict,

  appointment_type   text not null
                       check (appointment_type in ('home_visit', 'practice', 'video')),
  status             text not null default 'scheduled'
                       check (status in ('scheduled', 'cancelled')),

  starts_at          timestamptz not null,
  ends_at            timestamptz not null,

  -- Adress-Snapshot ausschliesslich fuer Hausbesuche. Bewusst kopiert und
  -- nicht referenziert: eine spaetere Stammdatenaenderung darf nicht
  -- rueckwirkend veraendern, wohin an diesem Tag gefahren wurde.
  visit_street       text check (visit_street       is null or length(btrim(visit_street))      between 1 and 200),
  visit_house_number text check (visit_house_number is null or length(btrim(visit_house_number)) between 1 and 20),
  visit_postal_code  text check (visit_postal_code  is null or length(btrim(visit_postal_code)) between 1 and 20),
  visit_city         text check (visit_city         is null or length(btrim(visit_city))        between 1 and 200),

  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid,

  -- Halboffenes Intervall [Beginn, Ende): ein Ende gleich dem Beginn waere
  -- kein Termin.
  constraint appointments_time_order check (ends_at > starts_at),

  -- Standort genau dann, wenn es ein Praxistermin ist.
  constraint appointments_location_matches_type check (
    (appointment_type = 'practice'               and location_id is not null)
    or (appointment_type in ('home_visit', 'video') and location_id is null)
  ),

  -- Adress-Snapshot genau dann - und dann vollstaendig -, wenn es ein
  -- Hausbesuch ist. Eine halbe Adresse ist fuer eine Anfahrt wertlos.
  constraint appointments_address_matches_type check (
    (appointment_type = 'home_visit'
      and visit_street      is not null
      and visit_house_number is not null
      and visit_postal_code is not null
      and visit_city        is not null)
    or (appointment_type in ('practice', 'video')
      and visit_street      is null
      and visit_house_number is null
      and visit_postal_code is null
      and visit_city        is null)
  ),

  -- Absagezeitpunkt und absagender Akteur gehoeren zum Status, nicht daneben.
  constraint appointments_cancellation_fields check (
    (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
    or (status = 'scheduled' and cancelled_at is null and cancelled_by is null)
  )
);

comment on table public.appointments is
  'Organisatorische Termine. Enthaelt bewusst KEINE klinischen Inhalte (PROJECT_PRINCIPLES.md 4.6, 5). Datenklasse: organisatorische Behandlungsdaten.';
comment on column public.appointments.starts_at is
  'Beginn als timestamptz. Der Kalendertag ergibt sich aus organizations.time_zone, nicht aus der Zeitzone des Aufrufers.';
comment on column public.appointments.ends_at is
  'Ende als timestamptz. Das Intervall ist halboffen [starts_at, ends_at): ein direkt anschliessender Termin ist zulaessig.';
comment on column public.appointments.visit_street is
  'Adress-Snapshot des Hausbesuchs zum Zeitpunkt der Anlage. Aendert sich mit spaeteren Stammdaten NICHT.';

create index appointments_org_starts_idx
  on public.appointments (organization_id, starts_at);
create index appointments_staff_starts_idx
  on public.appointments (staff_member_id, starts_at);
create index appointments_patient_idx
  on public.appointments (patient_id);

-- -----------------------------------------------------------------------------
-- Ueberschneidungsschutz
--
-- Konkurrenzsicher, weil die Datenbank ihn beim Einfuegen selbst durchsetzt:
-- zwei gleichzeitige Transaktionen koennen nicht beide erfolgreich sein.
--
--   * Halboffenes Intervall '[)' - 10:00-Ende und 10:00-Beginn ueberschneiden
--     sich nicht.
--   * Nur je behandelnder Person; zwei Personen duerfen zeitgleich arbeiten.
--   * Nur fuer 'scheduled'. Ein abgesagter Termin gibt seinen Zeitraum frei.
-- -----------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    staff_member_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'scheduled');

comment on constraint appointments_no_overlap on public.appointments is
  'Verhindert ueberschneidende geplante Termine derselben behandelnden Person. Halboffen, also sind angrenzende Termine zulaessig (CAL-001).';

-- -----------------------------------------------------------------------------
-- Rechte und RLS
-- -----------------------------------------------------------------------------
alter table public.appointments enable row level security;

revoke all on public.appointments from anon, authenticated;
-- Ausschliesslich lesend. Geschrieben wird nur ueber die RPC unten.
grant select on public.appointments to authenticated;

-- Praxisrollen sehen die Termine ihrer Organisation. Patientenkonten bekommen
-- in diesem Stand keinen Zugriff; ein Patientenblick auf den eigenen Termin
-- ist ein eigener Vorgang mit eigener Pruefung.
create policy appointments_select_staff_only
  on public.appointments for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
  );

-- -----------------------------------------------------------------------------
-- Ereigniskatalog um appointment.created erweitern (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'appointment.created'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in ('patient', 'organization', 'appointment'));

-- -----------------------------------------------------------------------------
-- Wer darf Termine anlegen
--
-- Eigene Funktion statt Wiederverwendung der Kartei-Leseregel: Lesen und
-- Terminplanung sind fachlich verschiedene Rechte.
-- -----------------------------------------------------------------------------
create or replace function app.can_create_appointment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_create_appointment() to authenticated;

-- -----------------------------------------------------------------------------
-- Wer ist als behandelnde Person zuordenbar
--
-- Abgeleitet aus dem bestehenden Modell, ohne ein zweites Rollensystem:
--   * aktives staff_member der Organisation,
--   * dessen Person einen aktiven Account hat,
--   * der eine therapeutische Rolle traegt.
--
-- Damit ist ein 'office'-Mitglied nicht zuordenbar, und ein 'owner' nur dann,
-- wenn sein Account zusaetzlich 'therapist' oder 'team_lead' hat.
-- -----------------------------------------------------------------------------
create or replace function app.is_assignable_therapist(
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members sm
    join public.user_profiles up
      on up.person_id = sm.person_id
     and up.organization_id = sm.organization_id
    join public.user_roles ur
      on ur.user_id = up.id
     and ur.organization_id = up.organization_id
    where sm.id = p_staff_member_id
      and sm.organization_id = p_organization_id
      and sm.employment_status = 'active'
      and up.is_active
      and ur.role_key in ('therapist', 'team_lead')
  )
$$;

comment on function app.is_assignable_therapist(uuid, uuid) is
  'Prueft, ob ein staff_member als behandelnde Person zuordenbar ist (CAL-001). Nur fuer die serverseitigen Schreib- und Lesepfade, nicht fuer Aufrufer.';

-- Der Aufrufer gibt die Organisation selbst mit. Direkt aufrufbar waere die
-- Funktion damit ein Existenz-Orakel: 'gibt es diesen Mitarbeiter in JENER
-- Praxis?' liesse sich mit true/false beantworten (PROJECT_PRINCIPLES.md 13).
-- PostgreSQL vergibt EXECUTE auf neue Funktionen standardmaessig an PUBLIC -
-- der Entzug muss deshalb ausdruecklich erfolgen. Die SECURITY-DEFINER-Pfade
-- oben laufen als Eigentuemer und koennen sie weiterhin aufrufen.
revoke all on function app.is_assignable_therapist(uuid, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_assignable_therapists
--
-- Eigener Lesepfad, weil die RLS auf user_roles einem Nicht-owner die Rollen
-- anderer Accounts bewusst nicht zeigt. Ein Join im Client wuerde fuer 'office'
-- deshalb eine leere Auswahl liefern. Geliefert wird die kleinstmoegliche
-- Projektion: ID und Anzeigename (ADR-004).
-- -----------------------------------------------------------------------------
create or replace function public.list_assignable_therapists()
returns table (staff_member_id uuid, display_name text)
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

  if not app.can_create_appointment() then
    raise exception 'not allowed to plan appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to plan appointments' using errcode = '42501';
  end if;

  return query
    select sm.id, pe.given_name || ' ' || pe.family_name
    from public.staff_members sm
    join public.persons pe on pe.id = sm.person_id
    where sm.organization_id = v_org
      and app.is_assignable_therapist(sm.id, v_org)
    order by pe.family_name, pe.given_name;
end;
$$;

comment on function public.list_assignable_therapists() is
  'Liefert die als behandelnde Person zuordenbaren Mitarbeitenden der eigenen Organisation (CAL-001).';

revoke all on function public.list_assignable_therapists() from public, anon;
grant execute on function public.list_assignable_therapists() to authenticated;

-- -----------------------------------------------------------------------------
-- appointment_directory
--
-- Lesesicht fuer die Anwendung. security_invoker: die RLS der Basistabellen
-- gilt unveraendert, die Sicht erweitert also keine Sichtbarkeit.
--
-- Die Zeitzone der Organisation wird mitgeliefert, damit die Oberflaeche
-- lokale Zeiten ohne zweite Abfrage und ohne eigene Zeitzonenannahme
-- darstellen kann.
-- -----------------------------------------------------------------------------
create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.appointment_type,
  a.status,
  a.starts_at,
  a.ends_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.updated_at,
  a.cancelled_at,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone
from public.appointments a
join public.patients p      on p.id  = a.patient_id
join public.persons pp      on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp      on sp.id = sm.person_id
join public.organizations o on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben.';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;

-- -----------------------------------------------------------------------------
-- create_appointment
--
-- Nimmt Kalendertag und Uhrzeiten entgegen, keinen fertigen Zeitstempel und
-- keine organization_id. Die Organisation stammt aus auth.uid(); Patient,
-- behandelnde Person und Standort werden ausschliesslich innerhalb dieser
-- Organisation gesucht. Eine fremde und eine unbekannte ID erzeugen deshalb
-- dieselbe Meldung und taugen nicht als Existenz-Orakel.
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment(
  p_patient_id      uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date            date,
  p_start_time      time,
  p_end_time        time,
  p_location_id     uuid default null
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
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
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

  -- Halboffenes Intervall: ein Ende gleich dem Beginn ist kein Termin. Ein
  -- Termin endet am selben Kalendertag, an dem er beginnt.
  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone into v_time_zone
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Kalendertag und Uhrzeit werden in der Zeitzone der Praxis ausgelegt.
  v_heute := (now() at time zone v_time_zone)::date;

  -- Ein vollstaendig vergangener Kalendertag ist nicht mehr planbar. Der
  -- laufende Tag bleibt es, damit eine organisatorische Nachtragung moeglich
  -- ist, auch wenn der Beginn schon kurz zurueckliegt.
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  -- Patient ausschliesslich in der eigenen Organisation suchen.
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

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    -- Bewusst dieselbe Meldung fuer "gibt es nicht", "fremde Praxis",
    -- "nicht aktiv" und "keine therapeutische Rolle".
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  -- Ortsangaben strikt nach Terminart. Die CHECK-Constraints im Schema sind
  -- die zweite Verteidigungslinie; hier entstehen die verstaendlichen Fehler.
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
    -- Nicht zur Terminart passende Ortsdaten werden nicht gespeichert.
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
      appointment_type, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      p_appointment_type, 'scheduled', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      -- Die Constraint hat zugeschlagen. Auch bei zwei gleichzeitigen
      -- Anlagen kann hier nur eine gewinnen.
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  -- Auditeintrag ohne Stammdaten und ohne konkrete Terminzeiten: nur Akteur,
  -- Organisation, Bezuege, Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.created', 'appointment', v_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'staff_member_id', p_staff_member_id
    )
  );

  return v_appointment_id;
end;
$$;

comment on function public.create_appointment(uuid, uuid, text, date, time, time, uuid) is
  'Legt einen Termin atomar an, rechnet Kalendertag und Uhrzeit in der Zeitzone der Organisation um und protokolliert appointment.created (CAL-001, ADR-010).';

revoke all on function public.create_appointment(uuid, uuid, text, date, time, time, uuid)
  from public, anon;
grant execute on function public.create_appointment(uuid, uuid, text, date, time, time, uuid)
  to authenticated;
