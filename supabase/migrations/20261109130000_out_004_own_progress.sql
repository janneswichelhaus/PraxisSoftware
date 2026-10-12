-- =============================================================================
-- OUT-004 (OUT-EPIC-001): Fortschritt in zwei Sprachen - die Sicht der Person
--
-- IDEA-OUT-008: dieselben Daten, zwei Darstellungen. "Meine Angaben" zeigt
-- die eigenen Angaben je Frage als Punktbild in Alltagssprache, darunter
-- vollstaendig als Tabelle - reduzieren, nicht beschoenigen (ANN-367).
-- Dafuer liefert platform_checkins neben den Check-ins die eigenen Angaben
-- nach den Einheiten (Anstrengung, Schmerz, Bewegungssicherheit).
--
-- Keine neue Tabelle, kein neues Recht: Wer "Meine Angaben" liest, liest
-- auch, was er nach den Einheiten angegeben hat - dieselbe Projektion,
-- dieselbe Pruefung (platform_access_allows read), dasselbe Protokoll ueber
-- eine Vertretung (ADR-023 Punkt 24). Ereignisse und Planwechsel der Praxis
-- stehen hier nicht (ANN-367).
--
-- Aus 20261105120000_trk_003_platform_checkins.sql; neu ist nur
-- session_history.
-- =============================================================================

create or replace function public.platform_checkins(p_access_id uuid)
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
    ),
    -- OUT-004 (ANN-367): die eigenen Angaben nach den Einheiten, mit fester
    -- Schluesselliste - Tag, Plan, wer erfasst hat, Werte.
    'session_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'performed_on', z -> 'performed_on',
               'plan_title', z -> 'plan_title',
               'recorded_by_kind', z -> 'recorded_by_kind',
               'values', z -> 'values')), '[]'::jsonb)
      from jsonb_array_elements(
        app.checkin_sessions_json(v_zugang.relationship_kind, v_zugang.relationship_id)) z
    )
  );
end;
$$;

revoke all on function public.platform_checkins(uuid) from public, anon;
grant execute on function public.platform_checkins(uuid) to authenticated;

comment on function public.platform_checkins(uuid) is
  'TRK-003, OUT-004: Plattformprojektion Check-in (DSN-001 4.1, 5) - Takt und Fragen, ob heute faellig und ob dieser Zugang antworten darf, die letzte Angabe je Groesse als Hinweis, der eigene Verlauf ("Meine Angaben") und die eigenen Angaben nach den Einheiten, mit fester Schluesselliste (ADR-023 Punkt 22). Ueber eine Vertretung protokolliert (Punkt 24). Ohne Recht null.';
