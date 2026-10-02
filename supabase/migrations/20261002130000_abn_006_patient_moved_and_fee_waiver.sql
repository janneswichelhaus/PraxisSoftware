-- =============================================================================
-- ABN-006 (BEF-094): Verlegung durch die Patient:in und Verzicht auf die Gebuehr
--
-- Abnahme Jannes, 2026-10-02 (ANN-047 Fassung 2, ADR-018 Fassung 4 Punkt 8):
--
--   * Verlegt die PATIENT:IN weniger als 24 Stunden vorher, faellt der
--     urspruengliche Termin ebenso aus wie bei einer Absage. Die Verlegung
--     braucht dafuer die Angabe, wer sie veranlasst hat: aus dem einen Grund
--     "moved" werden "patient_moved" und "practice_moved".
--   * Praxisveranlasste Aenderungen bleiben gebuehrenfrei.
--   * Die Praxis kann im Einzelfall bewusst verzichten. Der Verzicht ist ein
--     eigener, protokollierter Vermerk (wer, wann) - der Anlass bleibt stehen.
--   * Nichtantreffen bleibt der eigene Anlass nach ADR-018 Punkt 9.
--
-- Bestand: "moved" bleibt fuer bestehende Zeilen gueltig und wird nicht
-- umgedeutet - wer damals verlegt hat, weiss die Zeile nicht. Neu setzen
-- kann ihn niemand mehr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zwei Verlegungsgruende statt einem
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_cancellation_reason_values;
alter table public.appointments
  add constraint appointments_cancellation_reason_values check (
    cancellation_reason is null
    or cancellation_reason in (
      'patient_request', 'practice_request', 'patient_moved', 'practice_moved', 'other',
      -- Nur Bestand vor ABN-006; kein Schreibpfad setzt ihn mehr.
      'moved'
    )
  );

