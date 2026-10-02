-- =============================================================================
-- ABN-022 (BEF-113): Trainingsprotokoll - Buero liest, Nachtrag, Verwerfen
-- mit Hinweis und Loeschjournal
--
-- Abnahme Jannes, 2026-10-02:
--   1. Buero liest (ANN-184): Lese- und Schreibrecht getrennt. `office` liest
--      Protokolle und ihren Zustand, auch in der Liste der Einheiten,
--      protokolliert als training_protocol.viewed; Schreiben und Abschliessen
--      bleiben bei owner und Trainingsbetreuung. Scharf mit echten Daten erst,
--      wenn die DSFA (B2) das Lesen bestaetigt.
--   2. Nachtrag (ANN-185): Ein abgeschlossenes Protokoll bleibt
--      unveraenderlich. Korrekturen kommen als verknuepfter Nachtrag mit
--      Grund, Verfasser:in und Zeitpunkt, angezeigt unter dem Text.
--   3. Verwerfen (ANN-186): Ein durch Absage oder Nichtantreffen verworfener
--      Entwurf steht im Loeschjournal und taucht nach einer Wiederherstellung
--      nicht wieder auf. Den Hinweis vorher gibt die Oberflaeche.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lesen und Schreiben getrennt
-- -----------------------------------------------------------------------------
create function app.can_read_training_protocols()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'trainer', 'office')
$$;

comment on function app.can_read_training_protocols() is
  'Wer Trainingsprotokolle lesen darf: owner, Trainingsbetreuung und Buero (ABN-022, BEF-113, ANN-184 Fassung 2). Schreiben regelt app.can_access_training_protocols() (owner, trainer).';

grant execute on function app.can_read_training_protocols() to authenticated;

comment on function app.can_access_training_protocols() is
  'Wer Trainingsprotokolle schreiben und abschliessen darf: owner und Trainingsbetreuung (TRN-009, ANN-184). Lesen regelt seit ABN-022 app.can_read_training_protocols().';

-- -----------------------------------------------------------------------------
-- 2. Nachtraege
-- -----------------------------------------------------------------------------
create table public.training_protocol_addenda (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  protocol_id      uuid not null references public.training_protocols (id) on delete cascade,
  content          text not null check (length(btrim(content)) between 1 and 5000),
  reason           text not null check (length(btrim(reason)) between 3 and 500),
  created_at       timestamptz not null default now(),
  created_by       uuid not null
);

comment on table public.training_protocol_addenda is
  'Nachtraege zu abgeschlossenen Trainingsprotokollen mit Grund, Verfasser:in und Zeitpunkt (ABN-022, BEF-113, ANN-185 Fassung 2). Unveraenderlich; fallen mit dem Protokoll. Kein direkter Zugriff.';

create index training_protocol_addenda_protocol_idx on public.training_protocol_addenda (protocol_id);

alter table public.training_protocol_addenda enable row level security;
revoke all on public.training_protocol_addenda from public, anon, authenticated;

create function app.guard_training_protocol_addendum()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'training protocol addenda are immutable' using errcode = '23514';
end;
$$;

create trigger training_protocol_addenda_immutable
  before update on public.training_protocol_addenda
  for each row execute function app.guard_training_protocol_addendum();

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('training_protocol_addenda', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Nachtraege zu Trainingsprotokollen; fallen mit dem Protokoll (ABN-022).', 51);

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text, 'platform_access.invited'::text, 'platform_access.invitation_sent'::text, 'platform_access.activated'::text, 'platform_access.password_reset'::text, 'platform_access.locked'::text, 'platform_access.unlocked'::text, 'platform_access.revoked'::text, 'platform_accesses.read'::text, 'platform_access.companion_declined'::text, 'platform_representation.read'::text, 'appointment.fee_waived'::text, 'payment.offset'::text, 'treatment_draft_findings.saved'::text, 'treatment_draft_findings.viewed'::text, 'waitlist_entry.reviewed'::text, 'training_protocol.addendum_created'::text])));

create function public.add_training_protocol_addendum(
  p_appointment_id uuid,
  p_content        text,
  p_reason         text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_prot  record;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  select p.id, p.status, p.training_relationship_id into v_prot
  from public.training_protocols p
  join public.appointments a on a.id = p.appointment_id
  where p.appointment_id = p_appointment_id and p.organization_id = v_org
    and a.organization_id = v_org;
  if not found then
    raise exception 'training protocol not found' using errcode = 'P0002';
  end if;
  if v_prot.status <> 'final' then
    raise exception 'only a finalized training protocol takes an addendum' using errcode = '22023';
  end if;
  if p_content is null or length(btrim(p_content)) not between 1 and 5000 then
    raise exception 'addendum content out of range' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'an addendum needs a reason' using errcode = '22023';
  end if;

  insert into public.training_protocol_addenda (organization_id, protocol_id, content, reason, created_by)
  values (v_org, v_prot.id, btrim(p_content), btrim(p_reason), v_actor)
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_protocol.addendum_created', 'training_protocol', v_prot.id, 'success',
    jsonb_build_object('surface', 'web', 'appointment_id', p_appointment_id,
                       'training_relationship_id', v_prot.training_relationship_id)
  );

  return v_id;
