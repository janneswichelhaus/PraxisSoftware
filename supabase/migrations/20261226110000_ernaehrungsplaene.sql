-- Pläne und Tagesvorschläge der Beratung (ADR-027 Punkte 6 und 14, ANN-845): ein bis sieben Tage
-- mit Rezepten und Lebensmitteln je Mahlzeit, als Vorlage der Praxis oder an einer Beratung. Die
-- Beratung wählt selbst aus, nie aus einer Diagnose; ein Plan wiederholt sich ab seinem Beginn.

create table public.nutrition_plans (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  profile_id      uuid,
  title           text not null check (length(btrim(title)) between 1 and 80),
  day_count       smallint not null check (day_count between 1 and 7),
  starts_on       date,
  ended_on        date,
  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  archived_at     timestamptz,
  constraint nutrition_plans_id_organization unique (id, organization_id),
  -- Ein Ende vor dem Beginn heißt: abgelöst, bevor der Plan galt.
  constraint nutrition_plans_shape check (
    (profile_id is null and starts_on is null and ended_on is null)
    or (profile_id is not null and starts_on is not null and archived_at is null
        and (ended_on is null or ended_on >= starts_on - 1))),
  constraint nutrition_plans_profile_fk foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade
);

create unique index nutrition_plans_open on public.nutrition_plans (profile_id)
  where profile_id is not null and ended_on is null;
create index nutrition_plans_templates on public.nutrition_plans (organization_id)
  where profile_id is null and archived_at is null;

comment on table public.nutrition_plans is
  'ERN-019 (ADR-027 Punkt 14, ANN-845): Pläne der Beratung mit ein bis sieben Tagen - als Vorlage der Praxis (ohne Profil, Inhalt, abgelegt statt gelöscht) oder an einem Ernährungsprofil, ab starts_on im Wechsel der Tage, bis ended_on; je Profil höchstens einer offen. Allein mit app.can_counsel_nutrition geschrieben, nie aus einer Diagnose. Datenklassen: Betriebsdaten bzw. Ernährungsberatung (fällt mit dem Profil). Kein Tabellenrecht und keine Policy (ADR-004).';
comment on column public.nutrition_plans.ended_on is
  'Letzter Tag, an dem der Plan gilt; einen Tag vor starts_on, wenn ein neuer ihn ablöste, bevor er begann.';

create table public.nutrition_plan_items (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  plan_id         uuid not null,
  day_number      smallint not null check (day_number between 1 and 7),
  meal            text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  position        smallint not null check (position between 1 and 12),
  item_kind       text not null check (item_kind in ('recipe', 'catalog', 'practice')),
  recipe_id       uuid references public.nutrition_recipes (id) on delete cascade,
  catalog_food_id uuid references public.food_catalog (id) on delete cascade,
  custom_food_id  uuid references public.custom_foods (id) on delete cascade,
  amount          numeric(6,1) check (amount > 0 and amount <= 5000),
  portion_label   text check (portion_label is null or length(btrim(portion_label)) between 1 and 60),
  portion_count   numeric(4,2) check (portion_count > 0 and portion_count <= 20),
  constraint nutrition_plan_items_ref check (
    (item_kind = 'recipe' and recipe_id is not null and catalog_food_id is null and custom_food_id is null)
    or (item_kind = 'catalog' and catalog_food_id is not null and recipe_id is null and custom_food_id is null)
    or (item_kind = 'practice' and custom_food_id is not null and recipe_id is null
        and catalog_food_id is null)),
  constraint nutrition_plan_items_quantity check (
    (portion_label is null) = (portion_count is null) and (amount is null) <> (portion_count is null)),
  -- Ein Rezept nur in Portionen (ANN-843).
  constraint nutrition_plan_items_recipe_portion check (
    item_kind <> 'recipe' or (portion_count is not null and portion_label = '1 Portion')),
  constraint nutrition_plan_items_plan_fk foreign key (plan_id, organization_id)
    references public.nutrition_plans (id, organization_id) on delete cascade,
  constraint nutrition_plan_items_place unique (plan_id, day_number, meal, position)
);

create index nutrition_plan_items_recipe on public.nutrition_plan_items (recipe_id)
  where recipe_id is not null;
create index nutrition_plan_items_catalog on public.nutrition_plan_items (catalog_food_id)
  where catalog_food_id is not null;
