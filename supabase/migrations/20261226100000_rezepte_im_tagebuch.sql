-- Eigene Rezepte der Person und Rezepte im Tagebuch (ADR-027 Punkte 6, 9 und 10, ANN-843). Im
-- Tagebuch ist ein Rezept ein Eintrag mit seinem Stand, in Portionen; der Eintrag merkt sich das
-- Rezept nicht und bleibt, wenn es gelöscht wird.

alter table public.nutrition_diary_entries drop constraint nutrition_diary_entries_food_kind_check;
alter table public.nutrition_diary_entries add constraint nutrition_diary_entries_food_kind_check
  check (food_kind in ('catalog', 'practice', 'person', 'recipe'));
alter table public.nutrition_diary_entries drop constraint nutrition_diary_entries_food_shape;
alter table public.nutrition_diary_entries add constraint nutrition_diary_entries_food_shape check (
  (food_kind = 'catalog' and custom_food_id is null)
  or (food_kind in ('practice', 'person') and catalog_food_id is null)
  or (food_kind = 'recipe' and catalog_food_id is null and custom_food_id is null
      and portion_label is not null));

-- Ein Rezept, wie das Tagebuch ein Lebensmittel kennt: Werte je 100 g und die Portion.
create function app.nutrition_recipe_food(p_recipe public.nutrition_recipes) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select jsonb_build_object(
           'kind', 'recipe', 'id', j -> 'id', 'source', 'recipe', 'source_code', null,
           'name', j -> 'name', 'brand', null, 'base_unit', 'g', 'per_100', j -> 'per_100',
           'portions', j -> 'portions')
  from (select app.nutrition_recipe_json(p_recipe) as j) r
$$;

revoke all on function app.nutrition_recipe_food(public.nutrition_recipes) from public, anon, authenticated, service_role;

comment on function app.nutrition_recipe_food(public.nutrition_recipes) is
  'ERN-018 (ANN-843): ein Rezept in der Form eines Lebensmittels fürs Tagebuch - Werte je 100 g aus app.nutrition_recipe_json, die Portion als einzige Einheit.';

-- Wie bisher Katalog, Praxis und eigene Lebensmittel; dazu die eigenen Rezepte der Person.
create or replace function app.nutrition_diary_food(p_profile public.nutrition_profiles, p_kind text, p_id uuid)
  returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce(
    app.nutrition_practice_food(p_profile.organization_id, p_kind, p_id),
    (select app.custom_food_json(c) - 'updated_at'
     from public.custom_foods c
     where p_kind = 'person' and c.owner_kind = 'person' and c.id = p_id
       and c.organization_id = p_profile.organization_id and c.profile_id = p_profile.id),
    (select app.nutrition_recipe_food(r)
     from public.nutrition_recipes r
     where p_kind = 'recipe' and r.owner_kind = 'person' and r.id = p_id
       and r.organization_id = p_profile.organization_id and r.profile_id = p_profile.id))
$$;

comment on function app.nutrition_diary_food(public.nutrition_profiles, text, uuid) is
  'ERN-007/ERN-018: ein Lebensmittel, wie es die Person an ihrem Profil findet - Katalog (nicht zurückgezogen), Praxis (nicht abgelegt), eigene Lebensmittel und eigene Rezepte. Ohne Rechteprüfung.';

create or replace function public.add_platform_diary_entry(
  p_access_id uuid, p_eaten_on date, p_meal text, p_food_kind text, p_food_id uuid,
  p_amount numeric default null, p_portion_label text default null, p_portion_count numeric default null
) returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_zugang public.platform_accesses%rowtype;
  v_essen  jsonb;
  v_menge  record;
  v_id     uuid;
