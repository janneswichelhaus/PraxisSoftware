-- =============================================================================
-- Abgewiesene Zugriffe auf die Nachweise der Praxisleitung (OPS-004, ADR-010)
--
-- Bis hierher trug public.audit_log.outcome nur 'success'. Der Grund steht
-- seit dem Audit-Lesepfad in docs/DEVELOPMENT.md: Eine Funktion, die mit einer
-- Ausnahme abweist, rollt ihren eigenen Protokolleintrag mit zurueck. Eine
-- autonome Transaktion gibt es in PostgreSQL nicht ohne Erweiterung.
--
-- Fuer die beiden Lesepfade, die allein owner offenstehen, ist die Loesung
-- deshalb keine Erweiterung, sondern ein anderer Ausgang: Ein angemeldetes
-- Konto ohne owner-Rolle bekommt KEINE Ausnahme mehr, sondern null Zeilen -
-- und der Versuch steht mit outcome = 'denied' im Auditlog. Gesperrt bleibt
-- der Zugriff genauso; neu ist, dass er nachweisbar ist. Gerade diese beiden
-- Pfade erreicht die Oberflaeche fuer Nicht-owner nie - ein Aufruf von dort
-- ist ein Aufruf an der Anwendung vorbei, und genau den will das Log sehen.
--
-- Unveraendert mit Ausnahme:
--   * ohne Sitzung ('not authenticated') - es gibt niemanden zuzuordnen;
--   * ohne Organisation - organization_id ist Pflicht, und ein Konto ohne
--     Profil gehoert zu keiner Praxis, in deren Log der Versuch stuende.
--
-- Die uebrigen Abweisungen der Anwendung (rund 80 Stellen, 'not allowed to
-- ...') bleiben bei der Ausnahme; sie stehen als eigene Aufgabe in
-- docs/development/ROADMAP.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog: deletion_runs.read
--
-- Das erfolgreiche Lesen der Loeschlaeufe bleibt ohne Eintrag (dort stehen nur
-- Zahlen ueber bereits geloeschte Datensaetze, siehe list_deletion_runs). Die
-- Aktion kommt deshalb nur mit outcome = 'denied' vor.
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
    'deletion_runs.read'
  ));

-- -----------------------------------------------------------------------------
-- app.record_denied_owner_read
--
-- Die eine Stelle, die einen abgewiesenen Leseversuch schreibt. Liefert die
-- Organisation zurueck, in deren Log er steht - oder bricht ab wie bisher,
-- wenn es keine gibt. Liegt in app, damit sie fuer keine Anwendungsrolle
-- aufrufbar ist: Ein Aufrufer koennte sonst beliebig 'denied'-Zeilen erzeugen.
-- -----------------------------------------------------------------------------
create function app.record_denied_owner_read(
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
  v_org uuid;
begin
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception '%', p_message using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, p_actor, p_action, 'organization', v_org, 'denied',
    jsonb_build_object('surface', 'api', 'reason', 'role')
  );
end;
$$;

comment on function app.record_denied_owner_read(uuid, text, text) is
  'Schreibt einen abgewiesenen Leseversuch auf einen owner-Pfad ins Auditlog (OPS-004, ADR-010). Nur fuer list_audit_events und list_deletion_runs.';

revoke all on function app.record_denied_owner_read(uuid, text, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- list_audit_events - unveraendert seit DOK-004 bis auf den Ausgang bei
-- fehlender owner-Rolle.
-- -----------------------------------------------------------------------------
create or replace function public.list_audit_events(
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_actor_user_id  uuid        default null,
  p_action         text        default null,
  p_limit          integer     default 50,
  p_offset         integer     default 0
)
returns table (
  id                 uuid,
  occurred_at        timestamptz,
  actor_user_id      uuid,
  actor_kind         text,
  actor_display_name text,
  action             text,
  subject_type       text,
  subject_id         uuid,
  outcome            text,
  total_count        bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_limit  integer;
  v_offset integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Rolle und Organisation werden hier geprueft, weil SECURITY DEFINER die
  -- RLS umgeht. Ohne diese Pruefung waere die Funktion ein offener Kanal.
  -- OPS-004: Abgewiesen wird mit null Zeilen und einem Auditeintrag, nicht
  -- mit einer Ausnahme - die rollte den Eintrag mit zurueck.
  if not app.has_any_role('owner') then
    perform app.record_denied_owner_read(v_actor, 'audit_log.read', 'audit log access denied');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'audit log access denied' using errcode = '42501';
  end if;

  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    a.id,
    a.occurred_at,
    a.actor_user_id,
    a.actor_kind,
    up.display_name,
    a.action,
    a.subject_type,
    a.subject_id,
    a.outcome,
    count(*) over () as total_count
  from public.audit_log a
  left join public.user_profiles up
    on up.id = a.actor_user_id
   and up.organization_id = v_org
  where a.organization_id = v_org
    and (p_from is null          or a.occurred_at >= p_from)
    and (p_to is null            or a.occurred_at <  p_to)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_action is null        or a.action = p_action)
  order by a.occurred_at desc, a.id desc
  limit v_limit offset v_offset;

  -- Der Zugriff auf das Auditlog ist selbst ein Auditereignis (ADR-010).
  -- Bewusst NACH der Abfrage, damit der eigene Lesevorgang nicht das Ergebnis
  -- verfaelscht, das er gerade liefert.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'audit_log.read', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- list_deletion_runs - unveraendert seit LOE-002a bis auf denselben Ausgang.
-- -----------------------------------------------------------------------------
create or replace function public.list_deletion_runs(p_limit integer default 50)
returns table (
  run_id          uuid,
  deleted_at      timestamptz,
  retention_class text,
  target_table    text,
  record_count    bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_limit integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Derselbe Schnitt wie beim Auditlog: das Loeschjournal ist ein Nachweis der
  -- Praxisleitung (ADR-010, PROJECT_PRINCIPLES.md 4.1). Abgewiesen wird wie
  -- dort mit null Zeilen und einem Auditeintrag (OPS-004).
  if not app.has_any_role('owner') then
    perform app.record_denied_owner_read(v_actor, 'deletion_runs.read', 'deletion journal access denied');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'deletion journal access denied' using errcode = '42501';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  return query
    select j.run_id,
           max(j.deleted_at) as deleted_at,
           j.retention_class,
           j.target_table,
           count(*) as record_count
    from public.deletion_journal j
    where j.organization_id = v_org
    group by j.run_id, j.retention_class, j.target_table
    order by max(j.deleted_at) desc, j.retention_class, j.target_table
    limit v_limit;
end;
$$;

comment on column public.audit_log.outcome is
  'Ergebnis des protokollierten Vorgangs. denied schreiben seit OPS-004 list_audit_events und list_deletion_runs; die uebrigen Abweisungen rollen ihren Eintrag weiter mit zurueck (ROADMAP G6a).';
