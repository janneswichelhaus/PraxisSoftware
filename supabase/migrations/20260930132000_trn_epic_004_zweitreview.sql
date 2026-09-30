-- =============================================================================
-- TRN-EPIC-004, Zweitreview: Befunde aus dem Review in frischem Kontext
--
--   1. Ein ENTWURF sperrt Absage und Nichtantreffen nicht mehr. Er wird im
--      selben Vorgang verworfen und protokolliert
--      (`training_protocol.discarded`). Nur ein abgeschlossenes Protokoll
--      sperrt. Sonst blieben ein Termin, an dem jemand vorgeschrieben hat,
--      und ein falsch angelegter Termin (ADR-022 Punkt 10) fuer immer
--      bestaetigt - und das Buero saehe nicht, warum (ANN-186).
--   2. save_training_protocol nur am bestaetigten oder durchgefuehrten Termin.
--   3. finalize_training_protocol bricht ab, wenn der Termin nicht nach
--      `documented` geht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auditkatalog: training_protocol.discarded
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text])));


-- -----------------------------------------------------------------------------
-- 1. Der Riegel am Termin: der Entwurf faellt, das abgeschlossene Protokoll haelt
--
-- Der verworfene Entwurf steht nicht im Loeschjournal: Er ist keine Loeschung
-- nach Frist (ADR-008 Punkt 8), sondern das Ende eines Entwurfs mit seinem
-- Termin. Der Auditeintrag nennt nur Kennungen.
-- -----------------------------------------------------------------------------
create or replace function public.appointments_training_protocol_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> 'training' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'documented' and not exists (
    select 1 from public.training_protocols p
    where p.appointment_id = new.id and p.status = 'final'
  ) then
    raise exception 'training appointment is documented only by a finalized training protocol'
      using errcode = '23514';
  end if;

  if new.status in ('cancelled', 'no_show') then
    if exists (
      select 1 from public.training_protocols p
      where p.appointment_id = new.id and p.status = 'final'
    ) then
      raise exception 'finalized training protocol exists for this appointment' using errcode = '22023';
    end if;

    -- ANN-186: Absage und Nichtantreffen sagen, dass die Einheit nicht
    -- stattgefunden hat; ein Entwurf daran faellt mit.
    with verworfen as (
      delete from public.training_protocols p
       where p.appointment_id = new.id and p.status = 'draft'
      returning p.id, p.organization_id, p.training_relationship_id
    )
    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    select v.organization_id, auth.uid(),
           case when auth.uid() is null then 'system' else 'user' end,
           'training_protocol.discarded', 'training_protocol', v.id, 'success',
           jsonb_build_object(
             'surface', case when auth.uid() is null then 'scheduler' else 'web' end,
             'appointment_id', new.id,
             'training_relationship_id', v.training_relationship_id,
             'reason', new.status
           )
    from verworfen v;
  end if;

  return new;
end;
$$;

comment on function public.appointments_training_protocol_guard() is
  'Invariante am Trainingstermin (TRN-009, ADR-018 Punkt 3 nach ADR-022 Punkt 8): documented nur mit abgeschlossenem Trainingsprotokoll; keine Absage und kein Nichtantreffen neben einem abgeschlossenen Protokoll; ein Entwurf wird dabei verworfen und protokolliert (Zweitreview, ANN-186).';

-- -----------------------------------------------------------------------------
-- 2. und 3. Speichern und Abschliessen - unveraendert bis auf die markierten
-- Stellen.
-- -----------------------------------------------------------------------------
create or replace function public.save_training_protocol(
  p_appointment_id      uuid,
  p_content             text,
  p_expected_updated_at timestamptz default null
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_inhalt   text;
  v_termin   record;
  v_protokoll record;
  v_id       uuid;
  v_stand    timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.updated', 'not allowed to write training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'training protocol must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'training protocol is too long' using errcode = '22023';
  end if;

  select a.id, a.status, a.training_relationship_id
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'training'
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be protocolled' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be protocolled' using errcode = '22023';
  end if;

  select p.id, p.status, p.updated_at
    into v_protokoll
  from public.training_protocols p
  where p.appointment_id = p_appointment_id
  for update;

  -- IF und RAISE lassen FOUND stehen; das "if not found" unten liest weiter
  -- das Ergebnis der Abfrage oben.
  if found and v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  -- Zweitreview 2: Ein Entwurf entsteht nur am bestaetigten oder
  -- durchgefuehrten Termin - nie an einem dokumentierten, dessen Protokoll
  -- der Loeschlauf genommen hat (ANN-183).
  if v_termin.status not in ('confirmed', 'completed') then
    raise exception 'appointment cannot be protocolled' using errcode = '22023';
  end if;

  if not found then
    begin
      insert into public.training_protocols (
        organization_id, training_relationship_id, appointment_id, status, content,
        created_by, updated_by
      )
      values (
        v_org, v_termin.training_relationship_id, p_appointment_id, 'draft', v_inhalt,
        v_actor, v_actor
      )
      returning training_protocols.id, training_protocols.updated_at into v_id, v_stand;
    exception
      when unique_violation then
        raise exception 'training protocol already exists' using errcode = '23505';
    end;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'training_protocol.created', 'training_protocol', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        'appointment_id', p_appointment_id,
        'training_relationship_id', v_termin.training_relationship_id
      )
    );

    return query select v_id, v_stand;
    return;
  end if;

  if v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;
  if v_protokoll.updated_at is distinct from p_expected_updated_at then
    raise exception 'training protocol was changed meanwhile' using errcode = '40001';
  end if;

  update public.training_protocols p
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where p.id = v_protokoll.id
  returning p.updated_at into v_stand;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_protocol.updated', 'training_protocol', v_protokoll.id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'training_relationship_id', v_termin.training_relationship_id
    )
  );

  return query select v_protokoll.id, v_stand;
