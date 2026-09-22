-- =============================================================================
-- Betroffenenrechte: Auskunft und Aufbewahrungsstand (OPS-006 minimal, G9)
--
-- ADR-007 Punkt 5 zaehlt das "Verfahren fuer Betroffenenrechte" zu den sieben
-- Vorbedingungen des Produktivstarts. Ein Verfahren auf Papier reicht dafuer
-- nicht: Art. 15 Abs. 3 DSGVO verlangt eine Kopie der Daten, und ADR-007 haelt
-- in den Konsequenzen fest, dass die organisatorischen Verfahren "technische
-- Grundlagen" brauchen - Auskunft und Export. Genau die beiden Funktionen
-- stehen hier.
--
--   export_patient_record     Die Kopie der Akte (Art. 15 Abs. 3 DSGVO).
--   patient_retention_status  Woran eine Loeschung scheitert (Art. 17 Abs. 3
--                             lit. b DSGVO): welche Frist laeuft, ab wann,
--                             bis wann.
--
-- Beide sind SECURITY DEFINER und pruefen Rolle und Organisation selbst - wie
-- list_audit_events (ADR-010 Punkt 13). Beide sind auf `owner` begrenzt: Die
-- Auskunft ist ein Vorgang der Praxisleitung, kein Alltagsgriff, und die Kopie
-- buendelt in einer Antwort, was sonst ueber zwoelf Leserechte verteilt liegt.
-- Wer sie ausstellt, muss auch fuer sie geradestehen.
--
-- Datenklasse: Beide Funktionen legen nichts an. Die eine Zeile, die entsteht,
-- ist der Auditeintrag patient_record.exported (Klasse `auditlog`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog: Export klinischer Daten
--
-- ADR-010 Punkt 2 nennt "Download/Export klinischer Daten" und "groessere
-- Datenexporte" ausdruecklich als auditpflichtig. Die Auskunft ist beides in
-- einem Aufruf.
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
    'payment.voided'
  ));

-- -----------------------------------------------------------------------------
-- app.auskunft_berechtigt
--
-- Die gemeinsame Tuer beider Funktionen. Sie antwortet auf einen Patienten
-- einer fremden Organisation mit derselben Abweisung wie auf eine fehlende
-- Rolle: Ob es die Akte gibt, ist selbst eine Auskunft (ADR-003).
-- -----------------------------------------------------------------------------
create function app.auskunft_organisation(p_patient_id uuid)
returns uuid
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

  if not app.has_any_role('owner') then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  return v_org;
end;
$$;

comment on function app.auskunft_organisation(uuid) is
  'Prueft Anmeldung, owner-Rolle und Mandantengrenze fuer die Betroffenenrechte und liefert die Organisation (OPS-006, ADR-004).';

-- -----------------------------------------------------------------------------
-- export_patient_record
--
-- Die Kopie nach Art. 15 Abs. 3 DSGVO. Ein Schluessel je Tabelle, unter dem
-- Namen der Tabelle: Die Vollstaendigkeit laesst sich so gegen
-- retention_assignments pruefen (supabase/tests/betroffenenrechte.test.ts) und
-- nicht gegen eine zweite Liste, die neben dem Datenmodell herlaeuft. Die
-- deutschen Beschriftungen stehen in src/features/datenschutz/kategorien.ts -
-- dieselbe Arbeitsteilung wie beim Aufbewahrungsplan (LOE-001a).
--
-- WAS NICHT MITKOMMT, steht als `nicht_enthalten` in der Antwort selbst. Die
-- Auskunft sagt damit, wo sie endet; eine Kopie, die ihre eigenen Luecken
-- verschweigt, waere die schlechtere Auskunft.
--
-- ANN-092: Das Auditlog ist nicht Teil der Kopie. Art. 15 Abs. 4 DSGVO nimmt
-- Rechte anderer Personen aus, und jede Auditzeile ist zugleich ein Datensatz
-- ueber die zugreifende beschaeftigte Person (PROJECT_PRINCIPLES.md 20). Wer
-- eine Akte gelesen hat, ist eine eigene Auskunft - sie wird auf Verlangen
-- ueber das Verfahren erteilt (docs/datenschutz/betroffenenrechte.md), nicht
-- als Beifang dieses Exports.
-- -----------------------------------------------------------------------------
create function public.export_patient_record(p_patient_id uuid)
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

