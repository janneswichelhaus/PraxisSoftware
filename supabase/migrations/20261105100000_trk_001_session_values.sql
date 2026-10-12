-- =============================================================================
-- TRK-001 (TRK-EPIC-001): Erfassungsgroessen nach Takt und die Angaben zur
-- Einheit
--
-- IDEA-TRK-001: Parameter nach Erfassungstakt ordnen - je Einheit, im
-- Check-in, periodisch. IDEA-TRK-002: wenige Fragen, dafuer beantwortet; der
-- Wunsch "alle denkbaren Parameter" ist eine Anforderung an das Datenmodell
-- (erweiterbar), nicht an die Erfassung (ANN-348).
--
--   app.tracking_parameters()              der Katalog, die eine Stelle
--   app.tracking_value_valid(...)          Groesse, Takt und Wertebereich
--   public.exercise_plan_session_values    Angaben zur Einheit
--   public.finish_platform_exercise_session  + p_values (Anstrengung, Schmerz)
--   app.exercise_plan_sessions_json        + values fuer Praxis und Auskunft
--
-- Erfassen und anzeigen, nie bewerten (ADR-006 Punkt 11, Verbot 2): kein
-- Score, keine Schwelle, keine Farbe, kein Hinweis aus einem Wert. Im
-- Training sind die Angaben Gesundheitsangaben und brauchen die Einwilligung
-- (ADR-021 Punkt 4) - dieselbe Pruefung wie "Das war schwierig, weil ..."
-- (ANN-306).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Katalog der Erfassungsgroessen (ANN-348)
--
-- Takt `session`: direkt nach einer Einheit. Takt `checkin`: in der
-- wiederkehrenden Selbstauskunft (TRK-003). Eine neue Groesse ist eine Zeile
-- mehr in dieser Funktion und in src/lib/erfassungsgroessen.ts; der Test
-- tracking-parameters.test.ts haelt beide deckungsgleich. Bewegungssicherheit
-- und differenzierter Schmerz kommen mit TRK-EPIC-002.
-- -----------------------------------------------------------------------------
create function app.tracking_parameters()
returns table (parameter_key text, cadence text, min_value integer, max_value integer, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('session_exertion',          'session', 0, 10,  1),
    ('session_pain',              'session', 0, 10,  2),
    ('pain_rest',                 'checkin', 0, 10,  1),
    ('pain_load',                 'checkin', 0, 10,  2),
    ('daily_impairment',          'checkin', 0, 10,  3),
    ('sleep_quality',             'checkin', 0, 10,  4),
    ('stress',                    'checkin', 0, 10,  5),
    ('morning_stiffness_minutes', 'checkin', 0, 240, 6)
  ) as t (parameter_key, cadence, min_value, max_value, sort_order)
$$;

revoke all on function app.tracking_parameters() from public, anon, authenticated;

comment on function app.tracking_parameters() is
  'TRK-001 (ANN-348): Katalog der Erfassungsgroessen nach Takt (IDEA-TRK-001) - Schluessel, Takt, Wertebereich, Reihenfolge. Die eine Stelle; Beschriftungen in src/lib/erfassungsgroessen.ts. Keine Schwelle, keine Bewertung (ADR-006 Punkt 11).';

create function app.tracking_value_valid(p_key text, p_cadence text, p_value integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select p_value between t.min_value and t.max_value
    from app.tracking_parameters() t
    where t.parameter_key = p_key and t.cadence = p_cadence
  ), false)
$$;

revoke all on function app.tracking_value_valid(text, text, integer) from public, anon, authenticated;

comment on function app.tracking_value_valid(text, text, integer) is
  'TRK-001: ob ein Wert zu einer Erfassungsgroesse dieses Takts und in ihrem Bereich liegt.';

