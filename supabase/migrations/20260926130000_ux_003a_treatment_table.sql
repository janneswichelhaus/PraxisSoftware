-- =============================================================================
-- UX-003a: Behandlungsliege als Merkmal der Person (UX-EPIC-003, ANN-116)
--
-- PROJECT_PRINCIPLES.md 9: Ob an einem Tag eine Behandlungsliege mitzunehmen
-- ist, MUSS beim Tagesstart erkennbar sein - auch wenn erst ein spaeterer
-- Besuch sie braucht. Der Bedarf ist ein Merkmal der Person.
--
-- ANN-116: Das Merkmal ist eine organisatorische Versorgungsangabe wie der
-- Zugangshinweis (ANN-010) - es sagt, was mitzunehmen ist, nicht warum. Es
-- liegt deshalb in patient_care_details und erbt deren Rollenschnitt (alle
-- vier Praxisrollen, nicht das Patientenkonto) und Datenklasse (Patientenakte,
-- zehn Jahre nach Abschluss, ADR-008). Gesetzt wird es in der Akte ueber eine
-- eigene, kleine Funktion; ab FRB-EPIC-003 zusaetzlich im Befund.
--
-- Vier Teile:
--   1. Spalte treatment_table_required (Standard: nein)
--   2. set_treatment_table_required - Schreibpfad mit Audit patient.updated
--   3. patient_directory und export_patient_record tragen das Merkmal
--   4. list_day_plan liefert es am Behandlungstermin (UX-003b)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Spalte
-- -----------------------------------------------------------------------------
alter table public.patient_care_details
  add column treatment_table_required boolean not null default false;

comment on column public.patient_care_details.treatment_table_required is
  'Behandlungsliege mitnehmen (UX-003a, ANN-116). Organisatorisches Merkmal der Person wie der Zugangshinweis; der klinische Grund steht im Befund, nicht hier.';

-- -----------------------------------------------------------------------------
-- 2. Schreibpfad
--
-- Eigene Funktion statt eines weiteren Parameters an update_patient: Das
-- Merkmal wird mit einem Tap gesetzt, nicht im Stammdatenformular, und eine
-- neue Signatur von update_patient traefe jeden Aufrufer. Dieselbe
-- Rollenmenge wie update_patient (app.can_update_patient), dasselbe
-- Auditereignis mit dem Feldnamen als Metadatum (ADR-010, ADR-011).
-- -----------------------------------------------------------------------------
create function public.set_treatment_table_required(p_patient_id uuid, p_required boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft (ADR-004).
  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  if p_patient_id is null or p_required is null then
    raise exception 'patient and value are required' using errcode = '22023';
  end if;

  -- Nur in der eigenen Organisation suchen: ein fremder Patient ist von einer
  -- unbekannten ID nicht zu unterscheiden.
  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select cd.treatment_table_required into v_alt
  from public.patient_care_details cd
  where cd.patient_id = p_patient_id;

  if not found then
    insert into public.patient_care_details (
      patient_id, organization_id, treatment_table_required, created_by
    )
    values (p_patient_id, v_org, p_required, v_actor);
  elsif v_alt is distinct from p_required then
    update public.patient_care_details
       set treatment_table_required = p_required
     where patient_id = p_patient_id;
  else
    -- Keine tatsaechliche Aenderung: weder Schreibzugriff noch Auditeintrag,
    -- wie bei update_patient.
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.updated', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'changed_fields', jsonb_build_array('treatment_table_required'))
  );
end;
$$;

comment on function public.set_treatment_table_required(uuid, boolean) is
  'UX-003a: setzt das Merkmal Behandlungsliege einer Person. Rollen wie update_patient; protokolliert patient.updated mit dem Feldnamen (ADR-010, ANN-116).';

revoke all on function public.set_treatment_table_required(uuid, boolean) from public, anon;
grant execute on function public.set_treatment_table_required(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3a. Patientenkartei: das Merkmal am Ende angehaengt
--
-- security_invoker bleibt: Fuer ein Patientenkonto liefert der Left Join auf
-- patient_care_details null (ANN-010).
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
  cd.treatment_table_required
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id
left join public.patient_care_details cd on cd.patient_id = p.id
left join public.staff_members tsm on tsm.id = cd.primary_therapist_staff_member_id
left join public.persons tp on tp.id = tsm.person_id;

-- -----------------------------------------------------------------------------
-- 3b. Auskunft nach Art. 15 DSGVO: das Merkmal gehoert zur Kopie.
-- Rumpf sonst unveraendert aus 20260926110000_frb_002e_course_events.sql.
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
-- 4. Tagesliste: das Merkmal am Behandlungstermin (UX-003b)
--
-- Nur bei kind = 'therapy': Die Liege gehoert zur Behandlung. Am Training und
-- an einer Fehlzeit bleibt die Spalte leer - dort gibt es nichts mitzunehmen,
-- und eine Behandlungsangabe am Trainingstermin waere ein Durchgriff ueber den
-- gemeinsamen Kalender (ADR-022 Punkt 11). Der Rumpf ist sonst unveraendert
-- aus 20260925130000_map_006d_day_plan_coordinates.sql; weil sich die
-- Rueckgabe aendert, wird die Funktion neu angelegt und das Recht neu vergeben.
-- -----------------------------------------------------------------------------
drop function public.list_day_plan(date, uuid);

create function public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text, visit_lat double precision, visit_lon double precision, treatment_table_required boolean)
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
      case when a.kind = 'therapy' then coalesce(care.treatment_table_required, false) end
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
  'Tagesliste einer Person fuer einen Tag (UX-001) mit Adresse, Rufnummer, Zugangshinweis, seit MAP-006d der Kartenposition des Hausbesuchs und seit UX-003b der Behandlungsliege am Behandlungstermin. Abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.list_day_plan(date, uuid) from public;
grant execute on function public.list_day_plan(date, uuid) to authenticated;
