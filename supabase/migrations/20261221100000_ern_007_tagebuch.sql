-- =============================================================================
-- ERN-007 (ERN-EPIC-003): Ernährungstagebuch - Einträge, Wasser, Tagesansicht
--
-- ADR-027 Punkte 2, 3, 6, 9 bis 11; ADR-023 Punkte 13, 19, 22 bis 24;
-- ADR-008 Fassung 6. Pfad A (ADR-013 Punkt 9: neue Tabellen, RLS,
-- Plattformpfade, Datenklasse, Auskunft und Export).
--
--   public.nutrition_diary_entries   was gegessen wurde: Tag, Mahlzeit,
--                                    Lebensmittel, Menge
--   public.nutrition_water_days      Wasser je Tag
--   public.platform_nutrition_diary  die Tagesansicht mit "noch übrig"
--   public.add_platform_diary_entry, update_platform_diary_entry,
--   delete_platform_diary_entry, add_platform_water
--                                    die Wege der Person
--   app.nutrition_profile_json       + diary (Auskunft Art. 15)
--   app.nutrition_platform_json      + diary (Export Art. 20)
--
-- WER (ADR-027 Punkte 2 bis 4): eintragen die Person und ihre rechtliche
-- Vertretung - mit Einwilligung, eingeschaltetem Tagebuch, an der laufenden
-- Beratung dieses Zugangs, nicht in der Lesefrist; nie die Begleitung. Lesen
-- kann außer ihr allein die Fähigkeit "Ernährungsberatung" (ERN-010). Büro,
-- Therapie, Teamleitung, Trainingsbetreuung nicht.
--
-- NÄHRWERTE (Punkt 9): Ein Eintrag verweist auf ein Lebensmittel und trägt
-- seine Werte je 100 g bzw. ml als Stand vom Eintragen (ANN-660); die Werte
-- des Eintrags rechnet die Anwendung aus diesem Stand und der Menge. Niemand
-- tippt hier Kalorien oder Makronährstoffe.
--
-- DARSTELLUNG (Punkt 11): Zahlen, "noch übrig" und Überschreitung - keine
-- Bewertung eines Lebensmittels, kein Krankheitsbezug.
--
-- PROTOKOLL (ADR-010 Fassung 3): keine neue Aktion. Über eine Vertretung
-- steht jeder Aufruf als platform_representation.read; Schreiben weist das
-- Datenmodell nach (created_by, updated_by, platform_access_kind).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabellen
-- -----------------------------------------------------------------------------
create table public.nutrition_diary_entries (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  profile_id           uuid not null,
  eaten_on             date not null,
  meal                 text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Das Lebensmittel: aus dem Katalog, der Praxis oder ein eigenes. Fällt es
  -- weg (ein eigenes gelöscht), bleibt der Eintrag mit seinem Stand.
  food_kind            text not null check (food_kind in ('catalog', 'practice', 'person')),
  catalog_food_id      uuid references public.food_catalog (id) on delete set null,
  custom_food_id       uuid references public.custom_foods (id) on delete set null,

  -- Stand des Lebensmittels beim Eintragen (ANN-660), je 100 g bzw. ml.
  food_name            text not null check (length(btrim(food_name)) between 1 and 300),
  food_brand           text check (food_brand is null or length(btrim(food_brand)) between 1 and 200),
  base_unit            text not null check (base_unit in ('g', 'ml')),
  energy_kcal          numeric(5, 1) not null check (energy_kcal between 0 and 950),
  protein_g            numeric(5, 2) not null check (protein_g between 0 and 100),
  fat_g                numeric(5, 2) not null check (fat_g between 0 and 100),
  carbohydrate_g       numeric(5, 2) not null check (carbohydrate_g between 0 and 100),
  sugar_g              numeric(5, 2) check (sugar_g is null or sugar_g between 0 and 100),
  fibre_g              numeric(5, 2) check (fibre_g is null or fibre_g between 0 and 100),
  saturated_fat_g      numeric(5, 2) check (saturated_fat_g is null or saturated_fat_g between 0 and 100),
  salt_g               numeric(6, 3) check (salt_g is null or salt_g between 0 and 100),

  -- Die Menge in der Grundeinheit; als Portion zusätzlich deren Name, Menge
  -- und Anzahl ("2 × 1 Scheibe à 45 g").
  amount               numeric(6, 1) not null check (amount > 0 and amount <= 5000),
  portion_label        text check (portion_label is null or length(btrim(portion_label)) between 1 and 60),
  portion_amount       numeric(6, 1) check (portion_amount is null or (portion_amount > 0 and portion_amount <= 5000)),
  portion_count        numeric(4, 2) check (portion_count is null or (portion_count > 0 and portion_count <= 20)),

  -- Wer eingetragen hat - die Person oder ihre rechtliche Vertretung.
  platform_access_id   uuid not null,
  platform_access_kind text not null check (platform_access_kind in ('self', 'legal_representative')),
  created_at           timestamptz not null default now(),
  created_by           uuid not null,
  updated_at           timestamptz not null default now(),
  updated_by           uuid not null,

  constraint nutrition_diary_entries_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade,
  constraint nutrition_diary_entries_food_shape check (
    (food_kind = 'catalog' and custom_food_id is null)
    or (food_kind in ('practice', 'person') and catalog_food_id is null)
  ),
  constraint nutrition_diary_entries_portion_shape check (
    (portion_label is null) = (portion_amount is null)
    and (portion_label is null) = (portion_count is null)
  ),
  constraint nutrition_diary_entries_macros_fit check (protein_g + fat_g + carbohydrate_g <= 105)
);