begin
  -- Erst der Zugang, dann die Eingabe.
  v_profil := app.platform_diary_for_writing(p_access_id, p_eaten_on, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if p_eaten_on is null or p_meal is null
     or p_meal not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'day and meal are required' using errcode = '22023';
  end if;
  v_essen := app.nutrition_diary_food(v_profil, p_food_kind, p_food_id);
  if v_essen is null then
    raise exception 'food not found' using errcode = 'P0002';
  end if;
  -- Ein Rezept nur in Portionen: Seine Grammzahl mischt Gramm und Milliliter (ANN-843).
  if p_food_kind = 'recipe' and p_portion_label is null then
    raise exception 'portion or amount' using errcode = '22023';
  end if;
  select * into v_menge from app.nutrition_diary_amount(v_essen, p_amount, p_portion_label, p_portion_count);
  if (select count(*) from public.nutrition_diary_entries e
      where e.profile_id = v_profil.id and e.eaten_on = p_eaten_on)
     >= app.nutrition_diary_rule('entries_per_day') then
    raise exception 'too many entries on this day' using errcode = '54000';
  end if;

  insert into public.nutrition_diary_entries (
    organization_id, profile_id, eaten_on, meal, food_kind, catalog_food_id, custom_food_id,
    food_name, food_brand, base_unit, energy_kcal, protein_g, fat_g, carbohydrate_g, sugar_g,
    fibre_g, saturated_fat_g, salt_g, amount, portion_label, portion_amount, portion_count,
    platform_access_id, platform_access_kind, created_by, updated_by
  )
  values (
    v_profil.organization_id, v_profil.id, p_eaten_on, p_meal, p_food_kind,
    case when p_food_kind = 'catalog' then p_food_id end,
    case when p_food_kind in ('practice', 'person') then p_food_id end,
    v_essen ->> 'name', v_essen ->> 'brand', v_essen ->> 'base_unit',
    (v_essen -> 'per_100' ->> 'energy_kcal')::numeric,
    (v_essen -> 'per_100' ->> 'protein_g')::numeric,
    (v_essen -> 'per_100' ->> 'fat_g')::numeric,
    (v_essen -> 'per_100' ->> 'carbohydrate_g')::numeric,
    (v_essen -> 'per_100' ->> 'sugar_g')::numeric,
    (v_essen -> 'per_100' ->> 'fibre_g')::numeric,
    (v_essen -> 'per_100' ->> 'saturated_fat_g')::numeric,
    (v_essen -> 'per_100' ->> 'salt_g')::numeric,
    v_menge.amount, v_menge.portion_label, v_menge.portion_amount, v_menge.portion_count,
    v_zugang.id, v_zugang.access_kind, auth.uid(), auth.uid()
  )
  returning id into v_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
  return v_id;
end;
$$;

comment on function public.add_platform_diary_entry(uuid, date, text, text, uuid, numeric, text, numeric) is
  'ERN-007 (ADR-027 Punkte 9 und 10): ein Lebensmittel ins Tagebuch - an einem Tag zwischen Beginn und heute, zu einer Mahlzeit, mit Portion und Anzahl oder einer Menge in g bzw. ml; Werte rechnet der Server aus dem Lebensmittel (ANN-660). ERN-018: ein Rezept nur mit Portion und Anzahl, der Eintrag trägt seinen Stand ohne Verweis (ANN-843). Die Person oder ihre rechtliche Vertretung, mit Einwilligung und eingeschaltetem Tagebuch, nicht in der Lesefrist; nie die Begleitung. Höchstens 80 je Tag.';

-- Die eigenen Rezepte einer Person, für Beratung, Plattform, Auskunft und Export.
create function app.nutrition_own_recipes_json(p_profile_id uuid) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce(jsonb_agg(
    app.nutrition_recipe_json(r)
      || jsonb_build_object('created_at', r.created_at, 'recorded_by_kind', r.platform_access_kind)
    order by r.name_key, r.id), '[]'::jsonb)
  from public.nutrition_recipes r
  where r.profile_id = p_profile_id and r.owner_kind = 'person'
$$;

revoke all on function app.nutrition_own_recipes_json(uuid) from public, anon, authenticated, service_role;

comment on function app.nutrition_own_recipes_json(uuid) is
  'ERN-018 (ADR-027 Punkte 6 und 9): die eigenen Rezepte eines Profils mit gerechneten Werten, wann angelegt und von wem (Person oder rechtliche Vertretung). Ohne Rechteprüfung.';

create or replace function app.nutrition_profile_base_json(p_profile_id uuid) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'relationship_kind', p.relationship_kind,
    'started_on', p.started_on,
    'ended_on', p.ended_on,
    'height_cm', p.height_cm,
    'formula_sex', p.formula_sex,
    'body_fat_percent', p.body_fat_percent,
    'activity_pal', p.activity_pal,
    'goal', p.goal,
    'bmr_formula', p.bmr_formula,
    'target_weight_kg', p.target_weight_kg,
    'target_weight_source', p.target_weight_source,
    'overrides', jsonb_build_object(
      'energy_kcal', p.energy_kcal_override,
      'protein_g', p.protein_g_override,
      'fat_g', p.fat_g_override,
      'carbohydrate_g', p.carbohydrate_g_override,
      'water_ml', p.water_ml_override),
    'notes', p.notes,
    'diary_enabled', p.diary_enabled,
    'diary_changed_at', p.diary_changed_at,
    'diary_changed_by_kind', p.diary_changed_by_kind,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'consent', (
      select jsonb_build_object(
        'state', case c.record_kind when 'consent_granted' then 'granted' else 'withdrawn' end,
        'occurred_on', c.occurred_on,
        'source', c.source,
        'platform_access_kind', c.platform_access_kind,
        'representative_name', c.representative_name)
      from app.nutrition_consent(p.id) c
      where c.id is not null),
    'consent_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_kind', r.record_kind, 'occurred_on', r.occurred_on, 'source', r.source,
        'platform_access_kind', r.platform_access_kind,
        'representative_name', r.representative_name,
        'wording_version', r.wording_version, 'recorded_at', r.recorded_at)
        order by r.recorded_at desc, r.id desc)
      from public.nutrition_consent_records r where r.profile_id = p.id), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'measured_on', w.measured_on, 'weight_kg', w.weight_kg, 'source', w.source,
        'recorded_by_kind', w.platform_access_kind)
        order by w.measured_on desc)
      from public.nutrition_weight_entries w where w.profile_id = p.id), '[]'::jsonb),
    'targets', app.nutrition_profile_targets(p.id),
    'own_foods', app.nutrition_own_foods_json(p.id),
    'own_recipes', app.nutrition_own_recipes_json(p.id)
  )
  from public.nutrition_profiles p
  where p.id = p_profile_id
