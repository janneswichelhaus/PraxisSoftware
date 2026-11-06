-- Rezepte (ADR-027 Punkte 6, 9 und 14, ANN-843): aus Zutaten, die Nährwerte rechnet der Server. Jede
-- Zutat trägt den Stand ihres Lebensmittels beim Speichern (wie der Tagebucheintrag, ANN-660); so
-- bleibt ein Rezept gleich, auch wenn ein Lebensmittel später abgelegt oder gelöscht wird.

-- Eine Zutat im gespeicherten Stand: Herkunft, Name, Werte je 100 g bzw. ml, Menge und Portion.
create function app.nutrition_recipe_ingredients_valid(p_items jsonb) returns boolean
  language sql immutable parallel safe
  set search_path = ''
as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) between 1 and 40
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
       where jsonb_typeof(e) <> 'object'
          or exists (select 1 from jsonb_object_keys(e) k
                     where k not in ('food_kind', 'food_id', 'name', 'brand', 'base_unit',
                                     'per_100', 'amount', 'portion_label', 'portion_count'))
          or coalesce(e ->> 'food_kind', '') not in ('catalog', 'practice', 'person')
          or coalesce(e ->> 'food_id', '')
               !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(e -> 'name') is distinct from 'string'
          or length(btrim(e ->> 'name')) not between 1 and 300
          or coalesce(jsonb_typeof(e -> 'brand'), '') not in ('null', 'string')
          or (jsonb_typeof(e -> 'brand') = 'string' and length(btrim(e ->> 'brand')) not between 1 and 200)
          or coalesce(e ->> 'base_unit', '') not in ('g', 'ml')
          or jsonb_typeof(e -> 'per_100') is distinct from 'object'
          or exists (select 1 from jsonb_object_keys(e -> 'per_100') k
                     where k not in ('energy_kcal', 'protein_g', 'fat_g', 'carbohydrate_g',
                                     'sugar_g', 'fibre_g', 'saturated_fat_g', 'salt_g'))
          or jsonb_typeof(e -> 'per_100' -> 'energy_kcal') is distinct from 'number'
          or (e -> 'per_100' ->> 'energy_kcal')::numeric not between 0 and 950
          or exists (select 1 from unnest(array['protein_g', 'fat_g', 'carbohydrate_g']) n
                     where jsonb_typeof(e -> 'per_100' -> n) is distinct from 'number'
                        or (e -> 'per_100' ->> n)::numeric not between 0 and 100)
          or exists (select 1 from unnest(array['sugar_g', 'fibre_g', 'saturated_fat_g', 'salt_g']) n
                     where jsonb_typeof(e -> 'per_100' -> n) not in ('null', 'number')
                        or (e -> 'per_100' ->> n)::numeric not between 0 and 100)
          or jsonb_typeof(e -> 'amount') is distinct from 'number'
          or (e ->> 'amount')::numeric <= 0 or (e ->> 'amount')::numeric > 5000
          or coalesce(jsonb_typeof(e -> 'portion_label'), '') not in ('null', 'string')
          or coalesce(jsonb_typeof(e -> 'portion_count'), '') not in ('null', 'number')
          or (jsonb_typeof(e -> 'portion_label') = 'null') <> (jsonb_typeof(e -> 'portion_count') = 'null')
          or (jsonb_typeof(e -> 'portion_label') = 'string'
              and length(btrim(e ->> 'portion_label')) not between 1 and 60)
          or (jsonb_typeof(e -> 'portion_count') = 'number'
              and ((e ->> 'portion_count')::numeric <= 0 or (e ->> 'portion_count')::numeric > 20)))
     and (select sum((e ->> 'amount')::numeric) from jsonb_array_elements(p_items) e) <= 20000
$$;

-- Die Menge aller Zutaten; Milliliter zählen wie Gramm (ANN-843).
create function app.nutrition_recipe_total(p_items jsonb) returns numeric
  language sql immutable parallel safe
  set search_path = ''
as $$
  select coalesce(sum((e ->> 'amount')::numeric), 0) from jsonb_array_elements(p_items) e
