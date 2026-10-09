-- =============================================================================
-- KOM-004 (KOM-EPIC-001): Klinisch Relevantes kommt in die Akte
--
-- PROJECT_PRINCIPLES.md 10: "Erkennt eine Therapeut:in klinischen Inhalt in
-- einer Nachricht, MUSS sie ihn der Patientenakte zuordnen." IDEA-KOM-007:
-- mit sichtbarer Herkunft und ohne den Inhalt zu veraendern. ADR-016, ADR-008.
--
--   public.assign_platform_message_to_record   die Zuordnung (ANN-312)
--   public.list_record_platform_messages       die zugeordneten Vorgaenge in
--                                              der Akte, mit Text
--   public.get_platform_message                + can_assign
--   public.export_patient_record               + platform_messages (Art. 15)
--   public.platform_export                     + messages (POR-018)
--   public.merge_patients                      Rueckfragen ziehen mit (PRX-018)
--   app.reduce_training_relationship           Rueckfragen fallen nach drei Jahren
--
-- Die Zuordnung ist ein VERWEIS am Vorgang, keine Kopie (ANN-312): Der Vorgang
-- liegt schon im Behandlungsverhaeltnis, seine Eintraege sind unveraenderlich
-- (ANN-308). Sie ist endgueltig - was in der Akte steht, wird nicht wieder
-- herausgenommen (Par. 630f BGB) - und wechselt die Datenklasse: von
-- "Patientenkommunikation" (drei Jahre) zu "Patientenakte" (zehn Jahre ab
-- Abschluss der Versorgung); der Loeschlauf laesst zugeordnete Vorgaenge seit
-- KOM-001 stehen. Wer und wann steht am Datensatz, nicht im Auditlog (ADR-010
-- Fassung 3 Punkt 15).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer zuordnet: die Rollen, die dokumentieren (ADR-016 Punkt 1, ADR-004
--    Punkt 3 - das Buero schreibt keine klinische Dokumentation).
-- -----------------------------------------------------------------------------
create function app.can_assign_platform_message(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_kind = 'treatment' and app.has_any_role('owner', 'therapist', 'team_lead')
$$;

revoke all on function app.can_assign_platform_message(text) from public, anon, authenticated;

comment on function app.can_assign_platform_message(text) is
  'KOM-004 (ANN-312): wer einen Vorgang der Akte zuordnet - owner, Therapeut:innen, Teamleitung; nur in der Behandlung (im Training gibt es keine Akte, ADR-021).';

create function public.assign_platform_message_to_record(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to assign platform messages' using errcode = '42501';
  end if;
  v_vorgang := app.practice_message(p_message_id, false);
  if not app.can_assign_platform_message(v_vorgang.relationship_kind) then
    raise exception 'not allowed to assign platform messages' using errcode = '42501';
  end if;
  if v_vorgang.record_assigned_at is not null then
    raise exception 'message already assigned' using errcode = '22023';
  end if;

  update public.platform_messages m
     set record_assigned_at = now(),
         record_assigned_by = auth.uid(),
         record_assigned_by_label = app.current_display_name()
   where m.id = v_vorgang.id and m.record_assigned_at is null;
end;
$$;

revoke all on function public.assign_platform_message_to_record(uuid) from public, anon;
grant execute on function public.assign_platform_message_to_record(uuid) to authenticated;

comment on function public.assign_platform_message_to_record(uuid) is
  'KOM-004 (ANN-312): einen Vorgang der Behandlung der Akte zuordnen - endgueltig, ohne den Inhalt zu veraendern. Wer und wann am Datensatz.';

-- Die Zuordnung ist endgueltig: kein Weg zurueck, auch nicht ueber ein
-- spaeteres Update (ANN-312).
create function app.platform_messages_record_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.record_assigned_at is not null and (
       new.record_assigned_at is distinct from old.record_assigned_at
       or new.record_assigned_by is distinct from old.record_assigned_by
       or new.record_assigned_by_label is distinct from old.record_assigned_by_label
       or new.topic is distinct from old.topic
       -- Nur das Zusammenfuehren zweier Akten verschiebt einen zugeordneten
       -- Vorgang mit (PRX-018, merge_patients).
       or (new.relationship_id is distinct from old.relationship_id
           and not app.patient_merge_active())
     ) then
    raise exception 'record assignment is final' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger platform_messages_record_final
  before update on public.platform_messages
  for each row execute function app.platform_messages_record_final();

-- -----------------------------------------------------------------------------
-- 2. In der Akte: die zugeordneten Vorgaenge mit ihren Eintraegen
--
-- Lesen ist "Akte geoeffnet" (einmal je Tag), wie jeder Inhalt der Akte.
-- -----------------------------------------------------------------------------
create function public.list_record_platform_messages(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null or not app.may_read_platform_messages('treatment') then
    raise exception 'not allowed to read platform messages' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if not exists (select 1 from public.patients p
                 where p.id = p_patient_id and p.organization_id = v_org) then
    return '[]'::jsonb;
  end if;
  perform app.log_record_access(v_org, auth.uid(), 'patient_record.viewed', 'patient', p_patient_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'topic', m.topic,
      'reference_label', m.reference_label,
      'status', m.status,
      'created_at', m.created_at,
      'record_assigned_at', m.record_assigned_at,
      'record_assigned_by_label', m.record_assigned_by_label,
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'side', e.side,
          'body', e.body,
          'author_kind', e.author_kind,
          'author_label', e.author_label,
          'created_at', e.created_at
        ) order by e.created_at, e.id)
        from public.platform_message_entries e where e.message_id = m.id
      ), '[]'::jsonb)
    ) order by m.created_at desc, m.id)
    from public.platform_messages m
    where m.organization_id = v_org
      and m.patient_id = p_patient_id
      and m.record_assigned_at is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_record_platform_messages(uuid) from public, anon;
