-- =============================================================================
-- UEB-014 (Bereich "Uebungen, zweite Runde"): Vorlagen der Praxis
--
-- Neben den 15 mitgelieferten Zusammenstellungen des Katalogs (ANN-444, im
-- Build) legt die Praxis eigene Vorlagen an: "Als Vorlage speichern" an einem
-- Plan nimmt dessen Uebungen mit ihrer Dosierung als Vorlage, "Aus Vorlage"
-- im Planeditor bietet sie neben den mitgelieferten an (K12).
--
--   public.exercise_plan_templates        die Vorlage (Name, Ziel)
--   public.exercise_plan_template_items   ihre Uebungen mit Dosierung
--   app.can_write_exercise_plan_templates wer anlegt (ANN-560)
--   public.list_exercise_plan_templates   alle Vorlagen der Praxis
--   public.save_exercise_plan_template    anlegen oder aendern
--   public.delete_exercise_plan_template  loeschen
--
-- KEIN PERSONENBEZUG (ANN-560): Eine Vorlage ist Fachwissen der Praxis wie
-- die Bibliothek (ANN-292) - Varianten und Dosierung, keine Person, kein
-- Plan, keine Notiz der Position, kein Leistungsbereich. Name und Ziel sind
-- Freitext; die Oberflaeche bittet um Region und Ziel statt Namen oder
-- Diagnose.
--
-- KEINE AUSWAHL (ADR-006 Punkt 10): Die Liste ist nach Name sortiert, nach
-- nichts sonst; keine Spalte verweist auf Diagnose, Befund oder Verlauf.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer was angelegt und geaendert
-- hat, steht an der Zeile.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Vorlage
-- -----------------------------------------------------------------------------
create table public.exercise_plan_templates (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (length(btrim(name, E' \t\r\n')) between 1 and 80),
  goal            text check (goal is null or length(btrim(goal, E' \t\r\n')) between 1 and 200),
  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  constraint exercise_plan_templates_id_organization unique (id, organization_id)
);

comment on table public.exercise_plan_templates is
  'UEB-014 (ANN-560): Vorlage der Praxis fuer Uebungsplaene - Name und Ziel, die Uebungen in exercise_plan_template_items. Fachwissen ohne Personenbezug wie die Bibliothek (ANN-292), fuer Behandlung und Training. Datenklasse: Betriebsdaten der Praxis OHNE Personenbezug, keine Gesundheitsdaten. Frist: bis zur Loeschung durch die Praxis. Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.exercise_plan_templates.name is
  'Name nach Region und Ziel (ANN-560), nie nach Person oder Diagnose; die Liste sortiert danach und nach nichts sonst (ADR-006 Punkt 10).';

create unique index exercise_plan_templates_name_unique
  on public.exercise_plan_templates (organization_id, lower(btrim(name, E' \t\r\n')));

revoke all on public.exercise_plan_templates from anon, authenticated;
alter table public.exercise_plan_templates enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Die Uebungen einer Vorlage
--
-- Dieselben Grenzen wie eine Position im Plan (UEB-004, UEB-012), ohne Notiz,
-- Schritt und Schnappschuss: Die Vorlage zeigt immer die Variante, wie sie
-- jetzt in der Bibliothek steht; eingefroren wird erst der zugewiesene Plan
-- (ANN-300). Wird die Variante geloescht, faellt sie aus der Vorlage.
-- -----------------------------------------------------------------------------
create table public.exercise_plan_template_items (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  template_id        uuid not null,
  position           smallint not null check (position between 1 and 30),
  variant_id         uuid not null,
  sets               smallint not null check (sets between 1 and 20),
  reps_min           smallint check (reps_min between 1 and 100),
  reps_max           smallint check (reps_max between 1 and 100),
  duration_seconds   smallint check (duration_seconds between 1 and 3600),
  hold_seconds       smallint check (hold_seconds between 1 and 600),
  per_side           boolean not null default false,
  times_per_day      smallint check (times_per_day between 1 and 10),
  load               text check (load is null or length(btrim(load, E' \t\r\n')) between 1 and 40),
  tempo              text check (tempo is null or length(btrim(tempo, E' \t\r\n')) between 1 and 40),
  rest_seconds       smallint check (rest_seconds between 0 and 600),
  double_progression boolean not null default false,
  constraint exercise_plan_template_items_template_fk
    foreign key (template_id, organization_id)
    references public.exercise_plan_templates (id, organization_id) on delete cascade,
  constraint exercise_plan_template_items_variant_fk
    foreign key (variant_id, organization_id)
    references public.exercise_variants (id, organization_id) on delete cascade,
  constraint exercise_plan_template_items_position unique (template_id, position),
  constraint exercise_plan_template_items_variant unique (template_id, variant_id),
  constraint exercise_plan_template_items_reps check (
    (reps_min is null) = (reps_max is null) and (reps_max is null or reps_max >= reps_min)
  ),
  constraint exercise_plan_template_items_reps_or_duration
    check ((reps_min is null) <> (duration_seconds is null)),
  constraint exercise_plan_template_items_hold check (hold_seconds is null or reps_min is not null),
  constraint exercise_plan_template_items_double_progression check (
    not double_progression or (reps_max > reps_min and load is not null)
  )
);