$$;

revoke all on function app.nutrition_recipe_ingredients_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function app.nutrition_recipe_total(jsonb) from public, anon, authenticated, service_role;

comment on function app.nutrition_recipe_ingredients_valid(jsonb) is
  'ERN-016 (ANN-843): eine bis 40 Zutaten im gespeicherten Stand - Herkunft, Name, Werte je 100 g bzw. ml wie im Katalog, Menge bis 5000, Portion mit Anzahl bis 20; zusammen höchstens 20 000.';
comment on function app.nutrition_recipe_total(jsonb) is
  'ERN-016 (ANN-843): die Menge aller Zutaten eines Rezepts; Milliliter zählen wie Gramm.';

create table public.nutrition_recipes (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  owner_kind           text not null check (owner_kind in ('practice', 'person')),
  profile_id           uuid,
  name                 text not null check (length(btrim(name)) between 1 and 120),
  servings             smallint not null check (servings between 1 and 20),
  instructions         text check (instructions is null or length(btrim(instructions)) between 1 and 4000),
  ingredients          jsonb not null check (app.nutrition_recipe_ingredients_valid(ingredients)),
  name_key             text generated always as (app.food_search_key(name)) stored,
  starter_key          text check (starter_key is null
                                   or (starter_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(starter_key) <= 60)),
  platform_access_id   uuid,
  platform_access_kind text check (platform_access_kind in ('self', 'legal_representative')),
  created_at           timestamptz not null default now(),
  created_by           uuid not null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  archived_at          timestamptz,
  -- Die Portion passt in einen Tagebucheintrag (höchstens 5000 g bzw. ml).
  constraint nutrition_recipes_portion_fits
    check (app.nutrition_recipe_total(ingredients) <= 5000 * servings),
  constraint nutrition_recipes_owner_shape check (
    (owner_kind = 'practice' and profile_id is null and platform_access_id is null
     and platform_access_kind is null)
    or (owner_kind = 'person' and profile_id is not null and archived_at is null
        and starter_key is null and (platform_access_id is null) = (platform_access_kind is null))),
  constraint nutrition_recipes_profile_fk foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade
);

create unique index nutrition_recipes_starter on public.nutrition_recipes (organization_id, starter_key)
  where starter_key is not null and archived_at is null;
create index nutrition_recipes_profile on public.nutrition_recipes (profile_id)
  where profile_id is not null;
create index nutrition_recipes_practice on public.nutrition_recipes (organization_id, name_key)
  where owner_kind = 'practice' and archived_at is null;

comment on table public.nutrition_recipes is
  'ERN-016 (ADR-027 Punkte 9 und 14, ANN-843): Rezepte aus Zutaten - der Praxis (Inhalt, von der Beratung gepflegt, abgelegt statt gelöscht) oder einer Person an ihrem Ernährungsprofil (von ihr oder ihrer rechtlichen Vertretung, nur mit Einwilligung). Die Zutaten tragen den Stand ihres Lebensmittels beim Speichern; die Nährwerte rechnet allein der Server (app.nutrition_recipe_json). Datenklassen: Betriebsdaten bzw. Ernährungsberatung (fällt mit dem Profil). Kein Tabellenrecht und keine Policy: erreichbar nur über die Funktionen (ADR-004).';
comment on column public.nutrition_recipes.starter_key is
  'ERN-017 (ADR-027 Punkt 14): Schlüssel des mitgelieferten Rezepts, aus dem die Praxis dieses übernommen hat - je Praxis einmal, solange es nicht abgelegt ist.';

alter table public.nutrition_recipes enable row level security;
revoke all on table public.nutrition_recipes from public, anon, authenticated, service_role;