create index nutrition_plan_items_custom on public.nutrition_plan_items (custom_food_id)
  where custom_food_id is not null;

comment on table public.nutrition_plan_items is
  'ERN-019: die Rezepte und Lebensmittel eines Plans je Tag und Mahlzeit mit Portion oder Menge; Rezepte und Lebensmittel nur der Praxis und des Katalogs, nie die einer Person. Datenklasse wie der Plan, fällt mit ihm. Kein Tabellenrecht und keine Policy (ADR-004).';

alter table public.nutrition_plans enable row level security;
alter table public.nutrition_plan_items enable row level security;
revoke all on table public.nutrition_plans, public.nutrition_plan_items
  from public, anon, authenticated, service_role;

insert into public.data_registry (
  table_name, subject_kind, export_mode, export_patient, export_training, export_parent,
  journal_mode, journal_key, journal_class, journal_class_training, journal_daily, journal_rank,
  merge_mode, decision_note
) values
  ('nutrition_plans', 'patient_training', 'nested', '{}', '{}', 'nutrition_profiles', 'via_parent',
   'id', null, null, false, null, 'via_parent',
   'Ein Plan an einer Beratung wird beendet, nicht gelöscht, und fällt mit dem Profil; Vorlagen der Praxis werden abgelegt.'),
  ('nutrition_plan_items', 'patient_training', 'nested', '{}', '{}', 'nutrition_plans', 'via_parent',
   'id', null, null, false, null, 'via_parent',
   'Beim Speichern ersetzt ein Plan seine Positionen; sonst fallen sie mit dem Plan. Ein Restore bringt den früheren Stand zurück wie jede Änderung.');

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('nutrition_plans', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Pläne an einer Beratung (ERN-019): fallen mit dem Ernährungsprofil (ADR-027 Punkt 6).', 266),
  ('nutrition_plans', 'betriebsdaten', 'keine',
   'Planvorlagen der Praxis (ERN-019): Inhalt ohne Personenbezug, abgelegt statt gelöscht.', 267),
  ('nutrition_plan_items', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Positionen eines Plans an einer Beratung (ERN-019): fallen mit dem Plan und dem Profil.', 268),
  ('nutrition_plan_items', 'betriebsdaten', 'keine',
   'Positionen einer Planvorlage (ERN-019): fallen mit der Vorlage.', 269);

-- Ein Lebensmittel oder Rezept eines Plans zum Lesen, auch abgelegt oder zurückgezogen: Der Plan
-- zeigt, was zugewiesen wurde.
create function app.nutrition_plan_food(p_org uuid, p_kind text, p_id uuid) returns jsonb
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
  where p_kind = 'catalog' and b.id = p_id
  union all
  select app.custom_food_json(c) - 'updated_at' - 'barcode'
  from public.custom_foods c
  where p_kind = 'practice' and c.owner_kind = 'practice' and c.id = p_id and c.organization_id = p_org
  union all
  select app.nutrition_recipe_food(r)
  from public.nutrition_recipes r
  where p_kind = 'recipe' and r.owner_kind = 'practice' and r.id = p_id and r.organization_id = p_org
  limit 1
$$;

revoke all on function app.nutrition_plan_food(uuid, text, uuid) from public, anon, authenticated, service_role;

comment on function app.nutrition_plan_food(uuid, text, uuid) is
  'ERN-019: ein Rezept oder Lebensmittel eines Plans zum Lesen - der Praxis oder des Katalogs, auch abgelegt oder zurückgezogen. Ohne Rechteprüfung.';

-- Eine Position mit Namen, Menge, Energie und ihrem Lebensmittel; die Menge einer Portion aus ihm.
create function app.nutrition_plan_item_json(p_item public.nutrition_plan_items) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'kind', p_item.item_kind,
    'id', coalesce(p_item.recipe_id, p_item.catalog_food_id, p_item.custom_food_id),
    'name', x.f ->> 'name',
    'amount', m.menge,
    'portion_label', p_item.portion_label,
    'portion_count', p_item.portion_count,
    'energy_kcal', round((x.f -> 'per_100' ->> 'energy_kcal')::numeric * m.menge / 100),
    'food', x.f)
  from (select app.nutrition_plan_food(p_item.organization_id, p_item.item_kind,
          coalesce(p_item.recipe_id, p_item.catalog_food_id, p_item.custom_food_id)) as f) x
  cross join lateral (
    select coalesce(p_item.amount, (
      select round((p ->> 'amount')::numeric * p_item.portion_count, 1)
      from jsonb_array_elements(x.f -> 'portions') p
      where p ->> 'label' = p_item.portion_label
      limit 1)) as menge
  ) m
$$;

revoke all on function app.nutrition_plan_item_json(public.nutrition_plan_items) from public, anon, authenticated, service_role;

-- Die Mahlzeiten eines Tags im Plan, jede mit ihren Positionen.
create function app.nutrition_plan_meals_json(
  p_plan_id uuid, p_day smallint, p_eintragbar boolean default false
) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
           'meal', m.meal,
           'items', coalesce((
             select jsonb_agg(app.nutrition_plan_item_json(i) order by i.position)
             from public.nutrition_plan_items i
             where i.plan_id = p_plan_id and i.day_number = p_day and i.meal = m.meal
               -- Der Vorschlag trägt nur, was das Tagebuch annimmt: dieselbe Prüfung wie beim Eintragen.
               and (not p_eintragbar
                    or app.nutrition_diary_food(
                         (select pr from public.nutrition_profiles pr
                          join public.nutrition_plans pl on pl.profile_id = pr.id
                          where pl.id = p_plan_id),
                         i.item_kind, coalesce(i.recipe_id, i.catalog_food_id, i.custom_food_id)) is not null)
           ), '[]'::jsonb))
         order by m.nr)
  from unnest(array['breakfast', 'lunch', 'dinner', 'snack']) with ordinality m(meal, nr)
