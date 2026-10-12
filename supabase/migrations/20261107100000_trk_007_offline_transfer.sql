-- =============================================================================
-- TRK-007 (TRK-EPIC-003): Die Einheit kommt auch ohne Netz an
--
-- ADR-024 Punkte 7 und 8: Ohne Verbindung bleibt der Haken auf dem Geraet
-- stehen und kommt in eine Warteschlange (loest ANN-305 ab). Uebertragen wird
-- additiv und wiederholbar:
--
--   * Jede Einheit und jeder Haken traegt eine Kennung, die das Geraet beim
--     Erfassen vergibt (UUID, ADR-014). Der Server legt die Zeile an oder
--     erkennt sie wieder; zweimal gesendet ist einmal gespeichert. Nichts
--     wird ueberschrieben, kein Last-Write-Wins (ADR-001 Punkt 5).
--   * Der Server urteilt beim Eingang mit denselben Pruefungen wie online:
--     Zugang, Faehigkeit, Lesefrist, laufender Plan. Die Uhr des Geraets steht
--     als Angabe der Person an der Zeile (`reported_*`), der Eingang am Server
--     in den bisherigen Spalten.
--   * Eine Kennung des Geraets gewaehrt nichts (ADR-023 Punkt 19): Trifft sie
--     eine fremde Einheit, antwortet der Server wie bei einem fremden Plan.
--
--   public.exercise_plan_sessions       + reported_started_at, reported_finished_at
--   public.exercise_plan_session_sets   + reported_done_at
--   app.offline_transfer_days           die Frist, wie weit zurueck (ANN-357)
--   public.sync_platform_exercise_session  die eine Uebertragung (ANN-357)
--   app.exercise_plan_sessions_json     + die Zeiten des Geraets (Art. 15)
--
-- Kein neues Auditereignis (ADR-024 Punkt 6, ADR-010): Das Datenmodell weist
-- nach; eine Vertretung wird protokolliert wie beim Beginnen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Zeit des Geraets als Angabe der Person (ADR-024 Punkt 8)
-- -----------------------------------------------------------------------------
alter table public.exercise_plan_sessions
  add column reported_started_at  timestamptz,
  add column reported_finished_at timestamptz;

alter table public.exercise_plan_session_sets
  add column reported_done_at timestamptz;

comment on column public.exercise_plan_sessions.reported_started_at is
  'TRK-007 (ADR-024 Punkt 8): Beginn nach der Uhr des Geraets, wenn die Einheit ohne Netz erfasst und spaeter uebertragen wurde - eine Angabe der Person, keine gepruefte Zeit. started_at ist der Eingang am Server.';
comment on column public.exercise_plan_sessions.reported_finished_at is
  'TRK-007 (ADR-024 Punkt 8): Ende nach der Uhr des Geraets bei einer uebertragenen Einheit. finished_at ist der Eingang am Server.';
comment on column public.exercise_plan_session_sets.reported_done_at is
  'TRK-007 (ADR-024 Punkt 8): Zeitpunkt des Hakens nach der Uhr des Geraets bei einer uebertragenen Einheit. done_at ist der Eingang am Server.';

-- -----------------------------------------------------------------------------
-- 2. Wie weit zurueck eine Einheit noch angenommen wird (ANN-357)
--
-- Dieselbe Zahl wie die Frist der Ablage auf dem Geraet (ADR-024 Punkt 5,
-- OFFLINE_FRIST_TAGE in src/lib/geraeteablage.ts); der Test
-- platform-exercise-sync.test.ts haelt beide gleich. Aelteres liegt auf
-- keinem Geraet mehr.
-- -----------------------------------------------------------------------------
create function app.offline_transfer_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 7
$$;

revoke all on function app.offline_transfer_days() from public, anon, authenticated;

comment on function app.offline_transfer_days() is
  'TRK-007 (ANN-357, ADR-024 Punkt 5): Eine ohne Netz erfasste Einheit wird hoechstens so viele Tage nach ihrem Tag noch angenommen - die Frist der Ablage auf dem Geraet.';