insert into public.data_registry (
  table_name, subject_kind, export_mode, export_patient, export_training, export_parent,
  journal_mode, journal_key, journal_class, journal_class_training, journal_daily, journal_rank,
  merge_mode, decision_note
) values
  ('nutrition_recipes', 'patient_training', 'nested', '{}', '{}', 'nutrition_profiles', 'row', 'id',
   'ernaehrungsberatung', null, false, 358, 'via_parent', null);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('nutrition_recipes', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Eigene Rezepte der Person (ERN-018, owner_kind person): fallen mit ihrem Ernährungsprofil (ADR-027 Punkt 6).', 264),
  ('nutrition_recipes', 'betriebsdaten', 'keine',
   'Rezepte der Praxis (ERN-016, owner_kind practice): Inhalt ohne Personenbezug, abgelegt statt gelöscht.', 265);

create trigger journal_deletion after delete on public.nutrition_recipes
  for each row execute function app.journal_deletion();

-- Ein Lebensmittel für ein Rezept der Praxis: aus dem Katalog (nicht zurückgezogen) oder der Praxis
-- (nicht abgelegt), nie das einer Person.
create function app.nutrition_practice_food(p_org uuid, p_kind text, p_id uuid) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select jsonb_build_object(
           'kind', 'catalog', 'id', b.id, 'source', b.source, 'source_code', b.source_code,
           'name', b.name, 'brand', b.brand, 'base_unit', b.base_unit,
           'per_100', jsonb_build_object(
             'energy_kcal', b.energy_kcal, 'protein_g', b.protein_g, 'fat_g', b.fat_g,
             'carbohydrate_g', b.carbohydrate_g, 'sugar_g', b.sugar_g, 'fibre_g', b.fibre_g,
             'saturated_fat_g', b.saturated_fat_g, 'salt_g', b.salt_g),
           'portions', b.portions)
  from public.food_catalog b
  where p_kind = 'catalog' and b.id = p_id and b.retired_at is null
  union all
  select app.custom_food_json(c) - 'updated_at'
  from public.custom_foods c
  where p_kind = 'practice' and c.owner_kind = 'practice' and c.id = p_id
    and c.organization_id = p_org and c.archived_at is null
  limit 1
$$;

revoke all on function app.nutrition_practice_food(uuid, text, uuid) from public, anon, authenticated, service_role;

comment on function app.nutrition_practice_food(uuid, text, uuid) is
  'ERN-016: ein Lebensmittel, wie es die Praxis findet - Katalog (nicht zurückgezogen) oder Praxis (nicht abgelegt) der Organisation. Ohne Rechteprüfung.';

-- Die Eingabe eines Rezepts: Name, Portionen, Zubereitung, Zutaten, bei der Praxis der Schlüssel.
create function app.nutrition_recipe_input(p_recipe jsonb, p_practice boolean) returns jsonb
  language plpgsql immutable
  set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_recipe ->> 'name'), '');
begin
  if jsonb_typeof(p_recipe) is distinct from 'object' or v_name is null then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_recipe) k
             where k not in ('name', 'servings', 'instructions', 'ingredients', 'starter_key')
                or (k = 'starter_key' and not p_practice)) then
    raise exception 'unknown field' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipe -> 'servings') is distinct from 'number'
     or (p_recipe ->> 'servings')::numeric not in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
                                                   15, 16, 17, 18, 19, 20) then
    raise exception 'servings between 1 and 20' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipe -> 'instructions') not in ('null', 'string')
     or jsonb_typeof(p_recipe -> 'starter_key') not in ('null', 'string') then
    raise exception 'unknown field' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'name', v_name,
    'servings', (p_recipe ->> 'servings')::smallint,
    'instructions', nullif(btrim(p_recipe ->> 'instructions'), ''),
    'starter_key', nullif(btrim(p_recipe ->> 'starter_key'), ''));
end;
$$;

revoke all on function app.nutrition_recipe_input(jsonb, boolean) from public, anon, authenticated, service_role;

comment on function app.nutrition_recipe_input(jsonb, boolean) is
  'ERN-016: prüft die Angaben eines Rezepts (Name, Portionen 1 bis 20, Zubereitung, bei der Praxis der Schlüssel eines mitgelieferten) und gibt sie bereinigt zurück; die Zutaten prüft app.nutrition_recipe_ingredients.';