grant execute on function public.list_record_platform_messages(uuid) to authenticated;

comment on function public.list_record_platform_messages(uuid) is
  'KOM-004: die der Akte zugeordneten Vorgaenge mit allen Eintraegen und ihrer Herkunft (IDEA-KOM-007). Lesen die vier Praxisrollen (E15); protokolliert als "Akte geoeffnet".';

-- -----------------------------------------------------------------------------
-- 3. get_platform_message: + can_assign. Rumpf sonst unveraendert aus
--    20261020110000_kom_002_practice_messages.sql.
-- -----------------------------------------------------------------------------
create or replace function public.get_platform_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_vorgang public.platform_messages%rowtype;
  v_name    record;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to read platform messages' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  v_vorgang := app.practice_message(p_message_id, false);

  select pe.given_name, pe.family_name into v_name
  from public.persons pe
  where pe.id = coalesce(
    (select pa.person_id from public.patients pa where pa.id = v_vorgang.patient_id),
    (select t.person_id from public.training_relationships t
      where t.id = v_vorgang.training_relationship_id));

  if v_vorgang.relationship_kind = 'treatment' then
    perform app.log_record_access(v_org, auth.uid(), 'patient_record.viewed', 'patient',
                                  v_vorgang.patient_id);
  else
    perform app.log_record_access(v_org, auth.uid(), 'training_relationship.viewed',
                                  'training_relationship', v_vorgang.training_relationship_id);
  end if;

  return jsonb_build_object(
    'id', v_vorgang.id,
    'relationship_kind', v_vorgang.relationship_kind,
    'relationship_id', v_vorgang.relationship_id,
    'patient_id', v_vorgang.patient_id,
    'training_relationship_id', v_vorgang.training_relationship_id,
    'given_name', v_name.given_name,
    'family_name', v_name.family_name,
    'topic', v_vorgang.topic,
    'reference_label', v_vorgang.reference_label,
    'exercise_plan_id', v_vorgang.exercise_plan_id,
    'status', v_vorgang.status,
    'due_on', v_vorgang.due_on,
    'overdue', v_vorgang.status = 'open' and v_vorgang.due_on < app.training_today(v_org),
    'created_at', v_vorgang.created_at,
    'closed_at', v_vorgang.closed_at,
    'closed_by_side', v_vorgang.closed_by_side,
    'record_assigned_at', v_vorgang.record_assigned_at,
    'record_assigned_by_label', v_vorgang.record_assigned_by_label,
    'can_answer', app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic),
    'can_assign', app.can_assign_platform_message(v_vorgang.relationship_kind)
                  and v_vorgang.record_assigned_at is null,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'side', e.side,
        'body', e.body,
        'author_kind', e.author_kind,
        'author_label', e.author_label,
        'created_at', e.created_at
      ) order by e.created_at, e.id)
      from public.platform_message_entries e
      where e.message_id = v_vorgang.id
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Auskunft nach Art. 15: + platform_messages. Rumpf sonst unveraendert aus
--    20261019120000_ueb_011_exercise_days.sql.
-- -----------------------------------------------------------------------------
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

    -- ANG-001: das Nachsorge-Abo mit Beginn, Ende und Kuendigung (Art. 15).
    'aftercare_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_on', s.starts_on,
        'ends_on', s.ends_on,
        'created_at', s.created_at,
        'cancelled_on', s.cancelled_on,
        'cancelled_via', s.cancelled_via,
        'cancelled_access_kind', s.cancelled_access_kind,
        'cancelled_representative_name', s.cancelled_representative_name
      ) order by s.starts_on)
      from public.aftercare_subscriptions s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KND-002: die Trainingsangebote aus der Akte mit Uebergabeangaben (Art. 15).
    'training_offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.label,
        'starts_on', o.starts_on,
        'valid_until', o.valid_until,
        'handover_items', o.handover_items,
        'offers_contact', o.offers_contact,
        'created_at', o.created_at,
        'withdrawn_at', o.withdrawn_at
      ) order by o.created_at)
      from public.training_offers o
      join public.service_catalog_items c on c.id = o.catalog_item_id
      where o.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- UEB-005: die Uebungsplaene der Behandlung mit Positionen (Art. 15).
    'exercise_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', x.title,
        'status', x.status,
        'sessions_per_week', x.sessions_per_week,
        'created_at', x.created_at,
        'assigned_at', x.assigned_at,
        'runs_from', x.runs_from,
        'runs_until', x.runs_until,
        'ended_at', x.ended_at,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(xi) - 'id' - 'variant_id'
                           - 'previous_item_id' - 'variant_archived' order by xi.position)
          from public.exercise_plan_items xi where xi.plan_id = x.id
        ), '[]'::jsonb),
        -- UEB-011: die Uebungstage, die die Person an diesem Plan gewaehlt hat.
        'weekdays', (select to_jsonb(d.weekdays) from public.exercise_plan_days d
                     where d.plan_id = x.id),
        -- UEB-010: die durchgefuehrten Einheiten, ohne interne Kennung.
        'sessions', (
          select coalesce(jsonb_agg(z - 'id'), '[]'::jsonb)
          from jsonb_array_elements(app.exercise_plan_sessions_json(x.id)) z
        )
      ) order by x.created_at)
      from public.exercise_plans x
      where x.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KOM-004: die Rueckfragen ueber die Plattform mit allen Eintraegen
    -- (Art. 15), zugeordnete und nicht zugeordnete.
    'platform_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'topic', m.topic,
        'reference_label', m.reference_label,
        'status', m.status,
        'created_at', m.created_at,
        'closed_at', m.closed_at,
        'record_assigned_at', m.record_assigned_at,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'side', e.side,
            'author_kind', e.author_kind,
            'author_label', e.author_label,
            'body', e.body,
            'created_at', e.created_at
          ) order by e.created_at, e.id)
          from public.platform_message_entries e where e.message_id = m.id
        ), '[]'::jsonb)
      ) order by m.created_at)
      from public.platform_messages m
      where m.patient_id = p_patient_id
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

