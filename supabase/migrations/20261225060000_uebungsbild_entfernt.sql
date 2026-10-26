-- Ein Übungsbild gibt es nicht mehr (ANN-539): Katalog, Bibliothek und Pläne führen das Feld nicht
-- weiter; die Spalten an Variante und Planposition und ihre Prüfung entfallen (Jannes, 2026-10-26).

create or replace function app.exercise_catalog_entry(p jsonb)
returns jsonb
language plpgsql immutable
set search_path to ''
as $_$
declare
  v_labels      jsonb := app.exercise_equipment_labels();
  v_schluessel  text;
  v_version     text;
  v_name        text;
  v_laie        text;
  v_region      text;
  v_ziel        text;
  v_stellung    text;
  v_niveau      integer;
  v_hilfsmittel text[] := '{}';
  v_ausruestung text[] := '{}';
  v_eintrag     jsonb;
  v_liste       text;
  v_d           jsonb;
  v_reps        jsonb;
  v_min         integer;
  v_max         integer;
  v_dosis       jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'catalog entry is invalid' using errcode = '22023';
  end if;
  v_schluessel := app.exercise_json_text(p -> 'schluessel');
  if v_schluessel is null or v_schluessel !~ '^[A-Z]{2}-[0-9]{2}$' then
    raise exception 'catalog key is invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p) k
    where k not in ('schluessel', 'version', 'name', 'alltagsname', 'region', 'ziel',
                    'ausgangsstellung', 'hilfsmittel', 'hilfsmittel_optional', 'niveau',
                    'dosierung', 'anleitung', 'fehler', 'hinweise_praxis')
  ) then
    raise exception 'catalog entry %: unknown field', v_schluessel using errcode = '22023';
  end if;

  v_version := app.exercise_json_text(p -> 'version');
  if v_version is null or v_version !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then
    raise exception 'catalog entry %: version is invalid', v_schluessel using errcode = '22023';
  end if;
  v_name := app.exercise_required_name(app.exercise_json_text(p -> 'name'), 'name');
  v_laie := app.exercise_required_name(app.exercise_json_text(p -> 'alltagsname'), 'lay name');

  v_region := app.exercise_json_text(p -> 'region');
  if v_region is null or not (v_region = any (app.exercise_body_regions())) then
    raise exception 'catalog entry %: body region is invalid', v_schluessel using errcode = '22023';
  end if;
  v_ziel := app.exercise_json_text(p -> 'ziel');
  if v_ziel is null or not (v_ziel = any (app.exercise_goals())) then
    raise exception 'catalog entry %: goal is invalid', v_schluessel using errcode = '22023';
  end if;
  v_stellung := app.exercise_json_text(p -> 'ausgangsstellung');
  if v_stellung is null or not (v_stellung = any (app.exercise_starting_positions())) then
    raise exception 'catalog entry %: starting position is invalid', v_schluessel using errcode = '22023';
  end if;
  v_niveau := app.exercise_json_int(p -> 'niveau');
  if v_niveau is null or v_niveau not between 1 and 3 then
    raise exception 'catalog entry %: level is invalid', v_schluessel using errcode = '22023';
  end if;

  -- Hilfsmittel aus der festen Liste, keines doppelt, zusammen hoechstens acht.
  foreach v_liste in array array['hilfsmittel', 'hilfsmittel_optional'] loop
    if p ? v_liste and jsonb_typeof(p -> v_liste) <> 'array' then
      raise exception 'catalog entry %: equipment is invalid', v_schluessel using errcode = '22023';
    end if;
    for v_eintrag in select value from jsonb_array_elements(coalesce(p -> v_liste, '[]'::jsonb)) loop
      if app.exercise_json_text(v_eintrag) is null
         or not (v_labels ? (v_eintrag #>> '{}'))
         or (v_eintrag #>> '{}') = any (v_hilfsmittel) then
        raise exception 'catalog entry %: equipment is invalid', v_schluessel using errcode = '22023';
      end if;
      v_hilfsmittel := v_hilfsmittel || (v_eintrag #>> '{}');
      v_ausruestung := v_ausruestung || (
        (v_labels ->> (v_eintrag #>> '{}'))
        || case when v_liste = 'hilfsmittel_optional' then ' (nach Bedarf)' else '' end
      );
    end loop;
  end loop;
  if cardinality(v_ausruestung) > 8 then
    raise exception 'catalog entry %: too many equipment tags', v_schluessel using errcode = '22023';
  end if;

  -- Standarddosierung (ANN-384), in die Form der Planposition gebracht.
  v_d := p -> 'dosierung';
  if v_d is null or jsonb_typeof(v_d) <> 'object' or exists (
    select 1 from jsonb_object_keys(v_d) k
    where k not in ('saetze', 'wiederholungen', 'halten_s', 'dauer_s', 'je_seite', 'taeglich')
  ) then
    raise exception 'catalog entry %: dosage is invalid', v_schluessel using errcode = '22023';
  end if;
  v_reps := v_d -> 'wiederholungen';
  if v_reps is null then
    v_min := null;
    v_max := null;
  elsif jsonb_typeof(v_reps) = 'array' and jsonb_array_length(v_reps) = 2 then
    v_min := app.exercise_json_int(v_reps -> 0);
    v_max := app.exercise_json_int(v_reps -> 1);
    if v_min is null or v_max is null or v_max <= v_min then
      raise exception 'catalog entry %: dosage is invalid', v_schluessel using errcode = '22023';
    end if;
  else
    v_min := app.exercise_json_int(v_reps);
    v_max := v_min;
    if v_min is null then
      raise exception 'catalog entry %: dosage is invalid', v_schluessel using errcode = '22023';
    end if;
  end if;
  if (v_d ? 'saetze' and app.exercise_json_int(v_d -> 'saetze') is null)
     or (v_d ? 'halten_s' and app.exercise_json_int(v_d -> 'halten_s') is null)
     or (v_d ? 'dauer_s' and app.exercise_json_int(v_d -> 'dauer_s') is null)
     or (v_d ? 'taeglich' and app.exercise_json_int(v_d -> 'taeglich') is null)
     or (v_d ? 'je_seite' and jsonb_typeof(v_d -> 'je_seite') <> 'boolean') then
    raise exception 'catalog entry %: dosage is invalid', v_schluessel using errcode = '22023';
  end if;
  v_dosis := jsonb_strip_nulls(jsonb_build_object(
    'sets', coalesce(app.exercise_json_int(v_d -> 'saetze'), 1),
    'reps_min', v_min,
    'reps_max', v_max,
    'duration_seconds', app.exercise_json_int(v_d -> 'dauer_s'),
    'hold_seconds', app.exercise_json_int(v_d -> 'halten_s'),
    'per_side', coalesce((v_d ->> 'je_seite')::boolean, false),
    'times_per_day', app.exercise_json_int(v_d -> 'taeglich')
  ));
  if not app.exercise_dosage_valid(v_dosis) then
    raise exception 'catalog entry %: dosage is invalid', v_schluessel using errcode = '22023';
  end if;

  if p ? 'hinweise_praxis' and app.exercise_json_text(p -> 'hinweise_praxis') is null then
    raise exception 'catalog entry %: practice notes are invalid', v_schluessel using errcode = '22023';
  end if;

  return jsonb_build_object(
    'catalog_key', v_schluessel,
    'catalog_version', v_version,
    'name', v_name,
    'lay_name', v_laie,
    'body_region', v_region,
    'goal', v_ziel,
    'starting_position', v_stellung,
    'level', v_niveau,
    'equipment', to_jsonb(v_ausruestung),
    'instruction', app.exercise_optional_text(
                     app.exercise_catalog_lines(p -> 'anleitung', 1, 'instruction', v_schluessel),
                     'instruction'),
    'common_faults', app.exercise_optional_text(
                       app.exercise_catalog_lines(p -> 'fehler', 0, 'common faults', v_schluessel),
                       'common faults'),
    'practice_notes', app.exercise_optional_text(
                        app.exercise_json_text(p -> 'hinweise_praxis'), 'practice notes'),
    'default_dosage', v_dosis
  );
end;
$_$;

create or replace function app.import_exercise_catalog_for(
  p_org uuid, p_actor uuid, p_entries jsonb, p_feste_kennungen boolean default false
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_eintraege   jsonb := '[]'::jsonb;
  v_schluessel  text[] := '{}';
  v_e           jsonb;
  v_neu         jsonb;
  v_uebernommen text[] := '{}';
  v_vorhanden   text[] := '{}';
  v_konflikte   jsonb := '[]'::jsonb;
  v_uebung      uuid;
  v_variante    uuid;
begin
  if p_org is null or p_actor is null then
    raise exception 'organization and actor are required' using errcode = '22023';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'catalog is empty or invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 500 or octet_length(p_entries::text) > 2000000 then
    raise exception 'catalog is too large' using errcode = '22023';
  end if;

  for v_e in select value from jsonb_array_elements(p_entries) loop
    v_neu := app.exercise_catalog_entry(v_e);
    if (v_neu ->> 'catalog_key') = any (v_schluessel) then
      raise exception 'catalog key % is duplicated', v_neu ->> 'catalog_key' using errcode = '22023';
    end if;
    v_schluessel := v_schluessel || (v_neu ->> 'catalog_key');
    v_eintraege := v_eintraege || jsonb_build_array(v_neu);
  end loop;

  -- Zwei Uebernahmen derselben Praxis zugleich laufen nacheinander.
  perform pg_advisory_xact_lock(hashtext('exercise_catalog_import'), hashtext(p_org::text));

  for v_neu in select value from jsonb_array_elements(v_eintraege) loop
    if exists (
      select 1 from public.exercise_variants v
      where v.organization_id = p_org and v.catalog_key = v_neu ->> 'catalog_key'
    ) then
      v_vorhanden := v_vorhanden || (v_neu ->> 'catalog_key');
      continue;
    end if;
    if exists (
      select 1 from public.exercises e
      where e.organization_id = p_org and lower(btrim(e.name)) = lower(v_neu ->> 'name')
    ) then
      v_konflikte := v_konflikte || jsonb_build_array(jsonb_build_object(
        'catalog_key', v_neu ->> 'catalog_key', 'name', v_neu ->> 'name'));
      continue;
    end if;

    -- Feste Kennungen nur fuer den Seed - derselbe Stand nach jedem Aufsetzen (ANN-380).
    v_uebung := case when p_feste_kennungen
                  then md5(p_org::text || ':uebung:' || (v_neu ->> 'catalog_key'))::uuid
                  else extensions.gen_random_uuid() end;
    v_variante := case when p_feste_kennungen
                    then md5(p_org::text || ':variante:' || (v_neu ->> 'catalog_key'))::uuid
                    else extensions.gen_random_uuid() end;

    insert into public.exercises (
      id, organization_id, name, lay_name, body_region, created_by, updated_by
    )
    values (
      v_uebung, p_org, v_neu ->> 'name', v_neu ->> 'lay_name', v_neu ->> 'body_region',
      p_actor, p_actor
    );
    insert into public.exercise_variants (
      id, organization_id, exercise_id, name, lay_name, instruction, equipment,
      common_faults, practice_notes, catalog_key, catalog_version, goal,
      starting_position, level, default_dosage, created_by, updated_by
    )
    values (
      v_variante, p_org, v_uebung, v_neu ->> 'name', v_neu ->> 'lay_name',
      v_neu ->> 'instruction',
      array(select jsonb_array_elements_text(v_neu -> 'equipment')),
      v_neu ->> 'common_faults', v_neu ->> 'practice_notes',
      v_neu ->> 'catalog_key', v_neu ->> 'catalog_version', v_neu ->> 'goal',
      v_neu ->> 'starting_position', (v_neu ->> 'level')::smallint,
      v_neu -> 'default_dosage',
      p_actor, p_actor
    );
    v_uebernommen := v_uebernommen || (v_neu ->> 'catalog_key');
  end loop;

  return jsonb_build_object(
    'imported', to_jsonb(v_uebernommen),
    'skipped', to_jsonb(v_vorhanden),
    'conflicts', v_konflikte
  );
end;
$$;

create or replace function app.exercise_plan_item_json(p_item public.exercise_plan_items)
returns jsonb
language sql stable security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'id', p_item.id,
    'position', p_item.position,
    'variant_id', p_item.variant_id,
    'exercise_name', coalesce(p_item.exercise_name, e.name),
    'exercise_lay_name', coalesce(p_item.exercise_lay_name, e.lay_name),
    'variant_name', coalesce(p_item.variant_name, v.name),
    'variant_lay_name', coalesce(p_item.variant_lay_name, v.lay_name),
    'body_region', coalesce(p_item.body_region, e.body_region),
    'instruction', case when p_item.variant_name is not null then p_item.instruction else v.instruction end,
    'equipment', to_jsonb(coalesce(p_item.equipment, v.equipment)),
    'variant_archived', p_item.variant_name is null and (v.archived_at is not null or e.archived_at is not null),
    'sets', p_item.sets,
    'reps_min', p_item.reps_min,
    'reps_max', p_item.reps_max,
    'duration_seconds', p_item.duration_seconds,
    'hold_seconds', p_item.hold_seconds,
    'per_side', p_item.per_side,
    'times_per_day', p_item.times_per_day,
    'load', p_item.load,
    'tempo', p_item.tempo,
    'rest_seconds', p_item.rest_seconds,
    'double_progression', p_item.double_progression,
    'note', p_item.note,
    'previous_item_id', p_item.previous_item_id,
    'step_axis', p_item.step_axis,
    'step_direction', p_item.step_direction
  )
  from public.exercise_variants v
  join public.exercises e on e.id = v.exercise_id
  where v.id = p_item.variant_id
$$;

create or replace function app.platform_exercise_plan_item_json(p_item public.exercise_plan_items)
returns jsonb
language sql immutable
set search_path to ''
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
    'hold_seconds', p_item.hold_seconds,
    'per_side', p_item.per_side,
    'times_per_day', p_item.times_per_day,
    'load', p_item.load,
    'tempo', p_item.tempo,
    'rest_seconds', p_item.rest_seconds,
    'double_progression', p_item.double_progression,
    'note', p_item.note
  )
$$;

create or replace function public.assign_exercise_plan(p_plan_id uuid, p_runs_until date)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_plan   public.exercise_plans%rowtype;
  v_heute  date;
  v_vorige public.exercise_plans%rowtype;
begin
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;
  perform app.exercise_plan_relationship_open(v_plan);

  if not exists (select 1 from public.exercise_plan_items i where i.plan_id = v_plan.id) then
    raise exception 'exercise plan has no exercises' using errcode = '22023';
  end if;

  v_heute := app.training_today(v_plan.organization_id);
  if p_runs_until is null or p_runs_until < v_heute
     or p_runs_until > v_heute + app.exercise_plan_max_days() then
    raise exception 'runs until is invalid' using errcode = '22023';
  end if;

  if v_plan.previous_plan_id is not null then
    select * into v_vorige
    from public.exercise_plans p
    where p.id = v_plan.previous_plan_id
    for update;
    if v_vorige.status = 'assigned' then
      update public.exercise_plans
         set status = 'superseded',
             ended_at = now(),
             ended_by = v_actor,
             updated_at = now(),
             updated_by = v_actor
       where id = v_vorige.id;
    end if;
  end if;

  -- Der Schnappschuss (ANN-300).
  update public.exercise_plan_items i
     set exercise_name = e.name,
         exercise_lay_name = e.lay_name,
         variant_name = v.name,
         variant_lay_name = v.lay_name,
         body_region = e.body_region,
         instruction = v.instruction,
         equipment = v.equipment
    from public.exercise_variants v
    join public.exercises e on e.id = v.exercise_id
   where i.plan_id = v_plan.id
     and v.id = i.variant_id;

  update public.exercise_plans
     set status = 'assigned',
         assigned_at = now(),
         assigned_by = v_actor,
         runs_from = v_heute,
         runs_until = p_runs_until,
         original_runs_until = p_runs_until,
         updated_at = now(),
         updated_by = v_actor
   where id = v_plan.id;
end;
$$;

create or replace function public.list_exercise_library()
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_exercise_library() then
    raise exception 'not allowed to read the exercise library' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read the exercise library' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'can_manage', app.can_manage_exercise_library(),
    'exercises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'lay_name', e.lay_name,
          'body_region', e.body_region,
          'archived', e.archived_at is not null,
          'variants', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'name', v.name,
                'lay_name', v.lay_name,
                'instruction', v.instruction,
                'equipment', to_jsonb(v.equipment),
                'common_faults', v.common_faults,
                'practice_notes', v.practice_notes,
                'archived', v.archived_at is not null,
                'catalog_key', v.catalog_key,
                'catalog_version', v.catalog_version,
                'goal', v.goal,
                'starting_position', v.starting_position,
                'level', v.level,
                'default_dosage', v.default_dosage,
                'reviewed_at', v.reviewed_at,
                'reviewed_by_name', (select up.display_name from public.user_profiles up
                                     where up.id = v.reviewed_by)
              )
              order by lower(v.name), v.id
            )
            from public.exercise_variants v
            where v.exercise_id = e.id and v.organization_id = v_org
          ), '[]'::jsonb)
        )
        order by lower(e.name), e.id
      )
      from public.exercises e
      where e.organization_id = v_org
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'easier_variant_id', l.easier_variant_id,
          'harder_variant_id', l.harder_variant_id,
          'axis', l.axis
        )
        order by l.created_at, l.id
      )
      from public.exercise_variant_links l
      where l.organization_id = v_org
    ), '[]'::jsonb)
  );
end;
$$;

alter table public.exercise_plan_items drop constraint exercise_plan_items_illustration_check;
alter table public.exercise_plan_items drop column illustration;
alter table public.exercise_variants drop constraint exercise_variants_illustration_check;
alter table public.exercise_variants drop column illustration;

drop function app.exercise_illustration_valid(jsonb);
