-- =============================================================================
-- POR-012: Befundbogen vorab ueber die Plattform (PROJECT_PRINCIPLES.md 4.6
-- und 7, DSN-001 4.1 "Befundbogen ausfuellen"; ADR-023 Punkte 13, 19, 22, 24)
--
-- Die Person fuellt den Anamnesebogen vor dem ersten Termin selbst aus. Was
-- sie absendet, ist ihre Angabe - wie ein Papierbogen, den sie mitbringt:
-- Die Erhebung steht abgeschlossen in der Akte, die Therapeut:in prueft sie
-- beim Termin und korrigiert wie bisher per Korrektur (ANN-103). Der Server
-- prueft jede Antwort gegen die Definition ihrer Fassung (ABN-014) - derselbe
-- Weg wie in der Praxis.
--
-- Nur Instrumente, die laut Definition die Patient:in ausfuellt
-- (`ausgefuellt_von: patient`) und die aktiv sind (ANN-245). Die Plattform
-- liefert Antworten nur aus Erhebungen, die ueber die Plattform entstanden
-- sind; eine in der Praxis erhobene Anamnese ist Befund und bleibt dort
-- (DSN-001 Abschnitt 2 Satz 3) - sichtbar ist nur, DASS sie vorliegt.
--
-- Wer: die Person selbst und ihre rechtliche Vertretung, nicht die
-- Begleitung (ADR-023 Punkt 13: "lesen, Terminwuensche und Nachrichten").
-- Nachweis: `source` und `source_access_id` am Datensatz, `created_by` das
-- Konto (ADR-010 Fassung 3); ueber eine Vertretung protokolliert (Punkt 24).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Herkunft der Erhebung
-- -----------------------------------------------------------------------------
alter table public.patient_questionnaire_responses
  add column source text not null default 'practice'
    check (source in ('practice', 'platform')),
  add column source_access_id uuid references public.platform_accesses (id) on delete set null,
  add constraint patient_questionnaire_responses_source_access check (
    source_access_id is null or source = 'platform'
  );

comment on column public.patient_questionnaire_responses.source is
  'POR-012: practice (in der Praxis erhoben) oder platform (von der Person ueber die Plattform ausgefuellt, ANN-245).';
comment on column public.patient_questionnaire_responses.source_access_id is
  'POR-012: der Plattformzugang, ueber den die Erhebung entstand (Person oder Vertretung, ADR-023 Punkt 14).';

-- -----------------------------------------------------------------------------
-- 2. Recht `questionnaire` (ADR-023 Punkt 13; ANN-245). Rumpf sonst
--    unveraendert aus 20261002134000_abn_010_representation_scopes.sql.
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
      -- POR-012 (ANN-245): den Befundbogen fuellt die Person selbst oder ihre
      -- rechtliche Vertretung aus - eine Angabe zur Gesundheit, die eine
      -- Begleitung nicht fuer sie macht.
      when p_capability in ('consent', 'export', 'manage_companions', 'questionnaire')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 3. Hilfe: Ist das Instrument eines fuer die Plattform?
