-- =============================================================================
-- ABN-014 (BEF-101): Der Server prueft Erhebungen gegen die Definition
--
-- Bis hierher pruefte der Server nur die Form der Antworten (ANN-105): ein
-- Objekt, Kennungen als Schluessel, hoechstens 64 KiB. Abnahme Jannes,
-- 2026-10-02: Er prueft auch Instrument und Version, gueltige Antwortoptionen,
-- Wertebereiche und unzulaessige Kombinationen - gegen dieselben
-- Definitionsdateien wie die Anwendung, nicht gegen eine zweite Fassung von
-- Hand.
--
--   * `public.questionnaire_definitions` traegt jede Fassung (Kennung@Version)
--     als jsonb. Die Zeilen schreibt nicht diese Migration, sondern eine von
--     scripts/definitionen-sql.mjs erzeugte (ANN-219); ein Test haelt Dateien
--     und Tabelle deckungsgleich. Produktinhalt: fuer alle Praxen gleich, ohne
--     organization_id, ohne Personenbezug (ANN-083). Kein Lesezugriff fuer
--     Anwendungsrollen - die Anwendung liest die Dateien des Releases.
--   * `app.assert_questionnaire_answers(instrument, version, answers)` prueft
--     je Antwort: Item der Fassung, Form je Typ (wie `antwortSchema` in
--     src/features/assessments/antworten.ts), Optionen, Skalenbereich, Laenge
--     freier Angaben, "nein" allein, eigene Angabe nur an einer Option, die
--     sie vorsieht, Koerperbereich bekannt.
--   * Korrektur (BEF-101 Punkt 2): Der Erhebungstag einer Korrektur ist der
--     der korrigierten Erhebung; der Korrekturzeitpunkt ist created_at.
-- =============================================================================

create table public.questionnaire_definitions (
  id             uuid primary key default extensions.gen_random_uuid(),
  instrument_id  text not null check (instrument_id ~ '^[a-z][a-z0-9_]*$' and length(instrument_id) <= 80),
  version        text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  definition     jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_at     timestamptz not null default now(),
  constraint questionnaire_definitions_key unique (instrument_id, version),
  constraint questionnaire_definitions_matches_meta check (
    definition->'meta'->>'id' = instrument_id and definition->'meta'->>'version' = version
  )
);

comment on table public.questionnaire_definitions is
  'Fassungen der Fragebogen-Definitionen fuer die Serverpruefung der Antworten (ABN-014, BEF-101). Erzeugt aus src/features/assessments/definitionen/scores/ durch scripts/definitionen-sql.mjs (ANN-219). Produktinhalt ohne Personenbezug; eine Fassung wird nie geaendert.';

alter table public.questionnaire_definitions enable row level security;
revoke all on public.questionnaire_definitions from public, anon, authenticated;

-- Eine eingetragene Fassung bleibt, wie sie ist: Geaenderter Inhalt ist eine
-- neue Version (ANN-084).
create function app.guard_questionnaire_definition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'questionnaire definitions are immutable' using errcode = '23514';
end;
$$;

create trigger questionnaire_definitions_immutable
  before update or delete on public.questionnaire_definitions
  for each row execute function app.guard_questionnaire_definition();

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('questionnaire_definitions', 'konfiguration', 'keine',
   'Fassungen der Fragebogen-Definitionen (Produktinhalt, ohne Personenbezug). Bleiben, solange eine Erhebung sie nennen kann (ABN-014).', 49);

-- Bis die erzeugte Migration sie ersetzt: kein Koerperbereich ist bekannt.
create function app.questionnaire_body_regions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[]::text[]
$$;

