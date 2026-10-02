-- =============================================================================
-- Pruefung am Server: Spalten, Schalter, Ergebnis (ABN-024, BEF-105;
-- ADR-017 Fassung 3, Abschnitt I, Punkte 49 bis 52)
--
-- Phase (c) bekommt eine Pruefung am INHALT: Typ an der Signatur, SHA-256
-- nachgerechnet, bei JPEG und PNG die Metadatenfreiheit (Punkt 49). Sie laeuft
-- in der Edge Function patient-file-verify (Punkt 50, ABN-025); hier steht,
-- was die Datenbank davon fuehrt:
--
--   * DAS ERGEBNIS an der Zeile: verified_at und je Pruefung ein Ergebnis.
--     verified_at leer heisst "nicht serverseitig geprueft" (Punkt 51) - so
--     zeigen es Dateiliste und Fotoliste.
--   * DER SCHALTER (Punkt 51, ANN-053 Fassung 2): app.patient_file_verification_required().
--     Aus, bis OPS-001 die Edge Runtime freigibt: Die Datei wird mit der
--     Bestaetigung ready und bleibt "nicht serverseitig geprueft". An: Die
--     Bestaetigung laesst sie pending (confirmation_requested_at), ready wird
--     sie erst mit einem bestandenen Ergebnis. Eine Stelle, ein benannter
--     Schritt in den Go-live-Vorbedingungen (ADR-007 Punkt 5).
--   * EIN BEFUND VERWIRFT (Punkt 52): Die Zeile faellt, der vorhandene Trigger
--     schreibt den Loeschauftrag fuer das Objekt, das Protokoll erhaelt
--     patient_file.verification_failed. Keine Bytes werden umgeschrieben.
--
-- Nur der Dienst schreibt das Ergebnis: record_patient_file_verification und
-- patient_file_for_verification sind ausschliesslich fuer service_role, den
-- Schluessel, den nur die Function hat (Punkt 50, ADR-017 Punkt 11).
-- =============================================================================

alter table public.patient_files
  add column verified_at               timestamptz,
  add column content_type_verified     boolean,
  add column checksum_verified         boolean,
  add column metadata_verified         boolean,
  add column confirmation_requested_at timestamptz,
  -- Ein Ergebnis gibt es ganz oder gar nicht; Metadaten prueft der Dienst nur
  -- bei Bildern (Punkt 49), bei PDF bleibt das Feld leer.
  add constraint patient_files_verification_complete check (
    (verified_at is null)
      = (content_type_verified is null and checksum_verified is null)
    and (verified_at is not null or metadata_verified is null)
  ),
  -- Eine gespeicherte Zeile ist nie ein Befund: Der verwirft sie (Punkt 52).
  add constraint patient_files_verification_passed check (
    verified_at is null
    or (content_type_verified and checksum_verified and coalesce(metadata_verified, true))
  );

comment on column public.patient_files.verified_at is
  'Wann die Pruefung am Server (Edge Function patient-file-verify) die Datei bestanden hat. Leer: nicht serverseitig geprueft (ADR-017 Punkte 49 und 51).';
comment on column public.patient_files.content_type_verified is
  'Typ an der Signatur der ersten Bytes passt zu Allowlist und Ankuendigung (ADR-017 Punkt 49 Nr. 1).';
comment on column public.patient_files.checksum_verified is
  'SHA-256 ueber die abgelegten Bytes passt zur angekuendigten Pruefsumme (ADR-017 Punkt 49 Nr. 2).';
comment on column public.patient_files.metadata_verified is
  'JPEG und PNG: keine Metadaten ausserhalb der Erlaubnisliste (ADR-017 Punkt 49 Nr. 3, ANN-125). Leer bei PDF.';
comment on column public.patient_files.confirmation_requested_at is
  'Nur bei scharfer Pruefung: wann die Bestaetigung (Phase c) bestanden war; ready wird die Datei erst mit dem Ergebnis (ADR-017 Punkt 51).';

-- Ein neues Auditereignis (Punkt 52): verworfen nach Befund der Pruefung.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text, 'platform_access.invited'::text, 'platform_access.invitation_sent'::text, 'platform_access.activated'::text, 'platform_access.password_reset'::text, 'platform_access.locked'::text, 'platform_access.unlocked'::text, 'platform_access.revoked'::text, 'platform_accesses.read'::text, 'platform_access.companion_declined'::text, 'platform_representation.read'::text, 'appointment.fee_waived'::text, 'payment.offset'::text, 'treatment_draft_findings.saved'::text, 'treatment_draft_findings.viewed'::text, 'waitlist_entry.reviewed'::text, 'training_protocol.addendum_created'::text, 'patient_file.verification_failed'::text])));

-- -----------------------------------------------------------------------------
-- Der Schalter (Punkt 51)
-- -----------------------------------------------------------------------------
create function app.patient_file_verification_required()
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- ANN-053 Fassung 2: aus bis OPS-001. Scharfschalten ist eine Migration,
  -- die diese eine Zeile auf true setzt - ein benannter Schritt vor echten
  -- Dateien, nicht eine Variable, die man vergessen kann.
  select false