-- Die Zutaten mit dem Stand ihres Lebensmittels: Die Praxis (p_profile_id null) wählt aus Katalog
-- und Praxis, die Person dazu ihre eigenen. Werte schickt die Anwendung nie mit.
create function app.nutrition_recipe_ingredients(p_items jsonb, p_org uuid, p_profile_id uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_item   jsonb;
  v_kind   text;
  v_id     uuid;
  v_essen  jsonb;
  v_menge  record;
  v_aus    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 40 then
    raise exception 'ingredients between 1 and 40' using errcode = '22023';
  end if;
  if p_profile_id is not null then
    select * into v_profil from public.nutrition_profiles p
    where p.id = p_profile_id and p.organization_id = p_org;
  end if;
  for v_item in select e from jsonb_array_elements(p_items) e loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_item) k
                  where k not in ('food_kind', 'food_id', 'amount', 'portion_label', 'portion_count'))
       or jsonb_typeof(v_item -> 'amount') not in ('null', 'number')
       or jsonb_typeof(v_item -> 'portion_count') not in ('null', 'number')
       or jsonb_typeof(v_item -> 'portion_label') not in ('null', 'string')
       or coalesce(v_item ->> 'food_id', '')
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'unknown field' using errcode = '22023';
    end if;
    v_kind := v_item ->> 'food_kind';
    v_id := (v_item ->> 'food_id')::uuid;
    v_essen := case
      when v_kind = 'person' and v_profil.id is not null
        then app.nutrition_diary_food(v_profil, v_kind, v_id)
      when v_kind in ('catalog', 'practice')
        then app.nutrition_practice_food(p_org, v_kind, v_id)
    end;
    if v_essen is null then
      raise exception 'food not found' using errcode = 'P0002';
    end if;
    select * into v_menge from app.nutrition_diary_amount(
      v_essen, (v_item ->> 'amount')::numeric, v_item ->> 'portion_label',
      (v_item ->> 'portion_count')::numeric);
    v_aus := v_aus || jsonb_build_array(jsonb_build_object(
      'food_kind', v_kind, 'food_id', v_id, 'name', v_essen ->> 'name',
      'brand', v_essen -> 'brand', 'base_unit', v_essen ->> 'base_unit',
      'per_100', v_essen -> 'per_100', 'amount', v_menge.amount,
      'portion_label', v_menge.portion_label, 'portion_count', v_menge.portion_count));
  end loop;
  if app.nutrition_recipe_total(v_aus) > 20000 then
    raise exception 'recipe too large' using errcode = '22023';
  end if;
  return v_aus;
end;
$$;

revoke all on function app.nutrition_recipe_ingredients(jsonb, uuid, uuid) from public, anon, authenticated, service_role;

comment on function app.nutrition_recipe_ingredients(jsonb, uuid, uuid) is
  'ERN-016 (ADR-027 Punkt 9, ANN-843): die Zutaten eines Rezepts mit dem Stand ihres Lebensmittels - Lebensmittel und Menge (oder Portion und Anzahl) kommen von der Anwendung, Name und Werte nur aus Katalog, Praxis oder, an einem Profil, den eigenen Lebensmitteln der Person. Ohne Rechteprüfung.';

