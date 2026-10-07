-- =============================================================================
-- UEB-001 (UEB-EPIC-001): Uebung und Variante
--
-- Die Uebungsbibliothek der Praxis (IDEA-TRN-005, IDEA-QSN-002). Getrennt
-- wird die UEBUNG (Kniebeuge) von ihrer VARIANTE (Kniebeuge am Gelaender,
-- halbe Tiefe, beidbeinig). Beide tragen zwei Bezeichnungen: eine fachliche
-- fuer die Praxis und eine alltagssprachliche fuer Patient:innen und
-- Kund:innen - als zwei Felder, nicht als spaetere Uebersetzung.
--
--   public.exercises                   die Uebung
--   public.exercise_variants           ihre Varianten
--   app.exercise_body_regions          die Koerperregionen (ANN-295)
--   app.can_read_exercise_library      wer liest (ANN-293)
--   app.can_manage_exercise_library    wer pflegt (ANN-293)
--   public.list_exercise_library       die ganze Bibliothek in einem Aufruf
--   public.save_exercise               Uebung anlegen oder aendern
--   public.save_exercise_variant       Variante anlegen oder aendern
--   public.set_exercise_archived       Uebung archivieren / zurueckholen
--   public.set_exercise_variant_archived  dasselbe fuer eine Variante
--   public.delete_exercise             Uebung ohne Varianten loeschen
--   public.delete_exercise_variant     Variante loeschen (ANN-296)
--
-- EINE BIBLIOTHEK FUER BEIDE LEISTUNGSBEREICHE (ANN-292): Eine Uebung ist
-- Fachwissen der Praxis, kein Datum einer Person. Sie traegt deshalb keinen
-- Leistungsbereich und faellt nicht unter den Schnitt aus 4.8 / ADR-021
-- Punkt 6 - Behandlung und Training lesen dieselbe Bibliothek. Personen-
-- bezogen wird eine Uebung erst im Plan (UEB-EPIC-002), und der haengt dann an
-- seinem Verhaeltnis.
--
-- KEINE AUSWAHL (ADR-006 Punkt 10, Verbot 1): Die Bibliothek ist Katalog und
-- Suche. Keine Spalte verweist auf Diagnose, Befund oder Verlauf, und keine
-- Funktion sortiert oder filtert danach. Die "Hinweise fuer die Praxis" sind
-- Freitext zum Nachlesen und werden nie gegen Angaben einer Person
-- abgeglichen.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer was angelegt, geaendert und
-- archiviert hat, steht an der Zeile.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Koerperregionen (ANN-295)
--
-- Eine feste, grobe Liste ohne Seitenangabe: Eine Uebung fuer das Knie ist
-- eine Uebung fuer beide Knie. Die Liste steht hier und in
-- src/features/exercises/types.ts; supabase/tests/exercise-library.test.ts
-- haelt beide gleich.
-- -----------------------------------------------------------------------------
create function app.exercise_body_regions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'hws', 'bws', 'lws', 'schulter', 'ellenbogen', 'hand',
    'huefte', 'knie', 'fuss', 'rumpf', 'ganzkoerper'
  ]::text[]
$$;

revoke all on function app.exercise_body_regions() from public, anon, authenticated;

comment on function app.exercise_body_regions() is
  'UEB-001 (ANN-295): die Koerperregionen einer Uebung - grob und ohne Seite. Die eine Stelle fuer die Liste; Gegenstueck in src/features/exercises/types.ts.';

-- -----------------------------------------------------------------------------
-- 2. Die Uebung
-- -----------------------------------------------------------------------------
create table public.exercises (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Fachliche Bezeichnung fuer die Praxis.
  name            text not null check (length(btrim(name)) between 1 and 120),
  -- Alltagssprachliche Bezeichnung fuer Patient:innen und Kund:innen
  -- (IDEA-QSN-002).
  lay_name        text not null check (length(btrim(lay_name)) between 1 and 120),
  body_region     text not null check (body_region = any (app.exercise_body_regions())),
  archived_at     timestamptz,
  archived_by     uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  -- Zielschluessel fuer die Varianten: Eine Variante liegt in derselben
  -- Organisation wie ihre Uebung.
  constraint exercises_id_organization unique (id, organization_id),
  constraint exercises_archived_stamp check ((archived_at is null) = (archived_by is null))
);