$$;

revoke all on function app.nutrition_plan_meals_json(uuid, smallint, boolean) from public, anon, authenticated, service_role;

create function app.nutrition_plan_json(p_plan public.nutrition_plans) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_plan.id,
    'title', p_plan.title,
    'day_count', p_plan.day_count,
    'starts_on', p_plan.starts_on,
    'ended_on', p_plan.ended_on,
    'updated_at', p_plan.updated_at,
    'days', (
      select jsonb_agg(jsonb_build_object('day', d, 'meals', app.nutrition_plan_meals_json(p_plan.id, d::smallint))
                       order by d)
      from generate_series(1, p_plan.day_count) d),
    'recipes', coalesce((
      select jsonb_agg(app.nutrition_recipe_json(r) order by r.name_key, r.id)
      from public.nutrition_recipes r
      where r.organization_id = p_plan.organization_id and r.owner_kind = 'practice'
        and r.id in (select i.recipe_id from public.nutrition_plan_items i where i.plan_id = p_plan.id)
    ), '[]'::jsonb))
$$;

revoke all on function app.nutrition_plan_json(public.nutrition_plans) from public, anon, authenticated, service_role;

comment on function app.nutrition_plan_json(public.nutrition_plans) is
  'ERN-019: ein Plan mit seinen Tagen, je Mahlzeit die Positionen mit Menge und Energie, dazu die Rezepte darin mit Zutaten und Zubereitung. Ohne Rechteprüfung.';

create function app.nutrition_plans_json(p_profile_id uuid) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select coalesce(jsonb_agg(app.nutrition_plan_json(p) order by p.starts_on desc, p.created_at desc),
                  '[]'::jsonb)
  from public.nutrition_plans p
  where p.profile_id = p_profile_id
$$;

revoke all on function app.nutrition_plans_json(uuid) from public, anon, authenticated, service_role;