-- -----------------------------------------------------------------------------
-- 3. Die Uebertragung
--
-- Eine Einheit mit ihren Ereignissen in der Reihenfolge, in der getippt wurde:
--
--   { "id": uuid, "kind": "set",    "at": ts, "item_id": uuid, "set_number": n, "done": bool }
--   { "id": uuid, "kind": "finish", "at": ts, "note": text, "values": { ... } }
--
-- "finish" steht hoechstens einmal und zuletzt. Ergebnis:
--   { "session_id": uuid, "status": "ok" | "finished" | "empty", "note_dropped": bool }
--   finished: die Einheit war schon beendet - nichts geaendert (zweites Senden)
--   empty:    nichts angekommen, was eine Einheit traegt (alle Haken schon da
--             oder zurueckgenommen) - nichts angelegt
-- Fehler wie online: 42501 Zugang/Faehigkeit/Lesefrist, P0002 Plan oder
-- Einheit nicht (mehr) da bzw. zu alt, 22023 Form.
-- -----------------------------------------------------------------------------
create function public.sync_platform_exercise_session(
  p_access_id    uuid,
  p_plan_id      uuid,
  p_session_id   uuid,
  p_performed_on date,
  p_started_at   timestamptz,
  p_events       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang     public.platform_accesses%rowtype;
  v_plan       public.exercise_plans%rowtype;
  v_einheit    public.exercise_plan_sessions%rowtype;
  v_heute      date;
  v_neu        boolean := false;
  v_verworfen  boolean := false;
  v_ereignis   jsonb;
  v_nummer     integer := 0;
  v_anzahl     integer;
  v_art        text;
  v_saetze     smallint;
  v_satz       integer;
  v_zeit       timestamptz;
  v_notiz      text;
  v_keys       text[];
  v_werte      smallint[];
  v_erlaubt    boolean;
begin
  v_zugang := app.assert_platform_exercise(p_access_id);
  v_plan := app.platform_exercise_plan(p_access_id, p_plan_id);
  if v_plan.id is null then
    raise exception 'exercise plan not found' using errcode = 'P0002';
  end if;
  v_heute := app.training_today(v_zugang.organization_id);

  if p_session_id is null or p_performed_on is null or p_events is null
     or jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid transfer' using errcode = '22023';
  end if;
  v_anzahl := jsonb_array_length(p_events);
  -- Mehr tippt niemand in einer Einheit; schuetzt vor einer endlosen Liste.
  if v_anzahl > 1000 then
    raise exception 'too many events' using errcode = '22023';
  end if;
  -- Der Tag der Einheit ist die Angabe des Geraets - aber nicht in der
  -- Zukunft, nicht vor dem Planbeginn und nicht aelter als die Ablage.
  if p_performed_on > v_heute then
    raise exception 'session in the future' using errcode = '22023';
  end if;
  if p_performed_on < v_heute - app.offline_transfer_days()
     or p_performed_on < v_plan.runs_from then
    raise exception 'session too old' using errcode = 'P0002';
  end if;

  -- Wiedererkennen: dieselbe Kennung, derselbe Plan. Eine fremde Kennung
  -- antwortet wie ein fremder Plan (ADR-024 Punkt 7).
  select * into v_einheit from public.exercise_plan_sessions s where s.id = p_session_id;
  if v_einheit.id is not null then
    if v_einheit.plan_id <> v_plan.id
       or v_einheit.performed_on < v_heute - app.offline_transfer_days() then
      raise exception 'exercise session not found' using errcode = 'P0002';
    end if;
    if v_einheit.finished_at is not null then
      return jsonb_build_object('session_id', v_einheit.id, 'status', 'finished',
                                'note_dropped', false);
    end if;
  else
    -- Neu: anlegen. Ist an diesem Tag schon eine offen (zweites Geraet,
    -- Vertretung), kommen die Haken dazu - wie online (ANN-305).
    insert into public.exercise_plan_sessions (
      id, organization_id, plan_id, performed_on, platform_access_id, platform_access_kind,
      recorded_by, reported_started_at
    )
    values (
      p_session_id, v_plan.organization_id, v_plan.id, p_performed_on, v_zugang.id,
      v_zugang.access_kind, auth.uid(), p_started_at
    )
    on conflict (plan_id, performed_on) where finished_at is null do nothing
    returning * into v_einheit;
    if v_einheit.id is null then
      select * into v_einheit
      from public.exercise_plan_sessions s
      where s.plan_id = v_plan.id and s.performed_on = p_performed_on and s.finished_at is null;
    else
      v_neu := true;
    end if;
  end if;

  for v_ereignis in select e from jsonb_array_elements(p_events) e loop
    v_nummer := v_nummer + 1;
    if jsonb_typeof(v_ereignis) <> 'object' then
      raise exception 'invalid event' using errcode = '22023';
    end if;
    v_art := v_ereignis ->> 'kind';
    begin
      v_zeit := (v_ereignis ->> 'at')::timestamptz;
    exception when others then
      raise exception 'invalid event time' using errcode = '22023';
    end;

    if v_art = 'set' then
      if v_ereignis ->> 'id' is null then
        raise exception 'event without id' using errcode = '22023';
      end if;
      begin
        v_satz := (v_ereignis ->> 'set_number')::integer;
      exception when others then
        raise exception 'invalid set' using errcode = '22023';
      end;
      select i.sets into v_saetze
      from public.exercise_plan_items i
      where i.id = (v_ereignis ->> 'item_id')::uuid and i.plan_id = v_plan.id;
      if v_saetze is null then
        raise exception 'exercise not found' using errcode = 'P0002';
      end if;
      if v_satz is null or v_satz < 1 or v_satz > v_saetze then
        raise exception 'set out of range' using errcode = '22023';
      end if;
      if jsonb_typeof(v_ereignis -> 'done') <> 'boolean' then
        raise exception 'invalid set' using errcode = '22023';
      end if;
      if (v_ereignis ->> 'done')::boolean then
        -- Die Kennung des Hakens ist die Zeile: zweimal gesendet ist einmal
        -- gespeichert. Ein schon gesetzter Satz bleibt, wie er ist.
        insert into public.exercise_plan_session_sets (
          id, session_id, organization_id, item_id, set_number, reported_done_at
        )
        values (
          (v_ereignis ->> 'id')::uuid, v_einheit.id, v_einheit.organization_id,
          (v_ereignis ->> 'item_id')::uuid, v_satz, v_zeit
        )
        on conflict do nothing;
      else
        delete from public.exercise_plan_session_sets x
        where x.session_id = v_einheit.id
          and x.item_id = (v_ereignis ->> 'item_id')::uuid
          and x.set_number = v_satz;
      end if;

    elsif v_art = 'finish' then
      if v_nummer <> v_anzahl then
        raise exception 'finish must be last' using errcode = '22023';
      end if;
      v_notiz := nullif(btrim(coalesce(v_ereignis ->> 'note', ''), E' \t\r\n'), '');
      if v_notiz is not null and length(v_notiz) > 500 then
        raise exception 'note too long' using errcode = '22023';
      end if;
      select array_agg(w.parameter_key), array_agg(w.value)
        into v_keys, v_werte
      from app.tracking_values_from_json(v_ereignis -> 'values', 'session') w;
      -- Der Server urteilt beim Eingang (Punkt 8): Ist die Einwilligung
      -- inzwischen widerrufen, kommen Satz und Angaben nicht an; die Einheit
      -- wird trotzdem beendet, und die Ansicht sagt es (ANN-357).
      v_erlaubt := app.platform_exercise_note_allowed(v_zugang.relationship_kind,
                                                      v_zugang.relationship_id);
      if not v_erlaubt and (v_notiz is not null or v_keys is not null) then
        v_verworfen := true;
        v_notiz := null;
        v_keys := null;
        v_werte := null;
      end if;
      -- Ohne einen Haken gibt es nichts zu beenden (wie in der Ansicht).
      if not exists (select 1 from public.exercise_plan_session_sets x
                     where x.session_id = v_einheit.id) then
        exit;
      end if;
      update public.exercise_plan_sessions
         set finished_at = now(), difficulty_note = v_notiz, updated_at = now(),
             finished_access_id = v_zugang.id, finished_access_kind = v_zugang.access_kind,
             finished_by = auth.uid(), reported_finished_at = v_zeit
       where id = v_einheit.id;
      insert into public.exercise_plan_session_values (organization_id, session_id, parameter_key, value)
      select v_einheit.organization_id, v_einheit.id, w.key, w.value
      from unnest(v_keys, v_werte) as w (key, value);

    else
      raise exception 'invalid event kind' using errcode = '22023';
    end if;
  end loop;

  -- Eine neu angelegte Einheit ohne einen Haken traegt nichts: Sie entstuende
  -- nur, weil ein zweites Senden alles schon vorfand (ANN-357).
  if v_neu and not exists (select 1 from public.exercise_plan_session_sets x
                           where x.session_id = v_einheit.id) then
    delete from public.exercise_plan_sessions s where s.id = v_einheit.id;
    return jsonb_build_object('session_id', v_einheit.id, 'status', 'empty',
                              'note_dropped', false);
  end if;

  update public.exercise_plan_sessions set updated_at = now()
   where id = v_einheit.id and finished_at is null;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'exercise_session')
  );
  return jsonb_build_object('session_id', v_einheit.id, 'status', 'ok',
                            'note_dropped', v_verworfen);