-- Ein Rezept mit gerechneten Werten: je Portion zum Lesen, je 100 g fürs Tagebuch.
create function app.nutrition_recipe_json(p_recipe public.nutrition_recipes) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  with z as (
    select t.e, t.nr, (t.e ->> 'amount')::numeric as menge
    from jsonb_array_elements(p_recipe.ingredients) with ordinality as t(e, nr)
  ),
  s as (
    select sum(z.menge) as gesamt,
           sum((z.e -> 'per_100' ->> 'energy_kcal')::numeric * z.menge / 100) as energie,
           sum((z.e -> 'per_100' ->> 'protein_g')::numeric * z.menge / 100) as eiweiss,
           sum((z.e -> 'per_100' ->> 'fat_g')::numeric * z.menge / 100) as fett,
           sum((z.e -> 'per_100' ->> 'carbohydrate_g')::numeric * z.menge / 100) as kh,
           -- Fehlt ein Wert an einer Zutat, bleibt er am Rezept unbekannt.
           case when bool_and(jsonb_typeof(z.e -> 'per_100' -> 'sugar_g') = 'number')
                then sum((z.e -> 'per_100' ->> 'sugar_g')::numeric * z.menge / 100) end as zucker,
           case when bool_and(jsonb_typeof(z.e -> 'per_100' -> 'fibre_g') = 'number')
                then sum((z.e -> 'per_100' ->> 'fibre_g')::numeric * z.menge / 100) end as ballast,
           case when bool_and(jsonb_typeof(z.e -> 'per_100' -> 'saturated_fat_g') = 'number')
                then sum((z.e -> 'per_100' ->> 'saturated_fat_g')::numeric * z.menge / 100) end as gesaettigt,
           case when bool_and(jsonb_typeof(z.e -> 'per_100' -> 'salt_g') = 'number')
                then sum((z.e -> 'per_100' ->> 'salt_g')::numeric * z.menge / 100) end as salz
    from z
  )
  select jsonb_build_object(
    'kind', 'recipe',
    'id', p_recipe.id,
    'owner', p_recipe.owner_kind,
    'name', p_recipe.name,
    'servings', p_recipe.servings,
    'instructions', p_recipe.instructions,
    'base_unit', 'g',
    'ingredients', (
      select jsonb_agg(jsonb_build_object(
               'food_kind', z.e -> 'food_kind', 'food_id', z.e -> 'food_id',
               'name', z.e -> 'name', 'brand', z.e -> 'brand', 'base_unit', z.e -> 'base_unit',
               'amount', z.e -> 'amount', 'portion_label', z.e -> 'portion_label',
               'portion_count', z.e -> 'portion_count', 'per_100', z.e -> 'per_100',
               'energy_kcal', round((z.e -> 'per_100' ->> 'energy_kcal')::numeric * z.menge / 100))
             order by z.nr)
      from z),
    'total_amount', round(s.gesamt, 1),
    'per_portion', jsonb_build_object(
      'energy_kcal', round(s.energie / p_recipe.servings),
      'protein_g', round(s.eiweiss / p_recipe.servings, 1),
      'fat_g', round(s.fett / p_recipe.servings, 1),
      'carbohydrate_g', round(s.kh / p_recipe.servings, 1)),
    'per_100', jsonb_build_object(
      'energy_kcal', round(s.energie / s.gesamt * 100, 1),
      'protein_g', round(s.eiweiss / s.gesamt * 100, 2),
      'fat_g', round(s.fett / s.gesamt * 100, 2),
      'carbohydrate_g', round(s.kh / s.gesamt * 100, 2),
      'sugar_g', round(s.zucker / s.gesamt * 100, 2),
      'fibre_g', round(s.ballast / s.gesamt * 100, 2),
      'saturated_fat_g', round(s.gesaettigt / s.gesamt * 100, 2),
      'salt_g', round(s.salz / s.gesamt * 100, 3)),
    'portions', jsonb_build_array(jsonb_build_object(
      'label', '1 Portion', 'amount', round(s.gesamt / p_recipe.servings, 1))),
    'starter_key', p_recipe.starter_key,
    'updated_at', p_recipe.updated_at)
  from s
$$;

revoke all on function app.nutrition_recipe_json(public.nutrition_recipes) from public, anon, authenticated, service_role;

comment on function app.nutrition_recipe_json(public.nutrition_recipes) is
  'ERN-016 (ADR-027 Punkt 9, ANN-843): ein Rezept mit gerechneten Werten - je Zutat ihr Stand und die Energie ihrer Menge, je Portion Energie und Makronährstoffe, je 100 g alle Werte des Tagebuchs (fehlt einer an einer Zutat, bleibt er leer) und die Portion als Gesamtmenge durch die Portionen. Die eine Stelle der Rechnung. Ohne Rechteprüfung.';