-- -----------------------------------------------------------------------------
-- app.assert_questionnaire_answers(instrument, version, answers)
-- -----------------------------------------------------------------------------
create function app.assert_questionnaire_answers(
  p_instrument_id text,
  p_version       text,
  p_answers       jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_definition jsonb;
  v_key        text;
  v_val        jsonb;
  v_item       jsonb;
  v_typ        text;
  v_ids        text[];
  v_frei       text[];
  v_exklusiv   text[];
  v_auswahl    text[];
  v_text       text;
  v_m          jsonb;
  v_zahl       numeric;
begin
  -- Die Form zuerst: Objekt, Kennungen, Groesse (ANN-105).
  perform app.assert_questionnaire_answers(p_answers);

  select d.definition into v_definition
  from public.questionnaire_definitions d
  where d.instrument_id = p_instrument_id and d.version = p_version;
  if v_definition is null then
    raise exception 'unknown questionnaire definition' using errcode = '22023';
  end if;

  for v_key, v_val in select key, value from jsonb_each(p_answers) loop
    v_item := null;
    select i into v_item
    from jsonb_array_elements(v_definition->'items') i
    where i->>'id' = v_key;
    if v_item is null then
      raise exception 'answer to an unknown item' using errcode = '22023';
    end if;
    v_typ := v_item->>'typ';

    -- Kennung einer Option: ihre id, sonst ihr Punktwert (ANN-102, optionKennung).
    select coalesce(array_agg(coalesce(o->>'id', (o->'wert')::text)), '{}'),
           coalesce(array_agg(coalesce(o->>'id', (o->'wert')::text))
                      filter (where (o->>'freitext')::boolean), '{}'),
           coalesce(array_agg(coalesce(o->>'id', (o->'wert')::text))
                      filter (where (o->>'exklusiv')::boolean), '{}')
      into v_ids, v_frei, v_exklusiv
    from jsonb_array_elements(coalesce(v_item->'optionen', '[]'::jsonb)) o;

    if v_typ in ('einzelauswahl', 'mehrfachauswahl') then
      if exists (select 1 from jsonb_object_keys(v_val) k where k not in ('auswahl', 'freitext')) then
        raise exception 'answer has unexpected fields' using errcode = '22023';
      end if;
      if v_typ = 'einzelauswahl' then
        if jsonb_typeof(v_val->'auswahl') is distinct from 'string' then
          raise exception 'answer is not a choice' using errcode = '22023';
        end if;
        v_auswahl := array[v_val->>'auswahl'];
      else
        if jsonb_typeof(v_val->'auswahl') is distinct from 'array'
           or jsonb_array_length(v_val->'auswahl') = 0
           or exists (select 1 from jsonb_array_elements(v_val->'auswahl') e
                      where jsonb_typeof(e) <> 'string') then
          raise exception 'answer is not a choice' using errcode = '22023';
        end if;
        select array_agg(e) into v_auswahl from jsonb_array_elements_text(v_val->'auswahl') e;
        if cardinality(v_auswahl) <> (select count(distinct e) from unnest(v_auswahl) e) then
          raise exception 'option chosen twice' using errcode = '22023';
        end if;
        -- "nein" steht allein.
        if v_auswahl && v_exklusiv and cardinality(v_auswahl) > 1 then
          raise exception 'exclusive option combined' using errcode = '22023';
        end if;
      end if;
      if not (v_auswahl <@ v_ids) then
        raise exception 'unknown option' using errcode = '22023';
      end if;
      if v_val ? 'freitext' then
        if jsonb_typeof(v_val->'freitext') <> 'string'
           or length(regexp_replace(v_val->>'freitext', '^\s+|\s+$', '', 'g')) not between 1 and 2000 then
          raise exception 'free text out of range' using errcode = '22023';
        end if;
        -- Eine eigene Angabe gehoert zu einer Option, die sie vorsieht.
        if not (v_auswahl && v_frei) then
          raise exception 'free text without matching option' using errcode = '22023';
        end if;
      end if;

    elsif v_typ in ('skala', 'zahl') then
      if exists (select 1 from jsonb_object_keys(v_val) k where k <> 'wert')
         or jsonb_typeof(v_val->'wert') is distinct from 'number' then
        raise exception 'answer is not a number' using errcode = '22023';
      end if;
      v_zahl := (v_val->>'wert')::numeric;
      -- Positiv formuliert: Fehlt ein Wert der Definition, ist NULL nicht
      -- "in Ordnung", sondern abgewiesen (Zweitreview H1).
      if v_typ = 'skala' and not coalesce(
           v_zahl = trunc(v_zahl)
           and v_zahl >= (v_item->'skala'->>'min')::numeric
           and v_zahl <= (v_item->'skala'->>'max')::numeric, false) then
        raise exception 'value out of range' using errcode = '22023';
      end if;

    elsif v_typ = 'freitext' then
      if exists (select 1 from jsonb_object_keys(v_val) k where k <> 'text')
         or jsonb_typeof(v_val->'text') is distinct from 'string' then
        raise exception 'answer is not a text' using errcode = '22023';
      end if;
      -- Jeder Leerraum wie Zods .trim(), nicht nur Leerzeichen (Zweitreview N1).
      v_text := regexp_replace(v_val->>'text', '^\s+|\s+$', '', 'g');
      if length(v_text) not between 1 and 2000 then
        raise exception 'free text out of range' using errcode = '22023';
      end if;

    elsif v_typ = 'koerperschema' then
      if exists (select 1 from jsonb_object_keys(v_val) k where k <> 'markierungen')
         or jsonb_typeof(v_val->'markierungen') is distinct from 'array'
         or jsonb_array_length(v_val->'markierungen') not between 1 and 30 then
        raise exception 'answer is not a body chart' using errcode = '22023';
      end if;
      for v_m in select e from jsonb_array_elements(v_val->'markierungen') e loop
        -- Schritt fuer Schritt und positiv: Erst die Form, dann die Werte -
        -- ein leeres Objekt oder ein fehlender Bereich ergibt nie NULL statt
        -- "abgewiesen" (Zweitreview H1).
        if jsonb_typeof(v_m) is distinct from 'object'
           or not coalesce(
                (select array_agg(k order by k) from jsonb_object_keys(v_m) k)
                  = array['bereich', 'x', 'y'], false)
           or jsonb_typeof(v_m->'x') is distinct from 'number'
           or jsonb_typeof(v_m->'y') is distinct from 'number'
           or jsonb_typeof(v_m->'bereich') is distinct from 'string' then
          raise exception 'body chart mark out of range' using errcode = '22023';
        end if;
        if not coalesce(
             (v_m->>'x')::numeric between 0 and 1
             and (v_m->>'y')::numeric between 0 and 1
             and (v_m->>'bereich') = any (app.questionnaire_body_regions()), false) then
          raise exception 'body chart mark out of range' using errcode = '22023';
        end if;
      end loop;

    else
      raise exception 'unknown item type' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function app.questionnaire_body_regions() from public, anon;

comment on function app.assert_questionnaire_answers(text, text, jsonb) is
  'Prueft Antworten gegen die Definition der genannten Fassung (ABN-014, BEF-101): Item, Form je Typ, Optionen, Skalenbereich, freie Angaben, exklusive Optionen, Koerperbereiche. Dieselben Regeln wie antwortSchema in src/features/assessments/antworten.ts.';

revoke all on function app.assert_questionnaire_answers(text, text, jsonb) from public, anon;

-- -----------------------------------------------------------------------------
-- save_questionnaire_response (Rumpf aus dem heutigen Stand, nur die
-- markierten Zeilen geaendert)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_questionnaire_response(p_patient_id uuid, p_response_id uuid, p_instrument_id text, p_definition_version text, p_recorded_on date, p_answers jsonb, p_supersedes_response_id uuid DEFAULT NULL::uuid, p_change_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_alt      record;
  v_id       uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  -- Eine fremde Akte und eine nicht vorhandene sehen gleich aus (ADR-003).
  perform 1 from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_recorded_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_recorded_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  -- ABN-014 (BEF-101): Form, dann Inhalt gegen die Definition dieser Fassung.
  perform app.assert_questionnaire_answers(p_instrument_id, p_definition_version, p_answers);

  if p_response_id is not null then
    select r.status, r.patient_id, r.instrument_id, r.definition_version,
           r.supersedes_response_id, r.recorded_on
      into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_response_id and r.organization_id = v_org
    for update;

    if not found or v_alt.patient_id <> p_patient_id then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'entwurf' then
      raise exception 'questionnaire response is completed' using errcode = '23514';
    end if;
    -- Was ein Entwurf festhaelt, laesst sich beim Ueberschreiben nicht
    -- aendern - und wird dann abgewiesen statt still uebergangen.
    if v_alt.instrument_id <> p_instrument_id
       or v_alt.definition_version <> p_definition_version
       or p_supersedes_response_id is not null
       or p_change_reason is not null then
      raise exception 'draft identity is fixed' using errcode = '22023';
    end if;
    -- ABN-014: Eine Korrektur bleibt am Erhebungstag der korrigierten.
    if v_alt.supersedes_response_id is not null and p_recorded_on <> v_alt.recorded_on then
      raise exception 'a correction keeps the date of the original' using errcode = '22023';
    end if;

    update public.patient_questionnaire_responses
       set answers     = p_answers,
           recorded_on = p_recorded_on,
           updated_at  = now(),
           updated_by  = v_actor
     where id = p_response_id;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'questionnaire_response.updated', 'questionnaire_response', p_response_id,
      'success', jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
    );

    return p_response_id;
  end if;

  if p_supersedes_response_id is not null then
    select r.status, r.patient_id, r.instrument_id, r.recorded_on
      into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_supersedes_response_id and r.organization_id = v_org
    for update;

    if not found or v_alt.patient_id <> p_patient_id then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'abgeschlossen' then
      raise exception 'only a completed questionnaire can be corrected' using errcode = '23514';
    end if;
    if v_alt.instrument_id <> p_instrument_id then
      raise exception 'correction must use the same instrument' using errcode = '23514';
    end if;
    -- ABN-014 (BEF-101 Punkt 2): Erhebungstag und Korrekturzeitpunkt sind
    -- getrennt. Der Tag bleibt der der korrigierten Erhebung; wann korrigiert
    -- wurde, sagt created_at.
    if p_recorded_on <> v_alt.recorded_on then
      raise exception 'a correction keeps the date of the original' using errcode = '22023';
    end if;
    if p_change_reason is null or length(btrim(p_change_reason)) < 3 then
      raise exception 'a correction needs a reason' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.patient_questionnaire_responses r
      where r.supersedes_response_id = p_supersedes_response_id
    ) then
      raise exception 'questionnaire response already corrected' using errcode = '23505';
    end if;
  elsif p_change_reason is not null then
    raise exception 'a reason belongs to a correction' using errcode = '22023';
  end if;

  -- Kennung und Version pruefen die Constraints der Tabelle.
  insert into public.patient_questionnaire_responses (
    organization_id, patient_id, instrument_id, definition_version, recorded_on, answers,
    supersedes_response_id, change_reason, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_instrument_id, p_definition_version, p_recorded_on, p_answers,
    p_supersedes_response_id, nullif(btrim(p_change_reason), ''), v_actor, v_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'questionnaire_response.created', 'questionnaire_response', v_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'instrument_id', p_instrument_id,
      'definition_version', p_definition_version,
      'supersedes_response_id', p_supersedes_response_id
    )
  );

  return v_id;
end;
$function$
;

