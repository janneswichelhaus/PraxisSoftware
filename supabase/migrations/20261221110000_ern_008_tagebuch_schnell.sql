-- =============================================================================
-- ERN-008 (ERN-EPIC-003): Tagebuch schnell - zuletzt, Favoriten, kopieren,
-- Zahlen ausblenden
--
-- ADR-027 Punkte 10 und 11. Pfad A (neue Tabelle, RLS, Plattformpfade,
-- Datenklasse, Auskunft und Export).
--
--   public.nutrition_diary_favorites     Favoriten der Person
--   nutrition_profiles.diary_hide_numbers  "Zahlen ausblenden" (Punkt 11)
--   public.platform_nutrition_diary      + recent, favorites, hide_numbers
--   public.set_platform_diary_favorite, copy_platform_diary,
--   set_platform_diary_hide_numbers      die Wege der Person
--   app.nutrition_diary_json             + favorites, hide_numbers
--
-- WER: wie ERN-007 - die Person und ihre rechtliche Vertretung, nie die
-- Begleitung; lesen außer ihr allein die Fähigkeit "Ernährungsberatung".
-- "Zahlen ausblenden" ist ihre Einstellung, keine Vorgabe der Praxis.
-- PROTOKOLL: keine neue Aktion (ADR-010 Fassung 3).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Einstellung und Favoriten
-- -----------------------------------------------------------------------------
alter table public.nutrition_profiles
  add column diary_hide_numbers boolean not null default false;

comment on column public.nutrition_profiles.diary_hide_numbers is
  'ERN-008 (ADR-027 Punkt 11): "Zahlen ausblenden" - die Person sieht ihr Tagebuch ohne Kalorien und Makronährstoffe. Ihre Einstellung, keine Vorgabe; die Beratung sieht die Zahlen.';

create table public.nutrition_diary_favorites (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  profile_id           uuid not null,
  food_kind            text not null check (food_kind in ('catalog', 'practice', 'person')),
  -- Fällt das Lebensmittel, fällt der Favorit.
  catalog_food_id      uuid references public.food_catalog (id) on delete cascade,
  custom_food_id       uuid references public.custom_foods (id) on delete cascade,
  platform_access_id   uuid not null,
  platform_access_kind text not null check (platform_access_kind in ('self', 'legal_representative')),
  created_at           timestamptz not null default now(),
  created_by           uuid not null,

  constraint nutrition_diary_favorites_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade,
  constraint nutrition_diary_favorites_food_shape check (
    (food_kind = 'catalog' and catalog_food_id is not null and custom_food_id is null)
    or (food_kind in ('practice', 'person') and custom_food_id is not null and catalog_food_id is null)
  )
);

comment on table public.nutrition_diary_favorites is
  'ERN-008 (ADR-027 Punkt 10): Favoriten im Ernährungstagebuch - ein Lebensmittel je Zeile, von der Person oder ihrer rechtlichen Vertretung markiert. Lesen allein mit app.can_counsel_nutrition. Datenklasse: Ernährungsberatung, fällt mit dem Profil.';

create unique index nutrition_diary_favorites_catalog_once
  on public.nutrition_diary_favorites (profile_id, catalog_food_id) where catalog_food_id is not null;
create unique index nutrition_diary_favorites_custom_once
  on public.nutrition_diary_favorites (profile_id, custom_food_id) where custom_food_id is not null;
create index nutrition_diary_favorites_organization_idx
  on public.nutrition_diary_favorites (organization_id);
create index nutrition_diary_favorites_custom_idx
  on public.nutrition_diary_favorites (custom_food_id) where custom_food_id is not null;
create index nutrition_diary_favorites_catalog_idx
  on public.nutrition_diary_favorites (catalog_food_id) where catalog_food_id is not null;

revoke all on public.nutrition_diary_favorites from public, anon, authenticated;
alter table public.nutrition_diary_favorites enable row level security;
grant select on public.nutrition_diary_favorites to authenticated;
create policy nutrition_diary_favorites_select_counsel
  on public.nutrition_diary_favorites for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('nutrition_diary_favorites', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Favoriten des Ernährungstagebuchs (ERN-008): fallen mit ihrem Ernährungsprofil (ADR-027 Punkt 6) und mit ihrem Lebensmittel.',
   250);

