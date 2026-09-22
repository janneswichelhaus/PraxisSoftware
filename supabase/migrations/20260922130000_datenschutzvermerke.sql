-- =============================================================================
-- Datenschutzinformation, Behandlungsvertrag und Einwilligungen (PAT-006, G8)
--
-- ADR-007 Punkt 5 zaehlt die Datenschutzinformationen zu den Vorbedingungen
-- des Produktivstarts, und seine Folgefrage fragt, "wo ein Einwilligungs- und
-- Widerrufsmodell im Datenmodell benoetigt" wird. Diese Migration beantwortet
-- den technischen Teil so klein wie moeglich:
--
--   * DATENSCHUTZINFORMATION UND BEHANDLUNGSVERTRAG BLEIBEN PAPIER. Die
--     Anwendung haelt fest, DASS und WANN ausgehaendigt beziehungsweise
--     unterschrieben wurde - und bei der Datenschutzinformation, welche
--     Fassung. Keine Unterschrift, kein Scan-Zwang, kein Text in der
--     Datenbank (E-13, Roadmap G8). Wer einen Scan ablegen will, hat dafuer
--     die Dokumentart `einwilligung` beziehungsweise `vertrag` (DAT-001).
--   * EINWILLIGUNGEN JE ZWECK, WIDERRUF ALS EIGENER VERMERK. Eine Zeile wird
--     nie geaendert und nie geloescht. Der aktuelle Stand eines Zwecks ist die
--     juengste Zeile dieses Zwecks; eine Erteilung bleibt nach dem Widerruf
--     als Nachweis stehen (Art. 7 Abs. 1 DSGVO: die Praxis muss die
--     Einwilligung nachweisen koennen, auch fuer die Zeit vor dem Widerruf).
--   * ZWECKE NUR MIT EINEM ECHTEN FALL. Die Behandlung selbst braucht keine
--     Einwilligung - sie stuetzt sich auf Art. 9 Abs. 2 lit. h DSGVO mit
--     Par. 22 Abs. 1 Nr. 1 lit. b BDSG und den Behandlungsvertrag. Einwilligung
--     ist nur dort die Grundlage, wo ein Weg ueber die Behandlung hinausgeht
--     (ANN-093).
--
-- Was NICHT hier steht: eine Pruefung vor dem Navigations-Handoff oder dem
-- Mailweg (ANN-018, ANN-041 - beide verlangen heute keine Einwilligung), die
-- Einwilligungen im Training (ADR-021, B2) und eine Verwaltung im Portal.
--
-- Datenklasse: Patientenakte. Die Zeilen fallen mit der Akte (FK on delete
-- cascade) und haben keine eigene Frist - der Nachweis einer Einwilligung wird
-- so lange gebraucht wie die Daten, die auf ihr beruhen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- patient_privacy_records
-- -----------------------------------------------------------------------------
create table public.patient_privacy_records (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  patient_id       uuid not null references public.patients (id) on delete cascade,

  -- 'privacy_notice_handed_out'  Datenschutzinformation ausgehaendigt
  -- 'treatment_contract_signed'  Behandlungsvertrag unterschrieben
  -- 'consent_granted'            Einwilligung zu einem Zweck erteilt
  -- 'consent_withdrawn'          Einwilligung zu einem Zweck widerrufen
  record_kind      text not null
                     check (record_kind in (
                       'privacy_notice_handed_out',
                       'treatment_contract_signed',
                       'consent_granted',
                       'consent_withdrawn'
                     )),

  -- ANN-093: die Zwecke, fuer die die Praxis eine Einwilligung einholt.
  -- Muss deckungsgleich mit EINWILLIGUNGSZWECKE in
  -- src/features/datenschutz/vermerke.ts bleiben.
  purpose          text
                     check (purpose in ('email_contact', 'prescriber_report')),

  -- Die Fassung der ausgehaendigten Datenschutzinformation, zum Beispiel
  -- '2026-09'. Sie steht in src/features/datenschutz/patienteninformation.ts.
  notice_version   text
                     check (notice_version ~ '^[0-9]{4}-[0-9]{2}$'),

  -- Der Tag auf dem Papier, nicht der Tag der Eingabe.
  occurred_on      date not null,

  recorded_at      timestamptz not null default now(),
  recorded_by      uuid,

  -- Ein Zweck gehoert genau zu den Einwilligungsvermerken, eine Fassung genau
  -- zur Datenschutzinformation.
  constraint patient_privacy_records_purpose_shape check (
    (record_kind in ('consent_granted', 'consent_withdrawn')) = (purpose is not null)
  ),
  constraint patient_privacy_records_version_shape check (
    (record_kind = 'privacy_notice_handed_out') = (notice_version is not null)
  )
);

comment on table public.patient_privacy_records is
  'Vermerke zu Datenschutzinformation, Behandlungsvertrag und Einwilligungen je Zweck (PAT-006, ANN-093). Nur anhaengen, nie aendern: der Stand eines Zwecks ist seine juengste Zeile. Die Dokumente selbst bleiben Papier. Datenklasse: Patientenakte, faellt mit der Akte.';
comment on column public.patient_privacy_records.occurred_on is
  'Datum auf dem Papier (ausgehaendigt, unterschrieben, erteilt, widerrufen) - nicht das der Eingabe, das steht in recorded_at.';

