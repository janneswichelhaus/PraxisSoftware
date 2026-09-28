-- =============================================================================
-- Vertretungs-Kurzblick am Termin (PRX-EPIC-002, Story PRX-006)
--
-- Wer mit dem Rad vor einer fremden Tuer steht, braucht vier Dinge: wie man
-- hineinkommt, worauf zu achten ist, wer die Person sonst behandelt, und was
-- beim letzten Besuch geschah - dazu, wie weit die Grundlage verbraucht ist
-- (IDEA-PRX-016). Heute steht das verteilt ueber Akte, Tagesliste und
-- Dokumentation.
--
--   * AUSWAEHLEN UND ANORDNEN, NICHT DEUTEN (ADR-006 Punkt 2 und 4). Die
--     Funktion liefert gespeicherte Angaben unveraendert: den letzten Eintrag
--     im Wortlaut, die Mengen der Grundlage als Zahlen. Keine Zusammenfassung,
--     keine Hervorhebung, keine Bewertung.
--   * NUR AUF ANFORDERUNG (ANN-137). Der Kurzblick ist am Termin zugeklappt
--     und wird erst beim Aufklappen gelesen. Jedes Aufklappen schreibt
--     appointment_brief.viewed; zeigt er einen Eintrag, zusaetzlich
--     treatment_note.viewed mit der Oberflaeche 'appointment_brief' - dieselbe
--     Spur wie jedes andere Lesen eines Eintrags (ADR-016 Punkt 9, ADR-010).
--   * WER: die Rollen, die Termine UND Dokumentation lesen (owner, therapist,
--     team_lead, office; ADR-004 Fassung 2). Die Trainingsbetreuung und das
--     Patientenkonto werden abgewiesen, protokolliert (G6b).
--   * NUR DIE BEHANDLUNG. Der Kurzblick gibt es am Behandlungstermin
--     (kind = 'therapy'); der letzte Eintrag stammt aus einem Behandlungstermin
--     derselben Person vor diesem. Trainingsdaten bleiben aussen vor
--     (ADR-021, PROJECT_PRINCIPLES.md 4.8).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auditkatalog
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text])));

-- -----------------------------------------------------------------------------
-- 2. get_appointment_brief
--
-- Eine Zeile oder keine. basis_items traegt die Positionen der Grundlage in
-- ihrer Reihenfolge: Heilmittel, verordnete und genutzte Menge.
-- -----------------------------------------------------------------------------
create function public.get_appointment_brief(p_appointment_id uuid)
returns table (
  appointment_id              uuid,
  patient_id                  uuid,
  home_visit_access_note      text,
  special_note                text,
  primary_therapist_name      text,
  treatment_basis_id          uuid,
  treatment_basis_kind        text,
  treatment_basis_issued_on   date,
  basis_appointment_count     integer,
  basis_used                  integer,
  basis_planned               integer,
  basis_items                 jsonb,
  last_note_id                uuid,
  last_note_appointment_start timestamptz,
  last_note_status            text,
  last_note_content           text,
  last_note_visit_without_treatment boolean,
  last_note_author_name       text,
  organization_time_zone      text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_start   timestamptz;
  v_basis   uuid;
  v_note    uuid;
  v_prescribed integer;
  v_used       integer;
  v_planned    integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS; die Rollen prueft die Funktion selbst
  -- (ADR-004). Beide Rechte, weil der Blick Termin und Eintrag zeigt.
  if not (app.can_read_appointments() and app.can_read_treatment_note()) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'appointment_brief.viewed', 'not allowed to read appointment brief');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointment brief' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.starts_at, a.treatment_basis_id
    into v_patient, v_kind, v_start, v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  -- Ein fremder Termin ist von einem unbekannten nicht zu unterscheiden.
  if not found then
    return;
  end if;

  if v_kind <> 'therapy' or v_patient is null then
    raise exception 'an appointment brief exists only for treatment appointments'
      using errcode = '22023';
  end if;

  -- Der letzte Haupteintrag vor diesem Termin, aus einem Behandlungstermin
  -- derselben Person. Nachtraege stehen in der Akte, nicht im Kurzblick.
  -- Geordnet wie ueberall nach Beginn und Kennung.
  select t.id into v_note
  from public.treatment_notes t
  join public.appointments frueher on frueher.id = t.appointment_id
  where frueher.patient_id = v_patient
    and frueher.organization_id = v_org
    and frueher.kind = 'therapy'
    and frueher.id <> p_appointment_id
    and (frueher.starts_at, frueher.id) < (v_start, p_appointment_id)
    and t.addendum_to_note_id is null
  order by frueher.starts_at desc, frueher.id desc
  limit 1;

  if v_basis is not null then
    select z.prescribed, z.used, z.planned
      into v_prescribed, v_used, v_planned
    from app.treatment_basis_slot_counts(v_basis, v_org) z;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment_brief.viewed', 'appointment', p_appointment_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient, 'treatment_note_id', v_note)
  );

  if v_note is not null then
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'treatment_note.viewed', 'treatment_note', v_note, 'success',
      jsonb_build_object(
        'surface', 'appointment_brief',
        'appointment_id', p_appointment_id,
        'patient_id', v_patient
      )
    );
  end if;

  return query
    select
      p_appointment_id,
      v_patient,
      cd.home_visit_access_note,
      cd.special_note,
      case when tp.id is null then null else tp.given_name || ' ' || tp.family_name end,
      b.id,
      b.treatment_basis_kind,
      b.issued_on,
      v_prescribed,
      v_used,
      v_planned,
      case when b.id is null then null else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'remedy', i.remedy,
                   'prescribed_quantity', i.prescribed_quantity,
                   'used_quantity', i.used_quantity
                 )
                 order by i.sort_order, i.id
               )
        from public.treatment_base_items i
        where i.treatment_basis_id = b.id
      ), '[]'::jsonb) end,
      t.id,
      frueher.starts_at,
      t.status,
      t.content,
      t.visit_without_treatment,
      verfasser.display_name,
      o.time_zone
    from public.organizations o
    left join public.patient_care_details cd on cd.patient_id = v_patient
    left join public.staff_members tsm       on tsm.id = cd.primary_therapist_staff_member_id
    left join public.persons tp              on tp.id = tsm.person_id
    left join public.treatment_bases b       on b.id = v_basis and b.organization_id = v_org
    left join public.treatment_notes t       on t.id = v_note
    left join public.appointments frueher    on frueher.id = t.appointment_id
    left join public.user_profiles verfasser on verfasser.id = t.created_by
    where o.id = v_org;
end;
$$;

comment on function public.get_appointment_brief(uuid) is
  'PRX-006: Vertretungs-Kurzblick am Behandlungstermin - Zugangshinweis, Besonderheit, feste Therapeut:in, Stand der Grundlage und der letzte Haupteintrag vor diesem Termin im Wortlaut (ADR-006: auswaehlen, nicht deuten). Rollen: Termine und Dokumentation lesen. Protokolliert appointment_brief.viewed und fuer den gezeigten Eintrag treatment_note.viewed (ANN-137); abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.get_appointment_brief(uuid) from public, anon;
grant execute on function public.get_appointment_brief(uuid) to authenticated;
