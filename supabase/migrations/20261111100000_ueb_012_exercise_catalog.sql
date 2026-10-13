-- =============================================================================
-- UEB-012: Übungskatalog, Übungsbild und Dosierung je Position
--
-- Der mitgelieferte Übungskatalog ist Produktinhalt im Release
-- (src/features/exercises/katalog, ANN-382) - wie die Instrumente der
-- Assessments ohne organization_id (ANN-083). Die Praxis UEBERNIMMT ihn als
-- Kopie in ihre Bibliothek; ab dann ist es ihre Bibliothek. Fremdschluessel,
-- Policies, Schnappschuss und Tests der vorhandenen Tabellen bleiben, wie sie
-- sind (Variante a der Analyse vom 12.10.2026).
--
--   exercise_variants        + Herkunft (catalog_key, catalog_version), Ziel,
--                              Ausgangsstellung, Niveau, Standarddosierung,
--                              Bild, Pruefvermerk der Praxis
--   exercise_plan_items      + Halten, je Seite, Haeufigkeit am Tag, Bild im
--                              Schnappschuss
--   app.exercise_goals, app.exercise_starting_positions,
--   app.exercise_equipment_labels      feste Listen (ANN-383)
--   app.exercise_illustration_valid    Pruefung des Bildes (ANN-381)
--   app.exercise_dosage_valid          Pruefung der Standarddosierung
--   app.exercise_catalog_entry         Pruefung eines Katalogeintrags
--   app.import_exercise_catalog_for    Uebernahme fuer Seed und Import
--   public.import_exercise_catalog     Uebernahme durch owner (ANN-385)
--   public.set_exercise_variant_reviewed  Pruefvermerk (ANN-386)
--   public.save_exercise_variant       geaenderter Inhalt nimmt den
--                                      Pruefvermerk (ANN-386)
--   public.save_exercise_plan_item     + Halten, je Seite, am Tag (ANN-384)
--   public.assign_exercise_plan        friert das Bild mit ein (ANN-300)
--   public.list_exercise_library, app.exercise_plan_item_json,
--   app.platform_exercise_plan_item_json   liefern Bild und Dosierfelder
--
-- DAS BILD IST KEINE DATEI (ADR-017 Punkt 4, ANN-381): eine Posen-
-- Beschreibung (jsonb, hoechstens 4096 Byte), aus der der Code eine
-- Linienfigur zeichnet. Kein Bucket, kein Anbieter, keine Ablage. Beim
-- Zuweisen wird es mit Namen, Anleitung und Dosierung eingefroren - eine
-- spaetere Aenderung der Bibliothek aendert nicht, was die Person bekommen
-- hat (ANN-300).
--
-- KEINE AUSWAHL (ADR-006 Punkt 10): Ziel, Ausgangsstellung, Niveau und
-- Hilfsmittel sind Ordnungen des Katalogs zum Suchen. Keine Spalte verweist
-- auf Diagnose, Befund oder Verlauf, es gibt bewusst kein Feld
-- "Krankheitsbild". Die Standarddosierung ist eine Eigenschaft des Katalogs,
-- fuer alle gleich, nie aus Angaben einer Person abgeleitet (ANN-384).
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer uebernommen, geaendert und
-- durchgesehen hat, steht an der Zeile (created_by, reviewed_by) - wie bei
-- jeder anderen Aenderung der Bibliothek seit UEB-001.
--
-- KEINE NEUE TABELLE: Die Spalten erben die Datenklasse ihrer Tabelle
-- (Betriebsdaten der Praxis bzw. die des Plans).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Feste Listen (ANN-383)
--
-- Gegenstuecke in src/features/exercises/katalog/typen.ts;
-- supabase/tests/exercise-catalog.test.ts haelt beide gleich.
-- -----------------------------------------------------------------------------
create function app.exercise_goals()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'mobilitaet', 'kraft', 'stabilitaet', 'gleichgewicht',
    'dehnung', 'atmung', 'koordination', 'ausdauer'
  ]::text[]
$$;

revoke all on function app.exercise_goals() from public, anon, authenticated;

comment on function app.exercise_goals() is
  'UEB-012 (ANN-383): Ziele einer Variante - eine Ordnung zum Suchen, keine Auswahl (ADR-006 Punkt 10). Gegenstueck in src/features/exercises/katalog/typen.ts.';

create function app.exercise_starting_positions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'rueckenlage', 'bauchlage', 'seitlage', 'sitz', 'stand',
    'vierfuessler', 'kniestand', 'gehen'
  ]::text[]
$$;

revoke all on function app.exercise_starting_positions() from public, anon, authenticated;