create index patient_privacy_records_patient_idx
  on public.patient_privacy_records (patient_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Rechte und RLS
--
-- Lesen: die vier Praxisrollen der eigenen Organisation, wie die Kartei
-- (ADR-004 Punkt 2 und 3). Schreiben ausschliesslich ueber die Funktion unten;
-- kein Update, kein Delete fuer irgendeine Anwendungsrolle. Patientenkonten
-- und Trainingsbetreuung sehen nichts.
-- -----------------------------------------------------------------------------
alter table public.patient_privacy_records enable row level security;

revoke all on public.patient_privacy_records from anon, authenticated;
grant select on public.patient_privacy_records to authenticated;

create policy patient_privacy_records_select_directory
  on public.patient_privacy_records for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_patient_directory()
  );

-- -----------------------------------------------------------------------------
-- Retention Schedule (ADR-008)
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('patient_privacy_records', 'patientenakte', 'ueber_elterndatensatz',
   'Vermerke zu Datenschutzinformation, Behandlungsvertrag und Einwilligungen. Fallen mit der Akte (FK on delete cascade); der Nachweis einer Einwilligung wird so lange gebraucht wie die Daten, die auf ihr beruhen.', 46);

-- -----------------------------------------------------------------------------
-- Ereigniskatalog: patient_privacy.recorded
--
-- Ein Ereignis fuer alle vier Vermerke; Art und Zweck stehen im Kontext.
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
    'deletion_runs.read',
    'patient_privacy.recorded'
  ));

-- -----------------------------------------------------------------------------
-- record_patient_privacy_entry
--
-- Der einzige Schreibweg. Drei Regeln, die die Oberflaeche nur spiegelt:
--
--   * Das Datum liegt nicht in der Zukunft - gemessen am Kalendertag der
--     Praxis, nicht an UTC. Ein Vermerk behauptet einen Vorgang, der
--     stattgefunden hat (Art. 5 Abs. 1 lit. d DSGVO).
--   * Erteilen nur, wenn der Zweck nicht schon erteilt ist; widerrufen nur,
--     wenn er erteilt ist. Ein doppelter Vermerk waere kein Fehler auf dem
--     Papier, aber einer im Nachweis.
--   * Ein Widerruf liegt nicht vor der Erteilung, die er widerruft.
--
-- Wer darf: dieselben Rollen wie beim Aendern der Stammdaten
-- (app.can_update_patient) - die Aufnahme macht im Alltag oft das Buero.
-- -----------------------------------------------------------------------------
create function public.record_patient_privacy_entry(
  p_patient_id     uuid,
  p_record_kind    text,
  p_purpose        text,
  p_notice_version text,
  p_occurred_on    date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_letzte   record;
  v_id       uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_patient() then
    raise exception 'not allowed to record privacy entries' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record privacy entries' using errcode = '42501';
  end if;

  -- Eine fremde Akte und eine nicht vorhandene sehen gleich aus (ADR-003).
  perform 1
  from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_occurred_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  if p_record_kind in ('consent_granted', 'consent_withdrawn') then
    select r.record_kind, r.occurred_on
      into v_letzte
    from public.patient_privacy_records r
    where r.patient_id = p_patient_id
      and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;

    if p_record_kind = 'consent_granted'
       and v_letzte.record_kind is not distinct from 'consent_granted' then
      raise exception 'consent already granted' using errcode = '23514';
    end if;

    if p_record_kind = 'consent_withdrawn' then
      if v_letzte.record_kind is distinct from 'consent_granted' then
        raise exception 'no consent to withdraw' using errcode = '23514';
      end if;
      if p_occurred_on < v_letzte.occurred_on then
        raise exception 'withdrawal before consent' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Wertebereich und Form pruefen die Constraints der Tabelle.
  insert into public.patient_privacy_records (
    organization_id, patient_id, record_kind, purpose, notice_version,
    occurred_on, recorded_by
  )
  values (
    v_org, p_patient_id, p_record_kind, p_purpose, p_notice_version,
    p_occurred_on, v_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_privacy.recorded', 'patient', p_patient_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'record_id', v_id,
      'record_kind', p_record_kind,
      'purpose', p_purpose
    )
  );

  return v_id;
end;
$$;

comment on function public.record_patient_privacy_entry(uuid, text, text, text, date) is
  'Vermerkt Aushaendigung der Datenschutzinformation, Unterschrift des Behandlungsvertrags oder Erteilung/Widerruf einer Einwilligung je Zweck (PAT-006, ANN-093). Nur anhaengen; jeder Vermerk als patient_privacy.recorded protokolliert.';

revoke all on function public.record_patient_privacy_entry(uuid, text, text, text, date) from public, anon;
grant execute on function public.record_patient_privacy_entry(uuid, text, text, text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- export_patient_record: die Vermerke gehoeren zur Kopie (Art. 15 Abs. 3)
--
-- Unveraendert aus 20260922100000_betroffenenrechte.sql bis auf den neuen
-- Abschnitt `patient_privacy_records` am Ende. Die Vollstaendigkeit prueft
-- supabase/tests/betroffenenrechte.test.ts gegen retention_assignments.
-- -----------------------------------------------------------------------------
create or replace function public.export_patient_record(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'fax', k.fax,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme; die Datei selbst wird getrennt herausgegeben (ADR-017).'
      ),
      jsonb_build_object(
        'was', 'Protokoll der Zugriffe auf die Akte',
        'grund', 'Jede Zeile ist zugleich ein Datensatz ueber eine beschaeftigte Person (Art. 15 Abs. 4 DSGVO); sie wird auf gesondertes Verlangen erteilt (ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$$;

comment on function public.export_patient_record(uuid) is
  'Kopie der Patientenakte nach Art. 15 Abs. 3 DSGVO. Nur owner, nur eigene Organisation, jeder Aufruf als patient_record.exported protokolliert (OPS-006, ADR-007, ADR-010).';

revoke all on function public.export_patient_record(uuid) from public, anon;
grant execute on function public.export_patient_record(uuid) to authenticated;