$$;

create or replace function app.nutrition_platform_shape(j jsonb) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select jsonb_build_object(
    'started_on', j -> 'started_on',
    'ended_on', j -> 'ended_on',
    'height_cm', j -> 'height_cm',
    'formula_sex', j -> 'formula_sex',
    'body_fat_percent', j -> 'body_fat_percent',
    'activity_pal', j -> 'activity_pal',
    'goal', j -> 'goal',
    'target_weight_kg', j -> 'target_weight_kg',
    'target_weight_source', j -> 'target_weight_source',
    'diary_enabled', j -> 'diary_enabled',
    'diary_changed_at', j -> 'diary_changed_at',
    'consent', case when j -> 'consent' = 'null'::jsonb then null else
      (j -> 'consent') - 'representative_name' - 'platform_access_kind' end,
    'weights', (
      select coalesce(jsonb_agg(w - 'recorded_by_kind'), '[]'::jsonb)
      from jsonb_array_elements(j -> 'weights') w),
    'targets', j -> 'targets',
    'own_foods', (
      select coalesce(jsonb_agg(f - 'recorded_by_kind'), '[]'::jsonb)
      from jsonb_array_elements(j -> 'own_foods') f),
    'own_recipes', (
      select coalesce(jsonb_agg(r - 'recorded_by_kind'), '[]'::jsonb)
      from jsonb_array_elements(coalesce(j -> 'own_recipes', '[]'::jsonb)) r)
  )
  -- Das Tagebuch nur, wo es mitkommt (Export), ohne wer eingetragen hat.
  || case when j ? 'diary' then jsonb_build_object('diary', app.nutrition_diary_platform_shape(j -> 'diary'))
          else '{}'::jsonb end
  where j is not null