-- -----------------------------------------------------------------------------
create function app.platform_questionnaire_instrument(p_instrument_id text, p_version text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- ANN-245: nur, was laut Definition die Patient:in ausfuellt und aktiv ist.
  select exists (
    select 1 from public.questionnaire_definitions d
    where d.instrument_id = p_instrument_id
      and d.version = p_version
      and d.definition -> 'meta' ->> 'ausgefuellt_von' = 'patient'
      and (d.definition -> 'meta' ->> 'aktiv')::boolean
  )
$$;

revoke all on function app.platform_questionnaire_instrument(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lesen: der Stand der Boegen hinter einem Behandlungszugang
-- -----------------------------------------------------------------------------
create function public.platform_questionnaire(p_access_id uuid)
returns table (
  id                 uuid,
  instrument_id      text,
  definition_version text,
  status             text,
  recorded_on        date,
  source             text,
  -- Nur aus Erhebungen ueber die Plattform; sonst null (Abschnitt 2 Satz 3).
  answers            jsonb,
  updated_at         timestamptz,
  completed_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
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

  return query
  select r.id, r.instrument_id, r.definition_version, r.status, r.recorded_on, r.source,
         case when r.source = 'platform' then r.answers end,
         r.updated_at, r.completed_at
  from public.patient_questionnaire_responses r
  where r.patient_id = v_zugang.relationship_id
    and r.organization_id = v_zugang.organization_id
    -- Nur Boegen, die die Person ausfuellt (ANN-245); eine durch Korrektur
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

revoke all on function public.platform_questionnaire(uuid) from public, anon;
grant execute on function public.platform_questionnaire(uuid) to authenticated;

comment on function public.platform_questionnaire(uuid) is
  'POR-012: Plattformprojektion "Befundbogen": Stand der Boegen, die die Person ausfuellt (ANN-245) - eigene Entwuerfe und Abschluesse mit Antworten, in der Praxis erhobene nur als Tatsache. Nur Behandlungszugang; Vertretung protokolliert (ADR-023 Punkt 24).';

-- -----------------------------------------------------------------------------
-- 5. Schreiben: Entwurf anlegen oder ueberschreiben
-- -----------------------------------------------------------------------------
create function public.save_platform_questionnaire_response(
  p_access_id          uuid,
  p_response_id        uuid,
  p_instrument_id      text,
  p_definition_version text,
  p_answers            jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
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

  -- Jede Antwort gegen die Definition ihrer Fassung (ABN-014, ANN-105).
  perform app.assert_questionnaire_answers(p_instrument_id, p_definition_version, p_answers);

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
    select r.id into v_id
    from public.patient_questionnaire_responses r
    where r.patient_id = v_zugang.relationship_id
      and r.organization_id = v_zugang.organization_id
      and r.instrument_id = p_instrument_id
      and r.source = 'platform'
      and r.status = 'entwurf'
    for update;
    if v_id is not null then
      update public.patient_questionnaire_responses
         set answers = p_answers, definition_version = p_definition_version, recorded_on = v_heute,
             updated_at = now(), updated_by = auth.uid()
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

revoke all on function public.save_platform_questionnaire_response(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_platform_questionnaire_response(uuid, uuid, text, text, jsonb) to authenticated;

comment on function public.save_platform_questionnaire_response(uuid, uuid, text, text, jsonb) is
  'POR-012 (ANN-245): Die Person legt ueber die Plattform einen Entwurf ihres Befundbogens an oder ueberschreibt ihn; nur Instrumente fuer die Patient:in, Antworten gegen die Definition geprueft (ABN-014); kein zweiter Bogen, wenn einer abgeschlossen vorliegt. Recht questionnaire (Person, rechtliche Vertretung).';

-- -----------------------------------------------------------------------------
-- 6. Absenden = abschliessen
-- -----------------------------------------------------------------------------
create function public.complete_platform_questionnaire_response(p_access_id uuid, p_response_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_alt    record;
begin
  if not app.platform_access_allows(p_access_id, 'questionnaire') then
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

revoke all on function public.complete_platform_questionnaire_response(uuid, uuid) from public, anon;
grant execute on function public.complete_platform_questionnaire_response(uuid, uuid) to authenticated;

comment on function public.complete_platform_questionnaire_response(uuid, uuid) is
  'POR-012: Absenden des Befundbogens ueber die Plattform = abgeschlossen (ANN-245); danach aendert die Praxis nur per Korrektur (ANN-103). Nur eigene Plattform-Entwuerfe.';

-- -----------------------------------------------------------------------------
-- 7. Einen eigenen Entwurf verwerfen
-- -----------------------------------------------------------------------------
create function public.discard_platform_questionnaire_response(p_access_id uuid, p_response_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'questionnaire') then
    return false;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  delete from public.patient_questionnaire_responses r
  where r.id = p_response_id
    and r.patient_id = v_zugang.relationship_id
    and r.organization_id = v_zugang.organization_id
    and r.source = 'platform'
    and r.status = 'entwurf';
  if not found then
    return false;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'questionnaire_discard')
  );
  return true;
end;
$$;

revoke all on function public.discard_platform_questionnaire_response(uuid, uuid) from public, anon;
grant execute on function public.discard_platform_questionnaire_response(uuid, uuid) to authenticated;

comment on function public.discard_platform_questionnaire_response(uuid, uuid) is
  'POR-012: Die Person verwirft ihren eigenen Plattform-Entwurf des Befundbogens. Abgeschlossenes bleibt.';

-- -----------------------------------------------------------------------------
-- 8. Die Praxis sieht die Herkunft. Rumpf sonst unveraendert aus
--    20261006100100_log_001a_lesepfade.sql.
-- -----------------------------------------------------------------------------
drop function public.list_patient_questionnaire_responses(uuid);

create function public.list_patient_questionnaire_responses(p_patient_id uuid)
returns table (
  id                         uuid,
  instrument_id              text,
  definition_version         text,
  status                     text,
  recorded_on                date,
  answers                    jsonb,
  supersedes_response_id     uuid,
  superseded_by_response_id  uuid,
  change_reason              text,
  created_at                 timestamptz,
  updated_at                 timestamptz,
  completed_at               timestamptz,
  author_name                text,
  completed_by_name          text,
  source                     text
)
language plpgsql
security definer
set search_path = ''
as $$
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
      abschluss.display_name,
      r.source
    from public.patient_questionnaire_responses r
    left join public.patient_questionnaire_responses nachfolger
           on nachfolger.supersedes_response_id = r.id
    left join public.user_profiles verfasser on verfasser.id = r.created_by
    left join public.user_profiles abschluss on abschluss.id = r.completed_by
    where r.patient_id = p_patient_id and r.organization_id = v_org
    order by r.recorded_on desc, r.created_at desc;
end;
$$;

comment on function public.list_patient_questionnaire_responses(uuid) is
  'Erhobene Frageboegen einer Akte (FRB-002b), seit POR-012 mit Herkunft (source: practice oder platform). Alle vier Praxisrollen; Akte geoeffnet einmal je Tag (ADR-010 Fassung 3).';

revoke all on function public.list_patient_questionnaire_responses(uuid) from public, anon;
grant execute on function public.list_patient_questionnaire_responses(uuid) to authenticated;
