-- =============================================================================
-- LOG-EPIC-001, PR (a): die Lesepfade schreiben "Akte geoeffnet" statt *.viewed
--
-- Jede Funktion unten ist die bisherige Fassung, in der nur der Eintrag ins
-- Auditlog ersetzt ist:
--
--   * Lesepfade auf die Akte (Eintrag, Verlauf, Grundlage, Fragebogen,
--     Verlaufsereignis, Therapiebericht, Entwurfsbefund, Kurzblick,
--     Terminzettel) rufen app.log_record_access mit patient_record.viewed.
--     Bisher stand je gelesenem Eintrag eine Zeile im Log.
--   * Lesepfade auf das Trainingsverhaeltnis (Stammdaten, Protokolle) rufen
--     app.log_record_access mit training_relationship.viewed.
--   * issue_patient_file_link schreibt nur noch beim Herunterladen
--     (patient_file.downloaded); die Ausstellung des Verweises zum Anzeigen
--     bleibt, aber ohne Protokoll.
--   * list_audit_events und list_revenue_by_staff protokollieren ihr Lesen
--     nicht mehr (ADR-010 Fassung 3; Zweckbindung, keine Kontrolle von
--     Mitarbeitenden).
--   * record_patient_file_verification schreibt einen Befund als access.denied
--     mit operation patient_file.verification.
--
-- Die Abweisungen in diesen Funktionen bleiben, wie sie sind: Sie laufen ueber
-- app.record_denied_read und stehen damit als access.denied im Log.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_appointment_brief(p_appointment_id uuid)
 RETURNS TABLE(appointment_id uuid, patient_id uuid, home_visit_access_note text, special_note text, take_along_items text[], primary_therapist_name text, treatment_basis_id uuid, treatment_basis_kind text, treatment_basis_issued_on date, basis_appointment_count integer, basis_used integer, basis_planned integer, basis_items jsonb, last_note_id uuid, last_note_appointment_start timestamp with time zone, last_note_status text, last_note_content text, last_note_visit_without_treatment boolean, last_note_author_name text, organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and a.organization_id = v_org
    -- Zweitreview: Ein Termin aus einem Bereich, den die Rolle nicht sieht
    -- (ADR-022 Punkt 11), ist von einem unbekannten nicht zu unterscheiden.
    and app.may_read_appointment_context(a.kind);

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

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient);


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
$function$;

