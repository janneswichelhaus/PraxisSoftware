-- =============================================================================
-- STA-002: Zielwerte zu den fuenf Kennzahlen (STA-EPIC-001)
--
-- Zu jeder Kennzahl aus get_practice_statistics (STA-001) ein Zielwert, den
-- owner einstellt. Ein Zielwert ist eine organisatorische Einstellung der
-- Praxis wie das Minutenraster - kein Gesundheitsdatum, kein Personenbezug.
--
--   revenue_cents        Umsatz je Monat (Rechnungsstellung, brutto), mindestens
--   open_items_cents     offene Posten insgesamt, hoechstens
--   utilization_percent  Auslastung der naechsten vierzehn Tage, mindestens
--   ending_bases         Verordnungen ohne Anschluss, hoechstens
--   absences             Ausfaelle in vier Wochen, hoechstens
--
-- Die Richtung (mindestens / hoechstens) steht an genau einer Stelle, in der
-- Oberflaeche (src/features/statistics/kennzahlen.ts, ANN-155); die Datenbank
-- speichert nur die Zahl. Ohne Zielwert ist das Feld leer - die Software raet
-- kein Ziel.
--
-- Eine Zeile je Organisation, kein direkter Zugriff: gelesen ueber
-- get_practice_targets, geschrieben ueber set_practice_target, beide allein
-- owner. Jede Aenderung schreibt organization.practice_target_changed mit
-- altem und neuem Wert (ADR-010; wie beim Minutenraster, ANN-004).
-- =============================================================================

create table public.practice_targets (
  organization_id     uuid primary key references public.organizations (id) on delete cascade,
  revenue_cents       integer check (revenue_cents is null or revenue_cents between 0 and 100000000),
  open_items_cents    integer check (open_items_cents is null or open_items_cents between 0 and 100000000),
  utilization_percent smallint check (utilization_percent is null or utilization_percent between 0 and 100),
  ending_bases        integer check (ending_bases is null or ending_bases between 0 and 10000),
  absences            integer check (absences is null or absences between 0 and 10000),
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);

comment on table public.practice_targets is
  'Zielwerte zu den Kennzahlen der Praxisfuehrung (STA-002): Umsatz, offene Posten, Auslastung, Verordnungen ohne Anschluss, Ausfaelle. Keine Patientendaten; updated_by nennt das Konto der letzten Aenderung. Kein direkter Zugriff; lesen und schreiben allein owner ueber get_practice_targets und set_practice_target. Datenklasse: Stammdaten der Praxis, faellt mit der Organisation.';

alter table public.practice_targets enable row level security;
revoke all on public.practice_targets from public, anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('practice_targets', 'stammdaten_praxis', 'keine',
   'Zielwerte der Praxisfuehrung ohne Personenbezug. Ein Zielwert wird geloescht, indem er geleert wird; die Zeile faellt mit der Organisation (FK on delete cascade).', 215);

-- -----------------------------------------------------------------------------
-- Auditkatalog: organization.practice_target_changed
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text])));

-- -----------------------------------------------------------------------------
-- Lesen
-- -----------------------------------------------------------------------------
create function public.get_practice_targets()
returns table (
  revenue_cents       integer,
  open_items_cents    integer,
  utilization_percent smallint,
  ending_bases        integer,
  absences            integer,
  updated_at          timestamptz
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
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read practice targets');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read practice targets' using errcode = '42501';
  end if;

  -- Immer genau eine Zeile: ohne gespeicherte Ziele eine leere.
  return query
  select t.revenue_cents, t.open_items_cents, t.utilization_percent,
         t.ending_bases, t.absences, t.updated_at
  from (select 1) eins
  left join public.practice_targets t on t.organization_id = v_org;
end;
$$;

comment on function public.get_practice_targets() is
  'STA-002: die Zielwerte der Praxis in einer Zeile, leer ohne gespeicherte Ziele. Allein owner; ein abgewiesener Aufruf liefert keine Zeile und wird als statistics.read protokolliert.';

revoke all on function public.get_practice_targets() from public, anon;
grant execute on function public.get_practice_targets() to authenticated;

-- -----------------------------------------------------------------------------
-- Schreiben: ein Zielwert je Aufruf, null leert ihn
-- -----------------------------------------------------------------------------
create function public.set_practice_target(p_kpi text, p_value integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   integer;
  v_max   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    raise exception 'not allowed to change practice targets' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change practice targets' using errcode = '42501';
  end if;

  v_max := case p_kpi
    when 'revenue_cents'       then 100000000
    when 'open_items_cents'    then 100000000
    when 'utilization_percent' then 100
    when 'ending_bases'        then 10000
    when 'absences'            then 10000
  end;
  if v_max is null then
    raise exception 'unknown practice target' using errcode = '22023';
  end if;
  if p_value is not null and (p_value < 0 or p_value > v_max) then
    raise exception 'practice target out of range' using errcode = '22023';
  end if;

  -- Die Zeile sperren, falls es sie gibt; ohne Zeile ist jeder Zielwert leer.
  select case p_kpi
           when 'revenue_cents'       then t.revenue_cents
           when 'open_items_cents'    then t.open_items_cents
           when 'utilization_percent' then t.utilization_percent::integer
           when 'ending_bases'        then t.ending_bases
           when 'absences'            then t.absences
         end
    into v_alt
  from public.practice_targets t
  where t.organization_id = v_org
  for update;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang - und schreibt
  -- auch keine Zeile.
  if v_alt is not distinct from p_value then
    return p_value;
  end if;

  insert into public.practice_targets as t (
    organization_id, revenue_cents, open_items_cents, utilization_percent,
    ending_bases, absences, updated_at, updated_by
  )
  values (
    v_org,
    case when p_kpi = 'revenue_cents'       then p_value end,
    case when p_kpi = 'open_items_cents'    then p_value end,
    case when p_kpi = 'utilization_percent' then p_value::smallint end,
    case when p_kpi = 'ending_bases'        then p_value end,
    case when p_kpi = 'absences'            then p_value end,
    now(),
    v_actor
  )
  on conflict (organization_id) do update
     set revenue_cents       = case when p_kpi = 'revenue_cents'       then p_value else t.revenue_cents end,
         open_items_cents    = case when p_kpi = 'open_items_cents'    then p_value else t.open_items_cents end,
         utilization_percent = case when p_kpi = 'utilization_percent' then p_value::smallint else t.utilization_percent end,
         ending_bases        = case when p_kpi = 'ending_bases'        then p_value else t.ending_bases end,
         absences            = case when p_kpi = 'absences'            then p_value else t.absences end,
         updated_at          = now(),
         updated_by          = v_actor;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.practice_target_changed', 'organization', v_org, 'success',
    jsonb_build_object(
      'surface', 'web',
      -- Alt- und Neuwert wie beim Minutenraster (ANN-004): ein Zielwert der
      -- Praxis hat keinen Personenbezug.
      'target', p_kpi,
      'previous', v_alt,
      'value', p_value
    )
  );

  return p_value;
end;
$$;

comment on function public.set_practice_target(text, integer) is
  'STA-002: setzt oder leert (null) einen Zielwert der Praxisfuehrung und protokolliert organization.practice_target_changed mit altem und neuem Wert. Allein owner.';

revoke all on function public.set_practice_target(text, integer) from public, anon;
grant execute on function public.set_practice_target(text, integer) to authenticated;
