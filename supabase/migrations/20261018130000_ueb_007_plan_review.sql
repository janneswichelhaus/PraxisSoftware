-- =============================================================================
-- UEB-007 (UEB-EPIC-002): Planlaufzeit und Wiedervorlage
--
-- Jeder zugewiesene Plan hat ein Ende (IDEA-ORG-006, UEB-005). Vor dem Ende
-- steht eine Wiedervorlage an: verlaengern, aendern (neue Fassung, UEB-006)
-- oder beenden. Sie bleibt stehen, auch ueber das Ende hinaus, bis eines davon
-- geschehen ist - nach vier Monaten trainiert sonst jemand ein Programm, das
-- fuer die zweite Woche gedacht war, und niemand merkt es.
--
--   app.exercise_plan_review_days    wie lange vor dem Ende (ANN-302)
--   app.exercise_plan_review_due     steht die Wiedervorlage an?
--   public.extend_exercise_plan      verlaengern
--   public.end_exercise_plan         beenden
--   public.list_due_exercise_plans   die Wiedervorlage unter "Offene Punkte"
--   public.list_exercise_plans, public.get_exercise_plan
--                                    + review_due
--
-- NUR AM DATUM (ADR-006 Punkt 11): Die Wiedervorlage liest das Ende des Plans
-- und sonst nichts - keine Angabe der Person, keinen Verlauf, kein Protokoll.
-- Sie sagt "laeuft aus", nie "anpassen" oder "steigern".
--
-- WER (ANN-302): die Rollen, die den Plan schreiben (ANN-298) - nicht das
-- Buero. Die Liste zeigt je Bereich nur, was die Person schreibt.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): extended_at/by und ended_at/by
-- stehen an der Zeile, das erste Ende in original_runs_until.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Wiedervorlage (ANN-302)
-- -----------------------------------------------------------------------------
create function app.exercise_plan_review_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 7
$$;

revoke all on function app.exercise_plan_review_days() from public, anon, authenticated;

comment on function app.exercise_plan_review_days() is
  'UEB-007 (ANN-302): so viele Tage vor dem Ende steht die Wiedervorlage an. Die eine Stelle fuer die Zahl.';

-- Zugewiesen, das Ende in hoechstens sieben Tagen oder vorbei, und noch nicht
-- durch eine zugewiesene Fassung abgeloest (die setzt den Plan auf
-- superseded). Ein Entwurf der neuen Fassung beantwortet die Frage noch nicht.
create function app.exercise_plan_review_due(p_plan public.exercise_plans)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_plan.status = 'assigned'
     and p_plan.runs_until <= app.training_today(p_plan.organization_id) + app.exercise_plan_review_days()
$$;

revoke all on function app.exercise_plan_review_due(public.exercise_plans) from public, anon, authenticated;

comment on function app.exercise_plan_review_due(public.exercise_plans) is
  'UEB-007 (ANN-302): Die Wiedervorlage steht an, wenn ein zugewiesener Plan in hoechstens app.exercise_plan_review_days() Tagen endet oder schon geendet hat - bis er verlaengert, abgeloest oder beendet ist. Liest nur das Datum (ADR-006 Punkt 11).';

