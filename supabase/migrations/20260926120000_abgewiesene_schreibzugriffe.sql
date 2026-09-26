-- =============================================================================
-- Abgewiesene Schreibzugriffe (G6c, ADR-010)
--
-- Seit G6a und G6b ueberlebt ein abgewiesener Leseversuch als denied-Eintrag.
-- Fuer die Schreibpfade hat Jannes am 2026-09-26 gewaehlt (ROADMAP G6c):
-- bestaetigte Transaktion mit HTTP 403 fuer Rollen und Konten, Legal Hold und
-- Loeschauftraege; die uebrigen Schreibpfade bleiben ohne Eintrag.
--
-- Der Weg: Statt einer Ausnahme, die jeden Eintrag zurueckrollt, schreibt der
-- Pfad den Versuch ueber app.record_denied_write, setzt den HTTP-Status fuer
-- PostgREST (response.status = 403) und kehrt ohne Ausnahme zurueck. PostgREST
-- bestaetigt eine Transaktion, die nicht fehlschlaegt, und antwortet mit dem
-- gesetzten Status; zurueckgerollt wird nur bei einer Ausnahme. Der Aufrufer
-- sieht damit dasselbe HTTP 403 wie bisher (42501), nur ist der Versuch jetzt
-- nachweisbar. Daten werden nicht geaendert: Der Zweig kehrt vor jedem
-- Schreiben zurueck.
--
--   invite_staff_account           -> staff_account.invited
--   revoke_staff_invitation        -> staff_account.invitation_revoked
--   set_staff_account_roles        -> staff_account.roles_changed
--   set_staff_account_active       -> staff_account.locked / .unlocked
--   request_staff_password_reset   -> staff_account.password_reset_requested
--   place_legal_hold               -> legal_hold.placed
--   release_legal_hold             -> legal_hold.released
--   claim_storage_deletion_order   -> storage_deletion.claimed
--   receipt_storage_deletion_order -> storage_deletion.receipted
--   order_orphaned_object_deletion -> storage_deletion.ordered (neu, nur denied:
--                                     der erfolgreiche Pfad protokolliert nicht)
--
-- Unveraendert mit Ausnahme bleiben: ohne Sitzung, ohne Organisation, die
-- fachlichen Pruefungen hinter der Rolle (etwa "deletion order not
-- accessible") und alle uebrigen Schreibpfade.
--
-- Achtung beim Aufrufer (ANN-115): supabase-js wertet eine 403-Antwort mit dem
-- Koerper "null" als Erfolg. Die Pfade mit Skalar-Rueckgabe liefern im
-- abgewiesenen Fall genau das; die Wrapper in src/ pruefen deshalb den Status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.record_denied_write
--
-- Die eine Stelle fuer einen abgewiesenen Schreibversuch: derselbe Eintrag wie
-- beim Lesen (Subjekt ist die Organisation, nie die Kennung des Aufrufers),
-- dazu der HTTP-Status fuer PostgREST, lokal zur Transaktion. Liegt in app und
-- ist fuer keine Anwendungsrolle ausfuehrbar.
-- -----------------------------------------------------------------------------
create function app.record_denied_write(
  p_actor   uuid,
  p_action  text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.record_denied_read(p_actor, p_action, p_message);
  perform pg_catalog.set_config('response.status', '403', true);
end;
$$;

comment on function app.record_denied_write(uuid, text, text) is
  'Schreibt einen abgewiesenen Schreibversuch ins Auditlog und setzt response.status = 403 (G6c, ADR-010, ANN-115). Aufrufer: die zehn Schreibpfade fuer Rollen und Konten, Legal Hold und Loeschauftraege.';

revoke all on function app.record_denied_write(uuid, text, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Auditkatalog: storage_deletion.ordered (nur fuer den abgewiesenen Fall)
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text])));

