-- =============================================================================
-- UEB-006 (UEB-EPIC-002): Progression von Hand - die neue Fassung
--
-- Ein zugewiesener Plan aendert sich nicht (ANN-300). Gesteigert oder
-- zurueckgenommen wird in einer NEUEN FASSUNG: Sie uebernimmt die Positionen
-- der vorigen als Entwurf, die Fachperson setzt je Position hoechstens EINEN
-- Schritt entlang GENAU EINER Achse aus IDEA-TRN-004, und mit der Zuweisung
-- loest die neue Fassung die vorige ab (UEB-005). Die vorige bleibt lesbar.
--
--   public.create_exercise_plan_version   neue Fassung als Entwurf
--   public.save_exercise_plan_item        + Pruefung des Schritts (ANN-301)
--
-- EINE ACHSE JE SCHRITT (ANN-301): Gegenueber ihrer Position der vorigen
-- Fassung aendert sich an einer Position hoechstens eines von: Variante,
-- Wiederholungen bzw. Dauer, Saetze, Last, Tempo, Pause. Aendert sich etwas,
-- nennt die Fachperson Achse und Richtung, und die Datenbank prueft, dass sie
-- zur Aenderung passen:
--   * Variante   - nur ueber eine Verbindung der Bibliothek (UEB-002) entlang
--                  dieser Achse in dieser Richtung;
--   * Wiederholungen bzw. Dauer -> wiederholungen, Saetze -> saetze,
--     Pause -> dichte: die Richtung muss zur Zahl passen (mehr Saetze ist
--     schwerer, eine kuerzere Pause ist schwerer);
--   * Last -> last, Tempo -> tempo: freier Text, die Richtung sagt die
--     Fachperson.
-- Hinweis und das Kennzeichen der doppelten Progression aendern sich frei;
-- sie sind keine Achse. Die Frequenz liegt am Plan. Doppelte Progression
-- (IDEA-TRN-007) heisst: Der Bereich bleibt, ein Schritt auf der Achse Last.
--
-- VON HAND, NIE VORGESCHLAGEN (ADR-006 Punkt 10, §17 Verbot 1): Keine Funktion
-- waehlt den Schritt, die Achse oder die Variante aus. Die Verbindungen der
-- Bibliothek sind die Liste dessen, was die Praxis als Nachbarn hinterlegt hat;
-- angezeigt werden sie erst, wenn die Fachperson einen Schritt oeffnet.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Neue Fassung
-- -----------------------------------------------------------------------------
create function public.create_exercise_plan_version(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_plan  public.exercise_plans%rowtype;
  v_id    uuid;
begin
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'assigned' then
    raise exception 'only an assigned exercise plan gets a new version' using errcode = '22023';
  end if;
  perform app.exercise_plan_relationship_open(v_plan);
  if exists (select 1 from public.exercise_plans f where f.previous_plan_id = v_plan.id) then
    raise exception 'exercise plan already has a new version' using errcode = '23505';
  end if;

  begin
    insert into public.exercise_plans (
      organization_id, service_area, patient_id, training_relationship_id, title,
      sessions_per_week, previous_plan_id, created_by, updated_by
    )
    values (
      v_plan.organization_id, v_plan.service_area, v_plan.patient_id,
      v_plan.training_relationship_id, v_plan.title, v_plan.sessions_per_week, v_plan.id,
      v_actor, v_actor
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'exercise plan already has a new version' using errcode = '23505';
  end;

  insert into public.exercise_plan_items (
    organization_id, plan_id, position, variant_id, sets, reps_min, reps_max,
    duration_seconds, load, tempo, rest_seconds, double_progression, note,
    previous_item_id, created_by, updated_by
  )
  select i.organization_id, v_id, i.position, i.variant_id, i.sets, i.reps_min, i.reps_max,
         i.duration_seconds, i.load, i.tempo, i.rest_seconds, i.double_progression, i.note,
         i.id, v_actor, v_actor
  from public.exercise_plan_items i
  where i.plan_id = v_plan.id;

  return v_id;
end;
$$;

revoke all on function public.create_exercise_plan_version(uuid) from public, anon;
grant execute on function public.create_exercise_plan_version(uuid) to authenticated;

comment on function public.create_exercise_plan_version(uuid) is
  'UEB-006: legt zu einem zugewiesenen Plan die neue Fassung als Entwurf an - Titel, Einheiten je Woche und alle Positionen mit Verweis auf ihre vorige (ANN-301). Hoechstens eine Folgefassung je Plan. Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 2. Der Schritt (ANN-301)
--
-- Prueft eine Position gegen ihre Position der vorigen Fassung. Wirft, wenn
-- sich mehr als eine Achse aendert oder Achse und Richtung nicht zur Aenderung
-- passen. Ohne Aenderung gibt es keinen Schritt.
-- -----------------------------------------------------------------------------
create function app.exercise_plan_step_check(
  p_previous_item_id   uuid,
  p_variant_id         uuid,
  p_sets               integer,
  p_reps_min           integer,
  p_reps_max           integer,
  p_duration_seconds   integer,
  p_load               text,
  p_tempo              text,
  p_rest_seconds       integer,
  p_step_axis          text,
  p_step_direction     text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vorher   public.exercise_plan_items%rowtype;
  v_achsen   text[] := '{}'::text[];
  v_achse    text;
  v_schwerer boolean;
begin
  select * into v_vorher from public.exercise_plan_items i where i.id = p_previous_item_id;
  if not found then
    raise exception 'previous item belongs to the previous version' using errcode = '23514';
  end if;

  if (p_step_axis is null) <> (p_step_direction is null)
     or (p_step_direction is not null and p_step_direction not in ('harder', 'easier'))
     or (p_step_axis is not null
         and (p_step_axis = 'frequenz' or not (p_step_axis = any (app.exercise_axes())))) then
    raise exception 'step is invalid' using errcode = '22023';
  end if;

  -- Wiederholungen und Dauer sind zwei Formen derselben Angabe; ein Wechsel
  -- zwischen ihnen ist kein Schritt auf einer Achse.
  if (p_reps_min is null) <> (v_vorher.reps_min is null) then
    raise exception 'change is not a single step' using errcode = '22023';
  end if;

  if p_variant_id is distinct from v_vorher.variant_id then
    v_achsen := v_achsen || 'variante'::text;
  end if;
  if p_reps_min is distinct from v_vorher.reps_min or p_reps_max is distinct from v_vorher.reps_max
     or p_duration_seconds is distinct from v_vorher.duration_seconds then
    v_achsen := v_achsen || 'wiederholungen'::text;
  end if;
  if p_sets is distinct from v_vorher.sets then
    v_achsen := v_achsen || 'saetze'::text;
  end if;
  if p_load is distinct from v_vorher.load then
    v_achsen := v_achsen || 'last'::text;
  end if;
  if p_tempo is distinct from v_vorher.tempo then
    v_achsen := v_achsen || 'tempo'::text;
  end if;
  if p_rest_seconds is distinct from v_vorher.rest_seconds then
    v_achsen := v_achsen || 'dichte'::text;
  end if;

  if cardinality(v_achsen) = 0 then
    if p_step_axis is not null then
      raise exception 'step does not match the change' using errcode = '22023';
    end if;
    return;
  end if;
  if cardinality(v_achsen) > 1 then
    raise exception 'only one axis per step' using errcode = '22023';
  end if;
  if p_step_axis is null then
    raise exception 'step axis is required' using errcode = '22023';
  end if;

  v_achse := v_achsen[1];
  v_schwerer := p_step_direction = 'harder';

  if v_achse = 'variante' then
    -- Nur ueber eine Verbindung der Bibliothek, entlang dieser Achse, in
    -- dieser Richtung (UEB-002, ANN-294).
    if not exists (
      select 1 from public.exercise_variant_links l
      where l.axis = p_step_axis
        and ((v_schwerer and l.easier_variant_id = v_vorher.variant_id and l.harder_variant_id = p_variant_id)
          or (not v_schwerer and l.harder_variant_id = v_vorher.variant_id and l.easier_variant_id = p_variant_id))
    ) then
      raise exception 'step does not match the change' using errcode = '22023';
    end if;
    return;
  end if;

  if p_step_axis <> v_achse then
    raise exception 'step does not match the change' using errcode = '22023';
  end if;

  if (v_achse = 'saetze' and (p_sets > v_vorher.sets) <> v_schwerer)
     or (v_achse = 'dichte' and p_rest_seconds is not null and v_vorher.rest_seconds is not null
         and (p_rest_seconds < v_vorher.rest_seconds) <> v_schwerer)
     or (v_achse = 'wiederholungen' and p_reps_max is not null
         and ((p_reps_max, p_reps_min) > (v_vorher.reps_max, v_vorher.reps_min)) <> v_schwerer)
     or (v_achse = 'wiederholungen' and p_duration_seconds is not null
         and (p_duration_seconds > v_vorher.duration_seconds) <> v_schwerer) then
    raise exception 'step direction does not match the change' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.exercise_plan_step_check(uuid, uuid, integer, integer, integer, integer, text, text, integer, text, text)
  from public, anon, authenticated;

comment on function app.exercise_plan_step_check(uuid, uuid, integer, integer, integer, integer, text, text, integer, text, text) is
  'UEB-006 (ANN-301): Eine Position der neuen Fassung aendert gegenueber ihrer vorigen hoechstens eine Achse; Achse und Richtung passen zur Aenderung, eine andere Variante nur ueber eine Verbindung der Bibliothek.';

-- -----------------------------------------------------------------------------
-- 3. Position anlegen oder aendern - mit Schritt
--
-- Aus 20261018100000_ueb_004_exercise_plans.sql uebernommen; neu ist allein
-- der Schritt: An einer Position aus der vorigen Fassung prueft
-- app.exercise_plan_step_check ihn, an einer neuen Position gibt es keinen.
-- -----------------------------------------------------------------------------
create or replace function public.save_exercise_plan_item(
  p_item_id            uuid,
  p_plan_id            uuid,
  p_variant_id         uuid,
  p_sets               integer,
  p_reps_min           integer,
  p_reps_max           integer,
  p_duration_seconds   integer,
  p_load               text,
  p_tempo              text,
  p_rest_seconds       integer,
  p_double_progression boolean,
  p_note               text,
  p_step_axis          text,
  p_step_direction     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_plan   public.exercise_plans%rowtype;
  v_item   public.exercise_plan_items%rowtype;
  v_load   text;
  v_tempo  text;
  v_note   text;
  v_id     uuid;
  v_anzahl integer;
begin
  if p_item_id is not null then
    select i.* into v_item
    from public.exercise_plan_items i
    where i.id = p_item_id;
    -- Fremde Kennung: dieselbe Antwort wie ein fremder Plan.
    v_plan := app.exercise_plan_for_write(coalesce(v_item.plan_id, extensions.gen_random_uuid()));
  else
    v_plan := app.exercise_plan_for_write(p_plan_id);
  end if;
  if v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;
  perform app.exercise_plan_relationship_open(v_plan);

  -- Dosierung (ANN-299)
  if p_sets is null or p_sets not between 1 and 20 then
    raise exception 'sets is invalid' using errcode = '22023';
  end if;
  if (p_reps_min is null) <> (p_reps_max is null)
     or (p_reps_min is not null and (p_reps_min not between 1 and 100
         or p_reps_max not between 1 and 100 or p_reps_max < p_reps_min)) then
    raise exception 'repetitions are invalid' using errcode = '22023';
  end if;
  if p_duration_seconds is not null and p_duration_seconds not between 1 and 3600 then
    raise exception 'duration is invalid' using errcode = '22023';
  end if;
  if (p_reps_min is null) = (p_duration_seconds is null) then
    raise exception 'repetitions or duration is required' using errcode = '22023';
  end if;
  if p_rest_seconds is not null and p_rest_seconds not between 0 and 600 then
    raise exception 'rest is invalid' using errcode = '22023';
  end if;
  v_load := app.exercise_plan_text(p_load, 40, 'load');
  v_tempo := app.exercise_plan_text(p_tempo, 40, 'tempo');
  v_note := app.exercise_plan_text(p_note, 500, 'note');
  if coalesce(p_double_progression, false)
     and not (p_reps_min is not null and p_reps_max > p_reps_min and v_load is not null) then
    raise exception 'double progression needs a repetition range and a load' using errcode = '22023';
  end if;

  -- Die Variante: aus der Bibliothek dieser Praxis, nicht archiviert - ausser
  -- die Position behaelt sie.
  if p_variant_id is distinct from v_item.variant_id then
    if not exists (
      select 1
      from public.exercise_variants v
      join public.exercises e on e.id = v.exercise_id
      where v.id = p_variant_id
        and v.organization_id = v_plan.organization_id
        and v.archived_at is null
        and e.archived_at is null
    ) then
      raise exception 'exercise variant not found' using errcode = 'P0002';
    end if;
  end if;

  -- Der Schritt (ANN-301): nur an einer Position aus der vorigen Fassung.
  if v_item.previous_item_id is null then
    if p_step_axis is not null or p_step_direction is not null then
      raise exception 'step needs a previous version' using errcode = '22023';
    end if;
  else
    perform app.exercise_plan_step_check(
      v_item.previous_item_id, p_variant_id, p_sets, p_reps_min, p_reps_max,
      p_duration_seconds, v_load, v_tempo, p_rest_seconds, p_step_axis, p_step_direction);
  end if;

  if p_item_id is null then
    select count(*) into v_anzahl from public.exercise_plan_items i where i.plan_id = v_plan.id;
    if v_anzahl >= 30 then
      raise exception 'too many exercises in plan' using errcode = '22023';
    end if;
    insert into public.exercise_plan_items (
      organization_id, plan_id, position, variant_id, sets, reps_min, reps_max,
      duration_seconds, load, tempo, rest_seconds, double_progression, note,
      created_by, updated_by
    )
    values (
      v_plan.organization_id, v_plan.id, v_anzahl + 1, p_variant_id, p_sets, p_reps_min,
      p_reps_max, p_duration_seconds, v_load, v_tempo, p_rest_seconds,
      coalesce(p_double_progression, false), v_note, v_actor, v_actor
    )
    returning id into v_id;
  else
    update public.exercise_plan_items
       set variant_id = p_variant_id,
           sets = p_sets,
           reps_min = p_reps_min,
           reps_max = p_reps_max,
           duration_seconds = p_duration_seconds,
           load = v_load,
           tempo = v_tempo,
           rest_seconds = p_rest_seconds,
           double_progression = coalesce(p_double_progression, false),
           note = v_note,
           step_axis = p_step_axis,
           step_direction = p_step_direction,
           updated_at = now(),
           updated_by = v_actor
     where id = v_item.id
    returning id into v_id;
  end if;

  update public.exercise_plans
     set updated_at = now(), updated_by = v_actor
   where id = v_plan.id;

  return v_id;
end;
$$;

comment on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text) is
  'UEB-004/UEB-006: legt eine Position im Entwurf an (ohne Kennung, ans Ende) oder aendert sie - Variante und Dosierung (ANN-299); an einer Position aus der vorigen Fassung hoechstens ein Schritt entlang genau einer Achse (ANN-301). Nur nach app.can_write_exercise_plans(Bereich).';