-- -----------------------------------------------------------------------------
-- 2. Verlaengern
--
-- Spaeter als bisher, hoechstens 26 Wochen ab heute (ANN-302). Der Inhalt
-- bleibt; das erste Ende steht weiter in original_runs_until.
-- -----------------------------------------------------------------------------
create function public.extend_exercise_plan(p_plan_id uuid, p_runs_until date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.exercise_plans%rowtype;
  v_heute date;
begin
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'assigned' then
    raise exception 'only an assigned exercise plan can be extended' using errcode = '22023';
  end if;
  perform app.exercise_plan_relationship_open(v_plan);

  v_heute := app.training_today(v_plan.organization_id);
  if p_runs_until is null or p_runs_until <= v_plan.runs_until or p_runs_until < v_heute
     or p_runs_until > v_heute + app.exercise_plan_max_days() then
    raise exception 'runs until is invalid' using errcode = '22023';
  end if;

  update public.exercise_plans
     set runs_until = p_runs_until,
         extended_at = now(),
         extended_by = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_plan.id;
end;
$$;

revoke all on function public.extend_exercise_plan(uuid, date) from public, anon;
grant execute on function public.extend_exercise_plan(uuid, date) to authenticated;

comment on function public.extend_exercise_plan(uuid, date) is
  'UEB-007: verlaengert einen zugewiesenen Plan bis p_runs_until - spaeter als bisher, hoechstens 26 Wochen ab heute (ANN-302). Der Inhalt bleibt (ANN-300). Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 3. Beenden
--
-- Ein zugewiesener Plan wird nie geloescht, nur beendet (ANN-300). Beenden
-- geht auch nach dem Ende eines Trainingsvertrags. Ein Entwurf einer neuen
-- Fassung bleibt stehen und kann spaeter zugewiesen werden.
-- -----------------------------------------------------------------------------
create function public.end_exercise_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.exercise_plans%rowtype;
begin
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'assigned' then
    raise exception 'only an assigned exercise plan can be ended' using errcode = '22023';
  end if;

  update public.exercise_plans
     set status = 'ended',
         ended_at = now(),
         ended_by = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_plan.id;
end;
$$;

revoke all on function public.end_exercise_plan(uuid) from public, anon;
grant execute on function public.end_exercise_plan(uuid) to authenticated;

comment on function public.end_exercise_plan(uuid) is
  'UEB-007: beendet einen zugewiesenen Plan. Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 4. Die Wiedervorlage unter "Offene Punkte"
--
-- Je Bereich nur, was die Person schreibt; nach dem Ende sortiert. Name und
-- Titel, damit die Zeile ohne Klick verstaendlich ist - kein Inhalt des Plans.
-- Die Liste ist eine Trefferliste und kein Oeffnen der Akte (ADR-010 Punkt 16).
-- -----------------------------------------------------------------------------
create function public.list_due_exercise_plans()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (app.can_write_exercise_plans('therapy') or app.can_write_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plans' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', app.training_today(v_org),
    'plans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'service_area', p.service_area,
          'relationship_id', coalesce(p.patient_id, p.training_relationship_id),
          'given_name', pe.given_name,
          'family_name', pe.family_name,
          'title', p.title,
          'runs_until', p.runs_until,
          'follow_up_draft', exists (
            select 1 from public.exercise_plans f
            where f.previous_plan_id = p.id and f.status = 'draft'
          )
        )
        order by p.runs_until, pe.family_name, pe.given_name, p.id
      )
      from public.exercise_plans p
      left join public.patients pa on pa.id = p.patient_id
      left join public.training_relationships t on t.id = p.training_relationship_id
      join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
      where p.organization_id = v_org
        and app.can_write_exercise_plans(p.service_area)
        and app.exercise_plan_review_due(p)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_due_exercise_plans() from public, anon;
grant execute on function public.list_due_exercise_plans() to authenticated;

comment on function public.list_due_exercise_plans() is
  'UEB-007: die Plaene, deren Wiedervorlage ansteht (ANN-302) - je Bereich nur fuer die Rollen, die ihn schreiben (ANN-298), nach dem Ende sortiert. Andere Rollen: null und access.denied.';

