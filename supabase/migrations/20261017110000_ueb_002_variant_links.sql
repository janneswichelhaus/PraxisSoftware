-- =============================================================================
-- UEB-002 (UEB-EPIC-001): Achsen und Nachbarschaften
--
-- Varianten sind ueber gerichtete Verbindungen verknuepft: von der leichteren
-- zur schwereren, entlang genau EINER Achse aus IDEA-TRN-004 (Last,
-- Wiederholungen, Saetze, Bewegungsausmass, Hebel, Unterstuetzung,
-- Unterstuetzungsflaeche, Tempo, Dichte, Komplexitaet, Geschwindigkeit,
-- Frequenz). "Kniebeuge am Gelaender -> Kniebeuge freistehend" ist ein
-- Schritt auf der Achse Unterstuetzung.
--
--   public.exercise_variant_links      die Verbindung
--   app.exercise_axes                  die Achsen (ANN-294)
--   public.link_exercise_variants      Verbindung anlegen
--   public.unlink_exercise_variants    Verbindung loesen
--   public.list_exercise_library       + die Verbindungen
--
-- KEINE PROGRESSION ALS VORSCHLAG (ADR-006 Punkt 10, §17 Verbot 1): Die
-- Verbindungen werden angezeigt, wenn eine Person eine Variante aufruft - als
-- "leichter" und "schwerer". Keine Funktion waehlt daraus etwas aus, und
-- keine liest dafuer Angaben einer Person. Eine Engine, die sich entlang der
-- Kanten bewegt (IDEA-TRN-005), ist MDR_REVIEW_REQUIRED und entsteht hier
-- nicht.
--
-- EINE ACHSE JE SCHRITT (ANN-294): Zwischen zwei Varianten gibt es hoechstens
-- eine Verbindung, gleich in welcher Richtung - zwei Varianten, die sich in
-- zwei Achsen unterscheiden, sind kein Schritt, sondern zwei. Kreise sind
-- ausgeschlossen: Was ueber Verbindungen schwerer ist, wird nicht zugleich
-- leichter.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Achsen (ANN-294)
-- -----------------------------------------------------------------------------
create function app.exercise_axes()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'last', 'wiederholungen', 'saetze', 'bewegungsausmass', 'hebel',
    'unterstuetzung', 'unterstuetzungsflaeche', 'tempo', 'dichte',
    'komplexitaet', 'geschwindigkeit', 'frequenz'
  ]::text[]
$$;

revoke all on function app.exercise_axes() from public, anon, authenticated;

comment on function app.exercise_axes() is
  'UEB-002 (ANN-294): die Achsen einer Verbindung nach IDEA-TRN-004. Die eine Stelle fuer die Liste; Gegenstueck in src/features/exercises/types.ts.';

-- -----------------------------------------------------------------------------
-- 2. Die Verbindung
-- -----------------------------------------------------------------------------
create table public.exercise_variant_links (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  easier_variant_id uuid not null,
  harder_variant_id uuid not null,
  axis              text not null check (axis = any (app.exercise_axes())),
  created_at        timestamptz not null default now(),
  created_by        uuid not null,
  constraint exercise_variant_links_easier_fk
    foreign key (easier_variant_id, organization_id)
    references public.exercise_variants (id, organization_id) on delete restrict,
  constraint exercise_variant_links_harder_fk
    foreign key (harder_variant_id, organization_id)
    references public.exercise_variants (id, organization_id) on delete restrict,
  constraint exercise_variant_links_not_self check (easier_variant_id <> harder_variant_id)
);

comment on table public.exercise_variant_links is
  'UEB-002: gerichtete Verbindung zweier Varianten der Uebungsbibliothek - von der leichteren zur schwereren, entlang genau einer Achse (IDEA-TRN-004, IDEA-TRN-005, ANN-294). Wird nur angezeigt, nie zur Auswahl benutzt (ADR-006 Punkt 10). Datenklasse: Betriebsdaten der Praxis OHNE Personenbezug. Frist: bis die Praxis die Verbindung loest. Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.exercise_variant_links.axis is
  'Die eine Achse, in der sich die beiden Varianten unterscheiden (app.exercise_axes(), ANN-294).';

-- Hoechstens eine Verbindung je Paar, gleich in welcher Richtung (ANN-294).
create unique index exercise_variant_links_pair_unique
  on public.exercise_variant_links (
    least(easier_variant_id, harder_variant_id),
    greatest(easier_variant_id, harder_variant_id)
  );
create index exercise_variant_links_easier_idx
  on public.exercise_variant_links (easier_variant_id);
create index exercise_variant_links_harder_idx
  on public.exercise_variant_links (harder_variant_id);

revoke all on public.exercise_variant_links from anon, authenticated;
alter table public.exercise_variant_links enable row level security;

-- Datenklasse (ADR-008, ADR-013 Punkt 9 Nr. 4)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'exercise_variant_links', 'betriebsdaten', 'keine',
  'Verbindungen der Uebungsbibliothek (UEB-002). Ohne Personenbezug; bleiben, bis die Praxis sie loest. Eine verbundene Variante laesst sich erst nach dem Loesen loeschen (FK restrict, ANN-296).',
  207
);

