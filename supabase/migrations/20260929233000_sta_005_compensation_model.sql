-- =============================================================================
-- STA-005: Vergütungsmodell je Mitarbeiter:in (STA-EPIC-001, B6 aufgeloest)
--
-- Jannes 2026-09-29: Die Praxis plant verschiedene Verguetungsmodelle, eines
-- davon mit Umsatzbeteiligung. Wer es selbst gewaehlt hat, soll den eigenen
-- Umsatz sehen (STA-006). Dafuer braucht die Datenbank genau eine Angabe je
-- Person: welches Modell gilt. Saetze, Abrechnung der Beteiligung und
-- weitere Modelle sind NICHT hier - sie sind ein eigenes Epic
-- (Ideenspeicher, IDEA-PRX-047).
--
--   * Zwei Werte: `fixed_salary` (Festgehalt) und `revenue_share`
--     (Umsatzbeteiligung). Ohne Zeile ist kein Modell hinterlegt - das zaehlt
--     wie Festgehalt: Niemand bekommt einen Umsatz zu sehen, weil eine Angabe
--     fehlt (ANN-157).
--   * Festgehalten wird, was vereinbart ist; gesetzt allein von owner
--     (Arbeitsvertrag), mit Protokoll staff_member.compensation_model_changed
--     und altem und neuem Wert.
--   * Lesen: owner jede Zeile, jede Person ihre eigene (wie Privatangaben,
--     staff_private_details); office sieht es nicht (ANN-024).
--   * Datenklasse Beschaeftigtendaten, faellt mit dem Mitarbeiterdatensatz.
-- =============================================================================

create table public.staff_compensation_models (
  staff_member_id uuid primary key references public.staff_members (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  model           text not null check (model in ('fixed_salary', 'revenue_share')),
  changed_at      timestamptz not null default now(),
  changed_by      uuid
);

comment on table public.staff_compensation_models is
  'Verguetungsmodell je Mitarbeiter:in (STA-005): Festgehalt oder Umsatzbeteiligung. Ohne Zeile kein Modell hinterlegt (zaehlt wie Festgehalt, ANN-157). Lesen owner und die Person selbst, schreiben allein owner ueber set_staff_compensation_model. Datenklasse: Beschaeftigtendaten; faellt mit dem Mitarbeiterdatensatz.';

create index staff_compensation_models_organization_id_idx
  on public.staff_compensation_models (organization_id);

alter table public.staff_compensation_models enable row level security;
revoke all on public.staff_compensation_models from public, anon, authenticated;
grant select on public.staff_compensation_models to authenticated;

create policy staff_compensation_models_select_owner_or_self
  on public.staff_compensation_models for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (
      app.has_any_role('owner')
      or exists (
        select 1
        from public.staff_members s
        where s.id = staff_compensation_models.staff_member_id
          and s.organization_id = app.current_organization_id()
          and s.person_id = app.current_person_id()
      )
    )
  );

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('staff_compensation_models', 'beschaeftigtendaten', 'ueber_elterndatensatz',
   'Verguetungsmodell. Faellt mit dem Mitarbeiterdatensatz (FK on delete cascade).', 165);

-- -----------------------------------------------------------------------------
-- Die eine Frage: gilt fuer diese Person die Umsatzbeteiligung?
-- -----------------------------------------------------------------------------
create function app.has_revenue_share(p_staff_member_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_compensation_models m
    where m.staff_member_id = p_staff_member_id
      and m.organization_id = p_organization_id
      and m.model = 'revenue_share'
  )
$$;

comment on function app.has_revenue_share(uuid, uuid) is
  'STA-005: true, wenn fuer die Person die Umsatzbeteiligung hinterlegt ist. Ohne Zeile false (ANN-157). Einzige Stelle der Regel; STA-006 fragt sie.';
revoke all on function app.has_revenue_share(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Auditkatalog: staff_member.compensation_model_changed
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text])));

-- -----------------------------------------------------------------------------
-- Schreiben: allein owner; null entfernt die Angabe
-- -----------------------------------------------------------------------------
create function public.set_staff_compensation_model(p_staff_member_id uuid, p_model text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the compensation model' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the compensation model' using errcode = '42501';
  end if;
  if p_model is not null and p_model not in ('fixed_salary', 'revenue_share') then
    raise exception 'unknown compensation model' using errcode = '22023';
  end if;

  -- Die Person sperren: Sie muss zur Organisation gehoeren.
  perform 1 from public.staff_members sm
   where sm.id = p_staff_member_id and sm.organization_id = v_org
   for update;
  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select m.model into v_alt
  from public.staff_compensation_models m
  where m.staff_member_id = p_staff_member_id
  for update;

  if v_alt is not distinct from p_model then
    return p_model;
  end if;

  if p_model is null then
    delete from public.staff_compensation_models where staff_member_id = p_staff_member_id;
  else
    insert into public.staff_compensation_models (staff_member_id, organization_id, model, changed_at, changed_by)
    values (p_staff_member_id, v_org, p_model, now(), v_actor)
    on conflict (staff_member_id) do update
       set model = excluded.model, changed_at = now(), changed_by = v_actor;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_member.compensation_model_changed', 'staff_member', p_staff_member_id, 'success',
    -- Nur die Modellwerte - keine Saetze, keine Betraege.
    jsonb_build_object('surface', 'web', 'previous', v_alt, 'model', p_model)
  );

  return p_model;
end;
$$;

comment on function public.set_staff_compensation_model(uuid, text) is
  'STA-005: setzt (fixed_salary, revenue_share) oder entfernt (null) das Verguetungsmodell einer Person; allein owner, protokolliert als staff_member.compensation_model_changed.';
revoke all on function public.set_staff_compensation_model(uuid, text) from public, anon;
grant execute on function public.set_staff_compensation_model(uuid, text) to authenticated;