comment on table public.nutrition_diary_entries is
  'ERN-007 (ADR-027 Punkte 9 und 10): Einträge des Ernährungstagebuchs - Tag, Mahlzeit, Lebensmittel mit seinem Stand je 100 g bzw. ml beim Eintragen (ANN-660), Menge oder Portion. Eingetragen von der Person oder ihrer rechtlichen Vertretung auf der Plattform, nur mit Einwilligung und eingeschaltetem Tagebuch. Lesen allein mit app.can_counsel_nutrition. Datenklasse: Ernährungsberatung, fällt mit dem Profil.';

create index nutrition_diary_entries_day_idx
  on public.nutrition_diary_entries (profile_id, eaten_on, meal, created_at);
create index nutrition_diary_entries_organization_idx
  on public.nutrition_diary_entries (organization_id);
create index nutrition_diary_entries_custom_food_idx
  on public.nutrition_diary_entries (custom_food_id) where custom_food_id is not null;
create index nutrition_diary_entries_catalog_food_idx
  on public.nutrition_diary_entries (catalog_food_id) where catalog_food_id is not null;

create table public.nutrition_water_days (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  profile_id           uuid not null,
  drunk_on             date not null,
  water_ml             integer not null check (water_ml between 0 and 10000),
  platform_access_id   uuid not null,
  platform_access_kind text not null check (platform_access_kind in ('self', 'legal_representative')),
  updated_at           timestamptz not null default now(),
  updated_by           uuid not null,

  constraint nutrition_water_days_one_per_day unique (profile_id, drunk_on),
  constraint nutrition_water_days_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade
);

comment on table public.nutrition_water_days is
  'ERN-007 (ADR-027 Punkt 10): getrunkenes Wasser je Tag, mit einem Tipp je Glas (ANN-661). Datenklasse: Ernährungsberatung, fällt mit dem Profil.';

create index nutrition_water_days_organization_idx on public.nutrition_water_days (organization_id);

-- Lesen nur mit der Fähigkeit; geschrieben wird allein über die Funktionen.
revoke all on public.nutrition_diary_entries from public, anon, authenticated;
revoke all on public.nutrition_water_days from public, anon, authenticated;
alter table public.nutrition_diary_entries enable row level security;
alter table public.nutrition_water_days enable row level security;
grant select on public.nutrition_diary_entries to authenticated;
grant select on public.nutrition_water_days to authenticated;

create policy nutrition_diary_entries_select_counsel
  on public.nutrition_diary_entries for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());
create policy nutrition_water_days_select_counsel
  on public.nutrition_water_days for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('nutrition_diary_entries', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Einträge des Ernährungstagebuchs (ERN-007): fallen mit ihrem Ernährungsprofil (ADR-027 Punkt 6).',
   248),
  ('nutrition_water_days', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Wasser je Tag (ERN-007): fällt mit seinem Ernährungsprofil (ADR-027 Punkt 6).',
   249);

