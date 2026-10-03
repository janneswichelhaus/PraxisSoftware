-- =============================================================================
-- LOG-EPIC-001, PR (a): Lesen je Akte und Tag, Download statt Verweis,
-- eine Aktion fuer jede Abweisung (Freigabe Jannes, 2026-10-03; ANN-230)
--
-- Leitprinzip: Das Datenmodell ist die Nachweisfuehrung. Das Auditlog haelt nur,
-- was das Datenmodell nicht abbildet. Fuer das Lesen heisst das:
--
--   * "Akte geoeffnet" (patient_record.viewed, training_relationship.viewed)
--     steht hoechstens einmal je Person, Akte und Kalendertag der Praxis. Jeder
--     Lesepfad auf klinische Inhalte ruft app.log_record_access und schreibt
--     damit keinen eigenen *.viewed-Eintrag mehr. Ohne Protokoll bleibt kein
--     klinischer Inhalt lesbar; nur die Koernung ist jetzt der Tag.
--   * Dasselbe fuer das Lesen ueber eine Vertretung (platform_representation.read).
--   * Eine Datei steht nur noch beim Herunterladen im Protokoll
--     (patient_file.downloaded); das Anzeigen nicht.
--   * Jede Abweisung ist access.denied mit context.operation. Gleichartige
--     Abweisungen (gleiche Person, gleiche operation) innerhalb von zehn
--     Minuten ab dem ersten Eintrag fasst ein Zaehler zusammen.
--
-- Bestehende Zeilen (nur synthetische Daten, kein Produktivbetrieb):
-- Abweisungen werden umgeschrieben, Downloads umbenannt, die entfallenden
-- Lesewerte geloescht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bestand umschreiben, dann der neue Katalog
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;

update public.audit_log
   set context = context || jsonb_build_object('operation', action, 'count', 1),
       action  = 'access.denied'
 where outcome = 'denied';

update public.audit_log
   set action  = 'patient_file.downloaded',
       context = context - 'download'
 where action = 'patient_file.link_issued'
   and (context ->> 'download')::boolean is true;

delete from public.audit_log
 where action in (
   'treatment_note.viewed', 'treatment_note.history_viewed', 'appointment_brief.viewed',
   'treatment_basis.viewed', 'questionnaire_response.viewed', 'patient_course_event.viewed',
   'therapy_report.viewed', 'treatment_draft_findings.viewed', 'training_protocol.viewed',
   'prescription.viewed', 'statistics.staff_revenue_viewed', 'audit_log.read',
   'patient_file.link_issued'
 );

alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'account.mfa_enrolled',
    'account.mfa_removed',
    'account.password_changed',
    'account.sessions_ended',
    'appointment.call_recorded',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.created',
    'appointment.documented',
    'appointment.fee_waived',
    'appointment.no_show',
    'appointment.notified',
    'appointment.reopened',
    'appointment.rescheduled',
    'appointment.updated',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice.cancelled',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.issued',
    'invoice.recipient_changed',
    'invoice.reminder_created',
    'invoice_recipient.created',
    'invoice_recipient.deleted',
    'invoice_recipient.updated',
    'legal_hold.placed',
    'legal_hold.released',
    'organization.appointment_grid_changed',
    'organization.billing_profile_changed',
    'organization.bootstrapped',
    'organization.documentation_deadline_changed',
    'organization.practice_target_changed',
    'organization.tour_start_changed',
    'patient.address_geocoded',
    'patient.care_concluded',
    'patient.care_reopened',
    'patient.created',
    'patient.merged',
    'patient.status_changed',
    'patient.updated',
    'patient_course_event.created',
    'patient_course_event.removed',
    'patient_file.assigned',
    'patient_file.deleted',
    'patient_file.handed_out',
    'patient_file.type_corrected',
    'patient_file.uploaded',
    'patient_privacy.recorded',
    'patient_record.exported',
    'patient_record.viewed',
    'payment.offset',
    'payment.recorded',
    'payment.voided',
    'platform_access.activated',
    'platform_access.companion_declined',
    'platform_access.invitation_sent',
    'platform_access.invited',
    'platform_access.locked',
    'platform_access.password_reset',
    'platform_access.revoked',
    'platform_access.unlocked',
    'platform_representation.read',
    'prescription.created',
    'prescription.deleted',
    'prescription.updated',
    'questionnaire_response.completed',
    'questionnaire_response.created',
    'questionnaire_response.discarded',
    'questionnaire_response.updated',
    'retention.applied',
    'retention.reapplied',
    'service_catalog.version_created',
    'service_catalog.version_deleted',
    'service_catalog.version_published',
    'service_catalog.version_updated',
    'staff_account.invitation_accepted',
    'staff_account.invitation_revoked',
    'staff_account.invited',
    'staff_account.locked',
    'staff_account.password_reset_requested',
    'staff_account.roles_changed',
    'staff_account.unlocked',
    'staff_member.compensation_model_changed',
    'staff_member.created',
    'staff_member.status_changed',
    'staff_member.updated',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.removed',
    'staff_working_hour_exception.updated',
    'staff_working_hours.created',
    'staff_working_hours.removed',
    'staff_working_hours.updated',
    'storage_deletion.claimed',
    'storage_deletion.ordered',
    'storage_deletion.receipted',
    'task.completed',
    'task.created',
    'task.deleted',
    'task.reopened',
    'task.updated',
    'territory.removed',
    'territory.saved',
    'text_snippet.created',
    'text_snippet.deleted',
    'text_snippet.updated',
    'therapy_report.completed',
    'therapy_report.created',
    'therapy_report.discarded',
    'therapy_report.exported',
    'therapy_report.updated',
    'training_basis.concluded',
    'training_basis.created',
    'training_basis.reopened',
    'training_protocol.addendum_created',
    'training_protocol.created',
    'training_protocol.discarded',
    'training_protocol.finalized',
    'training_protocol.updated',
    'training_relationship.created',
    'training_relationship.ended',
    'training_relationship.reopened',
    'training_relationship.updated',
    'training_relationship.viewed',
    'treatment_basis.appointments_transferred',
    'treatment_basis.created',
    'treatment_basis.deleted',
    'treatment_basis.updated',
    'treatment_draft_findings.saved',
    'treatment_note.addendum_created',
    'treatment_note.auto_finalized',
    'treatment_note.created',
    'treatment_note.finalized',
    'treatment_note.revised',
    'treatment_note.updated',
    'waitlist_entry.closed',
    'waitlist_entry.created',
    'waitlist_entry.reviewed',
    'waitlist_entry.updated',
    'patient_file.downloaded',
    'access.denied'
  ));

-- -----------------------------------------------------------------------------
-- 2. app.log_record_access
--
-- Die eine Stelle fuer "Akte geoeffnet". Ein Eintrag je Person, Aktion,
-- Gegenstand und Kalendertag in der Zeitzone der Praxis; ein zweiter Aufruf am
-- selben Tag schreibt nichts. Die Transaktionssperre verhindert zwei Eintraege,
-- wenn zwei Aufrufe gleichzeitig kommen. Der Aufrufer hat die Berechtigung
-- schon geprueft; die Funktion liegt in app und ist fuer keine
-- Anwendungsrolle ausfuehrbar.
-- -----------------------------------------------------------------------------
create function app.log_record_access(
  p_organization_id uuid,
  p_actor           uuid,
  p_action          text,
  p_subject_type    text,
  p_subject_id      uuid,
  p_actor_kind      text  default 'user',
  p_context         jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zone        text;
  v_tag_beginn  timestamptz;
begin
  if p_action not in ('patient_record.viewed', 'training_relationship.viewed',
                      'platform_representation.read') then
    raise exception 'not a record access action: %', p_action using errcode = '22023';
  end if;
  if p_subject_id is null or p_actor is null then
    return;
  end if;
  -- Nur eine Akte, die es in der Praxis gibt: Ein Aufruf mit unbekannter
  -- Kennung hat nichts gelesen und schreibt nichts.
  if not (
    (p_subject_type = 'patient' and exists (
       select 1 from public.patients p
       where p.id = p_subject_id and p.organization_id = p_organization_id))
    or (p_subject_type = 'training_relationship' and exists (
       select 1 from public.training_relationships t
       where t.id = p_subject_id and t.organization_id = p_organization_id))
  ) then
    return;
  end if;

  select o.time_zone into v_zone
  from public.organizations o
  where o.id = p_organization_id;

  v_tag_beginn := date_trunc('day', now() at time zone v_zone) at time zone v_zone;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'record_access', p_organization_id, p_actor, p_action,
              p_subject_type, p_subject_id, v_tag_beginn), 0));

  if exists (
    select 1
    from public.audit_log a
    where a.subject_type = p_subject_type
      and a.subject_id = p_subject_id
      and a.organization_id = p_organization_id
      and a.action = p_action
      and a.actor_user_id = p_actor
      and a.occurred_at >= v_tag_beginn
  ) then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    p_organization_id, p_actor, p_actor_kind, p_action, p_subject_type, p_subject_id, 'success',
    coalesce(p_context, '{}'::jsonb)
  );