-- Die Frist bleibt an ihrer einen Stelle; neu ist nur, welche Gruende sie
-- ausloesen. Eine Verlegung durch die Patient:in gibt den vereinbarten
-- Termin genauso kurzfristig frei wie eine Absage (ANN-047 Fassung 2). Eine
-- reine Zeitaenderung ueber update_appointment bleibt gebuehrenfrei: Der
-- Termin besteht weiter, ein Anlass haengt nur an einem ausgefallenen (ANN-212).
create or replace function app.is_late_cancellation(
  p_reason      text,
  p_received_at timestamptz,
  p_starts_at   timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_reason in ('patient_request', 'patient_moved')
    and p_received_at is not null
    and p_starts_at - p_received_at < app.cancellation_notice_period()
$$;

comment on function app.is_late_cancellation(text, timestamptz, timestamptz) is
  'Loest diese Absage eine Ausfallgebuehr aus? Weniger als 24 Stunden zwischen Eingang und vereinbartem Beginn, und nur, wenn die Patient:in abgesagt oder verlegt hat (CAL-014b, ABN-006, ANN-047 Fassung 2).';

-- -----------------------------------------------------------------------------
-- 2. Der Verzicht als eigener Vermerk
--
-- Zwei Spalten am Termin: wann und durch wen. Der Gebuehrenanlass bleibt
-- unveraendert stehen - er ist eine Tatsache (die Absage kam spaet), der
-- Verzicht eine Entscheidung daneben. Ein Termin mit Verzicht ist damit
-- weiter als "Absage unter 24 Stunden" erkennbar und faellt weiter unter
-- den Loeschschutz aus ANN-035: Der Vermerk ist der Nachweis, warum keine
-- Forderung entstand.
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column fee_waived_at timestamptz,
  add column fee_waived_by uuid;

comment on column public.appointments.fee_waived_at is
  'Zeitpunkt, zu dem die Praxis bewusst auf die Gebuehr aus fee_basis verzichtet hat (ABN-006, BEF-094). Der Anlass bleibt; abrechenbar ist er danach nicht mehr (app.billable_fee_basis).';
comment on column public.appointments.fee_waived_by is
  'Konto, das den Verzicht vermerkt hat (ABN-006). Nicht in der Terminsicht - Akteure stehen im Auditlog (ADR-010).';

-- Ohne Anlass kein Verzicht; der Zeitpunkt nie ohne den Vermerk. fee_waived_by
-- darf nach dem Loeschen eines Kontos null werden, der Zeitpunkt bleibt.
alter table public.appointments
  add constraint appointments_fee_waiver_needs_fee check (
    fee_waived_at is null or fee_basis is not null
  ),
  add constraint appointments_fee_waiver_by_needs_at check (
    fee_waived_by is null or fee_waived_at is not null
  );

-- Faellt der Anlass weg (reopen_appointment nach einem Nichtantreffen),
-- faellt der Verzicht mit: Er bezog sich auf genau diesen Anlass. Das
-- Auditlog behaelt beide Vorgaenge.
create function public.appointments_fee_waiver_follows_fee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fee_basis is null then
    new.fee_waived_at := null;
    new.fee_waived_by := null;
  end if;
  return new;
end;
$$;

create trigger appointments_fee_waiver_follows_fee
  before update of fee_basis on public.appointments
  for each row execute function public.appointments_fee_waiver_follows_fee();

revoke all on function public.appointments_fee_waiver_follows_fee() from public, anon, authenticated;

-- Die eine Stelle, die sagt, welcher Anlass noch abgerechnet werden kann.
create function app.billable_fee_basis(p_fee_basis text, p_fee_waived_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_fee_waived_at is null then p_fee_basis end
$$;

comment on function app.billable_fee_basis(text, timestamptz) is
  'Gebuehrenanlass, soweit er noch abrechenbar ist: null nach einem Verzicht (ABN-006, BEF-094).';

revoke all on function app.billable_fee_basis(text, timestamptz) from public, anon;
grant execute on function app.billable_fee_basis(text, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Verzichten
--
-- Wer: owner und office - dieselben Rollen, die ein Ausfallhonorar als
-- Leistung erfassen (app.can_record_billable_services, ANN-140). Wann: solange
-- aus dem Anlass noch nichts entstanden ist. Ist das Honorar schon als
-- Leistung erfasst oder abgerechnet, geht der Weg ueber das Entfernen der
-- Leistung bzw. das Storno; ein Verzicht daneben liesse zwei Wahrheiten
-- stehen. Endgueltig wie die Absage selbst (ANN-213).
-- -----------------------------------------------------------------------------
create function public.waive_appointment_fee(
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

  if not app.can_record_billable_services() then
    raise exception 'not allowed to waive fees' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to waive fees' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.fee_basis, a.fee_waived_at, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.fee_basis is null then
    raise exception 'appointment has no fee occasion' using errcode = '22023';
  end if;

  if v_alt.fee_waived_at is not null then
    raise exception 'fee is already waived' using errcode = '22023';
  end if;

  if v_alt.status = 'invoiced' then
    raise exception 'fee is already invoiced' using errcode = '22023';
  end if;

  if exists (select 1 from public.billable_services b where b.appointment_id = p_appointment_id) then
    raise exception 'fee is already recorded as a service' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set fee_waived_at = now(),
         fee_waived_by = v_actor,
         updated_at    = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.fee_waived', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'fee_basis', v_alt.fee_basis
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.waive_appointment_fee(uuid, timestamptz) is
  'Vermerkt den bewussten Verzicht auf die Gebuehr eines Termins mit Gebuehrenanlass; der Anlass bleibt. Nur owner und office, nur solange keine Leistung erfasst und nichts abgerechnet ist. Protokolliert appointment.fee_waived (ABN-006, BEF-094, ANN-213).';

revoke all on function public.waive_appointment_fee(uuid, timestamptz) from public, anon;
grant execute on function public.waive_appointment_fee(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Die Terminsicht zeigt den Verzicht (Rumpf aus
--    20261002122000_abn_003_patient_relevant_change.sql, eine Spalte am Ende).
--    Ohne die verzichtende Person - sie steht im Auditlog.
-- -----------------------------------------------------------------------------
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
  coalesce(
    (select array_agg(distinct n.channel order by n.channel)
     from public.appointment_notifications n
     where n.appointment_id = a.id
       and n.notified_at >= a.patient_relevant_changed_at),
    array[]::text[]
  ) as notification_channels,
  app.appointment_is_covered(a.id) as treatment_basis_covered,
  a.fee_waived_at
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses, seit CAL-018 mit der Protokollbestaetigung des Nichtantreffens, seit CAL-021 mit der Serienkennung der Dauerfehlzeit, seit GRD-001 mit der Behandlungsgrundlage statt der Verordnung, seit CAL-022 mit ihrer Deckung (null: keine Grundlage oder abgesagt), seit ABN-003 gilt der Mitteilungsvermerk bis zur naechsten fuer die Patient:in relevanten Aenderung, seit ABN-006 mit dem Zeitpunkt eines Gebuehrenverzichts.';

-- -----------------------------------------------------------------------------
-- 5. Auditkatalog
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text, 'platform_access.invited'::text, 'platform_access.invitation_sent'::text, 'platform_access.activated'::text, 'platform_access.password_reset'::text, 'platform_access.locked'::text, 'platform_access.unlocked'::text, 'platform_access.revoked'::text, 'platform_accesses.read'::text, 'platform_access.companion_declined'::text, 'platform_representation.read'::text, 'appointment.fee_waived'::text])));

-- -----------------------------------------------------------------------------
-- 6. Schreib- und Lesepfade (Rumpf jeweils aus dem heutigen Stand, nur die
--    markierten Zeilen geaendert):
--    cancel_appointment  - nimmt patient_moved und practice_moved an, nicht
--                          mehr moved;
--    cancel_staff_day    - der Ausfall einer Person ist praxisbedingt:
--                          practice_moved statt moved;
--    Leistungsentwurf, offene Leistungen, Erfassen - rechnen mit
--                          app.billable_fee_basis;
--    Export (Art. 15/20)  - mit dem Zeitpunkt des Verzichts;
--    Statistik            - "Absagen" zaehlt auch die Verlegung durch die
--                          Patient:in, "mit Gebuehr" keinen Verzicht.
-- -----------------------------------------------------------------------------

-- ---- cancel_appointment
CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_received_on date, p_received_time time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_tz      text;
  v_alt     record;
  v_eingang timestamptz;
  v_anlass  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-004: wie update_appointment - der Riegel an der Zeile entscheidet den Kontext.
  if not (app.can_cancel_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'patient_moved', 'practice_moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  -- Halb angegeben ist nicht angegeben: Ein Datum ohne Uhrzeit waere
  -- Mitternacht, und das ist eine Erfindung, keine Angabe.
  if (p_received_on is null) <> (p_received_time is null) then
    raise exception 'cancellation receipt needs date and time' using errcode = '22023';
  end if;

  if p_received_on is null then
    v_eingang := now();
  else
    select o.time_zone into v_tz from public.organizations o where o.id = v_org;
    if v_tz is null then
      raise exception 'organization has no time zone' using errcode = '22023';
    end if;
    v_eingang := (p_received_on + p_received_time) at time zone v_tz;
  end if;

  -- Eine Absage, die noch nicht eingegangen ist, gibt es nicht. Ohne diese
  -- Grenze liesse sich die Frist durch ein Datum in der Zukunft aushebeln.
  if v_eingang > now() then
    raise exception 'cancellation cannot be received in the future' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Die Frist rechnet der Server, aus dem Eingang und dem VEREINBARTEN Beginn
  -- des Termins - nie aus der Eingabezeit und nie im Browser
  -- (PROJECT_PRINCIPLES.md 8).
  --
  -- Und nur an einer BEHANDLUNG: Ein Ereignis des Praxisbetriebs hat keine
  -- Patient:in, die absagen koennte, und keinen Behandlungsbeginn, auf den
  -- sich eine Frist beziehen liesse (CAL-016, 8.1).
  -- ANN-178: Auch am Trainingstermin nicht - ob der Anlass im Dienstvertrag
  -- ueber Training entsteht, ist eine offene Vertragsfrage (ADR-022).
  v_anlass := case
    when v_alt.kind = 'therapy'
     and app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
    else null
  end;

  update public.appointments
     set status                   = 'cancelled',
         cancellation_reason      = p_reason,
         cancellation_received_at = v_eingang,
         fee_basis                = v_anlass,
         cancelled_at             = now(),
         cancelled_by             = v_actor,
         updated_at               = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Ohne den Grund (ANN-034: er steht an der Zeile und laeuft mit ihrer
  -- Frist), aber MIT der Gebuehrenentscheidung: Sie begruendet spaeter eine
  -- Forderung und gehoert damit in das Protokoll (ADR-010) - so, wie es der
  -- Vermerk "nicht angetroffen" bis ADR-018 Fassung 1 tat. Der Anlass selbst
  -- bleibt draussen; er liesse den codierten Grund die Zeile ueberleben.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.cancelled', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'fee', v_anlass is not null,
      -- Ob der Eingang nachgetragen wurde, sagt spaeter, warum eine Frist so
      -- ausgegangen ist. Organisatorisch, ohne zusaetzlichen Personenbezug.
      'received_later', p_received_on is not null
    )
    -- TRN-004: Am Trainingstermin nennt der Eintrag das Verhaeltnis statt
    -- einer Patient:in; der Behandlungstermin behaelt seine Form.
    || case when v_alt.kind = 'training' then
         jsonb_build_object('kind', 'training',
                            'training_relationship_id', v_alt.training_relationship_id)
       else '{}'::jsonb end
  );

  return p_appointment_id;