-- -----------------------------------------------------------------------------
-- 2. Regeln an einer Stelle
-- -----------------------------------------------------------------------------
-- Glas, Grenzen und Fenster des Tagebuchs (ANN-661).
create function app.nutrition_diary_rule(p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'glass_ml' then 250          -- ein Tipp: ein Glas
    when 'water_max_ml' then 10000    -- mehr an einem Tag wird nicht gezählt
    when 'water_step_max_ml' then 2000
    when 'entries_per_day' then 80    -- Grenze gegen Massenanlage
    when 'recent_days' then 60        -- "zuletzt" schaut so weit zurück
    when 'recent_count' then 15
  end
$$;

revoke all on function app.nutrition_diary_rule(text) from public, anon, authenticated;

comment on function app.nutrition_diary_rule(text) is
  'ERN-007 (ANN-661): die Konstanten des Ernährungstagebuchs an einer Stelle - Glas Wasser, Höchstmengen, Grenze je Tag, Fenster von "zuletzt".';

-- Ein Lebensmittel, das dieser Eintrag nutzen darf - in der Form der Suche -
-- oder null: aus dem Katalog nicht zurückgezogen, der Praxis dieser
-- Organisation nicht abgelegt, ein eigenes nur an diesem Profil.
create function app.nutrition_diary_food(p_profile public.nutrition_profiles, p_kind text, p_id uuid)
returns jsonb
language sql
stable
security definer
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
  where p_kind = c.owner_kind and c.id = p_id
    and c.organization_id = p_profile.organization_id
    and ((c.owner_kind = 'practice' and c.archived_at is null)
         or (c.owner_kind = 'person' and c.profile_id = p_profile.id))
  limit 1
$$;

revoke all on function app.nutrition_diary_food(public.nutrition_profiles, text, uuid)
  from public, anon, authenticated;

-- Die Menge aus Portion und Anzahl oder in der Grundeinheit. Eine Portion muss
-- eine der Portionen des Lebensmittels sein; die Menge rechnet der Server.
create function app.nutrition_diary_amount(
  p_food          jsonb,
  p_amount        numeric,
  p_portion_label text,
  p_portion_count numeric
)
returns table (amount numeric, portion_label text, portion_amount numeric, portion_count numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_portion numeric;
begin
  if p_portion_label is not null then
    if p_amount is not null or p_portion_count is null
       or p_portion_count <= 0 or p_portion_count > 20 then
      raise exception 'portion or amount' using errcode = '22023';
    end if;
    select (p ->> 'amount')::numeric into v_portion
    from jsonb_array_elements(p_food -> 'portions') p
    where p ->> 'label' = p_portion_label
    limit 1;
    if v_portion is null then
      raise exception 'unknown portion' using errcode = '22023';
    end if;
    return query select round(v_portion * p_portion_count, 1), p_portion_label, v_portion,
                        round(p_portion_count, 2);
    return;
  end if;
  if p_portion_count is not null or p_amount is null or p_amount <= 0 or p_amount > 5000 then
    raise exception 'portion or amount' using errcode = '22023';
  end if;
  return query select round(p_amount, 1), null::text, null::numeric, null::numeric;
end;
$$;

revoke all on function app.nutrition_diary_amount(jsonb, numeric, text, numeric)
  from public, anon, authenticated;

-- Das Profil dieses Zugangs zum Eintragen an einem Tag: laufend, Recht
-- nutrition, nicht in der Lesefrist; mit Einwilligung und eingeschaltetem
-- Tagebuch, wo etwas Neues entsteht. Der Tag liegt zwischen dem Beginn der
-- Beratung und heute.
create function app.platform_diary_for_writing(p_access_id uuid, p_day date, p_needs_consent boolean)
returns public.nutrition_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  v_profil := app.platform_nutrition_for_writing(p_access_id, p_needs_consent);
  if p_needs_consent and not v_profil.diary_enabled then
    raise exception 'nutrition diary is off' using errcode = '42501';
  end if;
  if p_day is not null then
    if p_day > app.training_today(v_profil.organization_id) then
      raise exception 'date lies in the future' using errcode = '22023';
    end if;
    if p_day < v_profil.started_on then
      raise exception 'date before the profile' using errcode = '22023';
    end if;
  end if;
  return v_profil;
end;
$$;

revoke all on function app.platform_diary_for_writing(uuid, date, boolean)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Lesen: ein Eintrag, ein Tag, das ganze Tagebuch
-- -----------------------------------------------------------------------------
-- Ein Eintrag mit seinen Werten - gerechnet aus Stand und Menge: Energie auf
-- ganze kcal, Makronährstoffe auf eine Stelle. Wer eingetragen hat, nur für
-- Beratung und Auskunft (p_origin).
create function app.nutrition_diary_entry_json(p_entry public.nutrition_diary_entries, p_origin boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_entry.id,
    'eaten_on', p_entry.eaten_on,
    'meal', p_entry.meal,
    'food_kind', p_entry.food_kind,
    'food_id', coalesce(p_entry.catalog_food_id, p_entry.custom_food_id),
    'name', p_entry.food_name,
    'brand', p_entry.food_brand,
    'base_unit', p_entry.base_unit,
    'amount', p_entry.amount,
    'portion_label', p_entry.portion_label,
    'portion_amount', p_entry.portion_amount,
    'portion_count', p_entry.portion_count,
    'energy_kcal', round(p_entry.energy_kcal * p_entry.amount / 100),
    'protein_g', round(p_entry.protein_g * p_entry.amount / 100, 1),
    'fat_g', round(p_entry.fat_g * p_entry.amount / 100, 1),
    'carbohydrate_g', round(p_entry.carbohydrate_g * p_entry.amount / 100, 1),
    'per_100', jsonb_build_object(
      'energy_kcal', p_entry.energy_kcal, 'protein_g', p_entry.protein_g,
      'fat_g', p_entry.fat_g, 'carbohydrate_g', p_entry.carbohydrate_g,
      'sugar_g', p_entry.sugar_g, 'fibre_g', p_entry.fibre_g,
      'saturated_fat_g', p_entry.saturated_fat_g, 'salt_g', p_entry.salt_g)
  )
  || case when p_origin then jsonb_build_object(
       'created_at', p_entry.created_at, 'recorded_by_kind', p_entry.platform_access_kind)
     else '{}'::jsonb end
$$;

revoke all on function app.nutrition_diary_entry_json(public.nutrition_diary_entries, boolean)
  from public, anon, authenticated;

-- Summen aus den ungerundeten Werten, dann gerundet wie ein Eintrag.
create function app.nutrition_diary_totals(p_profile_id uuid, p_day date, p_meal text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'energy_kcal', coalesce(round(sum(e.energy_kcal * e.amount / 100)), 0),
    'protein_g', coalesce(round(sum(e.protein_g * e.amount / 100), 1), 0),
    'fat_g', coalesce(round(sum(e.fat_g * e.amount / 100), 1), 0),
    'carbohydrate_g', coalesce(round(sum(e.carbohydrate_g * e.amount / 100), 1), 0))
  from public.nutrition_diary_entries e
  where e.profile_id = p_profile_id and e.eaten_on = p_day
    and (p_meal is null or e.meal = p_meal)
$$;

revoke all on function app.nutrition_diary_totals(uuid, date, text) from public, anon, authenticated;

-- Ein Tag: je Mahlzeit die Einträge in der Reihenfolge des Eintragens mit
-- Summe, die Summe des Tages und das Wasser.
create function app.nutrition_diary_day_json(p_profile_id uuid, p_day date, p_origin boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'day', p_day,
    'meals', (
      select jsonb_agg(jsonb_build_object(
               'meal', m.meal,
               'entries', coalesce((
                 select jsonb_agg(app.nutrition_diary_entry_json(e, p_origin)
                                  order by e.created_at, e.id)
                 from public.nutrition_diary_entries e
                 where e.profile_id = p_profile_id and e.eaten_on = p_day and e.meal = m.meal
               ), '[]'::jsonb),
               'totals', app.nutrition_diary_totals(p_profile_id, p_day, m.meal))
             order by m.nr)
      from unnest(array['breakfast', 'lunch', 'dinner', 'snack']) with ordinality m(meal, nr)
    ),
    'totals', app.nutrition_diary_totals(p_profile_id, p_day, null),
    'water_ml', coalesce((
      select w.water_ml from public.nutrition_water_days w
      where w.profile_id = p_profile_id and w.drunk_on = p_day), 0)
  )
$$;

revoke all on function app.nutrition_diary_day_json(uuid, date, boolean) from public, anon, authenticated;

-- Das ganze Tagebuch eines Profils - für Auskunft (Art. 15) und Export
-- (Art. 20). Spätere Teile (Favoriten, Erinnerungen) kommen hier dazu.
create function app.nutrition_diary_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(app.nutrition_diary_entry_json(e, true)
                       order by e.eaten_on, e.meal, e.created_at, e.id)
      from public.nutrition_diary_entries e where e.profile_id = p_profile_id), '[]'::jsonb),
    'water', coalesce((
      select jsonb_agg(jsonb_build_object('drunk_on', w.drunk_on, 'water_ml', w.water_ml,
                                          'recorded_by_kind', w.platform_access_kind)
                       order by w.drunk_on)
      from public.nutrition_water_days w where w.profile_id = p_profile_id), '[]'::jsonb)
  )
