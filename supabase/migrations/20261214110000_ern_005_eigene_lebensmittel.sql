-- =============================================================================
-- ERN-005 (ERN-EPIC-002): Eigene Lebensmittel der Praxis und der Person
--
-- ADR-027 Punkte 6 und 9, ADR-023 Punkte 13, 19, 22 bis 24, ADR-008
-- Fassung 6. Pfad A (ADR-013 Punkt 9: neue Tabelle, RLS, Plattformpfade,
-- Datenklasse, Auskunft und Export).
--
--   public.custom_foods            eigene Lebensmittel - der Praxis (Inhalt)
--                                  oder einer Person an ihrem Profil
--   app.food_search                + Lebensmittel der Praxis
--   public.list_practice_foods, save_practice_food, archive_practice_food
--                                  die Beratung pflegt die der Praxis
--   public.save_platform_food, delete_platform_food
--                                  die Person pflegt ihre eigenen
--   app.nutrition_profile_json     + own_foods (Beratung, Auskunft Art. 15)
--   app.nutrition_platform_json    + own_foods (Plattform, Export Art. 20)
--
-- WER (ADR-027 Punkte 3, 4 und 9): Lebensmittel der Praxis legt allein die
-- Fähigkeit "Ernährungsberatung" an; sie sind Inhalt ohne Personenbezug und
-- erscheinen in jeder Suche der Organisation. Eigene Lebensmittel der Person
-- legen die Person und ihre rechtliche Vertretung an - nur mit Einwilligung
-- und laufender Beratung, nie die Begleitung; lesen kann sie außer ihr allein
-- die Beratung (im Profil). Büro, Therapie, Teamleitung, Trainingsbetreuung
-- nicht.
--
-- NÄHRWERTE (Punkt 9): Von Hand nur hier - "von der Verpackung", je 100 g
-- bzw. 100 ml, mit denselben Grenzen wie der Katalog.
--
-- PROTOKOLL (ADR-010 Fassung 3): keine neue Aktion. Schreiben weist das
-- Datenmodell nach (created_by, updated_by, platform_access_kind); gelesen
-- wird im Profil, das schon als Öffnen bzw. platform_representation.read
-- steht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabelle
-- -----------------------------------------------------------------------------
create table public.custom_foods (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  -- practice: Inhalt der Praxis; person: an genau einem Ernährungsprofil.
  owner_kind           text not null check (owner_kind in ('practice', 'person')),
  profile_id           uuid,
  name                 text not null check (length(btrim(name)) between 1 and 120),
  brand                text check (brand is null or length(btrim(brand)) between 1 and 80),
  base_unit            text not null default 'g' check (base_unit in ('g', 'ml')),
  energy_kcal          numeric(5, 1) not null check (energy_kcal between 0 and 950),
  protein_g            numeric(5, 2) not null check (protein_g between 0 and 100),
  fat_g                numeric(5, 2) not null check (fat_g between 0 and 100),
  carbohydrate_g       numeric(5, 2) not null check (carbohydrate_g between 0 and 100),
  sugar_g              numeric(5, 2) check (sugar_g is null or sugar_g between 0 and 100),
  fibre_g              numeric(5, 2) check (fibre_g is null or fibre_g between 0 and 100),
  saturated_fat_g      numeric(5, 2) check (saturated_fat_g is null or saturated_fat_g between 0 and 100),
  salt_g               numeric(6, 3) check (salt_g is null or salt_g between 0 and 100),
  portions             jsonb not null default '[]'::jsonb check (app.food_portions_valid(portions)),
  name_key             text generated always as (app.food_search_key(name)) stored,
  search_key           text generated always as
                         (app.food_search_key(name || coalesce(' ' || brand, ''))) stored,
  -- Wer auf der Plattform angelegt hat - die Person oder ihre rechtliche
  -- Vertretung; ohne Kennung des Zugangs in den Projektionen.
  platform_access_id   uuid,
  platform_access_kind text check (platform_access_kind in ('self', 'legal_representative')),
  created_at           timestamptz not null default now(),
  created_by           uuid not null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  -- Nur die Praxis legt ab statt zu löschen: spätere Tagebucheinträge
  -- verweisen auf ihre Lebensmittel (ERN-EPIC-003).
  archived_at          timestamptz,

  constraint custom_foods_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade,
  constraint custom_foods_owner_shape check (
    (owner_kind = 'practice' and profile_id is null and platform_access_id is null
       and platform_access_kind is null)
    or (owner_kind = 'person' and profile_id is not null and archived_at is null
       and (platform_access_id is null) = (platform_access_kind is null))
  ),
  constraint custom_foods_macros_fit check (protein_g + fat_g + carbohydrate_g <= 105)
);

