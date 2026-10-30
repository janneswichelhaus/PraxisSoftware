-- Das Praxisfeld des Fragebogens („Anmerkungen Therapeut“, ausgefuellt_von „therapeut“) füllt die
-- Praxis aus (ANN-808): Der Server nimmt keine Antwort der Plattform darauf an, liefert es nicht aus
-- und behält es, wenn die Person einen Entwurf überschreibt, den die Praxis weitergeführt hat.

create function app.questionnaire_practice_items(p_instrument_id text, p_version text)
returns text[]
language sql stable
set search_path to ''
as $$
  select coalesce(array_agg(i ->> 'id'), '{}'::text[])
  from public.questionnaire_definitions d
  cross join lateral jsonb_array_elements(d.definition -> 'items') i
  where d.instrument_id = p_instrument_id
    and d.version = p_version
    and i ->> 'ausgefuellt_von' = 'therapeut'
$$;

comment on function app.questionnaire_practice_items(text, text) is
  'Die Kennungen der Items, die die Praxis ausfüllt (ausgefuellt_von therapeut), in einer Fassung eines Bogens; die Plattform bekommt und schreibt sie nicht (ANN-808).';

revoke all on function app.questionnaire_practice_items(text, text) from public, anon, authenticated;

create or replace function public.save_platform_questionnaire_response(p_access_id uuid, p_response_id uuid, p_instrument_id text, p_definition_version text, p_answers jsonb)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
  v_heute  date;
  v_alt    record;
  v_id     uuid;
  v_praxis text[];
begin
  if not app.platform_access_allows(p_access_id, 'questionnaire') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'treatment' then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  if not app.platform_questionnaire_instrument(p_instrument_id, p_definition_version) then
    raise exception 'questionnaire not available on the platform' using errcode = '22023';
  end if;

  -- Jede Antwort gegen die Definition ihrer Fassung (ANN-105).
  perform app.assert_questionnaire_answers(p_instrument_id, p_definition_version, p_answers);

  -- Das Praxisfeld füllt die Praxis aus (ANN-808): keine Antwort der Plattform darauf, auch nicht
  -- beim Überschreiben eines Entwurfs.
  v_praxis := app.questionnaire_practice_items(p_instrument_id, p_definition_version);
  if p_answers ?| v_praxis then
    raise exception 'answer to a practice item' using errcode = '42501';
  end if;

  -- Liegt der Bogen schon abgeschlossen vor (gleich woher), fuellt die Person
  -- ihn nicht noch einmal: Aenderungen sind Sache des Termins.
  if exists (
    select 1 from public.patient_questionnaire_responses r
    where r.patient_id = v_zugang.relationship_id
      and r.organization_id = v_zugang.organization_id
      and r.instrument_id = p_instrument_id
      and r.status = 'abgeschlossen'
      and not exists (
        select 1 from public.patient_questionnaire_responses n
        where n.supersedes_response_id = r.id and n.status = 'abgeschlossen'
      )
  ) then
    raise exception 'questionnaire already completed' using errcode = '23505';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  if p_response_id is not null then
    select r.id, r.status, r.source, r.instrument_id, r.definition_version, r.answers into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_response_id
      and r.patient_id = v_zugang.relationship_id
      and r.organization_id = v_zugang.organization_id
    for update;
    if not found or v_alt.source <> 'platform' then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'entwurf' then
      raise exception 'questionnaire response is completed' using errcode = '23514';
    end if;
    if v_alt.instrument_id <> p_instrument_id or v_alt.definition_version <> p_definition_version then
      raise exception 'draft identity is fixed' using errcode = '22023';
    end if;

    -- Was die Praxis im Entwurf schon notiert hat, bleibt stehen (ANN-808).
    update public.patient_questionnaire_responses
       set answers = p_answers || (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                                    from jsonb_each(v_alt.answers) e where e.key = any(v_praxis)),
           recorded_on = v_heute, updated_at = now(), updated_by = auth.uid()
     where id = p_response_id;
    v_id := p_response_id;
  else
    -- Hoechstens ein Plattform-Entwurf je Bogen: ein zweiter ueberschreibt ihn.
    -- Seine Fassung steht fest (Trigger guard_questionnaire_response); eine
    -- neue Fassung heisst Entwurf verwerfen und neu beginnen (Zweitreview).
    select r.id, r.definition_version, r.answers into v_alt
    from public.patient_questionnaire_responses r
    where r.patient_id = v_zugang.relationship_id
      and r.organization_id = v_zugang.organization_id
      and r.instrument_id = p_instrument_id
      and r.source = 'platform'
      and r.status = 'entwurf'
    for update;
    if found then
      if v_alt.definition_version <> p_definition_version then
        raise exception 'draft identity is fixed' using errcode = '22023';
      end if;
      v_id := v_alt.id;
      update public.patient_questionnaire_responses
         set answers = p_answers || (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                                    from jsonb_each(v_alt.answers) e where e.key = any(v_praxis)),
             recorded_on = v_heute, updated_at = now(), updated_by = auth.uid()
       where id = v_id;
    else
      insert into public.patient_questionnaire_responses (
        organization_id, patient_id, instrument_id, definition_version, recorded_on, answers,
        created_by, updated_by, source, source_access_id
      )
      values (
        v_zugang.organization_id, v_zugang.relationship_id, p_instrument_id, p_definition_version,
        v_heute, p_answers, auth.uid(), auth.uid(), 'platform', v_zugang.id
      )
      returning id into v_id;
    end if;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'questionnaire_save')
  );
  return v_id;