end;
$$;

revoke all on function public.sync_platform_exercise_session(uuid, uuid, uuid, date, timestamptz, jsonb)
  from public, anon;
grant execute on function public.sync_platform_exercise_session(uuid, uuid, uuid, date, timestamptz, jsonb)
  to authenticated;

comment on function public.sync_platform_exercise_session(uuid, uuid, uuid, date, timestamptz, jsonb) is
  'TRK-007 (ADR-024 Punkte 7 und 8, ANN-357): uebertraegt eine Einheit mit ihren Haken und wahlweise dem Ende, so wie das Geraet sie erfasst hat - additiv und wiederholbar ueber die Kennungen des Geraets. Dieselben Rechte und Pruefungen wie Beginnen, Abhaken und Beenden, beim Eingang. Fremde Kennung wie fremder Plan (P0002). Ohne Einwilligung im Training fallen Satz und Angaben weg (note_dropped).';

-- -----------------------------------------------------------------------------
-- 4. Fuer die Praxis und die Auskunft: die Zeiten des Geraets
--
-- Aus 20261105100000_trk_001_session_values.sql; neu sind nur die beiden
-- reported_*-Felder. get_exercise_plan und export_patient_record lesen diese
-- Funktion.
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
    -- TRK-007: nach der Uhr des Geraets, wenn ohne Netz erfasst.
    'reported_started_at', s.reported_started_at,
    'reported_finished_at', s.reported_finished_at,
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