comment on table public.exercise_plan_template_items is
  'UEB-014 (ANN-560): die Uebungen einer Vorlage der Praxis mit Dosierung, ohne Notiz und ohne Schnappschuss. Datenklasse: Betriebsdaten der Praxis OHNE Personenbezug. Frist: faellt mit ihrer Vorlage oder ihrer Variante (on delete cascade). Kein Tabellenrecht und keine Policy (ADR-004).';

create index exercise_plan_template_items_variant_idx
  on public.exercise_plan_template_items (variant_id);

revoke all on public.exercise_plan_template_items from anon, authenticated;
alter table public.exercise_plan_template_items enable row level security;

-- Datenklasse (ADR-008, ADR-013 Punkt 9 Nr. 4)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('exercise_plan_templates', 'betriebsdaten', 'keine',
   'Vorlagen der Praxis fuer Uebungsplaene (UEB-014, ANN-560). Fachwissen ohne Personenbezug; bleiben, bis die Praxis sie loescht.',
   223),
  ('exercise_plan_template_items', 'betriebsdaten', 'keine',
   'Uebungen einer Vorlage der Praxis (UEB-014). Fallen mit ihrer Vorlage oder ihrer Variante (on delete cascade).',
   224);

-- -----------------------------------------------------------------------------
-- 3. Wer liest, wer schreibt (ANN-560)
--
-- Lesen: wer die Bibliothek liest (app.can_read_exercise_library).
-- Anlegen: wer Plaene schreibt, in einem der beiden Bereiche - therapist,
-- team_lead, owner, trainer -, und owner, der die Bibliothek pflegt. Aendern
-- und loeschen: wer die Vorlage angelegt hat, und owner.
-- -----------------------------------------------------------------------------
create function app.can_write_exercise_plan_templates()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_write_exercise_plans('therapy')
      or app.can_write_exercise_plans('training')
      or app.can_manage_exercise_library()
$$;

revoke all on function app.can_write_exercise_plan_templates() from public, anon;
grant execute on function app.can_write_exercise_plan_templates() to authenticated;

comment on function app.can_write_exercise_plan_templates() is
  'UEB-014 (ANN-560): wer Vorlagen der Praxis anlegt - wer Plaene schreibt (therapist, team_lead, owner, trainer) und wer die Bibliothek pflegt. Aendern und loeschen darf, wer die Vorlage angelegt hat, und owner. Die eine Stelle fuer die Regel.';