comment on function app.exercise_starting_positions() is
  'UEB-012 (ANN-383): Ausgangsstellungen einer Variante. Gegenstueck in src/features/exercises/katalog/typen.ts.';

-- Die Hilfsmittel des Katalogs mit ihrer Bezeichnung. Beim Uebernehmen steht
-- die Bezeichnung in der Ausruestung der Variante; eigene Uebungen behalten
-- freie Schlagworte (ANN-295).
create function app.exercise_equipment_labels()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'stuhl', 'Stuhl',
    'tisch', 'Tisch oder Arbeitsplatte',
    'wand', 'Wand',
    'tuerrahmen', 'Türrahmen',
    'bett', 'Bett',
    'handtuch', 'Handtuch',
    'kissen', 'Kissen',
    'theraband', 'Theraband',
    'stufe', 'Treppe oder Stufe',
    'hantel', 'Hantel oder Wasserflasche',
    'gewichtsmanschette', 'Gewichtsmanschette',
    'ball', 'Ball',
    'stab', 'Stab oder Besenstiel',
    'matte', 'Matte',
    'gehhilfe', 'Gehhilfe',
    'pedaltrainer', 'Bewegungstrainer',
    'alltagsgegenstand', 'Alltagsgegenstand'
  )
$$;

revoke all on function app.exercise_equipment_labels() from public, anon, authenticated;

comment on function app.exercise_equipment_labels() is
  'UEB-012 (ANN-383): Hilfsmittel des Katalogs und ihre Bezeichnung in der Ausruestung. Gegenstueck HILFSMITTEL_LABEL in src/features/exercises/katalog/typen.ts.';

-- -----------------------------------------------------------------------------
-- 2. Pruefungen (fuer Check-Constraints: immutable, ohne Ausnahme)
-- -----------------------------------------------------------------------------