-- -----------------------------------------------------------------------------
-- 2. Zuletzt und Favoriten - mit dem heutigen Stand des Lebensmittels
-- -----------------------------------------------------------------------------
-- Die zuletzt gegessenen Lebensmittel, die sich noch eintragen lassen, je mit
-- der Menge vom letzten Mal.
create function app.nutrition_diary_recent(p_profile public.nutrition_profiles)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.eintrag order by x.zuletzt desc), '[]'::jsonb)
  from (
    select l.zuletzt,
           jsonb_build_object(
             'food', app.nutrition_diary_food(p_profile, l.food_kind, l.food_id),
             'amount', l.amount, 'portion_label', l.portion_label,
             'portion_count', l.portion_count) as eintrag
    from (
      select distinct on (e.food_kind, coalesce(e.catalog_food_id, e.custom_food_id))
             e.food_kind, coalesce(e.catalog_food_id, e.custom_food_id) as food_id,
             e.amount, e.portion_label, e.portion_count, e.created_at as zuletzt
      from public.nutrition_diary_entries e
      where e.profile_id = p_profile.id
        and coalesce(e.catalog_food_id, e.custom_food_id) is not null
        and e.eaten_on > app.training_today(p_profile.organization_id)
                         - app.nutrition_diary_rule('recent_days')
      order by e.food_kind, coalesce(e.catalog_food_id, e.custom_food_id), e.created_at desc
    ) l
    where app.nutrition_diary_food(p_profile, l.food_kind, l.food_id) is not null
    order by l.zuletzt desc
    limit app.nutrition_diary_rule('recent_count')
  ) x
$$;

revoke all on function app.nutrition_diary_recent(public.nutrition_profiles)
  from public, anon, authenticated;

-- Die Favoriten, die sich noch eintragen lassen, mit der Menge vom letzten Mal.
create function app.nutrition_diary_favorites_json(p_profile public.nutrition_profiles)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'food', x.essen, 'amount', l.amount, 'portion_label', l.portion_label,
           'portion_count', l.portion_count)
         order by x.essen ->> 'name', x.id), '[]'::jsonb)
  from (
    select f.id, f.food_kind, coalesce(f.catalog_food_id, f.custom_food_id) as food_id,
           app.nutrition_diary_food(p_profile, f.food_kind,
                                    coalesce(f.catalog_food_id, f.custom_food_id)) as essen
    from public.nutrition_diary_favorites f
    where f.profile_id = p_profile.id
  ) x
  left join lateral (
    select e.amount, e.portion_label, e.portion_count
    from public.nutrition_diary_entries e
    where e.profile_id = p_profile.id and e.food_kind = x.food_kind
      and coalesce(e.catalog_food_id, e.custom_food_id) = x.food_id
    order by e.created_at desc
    limit 1
  ) l on true
  where x.essen is not null
$$;

