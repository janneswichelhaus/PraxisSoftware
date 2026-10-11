-- =============================================================================
-- BEF-132: Plattformzugang an der Dublette (Zweitreview KOM-EPIC-001, H2 und H5;
-- Zweitreview BEF-131, H4)
--
-- 1. app.patient_merge_plan: neuer Sperrgrund `source_has_platform_access`.
--    Rueckfragen und Terminwuensche der Dublette ziehen zur bleibenden Akte
--    (KOM-004, BEF-131), ihr Zugang aber endete mit ihr - die Person saehe
--    die Antwort auf ihre Frage nicht mehr. Die Praxis entzieht den Zugang
--    vorher und laedt an der bleibenden Akte ein (ANN-149). Dazu nennen die
--    Zaehler `platform_messages` und `platform_appointment_requests`; sie
--    gehen ueber den Plan auch in den Vermerk (patient_merge_records.counts).
--    Rumpf sonst unveraendert aus 20261018100000_ueb_004_exercise_plans.sql.
-- 2. public.add_platform_message_entry, public.answer_platform_message: die
--    Zeile des Vorgangs wird vor der Zustandspruefung gesperrt. Erledigen und
--    Nachtragen (oder Antworten) zur selben Zeit enden damit mit 22023
--    "message is closed" statt mit dem Constraint-Fehler 23514. Rumpf sonst
--    unveraendert aus 20261020100000_kom_001_platform_messages.sql und
--    20261026110000_kom_005b_attachment_projections.sql; Rechte unveraendert.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.patient_merge_plan(p_organization_id uuid, p_source uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quelle     record;
  v_ziel       record;
  v_konflikte  text[] := '{}';
  v_angehaengt text[] := '{}';
  v_sperren    text[] := '{}';
  v_zaehler    jsonb;
  v_text       text;
  v_feld       text;
begin
  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_quelle
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_source and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_ziel
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_target and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Felder, in denen beide Akten etwas anderes tragen: Die bleibende gewinnt,
  -- die Vorschau zeigt beide (ANN-147). Die Anschrift zaehlt als ein Feld.
  foreach v_feld in array array[
    'given_name', 'family_name', 'date_of_birth', 'email', 'phone', 'phone_mobile',
    'phone_work', 'institution', 'primary_therapist_staff_member_id',
    'treatment_table_required'
  ] loop
    if (to_jsonb(v_quelle) ->> v_feld) is not null
       and (to_jsonb(v_ziel) ->> v_feld) is not null
       and lower(btrim(to_jsonb(v_quelle) ->> v_feld)) <> lower(btrim(to_jsonb(v_ziel) ->> v_feld)) then
      v_konflikte := v_konflikte || v_feld;
    end if;
  end loop;

  if coalesce(v_quelle.street, v_quelle.house_number, v_quelle.postal_code, v_quelle.city) is not null
     and coalesce(v_ziel.street, v_ziel.house_number, v_ziel.postal_code, v_ziel.city) is not null
     and row(lower(v_quelle.street), lower(v_quelle.house_number), v_quelle.postal_code, lower(v_quelle.city))
         is distinct from
         row(lower(v_ziel.street), lower(v_ziel.house_number), v_ziel.postal_code, lower(v_ziel.city)) then
    v_konflikte := v_konflikte || 'address'::text;
  end if;

  -- Freitexte: angehaengt, nie verworfen - aber nie ueber die Grenze der
  -- Spalte hinaus gekuerzt. Dann sperrt der Vorgang (ANN-149).
  v_text := app.merge_note(v_ziel.home_visit_access_note, v_quelle.home_visit_access_note);
  if v_text is distinct from v_ziel.home_visit_access_note and v_ziel.home_visit_access_note is not null then
    v_angehaengt := v_angehaengt || 'home_visit_access_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.special_note, v_quelle.special_note);
  if v_text is distinct from v_ziel.special_note and v_ziel.special_note is not null then
    v_angehaengt := v_angehaengt || 'special_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.remark, v_quelle.remark);
  if v_text is distinct from v_ziel.remark and v_ziel.remark is not null then
    v_angehaengt := v_angehaengt || 'remark'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 2000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  if not app.take_along_items_valid(
    app.merge_take_along(v_ziel.take_along_items, v_quelle.take_along_items)
  ) then
    v_sperren := v_sperren || 'take_along_too_many'::text;
  end if;

  -- Ein Konto an der Dublette: Es verloere seine Akte. Das klaert die Praxis
  -- vorher, nicht der Vorgang (ANN-149).
  if exists (
    select 1 from public.user_profiles up where up.person_id = v_quelle.person_id
  ) then
    v_sperren := v_sperren || 'source_has_account'::text;
  end if;

  -- BEF-132: Ein Plattformzugang an der Dublette endete mit ihr, und die
  -- Person saehe die Antworten auf ihre Rueckfragen nicht mehr, die zur
  -- bleibenden Akte ziehen. Jeder Zugang, der nicht entzogen ist - auch eine
  -- offene Einladung oder ein gesperrter Zugang -, sperrt; die Praxis
  -- entzieht ihn vorher und laedt an der bleibenden Akte ein (ANN-149,
  -- ADR-023 Punkt 5: der Vorgang aendert keinen Zugang).
  if exists (
    select 1 from public.platform_accesses z
    where z.patient_id = p_source and z.status <> 'revoked'
  ) then
    v_sperren := v_sperren || 'source_has_platform_access'::text;
  end if;

  -- Zwei Entwuerfe fuer denselben Monat und Bereich: Einer muss vorher weg.
  if exists (
    select 1
    from public.invoices q
    join public.invoices z
      on z.patient_id = p_target
     and z.status = 'draft'
     and z.period_month = q.period_month
     and z.service_area = q.service_area
     -- ABR-032: Entwuerfe je Grundlage stossen nicht zusammen - die
     -- Grundlagen bleiben verschieden.
     and z.treatment_basis_id is null
    where q.patient_id = p_source
      and q.status = 'draft'
      and q.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'draft_invoice_overlap'::text;
  end if;

  -- Zwei offene Eintraege ohne Grundlage auf der Warteliste. Mit Grundlage
  -- koennen sie nicht zusammenstossen: Die Grundlagen wandern mit.
  if exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_source and w.status = 'open' and w.treatment_basis_id is null
  ) and exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_target and w.status = 'open' and w.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'open_waitlist_overlap'::text;
  end if;

  -- ABR-030: Zwei Honorarvereinbarungen ab demselben Tag haetten keine
  -- Antwort auf die Frage, welche gilt.
  if exists (
    select 1
    from public.patient_fee_agreements q
    join public.patient_fee_agreements z on z.valid_from = q.valid_from
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'fee_agreement_overlap'::text;
  end if;

  -- ANG-001: Zwei Abos, deren Zeitraeume sich ueberschneiden, waeren zwei
  -- Vertraege ueber dieselbe Nachsorge; eines muss vorher entfernt sein.
  if exists (
    select 1
    from public.aftercare_subscriptions q
    join public.aftercare_subscriptions z
      on z.starts_on <= coalesce(q.ends_on, 'infinity'::date)
     and q.starts_on <= coalesce(z.ends_on, 'infinity'::date)
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'aftercare_overlap'::text;
  end if;

  -- KND-002: Je Akte hoechstens ein offenes Trainingsangebot (ANN-284).
  if exists (
    select 1
    from public.training_offers q
    join public.training_offers z
      on z.patient_id = p_target
     and app.training_offer_practice_state(z, app.training_today(p_organization_id)) = 'open'
    where q.patient_id = p_source
      and app.training_offer_practice_state(q, app.training_today(p_organization_id)) = 'open'
  ) then
    v_sperren := v_sperren || 'training_offer_overlap'::text;
  end if;

  v_zaehler := jsonb_build_object(
    'appointments',
      (select count(*) from public.appointments a where a.patient_id = p_source),
    'treatment_notes',
      (select count(*) from public.treatment_notes n
         join public.appointments a on a.id = n.appointment_id
        where a.patient_id = p_source),
    'treatment_bases',
      (select count(*) from public.treatment_bases b where b.patient_id = p_source),
    'billable_services',
      (select count(*) from public.billable_services s where s.patient_id = p_source),
    'invoices',
      (select count(*) from public.invoices i where i.patient_id = p_source),
    'invoices_issued',
      (select count(*) from public.invoices i where i.patient_id = p_source and i.status = 'issued'),
    'invoice_recipients',
      (select count(*) from public.invoice_recipients r where r.patient_id = p_source),
    'fee_agreements',
      (select count(*) from public.patient_fee_agreements f where f.patient_id = p_source),
    'aftercare_subscriptions',
      (select count(*) from public.aftercare_subscriptions s where s.patient_id = p_source),
    'training_offers',
      (select count(*) from public.training_offers o where o.patient_id = p_source),
    'exercise_plans',
      (select count(*) from public.exercise_plans x where x.patient_id = p_source),
    'patient_files',
      (select count(*) from public.patient_files f where f.patient_id = p_source),
    'privacy_records',
      (select count(*) from public.patient_privacy_records r where r.patient_id = p_source),
    'questionnaire_responses',
      (select count(*) from public.patient_questionnaire_responses r where r.patient_id = p_source),
    'course_events',
      (select count(*) from public.patient_course_events e where e.patient_id = p_source),
    'therapy_reports',
      (select count(*) from public.therapy_reports r where r.patient_id = p_source),
    'tasks',
      (select count(*) from public.tasks t where t.patient_id = p_source),
    -- BEF-132: ziehen seit KOM-004 und BEF-131 mit.
    'platform_messages',
      (select count(*) from public.platform_messages m where m.patient_id = p_source),
    'platform_appointment_requests',
      (select count(*) from public.platform_appointment_requests w where w.patient_id = p_source),
    'waitlist_entries',
      (select count(*) from public.waitlist_entries w where w.patient_id = p_source),
    'legal_holds',
      (select count(*) from public.legal_holds h
        where h.subject_type = 'patient' and h.subject_id = p_source)
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_quelle.id, 'given_name', v_quelle.given_name, 'family_name', v_quelle.family_name,
      'date_of_birth', v_quelle.date_of_birth, 'status', v_quelle.status,
      'care_concluded_on', v_quelle.care_concluded_on
    ),
    'target', jsonb_build_object(
      'id', v_ziel.id, 'given_name', v_ziel.given_name, 'family_name', v_ziel.family_name,
      'date_of_birth', v_ziel.date_of_birth, 'status', v_ziel.status,
      'care_concluded_on', v_ziel.care_concluded_on
    ),
    'counts', v_zaehler,
    'conflicts', to_jsonb(v_konflikte),
    'appended', to_jsonb(v_angehaengt),
    'blockers', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_sperren) x)
  );