-- Darf die anfragende Person diese Vorlage aendern? Nur fuer eine Zeile der
-- eigenen Organisation aufgerufen.
create function app.can_edit_exercise_plan_template(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_write_exercise_plan_templates()
     and (p_created_by = auth.uid() or app.can_manage_exercise_library())
$$;

revoke all on function app.can_edit_exercise_plan_template(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lesen: alle Vorlagen der Praxis
-- -----------------------------------------------------------------------------
create function public.list_exercise_plan_templates()
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
    raise exception 'not allowed to read exercise plan templates' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plan templates' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'can_create', app.can_write_exercise_plan_templates(),
    'templates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'goal', t.goal,
          'can_edit', app.can_edit_exercise_plan_template(t.created_by),
          'created_by_name', (select up.display_name from public.user_profiles up
                              where up.id = t.created_by),
          'updated_on', (t.updated_at at time zone 'Europe/Berlin')::date,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'variant_id', i.variant_id,
                'sets', i.sets,
                'reps_min', i.reps_min,
                'reps_max', i.reps_max,
                'duration_seconds', i.duration_seconds,
                'hold_seconds', i.hold_seconds,
                'per_side', i.per_side,
                'times_per_day', i.times_per_day,
                'load', i.load,
                'tempo', i.tempo,
                'rest_seconds', i.rest_seconds,
                'double_progression', i.double_progression
              )
              order by i.position
            )
            from public.exercise_plan_template_items i
            where i.template_id = t.id and i.organization_id = v_org
          ), '[]'::jsonb)
        )
        order by lower(t.name), t.id
      )
      from public.exercise_plan_templates t
      where t.organization_id = v_org
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_exercise_plan_templates() from public, anon;
grant execute on function public.list_exercise_plan_templates() to authenticated;

comment on function public.list_exercise_plan_templates() is
  'UEB-014 (ANN-560): die Vorlagen der Praxis mit ihren Uebungen, nach Name sortiert und nach nichts sonst (ADR-006 Punkt 10); dazu, ob die anfragende Person anlegen und je Vorlage aendern darf. Lesen nach app.can_read_exercise_library().';

