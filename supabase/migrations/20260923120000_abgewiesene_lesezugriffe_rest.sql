-- =============================================================================
-- Abgewiesene Lesezugriffe, Rest (G6b Teil 1, ADR-010)
--
-- Seit OPS-004 und G6a lassen neun Lesepfade eine Abweisung ueberleben: null
-- Zeilen statt einer Ausnahme und ein Eintrag mit outcome = 'denied'. Hier
-- folgen die uebrigen Lesepfade mit 'not allowed to ...' - aber nur die, die
-- die Oberflaeche fuer die abgewiesene Rolle nie aufruft. Ein Aufruf ist dann
-- einer an der Anwendung vorbei, und genau den soll der Monatsreport nach
-- ADR-010 Punkt 6 sehen koennen. Die Zuordnung Pfad -> Aufrufer -> Rolle steht
-- in docs/development/ROADMAP.md bei G6b.
--
-- Bewusst NICHT umgestellt:
--   * list_assignable_therapists - die Teamseiten rufen ihn auch fuer trainer
--     auf; dort erwartet die Oberflaeche eine Ausnahme (BEF-034).
--   * alle Schreibpfade (G6b Teil 2, Entscheidung Jannes).
--   * ohne Sitzung und ohne Organisation - wie OPS-004 und G6a.
--
-- Aktionen: Wo der erfolgreiche Zugriff einen Eintrag schreibt, dieselbe
-- Aktion (Terminzettel -> patient_record.viewed). Sonst eine Aktion je
-- Datenbereich, die nur mit outcome 'denied' vorkommt - wie deletion_runs.read
-- seit OPS-004. Das erfolgreiche Lesen bleibt ohne Eintrag; ADR-010 Punkt 2
-- verlangt ihn nur fuer klinische Dokumente.
--
-- Die Funktionen verlieren STABLE: Im Abweisungsfall schreiben sie. Rumpf,
-- Rechte und Signatur sind sonst unveraendert (create or replace behaelt die
-- Grants).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog: zehn Aktionen, die nur mit outcome 'denied' vorkommen.
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; supabase/tests/audit.test.ts prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'patient_record.exported',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'organization.billing_profile_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted',
    'service_catalog.version_created',
    'service_catalog.version_updated',
    'service_catalog.version_published',
    'service_catalog.version_deleted',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice_recipient.created',
    'invoice_recipient.updated',
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued',
    'invoice.cancelled',
    'invoice.reminder_created',
    'payment.recorded',
    'payment.voided',
    'organization.bootstrapped',
    'deletion_runs.read',
    'patient_privacy.recorded',
    'appointments.read',
    'patient_directory.read',
    'treatment_bases.read',
    'treatment_evidence.read',
    'patient_files.read',
    'text_snippets.read',
    'invoicing.read',
    'billable_services.read',
    'legal_holds.read',
    'storage_deletion.read'
  ));

-- -----------------------------------------------------------------------------
-- list_appointments - Kalender
-- -----------------------------------------------------------------------------
create or replace function public.list_appointments(p_from date, p_to date, p_staff_member_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, location_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, staff_given_name text, staff_family_name text, location_name text)
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

  if not app.can_read_appointments() then
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
      l.name
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
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