end;
$$;

comment on function public.add_training_protocol_addendum(uuid, text, text) is
  'Haengt einen Nachtrag mit Grund an ein abgeschlossenes Trainingsprotokoll (ABN-022, BEF-113, ANN-185 Fassung 2). owner und Trainingsbetreuung; protokolliert ohne Inhalt.';

revoke all on function public.add_training_protocol_addendum(uuid, text, text) from public, anon;
grant execute on function public.add_training_protocol_addendum(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Lesewege (Rumpf aus dem heutigen Stand)
-- -----------------------------------------------------------------------------
drop function public.get_training_protocol(uuid);

CREATE OR REPLACE FUNCTION public.get_training_protocol(p_appointment_id uuid)
 RETURNS TABLE(id uuid, appointment_id uuid, status text, content text, created_at timestamp with time zone, updated_at timestamp with time zone, finalized_at timestamp with time zone, author_name text, finalized_by_name text, addenda jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_rel   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ABN-022 (BEF-113): Lesen ist getrennt vom Schreiben; das Buero liest.
  if not app.can_read_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_protocol.viewed', 'not allowed to read training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training protocols' using errcode = '42501';
  end if;

  select a.training_relationship_id into v_rel
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org and a.kind = 'training';

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'training_protocol.viewed', 'training_protocol', p.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', p_appointment_id,
           'training_relationship_id', v_rel
         )
  from public.training_protocols p
  where p.appointment_id = p_appointment_id;

  return query
    select p.id, p.appointment_id, p.status, p.content, p.created_at, p.updated_at,
           p.finalized_at, verfasser.display_name, abschluss.display_name,
           -- ABN-022 (BEF-113): Nachtraege unter dem Text, aelteste zuerst.
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', n.id,
                      'content', n.content,
                      'reason', n.reason,
                      'created_at', n.created_at,
                      'author_name', na.display_name
                    ) order by n.created_at)
             from public.training_protocol_addenda n
             left join public.user_profiles na on na.id = n.created_by
             where n.protocol_id = p.id
           ), '[]'::jsonb)
    from public.training_protocols p
    left join public.user_profiles verfasser on verfasser.id = p.created_by
    left join public.user_profiles abschluss on abschluss.id = p.finalized_by
    where p.appointment_id = p_appointment_id;
end;
$function$
;

revoke all on function public.get_training_protocol(uuid) from public, anon;
grant execute on function public.get_training_protocol(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.list_training_protocols(p_relationship_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, appointment_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, staff_given_name text, staff_family_name text, status text, content text, finalized_at timestamp with time zone, author_name text, organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ABN-022 (BEF-113): Lesen ist getrennt vom Schreiben; das Buero liest.
  if not app.can_read_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_protocol.viewed', 'not allowed to read training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training protocols' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  select array_agg(s.id)
    into v_ids
  from (
    select p.id
    from public.training_protocols p
    join public.appointments a on a.id = p.appointment_id
    where p.training_relationship_id = p_relationship_id
      and p.organization_id = v_org
    order by a.starts_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) s;

  if v_ids is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'training_protocol.viewed', 'training_protocol', p.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', p.appointment_id,
           'training_relationship_id', p_relationship_id
         )
  from public.training_protocols p
  where p.id = any (v_ids);

  return query
    select p.id, p.appointment_id, a.starts_at, a.ends_at, a.appointment_type,
           sp.given_name, sp.family_name, p.status, p.content, p.finalized_at,
           verfasser.display_name, o.time_zone
    from public.training_protocols p
    join public.appointments a   on a.id  = p.appointment_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = p.organization_id
    left join public.user_profiles verfasser on verfasser.id = p.created_by
    where p.id = any (v_ids)
    order by a.starts_at desc, p.id desc;
end;
$function$
;

-- -----------------------------------------------------------------------------
-- 4. Verworfener Entwurf ins Loeschjournal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointments_training_protocol_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    -- stattgefunden hat; ein Entwurf daran faellt mit. Seit ABN-022
    -- (BEF-113) steht er im Loeschjournal und taucht nach einer
    -- Wiederherstellung nicht wieder auf; die Oberflaeche warnt vorher.
    with verworfen as (
      delete from public.training_protocols p
       where p.appointment_id = new.id and p.status = 'draft'
      returning p.id, p.organization_id, p.training_relationship_id
    ),
    journal as (
      insert into public.deletion_journal
        (organization_id, run_id, target_table, target_id, retention_class, due_at)
      select v.organization_id, extensions.gen_random_uuid(), 'training_protocols', v.id,
             'trainingsverhaeltnis', now()
      from verworfen v
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
$function$
;

