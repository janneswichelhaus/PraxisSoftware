-- =============================================================================
-- TRK-003 (TRK-EPIC-001): Check-in auf der Plattform
--
-- DSN-001 4.1 und 5: Der Check-in erscheint in der Uebersicht, wenn er
-- faellig ist, und nach dem Absenden steht, was mit den Angaben geschieht -
-- gelesen beim naechsten Termin, kein Alarm (D5). Die eigenen Antworten stehen
-- unter "Ich" als "Meine Angaben" mit Datum.
--
--   app.platform_access_allows      + Recht 'checkin' (ANN-352)
--   public.platform_checkins        faellig, Fragen, letzte Werte, Verlauf
--   public.submit_platform_checkin  einen faelligen Check-in beantworten
--   public.platform_export          + checkins (POR-018)
--
-- Beantworten duerfen die Person und ihre rechtliche Vertretung, nicht die
-- Begleitung; nicht in der Lesefrist; im Training nur mit Einwilligung zu
-- Gesundheitsangaben (ADR-021 Punkt 4). Den Schreibvorgang weist das
-- Datenmodell nach (Zugang, Art und Konto am Check-in, ADR-010 Fassung 3);
-- eine Vertretung wird protokolliert wie jede Vertretung (ADR-023 Punkt 24).
-- Keine Bewertung, kein Hinweis aus einem Wert (ADR-006 Punkt 11).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer einen Check-in beantwortet (ANN-352)
--
-- Aus 20261026100000_kom_005_message_attachments.sql (juengste Fassung); neu
-- ist nur 'checkin'.
-- -----------------------------------------------------------------------------
create or replace function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      -- Gesundheit: Lesen, Wuensche, Nachrichten. Jede Vertretung traegt
      -- diesen Bereich nachgewiesen (Constraint platform_accesses_kind_fields).
      when p_capability in ('read', 'request', 'message') then true
      -- Rechnungen und Zahlungen: der eigene Zugang, sonst nur mit
      -- nachgewiesener Vermoegenssorge bzw. Einwilligung (ABN-010).
      when p_capability = 'billing'
        then a.access_kind = 'self' or coalesce(a.finance_scope, false)
      -- ANG-003 (ANN-273): einen Vertrag kuendigen die Person selbst und eine
      -- rechtliche Vertretung mit Vermoegenssorge, nie eine Begleitung.
      when p_capability = 'contract'
        then a.access_kind = 'self'
             or (a.access_kind = 'legal_representative' and coalesce(a.finance_scope, false))
      -- POR-012 (ANN-248): den Befundbogen fuellt die Person selbst oder ihre
      -- rechtliche Vertretung aus - eine Angabe zur Gesundheit, die eine
      -- Begleitung nicht fuer sie macht.
      -- UEB-010 (ANN-306): ebenso die Einheit am Plan.
      -- KOM-005 (ADR-017 Punkte 59 und 67): ebenso Foto und Video an einer
      -- Rueckfrage - die Begleitung liest die Worte, nicht die Bilder.
      -- TRK-003 (ANN-352): ebenso der Check-in - Angaben zur Gesundheit, die
      -- eine Begleitung nicht fuer die Person macht.
      when p_capability in ('consent', 'export', 'manage_companions', 'questionnaire', 'exercise',
                            'attach', 'checkin')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 2. Die Projektion: faellig, Fragen, letzte Werte, Verlauf
-- -----------------------------------------------------------------------------
create function public.platform_checkins(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_heute   date;
  v_takt    public.checkin_schedules%rowtype;
  v_faellig date;
  v_einwilligung boolean;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_heute := app.training_today(v_zugang.organization_id);
  select * into v_takt
  from public.checkin_schedules s
  where s.relationship_kind = v_zugang.relationship_kind
    and s.relationship_id = v_zugang.relationship_id;
  if v_takt.id is not null then
    v_faellig := app.checkin_due_on(v_takt);
  end if;
  v_einwilligung := app.platform_exercise_note_allowed(
    v_zugang.relationship_kind, v_zugang.relationship_id);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'checkins')
  );

  return jsonb_build_object(
    'today', v_heute,
    'schedule', case when v_takt.id is null then null else jsonb_build_object(
      'interval_days', v_takt.interval_days,
      'parameter_keys', to_jsonb(v_takt.parameter_keys)
    ) end,
    'due_on', v_faellig,
    'due', v_faellig is not null and v_faellig <= v_heute,
    -- Darf dieser Zugang jetzt antworten? Recht, Lesefrist, Einwilligung.
    'can_answer', v_faellig is not null and v_faellig <= v_heute
                  and app.platform_access_allows(p_access_id, 'checkin')
                  and app.platform_access_writable(p_access_id)
                  and v_einwilligung,
    -- Im Training fehlt die Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4).
    'consent_needed', not v_einwilligung,
    -- Die juengste Angabe je Groesse, nur als Hinweis (ANN-349).
    'last_values', coalesce((
      select jsonb_object_agg(l.parameter_key, l.value)
      from (
        select distinct on (v.parameter_key) v.parameter_key, v.value
        from public.checkins c
        join public.checkin_values v on v.checkin_id = c.id
        where c.relationship_kind = v_zugang.relationship_kind
          and c.relationship_id = v_zugang.relationship_id
        order by v.parameter_key, c.answered_on desc, c.recorded_at desc
      ) l
    ), '{}'::jsonb),
    'history', (
      select coalesce(jsonb_agg(z - 'recorded_at'), '[]'::jsonb)
      from jsonb_array_elements(
        app.checkins_json(v_zugang.relationship_kind, v_zugang.relationship_id)) z
    )
  );