comment on table public.custom_foods is
  'ERN-005 (ADR-027 Punkt 9): eigene Lebensmittel mit Nährwerten von der Verpackung - der Praxis (Inhalt, von der Beratung gepflegt, in jeder Suche der Organisation) oder einer Person an ihrem Ernährungsprofil (von ihr oder ihrer rechtlichen Vertretung, nur mit Einwilligung). Datenklassen: Betriebsdaten bzw. Ernährungsberatung (fällt mit dem Profil). Kein Tabellenrecht zum Schreiben; lesen nur mit der Fähigkeit.';

create index custom_foods_practice_trgm
  on public.custom_foods using gin (search_key extensions.gin_trgm_ops)
  where owner_kind = 'practice' and archived_at is null;
create index custom_foods_profile_idx on public.custom_foods (profile_id, name_key)
  where profile_id is not null;
create index custom_foods_organization_idx on public.custom_foods (organization_id);

revoke all on public.custom_foods from public, anon, authenticated;
alter table public.custom_foods enable row level security;
grant select on public.custom_foods to authenticated;
-- Die zweite Linie (ADR-004 Punkt 5): lesen allein die Fähigkeit.
create policy custom_foods_select_counsel
  on public.custom_foods for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('custom_foods', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Eigene Lebensmittel der Person (ERN-005, owner_kind person): fallen mit ihrem Ernährungsprofil (ADR-027 Punkt 6).',
   246),
  ('custom_foods', 'betriebsdaten', 'keine',
   'Lebensmittel der Praxis (ERN-005, owner_kind practice): Inhalt ohne Personenbezug, abgelegt statt gelöscht.',
   247);

-- -----------------------------------------------------------------------------
-- 2. Eingaben prüfen (eine Stelle für Praxis und Plattform)
-- -----------------------------------------------------------------------------
create function app.custom_food_input(p_food jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_food ->> 'name'), '');
begin
  if jsonb_typeof(p_food) is distinct from 'object' or v_name is null then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_food) k
    where k not in ('name', 'brand', 'base_unit', 'energy_kcal', 'protein_g', 'fat_g',
                    'carbohydrate_g', 'sugar_g', 'fibre_g', 'saturated_fat_g', 'salt_g',
                    'portions')) then
    raise exception 'unknown field' using errcode = '22023';
  end if;
  if (p_food ->> 'energy_kcal') is null or (p_food ->> 'protein_g') is null
     or (p_food ->> 'fat_g') is null or (p_food ->> 'carbohydrate_g') is null then
    raise exception 'energy and macros are required' using errcode = '22023';
  end if;
  return p_food;
end;
$$;

revoke all on function app.custom_food_input(jsonb) from public, anon, authenticated;