-- -----------------------------------------------------------------------------
-- 5. Der Export der Plattform (POR-018, ANN-265): + messages. Rumpf sonst
--    unveraendert aus 20261019120000_ueb_011_exercise_days.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_export(p_access_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_person  jsonb;
  v_ergebnis jsonb;
begin
  if not app.platform_access_allows(p_access_id, 'export') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  -- Die Stammdaten, die die Person der Praxis gegeben hat. Keine
  -- Einrichtung, keine Koordinaten (abgeleitet, nicht von ihr).
  if v_zugang.relationship_kind = 'treatment' then
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'phone_mobile', c.phone_mobile,
             'phone_work', c.phone_work,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details c on c.patient_id = p.id
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id;
  else
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details c on c.training_relationship_id = t.id
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id;
  end if;

  v_ergebnis := jsonb_build_object(
    'format', 'plattform-export',
    'format_version', 1,
    'exported_at', now(),
    'organization', (select o.name from public.organizations o where o.id = v_zugang.organization_id),
    'relationship', v_zugang.relationship_kind,
    'exported_by', v_zugang.access_kind,
    'person', coalesce(v_person, '{}'::jsonb),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                     from public.platform_appointments(p_access_id) x),
    'appointment_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                             from public.platform_appointment_requests(p_access_id) x),
    'questionnaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                       from public.platform_questionnaire(p_access_id) x),
    -- Rechnungen nur mit dem Recht billing - die Projektion prueft selbst.
    'invoices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                 from public.platform_invoices(p_access_id) x),
    -- Nur die Liste; jedes Dokument holt die Person einzeln (protokolliert).
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                  from public.platform_files(p_access_id) x),
    'consents', (select coalesce(jsonb_agg(to_jsonb(x) - 'can_grant'), '[]'::jsonb)
                 from public.platform_consents(p_access_id) x),
    -- ANG-008: die eigenen Trainingspakete, wie die Plattform sie zeigt
    -- (Recht billing; ohne Recht oder in der Behandlung leer).
    'training_packages', coalesce(public.platform_training_packages(p_access_id), '[]'::jsonb),
    -- KND-003: der im Konto geschlossene Trainingsvertrag (Recht billing;
    -- ohne Recht, in der Behandlung oder ohne Vertrag null).
    'training_contract', public.platform_training_contract(p_access_id),
    -- UEB-009 bis UEB-011: die eigenen Plaene mit Uebungstagen und den Tagen,
    -- an denen geuebt wurde - wie die Plattform sie zeigt (Zweitreview).
    'exercise_plans', coalesce(public.platform_exercise_plans(p_access_id) -> 'plans', '[]'::jsonb),
    -- KOM-004: die Nachrichten, wie die Plattform sie zeigt.
    'messages', coalesce(public.platform_messages(p_access_id) -> 'messages', '[]'::jsonb)
  );

  -- ANN-265: ein Eintrag je Export, wie die Auskunft in der Praxis.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_zugang.organization_id, auth.uid(),
    case when v_zugang.access_kind = 'self' then 'platform' else 'representative' end,
    'patient_record.exported',
    case v_zugang.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'success',
    jsonb_build_object('surface', 'platform', 'purpose', 'platform_export',
                       'platform_access_id', v_zugang.id, 'access_kind', v_zugang.access_kind)
  );

  return v_ergebnis;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 6. Zusammenfuehren zweier Akten (PRX-018): die Rueckfragen ziehen mit.