end;
$$;

revoke all on function public.platform_checkins(uuid) from public, anon;
grant execute on function public.platform_checkins(uuid) to authenticated;

comment on function public.platform_checkins(uuid) is
  'TRK-003: Plattformprojektion Check-in (DSN-001 4.1, 5) - Takt und Fragen, ob heute faellig und ob dieser Zugang antworten darf, die letzte Angabe je Groesse als Hinweis und der eigene Verlauf ("Meine Angaben") mit fester Schluesselliste (ADR-023 Punkt 22). Ueber eine Vertretung protokolliert (Punkt 24). Ohne Recht null.';

-- -----------------------------------------------------------------------------
-- 3. Beantworten
-- -----------------------------------------------------------------------------
create function public.submit_platform_checkin(p_access_id uuid, p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_takt   public.checkin_schedules%rowtype;
  v_heute  date;
  v_keys   text[];
  v_werte  smallint[];
  v_id     uuid;
begin
  if not app.platform_access_allows(p_access_id, 'checkin')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if not app.platform_exercise_note_allowed(v_zugang.relationship_kind, v_zugang.relationship_id) then
    raise exception 'checkin requires consent' using errcode = '42501';
  end if;

  -- Die Zeile des Takts sperrt: Zwei schnelle Absendungen werden nicht zwei
  -- Check-ins an einem Tag (ANN-350).
  select * into v_takt
  from public.checkin_schedules s
  where s.relationship_kind = v_zugang.relationship_kind
    and s.relationship_id = v_zugang.relationship_id
  for update;
  if v_takt.id is null then
    raise exception 'no checkin schedule' using errcode = 'P0002';
  end if;
  v_heute := app.training_today(v_zugang.organization_id);
  if app.checkin_due_on(v_takt) > v_heute then
    raise exception 'checkin not due' using errcode = '22023';
  end if;

  select array_agg(w.parameter_key), array_agg(w.value)
    into v_keys, v_werte
  from app.tracking_values_from_json(p_values, 'checkin') w;
  -- Jede Frage ist freiwillig, mindestens eine beantwortet (ANN-349).
  if v_keys is null then
    raise exception 'no answer' using errcode = '22023';
  end if;
  if not v_keys <@ v_takt.parameter_keys then
    raise exception 'question not asked' using errcode = '22023';
  end if;

  insert into public.checkins (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    answered_on, platform_access_id, platform_access_kind, recorded_by
  )
  values (
    v_zugang.organization_id, v_zugang.relationship_kind, v_zugang.relationship_id,
    case when v_zugang.relationship_kind = 'treatment' then v_zugang.relationship_id end,
    case when v_zugang.relationship_kind = 'training' then v_zugang.relationship_id end,
    v_heute, v_zugang.id, v_zugang.access_kind, auth.uid()
  )
  returning id into v_id;

  insert into public.checkin_values (organization_id, checkin_id, parameter_key, value)
  select v_zugang.organization_id, v_id, w.key, w.value
  from unnest(v_keys, v_werte) as w (key, value);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'checkin')
  );
  return v_id;
end;
$$;

revoke all on function public.submit_platform_checkin(uuid, jsonb) from public, anon;
grant execute on function public.submit_platform_checkin(uuid, jsonb) to authenticated;

comment on function public.submit_platform_checkin(uuid, jsonb) is
  'TRK-003: beantwortet den faelligen Check-in des Verhaeltnisses - { Schluessel: Wert } nur zu den eingestellten Fragen, mindestens eine (ANN-349); hoechstens einer am Tag (ANN-350). Nur die Person und ihre rechtliche Vertretung (ANN-352), nicht in der Lesefrist, im Training nur mit Einwilligung (42501). Ohne Takt P0002, nicht faellig oder falscher Wert 22023. Keine Benachrichtigung an die Praxis (DSN-001 D5).';

-- -----------------------------------------------------------------------------
-- 4. Der Export der Plattform (POR-018, ANN-265): + checkins
--
-- Aus 20261020120000_kom_004_messages_in_record.sql (juengste Fassung); neu
-- ist nur 'checkins', aus der Projektion selbst.
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
    'messages', coalesce(public.platform_messages(p_access_id) -> 'messages', '[]'::jsonb),
    -- TRK-003: die eigenen Check-ins mit Takt und Angaben, wie die Plattform
    -- sie zeigt.
    'checkins', (
      select jsonb_build_object('schedule', c -> 'schedule', 'history', c -> 'history')
      from (select public.platform_checkins(p_access_id) as c) x
    )
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
