-- =============================================================================
-- ABN-030 (ABN-EPIC-002, BEF-137): Das Buero liest im Training alles
--
-- PROJECT_PRINCIPLES.md 0.22 4.3 und 4.8; ADR-021 Fassung 3 Punkt 10;
-- Abnahme der Annahmen vom 2026-10-09 (ANN-287, ANN-293, ANN-298, ANN-311).
--
-- Das Buero liest Voraussetzungsprofil, Uebungsbibliothek, Trainingsplaene mit
-- ihren Einheiten und alle Rueckfragen aus dem Training. Es schreibt keine
-- Trainingsinhalte: Die Schreibfunktionen (app.can_access_training_protocols,
-- app.can_write_exercise_plans, app.can_manage_exercise_library) bleiben
-- unveraendert. Gelesen wird mit den Protokolleintraegen, die es schon gibt
-- ("Trainingsverhaeltnis geoeffnet", ADR-010 Fassung 3 Punkt 16) - keine neue
-- Aktion. Mit echten Daten erst nach der DSFA (B2).
--
--   app.can_read_training_content      die eine Leseregel des Trainings (ANN-315)
--   app.can_read_training_protocols    ruft sie auf
--   app.can_read_exercise_plans        Zweig training ruft sie auf
--   app.can_read_platform_message      Zweig training ruft sie auf
--   app.can_read_exercise_library      dazu office
--   public.get_training_profile        liest mit der Leseregel
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die eine Leseregel
-- -----------------------------------------------------------------------------
-- ANN-315: Inhalte eines Trainingsverhaeltnisses lesen owner, Trainingsbetreuung
-- und Buero. Therapeut:innen und Teamleitung nicht (ADR-021 Punkt 6).
create function app.can_read_training_content()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'trainer', 'office')
$$;
revoke all on function app.can_read_training_content() from public, anon;
grant execute on function app.can_read_training_content() to authenticated;

comment on function app.can_read_training_content() is
  'ABN-030 (BEF-137, ANN-315): wer Inhalte eines Trainingsverhaeltnisses liest - owner, Trainingsbetreuung, Buero. Die eine Stelle fuer die Regel; schreiben regeln die Schreibfunktionen.';

create or replace function app.can_read_training_protocols()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_read_training_content()
$$;

comment on function app.can_read_training_protocols() is
  'Wer Trainingsprotokolle lesen darf: app.can_read_training_content() (ABN-022, ABN-030). Schreiben regelt app.can_access_training_protocols() (owner, trainer).';

-- -----------------------------------------------------------------------------
-- 2. Plaene, Bibliothek, Rueckfragen
-- -----------------------------------------------------------------------------
create or replace function app.can_read_exercise_plans(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_area
    when 'therapy' then app.has_any_role('owner', 'therapist', 'team_lead', 'office')
    when 'training' then app.can_read_training_content()
    else false
  end
$$;

comment on function app.can_read_exercise_plans(text) is
  'UEB-004 (ANN-298), ABN-030 (BEF-137): wer Plaene eines Bereichs liest - therapy: owner, therapist, team_lead, office; training: app.can_read_training_content() (owner, trainer, office). Die eine Stelle fuer die Regel.';

create or replace function app.can_read_exercise_library()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'trainer', 'office')
$$;

comment on function app.can_read_exercise_library() is
  'UEB-001 (ANN-293), ABN-030 (BEF-137): wer die Uebungsbibliothek liest - owner, therapist, team_lead, trainer, office. Pflegen nur owner (app.can_manage_exercise_library). Die eine Stelle fuer die Regel.';

create or replace function app.can_read_platform_message(p_kind text, p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.has_any_role('owner', 'therapist', 'team_lead', 'office')
    when 'training' then app.can_read_training_content()
    else false
  end
$$;

comment on function app.can_read_platform_message(text, text) is
  'KOM-002 (ANN-310, ANN-311), ABN-030 (BEF-137): wer einen Vorgang der Plattform liest. Behandlung: owner, Therapeut:innen, Teamleitung, Buero. Training: app.can_read_training_content() (owner, Trainingsbetreuung, Buero) - jedes Thema.';

-- Antworten bleibt unveraendert (app.can_answer_platform_message, KOM-002):
-- Im Training antwortet das Buero nur auf "Termin oder Rechnung" - BEF-137
-- oeffnet das Lesen, nicht das Schreiben (ADR-021 Fassung 3 Punkt 10).

-- -----------------------------------------------------------------------------
-- 3. Das Voraussetzungsprofil
-- -----------------------------------------------------------------------------
create or replace function public.get_training_profile(p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_einwilligung text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ABN-030 (BEF-137, ANN-287): Lesen nach der einen Regel des Trainings,
  -- auch das Buero. Schreiben bleibt bei app.can_access_training_protocols().
  if not app.can_read_training_content() then
    perform app.record_denied_read(v_actor, 'training_relationship.viewed', 'not allowed to read training profiles');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null or not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    return null;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id,
    'success', jsonb_build_object('surface', 'web', 'view', 'profile')
  );

  select r.record_kind into v_einwilligung
  from public.training_consent_records r
  where r.training_relationship_id = p_relationship_id and r.purpose = 'training_health_data'
  order by r.recorded_at desc, r.id desc
  limit 1;

  return jsonb_build_object(
    'health_consent', v_einwilligung is not distinct from 'consent_granted',
    'profile', (
      select jsonb_build_object(
               'goals', p.goals,
               'equipment', p.equipment,
               'time_budget', p.time_budget,
               'places', p.places,
               'limits', p.limits,
               'history', p.history,
               'preferences', p.preferences,
               'updated_at', p.updated_at,
               'updated_by_name', up.display_name
             )
      from public.training_profiles p
      left join public.user_profiles up on up.id = p.updated_by
      where p.training_relationship_id = p_relationship_id
    ),
    'takeovers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', k.title,
               'body', k.body,
               'offered_on', k.offered_on,
               'released_at', k.released_at,
               -- Der Tag in der Zeitzone der Praxis, nicht in UTC (Zweitreview).
               'released_on', (k.released_at at time zone o.time_zone)::date
             ) order by k.position)
      from public.training_takeovers k
      join public.organizations o on o.id = k.organization_id
      where k.training_relationship_id = p_relationship_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_training_profile(uuid) is
  'KND-005, ABN-030: Voraussetzungsprofil und Uebernahmen aus der Behandlung eines Trainingsverhaeltnisses (app.can_read_training_content: owner, Trainingsbetreuung, Buero; ANN-287, BEF-137), dazu ob eine Einwilligung zu Gesundheitsangaben vermerkt ist. Jedes Lesen im Auditlog (training_relationship.viewed, view profile); andere Rollen: null und ein Eintrag der Abweisung.';