comment on table public.exercises is
  'UEB-001: Uebung der Bibliothek (IDEA-TRN-005) mit fachlicher und alltagssprachlicher Bezeichnung (IDEA-QSN-002). Eine Bibliothek fuer Behandlung und Training (ANN-292). Datenklasse: Betriebsdaten der Praxis OHNE Personenbezug, keine Gesundheitsdaten. Frist: bis zur Loeschung durch die Praxis (ANN-296). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.exercises.lay_name is
  'Bezeichnung in Alltagssprache (IDEA-QSN-002): was Patient:innen und Kund:innen lesen.';
comment on column public.exercises.body_region is
  'Koerperregion aus app.exercise_body_regions() (ANN-295). Fuer Suche und Filter, nie fuer eine Auswahl aus klinischen Angaben (ADR-006 Punkt 10).';
comment on column public.exercises.archived_at is
  'Archiviert statt geloescht (ANN-296): erscheint nicht mehr in der Bibliothek, bleibt aber nachlesbar.';

create unique index exercises_name_unique
  on public.exercises (organization_id, lower(btrim(name)));

revoke all on public.exercises from anon, authenticated;
alter table public.exercises enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Die Variante
-- -----------------------------------------------------------------------------
create table public.exercise_variants (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  exercise_id     uuid not null,
  name            text not null check (length(btrim(name)) between 1 and 120),
  lay_name        text not null check (length(btrim(lay_name)) between 1 and 120),
  -- Kurzanleitung in Alltagssprache: was die Person liest, wenn sie uebt.
  instruction     text check (instruction is null or length(btrim(instruction, E' \t\r\n')) between 1 and 1000),
  -- Schlagworte, frei (ANN-295): "Gelaender", "Theraband gelb".
  equipment       text[] not null default '{}'::text[]
                    check (cardinality(equipment) <= 8),
  -- Typische Ausweichbewegungen - fachlich, fuer die Praxis.
  common_faults   text check (common_faults is null or length(btrim(common_faults, E' \t\r\n')) between 1 and 1000),
  -- Hinweise fuer die Praxis. Freitext zum Nachlesen; nie Filter, nie Abgleich
  -- mit Angaben einer Person (ADR-006 Punkt 10).
  practice_notes  text check (practice_notes is null or length(btrim(practice_notes, E' \t\r\n')) between 1 and 1000),
  archived_at     timestamptz,
  archived_by     uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  constraint exercise_variants_exercise_fk
    foreign key (exercise_id, organization_id)
    references public.exercises (id, organization_id) on delete restrict,
  constraint exercise_variants_id_organization unique (id, organization_id),
  constraint exercise_variants_archived_stamp check ((archived_at is null) = (archived_by is null))
);

comment on table public.exercise_variants is
  'UEB-001: Variante einer Uebung (IDEA-TRN-005) - die Form, in der geuebt wird. Fachlich und alltagssprachlich benannt (IDEA-QSN-002), mit Kurzanleitung, Ausruestung, Ausweichbewegungen und Hinweisen fuer die Praxis. Datenklasse: Betriebsdaten der Praxis OHNE Personenbezug. Frist: bis zur Loeschung durch die Praxis (ANN-296). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.exercise_variants.instruction is
  'Kurzanleitung in Alltagssprache (IDEA-QSN-002). Freitext, der nie in Logs erscheint (ADR-011).';
comment on column public.exercise_variants.equipment is
  'Ausruestung als freie Schlagworte (ANN-295), hoechstens acht, je hoechstens 40 Zeichen.';
comment on column public.exercise_variants.practice_notes is
  'Hinweise fuer die Praxis (Vorsicht, Abgrenzung). Nur zum Nachlesen - keine Funktion gleicht sie mit Diagnose, Befund oder Verlauf ab (ADR-006 Punkt 10).';

create index exercise_variants_exercise_idx
  on public.exercise_variants (exercise_id);