CREATE OR REPLACE FUNCTION public.get_therapy_report(p_report_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, treatment_basis_id uuid, status text, report_text text, recommendation text, note_ids uuid[], body_chart_response_id uuid, updated_at timestamp with time zone, document jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  b       public.therapy_reports%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'therapy_report.viewed', 'not allowed to read therapy reports');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org;
  if not found then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', b.patient_id);

  return query
    select b.id, b.patient_id, b.treatment_basis_id, b.status, b.report_text,
           b.recommendation, b.note_ids, b.body_chart_response_id, b.updated_at,
           case when b.status = 'abgeschlossen' then b.snapshot
                else app.therapy_report_dokument(b.id) end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_training_client(p_relationship_id uuid)
 RETURNS TABLE(id uuid, person_id uuid, given_name text, family_name text, status text, contract_started_on date, contract_ended_on date, date_of_birth date, email text, phone text, street text, house_number text, postal_code text, city text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(v_actor, 'training_relationship.viewed', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id);

  return query
    select t.id, t.person_id, pe.given_name, pe.family_name, t.status,
           t.contract_started_on, t.contract_ended_on,
           d.date_of_birth, d.email, d.phone, d.street, d.house_number, d.postal_code, d.city
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details d on d.training_relationship_id = t.id
    where t.id = p_relationship_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_training_protocol(p_appointment_id uuid)
 RETURNS TABLE(id uuid, appointment_id uuid, status text, content text, created_at timestamp with time zone, updated_at timestamp with time zone, finalized_at timestamp with time zone, author_name text, finalized_by_name text, addenda jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_rel   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ABN-022 (BEF-113): Lesen ist getrennt vom Schreiben; das Buero liest.
  if not app.can_read_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_protocol.viewed', 'not allowed to read training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training protocols' using errcode = '42501';
  end if;

  select a.training_relationship_id into v_rel
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org and a.kind = 'training';

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.training_protocols p where p.appointment_id = p_appointment_id) then
    perform app.log_record_access(v_org, v_actor, 'training_relationship.viewed', 'training_relationship', v_rel);
  end if;

  return query
    select p.id, p.appointment_id, p.status, p.content, p.created_at, p.updated_at,
           p.finalized_at, verfasser.display_name, abschluss.display_name,
           -- ABN-022 (BEF-113): Nachtraege unter dem Text, aelteste zuerst.
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', n.id,
                      'content', n.content,
                      'reason', n.reason,
                      'created_at', n.created_at,
                      'author_name', na.display_name
                    ) order by n.created_at)
             from public.training_protocol_addenda n
             left join public.user_profiles na on na.id = n.created_by
             where n.protocol_id = p.id
           ), '[]'::jsonb)
    from public.training_protocols p
    left join public.user_profiles verfasser on verfasser.id = p.created_by
    left join public.user_profiles abschluss on abschluss.id = p.finalized_by
    where p.appointment_id = p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_treatment_basis(p_treatment_basis_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, appointment_count integer, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text, diagnosis_icd10 text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_basis_clinical() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  -- Eine fremde und eine unbekannte ID liefern beide nichts.
  if not found then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient_id);

  return query
    select
      p.id,
      p.patient_id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.appointment_count,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      -- Drei Bestandstexte: Das Formular bietet sie seit VER-EPIC-002 nicht
      -- mehr zur Eingabe an, zeigt sie aber weiter an - sonst waere ein
      -- vorhandener Text unsichtbar und damit faktisch verloren.
      p.therapy_goal,
      p.prescriber_note,
      p.follow_up_recommendation,
      p.diagnosis_icd10
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = p_treatment_basis_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_treatment_draft_findings(p_appointment_id uuid)
 RETURNS TABLE(findings jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    perform app.record_denied_read(v_actor, 'treatment_draft_findings.viewed', 'not allowed to read draft findings');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read draft findings' using errcode = '42501';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;
  if not found then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.treatment_draft_findings f where f.appointment_id = p_appointment_id and f.organization_id = v_org) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient);
  end if;

  return query
    select f.findings, f.updated_at
    from public.treatment_draft_findings f
    where f.appointment_id = p_appointment_id and f.organization_id = v_org;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_treatment_note(p_appointment_id uuid)
 RETURNS TABLE(id uuid, appointment_id uuid, addendum_to_note_id uuid, status text, content text, visit_without_treatment boolean, created_at timestamp with time zone, updated_at timestamp with time zone, finalized_at timestamp with time zone, finalisation_kind text, version_count integer, author_name text, last_editor_name text, finalized_by_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id and t.organization_id = v_org) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient);
  end if;

  return query
    select t.id,
           t.appointment_id,
           t.addendum_to_note_id,
           t.status,
           t.content,
           t.visit_without_treatment,
           t.created_at,
           t.updated_at,
           t.finalized_at,
           t.finalisation_kind,
           (select count(*) from public.treatment_note_versions v where v.note_id = t.id)::integer,
           verfasser.display_name,
           bearbeiter.display_name,
           finalisierer.display_name
    from public.treatment_notes t
    left join public.user_profiles verfasser    on verfasser.id    = t.created_by
    left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
    left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
    where t.appointment_id = p_appointment_id
      and t.organization_id = v_org
    order by (t.addendum_to_note_id is not null), t.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_treatment_note_versions(p_note_id uuid)
 RETURNS TABLE(version_no integer, content text, change_reason text, recorded_at timestamp with time zone, author_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_note    record;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.history_viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select t.id, t.appointment_id
    into v_note
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org;

  if not found then
    return;
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_note.appointment_id;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient);

  return query
    select v.version_no,
           v.content,
           v.change_reason,
           v.recorded_at,
           urheber.display_name
    from public.treatment_note_versions v
    left join public.user_profiles urheber on urheber.id = v.author_id
    where v.note_id = p_note_id
    order by v.version_no;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_appointment_slip(p_patient_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, location_name text, staff_given_name text, staff_family_name text, organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_actor uuid;
  v_limit integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Wer den Kalender lesen darf, darf den Zettel drucken.
  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_record.viewed', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  -- Eine unbekannte und eine fremde ID liefern dieselbe leere Antwort und
  -- erzeugen keinen Auditeintrag (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      l.name,
      sp.given_name,
      sp.family_name,
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and a.starts_at > now()
      -- Nur bestaetigte Termine: ein abgesagter gehoert nicht auf einen Zettel,
      -- den jemand mitnimmt (ADR-018).
      and a.status = 'confirmed'
    order by a.starts_at, a.id
    limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_course_events(p_patient_id uuid)
 RETURNS TABLE(id uuid, occurred_on date, kind text, note text, created_at timestamp with time zone, author_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'patient_course_event.viewed', 'not allowed to read course events');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read course events' using errcode = '42501';
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.patient_course_events e where e.patient_id = p_patient_id and e.organization_id = v_org and e.removed_at is null) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select e.id, e.occurred_on, e.kind, e.note, e.created_at, up.display_name
    from public.patient_course_events e
    left join public.user_profiles up on up.id = e.created_by
    where e.patient_id = p_patient_id and e.organization_id = v_org and e.removed_at is null
    order by e.occurred_on, e.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_questionnaire_responses(p_patient_id uuid)
 RETURNS TABLE(id uuid, instrument_id text, definition_version text, status text, recorded_on date, answers jsonb, supersedes_response_id uuid, superseded_by_response_id uuid, change_reason text, created_at timestamp with time zone, updated_at timestamp with time zone, completed_at timestamp with time zone, author_name text, completed_by_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'questionnaire_response.viewed', 'not allowed to read questionnaires');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read questionnaires' using errcode = '42501';
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.patient_questionnaire_responses r where r.patient_id = p_patient_id and r.organization_id = v_org) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select
      r.id,
      r.instrument_id,
      r.definition_version,
      r.status,
      r.recorded_on,
      r.answers,
      r.supersedes_response_id,
      nachfolger.id,
      r.change_reason,
      r.created_at,
      r.updated_at,
      r.completed_at,
      verfasser.display_name,
      abschluss.display_name
    from public.patient_questionnaire_responses r
    left join public.patient_questionnaire_responses nachfolger
           on nachfolger.supersedes_response_id = r.id
    left join public.user_profiles verfasser on verfasser.id = r.created_by
    left join public.user_profiles abschluss on abschluss.id = r.completed_by
    where r.patient_id = p_patient_id and r.organization_id = v_org
    order by r.recorded_on desc, r.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_therapy_reports(p_patient_id uuid)
 RETURNS TABLE(id uuid, treatment_basis_id uuid, status text, created_at timestamp with time zone, author_name text, completed_at timestamp with time zone, completed_on date, completed_by_name text, recommendation text, recommendation_by_name text, recommendation_on date, supersedes_report_id uuid, superseded_by_report_id uuid, change_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_tz    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'therapy_report.viewed', 'not allowed to read therapy reports');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = v_org;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.therapy_reports r where r.patient_id = p_patient_id and r.organization_id = v_org) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select r.id, r.treatment_basis_id, r.status, r.created_at,
           (select up.display_name from public.user_profiles up where up.id = r.created_by),
           r.completed_at,
           (r.completed_at at time zone v_tz)::date,
           (select up.display_name from public.user_profiles up where up.id = r.completed_by),
           -- Nur beim abgeschlossenen Bericht: Ein Entwurf ist noch keine
           -- Empfehlung an irgendwen, und die Liste braucht ihn nicht.
           r.snapshot -> 'empfehlung' ->> 'inhalt',
           r.snapshot -> 'empfehlung' ->> 'verfasser',
           (r.snapshot -> 'empfehlung' ->> 'datum')::date,
           -- ABN-016 (BEF-104): die Kette der Korrekturen.
           r.supersedes_report_id,
           (select n.id from public.therapy_reports n where n.supersedes_report_id = r.id),
           r.change_reason
    from public.therapy_reports r
    where r.patient_id = p_patient_id and r.organization_id = v_org
    order by r.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_treatment_bases_clinical(p_patient_id uuid)
 RETURNS TABLE(id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text, diagnosis_icd10 text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Rollenmenge wie bei der Behandlungsdokumentation: die Grundlage
  -- oeffnet keinen zweiten Weg zu klinischem Freitext (4.3, 4.6).
  if not app.can_read_treatment_basis_clinical() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_ids := app.patient_treatment_basis_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if coalesce(cardinality(v_ids), 0) > 0 then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select
      p.id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      p.therapy_goal,
      p.prescriber_note,
      -- ANN-014: die Empfehlung der Therapeut:in, von ihr selbst erfasst.
      p.follow_up_recommendation,
      p.diagnosis_icd10
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_patient_treatment_notes(p_patient_id uuid, p_limit integer DEFAULT 20, p_before_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(appointment_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, appointment_status text, staff_given_name text, staff_family_name text, organization_time_zone text, notes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_seite uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select array_agg(s.appointment_id order by s.starts_at desc, s.appointment_id desc)
    into v_seite
  from app.patient_record_page(
         v_org, p_patient_id, p_limit, p_before_starts_at, p_before_id
       ) s;

  if v_seite is null then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.treatment_notes t where t.appointment_id = any (v_seite)) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      o.time_zone,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id',                  t.id,
                   'appointment_id',      t.appointment_id,
                   'addendum_to_note_id', t.addendum_to_note_id,
                   'status',              t.status,
                   'content',             t.content,
                   -- Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018).
                   'visit_without_treatment', t.visit_without_treatment,
                   'created_at',          t.created_at,
                   'updated_at',          t.updated_at,
                   'finalized_at',        t.finalized_at,
                   'finalisation_kind',   t.finalisation_kind,
                   'version_count',       (select count(*)
                                             from public.treatment_note_versions v
                                            where v.note_id = t.id),
                   'author_name',         verfasser.display_name,
                   'last_editor_name',    bearbeiter.display_name,
                   'finalized_by_name',   finalisierer.display_name
                 )
                 order by (t.addendum_to_note_id is not null), t.created_at
               )
        from public.treatment_notes t
        left join public.user_profiles verfasser    on verfasser.id    = t.created_by
        left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
        left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
        where t.appointment_id = a.id
      ), '[]'::jsonb)
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.id = any (v_seite)
    order by a.starts_at desc, a.id desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_removed_patient_course_events(p_patient_id uuid)
 RETURNS TABLE(id uuid, occurred_on date, kind text, note text, created_at timestamp with time zone, author_name text, removed_at timestamp with time zone, removed_by_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'patient_course_event.viewed', 'not allowed to read course events');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read course events' using errcode = '42501';
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.patient_course_events e where e.patient_id = p_patient_id and e.organization_id = v_org and e.removed_at is not null) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select e.id, e.occurred_on, e.kind, e.note, e.created_at, up.display_name,
           e.removed_at, rp.display_name
    from public.patient_course_events e
    left join public.user_profiles up on up.id = e.created_by
    left join public.user_profiles rp on rp.id = e.removed_by
    where e.patient_id = p_patient_id and e.organization_id = v_org and e.removed_at is not null
    order by e.removed_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_therapy_report_sources(p_report_id uuid)
 RETURNS TABLE(kind text, id uuid, occurred_on date, author_name text, content text, in_treatment_basis boolean, is_addendum boolean, body_chart jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_tz    text;
  b       public.therapy_reports%rowtype;
  v_notizen uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to write therapy reports');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = v_org;

  select coalesce(array_agg(n.id), '{}') into v_notizen
  from (
    select d.id
    from public.treatment_notes d
    join public.appointments t on t.id = d.appointment_id
    where t.patient_id = b.patient_id and t.organization_id = v_org and d.status = 'final'
    order by t.starts_at desc, d.created_at desc
    limit 200
  ) n;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if coalesce(cardinality(v_notizen), 0) > 0 then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', b.patient_id);
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.patient_questionnaire_responses qr where qr.patient_id = b.patient_id and qr.organization_id = v_org and qr.status = 'abgeschlossen' and not exists (select 1 from public.patient_questionnaire_responses neu where neu.supersedes_response_id = qr.id and neu.status = 'abgeschlossen') and exists (select 1 from jsonb_each(qr.answers) as a(kennung, antwort) where jsonb_typeof(a.antwort) = 'object' and a.antwort ? 'markierungen')) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', b.patient_id);
  end if;

  return query
    select 'eintrag'::text, d.id, (t.starts_at at time zone v_tz)::date,
           (select up.display_name from public.user_profiles up where up.id = d.created_by),
           d.content,
           t.treatment_basis_id is not distinct from b.treatment_basis_id,
           d.addendum_to_note_id is not null,
           null::jsonb
    from public.treatment_notes d
    join public.appointments t on t.id = d.appointment_id
    where d.id = any (v_notizen)
    union all
    select 'koerperschema'::text, qr.id, qr.recorded_on,
           (select up.display_name from public.user_profiles up where up.id = qr.created_by),
           null::text, null::boolean, false,
           (select coalesce(jsonb_agg(m.markierung), '[]'::jsonb)
            from jsonb_each(qr.answers) as a(kennung, antwort),
                 jsonb_array_elements(
                   case when jsonb_typeof(a.antwort -> 'markierungen') = 'array'
                        then a.antwort -> 'markierungen' else '[]'::jsonb end
                 ) as m(markierung))
    from public.patient_questionnaire_responses qr
    where qr.patient_id = b.patient_id and qr.organization_id = v_org
      and qr.status = 'abgeschlossen'
      and not exists (select 1 from public.patient_questionnaire_responses neu
                      where neu.supersedes_response_id = qr.id and neu.status = 'abgeschlossen')
      and exists (select 1 from jsonb_each(qr.answers) as a(kennung, antwort)
                  where jsonb_typeof(a.antwort) = 'object' and a.antwort ? 'markierungen')
    order by 1, 3, 2;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_training_protocols(p_relationship_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, appointment_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, staff_given_name text, staff_family_name text, status text, content text, finalized_at timestamp with time zone, author_name text, organization_time_zone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ABN-022 (BEF-113): Lesen ist getrennt vom Schreiben; das Buero liest.
  if not app.can_read_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_protocol.viewed', 'not allowed to read training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training protocols' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  select array_agg(s.id)
    into v_ids
  from (
    select p.id
    from public.training_protocols p
    join public.appointments a on a.id = p.appointment_id
    where p.training_relationship_id = p_relationship_id
      and p.organization_id = v_org
    order by a.starts_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) s;

  if v_ids is null then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  if exists (select 1 from public.training_protocols p where p.id = any (v_ids)) then
    perform app.log_record_access(v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id);
  end if;

  return query
    select p.id, p.appointment_id, a.starts_at, a.ends_at, a.appointment_type,
           sp.given_name, sp.family_name, p.status, p.content, p.finalized_at,
           verfasser.display_name, o.time_zone
    from public.training_protocols p
    join public.appointments a   on a.id  = p.appointment_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = p.organization_id
    left join public.user_profiles verfasser on verfasser.id = p.created_by
    where p.id = any (v_ids)
    order by a.starts_at desc, p.id desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_patient_record_view(p_patient_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.organization_id
    into v_org
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = app.current_organization_id()
    and app.can_read_patient_directory();

  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
end;
$function$;

-- Neu: denied_operation und denied_count fuer access.denied. Der uebrige
-- context bleibt verborgen. Der geaenderte Rueckgabetyp verlangt drop/create.
drop function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer);

CREATE FUNCTION public.list_audit_events(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_actor_user_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, occurred_at timestamp with time zone, actor_user_id uuid, actor_kind text, actor_display_name text, action text, subject_type text, subject_id uuid, outcome text, denied_operation text, denied_count integer, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_limit  integer;
  v_offset integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Rolle und Organisation werden hier geprueft, weil SECURITY DEFINER die
  -- RLS umgeht. Ohne diese Pruefung waere die Funktion ein offener Kanal.
  -- OPS-004: Abgewiesen wird mit null Zeilen und einem Auditeintrag, nicht
  -- mit einer Ausnahme - die rollte den Eintrag mit zurueck.
  if not app.has_any_role('owner') then
    perform app.record_denied_owner_read(v_actor, 'audit_log.read', 'audit log access denied');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'audit log access denied' using errcode = '42501';
  end if;

  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    a.id,
    a.occurred_at,
    a.actor_user_id,
    a.actor_kind,
    up.display_name,
    a.action,
    a.subject_type,
    a.subject_id,
    a.outcome,
    case when a.action = 'access.denied' then a.context ->> 'operation' end,
    case when a.action = 'access.denied' then coalesce((a.context ->> 'count')::integer, 1) end,
    count(*) over () as total_count
  from public.audit_log a
  left join public.user_profiles up
    on up.id = a.actor_user_id
   and up.organization_id = v_org
  where a.organization_id = v_org
    and (p_from is null          or a.occurred_at >= p_from)
    and (p_to is null            or a.occurred_at <  p_to)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_action is null        or a.action = p_action)
  order by a.occurred_at desc, a.id desc
  limit v_limit offset v_offset;

  -- Das Lesen des Protokolls wird nicht protokolliert (ADR-010 Fassung 3).
end;
$function$;

comment on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer) is
  'Liest das Auditlog der eigenen Organisation, nur owner (ADR-010 Punkt 13). Ohne context; fuer access.denied nur Operation und Zaehler. Das Lesen selbst wird nicht protokolliert (LOG-EPIC-001).';