end;
$$;

comment on function public.save_training_protocol(uuid, text, timestamptz) is
  'TRN-009: legt das Trainingsprotokoll eines Trainingstermins als Entwurf an oder aendert den Entwurf (erwarteter Stand Pflicht). owner, trainer (ANN-184); protokolliert training_protocol.created/updated ohne Inhalt, abgewiesen mit denied und HTTP 403.';
revoke all on function public.save_training_protocol(uuid, text, timestamptz) from public, anon;
grant execute on function public.save_training_protocol(uuid, text, timestamptz) to authenticated;

create or replace function public.finalize_training_protocol(
  p_appointment_id      uuid,
  p_content             text,
  p_expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_inhalt    text;
  v_termin    record;
  v_protokoll record;
  v_id        uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.finalized', 'not allowed to write training protocols');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'training protocol must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'training protocol is too long' using errcode = '22023';
  end if;

  select a.id, a.status, a.training_relationship_id
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'training'
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be protocolled' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be protocolled' using errcode = '22023';
  end if;

  select p.id, p.status, p.updated_at
    into v_protokoll
  from public.training_protocols p
  where p.appointment_id = p_appointment_id
  for update;

  if found and v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  -- Ein Termin ohne Protokoll ist nie `documented` (Trigger); hier also nur
  -- bestaetigt oder durchgefuehrt.
  if v_termin.status not in ('confirmed', 'completed') then
    raise exception 'appointment cannot be documented' using errcode = '22023';
  end if;

  if not found then
    begin
      insert into public.training_protocols (
        organization_id, training_relationship_id, appointment_id, status, content,
        created_by, updated_by, finalized_at, finalized_by
      )
      values (
        v_org, v_termin.training_relationship_id, p_appointment_id, 'final', v_inhalt,
        v_actor, v_actor, now(), v_actor
      )
      returning training_protocols.id into v_id;
    exception
      when unique_violation then
        raise exception 'training protocol already exists' using errcode = '23505';
    end;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'training_protocol.created', 'training_protocol', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        'appointment_id', p_appointment_id,
        'training_relationship_id', v_termin.training_relationship_id
      )
    );
  else
    if p_expected_updated_at is null then
      raise exception 'expected updated_at is required' using errcode = '22023';
    end if;
    if v_protokoll.updated_at is distinct from p_expected_updated_at then
      raise exception 'training protocol was changed meanwhile' using errcode = '40001';
    end if;

    v_id := v_protokoll.id;
    update public.training_protocols p
       set content      = v_inhalt,
           status       = 'final',
           updated_at   = now(),
           updated_by   = v_actor,
           finalized_at = now(),
           finalized_by = v_actor
     where p.id = v_id;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_protocol.finalized', 'training_protocol', v_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'training_relationship_id', v_termin.training_relationship_id
    )
  );

  -- Zweitreview 3: Ohne den Uebergang nach `documented` gibt es keinen
  -- Abschluss - beide Richtungen der Invariante haengen an diesem Vorgang.
  if not app.mark_appointment_documented(p_appointment_id, v_actor) then
    raise exception 'appointment cannot be documented' using errcode = '40001';
  end if;

  return v_id;
end;
$$;

comment on function public.finalize_training_protocol(uuid, text, timestamptz) is
  'TRN-009/TRN-010: schliesst das Trainingsprotokoll eines Trainingstermins ab (ohne Entwurf: legt es abgeschlossen an) und setzt den Termin im selben Vorgang auf documented (ADR-018 Punkt 3 nach ADR-022 Punkt 8). owner, trainer (ANN-184); unveraenderlich danach (ANN-185); abgewiesen mit denied und HTTP 403.';
revoke all on function public.finalize_training_protocol(uuid, text, timestamptz) from public, anon;
grant execute on function public.finalize_training_protocol(uuid, text, timestamptz) to authenticated;