-- Das Lebensmittel als Treffer bzw. Listeneintrag; dieselbe Form wie der Katalog.
create function app.custom_food_json(p_food public.custom_foods)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', p_food.owner_kind,
    'id', p_food.id,
    'source', p_food.owner_kind,
    'source_code', null,
    'name', p_food.name,
    'brand', p_food.brand,
    'base_unit', p_food.base_unit,
    'per_100', jsonb_build_object(
      'energy_kcal', p_food.energy_kcal, 'protein_g', p_food.protein_g, 'fat_g', p_food.fat_g,
      'carbohydrate_g', p_food.carbohydrate_g, 'sugar_g', p_food.sugar_g,
      'fibre_g', p_food.fibre_g, 'saturated_fat_g', p_food.saturated_fat_g,
      'salt_g', p_food.salt_g),
    'portions', p_food.portions,
    'updated_at', p_food.updated_at
  )
$$;

revoke all on function app.custom_food_json(public.custom_foods) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Suche (ANN-658): + Lebensmittel der Praxis, gewichtet wie allgemeine
-- -----------------------------------------------------------------------------
create or replace function app.food_search(p_org uuid, p_query text, p_limit integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q        text := app.food_search_key(p_query);
  v_woerter  text[];
  v_laengstes text;
  v_limit    integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  v_q := left(v_q, 100);
  v_woerter := (select array_agg(w) from unnest(string_to_array(v_q, ' ')) w where length(w) >= 2);
  if v_woerter is null then
    return '[]'::jsonb;
  end if;
  select w into v_laengstes from unnest(v_woerter) w order by length(w) desc, w limit 1;

  return coalesce((
    select jsonb_agg(t.eintrag order by t.rang desc, t.laenge, t.name)
    from (
      select
        c.eintrag,
        (case
           when c.name_key = v_q then 4
           when c.name_key like v_q || ' %' then 3
           when c.name_key like v_q || '%' then 2
           when ' ' || c.name_key || ' ' like '% ' || v_q || ' %' then 1.5
           else 0
         end
         -- Allgemeines (BLS) und die Lebensmittel der Praxis vor Marken.
         + case when c.allgemein then 2.5 else 0 end
         + extensions.word_similarity(v_q, c.search_key)) as rang,
        length(c.name_key) as laenge,
        c.name
      from (
        select b.name, b.name_key, b.search_key, true as allgemein,
               jsonb_build_object(
                 'kind', 'catalog', 'id', b.id, 'source', b.source,
                 'source_code', b.source_code, 'name', b.name, 'brand', b.brand,
                 'base_unit', b.base_unit,
                 'per_100', jsonb_build_object(
                   'energy_kcal', b.energy_kcal, 'protein_g', b.protein_g, 'fat_g', b.fat_g,
                   'carbohydrate_g', b.carbohydrate_g, 'sugar_g', b.sugar_g,
                   'fibre_g', b.fibre_g, 'saturated_fat_g', b.saturated_fat_g,
                   'salt_g', b.salt_g),
                 'portions', b.portions) as eintrag
        from public.food_catalog b
        where b.retired_at is null and b.source = 'bls'
          and (b.search_key like '%' || v_laengstes || '%'
               or v_laengstes operator(extensions.<%) b.search_key)
        union all
        select p.name, p.name_key, p.search_key, true, app.custom_food_json(p) - 'updated_at'
        from public.custom_foods p
        where p.organization_id = p_org and p.owner_kind = 'practice' and p.archived_at is null
          and (p.search_key like '%' || v_laengstes || '%'
               or v_laengstes operator(extensions.<%) p.search_key)
        union all
        -- Marken: die 300 nächsten Nachbarn, danach dieselben Regeln.
        select m.name, m.name_key, m.search_key, false,
               jsonb_build_object(
                 'kind', 'catalog', 'id', m.id, 'source', m.source,
                 'source_code', m.source_code, 'name', m.name, 'brand', m.brand,
                 'base_unit', m.base_unit,
                 'per_100', jsonb_build_object(
                   'energy_kcal', m.energy_kcal, 'protein_g', m.protein_g, 'fat_g', m.fat_g,
                   'carbohydrate_g', m.carbohydrate_g, 'sugar_g', m.sugar_g,
                   'fibre_g', m.fibre_g, 'saturated_fat_g', m.saturated_fat_g,
                   'salt_g', m.salt_g),
                 'portions', m.portions)
        from (
          select o.*
          from public.food_catalog o
          where o.retired_at is null and o.source = 'off'
          order by v_q operator(extensions.<<->) o.search_key
          limit 300
        ) m
      ) c
      where not exists (
          select 1 from unnest(v_woerter) w
          where not (c.search_key like '%' || w || '%'
                     or w operator(extensions.<%) c.search_key))
      order by rang desc, laenge, c.name
      limit v_limit
    ) t
  ), '[]'::jsonb);
end;
$$;

comment on function app.food_search(uuid, text, integer) is
  'ERN-004/ERN-005 (ANN-658): Kandidaten und Rangfolge der Lebensmittelsuche an einer Stelle - BLS, die Lebensmittel der Praxis dieser Organisation und Marken (300 nächste Nachbarn); jedes Wort enthalten oder per Trigramm ähnlich; Name gleich, beginnt als Wort, beginnt, enthält als Wort; Allgemeines und Praxis vor Marken; Ähnlichkeit; kürzere Namen zuerst. Eigene Lebensmittel der Person nicht: die kennt sie aus ihrem Profil. Ohne Rechteprüfung.';

-- -----------------------------------------------------------------------------
-- 4. Lebensmittel der Praxis (die Beratung)
-- -----------------------------------------------------------------------------
create function public.list_practice_foods()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(app.custom_food_json(p) order by p.name_key, p.id)
    from public.custom_foods p
    where p.organization_id = app.current_organization_id()
      and p.owner_kind = 'practice' and p.archived_at is null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_practice_foods() from public, anon;
grant execute on function public.list_practice_foods() to authenticated;

comment on function public.list_practice_foods() is
  'ERN-005: die Lebensmittel der Praxis (nicht abgelegt) - allein app.can_counsel_nutrition.';

create function public.save_practice_food(p_id uuid, p_food jsonb, p_expected timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_f     jsonb;
  v_id    uuid;
begin
  if v_actor is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  v_f := app.custom_food_input(p_food);

  if p_id is null then
    insert into public.custom_foods (
      organization_id, owner_kind, name, brand, base_unit, energy_kcal, protein_g, fat_g,
      carbohydrate_g, sugar_g, fibre_g, saturated_fat_g, salt_g, portions, created_by, updated_by
    )
    values (
      v_org, 'practice', btrim(v_f ->> 'name'), nullif(btrim(v_f ->> 'brand'), ''),
      coalesce(v_f ->> 'base_unit', 'g'), (v_f ->> 'energy_kcal')::numeric,
      (v_f ->> 'protein_g')::numeric, (v_f ->> 'fat_g')::numeric,
      (v_f ->> 'carbohydrate_g')::numeric, (v_f ->> 'sugar_g')::numeric,
      (v_f ->> 'fibre_g')::numeric, (v_f ->> 'saturated_fat_g')::numeric,
      (v_f ->> 'salt_g')::numeric, coalesce(v_f -> 'portions', '[]'::jsonb), v_actor, v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.custom_foods p set
    name = btrim(v_f ->> 'name'), brand = nullif(btrim(v_f ->> 'brand'), ''),
    base_unit = coalesce(v_f ->> 'base_unit', 'g'),
    energy_kcal = (v_f ->> 'energy_kcal')::numeric, protein_g = (v_f ->> 'protein_g')::numeric,
    fat_g = (v_f ->> 'fat_g')::numeric, carbohydrate_g = (v_f ->> 'carbohydrate_g')::numeric,
    sugar_g = (v_f ->> 'sugar_g')::numeric, fibre_g = (v_f ->> 'fibre_g')::numeric,
    saturated_fat_g = (v_f ->> 'saturated_fat_g')::numeric,
    salt_g = (v_f ->> 'salt_g')::numeric, portions = coalesce(v_f -> 'portions', '[]'::jsonb),
    updated_at = now(), updated_by = v_actor
  where p.id = p_id and p.organization_id = v_org and p.owner_kind = 'practice'
    and p.archived_at is null
    and (p_expected is null or p.updated_at = p_expected)
  returning p.id into v_id;
  if v_id is null then
    if exists (select 1 from public.custom_foods p
               where p.id = p_id and p.organization_id = v_org and p.owner_kind = 'practice'
                 and p.archived_at is null) then
      raise exception 'food changed meanwhile' using errcode = '40001';
    end if;
    raise exception 'food not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_practice_food(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_practice_food(uuid, jsonb, timestamptz) to authenticated;

comment on function public.save_practice_food(uuid, jsonb, timestamptz) is
  'ERN-005 (ADR-027 Punkt 9): ein Lebensmittel der Praxis anlegen (p_id null) oder ändern - Nährwerte von der Verpackung je 100 g bzw. ml, Portionen. Allein app.can_counsel_nutrition; mit p_expected gegen gleichzeitiges Ändern.';

create function public.archive_practice_food(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.custom_foods p set archived_at = now(), updated_at = now(), updated_by = auth.uid()
  where p.id = p_id and p.organization_id = app.current_organization_id()
    and p.owner_kind = 'practice' and p.archived_at is null;
  if not found then
    raise exception 'food not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.archive_practice_food(uuid) from public, anon;
grant execute on function public.archive_practice_food(uuid) to authenticated;

comment on function public.archive_practice_food(uuid) is
  'ERN-005: ein Lebensmittel der Praxis ablegen - es verschwindet aus Suche und Liste, bleibt für spätere Verweise erhalten. Allein app.can_counsel_nutrition.';

-- -----------------------------------------------------------------------------
-- 5. Eigene Lebensmittel der Person (Plattform)
-- -----------------------------------------------------------------------------
create function public.save_platform_food(p_access_id uuid, p_id uuid, p_food jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_zugang public.platform_accesses%rowtype;
  v_f      jsonb;
  v_id     uuid;
begin
  -- Recht nutrition, Lesefrist, laufende Beratung, Einwilligung.
  v_profil := app.platform_nutrition_for_writing(p_access_id, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_f := app.custom_food_input(p_food);

  if p_id is null then
    -- Eine Grenze gegen Massenanlage: 500 eigene je Profil.
    if (select count(*) from public.custom_foods p where p.profile_id = v_profil.id) >= 500 then
      raise exception 'too many own foods' using errcode = '54000';
    end if;
    insert into public.custom_foods (
      organization_id, owner_kind, profile_id, name, brand, base_unit, energy_kcal, protein_g,
      fat_g, carbohydrate_g, sugar_g, fibre_g, saturated_fat_g, salt_g, portions,
      platform_access_id, platform_access_kind, created_by, updated_by
    )
    values (
      v_profil.organization_id, 'person', v_profil.id, btrim(v_f ->> 'name'),
      nullif(btrim(v_f ->> 'brand'), ''), coalesce(v_f ->> 'base_unit', 'g'),
      (v_f ->> 'energy_kcal')::numeric, (v_f ->> 'protein_g')::numeric,
      (v_f ->> 'fat_g')::numeric, (v_f ->> 'carbohydrate_g')::numeric,
      (v_f ->> 'sugar_g')::numeric, (v_f ->> 'fibre_g')::numeric,
      (v_f ->> 'saturated_fat_g')::numeric, (v_f ->> 'salt_g')::numeric,
      coalesce(v_f -> 'portions', '[]'::jsonb), v_zugang.id, v_zugang.access_kind,
      auth.uid(), auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.custom_foods p set
    name = btrim(v_f ->> 'name'), brand = nullif(btrim(v_f ->> 'brand'), ''),
    base_unit = coalesce(v_f ->> 'base_unit', 'g'),
    energy_kcal = (v_f ->> 'energy_kcal')::numeric, protein_g = (v_f ->> 'protein_g')::numeric,
    fat_g = (v_f ->> 'fat_g')::numeric, carbohydrate_g = (v_f ->> 'carbohydrate_g')::numeric,
    sugar_g = (v_f ->> 'sugar_g')::numeric, fibre_g = (v_f ->> 'fibre_g')::numeric,
    saturated_fat_g = (v_f ->> 'saturated_fat_g')::numeric,
    salt_g = (v_f ->> 'salt_g')::numeric, portions = coalesce(v_f -> 'portions', '[]'::jsonb),
    platform_access_id = v_zugang.id, platform_access_kind = v_zugang.access_kind,
    updated_at = now(), updated_by = auth.uid()
  where p.id = p_id and p.profile_id = v_profil.id and p.owner_kind = 'person'
  returning p.id into v_id;
  if v_id is null then
    raise exception 'food not found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_platform_food(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_platform_food(uuid, uuid, jsonb) to authenticated;

comment on function public.save_platform_food(uuid, uuid, jsonb) is
  'ERN-005 (ADR-027 Punkt 9): ein eigenes Lebensmittel anlegen (p_id null) oder ändern - die Person oder ihre rechtliche Vertretung, mit Einwilligung, an der laufenden Beratung dieses Zugangs; nie die Begleitung. Höchstens 500 je Profil. Wer, steht am Datensatz.';

create function public.delete_platform_food(p_access_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  -- Löschen braucht keine Einwilligung: wer widerrufen hat, räumt trotzdem auf.
  v_profil := app.platform_nutrition_for_writing(p_access_id, false);
  delete from public.custom_foods p
  where p.id = p_id and p.profile_id = v_profil.id and p.owner_kind = 'person';
  if not found then
    raise exception 'food not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_platform_food(uuid, uuid) from public, anon;
grant execute on function public.delete_platform_food(uuid, uuid) to authenticated;

comment on function public.delete_platform_food(uuid, uuid) is
  'ERN-005: ein eigenes Lebensmittel löschen - die Person oder ihre rechtliche Vertretung, an der laufenden Beratung dieses Zugangs, auch nach einem Widerruf; nie die Begleitung.';

-- -----------------------------------------------------------------------------
-- 6. Im Profil: Beratung und Auskunft (Art. 15), Plattform und Export (Art. 20)
-- -----------------------------------------------------------------------------
create function app.nutrition_own_foods_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    (app.custom_food_json(p) - 'kind' - 'source' - 'source_code')
      || jsonb_build_object('created_at', p.created_at,
                            'recorded_by_kind', p.platform_access_kind)
    order by p.name_key, p.id), '[]'::jsonb)
  from public.custom_foods p
  where p.profile_id = p_profile_id and p.owner_kind = 'person'
$$;

revoke all on function app.nutrition_own_foods_json(uuid) from public, anon, authenticated;

-- Aus 20261206100000_ern_001_ernaehrungsprofil.sql; neu ist nur 'own_foods'.
create or replace function app.nutrition_profile_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
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
    -- ERN-005: die eigenen Lebensmittel der Person (ADR-027 Punkt 6).
    'own_foods', app.nutrition_own_foods_json(p.id)
  )
  from public.nutrition_profiles p
  where p.id = p_profile_id
$$;

-- Aus 20261206110000_ern_002_plattform_ernaehrung.sql; neu ist nur 'own_foods'.
create or replace function app.nutrition_platform_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
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
    -- ERN-005: die eigenen Lebensmittel, ohne wer sie angelegt hat.
    'own_foods', (
      select coalesce(jsonb_agg(f - 'recorded_by_kind'), '[]'::jsonb)
      from jsonb_array_elements(j -> 'own_foods') f)
  )
  from (select app.nutrition_profile_json(p_profile_id) as j) x
  where j is not null
$$;