$$;

revoke all on function app.nutrition_diary_json(uuid) from public, anon, authenticated;

comment on function app.nutrition_diary_json(uuid) is
  'ERN-007: das Ernährungstagebuch eines Profils vollständig - Einträge mit Stand und Werten, Wasser je Tag; wer eingetragen hat. Ohne Rechteprüfung: nur aus der Auskunft und (ohne recorded_by_kind) dem Export der Plattform.';

-- -----------------------------------------------------------------------------
-- 4. Das Profil ohne und mit Tagebuch
--
-- Die Beratung und die Plattform laden das Profil bei jedem Öffnen; das
-- Tagebuch hat eigene Wege. Auskunft und Export nehmen alles.
-- -----------------------------------------------------------------------------
-- Rumpf aus 20261214110000_ern_005_eigene_lebensmittel.sql, unverändert, unter
-- neuem Namen.
create function app.nutrition_profile_base_json(p_profile_id uuid)
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
    'own_foods', app.nutrition_own_foods_json(p.id)
  )
  from public.nutrition_profiles p
  where p.id = p_profile_id
$$;

revoke all on function app.nutrition_profile_base_json(uuid) from public, anon, authenticated;

comment on function app.nutrition_profile_base_json(uuid) is
  'ERN-007: ein Ernährungsprofil ohne Tagebuch - für die Ansicht der Beratung und der Plattform. Ohne Rechteprüfung.';