revoke all on function app.nutrition_diary_favorites_json(public.nutrition_profiles)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Tagesansicht: + zuletzt, Favoriten, Zahlen ausblenden
--
-- Aus 20261221100000_ern_007_tagebuch.sql; neu sind die drei Schlüssel.
-- -----------------------------------------------------------------------------
create or replace function public.platform_nutrition_diary(p_access_id uuid, p_day date default null)
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

  v_ziele := app.nutrition_profile_targets(v_profil.id);
  return jsonb_build_object(
    'today', v_heute,
    'started_on', v_profil.started_on,
    'enabled', v_profil.diary_enabled,
    'can_write', v_profil.diary_enabled and app.platform_access_writable(p_access_id)
                 and app.nutrition_consent_granted(v_profil.id),
    'can_delete', app.platform_access_writable(p_access_id),
    'glass_ml', app.nutrition_diary_rule('glass_ml'),
    -- ERN-008: die Einstellung der Person, zuletzt und Favoriten.
    'hide_numbers', v_profil.diary_hide_numbers,
    'recent', app.nutrition_diary_recent(v_profil),
    'favorites', app.nutrition_diary_favorites_json(v_profil),
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

-- -----------------------------------------------------------------------------
-- 4. Favorit, Zahlen ausblenden, kopieren
-- -----------------------------------------------------------------------------
create function public.set_platform_diary_favorite(
  p_access_id uuid,
  p_food_kind text,
  p_food_id   uuid,
  p_favorite  boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_zugang public.platform_accesses%rowtype;
begin
  -- Markieren wie Eintragen; abnehmen geht immer (wie löschen).
  v_profil := app.platform_diary_for_writing(p_access_id, null, coalesce(p_favorite, false));
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if p_favorite is null or p_food_kind is null or p_food_id is null then
    raise exception 'food and choice are required' using errcode = '22023';
  end if;

  if not p_favorite then
    delete from public.nutrition_diary_favorites f
    where f.profile_id = v_profil.id and f.food_kind = p_food_kind
      and coalesce(f.catalog_food_id, f.custom_food_id) = p_food_id;
  else
    if app.nutrition_diary_food(v_profil, p_food_kind, p_food_id) is null then
      raise exception 'food not found' using errcode = 'P0002';
    end if;
    if (select count(*) from public.nutrition_diary_favorites f where f.profile_id = v_profil.id)
       >= 200 then
      raise exception 'too many favorites' using errcode = '54000';
    end if;
    insert into public.nutrition_diary_favorites (
      organization_id, profile_id, food_kind, catalog_food_id, custom_food_id,
      platform_access_id, platform_access_kind, created_by
    )
    values (
      v_profil.organization_id, v_profil.id, p_food_kind,
      case when p_food_kind = 'catalog' then p_food_id end,
      case when p_food_kind <> 'catalog' then p_food_id end,
      v_zugang.id, v_zugang.access_kind, auth.uid()
    )
    on conflict do nothing;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
end;
$$;

revoke all on function public.set_platform_diary_favorite(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.set_platform_diary_favorite(uuid, text, uuid, boolean) to authenticated;

comment on function public.set_platform_diary_favorite(uuid, text, uuid, boolean) is
  'ERN-008: ein Lebensmittel als Favorit markieren (mit Einwilligung, eingeschaltetem Tagebuch) oder abnehmen (immer); höchstens 200. Die Person oder ihre rechtliche Vertretung, nicht in der Lesefrist, nie die Begleitung.';

create function public.set_platform_diary_hide_numbers(p_access_id uuid, p_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  -- Eine Einstellung der Ansicht, keine Angabe: ohne Einwilligung möglich.
  v_profil := app.platform_nutrition_for_writing(p_access_id, false);
  if p_hide is null then
    raise exception 'choice is required' using errcode = '22023';
  end if;
  update public.nutrition_profiles set diary_hide_numbers = p_hide where id = v_profil.id;
  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
end;
$$;

revoke all on function public.set_platform_diary_hide_numbers(uuid, boolean) from public, anon;
grant execute on function public.set_platform_diary_hide_numbers(uuid, boolean) to authenticated;

comment on function public.set_platform_diary_hide_numbers(uuid, boolean) is
  'ERN-008 (ADR-027 Punkt 11): "Zahlen ausblenden" ein- und ausschalten - die Einstellung der Person bzw. ihrer rechtlichen Vertretung; nicht in der Lesefrist, nie die Begleitung.';

-- Eine Mahlzeit oder einen ganzen Tag kopieren: mit demselben Stand der
-- Lebensmittel und derselben Menge. Ohne Mahlzeit der ganze Tag in dieselben
-- Mahlzeiten; mit Mahlzeit in p_to_meal oder in dieselbe.
create function public.copy_platform_diary(
  p_access_id uuid,
  p_from_day  date,
  p_from_meal text,
  p_to_day    date,
  p_to_meal   text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_zugang public.platform_accesses%rowtype;
  v_anzahl integer;
begin
  v_profil := app.platform_diary_for_writing(p_access_id, p_to_day, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if p_from_day is null or p_to_day is null
     or (p_from_meal is not null and p_from_meal not in ('breakfast', 'lunch', 'dinner', 'snack'))
     or (p_to_meal is not null and p_to_meal not in ('breakfast', 'lunch', 'dinner', 'snack'))
     or (p_from_meal is null and p_to_meal is not null) then
    raise exception 'day and meal are required' using errcode = '22023';
  end if;
  if p_from_day < v_profil.started_on or p_from_day > app.training_today(v_profil.organization_id) then
    raise exception 'day outside the counselling' using errcode = '22023';
  end if;
  if p_from_day = p_to_day and coalesce(p_to_meal, p_from_meal) is not distinct from p_from_meal then
    raise exception 'copy onto itself' using errcode = '22023';
  end if;

  select count(*) into v_anzahl from public.nutrition_diary_entries e
  where e.profile_id = v_profil.id and e.eaten_on = p_from_day
    and (p_from_meal is null or e.meal = p_from_meal);
  if v_anzahl = 0 then
    return 0;
  end if;
  if v_anzahl + (select count(*) from public.nutrition_diary_entries e
                 where e.profile_id = v_profil.id and e.eaten_on = p_to_day)
     > app.nutrition_diary_rule('entries_per_day') then
    raise exception 'too many entries on this day' using errcode = '54000';
  end if;

  insert into public.nutrition_diary_entries (
    organization_id, profile_id, eaten_on, meal, food_kind, catalog_food_id, custom_food_id,
    food_name, food_brand, base_unit, energy_kcal, protein_g, fat_g, carbohydrate_g, sugar_g,
    fibre_g, saturated_fat_g, salt_g, amount, portion_label, portion_amount, portion_count,
    platform_access_id, platform_access_kind, created_at, created_by, updated_by
  )
  select e.organization_id, e.profile_id, p_to_day, coalesce(p_to_meal, e.meal), e.food_kind,
         e.catalog_food_id, e.custom_food_id, e.food_name, e.food_brand, e.base_unit,
         e.energy_kcal, e.protein_g, e.fat_g, e.carbohydrate_g, e.sugar_g, e.fibre_g,
         e.saturated_fat_g, e.salt_g, e.amount, e.portion_label, e.portion_amount,
         e.portion_count, v_zugang.id, v_zugang.access_kind,
         -- Die Reihenfolge des Tages bleibt erhalten.
         clock_timestamp() + (row_number() over (order by e.created_at, e.id)) * interval '1 microsecond',
         auth.uid(), auth.uid()
  from public.nutrition_diary_entries e
  where e.profile_id = v_profil.id and e.eaten_on = p_from_day
    and (p_from_meal is null or e.meal = p_from_meal);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
  return v_anzahl;
end;
$$;

revoke all on function public.copy_platform_diary(uuid, date, text, date, text) from public, anon;
grant execute on function public.copy_platform_diary(uuid, date, text, date, text) to authenticated;

comment on function public.copy_platform_diary(uuid, date, text, date, text) is
  'ERN-008 (ADR-027 Punkt 10): eine Mahlzeit oder einen Tag kopieren - mit Stand und Menge der Einträge, an einen Tag zwischen Beginn und heute; höchstens 80 Einträge am Ziel. Wie add_platform_diary_entry: Einwilligung, eingeschaltet, nicht in der Lesefrist, nie die Begleitung. Liefert die Zahl der kopierten Einträge.';

-- -----------------------------------------------------------------------------
-- 5. Auskunft und Export: + Favoriten und Einstellung
-- -----------------------------------------------------------------------------
create or replace function app.nutrition_diary_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'hide_numbers', (select p.diary_hide_numbers from public.nutrition_profiles p
                     where p.id = p_profile_id),
    'entries', coalesce((
      select jsonb_agg(app.nutrition_diary_entry_json(e, true)
                       order by e.eaten_on, e.meal, e.created_at, e.id)
      from public.nutrition_diary_entries e where e.profile_id = p_profile_id), '[]'::jsonb),
    'water', coalesce((
      select jsonb_agg(jsonb_build_object('drunk_on', w.drunk_on, 'water_ml', w.water_ml,
                                          'recorded_by_kind', w.platform_access_kind)
                       order by w.drunk_on)
      from public.nutrition_water_days w where w.profile_id = p_profile_id), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'food_kind', f.food_kind,
               'food_id', coalesce(f.catalog_food_id, f.custom_food_id),
               'name', coalesce(c.name, u.name),
               'created_at', f.created_at,
               'recorded_by_kind', f.platform_access_kind)
             order by f.created_at, f.id)
      from public.nutrition_diary_favorites f
      left join public.food_catalog c on c.id = f.catalog_food_id
      left join public.custom_foods u on u.id = f.custom_food_id
      where f.profile_id = p_profile_id), '[]'::jsonb)
  )
$$;

create or replace function app.nutrition_diary_platform_shape(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select d || jsonb_build_object(
    'entries', (select coalesce(jsonb_agg(e - 'recorded_by_kind'), '[]'::jsonb)
                from jsonb_array_elements(d -> 'entries') e),
    'water', (select coalesce(jsonb_agg(w - 'recorded_by_kind'), '[]'::jsonb)
              from jsonb_array_elements(d -> 'water') w),
    'favorites', (select coalesce(jsonb_agg(f - 'recorded_by_kind'), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(d -> 'favorites', '[]'::jsonb)) f))
$$;
