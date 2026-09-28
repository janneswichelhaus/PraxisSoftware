-- =============================================================================
-- "Mitnehmen": Material je Person, von Hand gepflegt (PRX-EPIC-002, PRX-007)
--
-- Was fuer einen Besuch aufs Rad muss - ein Theraband, Kinesiotape, ein
-- ausgedruckter Uebungsplan (IDEA-PRX-035). Die Liste ist ein Merkmal der
-- Person wie die Behandlungsliege (UX-003a, ANN-116), nur mit Namen statt
-- ja/nein.
--
--   * VON HAND, NIE ABGELEITET (ADR-006 Punkt 2 und 4). Was jemand eintraegt,
--     steht da; die Anwendung schlaegt aus Befund oder Dokumentation nichts
--     vor. Ein Vorschlag "aus den letzten Befunden" waere eine Auswertung
--     klinischer Inhalte.
--   * AN DER PERSON (ANN-138). Material wiederholt sich von Besuch zu Besuch;
--     eine Liste je Termin muesste jedes Mal neu entstehen. Datenklasse und
--     Rollenschnitt erbt sie von patient_care_details (Patientenakte, zehn
--     Jahre nach Abschluss; alle vier Praxisrollen, nie das Patientenkonto).
--   * AM TAG OHNE NAMEN. Die Tagesliste liefert die Eintraege am
--     Behandlungstermin; die Uebersicht zeigt sie nur zusammengezaehlt, ohne
--     Person (im Treppenhaus wird mitgelesen). Mit Person steht die Liste im
--     Kurzblick (PRX-006) und in der Akte.
--
-- Fuenf Teile:
--   1. Spalte take_along_items mit Formpruefung
--   2. set_take_along_items - Schreibpfad mit Audit patient.updated
--   3. patient_directory und export_patient_record tragen die Liste
--   4. list_day_plan liefert sie am Behandlungstermin
--   5. get_appointment_brief zeigt sie im Kurzblick
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Spalte
--
-- Hoechstens zehn Eintraege zu je 1 bis 60 Zeichen, ohne Rand und ohne
-- Doppel. Die Regel steht einmal, in app.take_along_items_valid; die
-- Schreibfunktion normalisiert vorher, die Constraint haelt jeden anderen Weg.
-- -----------------------------------------------------------------------------
create function app.take_along_items_valid(p_items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_items is not null
     and coalesce(array_length(p_items, 1), 0) <= 10
     and not exists (
       select 1 from unnest(p_items) as e(eintrag)
       where e.eintrag is null
          or e.eintrag <> btrim(e.eintrag)
          or char_length(e.eintrag) not between 1 and 60
     )
     and (select count(distinct lower(e.eintrag)) from unnest(p_items) as e(eintrag))
         = coalesce(array_length(p_items, 1), 0)
$$;

comment on function app.take_along_items_valid(text[]) is
  'PRX-007: Form der Mitnehmen-Liste - hoechstens zehn Eintraege zu 1 bis 60 Zeichen, ohne Rand, ohne Doppel (ANN-138).';

alter table public.patient_care_details
  add column take_along_items text[] not null default '{}'::text[];

alter table public.patient_care_details
  add constraint patient_care_details_take_along_items_valid
  check (app.take_along_items_valid(take_along_items));

comment on column public.patient_care_details.take_along_items is
  'Mitnehmen (PRX-007, ANN-138): von Hand gepflegte Liste, was fuer einen Besuch aufs Rad muss. Nie aus Dokumentation abgeleitet (ADR-006).';

-- -----------------------------------------------------------------------------
-- 2. Schreibpfad
--
-- Dieselbe Bauart wie set_treatment_table_required: eigene kleine Funktion,
-- Rollen wie update_patient, Auditereignis patient.updated mit dem Feldnamen,
-- nie mit dem Inhalt (ADR-010 Punkt 3, ADR-011).
-- -----------------------------------------------------------------------------
create function public.set_take_along_items(p_patient_id uuid, p_items text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_neu   text[];
  v_alt   text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  if p_patient_id is null or p_items is null then
    raise exception 'patient and items are required' using errcode = '22023';
  end if;

  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Normalisieren: Rand weg, Leeres weg, Doppel (ohne Gross/klein) weg, die
  -- Reihenfolge der Eingabe bleibt.
  select coalesce(array_agg(x.eintrag order by x.nr), '{}'::text[])
    into v_neu
  from (
    select distinct on (lower(btrim(e.eintrag))) btrim(e.eintrag) as eintrag, e.nr
    from unnest(p_items) with ordinality as e(eintrag, nr)
    where e.eintrag is not null and btrim(e.eintrag) <> ''
    order by lower(btrim(e.eintrag)), e.nr
  ) x;

  if not app.take_along_items_valid(v_neu) then
    raise exception 'take-along items must be at most 10 entries of 1 to 60 characters'
      using errcode = '22023';
  end if;

  select cd.take_along_items into v_alt
  from public.patient_care_details cd
  where cd.patient_id = p_patient_id;

  if not found then
    insert into public.patient_care_details (
      patient_id, organization_id, take_along_items, created_by
    )
    values (p_patient_id, v_org, v_neu, v_actor);
  elsif v_alt is distinct from v_neu then
    update public.patient_care_details
       set take_along_items = v_neu
     where patient_id = p_patient_id;
  else
    return v_neu;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.updated', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'changed_fields', jsonb_build_array('take_along_items'))
  );

  return v_neu;
end;
$$;

comment on function public.set_take_along_items(uuid, text[]) is
  'PRX-007: setzt die Mitnehmen-Liste einer Person, normalisiert (Rand, Leeres, Doppel). Rollen wie update_patient; protokolliert patient.updated mit dem Feldnamen (ADR-010, ANN-138).';

revoke all on function public.set_take_along_items(uuid, text[]) from public, anon;
grant execute on function public.set_take_along_items(uuid, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 3a. Patientenkartei: die Liste am Ende angehaengt (Rumpf aus
-- 20260926130000_ux_003a_treatment_table.sql)
-- -----------------------------------------------------------------------------
create or replace view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.status,
  p.care_started_on,
  p.care_concluded_on,
  p.care_concluded_at,
  pe.given_name,
  pe.family_name,
  c.date_of_birth,
  c.email,
  c.phone,
  c.phone_work,
  c.phone_mobile,
  c.fax,
  c.institution,
  c.street,
  c.house_number,
  c.postal_code,
  c.city,
  cd.primary_therapist_staff_member_id,
  case
    when tp.id is null then null
    else tp.given_name || ' ' || tp.family_name
  end as primary_therapist_name,
  cd.home_visit_access_note,
  cd.special_note,
  cd.remark,
  c.geocode_precision,
  -- UX-003a: Behandlungsliege (ANN-116).
  cd.treatment_table_required,
  -- PRX-007: Mitnehmen (ANN-138).
  cd.take_along_items
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id
left join public.patient_care_details cd on cd.patient_id = p.id
left join public.staff_members tsm on tsm.id = cd.primary_therapist_staff_member_id
left join public.persons tp on tp.id = tsm.person_id;

-- -----------------------------------------------------------------------------
-- 3b. Auskunft nach Art. 15 DSGVO: die Liste gehoert zur Kopie (Rumpf aus
-- 20260928100000_prx_001_waitlist.sql)
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
        'created_at', ce.created_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
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

-- -----------------------------------------------------------------------------
-- 4. Tagesliste: die Liste am Behandlungstermin (Rumpf aus
-- 20260926130000_ux_003a_treatment_table.sql). Die Rueckgabe aendert sich,
-- deshalb neu angelegt und das Recht neu vergeben.
-- -----------------------------------------------------------------------------
drop function public.list_day_plan(date, uuid);

create function public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text, visit_lat double precision, visit_lon double precision, treatment_table_required boolean, take_along_items text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_evidence();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016). Am
      -- Trainingstermin gilt dasselbe, und zwar dauerhaft (ADR-022 Punkt 6).
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end,
      v_tz,
      -- MAP-006d: die Kartenposition des Hausbesuchs fuer den Handoff (ANN-018).
      a.visit_lat,
      a.visit_lon,
      -- UX-003b: Behandlungsliege nur am Behandlungstermin (ANN-116).
      case when a.kind = 'therapy' then coalesce(care.treatment_table_required, false) end,
      -- PRX-007: Mitnehmen nur am Behandlungstermin (ANN-138).
      case when a.kind = 'therapy' then coalesce(care.take_along_items, '{}'::text[]) end
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$function$;

comment on function public.list_day_plan(date, uuid) is
  'Tagesliste einer Person fuer einen Tag (UX-001) mit Adresse, Rufnummer, Zugangshinweis, seit MAP-006d der Kartenposition des Hausbesuchs, seit UX-003b der Behandlungsliege und seit PRX-007 der Mitnehmen-Liste am Behandlungstermin. Abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.list_day_plan(date, uuid) from public;
grant execute on function public.list_day_plan(date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Kurzblick: die Liste mit Person (Rumpf aus
-- 20260929100000_prx_006_appointment_brief.sql)
-- -----------------------------------------------------------------------------
drop function public.get_appointment_brief(uuid);

create function public.get_appointment_brief(p_appointment_id uuid)
returns table (
  appointment_id              uuid,
  patient_id                  uuid,
  home_visit_access_note      text,
  special_note                text,
  take_along_items            text[],
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
      coalesce(cd.take_along_items, '{}'::text[]),
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
  'PRX-006: Vertretungs-Kurzblick am Behandlungstermin - Zugangshinweis, Besonderheit, feste Therapeut:in, Mitnehmen (PRX-007), Stand der Grundlage und der letzte Haupteintrag vor diesem Termin im Wortlaut (ADR-006: auswaehlen, nicht deuten). Rollen: Termine und Dokumentation lesen. Protokolliert appointment_brief.viewed und fuer den gezeigten Eintrag treatment_note.viewed (ANN-137); abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.get_appointment_brief(uuid) from public, anon;
grant execute on function public.get_appointment_brief(uuid) to authenticated;
