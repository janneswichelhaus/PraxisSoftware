-- =============================================================================
-- TRN-005: Die Trainingsgrundlage wird bedienbar (TRN-EPIC-002)
--
-- CAL-025 hat die Klammer gebaut (`training_bases`, ADR-022 Punkt 5) und
-- ausdruecklich keinen Schreibweg: "Schreibwege entstehen mit dem
-- Trainingsbereich, nicht auf Vorrat". Hier sind sie:
--
--   create_training_basis     eine Vereinbarung anlegen
--   conclude_training_basis   abschliessen - keine neuen Termine daran
--   reopen_training_basis     wieder oeffnen
--   list_training_bases       Vereinbarungen mit Terminzahl
--
-- Dazu ein Nachtrag an reapply_deletion_journal: Die Wiederanwendung nach
-- einem Restore kannte `training_bases` nicht (Abschnitt 5).
--
-- WER SCHREIBT: dieselben Rollen wie am Verhaeltnis (ANN-172, ANN-176) -
-- die Klammer sagt weniger ueber eine Person als das Verhaeltnis selbst.
--
-- KEINE DECKUNGSREGEL (ANN-179, CAL-025 Festlegung 3). Die vereinbarte Anzahl
-- ist eine Anzeige ("7 von 10"), keine Sperre: Was im Training abgerechnet
-- wird, entscheidet TRN-EPIC-003, und eine Zaehlung ohne Abrechnung waere ein
-- Feature auf Vorrat (ADR-014). PFLICHT IST DAS VERHAELTNIS, NICHT DIE
-- KLAMMER: Der Termin bleibt ohne Vereinbarung moeglich (Punkt 5).
--
-- PROTOKOLL auf dem Niveau der Akte (ADR-021 Punkt 8): jede Aenderung mit
-- eigener Aktion; die Liste gehoert zur protokollierten Detailansicht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auditkatalog
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'treatment_basis',
    'text_snippet',
    'user_account',
    'patient_file',
    'storage_deletion_order',
    'service_catalog_version',
    'invoice_recipient',
    'invoice',
    'payment',
    'questionnaire_response',
    'patient_course_event',
    'therapy_report',
    'waitlist_entry',
    'territory',
    'task',
    'training_relationship',
    'training_basis'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text])));


-- -----------------------------------------------------------------------------
-- 2. create_training_basis - eine Vereinbarung anlegen
--
-- Nur an einem laufenden Verhaeltnis. Der Beginn ist ein Kalendertag in der
-- Zeitzone der Praxis; ohne Angabe heute. Die vereinbarte Anzahl ist nullbar
-- (CAL-025): "zehn Einheiten" oder "laufend ohne Zahl".
-- -----------------------------------------------------------------------------
create function public.create_training_basis(
  p_relationship_id uuid,
  p_started_on      date default null,
  p_agreed_quantity integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_status text;
  v_id     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_basis.created', 'not allowed to manage training bases');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training bases' using errcode = '42501';
  end if;

  select t.status into v_status
  from public.training_relationships t
  where t.id = p_relationship_id
    and t.organization_id = v_org;

  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if v_status <> 'active' then
    raise exception 'training relationship is not active' using errcode = '22023';
  end if;

  if p_agreed_quantity is not null and p_agreed_quantity not between 1 and 200 then
    raise exception 'agreed quantity must be between 1 and 200' using errcode = '22023';
  end if;

  insert into public.training_bases (
    organization_id, training_relationship_id, status, started_on, agreed_quantity, created_by
  )
  values (
    v_org, p_relationship_id, 'active',
    coalesce(p_started_on, app.training_today(v_org)), p_agreed_quantity, v_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_basis.created', 'training_basis', v_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'training_relationship_id', p_relationship_id,
      'agreed_quantity', p_agreed_quantity
    )
  );

  return v_id;
end;
$$;

comment on function public.create_training_basis(uuid, date, integer) is
  'TRN-005: legt eine Trainingsgrundlage (Vereinbarung) an einem laufenden Trainingsverhaeltnis an (ADR-022 Punkt 5). owner, trainer, office; protokolliert training_basis.created, abgewiesen mit denied und HTTP 403.';
