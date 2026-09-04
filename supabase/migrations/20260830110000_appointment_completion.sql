-- =============================================================================
-- Termine abschliessen und wieder oeffnen (CAL-004)
--
-- Der dritte Status neben 'scheduled' und 'cancelled'. Fachlich ist er etwas
-- anderes als eine Absage: der Termin hat stattgefunden.
--
-- Daraus folgen drei Dinge, die ueber das blosse Hinzufuegen eines Wertes
-- hinausgehen:
--
--   * Ein abgeschlossener Termin hat seinen Zeitraum tatsaechlich belegt. Die
--     EXCLUDE-Constraint muss ihn deshalb weiter beruecksichtigen - sonst
--     liesse sich rueckwirkend ueber eine bereits erfolgte Behandlung hinweg
--     doppelt buchen.
--   * Ein abgeschlossener Termin ist nicht direkt bearbeitbar, verschiebbar
--     oder absagbar. Er muss vorher ausdruecklich wieder geoeffnet werden.
--     Die bestehenden Schreibpfade melden das jetzt getrennt von einer Absage.
--   * Der Kalender muss ihn weiter zeigen. Ein Statusfilter, der nur 'scheduled'
--     kennt, liesse jeden abgehakten Termin aus dem Tag verschwinden.
--
-- Beim Wiederoeffnen werden die Abschlussfelder geleert - die Constraint
-- bindet sie an den Status. Die Historie bleibt vollstaendig im Auditlog:
-- appointment.completed und appointment.reopened werden nie entfernt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Status und Abschlussfelder
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('scheduled', 'completed', 'cancelled'));

alter table public.appointments
  add column completed_at timestamptz,
  add column completed_by uuid;

comment on column public.appointments.completed_at is
  'Zeitpunkt des Abschlusses. Wird beim Wiederoeffnen geleert; die Historie bleibt im Auditlog (CAL-004).';
comment on column public.appointments.completed_by is
  'auth.users.id des abschliessenden Accounts. Bewusst ohne FK, wie actor_user_id im Auditlog.';

-- Die Absage-Constraint zaehlte die alte Statusmenge vollstaendig auf und
-- liess damit ausschliesslich 'scheduled' und 'cancelled' zu. Mit dem dritten
-- Status haette sie jeden Abschluss abgewiesen. Die Aussage bleibt dieselbe -
-- Absagefelder gehoeren zur Absage -, sie wird nur nicht mehr ueber eine
-- geschlossene Aufzaehlung formuliert.
alter table public.appointments drop constraint appointments_cancellation_fields;
alter table public.appointments
  add constraint appointments_cancellation_fields check (
    (status = 'cancelled' and cancelled_at is not null and cancelled_by is not null)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by is null)
  );

alter table public.appointments
  add constraint appointments_completion_fields check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status <> 'completed' and completed_at is null and completed_by is null)
  );

-- -----------------------------------------------------------------------------
-- Ueberschneidungsschutz auf abgeschlossene Termine ausweiten
--
-- Nur abgesagte Termine geben ihren Zeitraum frei. Ein abgeschlossener Termin
-- hat stattgefunden und bleibt belegt.
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_no_overlap;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    staff_member_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'completed'));

comment on constraint appointments_no_overlap on public.appointments is
  'Verhindert ueberschneidende geplante ODER abgeschlossene Termine derselben behandelnden Person. Halboffen, angrenzende Termine zulaessig. Nur Absagen geben den Zeitraum frei (CAL-001, CAL-004).';

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
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
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened'
  ));

-- -----------------------------------------------------------------------------
-- Rechte
--
-- Dieselbe Rollenmenge wie beim Anlegen und Aendern, aber je Vorgang eine
-- eigene Funktion - Abschliessen und Wiederoeffnen sind fachlich verschieden.
-- -----------------------------------------------------------------------------
create or replace function app.can_complete_appointment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

create or replace function app.can_reopen_appointment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_complete_appointment() to authenticated;
grant execute on function app.can_reopen_appointment() to authenticated;