end;
$function$;

-- ---- cancel_staff_day
CREATE OR REPLACE FUNCTION public.cancel_staff_day(p_staff_member_id uuid, p_date date, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
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

  -- Der Ausfall einer behandelnden Person ist praxisbedingt. Der Grund bleibt
  -- eine Angabe - aber nicht jede (CAL-016).
  if p_reason is null or p_reason not in ('practice_request', 'practice_moved', 'other') then
    raise exception 'day rescheduling needs a practice reason' using errcode = '22023';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs
  -- (PROJECT_PRINCIPLES.md 13).
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

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_day_plan und list_appointments.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  -- FOR UPDATE ohne SKIP LOCKED: ein Termin, an dem gerade jemand arbeitet,
  -- soll die Umplanung aufhalten und nicht stillschweigend stehen bleiben.
  for v_termin in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
      and a.kind = 'therapy'
    order by a.starts_at, a.id
    for update
  loop
    perform public.cancel_appointment(v_termin.id, v_termin.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010, ADR-018
  -- Punkt 5). Ein zusaetzlicher Eintrag "Tag umgeplant" wuerde dieselbe
  -- Tatsache ein zweites Mal festhalten.
  return v_anzahl;
end;
$function$;

-- ---- draft
CREATE OR REPLACE FUNCTION public.get_billable_service_draft(p_appointment_id uuid)
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

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen. Die Pruefung braucht den Termin und steht deshalb in
  -- app.can_record_services_for_appointment.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to record billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  -- ABN-006: Ein Verzicht nimmt dem Anlass die Abrechenbarkeit, nicht den Anlass.
  select a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at), a.treatment_basis_id, a.kind
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