-- -----------------------------------------------------------------------------
-- invite_staff_account - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_staff_account(p_staff_member_id uuid, p_email text, p_role_keys text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor     uuid;
  v_org       uuid;
  v_email     text;
  v_person_id uuid;
  v_id        uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_accounts() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'staff_account.invited', 'not allowed to manage accounts');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  perform app.assert_staff_role_keys(p_role_keys);

  -- Zielsatz ausschliesslich in der eigenen Organisation; sonst waere die
  -- Funktion ein Orakel fuer fremde Mitarbeiter-IDs (13).
  select sm.person_id into v_person_id
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
    and sm.employment_status = 'active'
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  -- Ein zweiter Zugang zu derselben Person waere ein geteilter Zugang durch
  -- die Hintertuer (4.2: ein individuelles Konto ist Pflicht).
  if exists (
    select 1 from public.user_profiles up
    where up.person_id = v_person_id
      and up.organization_id = v_org
  ) then
    raise exception 'account_already_exists' using errcode = '22023';
  end if;

  -- Dieselbe Adresse darf nicht an zwei Zugaenge derselben Praxis gehen.
  if exists (
    select 1
    from public.user_profiles up
    join auth.users au on au.id = up.id
    where up.organization_id = v_org
      and lower(btrim(au.email)) = v_email
  ) then
    raise exception 'email_already_in_use' using errcode = '22023';
  end if;

  insert into public.staff_account_invitations (
    organization_id, staff_member_id, email, role_keys, expires_at, invited_by
  )
  values (
    v_org, p_staff_member_id, v_email, p_role_keys, now() + interval '14 days', v_actor
  )
  returning id into v_id;

  -- Auditeintrag mit den Rollen, aber OHNE die Adresse: die Rollen sind der
  -- sicherheitsrelevante Teil des Vorgangs, die Adresse ist Kontaktdatum
  -- (ADR-010 Punkt 3, PROJECT_PRINCIPLES.md 20).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.invited', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'roles', to_jsonb(p_role_keys))
  );

  return v_id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- revoke_staff_invitation - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_staff uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_accounts() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'staff_account.invitation_revoked', 'not allowed to manage accounts');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  update public.staff_account_invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor
   where id = p_invitation_id
     and organization_id = v_org
     and status = 'pending'
  returning staff_member_id into v_staff;

  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.invitation_revoked', 'staff_member', v_staff, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- set_staff_account_roles - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_account_roles(p_staff_member_id uuid, p_role_keys text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_user   uuid;
  v_alt    text[];
  v_neu    text[];
  v_dazu   text[];
  v_weg    text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_accounts() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'staff_account.roles_changed', 'not allowed to manage accounts');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  perform app.assert_staff_role_keys(p_role_keys);

  -- Zielkonto ueber den Mitarbeiterdatensatz, ausschliesslich in der eigenen
  -- Organisation. Die Sperre haelt zwei gleichzeitige Rollenwechsel
  -- auseinander.
  select up.id into v_user
  from public.staff_members sm
  join public.user_profiles up
    on up.person_id = sm.person_id
   and up.organization_id = sm.organization_id
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update of up;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(ur.role_key order by ur.role_key), array[]::text[])
    into v_alt
  from public.user_roles ur
  where ur.user_id = v_user
    and ur.organization_id = v_org;

  select array_agg(x order by x) into v_neu
  from unnest(p_role_keys) as t(x);

  select coalesce(array_agg(x order by x), array[]::text[]) into v_dazu
  from unnest(v_neu) as t(x) where not (x = any (v_alt));

  select coalesce(array_agg(x order by x), array[]::text[]) into v_weg
  from unnest(v_alt) as t(x) where not (x = any (v_neu));

  -- Kein Unterschied, kein Vorgang.
  if cardinality(v_dazu) = 0 and cardinality(v_weg) = 0 then
    return;
  end if;

  if 'owner' = any (v_weg)
     and not app.other_active_owners_exist(v_org, v_user) then
    raise exception 'last_owner_required' using errcode = '22023';
  end if;

  delete from public.user_roles ur
   where ur.user_id = v_user
     and ur.organization_id = v_org
     and ur.role_key = any (v_weg);

  insert into public.user_roles (user_id, organization_id, role_key, created_by)
  select v_user, v_org, x, v_actor
  from unnest(v_dazu) as t(x);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.roles_changed', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'added', to_jsonb(v_dazu), 'removed', to_jsonb(v_weg))
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- set_staff_account_active - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_account_active(p_staff_member_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_user  uuid;
  v_alt   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_accounts() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, case when p_active is false then 'staff_account.locked' else 'staff_account.unlocked' end, 'not allowed to manage accounts');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  if p_active is null then
    raise exception 'unknown account state' using errcode = '22023';
  end if;

  select up.id, up.is_active into v_user, v_alt
  from public.staff_members sm
  join public.user_profiles up
    on up.person_id = sm.person_id
   and up.organization_id = sm.organization_id
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update of up;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  -- Kein Wechsel, kein Vorgang.
  if v_alt = p_active then
    return;
  end if;

  if not p_active then
    if v_user = v_actor then
      raise exception 'cannot_lock_own_account' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_user and ur.organization_id = v_org and ur.role_key = 'owner'
    ) and not app.other_active_owners_exist(v_org, v_user) then
      raise exception 'last_owner_required' using errcode = '22023';
    end if;
  end if;

  update public.user_profiles
     set is_active = p_active
   where id = v_user
     and organization_id = v_org;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor,
    case when p_active then 'staff_account.unlocked' else 'staff_account.locked' end,
    'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- request_staff_password_reset - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_staff_password_reset(p_staff_member_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_user  uuid;
  v_email text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_accounts() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'staff_account.password_reset_requested', 'not allowed to manage accounts');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  select up.id into v_user
  from public.staff_members sm
  join public.user_profiles up
    on up.person_id = sm.person_id
   and up.organization_id = sm.organization_id
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  select au.email into v_email
  from auth.users au
  where au.id = v_user;

  if v_email is null or v_email = '' then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.password_reset_requested', 'staff_member',
    p_staff_member_id, 'success', jsonb_build_object('surface', 'web')
  );

  return v_email;