create or replace function app.nutrition_profile_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app.nutrition_profile_base_json(p_profile_id)
         || jsonb_build_object('diary', app.nutrition_diary_json(p_profile_id))
  where exists (select 1 from public.nutrition_profiles p where p.id = p_profile_id)
$$;

comment on function app.nutrition_profile_json(uuid) is
  'ERN-001/ERN-007: ein Ernährungsprofil vollständig mit Tagebuch - für die Auskunft (Art. 15) und, mit fester Schlüsselliste, den Export der Plattform (Art. 20). Ohne Rechteprüfung.';

-- Das Tagebuch für die Plattform: ohne wer eingetragen hat. Spätere Teile
-- reichen hier nur durch.
create function app.nutrition_diary_platform_shape(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select d || jsonb_build_object(
    'entries', (select coalesce(jsonb_agg(e - 'recorded_by_kind'), '[]'::jsonb)
                from jsonb_array_elements(d -> 'entries') e),
    'water', (select coalesce(jsonb_agg(w - 'recorded_by_kind'), '[]'::jsonb)
              from jsonb_array_elements(d -> 'water') w))
$$;

revoke all on function app.nutrition_diary_platform_shape(jsonb) from public, anon, authenticated;

-- Die feste Schlüsselliste der Plattform über ein Profil-JSON (ADR-023
-- Punkt 22) - für die Ansicht ohne, für den Export mit Tagebuch.
create function app.nutrition_platform_shape(j jsonb)
returns jsonb
language sql
immutable
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
      from jsonb_array_elements(j -> 'own_foods') f)
  )
  -- ERN-007: das Tagebuch nur, wo es mitkommt (Export), ohne wer eingetragen hat.
  || case when j ? 'diary' then jsonb_build_object('diary', app.nutrition_diary_platform_shape(j -> 'diary'))
          else '{}'::jsonb end
  where j is not null
$$;

revoke all on function app.nutrition_platform_shape(jsonb) from public, anon, authenticated;

create or replace function app.nutrition_platform_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app.nutrition_platform_shape(app.nutrition_profile_json(p_profile_id))
$$;