-- -----------------------------------------------------------------------------
-- 3. Verbindung anlegen
-- -----------------------------------------------------------------------------
create function public.link_exercise_variants(
  p_easier_variant_id uuid,
  p_harder_variant_id uuid,
  p_axis              text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_id    uuid;
begin
  v_org := app.exercise_library_writer();

  if p_axis is null or not (p_axis = any (app.exercise_axes())) then
    raise exception 'axis is invalid' using errcode = '22023';
  end if;
  if p_easier_variant_id is null or p_harder_variant_id is null then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;
  if p_easier_variant_id = p_harder_variant_id then
    raise exception 'variant cannot be linked to itself' using errcode = '22023';
  end if;

  -- Beide Varianten in dieser Praxis; eine fremde und eine nicht vorhandene
  -- sehen gleich aus.
  if (
    select count(*) from public.exercise_variants v
    where v.id in (p_easier_variant_id, p_harder_variant_id) and v.organization_id = v_org
  ) <> 2 then
    raise exception 'exercise variant not found' using errcode = 'P0002';
  end if;

  -- Archiviert ist auch eine Variante, deren Uebung archiviert ist: Beide
  -- stehen nicht mehr in der Bibliothek (ANN-296).
  if exists (
    select 1
    from public.exercise_variants v
    join public.exercises e on e.id = v.exercise_id
    where v.id in (p_easier_variant_id, p_harder_variant_id)
      and (v.archived_at is not null or e.archived_at is not null)
  ) then
    raise exception 'archived variant cannot be linked' using errcode = '22023';
  end if;

  -- Zwei gleichzeitige Verbindungen koennten zusammen einen Kreis schliessen,
  -- den jede fuer sich nicht sieht: je Praxis nacheinander.
  perform pg_advisory_xact_lock(hashtextextended('exercise_variant_links:' || v_org::text, 0));

  if exists (
    select 1 from public.exercise_variant_links l
    where least(l.easier_variant_id, l.harder_variant_id)
            = least(p_easier_variant_id, p_harder_variant_id)
      and greatest(l.easier_variant_id, l.harder_variant_id)
            = greatest(p_easier_variant_id, p_harder_variant_id)
  ) then
    raise exception 'variants are already linked' using errcode = '23505';
  end if;

  -- Kein Kreis: Fuehrt von der schwereren schon ein Weg zur leichteren, waere
  -- die leichtere zugleich schwerer.
  if exists (
    with recursive schwerer_als(variante) as (
      select p_harder_variant_id
      union
      select l.harder_variant_id
      from public.exercise_variant_links l
      join schwerer_als s on s.variante = l.easier_variant_id
      where l.organization_id = v_org
    )
    select 1 from schwerer_als where variante = p_easier_variant_id
  ) then
    raise exception 'link would form a cycle' using errcode = '22023';
  end if;

  insert into public.exercise_variant_links (
    organization_id, easier_variant_id, harder_variant_id, axis, created_by
  )
  values (v_org, p_easier_variant_id, p_harder_variant_id, p_axis, v_actor)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'variants are already linked' using errcode = '23505';
end;
$$;

revoke all on function public.link_exercise_variants(uuid, uuid, text) from public, anon;
grant execute on function public.link_exercise_variants(uuid, uuid, text) to authenticated;

comment on function public.link_exercise_variants(uuid, uuid, text) is
  'UEB-002: verbindet zwei Varianten von der leichteren zur schwereren entlang einer Achse (ANN-294); hoechstens eine Verbindung je Paar, kein Kreis, keine archivierte Variante. Nur nach app.can_manage_exercise_library().';

-- -----------------------------------------------------------------------------
-- 4. Verbindung loesen
-- -----------------------------------------------------------------------------
create function public.unlink_exercise_variants(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.exercise_library_writer();

  delete from public.exercise_variant_links where id = p_link_id and organization_id = v_org;
  if not found then
    raise exception 'exercise variant link not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.unlink_exercise_variants(uuid) from public, anon;
grant execute on function public.unlink_exercise_variants(uuid) to authenticated;

comment on function public.unlink_exercise_variants(uuid) is
  'UEB-002: loest eine Verbindung zweier Varianten. Nur nach app.can_manage_exercise_library().';

-- -----------------------------------------------------------------------------
-- 5. Lesen: die Bibliothek mit ihren Verbindungen
--
-- Aus 20261017100000_ueb_001_exercise_library.sql; neu sind die Verbindungen.
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
    ), '[]'::jsonb),
    -- UEB-002: die Verbindungen, ohne Reihenfolge mit Bedeutung.
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
  'UEB-001/002: die Uebungsbibliothek der Praxis mit Varianten (nach Bezeichnung sortiert) und ihren Verbindungen; dazu, ob die anfragende Person pflegen darf. Lesen nach app.can_read_exercise_library() (ANN-293).';
