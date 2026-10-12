-- =============================================================================
-- TRK-005 (TRK-EPIC-002): Kontext mit erfasst
--
-- IDEA-TRK-006: Ohne die Bedingungen ist eine Zeitreihe Rauschen - Uhrzeit,
-- Seite, mit oder ohne Schmerzmittel. Die Uhrzeit steht schon an jedem
-- Check-in (recorded_at) und an jeder Einheit; neu sind zwei Angaben zum
-- Zusammenhang, die die Praxis zum Check-in dazunimmt (ANN-355):
--
--   app.tracking_parameters()        + Spalte role: 'question' | 'context'
--                                     + painkiller_24h, pain_side
--   app.checkin_keys_valid           eine bis fuenf Fragen, Zusammenhang dazu
--   public.submit_platform_checkin   mindestens eine Frage, nicht nur Kontext
--
-- Eine Angabe zum Zusammenhang ist eine Angabe wie jede andere: dieselbe
-- Tabelle, dieselbe Pruefung, dieselbe Frist, freiwillig. Sie zaehlt nicht zu
-- den fuenf Fragen (ANN-349), weil sie keine Groesse der Zeitreihe ist,
-- sondern ihre Lesart. Erfassen und anzeigen, nie bewerten (ADR-006 Punkt 11).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Katalog mit Rolle
--
-- Die Rueckgabe aendert sich (role), deshalb neu angelegt. Die Funktionen,
-- die den Katalog lesen, sind SQL bzw. PL/pgSQL ohne gebundene Abhaengigkeit;
-- die Pruefungen der Tabellen gehen ueber app.tracking_value_valid.
-- -----------------------------------------------------------------------------
drop function app.tracking_parameters();

create function app.tracking_parameters()
returns table (
  parameter_key text, cadence text, min_value integer, max_value integer, sort_order integer,
  role text
)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('session_exertion',          'session', 0, 10,  1, 'question'),
    ('session_pain',              'session', 0, 10,  2, 'question'),
    ('session_confidence',        'session', 0, 10,  3, 'question'),
    ('pain_rest',                 'checkin', 0, 10,  1, 'question'),
    ('pain_load',                 'checkin', 0, 10,  2, 'question'),
    ('pain_after_load',           'checkin', 0, 10,  3, 'question'),
    ('pain_night',                'checkin', 0, 10,  4, 'question'),
    ('pain_morning',              'checkin', 0, 10,  5, 'question'),
    ('pain_recovery_hours',       'checkin', 0, 72,  6, 'question'),
    ('pain_quality',              'checkin', 1, 5,   7, 'question'),
    ('movement_confidence',       'checkin', 0, 10,  8, 'question'),
    ('daily_impairment',          'checkin', 0, 10,  9, 'question'),
    ('sleep_quality',             'checkin', 0, 10, 10, 'question'),
    ('stress',                    'checkin', 0, 10, 11, 'question'),
    ('morning_stiffness_minutes', 'checkin', 0, 240, 12, 'question'),
    -- TRK-005: zum Zusammenhang (IDEA-TRK-006, ANN-355). Schmerzmittel in
    -- den letzten 24 Stunden: 0 nein, 1 ja. Seite: 1 links, 2 rechts,
    -- 3 beidseits, 4 in der Mitte.
    ('painkiller_24h',            'checkin', 0, 1,  13, 'context'),
    ('pain_side',                 'checkin', 1, 4,  14, 'context')
  ) as t (parameter_key, cadence, min_value, max_value, sort_order, role)
$$;

revoke all on function app.tracking_parameters() from public, anon, authenticated;

comment on function app.tracking_parameters() is
  'TRK-001, TRK-004, TRK-005 (ANN-348, ANN-353 bis ANN-355): Katalog der Erfassungsgroessen nach Takt (IDEA-TRK-001) - Schluessel, Takt, Wertebereich, Reihenfolge und Rolle (Frage oder Zusammenhang). Die eine Stelle; Beschriftungen und die Woerter einer Auswahl in src/lib/erfassungsgroessen.ts. Keine Schwelle, keine Bewertung (ADR-006 Punkt 11).';

-- -----------------------------------------------------------------------------
-- 2. Fragen des Check-ins: eine bis fuenf Fragen, Zusammenhang dazu
--
-- Aus 20261105110000_trk_002_checkins.sql; dieselbe Signatur, sie prueft
-- weiter den Constraint an checkin_schedules. Bestehende Takte haben nur
-- Fragen und bleiben gueltig.
-- -----------------------------------------------------------------------------
create or replace function app.checkin_keys_valid(p_keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_keys), 0) > 0
     and (select count(distinct k) from unnest(p_keys) k) = cardinality(p_keys)
     and not exists (
       select 1 from unnest(p_keys) k
       where not exists (
         select 1 from app.tracking_parameters() t
         where t.parameter_key = k and t.cadence = 'checkin'
       )
     )
     and (
       select count(*) from unnest(p_keys) k
       join app.tracking_parameters() t on t.parameter_key = k and t.cadence = 'checkin'
       where t.role = 'question'
     ) between 1 and 5
$$;

comment on function app.checkin_keys_valid(text[]) is
  'TRK-002, TRK-005: Fragen eines Check-ins - eine bis fuenf verschiedene Fragen des Takts checkin (ANN-349), dazu beliebig die Angaben zum Zusammenhang (ANN-355).';

-- -----------------------------------------------------------------------------
-- 3. Beantworten: mindestens eine Frage
--
-- Aus 20261105120000_trk_003_platform_checkins.sql; neu ist nur die Pruefung,
-- dass nicht allein der Zusammenhang beantwortet ist.
-- -----------------------------------------------------------------------------
create or replace function public.submit_platform_checkin(p_access_id uuid, p_values jsonb)
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
  -- Jede Frage ist freiwillig, mindestens eine beantwortet (ANN-349); eine
  -- Angabe zum Zusammenhang allein ist kein Check-in (TRK-005, ANN-355).
  if v_keys is null or not exists (
    select 1 from unnest(v_keys) k
    join app.tracking_parameters() t on t.parameter_key = k and t.cadence = 'checkin'
    where t.role = 'question'
  ) then
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
  'TRK-003, TRK-005: beantwortet den faelligen Check-in des Verhaeltnisses - { Schluessel: Wert } nur zu den eingestellten Fragen und Angaben zum Zusammenhang, mindestens eine Frage (ANN-349, ANN-355); hoechstens einer am Tag (ANN-350). Nur die Person und ihre rechtliche Vertretung (ANN-352), nicht in der Lesefrist, im Training nur mit Einwilligung (42501). Ohne Takt P0002, nicht faellig oder falscher Wert 22023. Keine Benachrichtigung an die Praxis (DSN-001 D5).';

