-- =============================================================================
-- Herausgabe eines Patientenfotos an die Person (DOK-006d, ADR-017 Punkt 40)
--
-- Ein Patientenfoto verlaesst die Anwendung auf genau einem Weg: als Kopie an
-- die Person selbst - nach Art. 15 Abs. 3 DSGVO und, weil die Einwilligung die
-- Grundlage ist, nach Art. 20 DSGVO. Das tut owner im Verfahren der
-- Betroffenenrechte (OPS-006), auditiert. Die Folgefrage aus ADR-017 Fassung 2
-- entscheidet dieser Schritt so (ANN-128):
--
--   * EINZELDATEI, kein Paket. Je Foto ein Aufruf, ein Auditeintrag, eine
--     Datei - die Auskunft selbst (export_patient_record) nennt die Fotos wie
--     jede Datei mit Name, Art und Pruefsumme und gibt den Inhalt getrennt
--     heraus.
--   * EIGENES AUDITEREIGNIS patient_file.handed_out. Das Oeffnen im Verlauf
--     (patient_file.link_issued) ist ein Zugriff in der Praxis; die Herausgabe
--     ist ein Export an eine Stelle ausserhalb - im Protokoll sollen beide
--     nicht gleich aussehen (ADR-010 Punkt 2).
--   * NUR OWNER, nur ein nutzbares Foto. Ein widerrufenes Foto ist geloescht,
--     ein gesperrtes bleibt gesperrt (Punkt 36).
--
-- Die Rueckgabe ist dieselbe wie bei issue_patient_file_link: Bucket,
-- Objektschluessel, Anzeigename - und eine einmalige Freigabe fuer die
-- Storage-API (ANN-052). Ob ein Verweis einen Downloadnamen traegt,
-- entscheidet der Client beim Signieren, nicht die Datenbank; unterscheiden
-- lassen sich Ansehen und Herausgabe deshalb im Protokoll, und nur dort.
-- =============================================================================

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text])));

create function public.hand_out_patient_photo(p_file_id uuid)
returns table (bucket_id text, object_key text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die Rolle vor der Datei: Wer nicht herausgeben darf, erfaehrt auch nicht,
  -- ob eine Kennung ein Foto ist.
  if not app.has_any_role('owner') then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.document_type = 'patientenfoto'
    and f.status = 'ready';

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Dieselbe Pruefung wie die Auskunft: owner, eigene Organisation, eigene
  -- Akte. Wirft sonst - wie export_patient_record.
  perform app.auskunft_organisation(v_datei.patient_id);

  if not app.patient_photo_accessible(
    v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
  ) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.handed_out', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );

  delete from public.patient_file_access_grants g
   where g.organization_id = v_datei.organization_id
     and g.expires_at <= now();

  -- ANN-052: eine Freigabe, eine Operation, 30 Sekunden.
  insert into public.patient_file_access_grants (
    organization_id, user_id, patient_file_id, expires_at
  )
  values (
    v_datei.organization_id, v_actor, p_file_id, now() + app.patient_file_access_grant_ttl()
  );

  return query
    select app.patient_photo_bucket(), v_datei.object_key, v_datei.display_name;
end;
$$;

comment on function public.hand_out_patient_photo(uuid) is
  'Kopie eines Patientenfotos an die Person selbst (Art. 15 Abs. 3, Art. 20 DSGVO; ADR-017 Punkt 40). Nur owner, nur ein nutzbares Foto, als patient_file.handed_out protokolliert (ANN-128).';

revoke all on function public.hand_out_patient_photo(uuid) from public, anon;
grant execute on function public.hand_out_patient_photo(uuid) to authenticated;