-- -----------------------------------------------------------------------------
-- 5. Lesen mit Wiedervorlage
--
-- Aus 20261018100000_ueb_004_exercise_plans.sql uebernommen; neu ist allein
-- review_due je Plan.
-- -----------------------------------------------------------------------------
create or replace function public.list_exercise_plans(p_area text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_area is null or p_area not in ('therapy', 'training') then
    raise exception 'service area is invalid' using errcode = '22023';
  end if;
  if not app.can_read_exercise_plans(p_area) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plans' using errcode = '42501';
  end if;

  if p_area = 'therapy' then
    if not exists (select 1 from public.patients p where p.id = p_relationship_id and p.organization_id = v_org) then
      return null;
    end if;
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'exercise_plans'));
  else
    if not exists (
      select 1 from public.training_relationships t
      where t.id = p_relationship_id and t.organization_id = v_org
    ) then
      return null;
    end if;
    perform app.log_record_access(v_org, v_actor, 'training_relationship.viewed', 'training_relationship',
      p_relationship_id, 'user', jsonb_build_object('surface', 'web', 'view', 'exercise_plans'));
  end if;

  return jsonb_build_object(
    'can_write', app.can_write_exercise_plans(p_area),
    'today', app.training_today(v_org),
    'plans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'status', p.status,
          'sessions_per_week', p.sessions_per_week,
          'previous_plan_id', p.previous_plan_id,
          'assigned_at', p.assigned_at,
          'runs_from', p.runs_from,
          'runs_until', p.runs_until,
          'ended_at', p.ended_at,
          'created_at', p.created_at,
          'item_count', (select count(*) from public.exercise_plan_items i where i.plan_id = p.id),
          'review_due', app.exercise_plan_review_due(p)
        )
        order by case p.status when 'draft' then 0 when 'assigned' then 1 else 2 end,
                 coalesce(p.assigned_at, p.created_at) desc, p.id
      )
      from public.exercise_plans p
      where p.organization_id = v_org
        and p.service_area = p_area
        and (p.patient_id = p_relationship_id or p.training_relationship_id = p_relationship_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_exercise_plan(p_plan_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_plan  public.exercise_plans%rowtype;
  v_person record;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (app.can_read_exercise_plans('therapy') or app.can_read_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plans' using errcode = '42501';
  end if;

  select * into v_plan
  from public.exercise_plans p
  where p.id = p_plan_id and p.organization_id = v_org;
  if not found or not app.can_read_exercise_plans(v_plan.service_area) then
    return null;
  end if;

  perform app.exercise_plan_log_read(v_plan);

  if v_plan.service_area = 'therapy' then
    select pe.given_name, pe.family_name into v_person
    from public.patients pa join public.persons pe on pe.id = pa.person_id
    where pa.id = v_plan.patient_id;
  else
    select pe.given_name, pe.family_name into v_person
    from public.training_relationships t join public.persons pe on pe.id = t.person_id
    where t.id = v_plan.training_relationship_id;
  end if;

  return jsonb_build_object(
    'id', v_plan.id,
    'service_area', v_plan.service_area,
    'relationship_id', coalesce(v_plan.patient_id, v_plan.training_relationship_id),
    'given_name', v_person.given_name,
    'family_name', v_person.family_name,
    'title', v_plan.title,
    'sessions_per_week', v_plan.sessions_per_week,
    'status', v_plan.status,
    'previous_plan_id', v_plan.previous_plan_id,
    'follow_up', (
      select jsonb_build_object('id', f.id, 'status', f.status)
      from public.exercise_plans f where f.previous_plan_id = v_plan.id
    ),
    'assigned_at', v_plan.assigned_at,
    'assigned_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.assigned_by),
    'runs_from', v_plan.runs_from,
    'runs_until', v_plan.runs_until,
    'original_runs_until', v_plan.original_runs_until,
    'extended_at', v_plan.extended_at,
    'ended_at', v_plan.ended_at,
    'ended_on', (select (v_plan.ended_at at time zone o.time_zone)::date
                 from public.organizations o where o.id = v_org),
    'ended_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.ended_by),
    'created_at', v_plan.created_at,
    'created_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.created_by),
    'today', app.training_today(v_org),
    'can_write', app.can_write_exercise_plans(v_plan.service_area),
    'review_due', app.exercise_plan_review_due(v_plan),
    'relationship_open', not exists (
      select 1 from public.training_relationships t
      where t.id = v_plan.training_relationship_id and t.contract_ended_on is not null
    ),
    'previous', (
      select jsonb_build_object(
        'id', q.id, 'title', q.title, 'sessions_per_week', q.sessions_per_week,
        'runs_from', q.runs_from, 'runs_until', q.runs_until,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(qi) order by qi.position)
          from public.exercise_plan_items qi where qi.plan_id = q.id
        ), '[]'::jsonb)
      )
      from public.exercise_plans q where q.id = v_plan.previous_plan_id
    ),
    'items', coalesce((
      select jsonb_agg(app.exercise_plan_item_json(i) order by i.position)
      from public.exercise_plan_items i where i.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$;