-- Eine ganze Zahl aus jsonb, sonst null - kein Komma, kein Exponent, kein Text.
create function app.exercise_json_int(p jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) = 'number' and (p #>> '{}') ~ '^[0-9]{1,6}$' then (p #>> '{}')::integer
  end
$$;

revoke all on function app.exercise_json_int(jsonb) from public, anon, authenticated;

-- Das Bild (ANN-381): ein Objekt der Fassung 1 mit Start und Ende, hoechstens
-- 4096 Byte in der Textform von jsonb. Was darin steht, prueft der Client mit
-- zod und zeichnet nur Zahlen und feste Werte - ein ungueltiges Bild wird dort
-- zu "kein Bild".
create function app.exercise_illustration_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- coalesce: Fehlt ein Teil, ist der Ausdruck null - und null bestuende
  -- jeden Check. Unbekannt heisst hier ungueltig.
  select p is null or coalesce(
    jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 4096
    and p -> 'v' = '1'::jsonb
    and jsonb_typeof(p -> 'basis') = 'string'
    and jsonb_typeof(p -> 'start') = 'object'
    and jsonb_typeof(p -> 'ende') = 'object',
    false
  )
$$;

revoke all on function app.exercise_illustration_valid(jsonb) from public, anon, authenticated;

comment on function app.exercise_illustration_valid(jsonb) is
  'UEB-012 (ANN-381): Ein Uebungsbild ist ein jsonb-Objekt der Fassung 1 mit start und ende, hoechstens 4096 Byte. Die eine Stelle fuer die Grenze.';

-- Die Standarddosierung (ANN-384) in der Form der Planposition: Saetze,
-- Wiederholungen ODER Dauer, Halten nur mit Wiederholungen, je Seite,
-- Haeufigkeit am Tag - dieselben Grenzen wie an exercise_plan_items.
create function app.exercise_dosage_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sets integer := app.exercise_json_int(p -> 'sets');
  v_min  integer := app.exercise_json_int(p -> 'reps_min');
  v_max  integer := app.exercise_json_int(p -> 'reps_max');
  v_dur  integer := app.exercise_json_int(p -> 'duration_seconds');
  v_hold integer := app.exercise_json_int(p -> 'hold_seconds');
  v_tag  integer := app.exercise_json_int(p -> 'times_per_day');
  v_feld text;
begin
  if p is null then
    return true;
  end if;
  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for v_feld in select jsonb_object_keys(p) loop
    if v_feld not in ('sets', 'reps_min', 'reps_max', 'duration_seconds', 'hold_seconds',
                      'per_side', 'times_per_day') then
      return false;
    end if;
    -- Ein Feld mit Wert hat den richtigen Typ.
    if jsonb_typeof(p -> v_feld) <> 'null'
       and ((v_feld = 'per_side' and jsonb_typeof(p -> v_feld) <> 'boolean')
         or (v_feld <> 'per_side' and app.exercise_json_int(p -> v_feld) is null)) then
      return false;
    end if;
  end loop;
  return coalesce(
    v_sets between 1 and 20
    and (v_min is null) = (v_max is null)
    and (v_min is null or (v_min between 1 and 100 and v_max between 1 and 100 and v_max >= v_min))
    and (v_dur is null or v_dur between 1 and 3600)
    and ((v_min is null) <> (v_dur is null))
    and (v_hold is null or (v_hold between 1 and 600 and v_min is not null))
    and (v_tag is null or v_tag between 1 and 10),
    false);
end;
$$;

revoke all on function app.exercise_dosage_valid(jsonb) from public, anon, authenticated;

comment on function app.exercise_dosage_valid(jsonb) is
  'UEB-012 (ANN-384): Pruefung der Standarddosierung einer Variante - dieselben Grenzen wie an der Planposition.';

-- -----------------------------------------------------------------------------
-- 3. Die Variante: Herkunft, Ordnungen, Standarddosierung, Bild, Pruefvermerk
-- -----------------------------------------------------------------------------
alter table public.exercise_variants
  add column catalog_key       text
    check (catalog_key is null or catalog_key ~ '^[A-Z]{2}-[0-9]{2}$'),
  add column catalog_version   text
    check (catalog_version is null or catalog_version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  add column goal              text
    check (goal is null or goal = any (app.exercise_goals())),
  add column starting_position text
    check (starting_position is null or starting_position = any (app.exercise_starting_positions())),
  add column level             smallint check (level between 1 and 3),
  add column default_dosage    jsonb check (app.exercise_dosage_valid(default_dosage)),
  add column illustration      jsonb check (app.exercise_illustration_valid(illustration)),
  add column reviewed_at       timestamptz,
  add column reviewed_by       uuid,
  add constraint exercise_variants_catalog_origin
    check ((catalog_key is null) = (catalog_version is null)),
  add constraint exercise_variants_reviewed_stamp
    check ((reviewed_at is null) = (reviewed_by is null));

comment on column public.exercise_variants.catalog_key is
  'UEB-012 (ANN-382): Herkunft aus dem mitgelieferten Katalog (KN-01 ...); leer bei eigenen Uebungen. Je Praxis hoechstens einmal - ein spaeterer Import ueberspringt sie und ueberschreibt nichts.';
comment on column public.exercise_variants.catalog_version is
  'UEB-012 (ANN-382): Fassung des Katalogeintrags bei der Uebernahme (semver).';
comment on column public.exercise_variants.goal is
  'UEB-012 (ANN-383): Ziel aus app.exercise_goals() - zum Suchen, nie aus Angaben einer Person vorbelegt (ADR-006 Punkt 10).';
comment on column public.exercise_variants.default_dosage is
  'UEB-012 (ANN-384): Standarddosierung des Katalogs in der Form der Planposition. Fuer alle gleich, nie aus Angaben einer Person abgeleitet (ADR-006 Punkt 10).';
comment on column public.exercise_variants.illustration is
  'UEB-012 (ANN-381): Posen-Beschreibung des Uebungsbilds (jsonb, Fassung 1, hoechstens 4096 Byte) - keine Datei (ADR-017 Punkt 4).';
comment on column public.exercise_variants.reviewed_at is
  'UEB-012 (ANN-386): Pruefvermerk - die Praxis hat Text, Dosierung und Bild fachlich durchgesehen. Ohne Vermerk gilt eine uebernommene Variante als ungeprueft; das blockiert nur das Scharfschalten (PROJECT_PRINCIPLES.md 15.2).';

create unique index exercise_variants_catalog_key_unique
  on public.exercise_variants (organization_id, catalog_key)
  where catalog_key is not null;

-- -----------------------------------------------------------------------------
-- 4. Die Planposition: Halten, je Seite, am Tag, Bild im Schnappschuss
-- -----------------------------------------------------------------------------
alter table public.exercise_plan_items
  -- Jede Wiederholung so lange halten - nur zusammen mit Wiederholungen
  -- ("10-mal 5 Sekunden halten"); Wiederholungen ODER Dauer bleibt (ANN-299).
  add column hold_seconds  smallint check (hold_seconds between 1 and 600),
  add column per_side      boolean not null default false,
  -- Wie oft am Tag; ohne Angabe gilt die Haeufigkeit des Plans.
  add column times_per_day smallint check (times_per_day between 1 and 10),
  -- Schnappschuss des Bildes bei der Zuweisung (ANN-300). Ausserhalb der
  -- Regel exercise_plan_items_snapshot: Nicht jede Variante hat ein Bild.
  add column illustration  jsonb check (app.exercise_illustration_valid(illustration)),
  add constraint exercise_plan_items_hold
    check (hold_seconds is null or reps_min is not null);

comment on column public.exercise_plan_items.hold_seconds is
  'UEB-012 (ANN-384): jede Wiederholung so viele Sekunden halten; nur mit Wiederholungen.';
comment on column public.exercise_plan_items.times_per_day is
  'UEB-012 (ANN-384): wie oft am Tag; ohne Angabe gilt sessions_per_week des Plans.';
comment on column public.exercise_plan_items.illustration is
  'UEB-012 (ANN-381, ANN-300): Bild der Variante, bei der Zuweisung eingefroren. Datenklasse wie der Plan; enthaelt selbst keine Angabe zur Person.';

-- -----------------------------------------------------------------------------
-- 5. Pruefvermerk (ANN-386): owner sieht durch, die Zeile haelt fest, wer
-- -----------------------------------------------------------------------------
create function public.set_exercise_variant_reviewed(p_variant_id uuid, p_reviewed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  v_org := app.exercise_library_writer();
  if p_reviewed is null then
    raise exception 'reviewed is required' using errcode = '22023';
  end if;

  update public.exercise_variants
     set reviewed_at = case when p_reviewed then coalesce(reviewed_at, now()) end,
         reviewed_by = case when p_reviewed then coalesce(reviewed_by, v_actor) end,
         updated_at = now(),
         updated_by = v_actor
   where id = p_variant_id and organization_id = v_org;

  if not found then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_exercise_variant_reviewed(uuid, boolean) from public, anon;
grant execute on function public.set_exercise_variant_reviewed(uuid, boolean) to authenticated;

comment on function public.set_exercise_variant_reviewed(uuid, boolean) is
  'UEB-012 (ANN-386): setzt oder nimmt den Pruefvermerk einer Variante - die Praxis hat sie fachlich durchgesehen. Nur nach app.can_manage_exercise_library(); Person und Zeit stehen an der Zeile.';

-- Durchgesehen ist, was durchgesehen wurde: Aendert sich der Inhalt einer
-- Variante - Bezeichnung, Alltagsname, Anleitung, Ausruestung, typische
-- Fehler, Hinweise -, faellt der Pruefvermerk (ANN-386). Speichern ohne
-- Aenderung laesst ihn stehen.
--
-- Aus 20261017100000_ueb_001_exercise_library.sql; gleiche Argumente, gleiche
-- Rechte. Neu ist allein der Vergleich mit der gespeicherten Fassung.
-- Standarddosierung und Bild aendert dieser Weg nicht: Geschrieben werden sie
-- nur beim Uebernehmen, und das ueberschreibt nie. Ein kuenftiger Schreibweg
-- fuer sie nimmt den Vermerk ebenso.
create or replace function public.save_exercise_variant(
  p_variant_id     uuid,
  p_exercise_id    uuid,
  p_name           text,
  p_lay_name       text,
  p_instruction    text,
  p_equipment      text[],
  p_common_faults  text,
  p_practice_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor          uuid := auth.uid();
  v_org            uuid;
  v_name           text;
  v_lay_name       text;
  v_instruction    text;
  v_equipment      text[];
  v_common_faults  text;
  v_practice_notes text;
  v_alt            public.exercise_variants%rowtype;
  v_geaendert      boolean;
  v_id             uuid;
begin
  v_org := app.exercise_library_writer();
  v_name := app.exercise_required_name(p_name, 'name');
  v_lay_name := app.exercise_required_name(p_lay_name, 'lay name');

  -- Schlagworte getrimmt, ohne leere und ohne doppelte (gross/klein egal), in
  -- der Reihenfolge der Eingabe; von doppelten bleibt die erste Schreibweise.
  select coalesce(array_agg(eintrag order by erste), '{}'::text[])
    into v_equipment
  from (
    select (array_agg(btrim(e, E' \t\r\n') order by nr))[1] as eintrag, min(nr) as erste
    from unnest(coalesce(p_equipment, '{}'::text[])) with ordinality as t(e, nr)
    where btrim(coalesce(e, ''), E' \t\r\n') <> ''
    group by lower(btrim(e, E' \t\r\n'))
  ) s;
  if cardinality(v_equipment) > 8 then
    raise exception 'too many equipment tags' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_equipment) e where length(e) > 40) then
    raise exception 'equipment tag is too long' using errcode = '22023';
  end if;
  v_instruction := app.exercise_optional_text(p_instruction, 'instruction');
  v_common_faults := app.exercise_optional_text(p_common_faults, 'common faults');
  v_practice_notes := app.exercise_optional_text(p_practice_notes, 'practice notes');

  if p_variant_id is null then
    if not exists (
      select 1 from public.exercises e where e.id = p_exercise_id and e.organization_id = v_org
    ) then
      raise exception 'exercise not found' using errcode = 'P0002';
    end if;

    insert into public.exercise_variants (
      organization_id, exercise_id, name, lay_name, instruction, equipment,
      common_faults, practice_notes, created_by, updated_by
    )
    values (
      v_org, p_exercise_id, v_name, v_lay_name, v_instruction, v_equipment,
      v_common_faults, v_practice_notes, v_actor, v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  select v.* into v_alt
  from public.exercise_variants v
  where v.id = p_variant_id and v.organization_id = v_org
  for update;
  if not found then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;

  -- ANN-386: Jede tatsaechliche Aenderung am Inhalt nimmt den Pruefvermerk.
  v_geaendert := (v_alt.name, v_alt.lay_name, v_alt.instruction, v_alt.equipment,
                  v_alt.common_faults, v_alt.practice_notes)
                 is distinct from
                 (v_name, v_lay_name, v_instruction, v_equipment,
                  v_common_faults, v_practice_notes);

  update public.exercise_variants
     set name = v_name,
         lay_name = v_lay_name,
         instruction = v_instruction,
         equipment = v_equipment,
         common_faults = v_common_faults,
         practice_notes = v_practice_notes,
         reviewed_at = case when v_geaendert then null else reviewed_at end,
         reviewed_by = case when v_geaendert then null else reviewed_by end,
         updated_at = now(),
         updated_by = v_actor
   where id = v_alt.id
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'a variant with this name already exists' using errcode = '23505';
end;
$$;

revoke all on function public.save_exercise_variant(uuid, uuid, text, text, text, text[], text, text) from public, anon;
grant execute on function public.save_exercise_variant(uuid, uuid, text, text, text, text[], text, text) to authenticated;

comment on function public.save_exercise_variant(uuid, uuid, text, text, text, text[], text, text) is
  'UEB-001/UEB-012: legt eine Variante an einer Uebung an (ohne Kennung) oder aendert sie; die Uebung bleibt dieselbe. Aendert sich der Inhalt tatsaechlich, faellt der Pruefvermerk (ANN-386). Nur nach app.can_manage_exercise_library() (ANN-293).';

-- -----------------------------------------------------------------------------
-- 6. Ein Katalogeintrag (ANN-382): vollstaendig geprueft, in der Form der
-- Bibliothek. Der Client schickt den Inhalt; owner darf denselben Inhalt
-- auch von Hand anlegen. Geprueft wird trotzdem alles - Werte, Laengen,
-- Groessen -, weil ein Import viele Zeilen auf einmal schreibt.
-- -----------------------------------------------------------------------------

-- Ein Text aus jsonb, nur wenn es eine Zeichenkette ist.
create function app.exercise_json_text(p jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'string' then p #>> '{}' end
$$;

revoke all on function app.exercise_json_text(jsonb) from public, anon, authenticated;

-- Eine Liste von Saetzen: Zeichenketten, getrimmt nicht leer, je hoechstens
-- 240 Zeichen; zusammen mit Zeilenumbruechen.
create function app.exercise_catalog_lines(p jsonb, p_min integer, p_feld text, p_schluessel text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_zeilen text[] := '{}';
  v_zeile  jsonb;
  v_text   text;
begin
  if p is null or jsonb_typeof(p) = 'null' then
    p := '[]'::jsonb;
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < p_min or jsonb_array_length(p) > 8 then
    raise exception 'catalog entry %: % is invalid', p_schluessel, p_feld using errcode = '22023';
  end if;
  for v_zeile in select value from jsonb_array_elements(p) loop
    v_text := btrim(coalesce(app.exercise_json_text(v_zeile), ''), E' \t\r\n');
    if v_text = '' or length(v_text) > 240 then
      raise exception 'catalog entry %: % is invalid', p_schluessel, p_feld using errcode = '22023';
    end if;
    v_zeilen := v_zeilen || v_text;
  end loop;
  return nullif(array_to_string(v_zeilen, E'\n'), '');
end;
$$;

revoke all on function app.exercise_catalog_lines(jsonb, integer, text, text) from public, anon, authenticated;

create function app.exercise_catalog_entry(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
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
  v_bild        jsonb;
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
                    'dosierung', 'anleitung', 'fehler', 'hinweise_praxis', 'bild')
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

  -- Das Bild (ANN-381): optional; wenn, dann gueltig und klein.
  v_bild := p -> 'bild';
  if v_bild is not null and jsonb_typeof(v_bild) = 'null' then
    v_bild := null;
  end if;
  if not app.exercise_illustration_valid(v_bild) then
    raise exception 'catalog entry %: illustration is invalid', v_schluessel using errcode = '22023';
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
    'default_dosage', v_dosis,
    'illustration', v_bild
  );
end;
$$;

revoke all on function app.exercise_catalog_entry(jsonb) from public, anon, authenticated;

comment on function app.exercise_catalog_entry(jsonb) is
  'UEB-012 (ANN-382): prueft einen Katalogeintrag vollstaendig (Werte, Laengen, Groessen) und liefert ihn in der Form der Bibliothek. Wirft 22023 mit Schluessel und Grund.';

-- -----------------------------------------------------------------------------
-- 7. Uebernehmen (ANN-382, ANN-385)
--
-- Erst wird ALLES geprueft, dann geschrieben - ein ungueltiger Eintrag
-- uebernimmt nichts. Je Eintrag eine Uebung mit einer Variante. Was es in der
-- Praxis schon gibt (gleicher catalog_key), wird uebersprungen und nie
-- ueberschrieben; heisst schon eine Uebung so, ist das ein Namenskonflikt und
-- wird gemeldet. Die interne Fassung nimmt Organisation und Person als
-- Argument - fuer Seed und Test-Umgebung; aufrufen kann sie keine
-- Anwendungsrolle.
-- -----------------------------------------------------------------------------
create function app.import_exercise_catalog_for(
  p_org              uuid,
  p_actor            uuid,
  p_entries          jsonb,
  p_feste_kennungen  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

    -- ANN-380: Feste Kennungen nur fuer den Seed - derselbe Stand nach jedem Aufsetzen.
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
      starting_position, level, default_dosage, illustration, created_by, updated_by
    )
    values (
      v_variante, p_org, v_uebung, v_neu ->> 'name', v_neu ->> 'lay_name',
      v_neu ->> 'instruction',
      array(select jsonb_array_elements_text(v_neu -> 'equipment')),
      v_neu ->> 'common_faults', v_neu ->> 'practice_notes',
      v_neu ->> 'catalog_key', v_neu ->> 'catalog_version', v_neu ->> 'goal',
      v_neu ->> 'starting_position', (v_neu ->> 'level')::smallint,
      v_neu -> 'default_dosage', nullif(v_neu -> 'illustration', 'null'::jsonb),
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

revoke all on function app.import_exercise_catalog_for(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;

comment on function app.import_exercise_catalog_for(uuid, uuid, jsonb, boolean) is
  'UEB-012 (ANN-382): uebernimmt Katalogeintraege in die Bibliothek einer Organisation - erst alles pruefen, dann je Eintrag Uebung und Variante; vorhandene catalog_key ueberspringen, Namenskonflikte melden, nie ueberschreiben. Intern: fuer Seed und public.import_exercise_catalog, fuer keine Anwendungsrolle ausfuehrbar.';

create function public.import_exercise_catalog(p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.exercise_library_writer();
  return app.import_exercise_catalog_for(v_org, auth.uid(), p_entries, false);
end;
$$;

revoke all on function public.import_exercise_catalog(jsonb) from public, anon;
grant execute on function public.import_exercise_catalog(jsonb) to authenticated;

comment on function public.import_exercise_catalog(jsonb) is
  'UEB-012 (ANN-385): uebernimmt den mitgelieferten Katalog in die Bibliothek der Praxis - nur nach app.can_manage_exercise_library() (owner, ANN-293). Liefert imported, skipped und conflicts. Keine neue Auditaktion: created_by steht an der Zeile.';

-- -----------------------------------------------------------------------------
-- 8. Lesen: die Bibliothek mit Katalogfeldern
--
-- Aus 20261017110000_ueb_002_variant_links.sql (juengste Fassung); neu sind
-- die Felder der Variante. Sortiert weiter nach Bezeichnung und nach nichts
-- sonst (ADR-006 Punkt 10).
-- -----------------------------------------------------------------------------
create or replace function public.list_exercise_library()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
                -- UEB-012
                'catalog_key', v.catalog_key,
                'catalog_version', v.catalog_version,
                'goal', v.goal,
                'starting_position', v.starting_position,
                'level', v.level,
                'default_dosage', v.default_dosage,
                'illustration', v.illustration,
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

comment on function public.list_exercise_library() is
  'UEB-001/002/012: die Uebungsbibliothek der Praxis mit Varianten (nach Bezeichnung sortiert, nach nichts sonst) samt Herkunft, Ordnungen, Standarddosierung, Bild und Pruefvermerk, dazu die Verbindungen und ob die anfragende Person pflegen darf. Lesen nach app.can_read_exercise_library() (ANN-293).';

-- -----------------------------------------------------------------------------
-- 9. Der Schritt (ANN-301) kennt das Halten
--
-- ANN-387. Aus 20261018120000_ueb_006_plan_versions.sql; neu ist p_hold_seconds. Das
-- Halten gehoert wie Wiederholungen und Dauer zur Achse "wiederholungen";
-- laenger halten ist schwerer. Je Seite und Haeufigkeit am Tag sind keine
-- Achse - wie der Hinweis aendern sie sich frei, die Frequenz liegt am Plan.
-- -----------------------------------------------------------------------------
drop function app.exercise_plan_step_check(uuid, uuid, integer, integer, integer, integer, text, text, integer, text, text);

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
  p_step_direction     text,
  p_hold_seconds       integer
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

  if (p_reps_min is null) <> (v_vorher.reps_min is null) then
    raise exception 'change is not a single step' using errcode = '22023';
  end if;

  if p_variant_id is distinct from v_vorher.variant_id then
    v_achsen := v_achsen || 'variante'::text;
  end if;
  if p_reps_min is distinct from v_vorher.reps_min or p_reps_max is distinct from v_vorher.reps_max
     or p_duration_seconds is distinct from v_vorher.duration_seconds
     or p_hold_seconds is distinct from v_vorher.hold_seconds then
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
         and (p_reps_max, p_reps_min) is distinct from (v_vorher.reps_max, v_vorher.reps_min)
         and ((p_reps_max, p_reps_min) > (v_vorher.reps_max, v_vorher.reps_min)) <> v_schwerer)
     or (v_achse = 'wiederholungen' and p_duration_seconds is not null
         and (p_duration_seconds > v_vorher.duration_seconds) <> v_schwerer)
     -- Nur das Halten aendert sich: laenger (oder neu) halten ist schwerer.
     or (v_achse = 'wiederholungen'
         and p_hold_seconds is distinct from v_vorher.hold_seconds
         and (p_reps_max, p_reps_min) is not distinct from (v_vorher.reps_max, v_vorher.reps_min)
         and p_duration_seconds is not distinct from v_vorher.duration_seconds
         and (coalesce(p_hold_seconds, 0) > coalesce(v_vorher.hold_seconds, 0)) <> v_schwerer) then
    raise exception 'step direction does not match the change' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.exercise_plan_step_check(uuid, uuid, integer, integer, integer, integer, text, text, integer, text, text, integer)
  from public, anon, authenticated;

comment on function app.exercise_plan_step_check(uuid, uuid, integer, integer, integer, integer, text, text, integer, text, text, integer) is
  'UEB-006/UEB-012 (ANN-301): Eine Position der neuen Fassung aendert gegenueber ihrer vorigen hoechstens eine Achse; Achse und Richtung passen zur Aenderung, eine andere Variante nur ueber eine Verbindung der Bibliothek. Halten gehoert zur Achse wiederholungen.';

-- -----------------------------------------------------------------------------
-- 10. Position anlegen oder aendern - mit Halten, je Seite, am Tag (ANN-384)
--
-- Aus 20261018120000_ueb_006_plan_versions.sql. Die drei neuen Argumente
-- stehen hinten und haben Vorgaben: Wer sie nicht kennt, ruft weiter mit
-- vierzehn. Eine neue Liste der Argumente ist eine neue Funktion; die alte
-- faellt, damit es keine zwei Fassungen nebeneinander gibt.
-- -----------------------------------------------------------------------------
drop function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text);

create function public.save_exercise_plan_item(
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
  p_step_direction     text,
  p_hold_seconds       integer default null,
  p_per_side           boolean default false,
  p_times_per_day      integer default null
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

  -- Dosierung (ANN-299, ANN-384)
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
  if p_hold_seconds is not null and (p_hold_seconds not between 1 and 600 or p_reps_min is null) then
    raise exception 'hold is invalid' using errcode = '22023';
  end if;
  if p_times_per_day is not null and p_times_per_day not between 1 and 10 then
    raise exception 'times per day is invalid' using errcode = '22023';
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
      p_duration_seconds, v_load, v_tempo, p_rest_seconds, p_step_axis, p_step_direction,
      p_hold_seconds);
  end if;

  if p_item_id is null then
    select count(*) into v_anzahl from public.exercise_plan_items i where i.plan_id = v_plan.id;
    if v_anzahl >= 30 then
      raise exception 'too many exercises in plan' using errcode = '22023';
    end if;
    insert into public.exercise_plan_items (
      organization_id, plan_id, position, variant_id, sets, reps_min, reps_max,
      duration_seconds, load, tempo, rest_seconds, double_progression, note,
      hold_seconds, per_side, times_per_day, created_by, updated_by
    )
    values (
      v_plan.organization_id, v_plan.id, v_anzahl + 1, p_variant_id, p_sets, p_reps_min,
      p_reps_max, p_duration_seconds, v_load, v_tempo, p_rest_seconds,
      coalesce(p_double_progression, false), v_note,
      p_hold_seconds, coalesce(p_per_side, false), p_times_per_day, v_actor, v_actor
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
           hold_seconds = p_hold_seconds,
           per_side = coalesce(p_per_side, false),
           times_per_day = p_times_per_day,
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

revoke all on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text, integer, boolean, integer) from public, anon;
grant execute on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text, integer, boolean, integer) to authenticated;

comment on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text, integer, boolean, integer) is
  'UEB-004/006/012: legt eine Position im Entwurf an (ohne Kennung, ans Ende) oder aendert sie - Variante und Dosierung samt Halten, je Seite und Haeufigkeit am Tag (ANN-299, ANN-384); an einer Position aus der vorigen Fassung hoechstens ein Schritt entlang genau einer Achse (ANN-301). Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 11. Neue Fassung: die neuen Dosierfelder gehen mit
--
-- Aus 20261018120000_ueb_006_plan_versions.sql; neu sind hold_seconds,
-- per_side und times_per_day. Das Bild nicht: Die neue Fassung ist ein
-- Entwurf und bekommt ihren Schnappschuss bei ihrer eigenen Zuweisung.
-- -----------------------------------------------------------------------------
create or replace function public.create_exercise_plan_version(p_plan_id uuid)
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
    hold_seconds, per_side, times_per_day, previous_item_id, created_by, updated_by
  )
  select i.organization_id, v_id, i.position, i.variant_id, i.sets, i.reps_min, i.reps_max,
         i.duration_seconds, i.load, i.tempo, i.rest_seconds, i.double_progression, i.note,
         i.hold_seconds, i.per_side, i.times_per_day, i.id, v_actor, v_actor
  from public.exercise_plan_items i
  where i.plan_id = v_plan.id;

  return v_id;
end;
$$;

comment on function public.create_exercise_plan_version(uuid) is
  'UEB-006/UEB-012: legt zu einem zugewiesenen Plan die neue Fassung als Entwurf an - Titel, Einheiten je Woche und alle Positionen samt Dosierung mit Verweis auf ihre vorige (ANN-301). Hoechstens eine Folgefassung je Plan. Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 12. Zuweisen friert das Bild mit ein (ANN-300)
--
-- Aus 20261018110000_ueb_005_assign_exercise_plan.sql; neu ist allein
-- illustration im Schnappschuss.
-- -----------------------------------------------------------------------------
create or replace function public.assign_exercise_plan(p_plan_id uuid, p_runs_until date)
returns void
language plpgsql
security definer
set search_path = ''
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

  -- Der Schnappschuss (ANN-300), seit UEB-012 mit dem Bild.
  update public.exercise_plan_items i
     set exercise_name = e.name,
         exercise_lay_name = e.lay_name,
         variant_name = v.name,
         variant_lay_name = v.lay_name,
         body_region = e.body_region,
         instruction = v.instruction,
         equipment = v.equipment,
         illustration = v.illustration
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

comment on function public.assign_exercise_plan(uuid, date) is
  'UEB-005/UEB-012: weist einen Entwurf mit mindestens einer Uebung zu - friert Bezeichnungen, Anleitung, Ausruestung, Bild und Dosierung ein (ANN-300), setzt die Laufzeit von heute bis p_runs_until (hoechstens 26 Wochen, ANN-302) und loest eine laufende vorige Fassung ab (ANN-301). Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 13. Position fuer die Praxis: Bild und neue Dosierfelder
--
-- Aus 20261018100000_ueb_004_exercise_plans.sql. Im Entwurf das Bild der
-- Bibliothek, nach der Zuweisung der Schnappschuss - wie die Anleitung.
-- -----------------------------------------------------------------------------
create or replace function app.exercise_plan_item_json(p_item public.exercise_plan_items)
returns jsonb
language sql
stable
security definer
set search_path = ''
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
    'illustration', case when p_item.variant_name is not null then p_item.illustration else v.illustration end,
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

-- -----------------------------------------------------------------------------
-- 14. Position fuer die Plattform - feste Schluesselliste (ADR-023 Punkt 22)
--
-- Aus 20261019100000_ueb_009_platform_exercise_plans.sql. Neu und
-- ausdruecklich in der Liste: das eingefrorene Bild und die drei
-- Dosierfelder. Weiterhin keine Kennung der Bibliothek, kein fachlicher Name,
-- keine Herkunft aus dem Katalog.
-- -----------------------------------------------------------------------------
create or replace function app.platform_exercise_plan_item_json(p_item public.exercise_plan_items)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_item.id,
    'position', p_item.position,
    'variant_lay_name', p_item.variant_lay_name,
    'instruction', p_item.instruction,
    'equipment', to_jsonb(coalesce(p_item.equipment, '{}'::text[])),
    'illustration', p_item.illustration,
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