create function public.list_practice_recipes() returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(app.nutrition_recipe_json(r) order by r.name_key, r.id)
    from public.nutrition_recipes r
    where r.organization_id = app.current_organization_id()
      and r.owner_kind = 'practice' and r.archived_at is null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_practice_recipes() from public, anon;
grant execute on function public.list_practice_recipes() to authenticated;

comment on function public.list_practice_recipes() is
  'ERN-016: die Rezepte der Praxis (nicht abgelegt) mit gerechneten Werten - allein app.can_counsel_nutrition.';

create function public.save_practice_recipe(p_id uuid, p_recipe jsonb, p_expected timestamptz default null)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_org     uuid;
  v_r       jsonb;
  v_zutaten jsonb;
  v_id      uuid;
begin
  if v_actor is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  v_r := app.nutrition_recipe_input(p_recipe, true);
  v_zutaten := app.nutrition_recipe_ingredients(p_recipe -> 'ingredients', v_org, null);
  if app.nutrition_recipe_total(v_zutaten) > 5000 * (v_r ->> 'servings')::numeric then
    raise exception 'portion too large' using errcode = '22023';
  end if;

  if p_id is null then
    -- Ein mitgeliefertes Rezept übernimmt die Praxis einmal, solange es nicht abgelegt ist.
    if v_r ->> 'starter_key' is not null and exists (
         select 1 from public.nutrition_recipes r
         where r.organization_id = v_org and r.starter_key = v_r ->> 'starter_key'
           and r.archived_at is null) then
      raise exception 'recipe already adopted' using errcode = '23505';
    end if;
    insert into public.nutrition_recipes (
      organization_id, owner_kind, name, servings, instructions, ingredients, starter_key,
      created_by, updated_by
    )
    values (
      v_org, 'practice', v_r ->> 'name', (v_r ->> 'servings')::smallint, v_r ->> 'instructions',
      v_zutaten, v_r ->> 'starter_key', v_actor, v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  if v_r ->> 'starter_key' is not null then
    raise exception 'unknown field' using errcode = '22023';
  end if;
  update public.nutrition_recipes r set
    name = v_r ->> 'name', servings = (v_r ->> 'servings')::smallint,
    instructions = v_r ->> 'instructions', ingredients = v_zutaten,
    updated_at = now(), updated_by = v_actor
  where r.id = p_id and r.organization_id = v_org and r.owner_kind = 'practice'
    and r.archived_at is null
    and (p_expected is null or r.updated_at = p_expected)
  returning r.id into v_id;
  if v_id is null then
    if exists (select 1 from public.nutrition_recipes r
               where r.id = p_id and r.organization_id = v_org and r.owner_kind = 'practice'
                 and r.archived_at is null) then
      raise exception 'recipe changed meanwhile' using errcode = '40001';
    end if;
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_practice_recipe(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_practice_recipe(uuid, jsonb, timestamptz) to authenticated;

comment on function public.save_practice_recipe(uuid, jsonb, timestamptz) is
  'ERN-016 (ADR-027 Punkte 9 und 14): ein Rezept der Praxis anlegen (p_id null) oder ändern - Name, Portionen, Zubereitung, Zutaten aus Katalog und Praxis mit Menge oder Portion; die Werte rechnet der Server. Beim Anlegen optional der Schlüssel eines mitgelieferten Rezepts (ERN-017), je Praxis einmal. Allein app.can_counsel_nutrition; mit p_expected gegen gleichzeitiges Ändern.';

create function public.archive_practice_recipe(p_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.nutrition_recipes r set archived_at = now(), updated_at = now(), updated_by = auth.uid()
  where r.id = p_id and r.organization_id = app.current_organization_id()
    and r.owner_kind = 'practice' and r.archived_at is null;
  if not found then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_practice_recipe(uuid) from public, anon;
grant execute on function public.archive_practice_recipe(uuid) to authenticated;

comment on function public.archive_practice_recipe(uuid) is
  'ERN-016: ein Rezept der Praxis ablegen - es verschwindet aus der Liste und der Auswahl für Pläne, bleibt für bestehende Pläne erhalten. Allein app.can_counsel_nutrition.';
