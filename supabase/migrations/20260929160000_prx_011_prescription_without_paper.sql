-- =============================================================================
-- PRX-011: Verordnung ohne Papier (PRX-EPIC-003)
--
-- Jannes 2026-09-28: Die Therapeut:in fotografiert die Verordnung am Termin mit
-- der Kamera der Anwendung; daraus entsteht ein offener Punkt "Verordnung zu
-- erfassen" in der Bueroliste. Office oeffnet "Grundlage erfassen" mit dem Foto
-- daneben und tippt ab. Beim Speichern haengt der Scan an der neuen Grundlage.
--
--   * ANN-141: Ein Verordnungsscan darf **vorlaeufig** an der Patient:in haengen, bis er
--     einer Grundlage zugeordnet ist. ADR-017 Punkt 10 nennt die Patient:in als
--     Bezugsdatensatz; Frist und Klasse sind dieselben (patientenakte), die
--     Datei faellt mit der Akte. Solange `treatment_basis_id` leer ist, ist der
--     Scan ein offener Punkt - es gibt dafuer keine eigene Spalte und keinen
--     zweiten Zustand, der auseinanderlaufen koennte.
--   * Zuordnen geht nur in eine Richtung und nur einmal: ein offener Scan an
--     eine Grundlage **derselben** Patient:in (assign_prescription_scan). Wer
--     falsch zugeordnet hat, loescht den Scan und nimmt ihn neu auf - wie bei
--     jeder Datei (ADR-017 Punkt 8, keine Aenderung am Objekt).
--   * Lesen der offenen Scans und Zuordnen folgen dem Schreibrecht an der
--     Grundlage (app.can_write_treatment_bases, seit PRX-010 mit office).
--     Die Liste zeigt Name, Tag und aufnehmende Person - kein Bild, keinen
--     Verweis (ADR-017 Punkt 15); das Foto oeffnet erst das Formular, auf Tipp.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auditkatalog: das Zuordnen ist ein Wechsel des Bezugs
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text])));

-- -----------------------------------------------------------------------------
-- 2. Der Scan darf vorlaeufig an der Patient:in haengen
-- -----------------------------------------------------------------------------
alter table public.patient_files
  drop constraint patient_files_scan_belongs_to_treatment_basis;

-- ANN-141: Der Objektschluessel war eine berechnete Spalte aus
-- coalesce(treatment_basis_id, patient_id). Mit dem Zuordnen aendert sich die
-- Grundlage - und eine berechnete Spalte haette den Schluessel mitgezogen,
-- waehrend das Objekt unter dem alten Namen liegt (ADR-017 Punkt 8: es wird
-- nicht verschoben). Der Schluessel wird deshalb beim Anlegen einmal gesetzt
-- und danach eingefroren. Bestandszeilen behalten ihren Wert; neu gesetzt
-- wird er wie bisher allein aus Kennungen (Punkt 5, ANN-052) - vom Trigger,
-- nie vom Aufrufer.
alter table public.patient_files alter column object_key drop expression;

create function app.set_patient_file_object_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.object_key := new.organization_id::text || '/'
                      || coalesce(new.treatment_basis_id, new.patient_id)::text || '/'
                      || new.id::text;
  elsif new.object_key is distinct from old.object_key then
    raise exception 'the object key of a patient file cannot be changed' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.set_patient_file_object_key() from public, anon, authenticated;

create trigger patient_files_object_key
  before insert or update on public.patient_files
  for each row execute function app.set_patient_file_object_key();

comment on column public.patient_files.object_key is
  'Objektschluessel nach ADR-017 Punkt 5 - nur Kennungen, keine Endung, kein Name. Beim Anlegen vom Trigger gesetzt (organization/grundlage-oder-patient/datei) und danach unveraenderlich (PRX-011): Das Zuordnen eines Scans aendert den Bezug, nicht den Ort des Objekts. Verlaesst die Datenbank ausschliesslich ueber prepare_patient_file_upload und issue_patient_file_link (ANN-052).';