end;
$function$;

create or replace function public.add_platform_message_entry(
  p_access_id  uuid,
  p_message_id uuid,
  p_body       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_vorgang public.platform_messages%rowtype;
  v_text    text;
  v_id      uuid;
begin
  v_zugang := app.assert_platform_message(p_access_id);
  -- BEF-132 (H5): Erst die Zeile sperren, dann den Zustand lesen. Sonst
  -- schreibt ein Nachtrag nach einem gleichzeitigen Erledigen den Vorgang
  -- wieder auf "offen" und scheitert an platform_messages_closed_stamp
  -- (23514) statt mit "message is closed" (22023).
  perform 1 from public.platform_messages m
  where m.id = p_message_id and m.organization_id = v_zugang.organization_id
  for update;
  v_vorgang := app.platform_open_message(p_access_id, p_message_id);
  -- Auch ein Nachtrag zu einer Uebung oder zu Beschwerden ist eine Angabe
  -- zur Gesundheit (ANN-311): nach einem Widerruf im Training nicht mehr.
  if not app.platform_message_topic_allowed(
           v_vorgang.relationship_kind, v_vorgang.relationship_id, v_vorgang.topic) then
    raise exception 'topic needs consent' using errcode = '42501';
  end if;
  v_text := app.platform_message_body(p_body);

  insert into public.platform_message_entries (
    organization_id, message_id, side, body, access_id, author_kind, author_label, created_by
  )
  values (
    v_vorgang.organization_id, v_vorgang.id, 'person', v_text, v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind <> 'self' then v_zugang.representative_name end, auth.uid()
  )
  returning id into v_id;

  -- Die Praxis ist wieder am Zug. War sie es schon, bleibt die Frist.
  update public.platform_messages m
     set status = 'open',
         due_on = case when m.status = 'open' then m.due_on
                       else app.message_due_on(m.organization_id) end,
         last_entry_at = now()
   where m.id = v_vorgang.id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
  return v_id;
end;
$$;

create or replace function public.answer_platform_message(
  p_message_id    uuid,
  p_body          text,
  p_attachment_id uuid default null,
  p_mark_seconds  integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
  v_anhang  public.platform_message_attachments%rowtype;
  v_text    text;
  v_id      uuid;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to answer platform messages' using errcode = '42501';
  end if;
  -- BEF-132 (H5): Erst die Zeile sperren, dann den Zustand lesen - wie beim
  -- Nachtrag der Person. Bis hierhin kam die Sperre erst nach der Pruefung.
  perform 1 from public.platform_messages m
  where m.id = p_message_id and m.organization_id = app.current_organization_id()
  for update;
  v_vorgang := app.practice_message(p_message_id, true);
  if v_vorgang.status = 'closed' then
    raise exception 'message is closed' using errcode = '22023';
  end if;
  v_text := app.platform_message_body(p_body);

  if (p_attachment_id is null) <> (p_mark_seconds is null) then
    raise exception 'a mark needs its video' using errcode = '22023';
  end if;
  if p_attachment_id is not null then
    select x.* into v_anhang
    from public.platform_message_attachments x
    where x.id = p_attachment_id and x.message_id = v_vorgang.id and x.media_kind = 'video'
      and app.message_attachment_visible(x);
    if v_anhang.id is null then
      raise exception 'video not found' using errcode = 'P0002';
    end if;
    if p_mark_seconds < 0 or p_mark_seconds > v_anhang.duration_seconds then
      raise exception 'mark outside the video' using errcode = '22023';
    end if;
  end if;

  insert into public.platform_message_entries (
    organization_id, message_id, side, body, access_id, author_kind, author_label, created_by,
    attachment_id, attachment_mark_seconds
  )
  values (
    v_vorgang.organization_id, v_vorgang.id, 'practice', v_text, null, 'staff',
    app.current_display_name(), auth.uid(), v_anhang.id, p_mark_seconds
  )
  returning id into v_id;

  update public.platform_messages m
     set status = 'answered', due_on = null, last_entry_at = now()
   where m.id = v_vorgang.id;
  return v_id;
end;
$$;