revoke all on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer)
  to authenticated;

CREATE OR REPLACE FUNCTION public.list_revenue_by_staff(p_months integer DEFAULT 6)
 RETURNS TABLE(month date, staff_member_id uuid, staff_name text, revenue_cents bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_tz     text;
  v_bis    date;
  v_von    date;
  v_eigene uuid;
  v_alle   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  v_alle := app.has_any_role('owner');
  if not v_alle and v_org is not null then
    select sm.id into v_eigene
    from public.staff_members sm
    where sm.organization_id = v_org
      and sm.person_id = app.current_person_id();
  end if;

  if not v_alle and (v_eigene is null or not app.has_revenue_share(v_eigene, v_org)) then
    perform app.record_denied_read(v_actor, 'statistics.read', 'not allowed to read revenue by staff');
    return;
  end if;
  if v_org is null then
    raise exception 'not allowed to read revenue by staff' using errcode = '42501';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'months out of range' using errcode = '22023';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_bis := (date_trunc('month', (now() at time zone v_tz)::date) + interval '1 month')::date;
  v_von := (v_bis - make_interval(months => p_months))::date;


  return query
  with zugeordnet as (
    select date_trunc('month', l.tag)::date as monat, l.staff_member_id as person, sum(l.betrag)::bigint as summe
    from app.revenue_staff_lines(v_org, v_von, v_bis) l
    where v_alle or l.staff_member_id = v_eigene
    group by 1, 2
  ),
  praxis as (
    select date_trunc('month', r.tag)::date as monat, sum(r.betrag)::bigint as summe
    from app.revenue_documents(v_org, v_von, v_bis) r
    group by 1
  ),
  rest as (
    -- Nur fuer owner: was keiner Person zugeordnet werden kann.
    select coalesce(p.monat, z.monat) as monat,
           coalesce(p.summe, 0) - coalesce(z.summe, 0) as summe
    from praxis p
    full join (
      select monat, sum(summe)::bigint as summe
      from zugeordnet
      where person is not null
      group by monat
    ) z on z.monat = p.monat
    where v_alle
  ),
  alles as (
    select z.monat, z.person, z.summe from zugeordnet z where z.person is not null
    union all
    select r.monat, null::uuid, r.summe from rest r
  )
  select a.monat,
         a.person,
         case when a.person is null then null
              else nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), '') end,
         sum(a.summe)::bigint
  from alles a
  left join public.staff_members sm on sm.id = a.person
  left join public.persons pe       on pe.id = sm.person_id
  group by 1, 2, 3
  having sum(a.summe) <> 0
  order by 1, 3 nulls last, 2;
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_patient_file_link(p_file_id uuid, p_download boolean DEFAULT false)
 RETURNS TABLE(bucket_id text, object_key text, display_name text, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'ready';

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_see_patient_file_type(v_datei.document_type) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Punkt 36: Ein widerrufenes oder faelliges Foto bekommt keinen Verweis -
  -- auch nicht unter Legal Hold. Dieselbe Meldung wie eine fremde Datei.
  if v_datei.document_type = 'patientenfoto'
     and not app.patient_photo_accessible(
       v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
     ) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- ABN-027 (ADR-017 Punkt 55): Herunterladen ist eine eigene Aktion, nicht
  -- fuer die beiden Fotoarten (Punkt 40, ANN-128).
  if coalesce(p_download, false) and app.is_patient_photo_type(v_datei.document_type) then
    raise exception 'photos cannot be downloaded' using errcode = '42501';
  end if;

  -- Protokolliert wird nur das Herunterladen, nicht das Anzeigen (LOG-EPIC-001).
  if coalesce(p_download, false) then
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_datei.organization_id, v_actor, 'patient_file.downloaded', 'patient_file', p_file_id, 'success',
      jsonb_build_object('surface', 'web', 'patient_id', v_datei.patient_id,
                         'document_type', v_datei.document_type)
    );
  end if;

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
    select app.patient_file_bucket_for(v_datei.document_type), v_datei.object_key,
           v_datei.display_name, v_datei.mime_type;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_patient_file_verification(p_file_id uuid, p_content_type_ok boolean, p_checksum_ok boolean, p_metadata_ok boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Zweitreview Befund 2: Eine Datei unter Legal Hold wird nie verworfen,
  -- auch nicht nach Befund (ADR-017 Punkt 24, ANN-033). Der Befund steht im
  -- Protokoll; die Datei bleibt ungeprueft.
  if app.under_legal_hold(v_datei.organization_id, 'patient', v_datei.patient_id) then
    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    values (
      v_datei.organization_id, null, 'system', 'access.denied', 'patient_file',
      p_file_id, 'denied',
      jsonb_build_object(
        'surface', 'edge_function',
        'operation', 'patient_file.verification',
        'patient_id', v_datei.patient_id,
        'document_type', v_datei.document_type,
        'content_type_ok', p_content_type_ok,
        'checksum_ok', p_checksum_ok,
        'metadata_ok', p_metadata_ok,
        'was_ready', v_datei.status = 'ready',
        'held', true
      )
    );
    return 'held';
  end if;

  -- Punkt 52: Befund heisst verwerfen. Das Protokoll nennt, welche Pruefung
  -- anschlug - nie Name, Schluessel oder Inhalt (ADR-010 Punkt 3).
  -- ANN-009: ein Ereignis ohne handelnden Account (der Dienst) ist 'system'.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, null, 'system', 'access.denied', 'patient_file', p_file_id,
    'denied',
    jsonb_build_object(
      'surface', 'edge_function',
        'operation', 'patient_file.verification',
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
$function$;