-- Ein Objekt { Schluessel: ganze Zahl } aus der Plattform in Zeilen - oder
-- 22023, wenn ein Schluessel nicht zum Takt passt oder ein Wert keiner ist.
create function app.tracking_values_from_json(p_values jsonb, p_cadence text)
returns table (parameter_key text, value smallint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key  text;
  v_wert jsonb;
begin
  if p_values is null or p_values = 'null'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'values must be an object' using errcode = '22023';
  end if;
  for v_key, v_wert in select * from jsonb_each(p_values) loop
    -- null heisst: nicht beantwortet (IDEA-TRK-002, fehlend ist ehrlich).
    continue when jsonb_typeof(v_wert) = 'null';
    if jsonb_typeof(v_wert) <> 'number'
       or (v_wert #>> '{}')::numeric <> trunc((v_wert #>> '{}')::numeric)
       or not app.tracking_value_valid(v_key, p_cadence, (v_wert #>> '{}')::numeric::integer) then
      raise exception 'invalid value for %', v_key using errcode = '22023';
    end if;
    parameter_key := v_key;
    value := (v_wert #>> '{}')::numeric::smallint;
    return next;
  end loop;
end;
$$;

revoke all on function app.tracking_values_from_json(jsonb, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Angaben zur Einheit
-- -----------------------------------------------------------------------------
create table public.exercise_plan_session_values (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  session_id      uuid not null,
  parameter_key   text not null,
  value           smallint not null,
  recorded_at     timestamptz not null default now(),

  constraint exercise_plan_session_values_one unique (session_id, parameter_key),
  constraint exercise_plan_session_values_valid
    check (app.tracking_value_valid(parameter_key, 'session', value)),
  constraint exercise_plan_session_values_session_fk
    foreign key (session_id, organization_id)
    references public.exercise_plan_sessions (id, organization_id) on delete cascade
);

comment on table public.exercise_plan_session_values is
  'TRK-001: Angaben der Person zu einer beendeten Einheit (Takt session, ANN-348) - Anstrengung und Schmerz, je 0 bis 10, freiwillig. Datenklasse wie die Einheit; faellt mit ihr. Geschrieben nur ueber finish_platform_exercise_session. Kein Tabellenrecht (ADR-004).';

revoke all on public.exercise_plan_session_values from public, anon, authenticated;
alter table public.exercise_plan_session_values enable row level security;

create policy exercise_plan_session_values_select_scoped
  on public.exercise_plan_session_values for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and exists (
      select 1 from public.exercise_plan_sessions s
      join public.exercise_plans p on p.id = s.plan_id
      where s.id = exercise_plan_session_values.session_id
        and app.can_read_exercise_plans(p.service_area)
    )
  );

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('exercise_plan_session_values', 'patientenakte', 'ueber_elterndatensatz',
   'Angaben zu einer Einheit eines Behandlungsplans (TRK-001), von der Person erfasst. Fallen mit der Einheit.',
   49),
  ('exercise_plan_session_values', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Angaben zu einer Einheit eines Trainingsplans (TRK-001), von der Person erfasst. Fallen mit der Einheit.',
   57);

-- -----------------------------------------------------------------------------
-- 3. Beenden mit Angaben
--
-- Aus 20261019110000_ueb_010_exercise_sessions.sql; neu ist p_values. Die
-- alte Signatur faellt, damit es genau einen Weg gibt; ohne p_values bleibt
-- der Aufruf gleich.
-- -----------------------------------------------------------------------------
drop function public.finish_platform_exercise_session(uuid, uuid, text);

create function public.finish_platform_exercise_session(
  p_access_id  uuid,
  p_session_id uuid,
  p_note       text,
  p_values     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_einheit public.exercise_plan_sessions%rowtype;
  v_notiz   text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_keys    text[];
  v_werte   smallint[];
begin
  v_zugang := app.assert_platform_exercise(p_access_id);
  v_einheit := app.platform_open_exercise_session(p_access_id, p_session_id);
  if v_einheit.id is null then
    raise exception 'exercise session not found' using errcode = 'P0002';
  end if;
  if v_notiz is not null then
    if length(v_notiz) > 500 then
      raise exception 'note too long' using errcode = '22023';
    end if;
    if not app.platform_exercise_note_allowed(v_zugang.relationship_kind, v_zugang.relationship_id) then
      raise exception 'note requires consent' using errcode = '42501';
    end if;
  end if;

  -- TRK-001: Erst pruefen, dann schreiben - ein falscher Wert beendet nichts.
  select array_agg(w.parameter_key), array_agg(w.value)
    into v_keys, v_werte
  from app.tracking_values_from_json(p_values, 'session') w;
  if v_keys is not null
     and not app.platform_exercise_note_allowed(v_zugang.relationship_kind, v_zugang.relationship_id) then
    raise exception 'values require consent' using errcode = '42501';
  end if;

  update public.exercise_plan_sessions
     set finished_at = now(), difficulty_note = v_notiz, updated_at = now(),
         finished_access_id = v_zugang.id, finished_access_kind = v_zugang.access_kind,
         finished_by = auth.uid()
   where id = v_einheit.id;

  insert into public.exercise_plan_session_values (organization_id, session_id, parameter_key, value)
  select v_einheit.organization_id, v_einheit.id, w.key, w.value
  from unnest(v_keys, v_werte) as w (key, value);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'exercise_session')
  );
end;
$$;

revoke all on function public.finish_platform_exercise_session(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.finish_platform_exercise_session(uuid, uuid, text, jsonb) to authenticated;

comment on function public.finish_platform_exercise_session(uuid, uuid, text, jsonb) is
  'UEB-010, TRK-001: beendet eine offene Einheit, wahlweise mit "Das war schwierig, weil ..." (hoechstens 500 Zeichen) und mit Angaben zur Einheit { session_exertion, session_pain: 0 bis 10 } (ANN-348); im Training beides nur mit Einwilligung (ANN-306). Ein ungueltiger Wert 22023, dann bleibt die Einheit offen. Danach aendert sich an der Einheit nichts mehr.';

-- -----------------------------------------------------------------------------
-- 4. Fuer die Praxis und die Auskunft: die Angaben an der Einheit
--
-- Aus 20261019110000_ueb_010_exercise_sessions.sql; neu ist nur 'values'.
-- get_exercise_plan und export_patient_record lesen diese Funktion.
-- -----------------------------------------------------------------------------
create or replace function app.exercise_plan_sessions_json(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'performed_on', s.performed_on,
    'started_at', s.started_at,
    'finished_at', s.finished_at,
    'sets_done', (select count(*) from public.exercise_plan_session_sets x where x.session_id = s.id),
    'sets_total', (select coalesce(sum(i.sets), 0) from public.exercise_plan_items i
                   where i.plan_id = s.plan_id),
    'difficulty_note', s.difficulty_note,
    -- TRK-001: die Angaben der Person, unveraendert (ADR-006 Punkt 3).
    'values', (select coalesce(jsonb_object_agg(v.parameter_key, v.value), '{}'::jsonb)
               from public.exercise_plan_session_values v where v.session_id = s.id),
    'recorded_by_kind', s.platform_access_kind,
    -- Wer beendet und damit "schwierig, weil ..." geschrieben hat.
    'finished_by_kind', s.finished_access_kind
  ) order by s.performed_on desc, s.started_at desc), '[]'::jsonb)
  from public.exercise_plan_sessions s
  where s.plan_id = p_plan_id
$$;
