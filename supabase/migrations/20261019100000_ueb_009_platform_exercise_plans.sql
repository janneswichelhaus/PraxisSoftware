-- =============================================================================
-- UEB-009 (UEB-EPIC-003): Der Plan im Portal
--
-- PROJECT_PRINCIPLES.md 4.6: Waehrend der Behandlung gehoert der
-- Heimuebungsplan zur Plattform, ohne Entgelt und ohne Abo. 4.10: Im Training
-- gehoeren die Plaene ebenso dazu. DSN-001 4.1 und 5: Reiter "Uebungen" bzw.
-- "Training". ADR-023 Punkt 22: Ein Plan ist sichtbar, weil er der Person
-- zugewiesen ist - nicht, weil die Oberflaeche ihn zeigt.
--
--   public.platform_exercise_plans   die laufenden Plaene des Verhaeltnisses
--                                    hinter einem lesbaren Zugang (ANN-304)
--
-- Feste Schluesselliste (Punkt 22): nur der Schnappschuss der Zuweisung in
-- Alltagssprache (ANN-300), keine fachlichen Namen, keine Kennung der
-- Bibliothek, kein Name der Fachperson, kein Entwurf. Ueber eine Vertretung
-- protokolliert wie die uebrigen Projektionen (Punkt 24); das Lesen der
-- eigenen Daten nicht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Welche Plaene die Plattform zeigt (ANN-304) - die eine Stelle
--
-- Die zugewiesenen Plaene des Verhaeltnisses. Laeuft keiner, der zuletzt
-- beendete: lesend und als Blatt, damit die Person nach dem Ende der
-- Behandlung ihren Plan mitnehmen kann (DSN-001 D2). Abgeloeste Fassungen nie -
-- es gibt eine Folgefassung, und die gilt. Entwuerfe nie.
-- -----------------------------------------------------------------------------
create function app.platform_visible_exercise_plans(p_kind text, p_relationship_id uuid)
returns setof public.exercise_plans
language sql
stable
security definer
set search_path = ''
as $$
  with eigene as (
    select p.*
    from public.exercise_plans p
    where (p_kind = 'treatment' and p.service_area = 'therapy' and p.patient_id = p_relationship_id)
       or (p_kind = 'training' and p.service_area = 'training'
           and p.training_relationship_id = p_relationship_id)
  )
  select e.* from eigene e where e.status = 'assigned'
  union all
  (
    select e.* from eigene e
    where e.status = 'ended'
      and not exists (select 1 from eigene a where a.status = 'assigned')
    order by e.ended_at desc
    limit 1
  )
$$;

revoke all on function app.platform_visible_exercise_plans(text, uuid) from public, anon, authenticated;

comment on function app.platform_visible_exercise_plans(text, uuid) is
  'UEB-009 (ANN-304): Plaene, die die Plattform einem Verhaeltnis zeigt - alle zugewiesenen, sonst der zuletzt beendete. Nie Entwurf, nie abgeloeste Fassung. Ohne Rechtepruefung: nur aus Plattformprojektionen nach app.platform_access_allows aufrufen.';

-- -----------------------------------------------------------------------------
-- 2. Eine Position in Alltagssprache - feste Schluesselliste (Punkt 22)
-- -----------------------------------------------------------------------------
create function app.platform_exercise_plan_item_json(p_item public.exercise_plan_items)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_item.id,
    'position', p_item.position,
    'variant_lay_name', p_item.variant_lay_name,
    'instruction', p_item.instruction,
    'equipment', to_jsonb(coalesce(p_item.equipment, '{}'::text[])),
    'sets', p_item.sets,
    'reps_min', p_item.reps_min,
    'reps_max', p_item.reps_max,
    'duration_seconds', p_item.duration_seconds,
    'load', p_item.load,
    'tempo', p_item.tempo,
    'rest_seconds', p_item.rest_seconds,
    'double_progression', p_item.double_progression,
    'note', p_item.note
  )
$$;

revoke all on function app.platform_exercise_plan_item_json(public.exercise_plan_items)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Projektion
-- -----------------------------------------------------------------------------
create function public.platform_exercise_plans(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'exercise_plans')
  );

  return jsonb_build_object(
    'today', app.training_today(v_zugang.organization_id),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'service_area', p.service_area,
        'title', p.title,
        'status', p.status,
        'sessions_per_week', p.sessions_per_week,
        'assigned_on', (p.assigned_at at time zone v_zone)::date,
        'runs_from', p.runs_from,
        'runs_until', p.runs_until,
        'ended_on', (p.ended_at at time zone v_zone)::date,
        'items', coalesce((
          select jsonb_agg(app.platform_exercise_plan_item_json(i) order by i.position)
          from public.exercise_plan_items i where i.plan_id = p.id
        ), '[]'::jsonb)
      ) order by p.status, p.runs_from, p.id)
      from app.platform_visible_exercise_plans(v_zugang.relationship_kind, v_zugang.relationship_id) p
      where p.organization_id = v_zugang.organization_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_exercise_plans(uuid) from public, anon;
grant execute on function public.platform_exercise_plans(uuid) to authenticated;

comment on function public.platform_exercise_plans(uuid) is
  'UEB-009: Plattformprojektion "Uebungen" bzw. "Training" (DSN-001 4.1, 5): die laufenden Plaene des Verhaeltnisses hinter einem lesbaren Zugang, sonst der zuletzt beendete (ANN-304), als Schnappschuss in Alltagssprache mit fester Schluesselliste (ADR-023 Punkt 22). Ueber eine Vertretung protokolliert (Punkt 24). Ohne Recht null.';