-- Die Eingabe eines Plans: Titel und je Tag die Mahlzeiten; Rezepte und Lebensmittel nur der Praxis
-- und des Katalogs, Menge oder Portion wie im Tagebuch. Liefert die Positionen zum Speichern.
create function app.nutrition_plan_input(p_plan jsonb, p_org uuid) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_titel  text := nullif(btrim(p_plan ->> 'title'), '');
  v_tag    jsonb;
  v_nr     integer := 0;
  v_mahl   text;
  v_item   jsonb;
  v_pos    integer;
  v_kind   text;
  v_id     uuid;
  v_essen  jsonb;
  v_menge  record;
  v_aus    jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' or v_titel is null then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_plan) k where k not in ('title', 'days'))
     or jsonb_typeof(p_plan -> 'days') is distinct from 'array'
     or jsonb_array_length(p_plan -> 'days') not between 1 and 7 then
    raise exception 'days between 1 and 7' using errcode = '22023';
  end if;
  for v_tag in select e from jsonb_array_elements(p_plan -> 'days') e loop
    v_nr := v_nr + 1;
    if jsonb_typeof(v_tag) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_tag) k
                  where k not in ('breakfast', 'lunch', 'dinner', 'snack')) then
      raise exception 'unknown field' using errcode = '22023';
    end if;
    foreach v_mahl in array array['breakfast', 'lunch', 'dinner', 'snack'] loop
      if v_tag ? v_mahl and (jsonb_typeof(v_tag -> v_mahl) is distinct from 'array'
                             or jsonb_array_length(v_tag -> v_mahl) > 12) then
        raise exception 'up to 12 per meal' using errcode = '22023';
      end if;
      v_pos := 0;
      for v_item in select e from jsonb_array_elements(coalesce(v_tag -> v_mahl, '[]'::jsonb)) e loop
        v_pos := v_pos + 1;
        if jsonb_typeof(v_item) is distinct from 'object'
           or exists (select 1 from jsonb_object_keys(v_item) k
                      where k not in ('kind', 'id', 'amount', 'portion_label', 'portion_count'))
           or coalesce(v_item ->> 'kind', '') not in ('recipe', 'catalog', 'practice')
           or coalesce(v_item ->> 'id', '')
                !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           or jsonb_typeof(v_item -> 'amount') not in ('null', 'number')
           or jsonb_typeof(v_item -> 'portion_count') not in ('null', 'number')
           or jsonb_typeof(v_item -> 'portion_label') not in ('null', 'string') then
          raise exception 'unknown field' using errcode = '22023';
        end if;
        v_kind := v_item ->> 'kind';
        v_id := (v_item ->> 'id')::uuid;
        if v_kind = 'recipe' then
          -- Auch ein abgelegtes: Pläne und Vorlagen mit ihm bleiben nutzbar; zur Wahl steht es nicht.
          if not exists (select 1 from public.nutrition_recipes r
                         where r.id = v_id and r.organization_id = p_org
                           and r.owner_kind = 'practice') then
            raise exception 'recipe not found' using errcode = 'P0002';
          end if;
          if v_item ->> 'amount' is not null
             or coalesce(v_item ->> 'portion_label', '1 Portion') <> '1 Portion'
             or jsonb_typeof(v_item -> 'portion_count') is distinct from 'number'
             or (v_item ->> 'portion_count')::numeric <= 0
             or (v_item ->> 'portion_count')::numeric > 20 then
            raise exception 'portion or amount' using errcode = '22023';
          end if;
          v_aus := v_aus || jsonb_build_array(jsonb_build_object(
            'day', v_nr, 'meal', v_mahl, 'position', v_pos, 'kind', v_kind, 'id', v_id,
            'amount', null, 'portion_label', '1 Portion',
            'portion_count', round((v_item ->> 'portion_count')::numeric, 2)));
        else
          -- Auch abgelegt oder zurückgezogen, wie bei Rezepten; zur Wahl steht es nicht mehr.
          v_essen := app.nutrition_plan_food(p_org, v_kind, v_id);
          if v_essen is null then
            raise exception 'food not found' using errcode = 'P0002';
          end if;
          select * into v_menge from app.nutrition_diary_amount(
            v_essen, (v_item ->> 'amount')::numeric, v_item ->> 'portion_label',
            (v_item ->> 'portion_count')::numeric);
          v_aus := v_aus || jsonb_build_array(jsonb_build_object(
            'day', v_nr, 'meal', v_mahl, 'position', v_pos, 'kind', v_kind, 'id', v_id,
            'amount', case when v_menge.portion_label is null then v_menge.amount end,
            'portion_label', v_menge.portion_label, 'portion_count', v_menge.portion_count));
        end if;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('title', v_titel, 'day_count', v_nr, 'items', v_aus);
end;
$$;

revoke all on function app.nutrition_plan_input(jsonb, uuid) from public, anon, authenticated, service_role;