create unique index exercise_variants_name_unique
  on public.exercise_variants (exercise_id, lower(btrim(name)));

revoke all on public.exercise_variants from anon, authenticated;
alter table public.exercise_variants enable row level security;

-- Datenklasse (ADR-008, ADR-013 Punkt 9 Nr. 4)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('exercises', 'betriebsdaten', 'keine',
   'Uebungsbibliothek (UEB-001). Fachwissen der Praxis ohne Personenbezug; bleibt, bis die Praxis die Uebung loescht (ANN-296). Archivieren nimmt sie aus der Bibliothek, ohne sie zu loeschen.',
   205),
  ('exercise_variants', 'betriebsdaten', 'keine',
   'Varianten der Uebungsbibliothek (UEB-001). Wie die Uebung: bleiben, bis die Praxis sie loescht (ANN-296); eine Uebung laesst sich erst ohne Varianten loeschen (FK restrict).',
   206);

-- -----------------------------------------------------------------------------
-- 4. Wer liest, wer pflegt (ANN-293)
--
-- Lesen: wer Uebungen anleitet - owner, therapist, team_lead und die
-- Trainingsbetreuung. Das Buero nicht: Es leitet keine Uebung an, und eine
-- Bibliothek, die es nicht braucht, muss es nicht sehen (Datenminimierung).
--
-- Pflegen: owner. Die Bibliothek ist eine kuratierte fachliche Leistung
-- (IDEA-TRN-005); wer sie aendert, aendert, was alle Plaene der Praxis
-- spaeter anbieten. Dieselbe Ueberlegung wie bei den praxisweiten
-- Textbausteinen (app.can_manage_shared_text_snippets).
-- -----------------------------------------------------------------------------
create function app.can_read_exercise_library()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'trainer')
$$;

revoke all on function app.can_read_exercise_library() from public, anon;
grant execute on function app.can_read_exercise_library() to authenticated;

comment on function app.can_read_exercise_library() is
  'UEB-001 (ANN-293): wer die Uebungsbibliothek liest - owner, therapist, team_lead, trainer. Die eine Stelle fuer die Regel.';

create function app.can_manage_exercise_library()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

revoke all on function app.can_manage_exercise_library() from public, anon;
grant execute on function app.can_manage_exercise_library() to authenticated;

comment on function app.can_manage_exercise_library() is
  'UEB-001 (ANN-293): wer die Uebungsbibliothek pflegt - owner. Die eine Stelle fuer die Regel.';

-- Gemeinsamer Einstieg aller Schreibpfade: angemeldet, darf pflegen, hat eine
-- Organisation. Liefert die Organisation.
create function app.exercise_library_writer()
returns uuid
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
  if not app.can_manage_exercise_library() then
    raise exception 'not allowed to manage the exercise library' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage the exercise library' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

revoke all on function app.exercise_library_writer() from public, anon, authenticated;

