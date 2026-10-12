-- =============================================================================
-- OUT-003 (OUT-EPIC-001): Anzeigende Uebungsanalyse - abgehakte Saetze je Uebung
--
-- IDEA-OUT-006: je Uebung ueber die Zeit, wie oft sie ganz, teilweise oder gar
-- nicht abgehakt wurde. Die Einheit traegt dafuer neben sets_done die Zahl der
-- abgehakten Saetze je Position (sets_by_item: {item_id: n}); gezaehlt wird in
-- der Oberflaeche, offen (ANN-366).
--
-- Was nicht entsteht (ADR-006 Punkte 10, 11, 13; uebungsanalyse in
-- src/app/mdr.ts): keine Ursache, kein Austauschvorschlag, keine Quote als
-- Urteil - die ableitende Haelfte. Keine neue Tabelle, kein neues Recht: Wer
-- den Plan liest, liest seine Einheiten (ANN-298). Die Auskunft (Art. 15)
-- liest dieselbe Funktion und bekommt die Zahl je Position mit.
--
-- Aus 20261107100000_trk_007_offline_transfer.sql; neu ist nur sets_by_item.
-- =============================================================================
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
    -- OUT-003 (ANN-366): abgehakte Saetze je Position; eine Position ohne
    -- Haken fehlt.
    'sets_by_item', (select coalesce(jsonb_object_agg(x.item_id, x.n), '{}'::jsonb)
                     from (select y.item_id, count(*) as n
                           from public.exercise_plan_session_sets y
                           where y.session_id = s.id
                           group by y.item_id) x),
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

comment on function app.exercise_plan_sessions_json(uuid) is
  'UEB-010, TRK-001, TRK-007, OUT-003: die Einheiten eines Plans - Tag, Zeiten (auch nach der Uhr des Geraets), abgehakte Saetze gesamt und je Position, "schwierig, weil ..." und die Angaben der Person, unveraendert. Ohne Rechtepruefung: nur aus get_exercise_plan und der Auskunft.';
