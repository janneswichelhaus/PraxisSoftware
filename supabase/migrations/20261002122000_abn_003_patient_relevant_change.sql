-- ABN-003 (BEF-093): „Mitgeteilt“ verfaellt nur bei Aenderungen, die die
-- Patient:in betreffen.
--
-- Der Mitteilungsvermerk galt, solange `notified_at >= appointments.updated_at`
-- (CAL-012, ANN-040). Jede Aenderung am Termin hob `updated_at` - auch das
-- Abhaken, die Dokumentation oder die Rechnung -, und der Vermerk verfiel,
-- obwohl sich fuer die Patient:in nichts geaendert hatte.
--
-- Jetzt traegt der Termin einen eigenen Zeitstempel der letzten **fuer die
-- Patient:in relevanten** Aenderung: Beginn, Ende, Terminart, Ort, Adresse des
-- Hausbesuchs, behandelnde Person und die Absage. Ein Trigger setzt ihn genau
-- dann; alles andere - Zustand, Vermerke, Grundlage, Gebuehrenanlass - laesst
-- ihn stehen. Die drei Stellen, die den Vermerk pruefen, vergleichen mit ihm.
-- `updated_at` bleibt, was es ist: der Stand fuer die optimistische Sperre.
--
-- Bestand: Der neue Zeitstempel beginnt beim heutigen `updated_at`, damit kein
-- Vermerk rueckwirkend gueltig wird, der heute ungueltig ist.
-- Abnahme Jannes, 2026-10-02 (ANN-040 Fassung 2).

alter table public.appointments
  add column patient_relevant_changed_at timestamptz not null default now();

update public.appointments set patient_relevant_changed_at = updated_at;

comment on column public.appointments.patient_relevant_changed_at is
  'Zeitpunkt der letzten Aenderung, die die Patient:in betrifft: Beginn, Ende, Terminart, Ort, Adresse, behandelnde Person, Absage (ABN-003, ANN-040). Gesetzt vom Trigger appointments_patient_relevant_change. Der Mitteilungsvermerk gilt, solange notified_at nicht davor liegt.';

-- -----------------------------------------------------------------------------
-- 1. Der Trigger - die eine Stelle, die sagt, was relevant ist
-- -----------------------------------------------------------------------------
create or replace function app.appointments_mark_patient_relevant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at          is distinct from old.starts_at
     or new.ends_at         is distinct from old.ends_at
     or new.appointment_type is distinct from old.appointment_type
     or new.location_id     is distinct from old.location_id
     or new.staff_member_id is distinct from old.staff_member_id
     or new.visit_street    is distinct from old.visit_street
     or new.visit_house_number is distinct from old.visit_house_number
     or new.visit_postal_code  is distinct from old.visit_postal_code
     or new.visit_city      is distinct from old.visit_city
     or (new.status = 'cancelled' and old.status <> 'cancelled')
  then
    new.patient_relevant_changed_at := now();
  end if;
  return new;
end;
$$;

comment on function app.appointments_mark_patient_relevant_change() is
  'Setzt appointments.patient_relevant_changed_at bei Aenderungen an Beginn, Ende, Terminart, Ort, Adresse, Person oder bei der Absage (ABN-003, ANN-040). Einzige Stelle der Regel; die Mitteilungswege vergleichen damit.';

create trigger appointments_patient_relevant_change
  before update on public.appointments
  for each row
  execute function app.appointments_mark_patient_relevant_change();

-- -----------------------------------------------------------------------------
-- 2. Die drei Stellen, die den Vermerk pruefen
-- -----------------------------------------------------------------------------
create or replace function app.appointment_notification_channels(p_appointment_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct n.channel order by n.channel), array[]::text[])
  from public.appointment_notifications n
  join public.appointments a on a.id = n.appointment_id
  where n.appointment_id = p_appointment_id
    and n.notified_at >= a.patient_relevant_changed_at
$$;

comment on function app.appointment_notification_channels(uuid) is
  'Die seit der letzten fuer die Patient:in relevanten Terminaenderung vermerkten Mitteilungswege (CAL-012, ABN-003). Nur fuer die serverseitigen Lese- und Schreibpfade.';

-- Die Terminsicht (Rumpf aus 20260918140000_appointment_coverage.sql, nur der
-- Vergleich geaendert). security_invoker bleibt.
create or replace view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.treatment_basis_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.event_group_id,
  a.event_series_id,
  a.status,
  a.starts_at,
  a.ends_at,
  a.updated_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.completed_at,
  a.cancellation_reason,
  a.cancellation_received_at,
  a.fee_basis,
  a.no_show_recorded_at,
  a.no_show_protocol_confirmed,
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
       and n.notified_at >= a.patient_relevant_changed_at),
    array[]::text[]
  ) as notification_channels,
  app.appointment_is_covered(a.id) as treatment_basis_covered
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses, seit CAL-018 mit der Protokollbestaetigung des Nichtantreffens, seit CAL-021 mit der Serienkennung der Dauerfehlzeit, seit GRD-001 mit der Behandlungsgrundlage statt der Verordnung, seit CAL-022 mit ihrer Deckung (null: keine Grundlage oder abgesagt), seit ABN-003 gilt der Mitteilungsvermerk bis zur naechsten fuer die Patient:in relevanten Aenderung.';

-- Setzen der Wege (Rumpf aus 20260930110000_trn_004_training_appointments.sql):
-- Was als gueltig weicht, bemisst sich am selben Zeitstempel.
CREATE OR REPLACE FUNCTION public.set_appointment_notification(p_appointment_id uuid, p_channels text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_patient  uuid;
  v_kind     text;
  v_stand    timestamptz;
  v_kanaele  text[];
  v_kanal    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Der Vermerk gehoert zur Terminorganisation und traegt dasselbe Recht wie
  -- das Aendern eines Termins (ADR-004).
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.patient_relevant_changed_at
    into v_patient, v_kind, v_stand
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_kind = 'internal' then
    raise exception 'event has nobody to notify' using errcode = '22023';
  end if;

  -- Doppelte Angaben sind kein Fehler, aber auch kein zweiter Vermerk.
  v_kanaele := (
    select coalesce(array_agg(distinct k order by k), array[]::text[])
    from unnest(coalesce(p_channels, array[]::text[])) as k
    where k is not null
  );

  foreach v_kanal in array v_kanaele loop
    if v_kanal not in ('slip', 'phone', 'in_person', 'email') then
      raise exception 'unknown notification channel' using errcode = '22023';
    end if;
  end loop;

  -- Nur die gueltigen Zeilen weichen; die aelteren bleiben als Historie.
  delete from public.appointment_notifications n
  where n.appointment_id = p_appointment_id
    and n.notified_at >= v_stand;

  insert into public.appointment_notifications
    (organization_id, appointment_id, channel, notified_by)
  select v_org, p_appointment_id, k, v_actor
  from unnest(v_kanaele) as k;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.notified', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      -- Die Wege, kein Inhalt: was gesagt oder geschrieben wurde, steht hier
      -- ausdruecklich nicht (ADR-010 Punkt 3, ADR-011).
      'channels', to_jsonb(v_kanaele)
    )
  );

  return v_kanaele;
end;
$function$;