comment on column public.patient_files.treatment_basis_id is
  'Die Behandlungsgrundlage, an der die Datei haengt (ADR-017 Punkt 10). Leer bei einem Verordnungsscan heisst: noch zu erfassen (PRX-011) - ein offener Punkt der Bueroliste, bis assign_prescription_scan ihn zuordnet.';

create index patient_files_open_scans_idx
  on public.patient_files (organization_id, confirmed_at)
  where document_type = 'verordnungsscan' and treatment_basis_id is null and status = 'ready';

-- -----------------------------------------------------------------------------
-- 3. list_open_prescription_scans: die Verordnungen zu erfassen
-- -----------------------------------------------------------------------------
create function public.list_open_prescription_scans()
returns table (
  file_id             uuid,
  patient_id          uuid,
  patient_given_name  text,
  patient_family_name text,
  uploaded_at         timestamptz,
  uploaded_by_name    text
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

  -- SECURITY DEFINER umgeht RLS; die Rolle prueft die Funktion selbst.
  if not app.can_write_treatment_bases() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read open prescription scans');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read open prescription scans' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.patient_id,
           pe.given_name,
           pe.family_name,
           f.confirmed_at,
           nullif(btrim(concat_ws(' ', upe.given_name, upe.family_name)), '')
    from public.patient_files f
    join public.patients pa on pa.id = f.patient_id and pa.organization_id = f.organization_id
    join public.persons pe on pe.id = pa.person_id
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons upe on upe.id = up.person_id
    where f.organization_id = v_org
      and f.document_type = 'verordnungsscan'
      and f.treatment_basis_id is null
      and f.status = 'ready'
    order by f.confirmed_at asc, f.id;
end;
$$;

comment on function public.list_open_prescription_scans() is
  'Verordnungsscans, die noch keiner Behandlungsgrundlage zugeordnet sind (PRX-011): Name, Tag, aufnehmende Person - kein Verweis auf das Bild (ADR-017 Punkt 15). Wer Grundlagen schreibt; ein abgewiesener Versuch wird als treatment_bases.read protokolliert. Das Lesen der Liste selbst ist wie die Kartei nicht auditiert; das Oeffnen des Fotos ist es (patient_file.link_issued).';

revoke all on function public.list_open_prescription_scans() from public, anon;
grant execute on function public.list_open_prescription_scans() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. assign_prescription_scan: den offenen Scan an die Grundlage haengen
-- -----------------------------------------------------------------------------
create function public.assign_prescription_scan(
  p_file_id            uuid,
  p_treatment_basis_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = v_org
    and f.status = 'ready'
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if v_datei.document_type <> 'verordnungsscan' then
    raise exception 'only a prescription scan can be assigned' using errcode = '22023';
  end if;

  if v_datei.treatment_basis_id is not null then
    raise exception 'prescription scan is already assigned' using errcode = '55000';
  end if;

  -- Nur an eine Grundlage derselben Patient:in in derselben Praxis: sonst
  -- traege der Scan eine fremde Akte.
  if not exists (
    select 1
    from public.treatment_bases tb
    where tb.id = p_treatment_basis_id
      and tb.organization_id = v_org
      and tb.patient_id = v_datei.patient_id
  ) then
    raise exception 'treatment basis not accessible' using errcode = '42501';
  end if;

  update public.patient_files
     set treatment_basis_id = p_treatment_basis_id
   where id = p_file_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_file.assigned', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'treatment_basis_id', p_treatment_basis_id
    )
  );
end;
$$;

comment on function public.assign_prescription_scan(uuid, uuid) is
  'Haengt einen offenen Verordnungsscan an eine Grundlage derselben Patient:in (PRX-011) und protokolliert patient_file.assigned (ADR-010). Nur einmal, nur in diese Richtung; wer Grundlagen schreibt (ANN-011).';

revoke all on function public.assign_prescription_scan(uuid, uuid) from public, anon;
grant execute on function public.assign_prescription_scan(uuid, uuid) to authenticated;
