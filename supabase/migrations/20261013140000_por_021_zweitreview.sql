-- =============================================================================
-- POR-EPIC-003, Befunde aus dem Zweitreview (ADR-013 Punkt 9 Nr. 8)
--
-- 1. record_patient_privacy_entry setzt recorded_at wie die Plattformwege aus
--    POR-016/017 auf now(), mindestens aber eine Mikrosekunde nach dem
--    bisher juengsten Vermerk der Akte: Der Stand eines Zwecks ist seine
--    juengste Zeile. Mit now() allein (Beginn der Transaktion) konnte ein
--    Widerruf, der auf eine spaeter begonnene Erteilung wartete, als aelter
--    einsortiert werden und wirkungslos bleiben - nachgewiesen mit zwei
--    Sitzungen. Nicht clock_timestamp(): Die Fotoloeschung vergleicht den
--    Widerruf mit now() derselben Transaktion (ADR-017 Punkt 36). Rumpf sonst unveraendert aus
--    20261006110100_log_001b_schreibpfade.sql.
-- 2. Die Kopie der Akte nach Art. 15 (export_patient_record) nennt an jedem
--    Datenschutzvermerk Herkunft, Art der Vertretung, deren Namen und die
--    Textfassung (POR-016). Rumpf sonst unveraendert aus
--    20261011100000_slk_001_patient_fax_entfernen.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_patient_privacy_entry(p_patient_id uuid, p_record_kind text, p_purpose text, p_notice_version text, p_occurred_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_letzte   record;
  v_id       uuid;
  v_zeit     timestamptz;
  v_fotos    integer := 0;
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

  if p_record_kind in ('consent_granted', 'consent_withdrawn', 'consent_refused') then
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

    -- Punkt 35: Eine Ablehnung ist ein eigener Vermerk, kein Widerruf. Wer
    -- eingewilligt hat, widerruft; zweimal hintereinander abgelehnt ist
    -- nichts Neues.
    if p_record_kind = 'consent_refused' then
      if v_letzte.record_kind is not distinct from 'consent_granted' then
        raise exception 'consent is granted, record a withdrawal' using errcode = '23514';
      end if;
      if v_letzte.record_kind is not distinct from 'consent_refused' then
        raise exception 'consent already refused' using errcode = '23514';
      end if;
    end if;
  end if;

  -- Wertebereich und Form pruefen die Constraints der Tabelle.
  -- POR-016 (Zweitreview): Der neue Vermerk ist der juengste, auch wenn
  -- ein gleichzeitiger Aufruf spaeter begann und vorher schrieb.
  select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
  from public.patient_privacy_records r
  where r.patient_id = p_patient_id;
  v_zeit := coalesce(v_zeit, now());

  insert into public.patient_privacy_records (
    organization_id, patient_id, record_kind, purpose, notice_version,
    occurred_on, recorded_by, recorded_at
  )
  values (
    v_org, p_patient_id, p_record_kind, p_purpose, p_notice_version,
    p_occurred_on, v_actor, v_zeit
  )
  returning id into v_id;

  -- Punkt 36: Der Widerruf der Fotoeinwilligung sperrt sofort und loescht in
  -- derselben Transaktion - Zeilen, Loeschauftraege, Loeschjournal. Unter
  -- Legal Hold bleiben die Fotos gesperrt stehen (release_legal_hold).
  if p_record_kind = 'consent_withdrawn' and p_purpose = 'patient_photos' then
    v_fotos := app.delete_due_patient_photos(
      v_org, p_patient_id, extensions.gen_random_uuid(), v_actor, 'consent_withdrawn'
    );
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
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
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'take_along_items', v.take_along_items,
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
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'fee_waived_at', t.fee_waived_at,
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
        'confirmed_at', da.confirmed_at,
        'photo_locked_at', da.photo_locked_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Die Fotos gehoeren zur vollstaendigen Kopie, auch
    -- gesperrte, solange sie vorhanden sind. Die Datei selbst gibt owner je
    -- Foto heraus (hand_out_patient_photo, protokolliert); dieser Abschnitt
    -- ist die Liste dazu.
    'patient_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fo.id,
        'display_name', fo.display_name,
        'art', fo.document_type,
        'aufgenommen_am', fo.created_at,
        'gesperrt', not app.patient_photo_usable(fo.document_type, fo.patient_id, fo.created_at, fo.photo_locked_at),
        'datei_vorhanden', exists (
          select 1 from storage.objects o
          where o.bucket_id = app.patient_file_bucket_for(fo.document_type) and o.name = fo.object_key)
      ) order by fo.created_at)
      from public.patient_files fo
      where fo.patient_id = p_patient_id
        and app.is_patient_photo_type(fo.document_type)
        and fo.status = 'ready'
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Datum und Zweck der Zugriffe aus dem Auditlog -
    -- ohne Namen und ohne Kennung der Beschaeftigten (Art. 15 Abs. 4 DSGVO);
    -- eine begruendete Ausnahme prueft owner im Einzelfall (ANN-092).
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zeitpunkt', al.occurred_at,
        'aktion', al.action,
        'gegenstand', al.subject_type,
        'ergebnis', al.outcome,
        'durch', case al.actor_kind
                   when 'user' then 'praxis'
                   when 'system' then 'system'
                   when 'platform' then 'person_selbst'
                   when 'representative' then 'vertretung'
                 end
      ) order by al.occurred_at)
      from public.audit_log al
      where al.organization_id = v_org
        -- LOG-EPIC-001: Zugriffe, keine Abweisungen. Die Aktionen sind seit
        -- ADR-010 Fassung 3 ohnehin nur noch, was die Daten nicht zeigen.
        and al.outcome = 'success'
        -- Auch die Zugriffe auf zusammengefuehrte Doppelanlagen gehoeren
        -- zu dieser Person (ABN-018, BEF-108).
        and ((al.subject_type = 'patient' and al.subject_id = any(array(
                select p_patient_id
                union all
                select mr2.source_patient_id from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
             or al.context ->> 'patient_id' = any(array(
                select p_patient_id::text
                union all
                select mr2.source_patient_id::text from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
    ), '[]'::jsonb),

    -- ABN-018 (BEF-108): Nachweise des Zusammenfuehrens an dieser Akte.
    'patient_merge_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'merged_at', mr.merged_at,
        'source_patient_id', mr.source_patient_id,
        'counts', mr.counts
      ) order by mr.merged_at)
      from public.patient_merge_records mr
      where mr.target_patient_id = p_patient_id
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

    -- ABR-030: Honorarvereinbarungen sind Daten zur Person (Art. 15 DSGVO).
    -- ABR-031: das festgeschriebene Terminhonorar je Termin (Art. 15 DSGVO).
    'session_fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', f.appointment_id,
        'performed_on', f.performed_on,
        'amount_cents', f.amount_cents,
        'source', f.source,
        'created_at', f.created_at
      ) order by f.performed_on)
      from public.appointment_session_fees f
      join public.appointments a on a.id = f.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    'fee_agreements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'valid_from', f.valid_from,
        'session_fee_cents', f.session_fee_cents,
        'created_at', f.created_at
      ) order by f.valid_from)
      from public.patient_fee_agreements f
      where f.patient_id = p_patient_id
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
        'recorded_at', pr.recorded_at,
        -- POR-016: Herkunft, Vertretung und Textfassung (Zweitreview).
        'source', pr.source,
        'platform_access_kind', pr.platform_access_kind,
        'representative_name', pr.representative_name,
        'wording_version', pr.wording_version
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at,
        -- ABN-013 (BEF-102): Ein entferntes Ereignis bleibt Teil der Akte.
        'removed_at', ce.removed_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-015: gesicherte, noch nicht uebernommene Befundangaben.
    'treatment_draft_findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', df.appointment_id,
        'findings', df.findings,
        'updated_at', df.updated_at
      ) order by df.updated_at)
      from public.treatment_draft_findings df
      join public.appointments a on a.id = df.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
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
        'was', 'Inhalt hochgeladener Dateien und Fotos',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme und jedes Foto, auch gesperrte; die Datei selbst wird je Datei herausgegeben (ADR-017, ANN-128).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
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
$function$;