end;
$function$;

-- -----------------------------------------------------------------------------
-- place_legal_hold - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_legal_hold(p_patient_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_hold  uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'legal_hold.placed', 'not allowed to manage legal holds');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a legal hold needs a reason' using errcode = '22023';
  end if;

  -- Zielakte ausschliesslich in der Organisation des Aufrufers suchen.
  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if app.under_legal_hold(v_org, 'patient', p_patient_id) then
    raise exception 'patient is already under legal hold' using errcode = '22023';
  end if;

  insert into public.legal_holds (
    organization_id, subject_type, subject_id, reason, placed_by
  )
  values (v_org, 'patient', p_patient_id, btrim(p_reason), v_actor)
  returning id into v_hold;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'legal_hold.placed', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'hold_id', v_hold)
  );

  return v_hold;
end;
$function$;

-- -----------------------------------------------------------------------------
-- release_legal_hold - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_legal_hold(p_hold_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_subject uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'legal_hold.released', 'not allowed to manage legal holds');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  select h.subject_id into v_subject
  from public.legal_holds h
  where h.id = p_hold_id
    and h.organization_id = v_org
    and h.released_at is null
  for update;

  if not found then
    raise exception 'legal hold not found' using errcode = 'P0002';
  end if;

  update public.legal_holds
     set released_at = now(),
         released_by = v_actor
   where id = p_hold_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'legal_hold.released', 'patient', v_subject, 'success',
    jsonb_build_object('surface', 'web', 'hold_id', p_hold_id)
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- claim_storage_deletion_order - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_storage_deletion_order(p_order_id uuid)
 RETURNS TABLE(bucket_id text, object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_auftrag record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'storage_deletion.claimed', 'not allowed to execute deletion orders');
    return;
  end if;

  select o.* into v_auftrag
  from public.storage_deletion_orders o
  where o.id = p_order_id
    and o.organization_id = app.current_organization_id()
    and o.receipted_at is null;

  if not found then
    raise exception 'deletion order not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_auftrag.organization_id, v_actor, 'storage_deletion.claimed', 'storage_deletion_order',
    p_order_id, 'success',
    jsonb_build_object('surface', 'web', 'bucket_id', v_auftrag.bucket_id)
  );

  delete from public.patient_file_access_grants g
   where g.organization_id = v_auftrag.organization_id
     and g.expires_at <= now();

  insert into public.patient_file_access_grants (
    organization_id, user_id, deletion_order_id, expires_at
  )
  values (
    v_auftrag.organization_id, v_actor, p_order_id, now() + app.patient_file_access_grant_ttl()
  );

  return query select v_auftrag.bucket_id, v_auftrag.object_key;
end;
$function$;

-- -----------------------------------------------------------------------------
-- receipt_storage_deletion_order - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipt_storage_deletion_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_auftrag record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'storage_deletion.receipted', 'not allowed to execute deletion orders');
    return;
  end if;

  select o.* into v_auftrag
  from public.storage_deletion_orders o
  where o.id = p_order_id
    and o.organization_id = app.current_organization_id()
    and o.receipted_at is null
  for update;

  if not found then
    raise exception 'deletion order not accessible' using errcode = '42501';
  end if;

  if exists (
    select 1
    from storage.objects s
    where s.bucket_id = v_auftrag.bucket_id
      and s.name = v_auftrag.object_key
  ) then
    raise exception 'object is still present' using errcode = '22023';
  end if;

  update public.storage_deletion_orders
     set receipted_at = now(),
         receipted_by = v_actor
   where id = p_order_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_auftrag.organization_id, v_actor, 'storage_deletion.receipted', 'storage_deletion_order',
    p_order_id, 'success',
    jsonb_build_object('surface', 'web', 'bucket_id', v_auftrag.bucket_id)
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- order_orphaned_object_deletion - unveraendert bis auf den Ausgang bei fehlender Rolle.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_orphaned_object_deletion()
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

  -- G6c: Rolle und Organisation getrennt pruefen. Ohne Organisation bleibt es
  -- bei der Ausnahme; ohne Rolle wird bestaetigt abgewiesen (record_denied_write
  -- bricht selbst ab, wenn die Organisation fehlt).
  if not app.can_execute_storage_deletion() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(auth.uid(), 'storage_deletion.ordered', 'not allowed to order deletions');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to order deletions' using errcode = '42501';
  end if;

  insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
  select v_org, o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket()
    and o.name like v_org::text || '/%'
    and not exists (
      select 1 from public.patient_files f where f.object_key = o.name
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$function$;
