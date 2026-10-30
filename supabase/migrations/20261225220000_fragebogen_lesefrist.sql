-- In der Lesefrist liest die Plattform nur (ADR-023 Punkt 5): Den Fragebogen speichert und sendet
-- der Server dann nicht mehr (ANN-810), wie Terminwünsche (ANN-807). Einen eigenen Entwurf verwerfen
-- geht weiter: Dabei entsteht nichts Neues, und unfertige Angaben bleiben nicht mit der Akte liegen.

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
  -- In der Lesefrist nichts Neues (ADR-023 Punkt 5, ANN-810), wie bei den Terminwünschen.
  if not app.platform_access_allows(p_access_id, 'questionnaire')
     or not app.platform_access_writable(p_access_id) then
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
  'POR-012 (ANN-248): Die Person legt ueber die Plattform einen Entwurf ihres Befundbogens an oder ueberschreibt ihn; nur Instrumente fuer die Patient:in, Antworten gegen die Definition geprueft (ABN-014), keine Antwort auf ein Item der Praxis (ausgefuellt_von therapeut, ANN-808); kein zweiter Bogen, wenn einer abgeschlossen vorliegt; nicht in der Lesefrist (ANN-810). Recht questionnaire (Person, rechtliche Vertretung).';

create or replace function public.complete_platform_questionnaire_response(p_access_id uuid, p_response_id uuid)
returns boolean
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_alt    record;
begin
  if not app.platform_access_allows(p_access_id, 'questionnaire')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select r.id, r.status, r.source, r.instrument_id, r.definition_version, r.answers into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id
    and r.patient_id = v_zugang.relationship_id
    and r.organization_id = v_zugang.organization_id
    and v_zugang.relationship_kind = 'treatment'
  for update;
  if not found or v_alt.source <> 'platform' then
    raise exception 'questionnaire response not found' using errcode = 'P0002';
  end if;
  if v_alt.status <> 'entwurf' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;
  -- Noch einmal gegen die Definition - der Entwurf koennte mit einer
  -- inzwischen abgeloesten Fassung begonnen worden sein.
  perform app.assert_questionnaire_answers(v_alt.instrument_id, v_alt.definition_version, v_alt.answers);

  update public.patient_questionnaire_responses
     set status = 'abgeschlossen', completed_at = now(), completed_by = auth.uid(),
         updated_at = now(), updated_by = auth.uid()
   where id = p_response_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'questionnaire_complete')
  );
  return true;
end;
$$;

comment on function public.complete_platform_questionnaire_response(uuid, uuid) is
  'POR-012: Absenden des Befundbogens ueber die Plattform = abgeschlossen (ANN-248); danach aendert die Praxis nur per Korrektur (ANN-103). Nur eigene Plattform-Entwuerfe, nicht in der Lesefrist (ANN-810).';

comment on function public.discard_platform_questionnaire_response(uuid, uuid) is
  'POR-012: Die Person verwirft ihren eigenen Plattform-Entwurf des Befundbogens, auch in der Lesefrist (ANN-810): Es entsteht nichts Neues. Abgeschlossenes bleibt.';