-- -----------------------------------------------------------------------------
-- list_day_plan - Tagesliste
-- -----------------------------------------------------------------------------
create or replace function public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text)
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
  if not app.can_read_appointments() then
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
      v_tz
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_event_participants - Beteiligte einer Veranstaltung
-- -----------------------------------------------------------------------------
create or replace function public.list_event_participants(p_event_group_id uuid)
 RETURNS TABLE(appointment_id uuid, staff_member_id uuid, display_name text, status text, group_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_stand timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_event_group_id is null then
    raise exception 'event is required' using errcode = '22023';
  end if;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'internal';

  return query
    select a.id, a.staff_member_id,
           pp.given_name || ' ' || pp.family_name,
           a.status,
           v_stand
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons pp       on pp.id = sm.person_id
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.kind = 'internal'
    order by pp.family_name, pp.given_name;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_event_series - Veranstaltungsreihe
-- -----------------------------------------------------------------------------
create or replace function public.list_event_series(p_event_series_id uuid)
 RETURNS TABLE(event_group_id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, open_count integer, cancelled_count integer, series_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_stand timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_event_series_id is null then
    raise exception 'event series is required' using errcode = '22023';
  end if;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_series_id = p_event_series_id;

  return query
    select a.event_group_id,
           min(a.title),
           min(a.starts_at),
           max(a.ends_at),
           count(*) filter (where a.status <> 'cancelled')::integer,
           count(*) filter (where a.status =  'cancelled')::integer,
           v_stand
    from public.appointments a
    where a.organization_id = v_org
      and a.event_series_id = p_event_series_id
    group by a.event_group_id
    order by min(a.starts_at);
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_appointments - Termine der Akte
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_appointments(p_patient_id uuid, p_upcoming boolean DEFAULT false, p_limit integer DEFAULT 20, p_after_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_treatment_basis_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, status text, staff_given_name text, staff_family_name text, notification_channels text[], treatment_basis_id uuid, treatment_basis_kind text, treatment_basis_issued_on date, treatment_basis_covered boolean, organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_upcoming boolean := coalesce(p_upcoming, false);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  -- Der Cursor besteht aus beiden Teilen oder gar nicht.
  if (p_after_starts_at is null) <> (p_after_id is null) then
    raise exception 'cursor is incomplete' using errcode = '22023';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      app.appointment_notification_channels(a.id),
      a.treatment_basis_id,
      -- GRD-001: Die Bauart kommt mit, weil die Liste die Grundlage benennen
      -- soll und nicht raten darf, ob sie eine Verordnung ist (ADR-020 Punkt
      -- 7). Sie ist organisatorisch - eine Diagnose steht hier nicht.
      pr.treatment_basis_kind,
      pr.issued_on,
      -- CAL-022: Ungedeckt heisst sichtbar - auch in der Liste, nicht nur an
      -- der Grundlage.
      app.appointment_is_covered(a.id),
      o.time_zone
    from public.appointments a
    join public.staff_members sm  on sm.id = a.staff_member_id
    join public.persons sp        on sp.id = sm.person_id
    join public.organizations o   on o.id  = a.organization_id
    left join public.treatment_bases pr on pr.id = a.treatment_basis_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and (p_treatment_basis_id is null or a.treatment_basis_id = p_treatment_basis_id)
      and (
        case when v_upcoming then a.starts_at > now() else a.starts_at <= now() end
      )
      and (
        p_after_starts_at is null
        or (
          case
            when v_upcoming then (a.starts_at, a.id) > (p_after_starts_at, p_after_id)
            else (a.starts_at, a.id) < (p_after_starts_at, p_after_id)
          end
        )
      )
    -- Die Richtung steckt in der Sortierung: In jedem Lauf sind zwei der vier
    -- Ausdruecke fuer JEDE Zeile null und damit wirkungslos - uebrig bleibt
    -- genau das Paar der gewaehlten Richtung. Das ist billiger als zwei
    -- Rumpfvarianten derselben Abfrage, die getrennt gepflegt werden muessten.
    order by
      case when v_upcoming then a.starts_at end asc,
      case when v_upcoming then a.id end asc,
      case when not v_upcoming then a.starts_at end desc,
      case when not v_upcoming then a.id end desc
    limit p_limit;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_upcoming_appointments - kommende Termine der Akte
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_upcoming_appointments(p_patient_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, status text, staff_given_name text, staff_family_name text, notification_channels text[], organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 5), 1), 20);

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      app.appointment_notification_channels(a.id),
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and a.starts_at > now()
      and a.status <> 'cancelled'
    order by a.starts_at, a.id
    limit v_limit;
end;
$function$;

-- -----------------------------------------------------------------------------
-- check_appointment_slots - Konfliktpruefung einer Serie
-- -----------------------------------------------------------------------------
create or replace function public.check_appointment_slots(p_staff_member_id uuid, p_slots jsonb)
 RETURNS TABLE(slot_index integer, conflict text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org     uuid;
  v_tz      text;
  v_grid    smallint;
  v_heute   date;
  v_dauer   interval;
  v_anzahl  integer;
  v_i       integer;
  v_j       integer;
  v_daten   date[] := array[]::date[];
  v_zeiten  time[] := array[]::time[];
  v_datum   date;
  v_beginn  time;
  v_ende    time;
  v_von     timestamptz;
  v_bis     timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  -- Ohne diese Pruefung waere die Funktion ein Existenz-Orakel fuer fremde
  -- Mitarbeitende (dieselbe Meldung wie in create_appointment).
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_slots) > app.appointment_series_limit() then
    raise exception 'series is limited to % appointments', app.appointment_series_limit()
      using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  v_heute  := (now() at time zone v_tz)::date;
  v_dauer  := make_interval(mins => app.appointment_window_minutes());
  v_anzahl := jsonb_array_length(p_slots);

  -- Erster Durchgang: einlesen. Was sich nicht lesen laesst, wird null und
  -- bekommt im zweiten Durchgang den Befund 'invalid'. Getrennt, weil die
  -- Pruefung auf Doppelungen die Zeilen davor bereits geparst braucht.
  for v_i in 0 .. v_anzahl - 1 loop
    begin
      v_daten[v_i]  := (p_slots -> v_i ->> 'datum')::date;
      v_zeiten[v_i] := (p_slots -> v_i ->> 'beginn')::time;
    exception
      when others then
        v_daten[v_i]  := null;
        v_zeiten[v_i] := null;
    end;
  end loop;

  for v_i in 0 .. v_anzahl - 1 loop
    slot_index := v_i;
    conflict := null;
    v_datum  := v_daten[v_i];
    v_beginn := v_zeiten[v_i];

    -- time + interval laeuft ueber Mitternacht um: 23:30 plus 60 Minuten
    -- ergibt 00:30. Ein Termin ueber den Tageswechsel ist keiner (8.1 rechnet
    -- in Ortszeit), deshalb ist das hier ungueltig und nicht der Folgetag.
    v_ende := case when v_beginn is null then null else v_beginn + v_dauer end;

    if v_datum is null or v_beginn is null or v_ende <= v_beginn then
      conflict := 'invalid';
    elsif v_datum < v_heute then
      conflict := 'past';
    elsif not app.is_on_appointment_grid(v_beginn, v_grid) then
      conflict := 'off_grid';
    else
      v_von := (v_datum + v_beginn) at time zone v_tz;
      v_bis := v_von + v_dauer;

      -- Ueberschneidung innerhalb derselben Serie. Muss vor der Pruefung gegen
      -- die Datenbank stehen: dort stehen die anderen Zeilen noch nicht.
      for v_j in 0 .. v_i - 1 loop
        if v_daten[v_j] is not null and v_zeiten[v_j] is not null
           and (v_daten[v_j] + v_zeiten[v_j]) at time zone v_tz < v_bis
           and ((v_daten[v_j] + v_zeiten[v_j]) at time zone v_tz) + v_dauer > v_von then
          conflict := 'duplicate';
          exit;
        end if;
      end loop;

      if conflict is null
         and exists (
           select 1
           from public.appointments a
           where a.organization_id = v_org
             and a.staff_member_id = p_staff_member_id
             and a.status <> 'cancelled'
             and tstzrange(a.starts_at, a.ends_at, '[)')
                 && tstzrange(v_von, v_bis, '[)')
         ) then
        conflict := 'overlap';
      end if;

      if conflict is null
         and not app.is_within_working_hours(
           p_staff_member_id, v_org, v_datum, v_beginn, v_ende
         ) then
        conflict := 'outside_working_hours';
      end if;
    end if;

    return next;
  end loop;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_staff_future_appointments - offene Termine einer Person beim Statuswechsel
-- -----------------------------------------------------------------------------
create or replace function public.list_staff_future_appointments(p_staff_member_id uuid)
 RETURNS TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, kind text, title text, patient_id uuid, patient_given_name text, patient_family_name text, location_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_employment() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to manage staff');
    return;
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
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_appointment_slip - Terminzettel; dieselbe Aktion wie der erfolgreiche Druck
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_appointment_slip(p_patient_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, location_name text, staff_given_name text, staff_family_name text, organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_actor uuid;
  v_limit integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Wer den Kalender lesen darf, darf den Zettel drucken.
  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_record.viewed', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  -- Eine unbekannte und eine fremde ID liefern dieselbe leere Antwort und
  -- erzeugen keinen Auditeintrag (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, context
  )
  values (
    v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id,
    jsonb_build_object('surface', 'web', 'view', 'appointment_slip')
  );

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      l.name,
      sp.given_name,
      sp.family_name,
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and a.starts_at > now()
      -- Nur bestaetigte Termine: ein abgesagter gehoert nicht auf einen Zettel,
      -- den jemand mitnimmt (ADR-018).
      and a.status = 'confirmed'
    order by a.starts_at, a.id
    limit v_limit;
end;
$function$;

-- -----------------------------------------------------------------------------
-- search_patients - Patientensuche
-- -----------------------------------------------------------------------------
create or replace function public.search_patients(p_query text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, given_name text, family_name text, date_of_birth date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_such  text;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie die Kartei: wer sie lesen darf, darf in ihr
  -- suchen - die Suche ist kein zweites Recht (ADR-004 Punkt 6).
  if not app.can_read_patient_directory() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read patient directory');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read patient directory' using errcode = '42501';
  end if;

  v_such := app.suchform(btrim(coalesce(p_query, '')));

  -- Zu kurz ist kein Fehler, sondern schlicht kein Treffer. Eine Meldung
  -- taugte hier als Existenz-Orakel und hilft niemandem beim Tippen.
  if length(v_such) < app.patient_search_min_length() then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 10), 1), 25);

  return query
    select
      p.id,
      pe.given_name,
      pe.family_name,
      pc.date_of_birth,
      p.status
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.organization_id = v_org
      and (
        -- Beide Schreibrichtungen: "Mustermann Max" und "Max Mustermann"
        -- fuehren zum selben Treffer.
        position(v_such in app.suchform(pe.given_name || ' ' || pe.family_name)) > 0
        or position(v_such in app.suchform(pe.family_name || ' ' || pe.given_name)) > 0
      )
    -- Laufende Versorgung zuerst: wer heute behandelt wird, wird oefter
    -- gesucht als ein abgeschlossener Fall.
    order by (p.status = 'active') desc, pe.family_name, pe.given_name, p.id
    limit v_limit;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_bases - organisatorische Sicht der Behandlungsgrundlagen
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_bases(p_patient_id uuid)
 RETURNS TABLE(id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org  uuid;
  v_ids  uuid[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_treatment_bases() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read treatment_bases');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_ids := app.patient_treatment_basis_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  return query
    select
      p.id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      -- ANN-011: die organisatorische Bemerkung ja, die klinischen Felder
      -- ausdruecklich nicht. Diese Spaltenliste ist die Grenze.
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_basis_slots - Kontingente der Akte
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_basis_slots(p_patient_id uuid)
 RETURNS TABLE(treatment_basis_id uuid, prescribed integer, used integer, planned integer, upcoming integer, remaining integer, covered integer, uncovered integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read treatment_bases');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  return query
    select
      p.id,
      zahlen.prescribed,
      zahlen.used,
      zahlen.planned,
      (
        select count(*)::integer
        from public.appointments a
        where a.treatment_basis_id = p.id
          and a.organization_id = v_org
          and a.status <> 'cancelled'
          and a.starts_at > now()
      ),
      zahlen.remaining,
      zahlen.covered,
      zahlen.uncovered
    from public.treatment_bases p
    cross join lateral app.treatment_basis_slot_counts(p.id, v_org) zahlen
    where p.organization_id = v_org
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.id desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- get_treatment_basis_slots - Kontingent einer Grundlage
-- -----------------------------------------------------------------------------
create or replace function public.get_treatment_basis_slots(p_treatment_basis_id uuid)
 RETURNS TABLE(patient_id uuid, frequency_note text, prescribed integer, used integer, planned integer, remaining integer, covered integer, uncovered integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_zahlen record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read treatment_bases');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id, p.frequency_note
    into patient_id, frequency_note
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  select * into v_zahlen from app.treatment_basis_slot_counts(p_treatment_basis_id, v_org);
  prescribed := v_zahlen.prescribed;
  used       := v_zahlen.used;
  planned    := v_zahlen.planned;
  remaining  := v_zahlen.remaining;
  covered    := v_zahlen.covered;
  uncovered  := v_zahlen.uncovered;
  return next;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_evidence - Behandlungsnachweis
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_evidence(p_patient_id uuid, p_limit integer DEFAULT 20, p_before_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(appointment_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, appointment_status text, staff_given_name text, staff_family_name text, organization_time_zone text, documentation_status text, documented_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_treatment_evidence() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_evidence.read', 'not allowed to read treatment evidence');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment evidence' using errcode = '42501';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      o.time_zone,
      -- ANN-006: Dokumentationsstand ohne Inhalt, Zeitpunkt nur fuer
      -- finalisierte Eintraege.
      case when t.id is null then 'none' else t.status end,
      case when t.status = 'final' then t.finalized_at else null end
    from app.patient_record_page(
           v_org, p_patient_id, p_limit, p_before_starts_at, p_before_id
         ) seite
    join public.appointments a    on a.id  = seite.appointment_id
    join public.staff_members sm  on sm.id = a.staff_member_id
    join public.persons sp        on sp.id = sm.person_id
    join public.organizations o   on o.id  = a.organization_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    order by a.starts_at desc, a.id desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_patient_files - Dateien der Akte; Rollenpruefung vor der Akte
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_files(p_patient_id uuid, p_treatment_basis_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, treatment_basis_id uuid, document_type text, is_clinical boolean, display_name text, mime_type text, byte_size bigint, uploaded_at timestamp with time zone, uploaded_by_name text, object_missing boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- G6b: Die Rollenpruefung steht vor der Akte, denn app.patient_file_organization
  -- prueft das Leserecht auf das Verzeichnis mit und wiese sonst mit Ausnahme ab.
  if not app.can_read_patient_files() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_files.read', 'not allowed to read patient files');
    return;
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.treatment_basis_id,
           f.document_type,
           t.is_clinical,
           f.display_name,
           f.mime_type,
           f.byte_size,
           f.confirmed_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket()
               and o.name = f.object_key
           )
    from public.patient_files f
    join public.patient_file_document_types t on t.key = f.document_type
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and (p_treatment_basis_id is null or f.treatment_basis_id = p_treatment_basis_id)
      and app.can_see_patient_file_type(f.document_type)
    order by f.confirmed_at desc, f.id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_text_snippets - Textbausteine
-- -----------------------------------------------------------------------------
create or replace function public.list_text_snippets()
 RETURNS TABLE(id uuid, title text, body text, shared boolean, editable boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_person uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_use_text_snippets() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'text_snippets.read', 'not allowed to use text snippets');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to use text snippets' using errcode = '42501';
  end if;

  v_person := app.current_person_id();

  return query
    select
      s.id,
      s.title,
      s.body,
      s.staff_member_id is null,
      case
        when s.staff_member_id is null then app.can_manage_shared_text_snippets()
        else true
      end
    from public.treatment_text_snippets s
    where s.organization_id = v_org
      and (
        s.staff_member_id is null
        or s.staff_member_id in (
          select sm.id from public.staff_members sm where sm.person_id = v_person
        )
      )
    order by (s.staff_member_id is null) desc, lower(s.title), s.id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_invoices - Rechnungen
-- -----------------------------------------------------------------------------
create or replace function public.list_invoices(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, status text, invoice_number text, period_month date, service_area text, issued_on date, due_on date, patient_id uuid, patient_name text, recipient_name text, recipient_kind text, total_cents integer, currency text, item_count integer, paid_cents integer, outstanding_cents integer, payment_state text, overdue boolean, cancelled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  with auswahl as (
    -- Erst begrenzen, dann anreichern: Reihenfolge und Auswahl haengen allein
    -- an Spalten der Rechnung. Alles Weitere - Name, Empfaenger, Zeilensumme,
    -- Zahlungsstand - wird nur noch fuer die gelieferten Zeilen geholt.
    select i.*
    from public.invoices i
    where i.organization_id = v_org
    order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id
    limit greatest(least(coalesce(p_limit, 100), 200), 1)
  )
  select i.id, i.status, i.invoice_number, i.period_month, i.service_area, i.issued_on, i.due_on,
         i.patient_id,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         coalesce(r.recipient_kind, 'self'),
         -- Der Entwurf rechnet live, die ausgestellte Rechnung zeigt ihren
         -- festgeschriebenen Betrag (ADR-009 Punkt 10).
         coalesce(i.total_cents, summe.brutto)::integer,
         coalesce(i.currency, summe.currency),
         summe.anzahl::integer,
         -- Neu mit ABR-004: Der Zahlungsstand wird gerechnet, nicht gelesen.
         -- Am Entwurf gibt es keinen - an ihm kann niemand zahlen.
         case when i.status = 'issued' then coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then i.total_cents - coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, coalesce(zahlung.bezahlt, 0))
              else 'unpaid' end,
         -- Seit ABR-003c: Eine stornierte Rechnung wird nicht ueberfaellig.
         (i.status = 'issued' and i.due_on < v_heute
          and coalesce(zahlung.bezahlt, 0) < i.total_cents
          and not exists (
            select 1 from public.invoice_cancellations c where c.invoice_id = i.id
          )),
         exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
  from auswahl i
  join public.patients p  on p.id = i.patient_id
  join public.persons  pe on pe.id = p.person_id
  left join public.invoice_recipients r on r.id = i.recipient_id
  left join lateral (
    select sum(b.quantity * c.unit_price_cents) as brutto,
           max(c.currency) as currency,
           count(*) as anzahl
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = i.id
  ) summe on true
  -- Die Zahlungssumme einmal je Rechnung statt viermal je Zeile - und nur
  -- noch fuer die begrenzte Auswahl (R3-016).
  left join lateral (
    select sum(case when p.direction = 'incoming' then p.amount_cents
                    else -p.amount_cents end)::integer as bezahlt
    from public.payments p
    where p.invoice_id = i.id
      and p.voided_at is null
  ) zahlung on true
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_open_items - offene Posten
-- -----------------------------------------------------------------------------
create or replace function public.list_open_items(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, invoice_number text, patient_id uuid, patient_name text, recipient_name text, period_month date, issued_on date, due_on date, total_cents integer, paid_cents integer, outstanding_cents integer, currency text, overdue boolean, open_total_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  select offen.id, offen.invoice_number, offen.patient_id, offen.patient_name,
         offen.recipient_name, offen.period_month, offen.issued_on, offen.due_on,
         offen.total_cents, offen.paid_cents, offen.outstanding_cents,
         offen.currency,
         (offen.due_on < v_heute),
         sum(offen.outstanding_cents) over ()::integer
  from (
    select i.id, i.invoice_number, i.patient_id,
           pe.given_name || ' ' || pe.family_name as patient_name,
           coalesce(r.name, pe.given_name || ' ' || pe.family_name) as recipient_name,
           i.period_month, i.issued_on, i.due_on,
           i.total_cents,
           coalesce(zahlung.bezahlt, 0) as paid_cents,
           (i.total_cents - coalesce(zahlung.bezahlt, 0)) as outstanding_cents,
           i.currency
    from public.invoices i
    join public.patients pa on pa.id = i.patient_id
    join public.persons  pe on pe.id = pa.person_id
    left join public.invoice_recipients r on r.id = i.recipient_id
    -- Die Zahlungssumme einmal je Rechnung statt zweimal je Zeile ueber den
    -- ganzen Bestand (R3-016). Dieselbe Rechnung wie app.invoice_paid_cents,
    -- nur einmal gruppiert statt Zeile fuer Zeile aufgerufen.
    left join (
      select p.invoice_id,
             sum(case when p.direction = 'incoming' then p.amount_cents
                      else -p.amount_cents end)::integer as bezahlt
      from public.payments p
      where p.voided_at is null
      group by p.invoice_id
    ) zahlung on zahlung.invoice_id = i.id
    where i.organization_id = v_org
      and i.status = 'issued'
      -- Eine stornierte Rechnung ist keine Forderung mehr (ABR-003c).
      and not exists (
        select 1 from public.invoice_cancellations c where c.invoice_id = i.id
      )
  ) offen
  where offen.outstanding_cents > 0
  order by offen.due_on, offen.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_invoice_candidates - abrechenbare Patient:innen
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  -- Erst buendeln, dann den Entwurf dazusuchen (BEF-018). Der Bereich steht
  -- seit ABR-009 in beiden Schritten: Er ist der dritte Schluessel der
  -- Klammer und nicht eine Spalte, die nebenher mitlaeuft.
  return query
  select k.patient_id,
         k.patient_name,
         k.period_month,
         k.service_area,
         k.service_count,
         k.total_cents,
         k.currency,
         (entwurf.id is not null),
         entwurf.id
  from (
    select b.patient_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           date_trunc('month', b.performed_on)::date as period_month,
           b.service_area,
           count(*)::integer as service_count,
           sum(b.quantity * c.unit_price_cents)::integer as total_cents,
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    join public.patients p  on p.id = b.patient_id
    join public.persons  pe on pe.id = p.person_id
    where b.organization_id = v_org
      and b.status = 'billable'
      -- Seit ABR-003c zaehlt nur eine Zeile, die nicht freigegeben ist: Nach
      -- einem Storno ist die Leistung wieder abzurechnen.
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, date_trunc('month', b.performed_on)::date, b.service_area
  ) k
  left join lateral (
    select i.id
    from public.invoices i
    where i.patient_id = k.patient_id
      and i.period_month = k.period_month
      and i.service_area = k.service_area
      and i.status = 'draft'
    limit 1
  ) entwurf on true
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- get_invoice - Rechnung
-- -----------------------------------------------------------------------------
create or replace function public.get_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_bezahlt  integer;
  v_storno   record;
  v_ersetzt  text;
  v_korrektur record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return null;
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Am Entwurf gibt es keinen Zahlungsstand: An ihm kann niemand zahlen.
  v_bezahlt := case when v_invoice.status = 'issued'
                    then app.invoice_paid_cents(p_invoice_id) else 0 end;

  -- Die Kette aus ABR-003c, in beide Richtungen lesbar: das Stornodokument
  -- zu dieser Rechnung, die Rechnung, die sie ersetzt, und die Korrektur, die
  -- sie ersetzt hat.
  select c.cancellation_number, c.reason, c.cancelled_on into v_storno
  from public.invoice_cancellations c
  where c.invoice_id = p_invoice_id;

  select i.invoice_number into v_ersetzt
  from public.invoices i
  where i.id = v_invoice.replaces_invoice_id;

  select i.id, i.invoice_number into v_korrektur
  from public.invoices i
  where i.replaces_invoice_id = p_invoice_id
  order by i.created_at
  limit 1;

  -- Die ausgestellte Rechnung zeigt ihren Snapshot und nicht die heutigen
  -- Stammdaten: Genau dafuer gibt es ihn (ADR-009 Punkt 10).
  return jsonb_build_object(
    'id', v_invoice.id,
    'status', v_invoice.status,
    'patient_id', v_invoice.patient_id,
    'recipient_id', v_invoice.recipient_id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'due_on', v_invoice.due_on,
    'paid_cents', v_bezahlt,
    'outstanding_cents', coalesce(v_invoice.total_cents, 0) - v_bezahlt,
    'payment_state', case when v_invoice.status = 'issued'
                          then app.invoice_payment_state(v_invoice.total_cents, v_bezahlt)
                          else 'unpaid' end,
    'overdue', (v_invoice.status = 'issued' and v_invoice.due_on < v_heute
                and v_bezahlt < v_invoice.total_cents
                and v_storno is null),
    'cancellation', case when v_storno is null then null else
      jsonb_build_object('cancellation_number', v_storno.cancellation_number,
                         'reason', v_storno.reason,
                         'cancelled_on', v_storno.cancelled_on)
    end,
    'replaces_invoice_id', v_invoice.replaces_invoice_id,
    'replaces_invoice_number', v_ersetzt,
    'correction_invoice_id', v_korrektur.id,
    'correction_invoice_number', v_korrektur.invoice_number,
    'document', coalesce(v_invoice.snapshot, app.build_invoice_document(p_invoice_id))
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_invoice_recipients - Rechnungsempfaenger
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_recipients(p_patient_id uuid)
 RETURNS TABLE(id uuid, recipient_kind text, name text, street text, house_number text, postal_code text, city text, reference text, is_default boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoice recipients');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select r.id, r.recipient_kind, r.name, r.street, r.house_number,
         r.postal_code, r.city, r.reference, r.is_default
  from public.invoice_recipients r
  where r.organization_id = v_org
    and r.patient_id = p_patient_id
  order by r.is_default desc, r.name;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_invoice_reminders - Zahlungserinnerungen einer Rechnung
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_reminders(p_invoice_id uuid)
 RETURNS TABLE(id uuid, reminder_on date, due_on date, outstanding_cents integer, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select r.id, r.reminder_on, r.due_on, r.outstanding_cents, r.currency
  from public.invoice_payment_reminders r
  where r.invoice_id = p_invoice_id
    and r.organization_id = v_org
  order by r.reminder_on desc, r.created_at desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- get_payment_reminder - Zahlungserinnerung
-- -----------------------------------------------------------------------------
create or replace function public.get_payment_reminder(p_reminder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_reminder record;
  v_invoice  record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return null;
  end if;

  v_org := app.current_organization_id();

  select r.* into v_reminder
  from public.invoice_payment_reminders r
  where r.id = p_reminder_id and r.organization_id = v_org;

  if not found then
    raise exception 'payment reminder not found' using errcode = '42501';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = v_reminder.invoice_id;

  return jsonb_build_object(
    'id', v_reminder.id,
    'invoice_id', v_reminder.invoice_id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'invoice_due_on', v_invoice.due_on,
    'reminder_on', v_reminder.reminder_on,
    'due_on', v_reminder.due_on,
    'outstanding_cents', v_reminder.outstanding_cents,
    'currency', v_reminder.currency,
    -- Der Snapshot der ausgestellten Rechnung: Absender, Empfaenger und
    -- Betrag, wie sie beim Ausstellen galten (ADR-009 Punkt 10).
    'document', v_invoice.snapshot
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_invoice_payments - Zahlungen einer Rechnung
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_payments(p_invoice_id uuid)
 RETURNS TABLE(id uuid, direction text, amount_cents integer, currency text, paid_on date, method text, note text, voided_at timestamp with time zone, void_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select p.id, p.direction, p.amount_cents, p.currency, p.paid_on, p.method,
         p.note, p.voided_at, p.void_reason
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  where p.invoice_id = p_invoice_id
    and i.organization_id = v_org
  order by p.paid_on, p.created_at, p.id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_payments - Zahlungen
-- -----------------------------------------------------------------------------
create or replace function public.list_payments(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, invoice_id uuid, invoice_number text, patient_name text, recipient_name text, direction text, amount_cents integer, currency text, paid_on date, method text, note text, voided_at timestamp with time zone, void_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select p.id, p.invoice_id, i.invoice_number,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         p.direction, p.amount_cents, p.currency, p.paid_on, p.method,
         p.note, p.voided_at, p.void_reason
  from public.payments p
  join public.invoices  i  on i.id = p.invoice_id
  join public.patients  pa on pa.id = i.patient_id
  join public.persons   pe on pe.id = pa.person_id
  left join public.invoice_recipients r on r.id = i.recipient_id
  where p.organization_id = v_org
  order by p.paid_on desc, p.created_at desc, p.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_revenue_by_service_area - Umsatz nach Bereich
-- -----------------------------------------------------------------------------
create or replace function public.list_revenue_by_service_area(p_basis text, p_year integer DEFAULT NULL::integer)
 RETURNS TABLE(basis text, year integer, service_area text, tax_treatment text, tax_rate_permille smallint, currency text, gross_cents bigint, tax_cents bigint, net_cents bigint, document_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_jahr     integer;
  v_von      date;
  v_bis      date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoicing figures');
    return;
  end if;

  -- Festlegung 1: ohne genannte Grundlage keine Zahl.
  if p_basis is null or p_basis not in ('accrual', 'cash') then
    raise exception 'unknown revenue basis' using errcode = '22023';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_jahr := coalesce(p_year, extract(year from (now() at time zone v_zeitzone))::integer);

  if v_jahr < 2020 or v_jahr > 2200 then
    raise exception 'year out of range' using errcode = '22023';
  end if;

  v_von := make_date(v_jahr, 1, 1);
  v_bis := make_date(v_jahr + 1, 1, 1);

  return query
  with dokument as (
    -- Grundlage Rechnungsstellung, Teil 1: die ausgestellte Rechnung mit
    -- ihrem Ausstellungstag. Der Bereich steht seit ABR-010 im Snapshot; die
    -- Spalte bleibt als Rueckfallweg fuer aeltere Snapshots (schema_version 1
    -- und 2), die es ausserhalb von Entwicklungsdatenbanken nicht gibt.
    select i.id                                                      as document_id,
           coalesce(i.snapshot ->> 'service_area', i.service_area)   as service_area,
           i.currency                                                as currency,
           i.snapshot -> 'tax_groups'                                as tax_groups,
           1                                                         as vorzeichen
    from public.invoices i
    where p_basis = 'accrual'
      and i.organization_id = v_org
      and i.status = 'issued'
      and i.issued_on >= v_von and i.issued_on < v_bis
    union all
    -- Teil 2: das Stornodokument mit seinem eigenen Tag und umgekehrtem
    -- Vorzeichen (Festlegung 4). Es traegt keine eigenen Betraege - es nimmt
    -- die seiner Rechnung zurueck, und genau das steht darin.
    select c.id,
           coalesce(i.snapshot ->> 'service_area', i.service_area),
           i.currency,
           i.snapshot -> 'tax_groups',
           -1
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where p_basis = 'accrual'
      and c.organization_id = v_org
      and c.cancelled_on >= v_von and c.cancelled_on < v_bis
  ),
  nach_rechnungsstellung as (
    select d.service_area,
           g ->> 'tax_treatment'                            as tax_treatment,
           (g ->> 'tax_rate_permille')::smallint            as tax_rate_permille,
           d.currency,
           d.document_id,
           d.vorzeichen * (g ->> 'gross_cents')::bigint     as brutto,
           d.vorzeichen * (g ->> 'tax_cents')::bigint       as steuer,
           d.vorzeichen * (g ->> 'net_cents')::bigint       as netto
    from dokument d
    cross join lateral jsonb_array_elements(d.tax_groups) as g
  ),
  zahlung as (
    -- Grundlage Zufluss: gebuchte Zahlungen. Eine stornierte Zahlung ist aus
    -- jeder Summe heraus (`voided_at`), eine Rueckzahlung kehrt das Vorzeichen
    -- um. Der Bereich und die Steuergruppen kommen aus der Rechnung, zu der
    -- die Zahlung gehoert - eine Zahlung kennt sie nicht selbst.
    select p.id                                                    as document_id,
           case p.direction when 'incoming' then 1 else -1 end     as vorzeichen,
           p.amount_cents::bigint                                  as betrag,
           i.currency                                              as currency,
           coalesce(i.snapshot ->> 'service_area', i.service_area) as service_area,
           i.snapshot -> 'tax_groups'                              as tax_groups
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p_basis = 'cash'
      and p.organization_id = v_org
      and p.voided_at is null
      and p.paid_on >= v_von and p.paid_on < v_bis
  ),
  gruppe as (
    select z.document_id,
           z.vorzeichen,
           z.betrag,
           z.currency,
           z.service_area,
           g ->> 'tax_treatment'                 as tax_treatment,
           (g ->> 'tax_rate_permille')::smallint as tax_rate_permille,
           (g ->> 'gross_cents')::bigint         as gruppe_brutto,
           (g ->> 'tax_cents')::bigint           as gruppe_steuer,
           sum((g ->> 'gross_cents')::bigint) over (partition by z.document_id) as summe_brutto
    from zahlung z
    cross join lateral jsonb_array_elements(z.tax_groups) as g
  ),
  abgerundet as (
    -- ANN-088, Schritt 1: der ganzzahlige Anteil und sein Rest. Gerechnet wird
    -- in Cent und ohne Gleitkomma - eine Aufteilung, die von der Rundung des
    -- Prozessors abhinge, waere nicht deterministisch.
    select g.*,
           case when g.summe_brutto > 0
                then (g.betrag * g.gruppe_brutto) / g.summe_brutto else 0 end as anteil,
           case when g.summe_brutto > 0
                then (g.betrag * g.gruppe_brutto) % g.summe_brutto else 0 end as rest
    from gruppe g
  ),
  verteilt as (
    -- Schritt 2: die uebrigen Cent gehen an die groessten Reste; bei gleichem
    -- Rest entscheidet die feste Reihenfolge der Gruppe. Dieselbe Zahlung
    -- ergibt damit immer dieselbe Aufteilung.
    select a.*,
           row_number() over (partition by a.document_id
                              order by a.rest desc, a.tax_treatment, a.tax_rate_permille) as platz,
           a.betrag - sum(a.anteil) over (partition by a.document_id) as offene_cent
    from abgerundet a
  ),
  nach_zufluss as (
    select v.service_area,
           v.tax_treatment,
           v.tax_rate_permille,
           v.currency,
           v.document_id,
           v.vorzeichen * anteilig.brutto as brutto,
           v.vorzeichen * anteilig.steuer as steuer,
           v.vorzeichen * (anteilig.brutto - anteilig.steuer) as netto
    from verteilt v
    cross join lateral (
      select case
               -- Der Normalfall: anteilig plus ein Cent aus dem Rest.
               when v.summe_brutto > 0 then v.anteil + case when v.platz <= v.offene_cent then 1 else 0 end
               -- Eine Rechnung ueber null Cent laesst sich nicht anteilig
               -- aufteilen. Eine Zahlung darauf ist eine Ueberzahlung; sie
               -- geht vollstaendig an die erste Gruppe in fester Reihenfolge,
               -- damit sie in der Summe erscheint statt zu verschwinden.
               when v.platz = 1 then v.betrag
               else 0
             end as brutto
    ) roh
    cross join lateral (
      select roh.brutto,
             -- Die enthaltene Steuer wird mit derselben Formel gerechnet wie
             -- im Dokument (app.build_invoice_document). Wo das Dokument keine
             -- ausweist - steuerfrei, nicht steuerbar oder Par. 19 UStG -,
             -- weist auch die Auswertung keine aus: Sonst stuende in einer
             -- Summe Steuer, die auf keiner Rechnung steht (Punkt 18).
             case when v.gruppe_steuer = 0 then 0::bigint
                  else round(roh.brutto::numeric * v.tax_rate_permille
                             / (1000 + v.tax_rate_permille))::bigint
             end as steuer
    ) anteilig
  ),
  alles as (
    select * from nach_rechnungsstellung
    union all
    select * from nach_zufluss
  )
  select p_basis,
         v_jahr,
         a.service_area,
         a.tax_treatment,
         a.tax_rate_permille,
         a.currency,
         sum(a.brutto)::bigint,
         sum(a.steuer)::bigint,
         sum(a.netto)::bigint,
         count(distinct a.document_id)::integer
  from alles a
  group by a.service_area, a.tax_treatment, a.tax_rate_permille, a.currency
  order by a.service_area, a.tax_treatment, a.tax_rate_permille, a.currency;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_revenue_years - Jahre der Umsatzauswertung
-- -----------------------------------------------------------------------------
create or replace function public.list_revenue_years()
 RETURNS TABLE(year integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoicing figures');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select distinct j.jahr
  from (
    select extract(year from i.issued_on)::integer as jahr
    from public.invoices i
    where i.organization_id = v_org and i.status = 'issued' and i.issued_on is not null
    union all
    select extract(year from c.cancelled_on)::integer
    from public.invoice_cancellations c
    where c.organization_id = v_org
    union all
    select extract(year from p.paid_on)::integer
    from public.payments p
    where p.organization_id = v_org and p.voided_at is null
  ) j
  order by j.jahr desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_billable_services - erfasste Leistungen
-- -----------------------------------------------------------------------------
create or replace function public.list_billable_services(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, appointment_id uuid, patient_id uuid, patient_name text, performed_on date, code text, label text, item_kind text, quantity smallint, unit_price_cents integer, currency text, tax_treatment text, tax_rate_permille smallint, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_billable_services() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select b.id, b.appointment_id, b.patient_id,
         pe.given_name || ' ' || pe.family_name,
         b.performed_on, i.code, i.label, i.item_kind, b.quantity,
         i.unit_price_cents, i.currency, i.tax_treatment, i.tax_rate_permille,
         b.status
  from public.billable_services b
  join public.service_catalog_items i on i.id = b.catalog_item_id
  join public.patients p  on p.id = b.patient_id
  join public.persons  pe on pe.id = p.person_id
  where b.organization_id = v_org
    and (p_from is null or b.performed_on >= p_from)
    and (p_to   is null or b.performed_on <= p_to)
  order by b.performed_on desc, pe.family_name, i.code
  limit greatest(least(coalesce(p_limit, 200), 500), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_open_billable_appointments - Termine ohne Leistung
-- -----------------------------------------------------------------------------
create or replace function public.list_open_billable_appointments(p_limit integer DEFAULT 100)
 RETURNS TABLE(appointment_id uuid, patient_id uuid, patient_name text, performed_on date, starts_at timestamp with time zone, status text, fee_basis text, appointment_type text, suggestion_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_billable_services() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select a.id,
         a.patient_id,
         pe.given_name || ' ' || pe.family_name,
         (a.starts_at at time zone o.time_zone)::date,
         a.starts_at,
         a.status,
         a.fee_basis,
         a.appointment_type,
         (
           select count(*)::integer
           from public.treatment_base_items q
           join public.service_catalog_items ci
             on ci.remedy = q.remedy
            and ci.catalog_version_id = app.active_service_catalog_version(
                  v_org, (a.starts_at at time zone o.time_zone)::date)
           where q.treatment_basis_id = a.treatment_basis_id
         )
  from public.appointments a
  join public.organizations o on o.id = a.organization_id
  join public.patients p  on p.id = a.patient_id
  join public.persons  pe on pe.id = p.person_id
  where a.organization_id = v_org
    and a.patient_id is not null
    and (a.status = 'documented' or a.fee_basis is not null)
    and not exists (
      select 1 from public.billable_services b where b.appointment_id = a.id
    )
  order by a.starts_at desc, a.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- get_billable_service_draft - Leistungsvorschlag eines Termins
-- -----------------------------------------------------------------------------
create or replace function public.get_billable_service_draft(p_appointment_id uuid)
 RETURNS TABLE(catalog_item_id uuid, code text, label text, item_kind text, unit_price_cents integer, currency text, tax_treatment text, tax_rate_permille smallint, service_area text, suggested boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_kind         text;
  v_bereich      text;
  v_performed_on date;
  v_version      uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to record billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  select a.status, a.fee_basis, a.treatment_basis_id, a.kind
    into v_status, v_fee_basis, v_basis, v_kind
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  v_bereich := app.service_area_of_appointment_kind(v_kind);
  if v_bereich is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  -- Die Reihenfolge der Preisliste bleibt die Reihenfolge des Vorschlags.
  return query
  select i.id, i.code, i.label, i.item_kind, i.unit_price_cents, i.currency,
         i.tax_treatment, i.tax_rate_permille, i.service_area,
         case
           when v_fee_basis is not null then i.item_kind = 'absence_fee'
           else i.remedy is not null
                and exists (
                  select 1 from public.treatment_base_items p
                  where p.treatment_basis_id = v_basis and p.remedy = i.remedy
                )
         end as suggested
  from public.service_catalog_items i
  where i.catalog_version_id = v_version
    and i.item_kind = case when v_fee_basis is not null then 'absence_fee' else 'treatment' end
    and i.service_area = v_bereich
  order by i.sort_order;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_legal_holds - Sperrliste
-- -----------------------------------------------------------------------------
create or replace function public.list_legal_holds()
 RETURNS TABLE(id uuid, subject_type text, subject_id uuid, subject_name text, reason text, placed_at timestamp with time zone, placed_by_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'legal_holds.read', 'not allowed to manage legal holds');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  return query
    select h.id,
           h.subject_type,
           h.subject_id,
           pe.given_name || ' ' || pe.family_name,
           h.reason,
           h.placed_at,
           up.display_name
    from public.legal_holds h
    left join public.patients p  on p.id = h.subject_id and h.subject_type = 'patient'
    left join public.persons pe  on pe.id = p.person_id
    left join public.user_profiles up on up.id = h.placed_by
    where h.organization_id = v_org
      and h.released_at is null
    order by h.placed_at desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_storage_deletion_orders - Loeschauftraege der Ablage
-- -----------------------------------------------------------------------------
create or replace function public.list_storage_deletion_orders()
 RETURNS TABLE(id uuid, bucket_id text, ordered_at timestamp with time zone, object_present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read deletion orders');
    return;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read deletion orders' using errcode = '42501';
  end if;

  return query
    select o.id,
           o.bucket_id,
           o.ordered_at,
           exists (
             select 1
             from storage.objects s
             where s.bucket_id = o.bucket_id
               and s.name = o.object_key
           )
    from public.storage_deletion_orders o
    where o.organization_id = v_org
      and o.receipted_at is null
    order by o.ordered_at, o.id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- list_missing_patient_file_objects - Abgleich: fehlende Objekte
-- -----------------------------------------------------------------------------
create or replace function public.list_missing_patient_file_objects()
 RETURNS TABLE(file_id uuid, patient_id uuid, patient_name text, document_type text, display_name text, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.patient_id,
           btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')),
           f.document_type,
           f.display_name,
           f.confirmed_at
    from public.patient_files f
    join public.patients p on p.id = f.patient_id
    join public.persons pe on pe.id = p.person_id
    where f.organization_id = v_org
      and f.status = 'ready'
      and not exists (
        select 1
        from storage.objects o
        where o.bucket_id = app.patient_file_bucket()
          and o.name = f.object_key
      )
    order by f.confirmed_at;
end;
$function$;

-- -----------------------------------------------------------------------------
-- count_orphaned_patient_file_objects - Abgleich: verwaiste Objekte
-- -----------------------------------------------------------------------------
create or replace function public.count_orphaned_patient_file_objects()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return null;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  select count(*)
    into v_anzahl
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket()
    and o.name like v_org::text || '/%'
    and not exists (
      select 1 from public.patient_files f where f.object_key = o.name
    )
    and not exists (
      select 1
      from public.storage_deletion_orders d
      where d.bucket_id = o.bucket_id
        and d.object_key = o.name
        and d.receipted_at is null
    );

  return v_anzahl;
end;
$function$;

comment on function app.record_denied_read(uuid, text, text) is
  'Schreibt einen abgewiesenen Leseversuch ins Auditlog (OPS-004, G6a, G6b, ADR-010). Aufrufer: list_audit_events, list_deletion_runs (ueber record_denied_owner_read) und die Lesepfade aus G6a und G6b; die Liste haelt supabase/tests/audit.test.ts fest.';