comment on function app.nutrition_platform_json(uuid) is
  'ERN-002/ERN-007 (ADR-023 Punkt 22): ein Ernährungsprofil für den Export der Plattform mit fester Schlüsselliste und Tagebuch - ohne Notizen der Beratung, ohne Kennungen, ohne wer eingetragen hat. Ohne Rechteprüfung.';

-- Aus 20261206110000_ern_002_plattform_ernaehrung.sql; neu ist nur das Profil
-- ohne Tagebuch.
create or replace function public.platform_nutrition(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_profil public.nutrition_profiles%rowtype;
  v_einwilligung boolean;
  v_schreibbar boolean;
begin
  if not app.platform_access_allows(p_access_id, 'nutrition') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_profil := app.platform_nutrition_profile(p_access_id);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition')
  );

  if v_profil.id is null then
    return jsonb_build_object('profile', null);
  end if;
  v_einwilligung := app.nutrition_consent_granted(v_profil.id);
  v_schreibbar := app.platform_access_writable(p_access_id);

  return jsonb_build_object(
    'today', app.training_today(v_zugang.organization_id),
    'can_write', v_schreibbar and v_einwilligung,
    'can_grant', v_schreibbar and not v_einwilligung,
    'wording_version', app.platform_consent_wording_version(),
    'target_weight_floor_kg', app.nutrition_target_weight_floor(v_profil.height_cm),
    'profile', app.nutrition_platform_shape(app.nutrition_profile_base_json(v_profil.id))
  );
end;
$$;