$$;

comment on function app.patient_file_verification_required() is
  'Schalter der Pruefung am Server (ADR-017 Punkt 51, ANN-053): true heisst, eine Datei wird erst mit bestandener Pruefung ready. Aus bis OPS-001; Go-live-Vorbedingung (ADR-007 Punkt 5).';

grant execute on function app.patient_file_verification_required() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Was der Dienst zum Pruefen braucht - und nur er
-- -----------------------------------------------------------------------------
create function public.patient_file_for_verification(p_file_id uuid, p_user_id uuid)
returns table (
  bucket_id       text,
  object_key      text,
  mime_type       text,
  byte_size       bigint,
  checksum_sha256 text,
  already_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Ausgeloest wird die Pruefung von der angemeldeten Person, die hochlaedt;
  -- die Function prueft deren Sitzung und gibt die Kennung weiter. Gefunden
  -- wird nur eine Datei ihrer Organisation, die bestaetigt ist (ready oder,
  -- bei scharfer Pruefung, pending mit Bestaetigung).
  select app.patient_file_bucket_for(f.document_type),
         f.object_key,
         f.mime_type,
         f.byte_size,
         f.checksum_sha256,
         f.verified_at is not null
  from public.patient_files f
  join public.user_profiles up
    on up.id = p_user_id
   and up.organization_id = f.organization_id
   and up.is_active
  where f.id = p_file_id
    and (f.status = 'ready' or f.confirmation_requested_at is not null)
$$;

comment on function public.patient_file_for_verification(uuid, uuid) is
  'Nur fuer den Dienst patient-file-verify (service_role): Bucket, Objektschluessel, Ankuendigung und Pruefstand einer bestaetigten Datei aus der Organisation der ausloesenden Person (ADR-017 Punkt 50). Kein Name, kein Personenbezug.';

revoke all on function public.patient_file_for_verification(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.patient_file_for_verification(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Das Ergebnis (Punkte 49, 51, 52)
-- -----------------------------------------------------------------------------
create function public.record_patient_file_verification(
  p_file_id          uuid,
  p_content_type_ok  boolean,
  p_checksum_ok      boolean,
  p_metadata_ok      boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datei record;
begin
  if p_content_type_ok is null or p_checksum_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
  for update;

  if not found then
    return 'not_found';
  end if;

  -- Einmal geprueft bleibt geprueft: Ein zweiter Lauf aendert nichts.
  if v_datei.verified_at is not null then
    return 'already_verified';
  end if;

  if v_datei.status <> 'ready' and v_datei.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;

  -- Bilder bekommen ein Metadatenergebnis, PDF nicht (Punkt 49).
  if (v_datei.mime_type in ('image/jpeg', 'image/png')) <> (p_metadata_ok is not null) then
    raise exception 'metadata result does not match the media type' using errcode = '22023';
  end if;

  if p_content_type_ok and p_checksum_ok and coalesce(p_metadata_ok, true) then
    update public.patient_files
       set verified_at           = now(),
           content_type_verified = true,
           checksum_verified     = true,
           metadata_verified     = p_metadata_ok,
           status                = 'ready',
           confirmed_at          = coalesce(confirmed_at, now())
     where id = p_file_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heisst verwerfen. Das Protokoll nennt, welche Pruefung
  -- anschlug - nie Name, Schluessel oder Inhalt (ADR-010 Punkt 3).
  -- ANN-009: ein Ereignis ohne handelnden Account (der Dienst) ist 'system'.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, null, 'system', 'patient_file.verification_failed', 'patient_file', p_file_id,
    'denied',
    jsonb_build_object(
      'surface', 'edge_function',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type,
      'content_type_ok', p_content_type_ok,
      'checksum_ok', p_checksum_ok,
      'metadata_ok', p_metadata_ok,
      'was_ready', v_datei.status = 'ready'
    )
  );

  -- Der Trigger an patient_files schreibt den Loeschauftrag fuer das Objekt.
  delete from public.patient_files where id = p_file_id;
  return 'rejected';
end;
$$;

comment on function public.record_patient_file_verification(uuid, boolean, boolean, boolean) is
  'Nur fuer den Dienst patient-file-verify (service_role): traegt das Ergebnis der Pruefung am Inhalt ein. Bestanden: verified_at, bei scharfer Pruefung ready. Befund: Zeile verworfen, Loeschauftrag fuer das Objekt, patient_file.verification_failed (ADR-017 Punkte 49 bis 52).';

revoke all on function public.record_patient_file_verification(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_patient_file_verification(uuid, boolean, boolean, boolean)
  to service_role;

-- -----------------------------------------------------------------------------
-- Uebernommen und geaendert: Bestaetigung (Schalter) sowie Datei- und
-- Fotoliste (mit verified_at fuer das Kennzeichen).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_patient_file_upload(p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_datei    record;
  v_metadata jsonb;
  v_groesse  bigint;
  v_mime     text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to confirm this file' using errcode = '42501';
  end if;

  if v_datei.status <> 'pending' then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  -- Punkt 36: Ein Widerruf zwischen Vorbereitung und Bestaetigung laesst das
  -- Foto nicht mehr sichtbar werden.
  -- Und das Foto selbst ist seit seiner Aufnahme nicht faellig geworden: Ein
  -- Widerruf mit neuer Erteilung dazwischen gibt es nicht frei.
  if v_datei.document_type = 'patientenfoto'
     and not (
       app.patient_photo_accessible(v_datei.patient_id, null)
       and app.patient_photo_accessible(
         v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
       )
     ) then
    raise exception 'no consent to patient photos' using errcode = '42501';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket_for(v_datei.document_type)
    and o.name = v_datei.object_key;

  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;

  v_groesse := nullif(v_metadata ->> 'size', '')::bigint;
  v_mime    := nullif(v_metadata ->> 'mimetype', '');

  if v_groesse is distinct from v_datei.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;

  if v_mime is distinct from v_datei.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  if v_groesse > app.patient_file_max_bytes() then
    raise exception 'file too large' using errcode = '22023';
  end if;

  if v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  -- ABN-024 (ADR-017 Punkt 51): Ist die Pruefung am Server scharf, wird die
  -- Datei erst mit ihrem Ergebnis ready (record_patient_file_verification).
  -- Bis dahin bleibt sie pending und traegt den Zeitpunkt der Bestaetigung.
  if app.patient_file_verification_required() then
    update public.patient_files
       set confirmation_requested_at = now()
     where id = p_file_id;
  else
    update public.patient_files
       set status = 'ready',
           confirmed_at = now()
     where id = p_file_id;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.uploaded', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );
end;
$function$
;

drop function public.list_patient_files(uuid, uuid);
drop function public.list_patient_photos(uuid);

CREATE OR REPLACE FUNCTION public.list_patient_files(p_patient_id uuid, p_treatment_basis_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, treatment_basis_id uuid, document_type text, is_clinical boolean, display_name text, mime_type text, byte_size bigint, uploaded_at timestamp with time zone, uploaded_by_name text, object_missing boolean, verified_at timestamp with time zone)
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

  -- G6b: Die Rollenpruefung steht vor der Akte, denn app.patient_file_organization
  -- prueft das Leserecht auf das Verzeichnis mit und wiese sonst mit Ausnahme ab.
  if not app.can_read_patient_files() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_files.read', 'not allowed to read patient files');
    return;
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.treatment_basis_id,
           f.document_type,
           t.is_clinical,
           f.display_name,
           f.mime_type,
           f.byte_size,
           f.confirmed_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket_for(f.document_type)
               and o.name = f.object_key
           ),
           f.verified_at
    from public.patient_files f
    join public.patient_file_document_types t on t.key = f.document_type
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and not app.is_patient_photo_type(f.document_type)
      and (p_treatment_basis_id is null or f.treatment_basis_id = p_treatment_basis_id)
      and app.can_see_patient_file_type(f.document_type)
    order by f.confirmed_at desc, f.id;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.list_patient_photos(p_patient_id uuid)
 RETURNS TABLE(id uuid, document_type text, display_name text, taken_at timestamp with time zone, taken_by_name text, delete_after timestamp with time zone, deletable boolean, object_missing boolean, verified_at timestamp with time zone)
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

  if not (app.can_see_patient_file_type('patientenfoto')
          or app.can_see_patient_file_type('dokumentationsfoto')) then
    perform app.record_denied_read(auth.uid(), 'patient_files.read', 'not allowed to read patient photos');
    return;
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.document_type,
           f.display_name,
           f.created_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           case when f.document_type = 'patientenfoto'
             then app.patient_photo_due_at(f.patient_id, f.created_at, f.photo_locked_at)
           end,
           app.can_write_patient_file(f.document_type, f.treatment_basis_id)
             and (f.document_type <> 'dokumentationsfoto'
                  or app.documentation_photo_deletable(f.organization_id, f.uploaded_by, f.created_at)),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket_for(f.document_type)
               and o.name = f.object_key
           ),
           f.verified_at
    from public.patient_files f
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and app.is_patient_photo_type(f.document_type)
      and app.can_see_patient_file_type(f.document_type)
      and app.patient_photo_usable(f.document_type, f.patient_id, f.created_at, f.photo_locked_at)
    order by f.created_at desc, f.id;
end;
$function$

;

revoke all on function public.list_patient_files(uuid, uuid) from public, anon;
grant execute on function public.list_patient_files(uuid, uuid) to authenticated;
revoke all on function public.list_patient_photos(uuid) from public, anon;
grant execute on function public.list_patient_photos(uuid) to authenticated;