-- ---- list
CREATE OR REPLACE FUNCTION public.list_open_billable_appointments(p_limit integer DEFAULT 100)
 RETURNS TABLE(appointment_id uuid, patient_id uuid, training_relationship_id uuid, service_area text, patient_name text, performed_on date, starts_at timestamp with time zone, status text, fee_basis text, appointment_type text, suggestion_count integer)
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
         a.training_relationship_id,
         app.service_area_of_appointment_kind(a.kind),
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
  left join public.patients p on p.id = a.patient_id
  left join public.training_relationships t on t.id = a.training_relationship_id
  join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
  where a.organization_id = v_org
    and a.kind in ('therapy', 'training')
    -- ABN-006: Nach einem Verzicht ist der Anlass keine offene Leistung mehr.
    and app.appointment_is_billable(a.kind, a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at))
    and not exists (
      select 1 from public.billable_services b where b.appointment_id = a.id
    )
  order by a.starts_at desc, a.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- ---- record
CREATE OR REPLACE FUNCTION public.record_billable_services(p_appointment_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_patient      uuid;
  v_kind         text;
  v_training     uuid;
  v_performed_on date;
  v_version      uuid;
  v_erwartet     text;
  v_anzahl       integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen Behandlungstermin (TRN-007). Ein fremder Termin ist von
  -- einem unbekannten nicht zu unterscheiden - beide scheitern hier gleich.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- ABN-006: Ein Verzicht nimmt dem Anlass die Abrechenbarkeit, nicht den Anlass.
  select a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at), a.treatment_basis_id, a.patient_id, a.kind,
         a.training_relationship_id
    into v_status, v_fee_basis, v_basis, v_patient, v_kind, v_training
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  -- TRN-007: Ein interner Termin hat kein Gegenueber und erzeugt nichts
  -- (Paragraf 19). Die Meldung bleibt die bisherige.
  if v_patient is null and v_training is null then
    raise exception 'appointment has no patient' using errcode = '22023';
  end if;

  -- Paragraf 19: Behandlung aus "dokumentiert" oder einem Gebuehrenanlass,
  -- ohne Override (ANN-072); Training aus dem durchgefuehrten Termin
  -- (ANN-181). Eine Stelle: app.appointment_is_billable.
  if not app.appointment_is_billable(v_kind, v_status, v_fee_basis) then
    if v_kind = 'training' then
      raise exception 'training appointment has not taken place' using errcode = '22023';
    end if;
    raise exception 'appointment is neither documented nor a fee occasion'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.billable_services where appointment_id = p_appointment_id) then
    raise exception 'appointment already has billable services' using errcode = '23505';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  v_erwartet := case when v_fee_basis is not null then 'absence_fee' else 'treatment' end;

  -- Zweitreview (ANN-140): Am eigenen Termin bestaetigen Behandelnde die
  -- Heilmittel. Ein Ausfallhonorar ist eine Forderung gegen die Patient:in
  -- und bleibt beim Buero.
  if v_erwartet = 'absence_fee' and not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  insert into public.billable_services (
    organization_id, patient_id, training_relationship_id, appointment_id, catalog_item_id,
    treatment_base_item_id, quantity, performed_on, created_by
  )
  select
    v_org,
    v_patient,
    v_training,
    p_appointment_id,
    i.id,
    -- Die Position der Grundlage, deren Menge diese Leistung verbraucht. Ein
    -- Trainingstermin hat keine Behandlungsgrundlage (ADR-022 Punkt 4); die
    -- Unterabfrage bleibt dann leer.
    (select p.id
       from public.treatment_base_items p
      where p.treatment_basis_id = v_basis
        and p.remedy = i.remedy
      limit 1),
    coalesce((zeile.eintrag ->> 'quantity')::smallint, 1::smallint),
    v_performed_on,
    v_actor
  from jsonb_array_elements(p_items) as zeile(eintrag)
  join public.service_catalog_items i
    on i.id = (zeile.eintrag ->> 'catalog_item_id')::uuid
   and i.catalog_version_id = v_version
   and i.item_kind = v_erwartet
   -- TRN-007: nur Positionen des Bereichs dieses Termins. Der Trigger wiese
   -- eine fremde ab; hier faellt sie aus dem Join und der ganze Vorgang
   -- scheitert mit einer Meldung, die den Grund nennt.
   and i.service_area = app.service_area_of_appointment_kind(v_kind);

  get diagnostics v_anzahl = row_count;

  -- Eine Position, die es in der geltenden Preisliste nicht gibt oder die
  -- nicht zum Anlass passt, faellt aus dem Join heraus. Stillschweigend
  -- weniger zu schreiben, als verlangt wurde, waere genau der Fehler aus
  -- Paragraf 13 - also scheitert der ganze Vorgang.
  if v_anzahl <> jsonb_array_length(p_items) then
    raise exception 'item does not belong to the catalog version valid on % or does not match %',
      v_performed_on, v_erwartet using errcode = '22023';
  end if;

  -- Die genutzte Menge der Grundlage wird jetzt fortgeschrieben (ANN-073).
  -- Die Constraint used_quantity <= prescribed_quantity bleibt bestehen und
  -- schuetzt die Abrechnung (ADR-020 Punkt 5); sie bekommt hier nur eine
  -- verstaendliche Meldung.
  begin
    update public.treatment_base_items p
       set used_quantity = p.used_quantity + b.menge
    from (
      select treatment_base_item_id, sum(quantity)::smallint as menge
      from public.billable_services
      where appointment_id = p_appointment_id and treatment_base_item_id is not null
      group by treatment_base_item_id
    ) b
    where p.id = b.treatment_base_item_id;
  exception
    when check_violation then
      raise exception 'treatment basis quantity exhausted' using errcode = '23514';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'billable_service.recorded', 'appointment', p_appointment_id, 'success',
    jsonb_strip_nulls(jsonb_build_object(
      'surface', 'web',
      -- PRX-009: ob am Termin von der behandelnden Person abgehakt oder im
      -- Buero erfasst - fuer den Nachweis, nicht fuer eine Auswertung (§20).
      'recorded_by_role', case when app.can_record_billable_services() then 'billing' else 'treating' end,
      'patient_id', v_patient,
      'training_relationship_id', v_training,
      'item_count', v_anzahl,
      'performed_on', v_performed_on
    ))
  );

  return v_anzahl;