-- Aus 20261206100000_ern_001_ernaehrungsprofil.sql; neu ist nur das Profil
-- ohne Tagebuch (das liest die Beratung über get_nutrition_diary, ERN-010).
create or replace function public.get_nutrition_profile(p_kind text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_org     uuid;
  v_rel     record;
  v_profil  uuid;
  v_frueher integer;
  v_anderes text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_counsel_nutrition() then
    perform app.record_denied_read(v_actor, 'nutrition.read', 'not allowed to read nutrition profiles');
    return null;
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.nutrition_relationship(p_kind, p_relationship_id, v_org);
  if v_rel.person_id is null then
    return null;
  end if;

  perform app.log_record_access(
    v_org, v_actor,
    case p_kind when 'treatment' then 'patient_record.viewed' else 'training_relationship.viewed' end,
    case p_kind when 'treatment' then 'patient' else 'training_relationship' end,
    p_relationship_id, 'user', jsonb_build_object('surface', 'web', 'view', 'nutrition'));

  select p.id into v_profil
  from public.nutrition_profiles p
  where p.organization_id = v_org and p.relationship_kind = p_kind
    and p.relationship_id = p_relationship_id
  order by p.ended_on is null desc, p.started_on desc, p.created_at desc
  limit 1;

  select count(*) - 1 into v_frueher
  from public.nutrition_profiles p
  where p.organization_id = v_org and p.relationship_kind = p_kind
    and p.relationship_id = p_relationship_id;

  select p.relationship_kind into v_anderes
  from public.nutrition_profiles p
  left join public.patients pa on pa.id = p.patient_id
  left join public.training_relationships t on t.id = p.training_relationship_id
  where p.organization_id = v_org and p.ended_on is null
    and coalesce(pa.person_id, t.person_id) = v_rel.person_id
    and not (p.relationship_kind = p_kind and p.relationship_id = p_relationship_id)
  limit 1;

  return jsonb_build_object(
    'today', app.training_today(v_org),
    'relationship_open', v_rel.is_open,
    'birth_date_known', v_rel.date_of_birth is not null,
    'running_elsewhere', v_anderes,
    'earlier_count', greatest(coalesce(v_frueher, 0), 0),
    'profile', case when v_profil is null then null else app.nutrition_profile_base_json(v_profil) end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Die Tagesansicht der Plattform
-- -----------------------------------------------------------------------------
create function public.platform_nutrition_diary(p_access_id uuid, p_day date default null)
returns jsonb
language plpgsql
security definer
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

  -- Die geltenden Zielwerte (Punkt 11: "noch übrig"); fehlt eine Eingabe
  -- der Rechnung, gibt es keine.
  v_ziele := app.nutrition_profile_targets(v_profil.id);
  return jsonb_build_object(
    'today', v_heute,
    'started_on', v_profil.started_on,
    'enabled', v_profil.diary_enabled,
    -- Eintragen: Recht, Lesefrist, Einwilligung, eingeschaltet.
    'can_write', v_profil.diary_enabled and app.platform_access_writable(p_access_id)
                 and app.nutrition_consent_granted(v_profil.id),
    -- Löschen geht auch nach einem Widerruf (wie eigene Lebensmittel).
    'can_delete', app.platform_access_writable(p_access_id),
    'glass_ml', app.nutrition_diary_rule('glass_ml'),
    'targets', case when v_ziele ->> 'status' = 'ok' then jsonb_build_object(
      'energy_kcal', v_ziele -> 'energy' -> 'kcal',
      'protein_g', v_ziele -> 'protein' -> 'g',
      'fat_g', v_ziele -> 'fat' -> 'g',
      'carbohydrate_g', v_ziele -> 'carbohydrate' -> 'g',
      'water_ml', v_ziele -> 'water' -> 'ml') end,
    'day', app.nutrition_diary_day_json(v_profil.id, v_tag, false)
  );
end;
$$;

revoke all on function public.platform_nutrition_diary(uuid, date) from public, anon;
grant execute on function public.platform_nutrition_diary(uuid, date) to authenticated;

comment on function public.platform_nutrition_diary(uuid, date) is
  'ERN-007 (ADR-027 Punkte 10 und 11): ein Tag des eigenen Ernährungstagebuchs - Mahlzeiten mit Einträgen und Summen, Wasser, die geltenden Zielwerte für "noch übrig". Recht nutrition (Person, rechtliche Vertretung; nie die Begleitung), nur an der laufenden Beratung dieses Zugangs; der Tag zwischen Beginn und heute (22023). Über eine Vertretung protokolliert. Ohne Recht null; ohne laufendes Profil diary null.';

-- -----------------------------------------------------------------------------
-- 6. Eintragen, ändern, löschen
-- -----------------------------------------------------------------------------
create function public.add_platform_diary_entry(
  p_access_id     uuid,
  p_eaten_on      date,
  p_meal          text,
  p_food_kind     text,
  p_food_id       uuid,
  p_amount        numeric default null,
  p_portion_label text default null,
  p_portion_count numeric default null
)
returns uuid
language plpgsql
security definer
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
    case when p_food_kind <> 'catalog' then p_food_id end,
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

revoke all on function public.add_platform_diary_entry(uuid, date, text, text, uuid, numeric, text, numeric)
  from public, anon;
grant execute on function public.add_platform_diary_entry(uuid, date, text, text, uuid, numeric, text, numeric)
  to authenticated;

comment on function public.add_platform_diary_entry(uuid, date, text, text, uuid, numeric, text, numeric) is
  'ERN-007 (ADR-027 Punkte 9 und 10): ein Lebensmittel ins Tagebuch - an einem Tag zwischen Beginn und heute, zu einer Mahlzeit, mit Portion und Anzahl oder einer Menge in g bzw. ml; Werte rechnet der Server aus dem Lebensmittel (ANN-660). Die Person oder ihre rechtliche Vertretung, mit Einwilligung und eingeschaltetem Tagebuch, nicht in der Lesefrist; nie die Begleitung. Höchstens 80 je Tag.';

-- Ändern: Mahlzeit und Menge, die Portion bleibt dieselbe (nur ihre Anzahl).
create function public.update_platform_diary_entry(
  p_access_id     uuid,
  p_id            uuid,
  p_meal          text,
  p_amount        numeric default null,
  p_portion_count numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil  public.nutrition_profiles%rowtype;
  v_zugang  public.platform_accesses%rowtype;
  v_eintrag public.nutrition_diary_entries%rowtype;
  v_menge   numeric;
  v_anzahl  numeric;
begin
  v_profil := app.platform_diary_for_writing(p_access_id, null, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  select * into v_eintrag from public.nutrition_diary_entries e
  where e.id = p_id and e.profile_id = v_profil.id
  for update;
  if v_eintrag.id is null then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  if p_meal is null or p_meal not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'meal is required' using errcode = '22023';
  end if;
  if v_eintrag.portion_label is not null then
    if p_amount is not null or p_portion_count is null
       or p_portion_count <= 0 or p_portion_count > 20 then
      raise exception 'portion or amount' using errcode = '22023';
    end if;
    v_anzahl := round(p_portion_count, 2);
    v_menge := round(v_eintrag.portion_amount * v_anzahl, 1);
  else
    if p_portion_count is not null or p_amount is null or p_amount <= 0 or p_amount > 5000 then
      raise exception 'portion or amount' using errcode = '22023';
    end if;
    v_menge := round(p_amount, 1);
  end if;

  update public.nutrition_diary_entries e
     set meal = p_meal, amount = v_menge, portion_count = v_anzahl,
         platform_access_id = v_zugang.id, platform_access_kind = v_zugang.access_kind,
         updated_at = now(), updated_by = auth.uid()
   where e.id = v_eintrag.id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
end;
$$;

revoke all on function public.update_platform_diary_entry(uuid, uuid, text, numeric, numeric)
  from public, anon;
grant execute on function public.update_platform_diary_entry(uuid, uuid, text, numeric, numeric)
  to authenticated;

comment on function public.update_platform_diary_entry(uuid, uuid, text, numeric, numeric) is
  'ERN-007: einen eigenen Eintrag ändern - Mahlzeit und Menge bzw. Anzahl der Portion. Wie add_platform_diary_entry: Einwilligung, eingeschaltet, nicht in der Lesefrist, nie die Begleitung.';

create function public.delete_platform_diary_entry(p_access_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  -- Löschen braucht weder Einwilligung noch eingeschaltetes Tagebuch: wer
  -- widerrufen oder abgeschaltet hat, räumt trotzdem auf.
  v_profil := app.platform_diary_for_writing(p_access_id, null, false);
  delete from public.nutrition_diary_entries e
  where e.id = p_id and e.profile_id = v_profil.id;
  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;
  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
end;
$$;

revoke all on function public.delete_platform_diary_entry(uuid, uuid) from public, anon;
grant execute on function public.delete_platform_diary_entry(uuid, uuid) to authenticated;

comment on function public.delete_platform_diary_entry(uuid, uuid) is
  'ERN-007: einen eigenen Eintrag löschen - auch nach einem Widerruf oder abgeschaltetem Tagebuch; nicht in der Lesefrist (dann löscht die Frist der Datenklasse mit dem Profil), nie die Begleitung.';

-- Wasser: ein Tipp ist ein Glas; zurück geht es mit negativem Schritt.
create function public.add_platform_water(p_access_id uuid, p_drunk_on date, p_delta_ml integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_zugang public.platform_accesses%rowtype;
  v_menge  integer;
begin
  v_profil := app.platform_diary_for_writing(p_access_id, p_drunk_on, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if p_drunk_on is null or p_delta_ml is null or p_delta_ml = 0
     or abs(p_delta_ml) > app.nutrition_diary_rule('water_step_max_ml') then
    raise exception 'day and amount are required' using errcode = '22023';
  end if;

  insert into public.nutrition_water_days (
    organization_id, profile_id, drunk_on, water_ml, platform_access_id, platform_access_kind,
    updated_by
  )
  values (
    v_profil.organization_id, v_profil.id, p_drunk_on,
    least(greatest(p_delta_ml, 0), app.nutrition_diary_rule('water_max_ml')),
    v_zugang.id, v_zugang.access_kind, auth.uid()
  )
  on conflict (profile_id, drunk_on) do update
     set water_ml = least(greatest(nutrition_water_days.water_ml + p_delta_ml, 0),
                          app.nutrition_diary_rule('water_max_ml')),
         platform_access_id = excluded.platform_access_id,
         platform_access_kind = excluded.platform_access_kind,
         updated_at = now(),
         updated_by = excluded.updated_by
  returning water_ml into v_menge;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
  return v_menge;
end;
$$;

revoke all on function public.add_platform_water(uuid, date, integer) from public, anon;
grant execute on function public.add_platform_water(uuid, date, integer) to authenticated;

comment on function public.add_platform_water(uuid, date, integer) is
  'ERN-007 (ADR-027 Punkt 10, ANN-661): Wasser an einem Tag zählen - ein Glas je Tipp, zurück mit negativem Schritt, nie unter 0 und nicht über 10 l. Wie add_platform_diary_entry: Einwilligung, eingeschaltet, nicht in der Lesefrist, nie die Begleitung. Liefert die Menge des Tages.';
