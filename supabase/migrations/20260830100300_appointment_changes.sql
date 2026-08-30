-- =============================================================================
-- Termine bearbeiten, verschieben und absagen (CAL-003)
--
-- Zwei getrennte Vorgaenge, beide als SECURITY-DEFINER-RPC. authenticated
-- behaelt auf appointments weiterhin ausschliesslich SELECT.
--
-- Drei Festlegungen praegen diesen Loop:
--
--   * Patient und Organisation eines bestehenden Termins sind unveraenderlich.
--     Die Funktionen nehmen sie deshalb gar nicht erst entgegen; ein Termin
--     kann strukturell nicht auf eine andere Person uebertragen werden.
--   * Optimistic Concurrency ueber den erwarteten updated_at-Wert. Zwei
--     gleichzeitige Bearbeitungen duerfen kein verlorenes Update erzeugen:
--     wer auf einem veralteten Stand speichert, wird abgewiesen - ohne
--     Teilaenderung und ohne Erfolgsaudit.
--   * Der Ueberschneidungsschutz gilt unveraendert weiter. Die EXCLUDE-
--     Constraint prueft auch beim UPDATE; der Termin selbst ist dabei
--     automatisch ausgenommen, weil eine Zeile nicht mit sich selbst
--     kollidiert. Ein abgesagter Termin faellt aus der Constraint heraus und
--     gibt seinen Zeitraum frei.
--
-- Abgesagte Termine sind terminal: sie werden nicht bearbeitet, nicht
-- reaktiviert und niemals physisch geloescht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
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
    'appointment.cancelled'
  ));

-- -----------------------------------------------------------------------------
-- Rechte
--
-- Dieselbe Rollenmenge wie beim Anlegen, aber je Vorgang eine eigene Funktion:
-- Anlegen, Aendern und Absagen sind fachlich verschieden und duerfen sich
-- spaeter auseinander entwickeln.
-- -----------------------------------------------------------------------------
create or replace function app.can_update_appointment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

create or replace function app.can_cancel_appointment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_update_appointment() to authenticated;
grant execute on function app.can_cancel_appointment() to authenticated;

-- -----------------------------------------------------------------------------
-- update_appointment
--
-- Nimmt weder Patient noch Organisation entgegen. Der Adress-Snapshot wird aus
-- der Terminart abgeleitet: er entsteht beim Wechsel ZU einem Hausbesuch und
-- verschwindet beim Wechsel weg davon. Bleibt es ein Hausbesuch, bleibt der
-- Snapshot unangetastet - er haelt fest, wohin an diesem Tag gefahren wird,
-- und folgt spaeteren Stammdatenaenderungen bewusst nicht (CAL-001).
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
  if v_alt.status <> 'scheduled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
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

comment on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid) is
  'Aendert einen geplanten Termin organisatorisch oder zeitlich, geschuetzt gegen verlorene Updates, und protokolliert appointment.updated bzw. appointment.rescheduled (CAL-003, ADR-010).';

revoke all on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid)
  from public, anon;
grant execute on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- cancel_appointment
--
-- Absage ist ein Statuswechsel, kein Loeschen. Der Termin bleibt vollstaendig
-- erhalten und in Detailansicht wie Kalender nachvollziehbar; er gibt seinen
-- Zeitraum aber wieder frei (ADR-008: nichts wird still entfernt).
--
-- Kein Freitextgrund in diesem Epic: er waere ein neues Datenfeld mit eigener
-- Datenschutzfrage und ist nicht beauftragt.
-- -----------------------------------------------------------------------------
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

comment on function public.cancel_appointment(uuid, timestamptz) is
  'Setzt einen geplanten Termin atomar auf abgesagt, haelt Zeitpunkt und Akteur fest und protokolliert appointment.cancelled (CAL-003, ADR-010). Loescht nichts.';

revoke all on function public.cancel_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.cancel_appointment(uuid, timestamptz) to authenticated;