end;
$function$;

-- ---- export
CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'fax', k.fax,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'take_along_items', v.take_along_items,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'fee_waived_at', t.fee_waived_at,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme; die Datei selbst wird getrennt herausgegeben (ADR-017).'
      ),
      jsonb_build_object(
        'was', 'Protokoll der Zugriffe auf die Akte',
        'grund', 'Jede Zeile ist zugleich ein Datensatz ueber eine beschaeftigte Person (Art. 15 Abs. 4 DSGVO); sie wird auf gesondertes Verlangen erteilt (ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$function$;

-- ---- stats
CREATE OR REPLACE FUNCTION public.get_practice_statistics(p_month date DEFAULT NULL::date)
 RETURNS TABLE(time_zone text, today date, month date, previous_month date, revenue_cents bigint, revenue_therapy_cents bigint, revenue_training_cents bigint, revenue_previous_cents bigint, payments_cents bigint, payments_previous_cents bigint, open_count integer, open_cents bigint, open_not_due_count integer, open_not_due_cents bigint, open_overdue_1_30_count integer, open_overdue_1_30_cents bigint, open_overdue_31_60_count integer, open_overdue_31_60_cents bigint, open_overdue_over_60_count integer, open_overdue_over_60_cents bigint, utilization_from date, utilization_to date, available_minutes integer, booked_minutes integer, ending_bases integer, uncovered_appointments integer, absences_from date, absences_to date, patient_cancellations integer, no_shows integer, absences_with_fee integer, absence_fee_cents bigint, absences_previous integer, absence_fee_previous_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org        uuid;
  v_tz         text;
  v_heute      date;
  v_monat      date;
  v_vormonat   date;
  v_ausfall_ab date;
  v_vorher_ab  date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read practice statistics');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read practice statistics' using errcode = '42501';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_tz)::date;
  v_monat := date_trunc('month', coalesce(p_month, v_heute))::date;
  if v_monat < date '2020-01-01' or v_monat > date '2200-01-01' then
    raise exception 'month out of range' using errcode = '22023';
  end if;
  v_vormonat := (v_monat - interval '1 month')::date;
  -- Vier Wochen einschliesslich heute, davor dieselbe Laenge.
  v_ausfall_ab := v_heute - 27;
  v_vorher_ab  := v_heute - 55;

  return query
  with
  -- ---------------------------------------------------------------------------
  -- (1) Rechnungsstellung: Rechnung am Ausstellungstag, Storno am eigenen Tag
  -- ---------------------------------------------------------------------------
  rechnungsstellung as (
    select r.tag, r.bereich, r.betrag
    from app.revenue_documents(v_org, v_vormonat, (v_monat + interval '1 month')::date) r
  ),
  umsatz as (
    select coalesce(sum(r.betrag) filter (where r.tag >= v_monat), 0)::bigint as gesamt,
           coalesce(sum(r.betrag) filter (where r.tag >= v_monat and r.bereich = 'therapy'), 0)::bigint as behandlung,
           coalesce(sum(r.betrag) filter (where r.tag >= v_monat and r.bereich = 'training'), 0)::bigint as training,
           coalesce(sum(r.betrag) filter (where r.tag < v_monat), 0)::bigint as vormonat
    from rechnungsstellung r
  ),
  -- Zufluss: gebuchte Zahlungen, die Rueckzahlung zieht ab.
  zufluss as (
    select coalesce(sum(z.betrag) filter (where z.tag >= v_monat), 0)::bigint as monat,
           coalesce(sum(z.betrag) filter (where z.tag < v_monat), 0)::bigint as vormonat
    from app.payment_flows(v_org, v_vormonat, (v_monat + interval '1 month')::date) z
  ),
  -- ---------------------------------------------------------------------------
  -- (2) Offene Posten nach Tagen ueber der Faelligkeit
  -- ---------------------------------------------------------------------------
  offen as (
    select o.outstanding_cents::bigint as betrag,
           v_heute - o.due_on as tage
    from app.open_invoices(v_org) o
  ),
  posten as (
    select count(*)::integer as anzahl,
           coalesce(sum(o.betrag), 0)::bigint as summe,
           count(*) filter (where o.tage is null or o.tage <= 0)::integer as n0,
           coalesce(sum(o.betrag) filter (where o.tage is null or o.tage <= 0), 0)::bigint as s0,
           count(*) filter (where o.tage between 1 and 30)::integer as n1,
           coalesce(sum(o.betrag) filter (where o.tage between 1 and 30), 0)::bigint as s1,
           count(*) filter (where o.tage between 31 and 60)::integer as n2,
           coalesce(sum(o.betrag) filter (where o.tage between 31 and 60), 0)::bigint as s2,
           count(*) filter (where o.tage > 60)::integer as n3,
           coalesce(sum(o.betrag) filter (where o.tage > 60), 0)::bigint as s3
    from offen o
  ),
  -- ---------------------------------------------------------------------------
  -- (3) Auslastung: Arbeitszeit und gebuchte Zeit darin, je Person und Tag
  -- gerechnet und nur als Summe geliefert (ANN-152).
  -- ---------------------------------------------------------------------------
  tage as (
    select g::date as tag
    from generate_series(v_heute::timestamp, (v_heute + 13)::timestamp, interval '1 day') g
  ),
  arbeit as (
    select sm.id as staff, t.tag, app.working_ranges(sm.id, v_org, t.tag) as bereiche
    from public.staff_members sm
    cross join tage t
    where sm.organization_id = v_org
      and app.is_assignable_therapist(sm.id, v_org)
  ),
  gebucht as (
    select a.staff, a.tag,
           range_agg(app.timerange(
             greatest(t.starts_at at time zone v_tz, a.tag::timestamp)::time,
             case when t.ends_at at time zone v_tz >= (a.tag + 1)::timestamp
                  then time '24:00'
                  else (t.ends_at at time zone v_tz)::time end,
             '[)'
           )) as zeiten
    from arbeit a
    join public.appointments t
      on t.organization_id = v_org
     and t.staff_member_id = a.staff
     and t.status <> 'cancelled'
     and t.kind in ('therapy', 'training')
     and t.starts_at < ((a.tag + 1)::timestamp at time zone v_tz)
     and t.ends_at > (a.tag::timestamp at time zone v_tz)
    where a.bereiche is not null
    group by a.staff, a.tag
  ),
  auslastung as (
    select coalesce(sum((
             select sum(extract(epoch from (upper(r) - lower(r))) / 60)
             from unnest(a.bereiche) r
           )), 0)::integer as verfuegbar,
           coalesce(sum((
             select sum(extract(epoch from (upper(r) - lower(r))) / 60)
             from unnest(a.bereiche * g.zeiten) r
           )), 0)::integer as belegt
    from arbeit a
    left join gebucht g on g.staff = a.staff and g.tag = a.tag
    where a.bereiche is not null
  ),
  -- ---------------------------------------------------------------------------
  -- (4) Verordnungen ohne Anschluss und ungedeckte kommende Termine
  -- ---------------------------------------------------------------------------
  verordnungen as (
    select count(*)::integer as endend
    from app.ending_treatment_bases(v_org)
  ),
  ungedeckt as (
    select count(*)::integer as termine
    from public.appointments a
    -- Nur Verordnungen: Bei einem Selbstzahler gibt es niemanden anzufragen,
    -- und die Kennzahl gilt den Verordnungen (wie app.ending_treatment_bases).
    join public.treatment_bases tb
      on tb.id = a.treatment_basis_id
     and tb.treatment_basis_kind <> 'self_pay'
    where a.organization_id = v_org
      and a.status = 'confirmed'
      and a.starts_at >= now()
      and app.appointment_is_covered(a.id) is false
  ),
  -- ---------------------------------------------------------------------------
  -- (5) Ausfaelle nach dem Tag des Termins (ANN-153). Eine Absage bleibt
  -- `cancelled`, ein Nichtantreffen `no_show` - auch mit Gebuehr und Rechnung
  -- darueber (Constraints appointments_cancellation_fields, _no_show_fields).
  -- ---------------------------------------------------------------------------
  ausfall as (
    select a.id,
           (a.starts_at at time zone v_tz)::date as tag,
           (a.status = 'cancelled' and a.cancellation_reason in ('patient_request', 'patient_moved')) as absage,
           (a.status = 'no_show') as nicht_angetroffen,
           (app.billable_fee_basis(a.fee_basis, a.fee_waived_at) is not null) as mit_gebuehr
    from public.appointments a
    where a.organization_id = v_org
      and a.kind in ('therapy', 'training')
      and a.starts_at >= (v_vorher_ab::timestamp at time zone v_tz)
      and a.starts_at < ((v_heute + 1)::timestamp at time zone v_tz)
      and (
        (a.status = 'cancelled' and a.cancellation_reason in ('patient_request', 'patient_moved'))
        or a.status = 'no_show'
      )
  ),
  honorar as (
    select f.id,
           coalesce(sum(bs.quantity * ci.unit_price_cents), 0)::bigint as betrag
    from ausfall f
    join public.billable_services bs on bs.appointment_id = f.id
    join public.service_catalog_items ci on ci.id = bs.catalog_item_id and ci.item_kind = 'absence_fee'
    group by f.id
  ),
  ausfaelle as (
    select count(*) filter (where f.tag >= v_ausfall_ab and f.absage)::integer as absagen,
           count(*) filter (where f.tag >= v_ausfall_ab and f.nicht_angetroffen)::integer as nicht_angetroffen,
           count(*) filter (where f.tag >= v_ausfall_ab and f.mit_gebuehr)::integer as mit_gebuehr,
           coalesce(sum(h.betrag) filter (where f.tag >= v_ausfall_ab), 0)::bigint as honorar,
           count(*) filter (where f.tag < v_ausfall_ab)::integer as vorher,
           coalesce(sum(h.betrag) filter (where f.tag < v_ausfall_ab), 0)::bigint as honorar_vorher
    from ausfall f
    left join honorar h on h.id = f.id
  )
  select v_tz,
         v_heute,
         v_monat,
         v_vormonat,
         u.gesamt, u.behandlung, u.training, u.vormonat,
         z.monat, z.vormonat,
         p.anzahl, p.summe, p.n0, p.s0, p.n1, p.s1, p.n2, p.s2, p.n3, p.s3,
         v_heute, v_heute + 13, al.verfuegbar, al.belegt,
         v.endend, ug.termine,
         v_ausfall_ab, v_heute,
         af.absagen, af.nicht_angetroffen, af.mit_gebuehr, af.honorar,
         af.vorher, af.honorar_vorher
  from umsatz u, zufluss z, posten p, auslastung al, verordnungen v, ungedeckt ug, ausfaelle af;
end;
$function$;