comment on function app.nutrition_plan_input(jsonb, uuid) is
  'ERN-019 (ADR-027 Punkt 14): prüft einen Plan - Titel, ein bis sieben Tage, je Mahlzeit bis zwölf Positionen; Rezepte der Praxis in Portionen, Lebensmittel aus Katalog und Praxis mit Menge oder Portion wie im Tagebuch; auch Abgelegtes und Zurückgezogenes, damit Pläne und Vorlagen damit nutzbar bleiben. Liefert Titel, Zahl der Tage und die Positionen. Ohne Rechteprüfung.';

-- Die Positionen eines Plans ersetzen.
create function app.nutrition_plan_store(p_plan_id uuid, p_org uuid, p_items jsonb) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  delete from public.nutrition_plan_items i where i.plan_id = p_plan_id;
  insert into public.nutrition_plan_items (
    organization_id, plan_id, day_number, meal, position, item_kind, recipe_id, catalog_food_id,
    custom_food_id, amount, portion_label, portion_count
  )
  select p_org, p_plan_id, (e ->> 'day')::smallint, e ->> 'meal', (e ->> 'position')::smallint,
         e ->> 'kind',
         case when e ->> 'kind' = 'recipe' then (e ->> 'id')::uuid end,
         case when e ->> 'kind' = 'catalog' then (e ->> 'id')::uuid end,
         case when e ->> 'kind' = 'practice' then (e ->> 'id')::uuid end,
         (e ->> 'amount')::numeric, e ->> 'portion_label', (e ->> 'portion_count')::numeric
  from jsonb_array_elements(p_items) e;
end;
$$;