--    Rumpf sonst unveraendert aus 20261018100000_ueb_004_exercise_plans.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_plan        jsonb;
  v_quelle      public.patients%rowtype;
  v_ziel        public.patients%rowtype;
  v_person      uuid;
  v_status      text;
  v_ende_on     date;
  v_ende_at     timestamptz;
  v_ende_by     uuid;
  v_beginn      date;
  v_anschrift   boolean;
  v_fotos       integer := 0;
  v_sperre      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  -- Beide Akten sperren, in fester Reihenfolge - zwei gleichzeitige Vorgaenge
  -- ueber dasselbe Paar warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source_patient_id, p_target_patient_id)
    and p.organization_id = v_org
  order by p.id
  for update;

  select * into v_quelle from public.patients p
  where p.id = p_source_patient_id and p.organization_id = v_org;
  select * into v_ziel from public.patients p
  where p.id = p_target_patient_id and p.organization_id = v_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Was vor dem Zusammenfuehren schon faellig war, faellt unter dem Stand, der
  -- es faellig gemacht hat (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_quelle.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben geloeschtes Foto ist
  -- nicht mitgewandert und steht schon in photos_deleted.
  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147) --------------------------------------------------
  if exists (select 1 from public.patient_contact_details c where c.patient_id = v_ziel.id) then
    select coalesce(z.street, z.house_number, z.postal_code, z.city) is null
       and coalesce(q.street, q.house_number, q.postal_code, q.city) is not null
      into v_anschrift
    from public.patient_contact_details z
    left join public.patient_contact_details q on q.patient_id = v_quelle.id
    where z.patient_id = v_ziel.id;

    update public.patient_contact_details z
       set date_of_birth = coalesce(z.date_of_birth, q.date_of_birth),
           email         = coalesce(z.email, q.email),
           phone         = coalesce(z.phone, q.phone),
           phone_mobile  = coalesce(z.phone_mobile, q.phone_mobile),
           phone_work    = coalesce(z.phone_work, q.phone_work),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Trigger die Koordinate bei jeder
    -- Adressaenderung leert: Die Anschrift kommt mit ihrer Verortung.
    if v_anschrift then
      update public.patient_contact_details z
         set lat = q.lat, lon = q.lon, geocode_precision = q.geocode_precision
        from public.patient_contact_details q
       where z.patient_id = v_ziel.id
         and q.patient_id = v_quelle.id;
    end if;
  else
    update public.patient_contact_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  if exists (select 1 from public.patient_care_details d where d.patient_id = v_ziel.id) then
    update public.patient_care_details z
       set primary_therapist_staff_member_id =
             coalesce(z.primary_therapist_staff_member_id, q.primary_therapist_staff_member_id),
           treatment_table_required = coalesce(z.treatment_table_required, q.treatment_table_required),
           home_visit_access_note = app.merge_note(z.home_visit_access_note, q.home_visit_access_note),
           special_note           = app.merge_note(z.special_note, q.special_note),
           remark                 = app.merge_note(z.remark, q.remark),
           take_along_items       = app.merge_take_along(z.take_along_items, q.take_along_items)
      from public.patient_care_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;
  else
    update public.patient_care_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  -- Der Bezug wechselt ----------------------------------------------------
  -- Zwei Standardempfaenger kann es nicht geben; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ABR-030: Die Honorarvereinbarungen ziehen mit; gleiche Tage sperrt der Plan.
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ANG-001: Das Nachsorge-Abo zieht mit; sich ueberschneidende sperrt der Plan.
  update public.aftercare_subscriptions      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.training_offers              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- UEB-004: Die Behandlungsplaene ziehen mit; der Riegel laesst nur patient_id wechseln.
  update public.exercise_plans               set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- KOM-004: Rueckfragen ueber die Plattform ziehen mit, zugeordnete wie
  -- nicht zugeordnete - sonst fielen sie mit der Dublette (cascade). Der
  -- Riegel an der Zuordnung laesst das Verhaeltnis nur hier wechseln.
  update public.platform_messages
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Seit ABN-018
  -- (BEF-108) bleiben alle Gruende wirksam: Eine Akte kann mehrere aktive
  -- Sperren tragen, keine wird beim Zusammenfuehren aufgehoben.
  v_sperre := null;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Fruehere Nachweise der Dublette ziehen mit (ABN-018).
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148) --------------------------------------------
  v_status := case
    when v_quelle.status = 'active' or v_ziel.status = 'active' then 'active'
    else 'inactive'
  end;
  v_beginn := least(v_quelle.care_started_on, v_ziel.care_started_on);

  if v_quelle.care_concluded_on is null or v_ziel.care_concluded_on is null then
    null;
  elsif (v_quelle.care_concluded_on, v_quelle.care_concluded_at)
        > (v_ziel.care_concluded_on, v_ziel.care_concluded_at) then
    v_ende_on := v_quelle.care_concluded_on;
    v_ende_at := v_quelle.care_concluded_at;
    v_ende_by := v_quelle.care_concluded_by;
  else
    v_ende_on := v_ziel.care_concluded_on;
    v_ende_at := v_ziel.care_concluded_at;
    v_ende_by := v_ziel.care_concluded_by;
  end if;

  update public.patients
     set status            = v_status,
         care_started_on   = v_beginn,
         care_concluded_on = v_ende_on,
         care_concluded_at = v_ende_at,
         care_concluded_by = v_ende_by
   where id = v_ziel.id;

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein
  -- Widerruf in der einen trifft die aelteren Fotos der anderen - sofort,
  -- wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die leere Akte faellt (ANN-150) -----------------------------------------
  -- Was noch an ihr haengt, faellt mit ihr (Kontakt und Versorgungsangaben der
  -- Dublette, soweit sie in die bleibende Akte eingeflossen sind).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  -- Die Person nur, wenn nichts anderes an ihr haengt: Mitarbeiter:in, Konto,
  -- Trainingsverhaeltnis (ADR-021) bleiben, wie sie sind.
  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  -- Nachweis an der bleibenden Akte, so lange wie sie (ABN-018, BEF-108):
  -- nicht allein im dreijaehrigen Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted
  )
  values (v_org, v_ziel.id, v_quelle.id, v_actor, v_plan -> 'counts', v_fotos);


  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Trainingsverhaeltnis mit Belegfrist (TRN-008): die Rueckfragen fallen