end;
$$;

comment on function public.save_platform_questionnaire_response(uuid, uuid, text, text, jsonb) is
  'POR-012 (ANN-248): Die Person legt ueber die Plattform einen Entwurf ihres Befundbogens an oder ueberschreibt ihn; nur Instrumente fuer die Patient:in, Antworten gegen die Definition geprueft (ABN-014), keine Antwort auf ein Item der Praxis (ausgefuellt_von therapeut, ANN-808); kein zweiter Bogen, wenn einer abgeschlossen vorliegt. Recht questionnaire (Person, rechtliche Vertretung).';

create or replace function public.platform_questionnaire(p_access_id uuid)
returns table(id uuid, instrument_id text, definition_version text, status text, recorded_on date, source text, answers jsonb, updated_at timestamp with time zone, completed_at timestamp with time zone)
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'treatment' then
    return;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'questionnaire')
  );

  -- Ohne das Praxisfeld: Die Notiz der Praxis ist nicht für die Plattform bestimmt (ANN-808).
  return query
  select r.id, r.instrument_id, r.definition_version, r.status, r.recorded_on, r.source,
         case when r.source = 'platform'
           then r.answers - app.questionnaire_practice_items(r.instrument_id, r.definition_version)
         end,
         r.updated_at, r.completed_at
  from public.patient_questionnaire_responses r
  where r.patient_id = v_zugang.relationship_id
    and r.organization_id = v_zugang.organization_id
    -- Ein Entwurf der Praxis ist deren Arbeit, keine Tatsache fuer die Person.
    and (r.source = 'platform' or r.status = 'abgeschlossen')
    -- Nur Boegen, die die Person ausfuellt (ANN-248); eine durch Korrektur
    -- ersetzte Erhebung gilt nicht mehr.
    and exists (
      select 1 from public.questionnaire_definitions d
      where d.instrument_id = r.instrument_id
        and d.definition -> 'meta' ->> 'ausgefuellt_von' = 'patient'
    )
    and not exists (
      select 1 from public.patient_questionnaire_responses n
      where n.supersedes_response_id = r.id and n.status = 'abgeschlossen'
    )
  order by r.instrument_id, (r.status = 'entwurf') desc, r.recorded_on desc, r.created_at desc;
end;
$$;

comment on function public.platform_questionnaire(uuid) is
  'POR-012: Plattformprojektion "Befundbogen": Stand der Boegen, die die Person ausfuellt (ANN-248) - eigene Entwuerfe und Abschluesse mit Antworten ohne das Praxisfeld (ANN-808), in der Praxis erhobene nur als Tatsache. Nur Behandlungszugang; Vertretung protokolliert (ADR-023 Punkt 24).';
