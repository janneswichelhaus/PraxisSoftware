-- =============================================================================
-- TRK-006 (TRK-EPIC-002): Was erfasst wird, ist als Zeitreihe lesbar
--
-- Die Praxis liest in "Zwischen den Terminen" die Angaben je Groesse ueber
-- die Zeit: die Check-ins und daneben die Angaben nach den Einheiten
-- (Anstrengung, Schmerz, Bewegungssicherheit), mit Datum und Uhrzeit
-- (IDEA-TRK-006, ANN-356).
--
--   app.checkin_sessions_json   die beendeten Einheiten mit Angaben
--   public.get_checkins         + sessions, + time_zone
--
-- Keine neue Tabelle, kein neues Recht: Wer die Plaene liest, liest auch ihre
-- Einheiten (ANN-298, ANN-351); das Lesen steht wie bisher als Oeffnen von
-- Akte bzw. Trainingsverhaeltnis im Protokoll (view: checkins). Eine Tabelle
-- je Groesse, keine Kurve, keine Tendenz, keine Farbe (ADR-006 Punkt 11); die
-- Verlaufsgrafik bleibt bei OUT-EPIC-001.
-- =============================================================================

-- Die beendeten Einheiten eines Verhaeltnisses, die Angaben tragen, juengste
-- zuerst. Ohne Rechtepruefung: nur aus get_checkins.
create function app.checkin_sessions_json(p_kind text, p_relationship_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'performed_on', s.performed_on,
    'finished_at', s.finished_at,
    'plan_title', p.title,
    'recorded_by_kind', s.finished_access_kind,
    'values', (select jsonb_object_agg(v.parameter_key, v.value)
               from public.exercise_plan_session_values v where v.session_id = s.id)
  ) order by s.performed_on desc, s.finished_at desc), '[]'::jsonb)
  from public.exercise_plan_sessions s
  join public.exercise_plans p on p.id = s.plan_id
  where s.finished_at is not null
    and exists (select 1 from public.exercise_plan_session_values v where v.session_id = s.id)
    and (
      (p_kind = 'treatment' and p.service_area = 'therapy' and p.patient_id = p_relationship_id)
      or (p_kind = 'training' and p.service_area = 'training'
          and p.training_relationship_id = p_relationship_id)
    )
$$;

revoke all on function app.checkin_sessions_json(text, uuid) from public, anon, authenticated;

comment on function app.checkin_sessions_json(text, uuid) is
  'TRK-006: die beendeten Einheiten eines Verhaeltnisses mit ihren Angaben (Anstrengung, Schmerz, Bewegungssicherheit), Tag, Ende, Plan und wer beendet hat - unveraendert. Ohne Rechtepruefung: nur aus get_checkins.';

-- Aus 20261105110000_trk_002_checkins.sql; neu sind 'time_zone' und 'sessions'.
create or replace function public.get_checkins(p_kind text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_area  text;
  v_takt  public.checkin_schedules%rowtype;
  v_offen boolean;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not (app.can_read_exercise_plans('therapy') or app.can_read_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'checkins.read', 'not allowed to read checkins');
    return null;
  end if;
  v_org := app.current_organization_id();
  select r.area, r.is_open into v_area, v_offen
  from app.checkin_relationship(p_kind, p_relationship_id, v_org) r;
  if v_area is null then
    return null;
  end if;
  -- Kein Durchgriff zwischen den Bereichen (ADR-021 Punkt 6).
  if not app.can_read_exercise_plans(v_area) then
    perform app.record_denied_read(v_actor, 'checkins.read', 'not allowed to read checkins');
    return null;
  end if;

  if p_kind = 'treatment' then
    perform app.log_record_access(
      v_org, v_actor, 'patient_record.viewed', 'patient', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'checkins'));
  else
    perform app.log_record_access(
      v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'checkins'));
  end if;

  select * into v_takt
  from public.checkin_schedules s
  where s.relationship_kind = p_kind and s.relationship_id = p_relationship_id;

  return jsonb_build_object(
    'today', app.training_today(v_org),
    'can_write', app.can_write_exercise_plans(v_area),
    -- Nach Abschluss bzw. Vertragsende antwortet niemand mehr (Lesefrist);
    -- dann gibt es keinen faelligen Tag (Zweitreview S5, ANN-350).
    'relationship_open', v_offen,
    'schedule', case when v_takt.id is null then null else jsonb_build_object(
      'interval_days', v_takt.interval_days,
      'parameter_keys', to_jsonb(v_takt.parameter_keys),
      'starts_on', v_takt.starts_on,
      'due_on', case when v_offen then app.checkin_due_on(v_takt) end,
      'updated_at', v_takt.updated_at,
      'updated_by_name', (select up.display_name from public.user_profiles up
                          where up.id = v_takt.updated_by)
    ) end,
    'checkins', app.checkins_json(p_kind, p_relationship_id),
    -- TRK-006: Uhrzeiten in der Zeitzone der Praxis (IDEA-TRK-006).
    'time_zone', (select o.time_zone from public.organizations o where o.id = v_org),
    -- TRK-006: die Angaben nach den Einheiten aller Plaene des Verhaeltnisses,
    -- dieselben Rollen wie die Plaene (ANN-351, ANN-356).
    'sessions', app.checkin_sessions_json(p_kind, p_relationship_id)
  );
end;
$$;

revoke all on function public.get_checkins(text, uuid) from public, anon;
grant execute on function public.get_checkins(text, uuid) to authenticated;

comment on function public.get_checkins(text, uuid) is
  'TRK-002, TRK-006: Abschnitt "Zwischen den Terminen" (DSN-001 Abschnitt 6) - Takt, naechster Tag, die Check-ins mit ihren Angaben und die Angaben nach den Einheiten, unveraendert und ohne Bewertung (ADR-006 Punkt 11), mit der Zeitzone der Praxis fuer die Uhrzeit. Lesen wie die Uebungsplaene (ANN-351), protokolliert wie das Oeffnen von Akte bzw. Trainingsverhaeltnis. Ohne Recht null und eine Abweisung im Protokoll.';
