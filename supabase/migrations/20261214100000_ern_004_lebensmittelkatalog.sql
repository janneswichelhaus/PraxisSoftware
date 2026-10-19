-- =============================================================================
-- ERN-004 (ERN-EPIC-002): Lebensmittelkatalog, Quellen, Suche, Import
--
-- ADR-027 Punkte 7 bis 9, ADR-002 (kein neuer Anbieter), ADR-011 (keine
-- Suchbegriffe in Logs). Pfad A (ADR-013 Punkt 9: neue Tabellen, Funktionen
-- mit SECURITY DEFINER).
--
--   extensions.pg_trgm             Trigramme für die Tippfehlertoleranz
--   app.food_search_key            die eine Normalisierung für Suche und Index
--   public.food_sources            Quellen mit Lizenz und Stand (BLS, OFF)
--   public.food_catalog            Bundeslebensmittelschlüssel 4.0 und der
--                                  Open-Food-Facts-Auszug Deutschland
--   app.food_search                Kandidaten und Rangfolge an EINER Stelle
--   public.search_foods            Suche der Beratung
--   public.search_platform_foods   Suche der Person auf der Plattform
--   public.list_food_sources       die Quellenangabe der Anwendung
--   app.import_food_catalog_batch, app.finish_food_catalog_import
--                                  der Import (nur Betrieb, nie die Anwendung)
--
-- WAS DER KATALOG IST (ANN-656): Bezugsdaten ohne Personenbezug und ohne
-- Organisation - wie ein Nachschlagewerk. Kein organization_id (ADR-003 gilt
-- für fachliche Tabellen); die eigenen Lebensmittel von Praxis und Person
-- (ERN-005) tragen ihn.
--
-- KEIN FREMDER DIENST (ADR-027 Punkt 8): Die Anwendung fragt zur Laufzeit
-- niemanden nach einem Lebensmittel; der Katalog liegt in der eigenen
-- Datenbank. Gesucht wird über die Funktionen, nie über die Tabelle.
--
-- PROTOKOLL (ADR-010 Fassung 3): keine neue Aktion. Die Suche liest Bezugs-
-- daten, keine Personendaten; Suchbegriffe werden nirgends gespeichert.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Normalisierung (Suche und Index nutzen dieselbe Funktion)
--
-- Kleinbuchstaben, Umlaute und Akzente ohne Zeichen, ae/oe/ue wie der Umlaut
-- (Kaese = Käse = kase), ß als ss, alles andere als Leerzeichen. Beide Seiten
-- laufen durch dieselbe Funktion; dass dabei auch „Feuer“ zu „feur“ wird,
-- stört nicht. Großbuchstaben mit Zeichen werden vor lower() übersetzt:
-- lower() lässt sie unter der Sortierung C stehen.
-- -----------------------------------------------------------------------------
create function app.food_search_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(
    replace(lower(translate(coalesce(p_text, ''),
      'ÄÖÜäöüÀÁÂÃÅàáâãåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕòóôõÙÚÛùúûÇçÑñ',
      'aouaouaaaaaaaaaaeeeeeeeeiiiiiiiioooooooouuuuuuccnn')), 'ß', 'ss'),
    '([aou])e', '\1', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- Nur für Index, Generierung und die Suchfunktionen (Eigentümer postgres).
revoke all on function app.food_search_key(text) from public, anon, authenticated;

comment on function app.food_search_key(text) is
  'ERN-004: die eine Normalisierung für Suchbegriff und Suchschlüssel - Kleinbuchstaben, Umlaute ohne Punkte und ae/oe/ue wie der Umlaut (Käse = Kaese = kase), ß als ss, Satzzeichen als Leerzeichen.';

-- Gültige Portionen: [{ "label": "1 Stück (mittel)", "amount": 150 }], die
-- Menge in der Grundeinheit des Lebensmittels (g oder ml).
create function app.food_portions_valid(p_portions jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(p_portions) = 'array'
     and jsonb_array_length(p_portions) <= 12
     and not exists (
       select 1 from jsonb_array_elements(p_portions) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'label') is distinct from 'string'
          or length(btrim(e ->> 'label')) not between 1 and 60
          or jsonb_typeof(e -> 'amount') is distinct from 'number'
          or (e ->> 'amount')::numeric <= 0
          or (e ->> 'amount')::numeric > 5000
          or (select count(*) from jsonb_object_keys(e)) <> 2)
$$;

revoke all on function app.food_portions_valid(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Quellen (ADR-027 Punkte 7 und 8; ANN-657)
-- -----------------------------------------------------------------------------
create table public.food_sources (
  id           uuid primary key default extensions.gen_random_uuid(),
  source       text not null unique check (source in ('bls', 'off')),
  title        text not null,
  publisher    text not null,
  license      text not null,
  license_url  text not null,
  -- Der Satz, den die Anwendung als Quellenangabe zeigt (CC BY 4.0 und ODbL
  -- verlangen Nennung und Lizenz; BLS zusätzlich den Hinweis auf Änderungen).
  attribution  text not null,
  source_url   text not null,
  -- Stand des letzten Imports; leer, solange nie importiert wurde.
  version      text check (version is null or length(version) between 1 and 60),
  imported_at  timestamptz,
  item_count   integer not null default 0 check (item_count >= 0),
  constraint food_sources_import_pair check ((version is null) = (imported_at is null))
);

comment on table public.food_sources is
  'ERN-004 (ADR-027 Punkte 7 und 8, ANN-657): die Quellen der Lebensmitteldaten mit Lizenz, Quellenangabe und Stand des letzten Imports. Inhalt ohne Personenbezug.';

insert into public.food_sources (source, title, publisher, license, license_url, attribution, source_url)
values
  ('bls', 'Bundeslebensmittelschlüssel (BLS), Version 4.0', 'Max Rubner-Institut',
   'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/deed.de',
   'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0. Lizenz CC BY 4.0. Geändert: Auswahl der Nährstoffe, Salz aus Natrium berechnet, Namen für die Suche vereinheitlicht, Portionen ergänzt.',
   'https://www.blsdb.de'),
  ('off', 'Open Food Facts, Auszug Deutschland', 'Open Food Facts',
   'ODbL 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
   'Enthält Daten von Open Food Facts (openfoodfacts.org), verfügbar unter der Open Database License (ODbL 1.0). Auszug: in Deutschland verkaufte Produkte mit Nährwerten.',
   'https://world.openfoodfacts.org');

revoke all on public.food_sources from public, anon, authenticated;
alter table public.food_sources enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Der Katalog
-- -----------------------------------------------------------------------------
create table public.food_catalog (
  id               uuid primary key default extensions.gen_random_uuid(),
  source           text not null references public.food_sources (source) on delete restrict,
  -- BLS: siebenstelliger Schlüssel (H861000); OFF: der Barcode (EAN/GTIN).
  source_code      text not null,
  name             text not null check (length(btrim(name)) between 1 and 300),
  brand            text check (brand is null or length(btrim(brand)) between 1 and 200),
  -- Die Nährwerte gelten je 100 g bzw. 100 ml dieser Grundeinheit.
  base_unit        text not null default 'g' check (base_unit in ('g', 'ml')),
  energy_kcal      numeric(5, 1) not null check (energy_kcal between 0 and 950),
  protein_g        numeric(5, 2) not null check (protein_g between 0 and 100),
  fat_g            numeric(5, 2) not null check (fat_g between 0 and 100),
  carbohydrate_g   numeric(5, 2) not null check (carbohydrate_g between 0 and 100),
  sugar_g          numeric(5, 2) check (sugar_g is null or sugar_g between 0 and 100),
  fibre_g          numeric(5, 2) check (fibre_g is null or fibre_g between 0 and 100),
  saturated_fat_g  numeric(5, 2) check (saturated_fat_g is null or saturated_fat_g between 0 and 100),
  salt_g           numeric(6, 3) check (salt_g is null or salt_g between 0 and 100),
  portions         jsonb not null default '[]'::jsonb check (app.food_portions_valid(portions)),
  name_key         text generated always as (app.food_search_key(name)) stored,
  search_key       text generated always as
                     (app.food_search_key(name || coalesce(' ' || brand, ''))) stored,
  -- Stand der Quelle, aus dem die Zeile zuletzt kam; fehlt sie in einem
  -- neueren Stand, wird sie zurückgezogen statt gelöscht (spätere Einträge
  -- im Tagebuch verweisen auf sie).
  source_version   text not null check (length(source_version) between 1 and 60),
  imported_at      timestamptz not null default now(),
  retired_at       timestamptz,

  constraint food_catalog_source_code unique (source, source_code),
  constraint food_catalog_code_shape check (
    (source = 'bls' and source_code ~ '^[A-Z][0-9]{6}$')
    or (source = 'off' and source_code ~ '^[0-9]{8,14}$')
  ),
  constraint food_catalog_brand_only_off check (source = 'off' or brand is null),
  constraint food_catalog_macros_fit check (protein_g + fat_g + carbohydrate_g <= 105)
);

comment on table public.food_catalog is
  'ERN-004 (ADR-027 Punkte 7 und 8, ANN-656): Bundeslebensmittelschlüssel 4.0 und der Open-Food-Facts-Auszug Deutschland in der eigenen Datenbank - Nährwerte je 100 g bzw. 100 ml, Portionen der Quelle. Bezugsdaten ohne Personenbezug und ohne Organisation. Kein Tabellenrecht; gesucht wird über search_foods und search_platform_foods, geschrieben allein über den Import.';

-- Zwei Indizes nach Größe der Quelle (ANN-658): BLS (rund 7 000 Zeilen)
-- filtert vollständig über GIN; der Open-Food-Facts-Auszug (Hunderttausende)
-- liefert über GiST die nächsten Nachbarn nach Wortähnlichkeit, sonst wüchse
-- die Zeit mit jedem häufigen Wort wie "Milch" oder "Brot".
create index food_catalog_bls_trgm
  on public.food_catalog using gin (search_key extensions.gin_trgm_ops)
  where retired_at is null and source = 'bls';
create index food_catalog_off_trgm
  on public.food_catalog using gist (search_key extensions.gist_trgm_ops)
  where retired_at is null and source = 'off';

revoke all on public.food_catalog from public, anon, authenticated;
alter table public.food_catalog enable row level security;

-- Datenklasse (ADR-008): Inhalt ohne Personenbezug wie die Übungsbibliothek;
-- keine Frist, gepflegt über den Import.
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('food_sources', 'betriebsdaten', 'keine',
   'Quellen der Lebensmitteldaten mit Lizenz und Stand (ERN-004): Inhalt ohne Personenbezug.',
   244),
  ('food_catalog', 'betriebsdaten', 'keine',
   'Lebensmittelkatalog aus BLS 4.0 und Open Food Facts (ERN-004): Bezugsdaten ohne Personenbezug; was eine Quelle nicht mehr führt, wird beim Import zurückgezogen, nicht gelöscht (ANN-659).',
   245);

-- -----------------------------------------------------------------------------
-- 4. Suche (ANN-658): Kandidaten und Rangfolge an EINER Stelle
--
-- Kandidat ist, was jedes Wort des Suchbegriffs enthält oder ihm ähnlich ist
-- (Trigramme, Tippfehler). Rangfolge als Summe: Name gleich dem Begriff,
-- beginnt mit ihm als Wort, beginnt mit ihm, enthält ihn als Wort; allgemeine
-- Lebensmittel (BLS) vor Markenprodukten; Ähnlichkeit; bei Gleichstand
-- kürzere Namen zuerst. Ohne Bewertung eines Lebensmittels (ADR-006 Punkt 14).
-- -----------------------------------------------------------------------------
create function app.food_search(p_org uuid, p_query text, p_limit integer)
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
        jsonb_build_object(
          'kind', 'catalog',
          'id', c.id,
          'source', c.source,
          'source_code', c.source_code,
          'name', c.name,
          'brand', c.brand,
          'base_unit', c.base_unit,
          'per_100', jsonb_build_object(
            'energy_kcal', c.energy_kcal, 'protein_g', c.protein_g, 'fat_g', c.fat_g,
            'carbohydrate_g', c.carbohydrate_g, 'sugar_g', c.sugar_g, 'fibre_g', c.fibre_g,
            'saturated_fat_g', c.saturated_fat_g, 'salt_g', c.salt_g),
          'portions', c.portions
        ) as eintrag,
        (case
           when c.name_key = v_q then 4
           when c.name_key like v_q || ' %' then 3
           when c.name_key like v_q || '%' then 2
           when ' ' || c.name_key || ' ' like '% ' || v_q || ' %' then 1.5
           else 0
         end
         -- Allgemeines vor Marke wiegt schwerer als "beginnt mit": "Käse"
         -- zeigt Käse vor dem Käsecracker einer Marke.
         + case when c.source = 'bls' then 2.5 else 0 end
         + extensions.word_similarity(v_q, c.search_key)) as rang,
        length(c.name_key) as laenge,
        c.name
      from (
        select b.*
        from public.food_catalog b
        where b.retired_at is null and b.source = 'bls'
          and (b.search_key like '%' || v_laengstes || '%'
               or v_laengstes operator(extensions.<%) b.search_key)
        union all
        -- Marken: die 300 nächsten Nachbarn, danach dieselben Regeln.
        select m.*
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

revoke all on function app.food_search(uuid, text, integer) from public, anon, authenticated;

comment on function app.food_search(uuid, text, integer) is
  'ERN-004 (ANN-658): Kandidaten und Rangfolge der Lebensmittelsuche an einer Stelle - jedes Wort enthalten oder per Trigramm ähnlich (Tippfehler); Name gleich, beginnt als Wort, beginnt; BLS vor Markenprodukten; Ähnlichkeit; kürzere Namen zuerst. Ohne Rechteprüfung, nur aus den Suchfunktionen.';

create function public.search_foods(p_query text, p_limit integer default 20)
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
  return app.food_search(app.current_organization_id(), p_query, p_limit);
end;
$$;

revoke all on function public.search_foods(text, integer) from public, anon;
grant execute on function public.search_foods(text, integer) to authenticated;

comment on function public.search_foods(text, integer) is
  'ERN-004: Lebensmittelsuche der Beratung (app.can_counsel_nutrition) im eigenen Katalog - höchstens 50 Treffer mit Nährwerten je 100 g bzw. ml und Portionen. Der Suchbegriff wird nicht gespeichert.';

create function public.search_platform_foods(
  p_access_id uuid,
  p_query     text,
  p_limit     integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Nur, wer die Ernährung sehen darf und eine laufende Beratung hat - die
  -- Begleitung nie (ADR-027 Punkt 3).
  if not app.platform_access_allows(p_access_id, 'nutrition')
     or (app.platform_nutrition_profile(p_access_id)).id is null then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select a.organization_id into v_org from public.platform_accesses a where a.id = p_access_id;
  return app.food_search(v_org, p_query, p_limit);
end;
$$;

revoke all on function public.search_platform_foods(uuid, text, integer) from public, anon;
grant execute on function public.search_platform_foods(uuid, text, integer) to authenticated;

comment on function public.search_platform_foods(uuid, text, integer) is
  'ERN-004: Lebensmittelsuche auf der Plattform - Recht nutrition (Person, rechtliche Vertretung; nie die Begleitung) und eine laufende Beratung am Verhältnis des Zugangs. Liefert Bezugsdaten, keine Personendaten; darum kein Eintrag platform_representation.read. Der Suchbegriff wird nicht gespeichert.';

create function public.list_food_sources()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'source', s.source, 'title', s.title, 'publisher', s.publisher, 'license', s.license,
    'license_url', s.license_url, 'attribution', s.attribution, 'source_url', s.source_url,
    'version', s.version, 'imported_at', s.imported_at, 'item_count', s.item_count)
    order by s.source), '[]'::jsonb)
  from public.food_sources s
  where auth.uid() is not null
$$;

revoke all on function public.list_food_sources() from public, anon;
grant execute on function public.list_food_sources() to authenticated;

comment on function public.list_food_sources() is
  'ERN-004 (ADR-027 Punkt 8): die Quellenangabe der Lebensmitteldaten mit Lizenz und Stand - für jede angemeldete Person, Inhalt ohne Personenbezug.';

-- -----------------------------------------------------------------------------
-- 5. Import (ANN-659) - allein der Betrieb, nie die Anwendung
--
-- scripts/lebensmittel/laden.mjs liest die Ausgabe der Umwandler (bls.mjs,
-- off.mjs) und ruft je 2 000 Zeilen import_food_catalog_batch, am Ende
-- finish_food_catalog_import. Keine Rechte für authenticated: Die Anwendung
-- schreibt den Katalog nicht.
-- -----------------------------------------------------------------------------
create function app.import_food_catalog_batch(p_source text, p_version text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  if p_source not in ('bls', 'off') or p_version is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid import' using errcode = '22023';
  end if;
  insert into public.food_catalog as c (
    source, source_code, name, brand, base_unit, energy_kcal, protein_g, fat_g, carbohydrate_g,
    sugar_g, fibre_g, saturated_fat_g, salt_g, portions, source_version, imported_at, retired_at
  )
  select p_source, r.source_code, btrim(r.name), nullif(btrim(r.brand), ''),
         coalesce(r.base_unit, 'g'), r.energy_kcal, r.protein_g, r.fat_g, r.carbohydrate_g,
         r.sugar_g, r.fibre_g, r.saturated_fat_g, r.salt_g, coalesce(r.portions, '[]'::jsonb),
         p_version, now(), null
  from jsonb_to_recordset(p_rows) as r(
    source_code text, name text, brand text, base_unit text, energy_kcal numeric,
    protein_g numeric, fat_g numeric, carbohydrate_g numeric, sugar_g numeric, fibre_g numeric,
    saturated_fat_g numeric, salt_g numeric, portions jsonb)
  on conflict (source, source_code) do update set
    name = excluded.name, brand = excluded.brand, base_unit = excluded.base_unit,
    energy_kcal = excluded.energy_kcal, protein_g = excluded.protein_g, fat_g = excluded.fat_g,
    carbohydrate_g = excluded.carbohydrate_g, sugar_g = excluded.sugar_g,
    fibre_g = excluded.fibre_g, saturated_fat_g = excluded.saturated_fat_g,
    salt_g = excluded.salt_g, portions = excluded.portions,
    source_version = excluded.source_version, imported_at = excluded.imported_at,
    retired_at = null;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function app.import_food_catalog_batch(text, text, jsonb) from public, anon, authenticated;

comment on function app.import_food_catalog_batch(text, text, jsonb) is
  'ERN-004 (ANN-659): ein Stapel des Imports - fügt ein oder aktualisiert je Quelle und Schlüssel, holt Zurückgezogenes zurück. Allein für den Betrieb (scripts/lebensmittel/laden.mjs); kein Recht für die Anwendung.';

create function app.finish_food_catalog_import(p_source text, p_version text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zurueck integer;
begin
  -- Was im neuen Stand fehlt, wird zurückgezogen, nicht gelöscht.
  update public.food_catalog c set retired_at = now()
  where c.source = p_source and c.source_version <> p_version and c.retired_at is null;
  get diagnostics v_zurueck = row_count;

  update public.food_sources s set
    version = p_version,
    imported_at = now(),
    item_count = (select count(*) from public.food_catalog c
                  where c.source = p_source and c.retired_at is null)
  where s.source = p_source;
  if not found then
    raise exception 'unknown source' using errcode = '22023';
  end if;
  return v_zurueck;
end;
$$;

revoke all on function app.finish_food_catalog_import(text, text) from public, anon, authenticated;

comment on function app.finish_food_catalog_import(text, text) is
  'ERN-004 (ANN-659): schließt einen Import ab - zieht zurück, was im neuen Stand fehlt, und vermerkt Stand und Anzahl an der Quelle. Allein für den Betrieb.';