-- -----------------------------------------------------------------------------
-- complete_appointment
--
-- Ein Termin darf ohne Behandlungsdokumentation abgeschlossen werden. Der
-- Abschluss ist eine organisatorische Feststellung, dass die Behandlung
-- stattgefunden hat - keine Aussage ueber ihren Inhalt.
--
-- ANN-005 (docs/decisions/ASSUMPTIONS.md): vorlaeufige Annahme, Wiedervorlage
-- im Epic Behandlungsdokumentation.
--
-- Sperre und erwarteter updated_at-Wert wie bei update_appointment: ohne
-- FOR UPDATE waere die Concurrency-Pruefung unter READ COMMITTED wirkungslos.
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

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'completed' then
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
     and status = 'scheduled';

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
  'Schliesst einen geplanten Termin ab und protokolliert appointment.completed (CAL-004, ADR-010). Verlangt keine Behandlungsdokumentation.';

revoke all on function public.complete_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.complete_appointment(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- reopen_appointment
--
-- Fuer den versehentlichen Abschluss. Der Termin ist danach wieder ein ganz
-- normaler geplanter Termin; die Abschlussfelder werden geleert, weil die
-- Constraint sie an den Status bindet. Dass er einmal abgeschlossen war,
-- bleibt ueber appointment.completed und appointment.reopened nachvollziehbar
-- - im Auditlog wird nichts entfernt (ADR-010).
-- -----------------------------------------------------------------------------
create or replace function public.reopen_appointment(
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

  if not app.can_reopen_appointment() then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  if v_alt.status = 'scheduled' then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'scheduled',
         completed_at = null,
         completed_by = null,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'completed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.reopened', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.reopen_appointment(uuid, timestamptz) is
  'Setzt einen versehentlich abgeschlossenen Termin auf geplant zurueck und protokolliert appointment.reopened (CAL-004, ADR-010).';

revoke all on function public.reopen_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.reopen_appointment(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- Terminsicht um den Abschlusszeitpunkt ergaenzen
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
  a.status,
  a.starts_at,
  a.ends_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.updated_at,
  a.cancelled_at,
  a.completed_at,
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
-- Kalenderlesepfad: abgeschlossene Termine bleiben sichtbar
--
-- Der bisherige Standard 'scheduled' haette jeden abgehakten Termin aus dem
-- Tag verschwinden lassen. Der neue Standard 'active' zeigt alles, was den Tag
-- tatsaechlich belegt - geplant und abgeschlossen -, und blendet nur Absagen
-- aus.
-- -----------------------------------------------------------------------------
create or replace function public.list_appointments(
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
     or p_status not in ('scheduled', 'completed', 'cancelled', 'active', 'all') then
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
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name
    from public.appointments a
    join public.patients p       on p.id  = a.patient_id
    join public.persons pp       on pp.id = p.person_id
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
        or (p_status = 'active' and a.status in ('scheduled', 'completed'))
        or a.status = p_status
      )
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$$;

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten (CAL-002, CAL-004).';

-- -----------------------------------------------------------------------------
-- Bestehende Schreibpfade: abgeschlossene Termine gesondert abweisen
--
-- Beide Funktionen wiesen einen abgeschlossenen Termin schon vorher ab, aber
-- mit einer irrefuehrenden Meldung:
--
--   * update_appointment prueft `status <> 'scheduled'` und meldete jede
--     Abweichung als Absage.
--   * cancel_appointment prueft nur auf 'cancelled'. Ein abgeschlossener
--     Termin fiel durch diese Pruefung hindurch und scheiterte erst an der
--     Bedingung `status = 'scheduled'` im UPDATE - also mit einem
--     Nebenlaeufigkeitsfehler, obwohl gar nichts nebenlaeufig passiert ist.
--
-- Beides ist nach CAL-004 falsch: der Termin ist nicht abgesagt und nicht
-- fremd geaendert, er muss ausdruecklich wieder geoeffnet werden. Die Bedingung
-- `status = 'scheduled'` im UPDATE bleibt als zweite Verteidigungslinie
-- bestehen; sie faengt jetzt nur noch echte Nebenlaeufigkeit ab.
--
-- Die Rumpfe sind unveraendert aus 20260830100300_appointment_changes.sql
-- uebernommen; PostgreSQL kennt kein teilweises Ersetzen einer Funktion. Der
-- fachliche Unterschied beschraenkt sich auf die Statuspruefungen oben.
-- -----------------------------------------------------------------------------
create or replace function public.update_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_staff_member_id     uuid,
  p_appointment_type    text,
  p_date                date,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null
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

  -- Bestehenden Termin ausschliesslich in der eigenen Organisation suchen. Eine
  -- fremde und eine unbekannte ID sind damit ununterscheidbar.
  -- FOR UPDATE ist hier nicht optional. Ohne die Sperre laese eine zweite
  -- Transaktion unter READ COMMITTED den Stand VOR dem Commit der ersten,
  -- fande ihren erwarteten updated_at-Wert bestaetigt und wuerde die fremde
  -- Aenderung anschliessend ueberschreiben - genau der verlorene Update, den
  -- diese Funktion verhindern soll.
  select a.id, a.patient_id, a.staff_member_id, a.location_id, a.appointment_type,
         a.status, a.starts_at, a.ends_at, a.updated_at,
         a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Abgesagte Termine sind terminal.
  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  -- Abgeschlossene Termine sind nicht terminal, aber auch nicht direkt
  -- aenderbar: erst wieder oeffnen, dann bearbeiten (CAL-004).
  if v_alt.status = 'completed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Optimistic Concurrency: wer auf einem veralteten Stand speichert, wird
  -- abgewiesen. Kein Teilupdate, kein Erfolgsaudit.
  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Alle neuen Werte werden erneut geprueft - genau wie beim Anlegen.
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

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;

  -- Ein Termin laesst sich nicht in einen vollstaendig vergangenen Kalendertag
  -- verschieben; der laufende Tag bleibt zulaessig.
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
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
      -- Bleibt es ein Hausbesuch, bleibt der Snapshot unveraendert.
      v_street := v_alt.visit_street;
      v_house  := v_alt.visit_house_number;
      v_postal := v_alt.visit_postal_code;
      v_city   := v_alt.visit_city;
    else
      -- Wechsel ZU einem Hausbesuch: Adresse jetzt uebernehmen.
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

  -- Nur die NAMEN der tatsaechlich geaenderten Felder werden protokolliert -
  -- niemals alte oder neue Werte, und niemals die konkreten Zeiten (ADR-010).
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

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
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
     -- Der erwartete Stand steht zusaetzlich in der Bedingung: zweite
     -- Verteidigungslinie neben der Sperre oben.
     where id = p_appointment_id
       and updated_at = p_expected_updated_at;

    if not found then
      raise exception 'appointment was changed meanwhile' using errcode = '40001';
    end if;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  -- Abgrenzung der Ereignisse (Auftrag Abschnitt 7):
  --   nur Zeit                -> appointment.rescheduled
  --   organisatorische Felder -> appointment.updated
  --   beides                  -> genau EIN appointment.updated, die Zeitfelder
  --                              stehen in changed_fields
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
      'changed_fields', to_jsonb(v_geaendert)
    )
  );

  return p_appointment_id;
end;
$$;
create or replace function public.cancel_appointment(
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

  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Wie bei update_appointment: ohne die Sperre koennte eine zweite
  -- Transaktion auf einem ueberholten Stand absagen.
  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Eine erneute Absage ist fachlich abzulehnen und erzeugt kein Erfolgsaudit.
  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  -- Ein abgeschlossener Termin wird nicht ueber den Abschluss hinweg abgesagt.
  if v_alt.status = 'completed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'scheduled';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.cancelled', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;
