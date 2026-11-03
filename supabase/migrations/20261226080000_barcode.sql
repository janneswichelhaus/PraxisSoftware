-- Barcode (ADR-027 Punkte 8 und 10, ANN-841): Er findet das Produkt im eigenen Auszug, und ein
-- eigenes Lebensmittel behält ihn. Beim Nachschlagen wird nichts gespeichert.

-- GTIN-8, -12, -13 und -14 sind eine Nummer, rechtsbündig in 14 Stellen (GS1): ohne führende
-- Nullen gleichen sich EAN-8, UPC-A und EAN-13 desselben Produkts.
create function app.gtin_key(p_code text) returns text
  language sql immutable parallel safe
  set search_path = ''
as $$ select ltrim(p_code, '0') $$;

-- Vier Längen und die Prüfziffer nach GS1: von rechts gewichtet 3, 1, 3, …, Rest zu zehn.
create function app.gtin_valid(p_code text) returns boolean
  language plpgsql immutable parallel safe
  set search_path = ''
as $$
declare
  v_n     integer;
  v_summe integer := 0;
begin
  if p_code is null or p_code !~ '^([0-9]{8}|[0-9]{12,14})$' then
    return false;
  end if;
  v_n := length(p_code);
  for i in 1 .. v_n - 1 loop
    v_summe := v_summe
      + substr(p_code, v_n - i, 1)::integer * (case when i % 2 = 1 then 3 else 1 end);
  end loop;
  return (10 - v_summe % 10) % 10 = substr(p_code, v_n, 1)::integer;
end;
$$;

revoke all on function app.gtin_key(text) from public, anon, authenticated, service_role;
revoke all on function app.gtin_valid(text) from public, anon, authenticated, service_role;

comment on function app.gtin_key(text) is
  'ERN-013 (ANN-841): Vergleichsschlüssel eines Barcodes ohne führende Nullen - GTIN-8, -12, -13 und -14 desselben Produkts sind gleich.';
comment on function app.gtin_valid(text) is
  'ERN-013: ein Barcode mit 8, 12, 13 oder 14 Ziffern und gültiger Prüfziffer nach GS1.';

create index food_catalog_off_gtin on public.food_catalog (app.gtin_key(source_code))
  where source = 'off' and retired_at is null;

-- Nur am eigenen Lebensmittel der Person; fällt mit ihm und dem Profil (ADR-027 Punkt 6).
alter table public.custom_foods add column barcode text;
alter table public.custom_foods add constraint custom_foods_barcode_check
  check (barcode is null or (owner_kind = 'person' and app.gtin_valid(barcode)));
create unique index custom_foods_profile_barcode on public.custom_foods (profile_id, app.gtin_key(barcode))
  where barcode is not null;

comment on column public.custom_foods.barcode is
  'ERN-013 (ANN-841): Barcode des eigenen Lebensmittels einer Person, wenn sie ihn beim Anlegen behalten hat - je Profil einmal; Datenklasse wie die Zeile (Ernährungsberatung), in Auskunft und Export.';

create or replace function app.custom_food_json(p_food public.custom_foods) returns jsonb
  language sql immutable
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
    'barcode', p_food.barcode,
    'updated_at', p_food.updated_at
  )
$$;