-- -----------------------------------------------------------------------------
-- 5. Anlegen oder aendern
--
-- p_items ist ein Array der Uebungen in ihrer Reihenfolge, jede mit
-- variant_id und Dosierung (Felder wie eine Planposition). Beim Aendern
-- ersetzt es die Uebungen der Vorlage; null laesst sie stehen (nur Name und
-- Ziel aendern). Alles oder nichts.
-- -----------------------------------------------------------------------------
create function public.save_exercise_plan_template(
  p_template_id uuid,
  p_name        text,
  p_goal        text,
  p_items       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_name  text := btrim(coalesce(p_name, ''), E' \t\r\n');
  v_goal  text := nullif(btrim(coalesce(p_goal, ''), E' \t\r\n'), '');
  v_id    uuid;
  v_von   uuid;
  v_item  jsonb;
  v_pos   integer := 0;
  v_var   uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_exercise_plan_templates() then
    raise exception 'not allowed to write exercise plan templates' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write exercise plan templates' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if length(v_name) > 80 then
    raise exception 'name is too long' using errcode = '22023';
  end if;
  if v_goal is not null and length(v_goal) > 200 then
    raise exception 'goal is too long' using errcode = '22023';
  end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'items are invalid' using errcode = '22023';
  end if;
  if p_template_id is null and (p_items is null or jsonb_array_length(p_items) = 0) then
    raise exception 'a template needs at least one exercise' using errcode = '22023';
  end if;
  if p_items is not null and jsonb_array_length(p_items) = 0 then
    raise exception 'a template needs at least one exercise' using errcode = '22023';
  end if;
  if p_items is not null and jsonb_array_length(p_items) > 30 then
    raise exception 'a template has at most 30 exercises' using errcode = '22023';
  end if;

  begin
    if p_template_id is null then
      insert into public.exercise_plan_templates (
        organization_id, name, goal, created_by, updated_by
      )
      values (v_org, v_name, v_goal, v_actor, v_actor)
      returning id into v_id;
    else
      select t.created_by into v_von
        from public.exercise_plan_templates t
       where t.id = p_template_id and t.organization_id = v_org
       for update;
      if not found then
        raise exception 'template not found' using errcode = 'P0002';
      end if;
      if not app.can_edit_exercise_plan_template(v_von) then
        raise exception 'not allowed to change this template' using errcode = '42501';
      end if;
      update public.exercise_plan_templates
         set name = v_name,
             goal = v_goal,
             updated_at = now(),
             updated_by = v_actor
       where id = p_template_id and organization_id = v_org
      returning id into v_id;
    end if;
  exception
    when unique_violation then
      raise exception 'a template with this name already exists' using errcode = '23505';
  end;

  if p_items is null then
    return v_id;
  end if;

  delete from public.exercise_plan_template_items where template_id = v_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'items are invalid' using errcode = '22023';
    end if;
    begin
      v_var := (v_item ->> 'variant_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'items are invalid' using errcode = '22023';
    end;
    -- Nur eine Variante der eigenen Bibliothek, die nicht archiviert ist -
    -- weder sie noch ihre Uebung.
    if v_var is null or not exists (
      select 1
        from public.exercise_variants v
        join public.exercises e on e.id = v.exercise_id and e.organization_id = v.organization_id
       where v.id = v_var and v.organization_id = v_org
         and v.archived_at is null and e.archived_at is null
    ) then
      raise exception 'exercise is not in the library' using errcode = '22023';
    end if;
    begin
      insert into public.exercise_plan_template_items (
        organization_id, template_id, position, variant_id, sets, reps_min, reps_max,
        duration_seconds, hold_seconds, per_side, times_per_day, load, tempo, rest_seconds,
        double_progression
      )
      values (
        v_org, v_id, v_pos, v_var,
        (v_item ->> 'sets')::smallint,
        (v_item ->> 'reps_min')::smallint,
        (v_item ->> 'reps_max')::smallint,
        (v_item ->> 'duration_seconds')::smallint,
        (v_item ->> 'hold_seconds')::smallint,
        coalesce((v_item ->> 'per_side')::boolean, false),
        (v_item ->> 'times_per_day')::smallint,
        nullif(btrim(coalesce(v_item ->> 'load', ''), E' \t\r\n'), ''),
        nullif(btrim(coalesce(v_item ->> 'tempo', ''), E' \t\r\n'), ''),
        (v_item ->> 'rest_seconds')::smallint,
        coalesce((v_item ->> 'double_progression')::boolean, false)
      );
    exception
      when unique_violation then
        raise exception 'an exercise appears twice' using errcode = '22023';
      when check_violation or not_null_violation or invalid_text_representation
           or numeric_value_out_of_range then
        raise exception 'dosage is invalid' using errcode = '22023';
    end;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_exercise_plan_template(uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_exercise_plan_template(uuid, text, text, jsonb) to authenticated;

comment on function public.save_exercise_plan_template(uuid, text, text, jsonb) is
  'UEB-014 (ANN-560): legt eine Vorlage der Praxis an (ohne Kennung) oder aendert sie; p_items ersetzt die Uebungen, null laesst sie stehen. Anlegen nach app.can_write_exercise_plan_templates(), aendern nur, wer sie angelegt hat, und owner.';

-- -----------------------------------------------------------------------------
-- 6. Loeschen
-- -----------------------------------------------------------------------------
create function public.delete_exercise_plan_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_von uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_exercise_plan_templates() then
    raise exception 'not allowed to write exercise plan templates' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write exercise plan templates' using errcode = '42501';
  end if;

  select t.created_by into v_von
    from public.exercise_plan_templates t
   where t.id = p_template_id and t.organization_id = v_org
   for update;
  if not found then
    raise exception 'template not found' using errcode = 'P0002';
  end if;
  if not app.can_edit_exercise_plan_template(v_von) then
    raise exception 'not allowed to change this template' using errcode = '42501';
  end if;

  delete from public.exercise_plan_templates
   where id = p_template_id and organization_id = v_org;
end;
$$;

revoke all on function public.delete_exercise_plan_template(uuid) from public, anon;
grant execute on function public.delete_exercise_plan_template(uuid) to authenticated;

comment on function public.delete_exercise_plan_template(uuid) is
  'UEB-014 (ANN-560): loescht eine Vorlage der Praxis samt ihren Uebungen. Nur, wer sie angelegt hat, und owner. Plaene aus der Vorlage bleiben: Sie verweisen nicht auf sie.';