-- -----------------------------------------------------------------------------
-- patient_retention_status
--
-- Die Gegenrichtung: Woran eine Loeschung scheitert. ADR-008 Punkt 2 stellt
-- gesetzliche Aufbewahrungspflichten vor die regulaere Loeschung, und seine
-- Konsequenzen verlangen ausdruecklich, dass das Verfahren fuer
-- Betroffenenrechte "diese Ablehnung begruendet ausgeben" kann. Begruendet
-- heisst: mit Frist, Grundlage und Datum - nicht mit einem Satz ueber
-- Aufbewahrungspflichten im Allgemeinen.
--
-- Gerechnet wird aus retention_classes und app.retention_due_at, also aus der
-- einen Stelle, an der eine Frist steht (ANN-001). Hier steht kein Intervall
-- ein zweites Mal; ein geaenderter Retention Schedule aendert diesen Text mit.
--
-- Protokolliert wird dieser Aufruf NICHT: Er gibt keine Inhalte heraus,
-- sondern Fristen, und die Akte ist beim Oeffnen bereits als
-- patient_record.viewed protokolliert (ADR-010 Punkt 2).
-- -----------------------------------------------------------------------------
create function public.patient_retention_status(p_patient_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org        uuid;
  v_zone       text;
  v_abschluss  date;
  v_akte       record;
  v_abr        record;
  v_jahr       date;
  v_klassen    jsonb := '[]'::jsonb;
begin
  v_org := app.auskunft_organisation(p_patient_id);

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;

  select p.care_concluded_on into v_abschluss
  from public.patients p where p.id = p_patient_id;

  -- Klinische Akte: zehn Jahre ab Abschluss der Versorgung. Ohne Abschluss
  -- laeuft keine Frist - und genau das ist der haeufigere Fall.
  select k.key, k.legal_reference, k.retention_interval, k.anchor
    into v_akte
  from public.retention_classes k where k.key = 'patientenakte';

  v_klassen := v_klassen || jsonb_build_array(jsonb_build_object(
    'key', v_akte.key,
    'legal_reference', v_akte.legal_reference,
    'anchor', v_akte.anchor,
    'anker_datum', v_abschluss,
    'frist_ende', case when v_abschluss is null then null
                       else (v_abschluss + v_akte.retention_interval)::date end,
    'loeschbar_ab', case when v_abschluss is null then null
                         else app.retention_due_at(v_abschluss, v_akte.retention_interval, v_zone) end,
    'datensaetze', (select count(*) from public.patients p where p.id = p_patient_id)
  ));

  -- Abrechnung: eigene Frist ab Ende des Kalenderjahres der letzten
  -- ausgestellten Rechnung. Sie haelt die Akte laenger fest als die Akte sich
  -- selbst, wenn spaet abgerechnet wurde (ADR-008, Konsequenz zu ADR-009).
  select k.key, k.legal_reference, k.retention_interval, k.anchor
    into v_abr
  from public.retention_classes k where k.key = 'abrechnungsdaten';

  select make_date(extract(year from max(r.issued_on))::int, 12, 31)
    into v_jahr
  from public.invoices r
  where r.patient_id = p_patient_id and r.issued_on is not null;

  v_klassen := v_klassen || jsonb_build_array(jsonb_build_object(
    'key', v_abr.key,
    'legal_reference', v_abr.legal_reference,
    'anchor', v_abr.anchor,
    'anker_datum', v_jahr,
    'frist_ende', case when v_jahr is null then null
                       else (v_jahr + v_abr.retention_interval)::date end,
    'loeschbar_ab', case when v_jahr is null then null
                         else app.retention_due_at(v_jahr, v_abr.retention_interval, v_zone) end,
    'datensaetze', (select count(*) from public.invoices r
                    where r.patient_id = p_patient_id and r.issued_on is not null)
  ));

  return jsonb_build_object(
    'patient_id', p_patient_id,
    'zeitzone', v_zone,
    'versorgung_abgeschlossen_am', v_abschluss,
    'klassen', v_klassen,
    'loeschsperre', (
      select jsonb_build_object('seit', s.placed_at, 'grund', s.reason)
      from public.legal_holds s
      where s.subject_type = 'patient'
        and s.subject_id = p_patient_id
        and s.released_at is null
      limit 1
    )
  );
end;
$$;

comment on function public.patient_retention_status(uuid) is
  'Laufende Aufbewahrungsfristen einer Akte als Grundlage der begruendeten Ablehnung nach Art. 17 Abs. 3 lit. b DSGVO (OPS-006, ADR-008).';

revoke all on function public.patient_retention_status(uuid) from public, anon;
grant execute on function public.patient_retention_status(uuid) to authenticated;