-- Nur Bezugsdaten aus dem Auszug: Die eigenen Lebensmittel kennt die Person aus ihrem Profil und
-- vergleicht sie auf dem Gerät; darum, wie bei der Suche, kein platform_representation.read.
create function public.find_platform_food_by_barcode(p_access_id uuid, p_code text) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  if not app.platform_access_allows(p_access_id, 'nutrition')
     or (app.platform_nutrition_profile(p_access_id)).id is null then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[0-9]{8,14}$' then
    raise exception 'invalid barcode' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(t.eintrag order by t.laenge, t.name)
    from (
      select jsonb_build_object(
               'kind', 'catalog', 'id', o.id, 'source', o.source,
               'source_code', o.source_code, 'name', o.name, 'brand', o.brand,
               'base_unit', o.base_unit,
               'per_100', jsonb_build_object(
                 'energy_kcal', o.energy_kcal, 'protein_g', o.protein_g, 'fat_g', o.fat_g,
                 'carbohydrate_g', o.carbohydrate_g, 'sugar_g', o.sugar_g,
                 'fibre_g', o.fibre_g, 'saturated_fat_g', o.saturated_fat_g,
                 'salt_g', o.salt_g),
               'portions', o.portions) as eintrag,
             length(o.source_code) as laenge, o.name
      from public.food_catalog o
      where o.source = 'off' and o.retired_at is null
        and app.gtin_key(o.source_code) = app.gtin_key(p_code)
      order by length(o.source_code), o.name
      limit 5
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.find_platform_food_by_barcode(uuid, text) from public, anon;
grant execute on function public.find_platform_food_by_barcode(uuid, text) to authenticated;

comment on function public.find_platform_food_by_barcode(uuid, text) is
  'ERN-013 (ADR-027 Punkt 8, ANN-841): Produkte des Open-Food-Facts-Auszugs zu einem Barcode, höchstens fünf - Recht nutrition (Person, rechtliche Vertretung; nie die Begleitung) und eine laufende Beratung am Verhältnis des Zugangs, wie search_platform_foods. Liefert Bezugsdaten, keine Personendaten; der Barcode wird nicht gespeichert.';

-- Wie bisher, dazu `barcode` im Lebensmittel: fehlt der Schlüssel, bleibt er; null nimmt ihn weg.
create or replace function public.save_platform_food(p_access_id uuid, p_id uuid, p_food jsonb)
  returns uuid
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_profil      public.nutrition_profiles%rowtype;
  v_zugang      public.platform_accesses%rowtype;
  v_f           jsonb;
  v_id          uuid;
  v_mit_barcode boolean := jsonb_typeof(p_food) = 'object' and p_food ? 'barcode';
  v_barcode     text;
begin
  -- Recht nutrition, Lesefrist, laufende Beratung, Einwilligung.
  v_profil := app.platform_nutrition_for_writing(p_access_id, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_mit_barcode then
    if jsonb_typeof(p_food -> 'barcode') not in ('string', 'null') then
      raise exception 'invalid barcode' using errcode = '22023';
    end if;
    v_barcode := nullif(btrim(p_food ->> 'barcode'), '');
    if v_barcode is not null and not app.gtin_valid(v_barcode) then
      raise exception 'invalid barcode' using errcode = '22023';
    end if;
    if v_barcode is not null and exists (
         select 1 from public.custom_foods p
         where p.profile_id = v_profil.id and p.barcode is not null
           and app.gtin_key(p.barcode) = app.gtin_key(v_barcode)
           and p.id is distinct from p_id) then
      raise exception 'barcode already used' using errcode = '23505';
    end if;
  end if;
  v_f := app.custom_food_input(case when v_mit_barcode then p_food - 'barcode' else p_food end);

  if p_id is null then
    -- Eine Grenze gegen Massenanlage: 500 eigene je Profil.
    if (select count(*) from public.custom_foods p where p.profile_id = v_profil.id) >= 500 then
      raise exception 'too many own foods' using errcode = '54000';
    end if;
    insert into public.custom_foods (
      organization_id, owner_kind, profile_id, name, brand, base_unit, energy_kcal, protein_g,
      fat_g, carbohydrate_g, sugar_g, fibre_g, saturated_fat_g, salt_g, portions, barcode,
      platform_access_id, platform_access_kind, created_by, updated_by
    )
    values (
      v_profil.organization_id, 'person', v_profil.id, btrim(v_f ->> 'name'),
      nullif(btrim(v_f ->> 'brand'), ''), coalesce(v_f ->> 'base_unit', 'g'),
      (v_f ->> 'energy_kcal')::numeric, (v_f ->> 'protein_g')::numeric,
      (v_f ->> 'fat_g')::numeric, (v_f ->> 'carbohydrate_g')::numeric,
      (v_f ->> 'sugar_g')::numeric, (v_f ->> 'fibre_g')::numeric,
      (v_f ->> 'saturated_fat_g')::numeric, (v_f ->> 'salt_g')::numeric,
      coalesce(v_f -> 'portions', '[]'::jsonb), v_barcode, v_zugang.id, v_zugang.access_kind,
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
    barcode = case when v_mit_barcode then v_barcode else p.barcode end,
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

comment on function public.save_platform_food(uuid, uuid, jsonb) is
  'ERN-005 (ADR-027 Punkt 9): ein eigenes Lebensmittel anlegen (p_id null) oder ändern - die Person oder ihre rechtliche Vertretung, mit Einwilligung, an der laufenden Beratung dieses Zugangs; nie die Begleitung. Höchstens 500 je Profil. Wer, steht am Datensatz. ERN-013: `barcode` im Lebensmittel setzt (gültige Prüfziffer, einmal je Profil) oder nimmt ihn mit null weg; fehlt er, bleibt er.';