--    nach den drei Jahren, auch wenn die Belege bleiben. Rumpf sonst
--    unveraendert aus 20260930130000_trn_009_training_protocols.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.reduce_training_relationship(p_relationship_id uuid, p_run_id uuid, p_due_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer := 0;
  v_n     integer;
begin
  -- TRN-009: die Protokolle zuerst - auch die am abgerechneten Termin. Der
  -- Termin bleibt `documented` als Tatsache stehen; was in der Einheit
  -- geschah, traegt die Belegfrist nicht (ANN-183).
  with geloescht as (
    delete from public.training_protocols p
     where p.training_relationship_id = p_relationship_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_protocols', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- KOM-004: Rueckfragen ueber die Plattform. Sie tragen keine Belegfrist
  -- und fallen nach den drei Jahren aus ADR-021 Punkt 4; die Eintraege mit
  -- ihnen (cascade).
  with geloescht as (
    delete from public.platform_messages m
     where m.training_relationship_id = p_relationship_id
    returning m.id, m.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'platform_messages', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Kontakt, Anschrift, Geburtsdatum. Der Schluessel ist das Verhaeltnis;
  -- er steht als Kennung im Journal.
  with geloescht as (
    delete from public.training_contact_details c
     where c.training_relationship_id = p_relationship_id
    returning c.training_relationship_id as id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_contact_details', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Termine ohne Leistung: kein Beleg, nichts, was die Frist traegt.
  with geloescht as (
    delete from public.appointments a
     where a.training_relationship_id = p_relationship_id
       and not exists (select 1 from public.billable_services b where b.appointment_id = a.id)
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Vereinbarungen, an denen kein verbliebener Termin mehr haengt.
  with geloescht as (
    delete from public.training_bases tb
     where tb.training_relationship_id = p_relationship_id
       and not exists (select 1 from public.appointments a where a.training_basis_id = tb.id)
    returning tb.id, tb.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_bases', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$function$;