revoke all on function public.create_training_basis(uuid, date, integer) from public, anon;
grant execute on function public.create_training_basis(uuid, date, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Abschliessen und wieder oeffnen
--
-- Ein Status, zwei Wege - wie Vertragsende und Wiederaufnahme am Verhaeltnis
-- (TRN-001). Wieder geoeffnet wird nur an einem laufenden Verhaeltnis. Termine
-- an einer abgeschlossenen Vereinbarung bleiben, wo sie sind: Abschliessen
-- sagt "keine neuen", nicht "die alten waren falsch".
-- -----------------------------------------------------------------------------
create function app.set_training_basis_status(
  p_basis_id uuid,
  p_status   text,
  p_action   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    record;
begin
  v_actor := auth.uid();
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training bases' using errcode = '42501';
  end if;

  select b.id, b.status, b.training_relationship_id, t.status as relationship_status
    into v_alt
  from public.training_bases b
  join public.training_relationships t on t.id = b.training_relationship_id
  where b.id = p_basis_id
    and b.organization_id = v_org
  for update of b;

  if not found then
    raise exception 'training basis not found' using errcode = 'P0002';
  end if;

  if v_alt.status = p_status then
    return p_basis_id;
  end if;

  if p_status = 'active' and v_alt.relationship_status <> 'active' then
    raise exception 'training relationship is not active' using errcode = '22023';
  end if;

  update public.training_bases
     set status     = p_status,
         updated_at = now(),
         updated_by = v_actor
   where id = p_basis_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, p_action, 'training_basis', p_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'training_relationship_id', v_alt.training_relationship_id)
  );

  return p_basis_id;
end;
$$;

revoke all on function app.set_training_basis_status(uuid, text, text) from public, anon, authenticated;

create function public.conclude_training_basis(p_basis_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(auth.uid(), 'training_basis.concluded', 'not allowed to manage training bases');
    return null;
  end if;
  return app.set_training_basis_status(p_basis_id, 'concluded', 'training_basis.concluded');
end;
$$;

comment on function public.conclude_training_basis(uuid) is
  'TRN-005: schliesst eine Trainingsgrundlage ab - keine neuen Termine daran. owner, trainer, office; protokolliert training_basis.concluded.';
revoke all on function public.conclude_training_basis(uuid) from public, anon;
grant execute on function public.conclude_training_basis(uuid) to authenticated;

create function public.reopen_training_basis(p_basis_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(auth.uid(), 'training_basis.reopened', 'not allowed to manage training bases');
    return null;
  end if;
  return app.set_training_basis_status(p_basis_id, 'active', 'training_basis.reopened');
end;
$$;

comment on function public.reopen_training_basis(uuid) is
  'TRN-005: oeffnet eine abgeschlossene Trainingsgrundlage wieder, nur an einem laufenden Verhaeltnis. owner, trainer, office; protokolliert training_basis.reopened.';
revoke all on function public.reopen_training_basis(uuid) from public, anon;
grant execute on function public.reopen_training_basis(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. list_training_bases - die Vereinbarungen einer Trainingskund:in
--
-- Gehoert zur Detailansicht, deren Oeffnen protokolliert ist
-- (training_relationship.viewed, ANN-175); sie selbst nicht. Die Zahl der
-- Termine zaehlt alles ausser Abgesagtem und ist eine Anzeige ("n von m"),
-- keine Sperre (ANN-179).
-- -----------------------------------------------------------------------------
create function public.list_training_bases(p_relationship_id uuid)
returns table (
  id                uuid,
  status            text,
  started_on        date,
  agreed_quantity   integer,
  appointment_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'training_relationships.read', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  return query
    select b.id, b.status, b.started_on, b.agreed_quantity,
           (select count(*)::integer
              from public.appointments a
             where a.training_basis_id = b.id
               and a.status <> 'cancelled')
    from public.training_bases b
    where b.training_relationship_id = p_relationship_id
      and b.organization_id = v_org
    order by (b.status = 'active') desc, b.started_on desc, b.created_at desc;
end;
$$;

comment on function public.list_training_bases(uuid) is
  'TRN-005: Vereinbarungen einer Trainingskund:in mit Terminzahl (ohne Abgesagte). owner, trainer, office; abgewiesen mit denied unter training_relationships.read.';
revoke all on function public.list_training_bases(uuid) from public, anon;
grant execute on function public.list_training_bases(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Die Wiederanwendung nach einem Restore kennt die Vereinbarung
--
-- Der Loeschlauf schreibt `training_bases` seit CAL-026 ins Journal
-- (app.delete_training_relationship), die Wiederanwendung kannte die Tabelle
-- aber nicht und verweigerte den Dienst ("deletion journal references tables
-- without a reapply order"). Aufgefallen ist das erst jetzt, weil es bis
-- TRN-005 keinen Weg gab, eine Vereinbarung anzulegen. Rumpf sonst
-- unveraendert aus 20260929190000_prx_014_call_list.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$function$;