end;
$$;

comment on function app.log_record_access(uuid, uuid, text, text, uuid, text, jsonb) is
  'LOG-EPIC-001 (ADR-010): Akte geoeffnet, hoechstens ein Eintrag je Person, Akte und Kalendertag der Praxis. Einzige Stelle fuer patient_record.viewed, training_relationship.viewed und platform_representation.read.';

revoke all on function app.log_record_access(uuid, uuid, text, text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. app.record_denied_read: access.denied mit Zaehler
--
-- p_action bleibt als Name der abgewiesenen Operation erhalten und steht in
-- context.operation; die 119 Aufrufer bleiben unveraendert. Gleichartige
-- Abweisungen innerhalb von zehn Minuten ab dem ersten Eintrag erhoehen
-- context.count und setzen context.last_at. Das ist das einzige UPDATE auf
-- public.audit_log (supabase/tests/audit-protokoll-lesen.test.ts haelt das fest).
-- -----------------------------------------------------------------------------
create or replace function app.record_denied_read(
  p_actor   uuid,
  p_action  text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_eintrag uuid;
begin
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception '%', p_message using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'access_denied', v_org, p_actor, p_action), 0));

  select a.id into v_eintrag
  from public.audit_log a
  where a.organization_id = v_org
    and a.action = 'access.denied'
    and a.actor_user_id is not distinct from p_actor
    and a.context ->> 'operation' = p_action
    and a.occurred_at > now() - interval '10 minutes'
  order by a.occurred_at desc
  limit 1;

  if v_eintrag is not null then
    update public.audit_log a
       set context = a.context || jsonb_build_object(
             'count', coalesce((a.context ->> 'count')::integer, 1) + 1,
             'last_at', now()
           )
     where a.id = v_eintrag;
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, p_actor, 'access.denied', 'organization', v_org, 'denied',
    jsonb_build_object('surface', 'api', 'reason', 'role', 'operation', p_action, 'count', 1)
  );
end;
$$;

comment on function app.record_denied_read(uuid, text, text) is
  'Schreibt eine Abweisung als access.denied (LOG-EPIC-001, ADR-010). Gleiche Person und operation innerhalb von zehn Minuten: Zaehler im ersten Eintrag statt einer neuen Zeile.';

-- -----------------------------------------------------------------------------
-- 4. Lesen ueber eine Vertretung: einmal je Tag und Akte (ADR-023 Punkt 24)
-- -----------------------------------------------------------------------------
create or replace function app.log_platform_representation(
  p_access_id uuid, p_action text, p_context jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang record;
begin
  select a.* into v_zugang
  from public.platform_accesses a
  where a.id = p_access_id
    and a.access_kind <> 'self'
    and a.account_user_id is not null;
  if not found then
    return;
  end if;

  perform app.log_record_access(
    v_zugang.organization_id, v_zugang.account_user_id, p_action,
    case v_zugang.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'representative',
    jsonb_build_object('surface', 'platform', 'platform_access_id', v_zugang.id,
                       'access_kind', v_zugang.access_kind)
      || coalesce(p_context, '{}'::jsonb)
  );
end;
$$;