-- Freitext: getrimmt, leer wird null, zu lang ist ein Eingabefehler.
create function app.exercise_optional_text(p_text text, p_field text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
begin
  if v_text is not null and length(v_text) > 1000 then
    raise exception '% is too long', p_field using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.exercise_optional_text(text, text) from public, anon, authenticated;

-- Bezeichnung: getrimmt (auch Tabulator und Zeilenumbruch), Pflicht,
-- hoechstens 120 Zeichen.
create function app.exercise_required_name(p_text text, p_field text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''), E' \t\r\n');
begin
  if v_text = '' then
    raise exception '% is required', p_field using errcode = '22023';
  end if;
  if length(v_text) > 120 then
    raise exception '% is too long', p_field using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.exercise_required_name(text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Lesen: die ganze Bibliothek in einem Aufruf
--
-- Eine Praxisbibliothek hat Dutzende, keine Zehntausende Eintraege; Suche und
-- Filter laufen deshalb in der Oberflaeche ueber dieser einen Antwort.
-- Sortiert nach Bezeichnung - keine andere Reihenfolge (ADR-006 Punkt 10).
-- Kein Auditeintrag: gelesen wird Fachwissen der Praxis, kein Datum einer
-- Person.
-- -----------------------------------------------------------------------------
create function public.list_exercise_library()
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
                'archived', v.archived_at is not null
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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_exercise_library() from public, anon;
grant execute on function public.list_exercise_library() to authenticated;

comment on function public.list_exercise_library() is
  'UEB-001: die Uebungsbibliothek der Praxis mit Varianten, nach Bezeichnung sortiert; dazu, ob die anfragende Person pflegen darf. Lesen nach app.can_read_exercise_library() (ANN-293).';

-- -----------------------------------------------------------------------------
-- 6. Uebung anlegen oder aendern
-- -----------------------------------------------------------------------------
create function public.save_exercise(
  p_exercise_id uuid,
  p_name        text,
  p_lay_name    text,
  p_body_region text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_org      uuid;
  v_name     text;
  v_lay_name text;
  v_id       uuid;
begin
  v_org := app.exercise_library_writer();
  v_name := app.exercise_required_name(p_name, 'name');
  v_lay_name := app.exercise_required_name(p_lay_name, 'lay name');
  if p_body_region is null or not (p_body_region = any (app.exercise_body_regions())) then
    raise exception 'body region is invalid' using errcode = '22023';
  end if;

  if p_exercise_id is null then
    insert into public.exercises (
      organization_id, name, lay_name, body_region, created_by, updated_by
    )
    values (v_org, v_name, v_lay_name, p_body_region, v_actor, v_actor)
    returning id into v_id;
    return v_id;
  end if;

  update public.exercises
     set name = v_name,
         lay_name = v_lay_name,
         body_region = p_body_region,
         updated_at = now(),
         updated_by = v_actor
   where id = p_exercise_id and organization_id = v_org
  returning id into v_id;

  if v_id is null then
    raise exception 'exercise not found' using errcode = 'P0002';
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'an exercise with this name already exists' using errcode = '23505';
end;
$$;

revoke all on function public.save_exercise(uuid, text, text, text) from public, anon;
grant execute on function public.save_exercise(uuid, text, text, text) to authenticated;

comment on function public.save_exercise(uuid, text, text, text) is
  'UEB-001: legt eine Uebung an (ohne Kennung) oder aendert sie. Nur nach app.can_manage_exercise_library() (ANN-293).';

-- -----------------------------------------------------------------------------
-- 7. Variante anlegen oder aendern
--
-- Eine Variante bleibt bei ihrer Uebung: Die Kennung der Uebung zaehlt nur
-- beim Anlegen. Wer eine Variante woanders braucht, legt sie dort an.
-- -----------------------------------------------------------------------------
create function public.save_exercise_variant(
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
  v_actor     uuid := auth.uid();
  v_org       uuid;
  v_name      text;
  v_lay_name  text;
  v_equipment text[];
  v_id        uuid;
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
      v_org, p_exercise_id, v_name, v_lay_name,
      app.exercise_optional_text(p_instruction, 'instruction'),
      v_equipment,
      app.exercise_optional_text(p_common_faults, 'common faults'),
      app.exercise_optional_text(p_practice_notes, 'practice notes'),
      v_actor, v_actor
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.exercise_variants
     set name = v_name,
         lay_name = v_lay_name,
         instruction = app.exercise_optional_text(p_instruction, 'instruction'),
         equipment = v_equipment,
         common_faults = app.exercise_optional_text(p_common_faults, 'common faults'),
         practice_notes = app.exercise_optional_text(p_practice_notes, 'practice notes'),
         updated_at = now(),
         updated_by = v_actor
   where id = p_variant_id and organization_id = v_org
  returning id into v_id;

  if v_id is null then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'a variant with this name already exists' using errcode = '23505';
end;
$$;

revoke all on function public.save_exercise_variant(uuid, uuid, text, text, text, text[], text, text) from public, anon;
grant execute on function public.save_exercise_variant(uuid, uuid, text, text, text, text[], text, text) to authenticated;

comment on function public.save_exercise_variant(uuid, uuid, text, text, text, text[], text, text) is
  'UEB-001: legt eine Variante an einer Uebung an (ohne Kennung) oder aendert sie; die Uebung bleibt dieselbe. Nur nach app.can_manage_exercise_library() (ANN-293).';

-- -----------------------------------------------------------------------------
-- 8. Archivieren und zurueckholen (ANN-296)
-- -----------------------------------------------------------------------------
create function public.set_exercise_archived(p_exercise_id uuid, p_archived boolean)
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
  if p_archived is null then
    raise exception 'archived is required' using errcode = '22023';
  end if;

  update public.exercises
     set archived_at = case when p_archived then coalesce(archived_at, now()) end,
         archived_by = case when p_archived then coalesce(archived_by, v_actor) end,
         updated_at = now(),
         updated_by = v_actor
   where id = p_exercise_id and organization_id = v_org;

  if not found then
    raise exception 'exercise not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_exercise_archived(uuid, boolean) from public, anon;
grant execute on function public.set_exercise_archived(uuid, boolean) to authenticated;

comment on function public.set_exercise_archived(uuid, boolean) is
  'UEB-001 (ANN-296): nimmt eine Uebung aus der Bibliothek oder holt sie zurueck. Nur nach app.can_manage_exercise_library().';

create function public.set_exercise_variant_archived(p_variant_id uuid, p_archived boolean)
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
  if p_archived is null then
    raise exception 'archived is required' using errcode = '22023';
  end if;

  update public.exercise_variants
     set archived_at = case when p_archived then coalesce(archived_at, now()) end,
         archived_by = case when p_archived then coalesce(archived_by, v_actor) end,
         updated_at = now(),
         updated_by = v_actor
   where id = p_variant_id and organization_id = v_org;

  if not found then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_exercise_variant_archived(uuid, boolean) from public, anon;
grant execute on function public.set_exercise_variant_archived(uuid, boolean) to authenticated;

comment on function public.set_exercise_variant_archived(uuid, boolean) is
  'UEB-001 (ANN-296): nimmt eine Variante aus der Bibliothek oder holt sie zurueck. Nur nach app.can_manage_exercise_library().';

-- -----------------------------------------------------------------------------
-- 9. Loeschen (ANN-296)
--
-- Loeschen ist fuer Versehen da - eine Uebung, die doppelt oder falsch
-- angelegt wurde. Was in Gebrauch war, wird archiviert. Die Uebung erst ohne
-- Varianten; die Variante, solange nichts auf sie zeigt (UEB-002: keine
-- Verbindung, UEB-EPIC-002: kein Plan) - die Fremdschluessel halten das fest.
-- -----------------------------------------------------------------------------
create function public.delete_exercise(p_exercise_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.exercise_library_writer();

  if not exists (
    select 1 from public.exercises e where e.id = p_exercise_id and e.organization_id = v_org
  ) then
    raise exception 'exercise not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.exercise_variants v where v.exercise_id = p_exercise_id) then
    raise exception 'exercise has variants' using errcode = '23503';
  end if;

  delete from public.exercises where id = p_exercise_id and organization_id = v_org;
exception
  -- Entsteht zwischen Pruefung und Loeschen eine Variante, haelt der
  -- Fremdschluessel das Loeschen auf - mit derselben Meldung (ANN-296).
  when foreign_key_violation then
    raise exception 'exercise has variants' using errcode = '23503';
end;
$$;

revoke all on function public.delete_exercise(uuid) from public, anon;
grant execute on function public.delete_exercise(uuid) to authenticated;

comment on function public.delete_exercise(uuid) is
  'UEB-001 (ANN-296): loescht eine Uebung ohne Varianten. Nur nach app.can_manage_exercise_library().';

create function public.delete_exercise_variant(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.exercise_library_writer();

  delete from public.exercise_variants where id = p_variant_id and organization_id = v_org;
  if not found then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;
exception
  when foreign_key_violation then
    raise exception 'exercise variant is in use' using errcode = '23503';
end;
$$;

revoke all on function public.delete_exercise_variant(uuid) from public, anon;
grant execute on function public.delete_exercise_variant(uuid) to authenticated;

comment on function public.delete_exercise_variant(uuid) is
  'UEB-001 (ANN-296): loescht eine Variante, auf die nichts zeigt. Nur nach app.can_manage_exercise_library().';