revoke all on function app.nutrition_plan_store(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

create function public.list_nutrition_plan_templates() returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Nach dem Titel und nach nichts sonst (ADR-006 Punkt 10 sinngemäß).
  return coalesce((
    select jsonb_agg(app.nutrition_plan_json(p) order by lower(p.title), p.id)
    from public.nutrition_plans p
    where p.organization_id = app.current_organization_id()
      and p.profile_id is null and p.archived_at is null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_nutrition_plan_templates() from public, anon;
grant execute on function public.list_nutrition_plan_templates() to authenticated;

comment on function public.list_nutrition_plan_templates() is
  'ERN-019: die Planvorlagen der Praxis (nicht abgelegt), nach Titel - allein app.can_counsel_nutrition.';

create function public.save_nutrition_plan_template(p_id uuid, p_plan jsonb, p_expected timestamptz default null)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_p     jsonb;
  v_id    uuid;
begin
  if v_actor is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  v_p := app.nutrition_plan_input(p_plan, v_org);
  if p_id is null then
    insert into public.nutrition_plans (organization_id, title, day_count, created_by, updated_by)
    values (v_org, v_p ->> 'title', (v_p ->> 'day_count')::smallint, v_actor, v_actor)
    returning id into v_id;
  else
    update public.nutrition_plans p set
      title = v_p ->> 'title', day_count = (v_p ->> 'day_count')::smallint,
      updated_at = now(), updated_by = v_actor
    where p.id = p_id and p.organization_id = v_org and p.profile_id is null
      and p.archived_at is null and (p_expected is null or p.updated_at = p_expected)
    returning p.id into v_id;
    if v_id is null then
      if exists (select 1 from public.nutrition_plans p
                 where p.id = p_id and p.organization_id = v_org and p.profile_id is null
                   and p.archived_at is null) then
        raise exception 'plan changed meanwhile' using errcode = '40001';
      end if;
      raise exception 'plan not found' using errcode = 'P0002';
    end if;
  end if;
  perform app.nutrition_plan_store(v_id, v_org, v_p -> 'items');
  return v_id;
end;
$$;

revoke all on function public.save_nutrition_plan_template(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_nutrition_plan_template(uuid, jsonb, timestamptz) to authenticated;

comment on function public.save_nutrition_plan_template(uuid, jsonb, timestamptz) is
  'ERN-019 (ADR-027 Punkt 14): eine Planvorlage der Praxis anlegen (p_id null) oder ändern - Titel und ein bis sieben Tage mit Rezepten und Lebensmitteln je Mahlzeit. Allein app.can_counsel_nutrition; mit p_expected gegen gleichzeitiges Ändern.';

create function public.archive_nutrition_plan_template(p_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.nutrition_plans p set archived_at = now(), updated_at = now(), updated_by = auth.uid()
  where p.id = p_id and p.organization_id = app.current_organization_id()
    and p.profile_id is null and p.archived_at is null;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_nutrition_plan_template(uuid) from public, anon;
grant execute on function public.archive_nutrition_plan_template(uuid) to authenticated;

comment on function public.archive_nutrition_plan_template(uuid) is
  'ERN-019: eine Planvorlage ablegen - sie verschwindet aus der Auswahl; zugewiesene Pläne sind Kopien und bleiben. Allein app.can_counsel_nutrition.';

create function public.assign_nutrition_plan(p_profile_id uuid, p_plan jsonb, p_starts_on date)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_p      jsonb;
  v_heute  date;
  v_id     uuid;
begin
  -- Allein die Beratung, an der laufenden Beratung, mit Einwilligung.
  v_profil := app.nutrition_profile_for_writing(p_profile_id, true);
  v_heute := app.training_today(v_profil.organization_id);
  if p_starts_on is null or p_starts_on < v_heute or p_starts_on > v_heute + 90 then
    raise exception 'start outside the next 90 days' using errcode = '22023';
  end if;
  v_p := app.nutrition_plan_input(p_plan, v_profil.organization_id);

  -- Jeder Plan, der am Beginn des neuen noch gälte, endet am Tag davor: Pläne überschneiden sich nie.
  update public.nutrition_plans p
     set ended_on = greatest(p_starts_on - 1, p.starts_on - 1), updated_at = now(),
         updated_by = auth.uid()
   where p.profile_id = v_profil.id
     and (p.ended_on is null or p.ended_on >= greatest(p_starts_on, p.starts_on));

  insert into public.nutrition_plans (
    organization_id, profile_id, title, day_count, starts_on, created_by, updated_by
  )
  values (
    v_profil.organization_id, v_profil.id, v_p ->> 'title', (v_p ->> 'day_count')::smallint,
    p_starts_on, auth.uid(), auth.uid()
  )
  returning id into v_id;
  perform app.nutrition_plan_store(v_id, v_profil.organization_id, v_p -> 'items');
  return v_id;
end;
$$;

revoke all on function public.assign_nutrition_plan(uuid, jsonb, date) from public, anon;
grant execute on function public.assign_nutrition_plan(uuid, jsonb, date) to authenticated;

comment on function public.assign_nutrition_plan(uuid, jsonb, date) is
  'ERN-019 (ADR-027 Punkt 14, ANN-845): einen Plan oder Tagesvorschlag an einer laufenden Beratung zuweisen - als Kopie einer Vorlage oder neu, ab heute oder einem Tag der nächsten 90; jeder Plan, der dann noch gälte, endet am Tag davor. Allein app.can_counsel_nutrition, nur mit Einwilligung; die Auswahl trifft die Beratung, nie eine Diagnose.';

-- Das Profil eines zugewiesenen Plans der eigenen Organisation; ohne ihn P0002.
create function app.nutrition_plan_profile(p_plan_id uuid) returns uuid
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select p.profile_id into v_profil from public.nutrition_plans p
  where p.id = p_plan_id and p.organization_id = app.current_organization_id()
    and p.profile_id is not null;
  if v_profil is null then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  return v_profil;
end;
$$;

revoke all on function app.nutrition_plan_profile(uuid) from public, anon, authenticated, service_role;

comment on function app.nutrition_plan_profile(uuid) is
  'ERN-019: das Profil eines zugewiesenen Plans der eigenen Organisation, damit Ändern und Beenden wie das Zuweisen erst das Profil und dann den Plan sperren; ohne ihn P0002. Ohne Rechteprüfung.';

create function public.update_nutrition_plan(p_plan_id uuid, p_plan jsonb, p_expected timestamptz default null)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_plan   public.nutrition_plans%rowtype;
  v_profil public.nutrition_profiles%rowtype;
  v_p      jsonb;
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Erst das Profil sperren, dann den Plan, wie beim Zuweisen: sonst warten beide aufeinander.
  v_profil := app.nutrition_profile_for_writing(app.nutrition_plan_profile(p_plan_id), true);
  select * into v_plan from public.nutrition_plans p
  where p.id = p_plan_id and p.profile_id = v_profil.id
  for update;
  if v_plan.ended_on is not null then
    raise exception 'plan has ended' using errcode = '22023';
  end if;
  if p_expected is not null and v_plan.updated_at <> p_expected then
    raise exception 'plan changed meanwhile' using errcode = '40001';
  end if;
  v_p := app.nutrition_plan_input(p_plan, v_profil.organization_id);
  update public.nutrition_plans p set
    title = v_p ->> 'title', day_count = (v_p ->> 'day_count')::smallint,
    updated_at = now(), updated_by = auth.uid()
  where p.id = v_plan.id;
  perform app.nutrition_plan_store(v_plan.id, v_profil.organization_id, v_p -> 'items');
  return v_plan.id;
end;
$$;

revoke all on function public.update_nutrition_plan(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.update_nutrition_plan(uuid, jsonb, timestamptz) to authenticated;

comment on function public.update_nutrition_plan(uuid, jsonb, timestamptz) is
  'ERN-019: den offenen Plan einer laufenden Beratung ändern - Titel, Tage, Positionen; der Beginn bleibt. Allein app.can_counsel_nutrition, nur mit Einwilligung; mit p_expected gegen gleichzeitiges Ändern.';

create function public.end_nutrition_plan(p_plan_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_heute  date;
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Beenden geht auch nach einem Widerruf: Es hält die Verarbeitung an. Profil vor Plan sperren.
  v_profil := app.nutrition_profile_for_writing(app.nutrition_plan_profile(p_plan_id), false);
  v_heute := app.training_today(v_profil.organization_id);
  if not exists (select 1 from public.nutrition_plans p
                 where p.id = p_plan_id and p.profile_id = v_profil.id
                   and (p.ended_on is null or p.ended_on >= greatest(v_heute, p.starts_on))) then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  -- Ab heute kein Vorschlag: Auch ein laufender Plan, dem schon ein späterer folgt, endet gestern.
  update public.nutrition_plans p
     set ended_on = greatest(v_heute - 1, p.starts_on - 1), updated_at = now(), updated_by = auth.uid()
   where p.profile_id = v_profil.id
     and (p.ended_on is null or p.ended_on >= greatest(v_heute, p.starts_on));
end;
$$;

revoke all on function public.end_nutrition_plan(uuid) from public, anon;
grant execute on function public.end_nutrition_plan(uuid) to authenticated;

comment on function public.end_nutrition_plan(uuid) is
  'ERN-019: den Plan einer laufenden Beratung beenden - ab heute steht kein Vorschlag mehr im Tagebuch, auch nicht aus einem laufenden Plan, dem ein späterer folgt; die Pläne bleiben mit dem Profil. Allein app.can_counsel_nutrition, auch nach einem Widerruf.';

-- Der Plan eines Tags fürs Tagebuch: der zuletzt begonnene, der an diesem Tag gilt, und sein Tag im
-- Wechsel ab dem Beginn.
create function app.nutrition_plan_day_json(p_profile_id uuid, p_day date) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  select jsonb_build_object(
    'plan_id', p.id, 'title', p.title, 'day_count', p.day_count,
    'day', ((p_day - p.starts_on) % p.day_count) + 1,
    'meals', app.nutrition_plan_meals_json(p.id, (((p_day - p.starts_on) % p.day_count) + 1)::smallint, true))
  from public.nutrition_plans p
  where p.profile_id = p_profile_id and p.starts_on <= p_day
    and (p.ended_on is null or p.ended_on >= p_day)
  order by p.starts_on desc, p.created_at desc
  limit 1
$$;

revoke all on function app.nutrition_plan_day_json(uuid, date) from public, anon, authenticated, service_role;

comment on function app.nutrition_plan_day_json(uuid, date) is
  'ERN-020 (ANN-845): der Vorschlag eines Plans für einen Tag - der zuletzt begonnene Plan, der an diesem Tag gilt, sein Tag im Wechsel ab dem Beginn, je Mahlzeit die Positionen, die sich eintragen lassen. Ohne Rechteprüfung.';

-- Wie zuvor; dazu die Rezepte der Praxis aus einem Plan, der heute oder später gilt (ADR-027 Punkt 14).
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
     where p_kind = 'recipe' and r.id = p_id and r.organization_id = p_profile.organization_id
       and ((r.owner_kind = 'person' and r.profile_id = p_profile.id)
            or (r.owner_kind = 'practice' and exists (
                  select 1
                  from public.nutrition_plan_items i
                  join public.nutrition_plans p on p.id = i.plan_id
                  where i.recipe_id = r.id and p.profile_id = p_profile.id
                    and (p.ended_on is null
                         or p.ended_on >= greatest(app.training_today(p_profile.organization_id),
                                                   p.starts_on)))))))
$$;

comment on function app.nutrition_diary_food(public.nutrition_profiles, text, uuid) is
  'ERN-007/ERN-018/ERN-020: ein Lebensmittel, wie es die Person an ihrem Profil findet - Katalog (nicht zurückgezogen), Praxis (nicht abgelegt), eigene Lebensmittel und Rezepte, Rezepte der Praxis nur aus einem ihr zugewiesenen Plan, der heute oder später gilt (ANN-845). Ohne Rechteprüfung.';

-- Profil, Plattform, Auskunft und Export tragen die Pläne mit.
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
    'own_recipes', app.nutrition_own_recipes_json(p.id),
    'plans', app.nutrition_plans_json(p.id)
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
      from jsonb_array_elements(coalesce(j -> 'own_recipes', '[]'::jsonb)) r),
    'plans', coalesce(j -> 'plans', '[]'::jsonb)
  )
  -- Das Tagebuch nur, wo es mitkommt (Export), ohne wer eingetragen hat.
  || case when j ? 'diary' then jsonb_build_object('diary', app.nutrition_diary_platform_shape(j -> 'diary'))
          else '{}'::jsonb end
  where j is not null
$$;

create or replace function public.platform_nutrition_diary(p_access_id uuid, p_day date default null)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_profil  public.nutrition_profiles%rowtype;
  v_heute   date;
  v_tag     date;
  v_ziele   jsonb;
begin
  if not app.platform_access_allows(p_access_id, 'nutrition') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_profil := app.platform_nutrition_profile(p_access_id);
  if v_profil.id is null then
    return jsonb_build_object('diary', null);
  end if;
  v_heute := app.training_today(v_zugang.organization_id);
  v_tag := coalesce(p_day, v_heute);
  if v_tag > v_heute or v_tag < v_profil.started_on then
    raise exception 'day outside the counselling' using errcode = '22023';
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );

  v_ziele := app.nutrition_profile_targets(v_profil.id);
  return jsonb_build_object(
    'today', v_heute,
    'started_on', v_profil.started_on,
    'enabled', v_profil.diary_enabled,
    'can_write', v_profil.diary_enabled and app.platform_access_writable(p_access_id)
                 and app.nutrition_consent_granted(v_profil.id),
    'can_delete', app.platform_access_writable(p_access_id),
    'glass_ml', app.nutrition_diary_rule('glass_ml'),
    -- Die Einstellung der Person, zuletzt und Favoriten.
    'hide_numbers', v_profil.diary_hide_numbers,
    'recent', app.nutrition_diary_recent(v_profil),
    'favorites', app.nutrition_diary_favorites_json(v_profil),
    'targets', case when v_ziele ->> 'status' = 'ok' then jsonb_build_object(
      'energy_kcal', v_ziele -> 'energy' -> 'kcal',
      'protein_g', v_ziele -> 'protein' -> 'g',
      'fat_g', v_ziele -> 'fat' -> 'g',
      'carbohydrate_g', v_ziele -> 'carbohydrate' -> 'g',
      'water_ml', v_ziele -> 'water' -> 'ml') end,
    'day', app.nutrition_diary_day_json(v_profil.id, v_tag, false),
    -- Der Vorschlag des Plans für diesen Tag, wenn einer gilt (ANN-845).
    'suggestions', app.nutrition_plan_day_json(v_profil.id, v_tag)
  );
end;
$$;

comment on function public.platform_nutrition_diary(uuid, date) is
  'ERN-007 (ADR-027 Punkte 10 und 11): ein Tag des eigenen Ernährungstagebuchs - Mahlzeiten mit Einträgen und Summen, Wasser, die geltenden Zielwerte für "noch übrig"; ERN-020: der Vorschlag des Plans für diesen Tag (ANN-845). Recht nutrition (Person, rechtliche Vertretung; nie die Begleitung), nur an der laufenden Beratung dieses Zugangs; der Tag zwischen Beginn und heute (22023). Über eine Vertretung protokolliert. Ohne Recht null; ohne laufendes Profil diary null.';