$$;

create function public.save_platform_recipe(p_access_id uuid, p_id uuid, p_recipe jsonb)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_profil  public.nutrition_profiles%rowtype;
  v_zugang  public.platform_accesses%rowtype;
  v_r       jsonb;
  v_zutaten jsonb;
  v_id      uuid;
begin
  -- Recht nutrition, Lesefrist, laufende Beratung, Einwilligung.
  v_profil := app.platform_nutrition_for_writing(p_access_id, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_r := app.nutrition_recipe_input(p_recipe, false);
  v_zutaten := app.nutrition_recipe_ingredients(
    p_recipe -> 'ingredients', v_profil.organization_id, v_profil.id);
  if app.nutrition_recipe_total(v_zutaten) > 5000 * (v_r ->> 'servings')::numeric then
    raise exception 'portion too large' using errcode = '22023';
  end if;

  if p_id is null then
    -- Eine Grenze gegen Massenanlage: 200 eigene Rezepte je Profil.
    if (select count(*) from public.nutrition_recipes r where r.profile_id = v_profil.id) >= 200 then
      raise exception 'too many own recipes' using errcode = '54000';
    end if;
    insert into public.nutrition_recipes (
      organization_id, owner_kind, profile_id, name, servings, instructions, ingredients,
      platform_access_id, platform_access_kind, created_by, updated_by
    )
    values (
      v_profil.organization_id, 'person', v_profil.id, v_r ->> 'name',
      (v_r ->> 'servings')::smallint, v_r ->> 'instructions', v_zutaten, v_zugang.id,
      v_zugang.access_kind, auth.uid(), auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.nutrition_recipes r set
    name = v_r ->> 'name', servings = (v_r ->> 'servings')::smallint,
    instructions = v_r ->> 'instructions', ingredients = v_zutaten,
    platform_access_id = v_zugang.id, platform_access_kind = v_zugang.access_kind,
    updated_at = now(), updated_by = auth.uid()
  where r.id = p_id and r.profile_id = v_profil.id and r.owner_kind = 'person'
  returning r.id into v_id;
  if v_id is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_platform_recipe(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_platform_recipe(uuid, uuid, jsonb) to authenticated;

comment on function public.save_platform_recipe(uuid, uuid, jsonb) is
  'ERN-018 (ADR-027 Punkt 9): ein eigenes Rezept anlegen (p_id null) oder ändern - Zutaten aus Katalog, Praxis und den eigenen Lebensmitteln; die Werte rechnet der Server. Die Person oder ihre rechtliche Vertretung, mit Einwilligung, an der laufenden Beratung dieses Zugangs, nicht in der Lesefrist; nie die Begleitung. Höchstens 200 je Profil. Wer, steht am Datensatz.';

create function public.delete_platform_recipe(p_access_id uuid, p_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  -- Löschen braucht keine Einwilligung: wer widerrufen hat, räumt trotzdem auf.
  v_profil := app.platform_nutrition_for_writing(p_access_id, false);
  delete from public.nutrition_recipes r
  where r.id = p_id and r.profile_id = v_profil.id and r.owner_kind = 'person';
  if not found then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_platform_recipe(uuid, uuid) from public, anon;
grant execute on function public.delete_platform_recipe(uuid, uuid) to authenticated;

comment on function public.delete_platform_recipe(uuid, uuid) is
  'ERN-018: ein eigenes Rezept löschen - die Person oder ihre rechtliche Vertretung, an der laufenden Beratung dieses Zugangs, auch nach einem Widerruf; nie die Begleitung, nicht in der Lesefrist. Einträge im Tagebuch behalten ihren Stand.';
