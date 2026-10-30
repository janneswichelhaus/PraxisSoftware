-- Das Praxisfeld des Fragebogens („Anmerkungen Therapeut“, ausgefuellt_von „therapeut“) füllt die
-- Praxis aus. Die Plattform zeigt es seit dem Fragebogen in Themen nicht mehr; jetzt nimmt auch der
-- Server keine Antwort der Plattform darauf an (ANN-808).

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

  -- Das Praxisfeld füllt die Praxis aus (ANN-808): Die Plattform zeigt es nicht, und der Server
  -- nimmt keine Antwort darauf an, auch nicht beim Überschreiben eines Entwurfs.
  if exists (
    select 1
    from public.questionnaire_definitions d
    cross join lateral jsonb_array_elements(d.definition -> 'items') i
    where d.instrument_id = p_instrument_id
      and d.version = p_definition_version
      and i ->> 'ausgefuellt_von' = 'therapeut'
      and p_answers ? (i ->> 'id')
  ) then
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
    select r.id, r.status, r.source, r.instrument_id, r.definition_version into v_alt
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

    update public.patient_questionnaire_responses
       set answers = p_answers, recorded_on = v_heute, updated_at = now(), updated_by = auth.uid()
     where id = p_response_id;
    v_id := p_response_id;
  else
    -- Hoechstens ein Plattform-Entwurf je Bogen: ein zweiter ueberschreibt ihn.
    -- Seine Fassung steht fest (Trigger guard_questionnaire_response); eine
    -- neue Fassung heisst Entwurf verwerfen und neu beginnen (Zweitreview).
    select r.id, r.definition_version into v_alt
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
         set answers = p_answers, recorded_on = v_heute, updated_at = now(), updated_by = auth.uid()
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
