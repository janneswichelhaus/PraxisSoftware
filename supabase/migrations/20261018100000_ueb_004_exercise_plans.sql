-- =============================================================================
-- UEB-004 (UEB-EPIC-002): Der Plan - zusammenstellen
--
-- Ein Plan ist eine Zusammenstellung von Varianten aus der Uebungsbibliothek
-- mit Dosierung, fuer GENAU EINE Person in GENAU EINEM Verhaeltnis. Vorlage,
-- Zuweisung und Durchfuehrung sind drei Dinge (IDEA-TRN-011): Hier entsteht
-- der Entwurf; zugewiesen und eingefroren wird in UEB-005, gesteigert von Hand
-- in UEB-006, die Laufzeit kommt mit UEB-007.
--
--   public.exercise_plans            der Plan
--   public.exercise_plan_items       seine Positionen
--   app.can_read_exercise_plans      wer liest (ANN-298), je Bereich
--   app.can_write_exercise_plans     wer schreibt (ANN-298), je Bereich
--   public.create_exercise_plan      Entwurf anlegen
--   public.save_exercise_plan        Titel und Einheiten je Woche
--   public.save_exercise_plan_item   Position anlegen oder aendern
--   public.move_exercise_plan_item   Position verschieben
--   public.delete_exercise_plan_item Position entfernen
--   public.discard_exercise_plan     Entwurf verwerfen
--   public.list_exercise_plans       die Plaene eines Verhaeltnisses
--   public.get_exercise_plan         ein Plan mit Positionen
--   app.patient_merge_plan, public.merge_patients
--                                    nehmen die Behandlungsplaene mit
--
-- EINE TABELLE, ZWEI BEREICHE (ANN-297): Ein Plan haengt entweder an der Akte
-- (`therapy`, patient_id) oder am Trainingsverhaeltnis (`training`,
-- training_relationship_id) - eine Constraint erzwingt genau eines, wie am
-- Kalender (ADR-022 Punkt 3). Fremdschluessel zwischen den Verhaeltnissen gibt
-- es nicht (ADR-021 Punkt 3). Datenklasse und Frist haengen an der Zeile:
-- Therapieplaene sind Patientenakte ("Therapieplaene wie Patientenakte",
-- ADR-008), Trainingsplaene Trainingsverhaeltnis (ADR-021 Punkt 4). Beide
-- fallen mit ihrem Verhaeltnis (on delete cascade).
--
-- KEIN DURCHGRIFF (ADR-021 Punkt 6): Jede Funktion und die Policy fragen das
-- Recht des BEREICHS, zu dem der Plan gehoert. Ein Plan des anderen Bereichs
-- ist "nicht gefunden".
--
-- KEINE AUSWAHL (ADR-006 Punkt 10, Verbot 1): Was in den Plan kommt, waehlt die
-- Fachperson. Keine Funktion liest dafuer Diagnose, Befund, Screening oder
-- Verlauf, keine schlaegt eine Uebung, Dosierung oder Steigerung vor.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer was angelegt und geaendert
-- hat, steht an der Zeile. Das Lesen ist "Akte geoeffnet"
-- (app.log_record_access, einmal je Tag), eine Abweisung access.denied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Plan
-- -----------------------------------------------------------------------------
create table public.exercise_plans (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  service_area             text not null check (service_area in ('therapy', 'training')),
  patient_id               uuid references public.patients (id) on delete cascade,
  training_relationship_id uuid,
  title                    text not null check (length(btrim(title, E' \t\r\n')) between 1 and 80),
  -- Einheiten je Woche - die Achse Frequenz liegt am Plan (IDEA-TRN-004).
  sessions_per_week        smallint check (sessions_per_week between 1 and 14),
  status                   text not null default 'draft'
                             check (status in ('draft', 'assigned', 'ended', 'superseded')),
  -- Die vorige Fassung, aus der dieser Plan hervorging (UEB-006).
  previous_plan_id         uuid,
  -- Zuweisung und Laufzeit (UEB-005, UEB-007).
  assigned_at              timestamptz,
  assigned_by              uuid,
  runs_from                date,
  runs_until               date,
  original_runs_until      date,
  extended_at              timestamptz,
  extended_by              uuid,
  ended_at                 timestamptz,
  ended_by                 uuid,
  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  updated_at               timestamptz not null default now(),
  updated_by               uuid not null,

  constraint exercise_plans_id_organization unique (id, organization_id),
  -- Genau ein Verhaeltnis, passend zum Bereich (ANN-297, ADR-021 Punkt 3).
  constraint exercise_plans_one_relationship check (
    (service_area = 'therapy' and patient_id is not null and training_relationship_id is null)
    or (service_area = 'training' and training_relationship_id is not null and patient_id is null)
  ),
  constraint exercise_plans_training_relationship_fk
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id) on delete cascade,
  constraint exercise_plans_previous_fk
    foreign key (previous_plan_id, organization_id)
    references public.exercise_plans (id, organization_id) on delete cascade,
  -- Eine Fassung hat hoechstens eine Folgefassung (ANN-301).
  constraint exercise_plans_one_follow_up unique (previous_plan_id),
  constraint exercise_plans_assigned_stamp check (
    (status = 'draft') = (assigned_at is null)
    and (assigned_at is null) = (assigned_by is null)
    and (assigned_at is null) = (runs_from is null)
    and (assigned_at is null) = (runs_until is null)
    and (assigned_at is null) = (original_runs_until is null)
  ),
  constraint exercise_plans_runs check (runs_until >= runs_from),
  constraint exercise_plans_extended_stamp check (
    (extended_at is null) = (extended_by is null)
    and (extended_at is null or assigned_at is not null)
  ),
  constraint exercise_plans_ended_stamp check (
    (status in ('ended', 'superseded')) = (ended_at is not null)
    and (ended_at is null) = (ended_by is null)
  )
);

comment on table public.exercise_plans is
  'UEB-004: Uebungsplan fuer genau eine Person in genau einem Verhaeltnis (IDEA-TRN-011, ANN-297). Datenklasse je Zeile: service_area therapy = Patientenakte (Therapieplaene, ADR-008), training = Trainingsverhaeltnis (ADR-021 Punkt 4); faellt mit dem Verhaeltnis. Keine Auswahl aus klinischen Angaben (ADR-006 Punkt 10). Kein Tabellenrecht: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.exercise_plans.service_area is
  'Leistungsbereich (ADR-021): therapy haengt an patients, training an training_relationships - genau eines, nie beides (ANN-297).';
comment on column public.exercise_plans.title is
  'Bezeichnung des Plans, frei. Darf NIEMALS in Betriebslogs oder in den Auditkontext gelangen (ADR-011).';
comment on column public.exercise_plans.status is
  'draft (Entwurf), assigned (zugewiesen, eingefroren - UEB-005), ended (beendet - UEB-007), superseded (durch eine neue Fassung abgeloest - UEB-006).';
comment on column public.exercise_plans.original_runs_until is
  'Das Ende, mit dem der Plan zugewiesen wurde; runs_until traegt eine Verlaengerung (UEB-007, ANN-302).';

create index exercise_plans_patient_idx
  on public.exercise_plans (organization_id, patient_id) where patient_id is not null;
create index exercise_plans_training_idx
  on public.exercise_plans (organization_id, training_relationship_id)
  where training_relationship_id is not null;
create index exercise_plans_runs_until_idx
  on public.exercise_plans (organization_id, runs_until) where status = 'assigned';

revoke all on public.exercise_plans from public, anon, authenticated;
alter table public.exercise_plans enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Die Positionen
-- -----------------------------------------------------------------------------
create table public.exercise_plan_items (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  plan_id            uuid not null,
  position           smallint not null check (position between 1 and 30),
  variant_id         uuid not null,
  -- Dosierung (ANN-299)
  sets               smallint not null check (sets between 1 and 20),
  reps_min           smallint check (reps_min between 1 and 100),
  reps_max           smallint check (reps_max between 1 and 100),
  duration_seconds   smallint check (duration_seconds between 1 and 3600),
  load               text check (load is null or length(btrim(load, E' \t\r\n')) between 1 and 40),
  tempo              text check (tempo is null or length(btrim(tempo, E' \t\r\n')) between 1 and 40),
  rest_seconds       smallint check (rest_seconds between 0 and 600),
  -- Doppelte Progression (IDEA-TRN-007): Wiederholungsbereich und Last.
  double_progression boolean not null default false,
  -- Hinweis an die Person, in ihrer Sprache.
  note               text check (note is null or length(btrim(note, E' \t\r\n')) between 1 and 500),
  -- Die Position der vorigen Fassung und der Schritt dorthin (UEB-006, ANN-301).
  previous_item_id   uuid references public.exercise_plan_items (id) on delete cascade,
  step_axis          text,
  step_direction     text check (step_direction in ('harder', 'easier')),
  -- Der Schnappschuss der Bibliothek bei der Zuweisung (UEB-005, ANN-300).
  exercise_name      text,
  exercise_lay_name  text,
  variant_name       text,
  variant_lay_name   text,
  body_region        text,
  instruction        text,
  equipment          text[],
  created_at         timestamptz not null default now(),
  created_by         uuid not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid not null,

  constraint exercise_plan_items_plan_fk
    foreign key (plan_id, organization_id)
    references public.exercise_plans (id, organization_id) on delete cascade,
  -- Eine Variante, die in einem Plan steht, wird archiviert, nicht geloescht
  -- (ANN-296).
  constraint exercise_plan_items_variant_fk
    foreign key (variant_id, organization_id)
    references public.exercise_variants (id, organization_id) on delete restrict,
  constraint exercise_plan_items_position_unique unique (plan_id, position)
    deferrable initially deferred,
  constraint exercise_plan_items_reps check (
    (reps_min is null) = (reps_max is null) and (reps_max is null or reps_max >= reps_min)
  ),
  -- Wiederholungen ODER Dauer, nie beides, nie keines.
  constraint exercise_plan_items_reps_or_duration check ((reps_min is null) <> (duration_seconds is null)),
  constraint exercise_plan_items_double_progression check (
    not double_progression or (reps_max > reps_min and load is not null)
  ),
  constraint exercise_plan_items_step check (
    (step_axis is null) = (step_direction is null)
    and (step_axis is null or previous_item_id is not null)
    and (step_axis is null or (step_axis = any (app.exercise_axes()) and step_axis <> 'frequenz'))
  ),
  constraint exercise_plan_items_snapshot check (
    (variant_name is null and variant_lay_name is null and exercise_name is null
      and exercise_lay_name is null and body_region is null and equipment is null
      and instruction is null)
    or (variant_name is not null and variant_lay_name is not null and exercise_name is not null
      and exercise_lay_name is not null and body_region is not null and equipment is not null)
  )
);

comment on table public.exercise_plan_items is
  'UEB-004: Position eines Uebungsplans - eine Variante der Bibliothek mit Dosierung (ANN-299). Datenklasse wie ihr Plan (Patientenakte oder Trainingsverhaeltnis); faellt mit ihm. Nach der Zuweisung unveraenderlich, mit eingefrorenem Schnappschuss der Bibliothek (ANN-300). Kein Tabellenrecht (ADR-004).';
comment on column public.exercise_plan_items.note is
  'Hinweis an die Person. Freitext, der NIEMALS in Betriebslogs oder in den Auditkontext gelangt (ADR-011).';
comment on column public.exercise_plan_items.step_axis is
  'Die eine Achse, entlang der diese Position gegenueber der vorigen Fassung gesteigert oder zurueckgenommen wurde (UEB-006, ANN-301). Von Hand gesetzt, nie vorgeschlagen (ADR-006 Punkt 10).';
comment on column public.exercise_plan_items.variant_name is
  'Schnappschuss bei der Zuweisung (ANN-300): Eine spaetere Aenderung der Bibliothek aendert nicht, was die Person bekommen hat (IDEA-TRN-011).';

create index exercise_plan_items_plan_idx on public.exercise_plan_items (plan_id);
create index exercise_plan_items_variant_idx on public.exercise_plan_items (variant_id);
create index exercise_plan_items_previous_idx
  on public.exercise_plan_items (previous_item_id) where previous_item_id is not null;

revoke all on public.exercise_plan_items from public, anon, authenticated;
alter table public.exercise_plan_items enable row level security;

-- Datenklasse je Zeile am Bereich (ADR-008, ADR-013 Punkt 9 Nr. 4, ANN-297)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('exercise_plans', 'patientenakte', 'ueber_elterndatensatz',
   'Uebungsplaene der Behandlung (UEB-004, service_area therapy): Therapieplaene wie die Patientenakte (ADR-008). Fallen mit der Akte (on delete cascade).',
   49),
  ('exercise_plans', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Uebungsplaene des Trainings (UEB-004, service_area training): Trainingsdaten (ADR-021 Punkt 4). Fallen mit dem Trainingsverhaeltnis (on delete cascade).',
   57),
  ('exercise_plan_items', 'patientenakte', 'ueber_elterndatensatz',
   'Positionen eines Behandlungsplans samt Schnappschuss (UEB-004). Fallen mit ihrem Plan.',
   49),
  ('exercise_plan_items', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Positionen eines Trainingsplans samt Schnappschuss (UEB-004). Fallen mit ihrem Plan.',
   57);

-- -----------------------------------------------------------------------------
-- 3. Wer liest, wer schreibt (ANN-298) - die eine Stelle
--
-- Behandlung: schreiben, wer Behandlungsdokumentation schreibt (therapist,
-- team_lead); lesen dazu owner und das Buero (ADR-004 Fassung 2 Punkt 3).
-- Training: owner und Trainingsbetreuung - wie Profil und Protokoll. Das Buero
-- nicht: ADR-021 Punkt 10 oeffnet ihm im Training nur das Protokoll.
-- -----------------------------------------------------------------------------
create function app.can_read_exercise_plans(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_area
    when 'therapy' then app.has_any_role('owner', 'therapist', 'team_lead', 'office')
    when 'training' then app.has_any_role('owner', 'trainer')
    else false
  end
$$;

revoke all on function app.can_read_exercise_plans(text) from public, anon;
grant execute on function app.can_read_exercise_plans(text) to authenticated;

comment on function app.can_read_exercise_plans(text) is
  'UEB-004 (ANN-298): wer Plaene eines Bereichs liest - therapy: owner, therapist, team_lead, office; training: owner, trainer. Die eine Stelle fuer die Regel.';

create function app.can_write_exercise_plans(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_area
    when 'therapy' then app.has_any_role('therapist', 'team_lead')
    when 'training' then app.has_any_role('owner', 'trainer')
    else false
  end
$$;

revoke all on function app.can_write_exercise_plans(text) from public, anon;
grant execute on function app.can_write_exercise_plans(text) to authenticated;

comment on function app.can_write_exercise_plans(text) is
  'UEB-004 (ANN-298): wer Plaene eines Bereichs zusammenstellt, zuweist, steigert, verlaengert und beendet - therapy: therapist, team_lead; training: owner, trainer. Die eine Stelle fuer die Regel.';

-- Zweite Grenze (ADR-004): Ohne Tabellenrecht liest niemand direkt; stuende
-- es eines Tages da, saehe jede Rolle nur ihren Bereich.
create policy exercise_plans_select_scoped
  on public.exercise_plans for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_exercise_plans(service_area)
  );

create policy exercise_plan_items_select_scoped
  on public.exercise_plan_items for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and exists (
      select 1 from public.exercise_plans p
      where p.id = exercise_plan_items.plan_id
        and app.can_read_exercise_plans(p.service_area)
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Die Riegel - fuer jeden Schreibweg
--
-- Am Plan: Bereich, Verhaeltnis und Herkunft stehen mit dem Anlegen fest (wie
-- der Kontext eines Termins, ADR-022 Punkt 10). Ein Entwurf ist frei. Ein
-- zugewiesener Plan aendert nur noch Laufzeit und Ende (ANN-300, ANN-302), ein
-- beendeter oder abgeloester gar nichts mehr. Die einzige Ausnahme ist das
-- Zusammenfuehren zweier Akten: Dort wechselt patient_id und sonst nichts
-- (PRX-017). Geloescht wird nur ein Entwurf - oder alles mit dem Verhaeltnis.
-- -----------------------------------------------------------------------------
create function public.exercise_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_neu jsonb;
  v_alt jsonb;
begin
  if tg_op = 'INSERT' then
    if new.service_area = 'therapy' and not exists (
      select 1 from public.patients p
      where p.id = new.patient_id and p.organization_id = new.organization_id
    ) then
      raise exception 'exercise plan requires a relationship of the same organization'
        using errcode = '23514';
    end if;
    if new.status <> 'draft' then
      raise exception 'exercise plan starts as a draft' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'draft' then
      return old;
    end if;
    -- Faellt das Verhaeltnis, faellt der Plan mit (on delete cascade): Dann
    -- ist der Elterndatensatz schon fort.
    if (old.patient_id is not null and not exists (
          select 1 from public.patients p where p.id = old.patient_id))
       or (old.training_relationship_id is not null and not exists (
          select 1 from public.training_relationships t where t.id = old.training_relationship_id))
       or (old.previous_plan_id is not null and not exists (
          select 1 from public.exercise_plans p where p.id = old.previous_plan_id)) then
      return old;
    end if;
    raise exception 'only a draft exercise plan can be discarded' using errcode = '22023';
  end if;

  v_neu := to_jsonb(new);
  v_alt := to_jsonb(old);

  if app.patient_merge_active() and new.patient_id is distinct from old.patient_id then
    if not app.only_patient_id_changed(v_neu, v_alt) then
      raise exception 'exercise plan cannot be changed while merging' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.service_area is distinct from old.service_area
     or new.patient_id is distinct from old.patient_id
     or new.training_relationship_id is distinct from old.training_relationship_id
     or new.previous_plan_id is distinct from old.previous_plan_id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'exercise plan cannot be moved' using errcode = '22023';
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'assigned') then
      raise exception 'a draft exercise plan is assigned or discarded' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'assigned' then
    -- Erlaubt: Laufzeit verlaengern, beenden, abloesen. Der Inhalt bleibt.
    if (v_neu - array['runs_until', 'extended_at', 'extended_by', 'status', 'ended_at',
                      'ended_by', 'updated_at', 'updated_by'])
       is distinct from
       (v_alt - array['runs_until', 'extended_at', 'extended_by', 'status', 'ended_at',
                      'ended_by', 'updated_at', 'updated_by']) then
      raise exception 'assigned exercise plan cannot be changed' using errcode = '22023';
    end if;
    if new.status not in ('assigned', 'ended', 'superseded') then
      raise exception 'assigned exercise plan cannot be changed' using errcode = '22023';
    end if;
    if new.status <> 'assigned' and new.runs_until is distinct from old.runs_until then
      raise exception 'assigned exercise plan cannot be changed' using errcode = '22023';
    end if;
    return new;
  end if;

  raise exception 'ended exercise plan cannot be changed' using errcode = '22023';
end;
$$;

comment on function public.exercise_plans_guard() is
  'UEB-004: Bereich, Verhaeltnis und Herkunft eines Plans stehen fest; ein zugewiesener Plan aendert nur Laufzeit und Ende (ANN-300, ANN-302), ein beendeter nichts; beim Zusammenfuehren nur patient_id (PRX-017). Geloescht wird nur ein Entwurf - ausser mit dem Verhaeltnis.';

create trigger exercise_plans_guard
  before insert or update or delete on public.exercise_plans
  for each row execute function public.exercise_plans_guard();

-- An der Position: Geschrieben wird nur im Entwurf. Eine Position der vorigen
-- Fassung gehoert zur vorigen Fassung desselben Plans.
create function public.exercise_plan_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan record;
begin
  select p.status, p.previous_plan_id
    into v_plan
  from public.exercise_plans p
  where p.id = case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;

  if tg_op = 'DELETE' then
    -- Faellt der Plan (Entwurf verworfen, Verhaeltnis geloescht), ist er
    -- schon fort.
    if not found or v_plan.status = 'draft' then
      return old;
    end if;
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;

  if not found or v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and (
       new.plan_id is distinct from old.plan_id
       or new.organization_id is distinct from old.organization_id
       or new.previous_item_id is distinct from old.previous_item_id) then
    raise exception 'exercise plan item cannot be moved' using errcode = '22023';
  end if;

  if new.previous_item_id is not null and not exists (
    select 1 from public.exercise_plan_items i
    where i.id = new.previous_item_id and i.plan_id = v_plan.previous_plan_id
  ) then
    raise exception 'previous item belongs to the previous version' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.exercise_plan_items_guard() is
  'UEB-004: Positionen aendern sich nur im Entwurf (ANN-300); eine Position der vorigen Fassung stammt aus der vorigen Fassung desselben Plans (ANN-301).';

create trigger exercise_plan_items_guard
  before insert or update or delete on public.exercise_plan_items
  for each row execute function public.exercise_plan_items_guard();

-- -----------------------------------------------------------------------------
-- 5. Gemeinsame Einstiege
-- -----------------------------------------------------------------------------

-- Schreiben: angemeldet, schreibt in mindestens einem Bereich, hat eine
-- Organisation; der Plan liegt dort und in einem Bereich, den die Person
-- schreibt - sonst "nicht gefunden" (kein Durchgriff, ADR-021 Punkt 6).
-- Sperrt die Zeile fuer den Rest der Transaktion.
create function app.exercise_plan_for_write(p_plan_id uuid)
returns public.exercise_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_plan public.exercise_plans%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (app.can_write_exercise_plans('therapy') or app.can_write_exercise_plans('training')) then
    raise exception 'not allowed to write exercise plans' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write exercise plans' using errcode = '42501';
  end if;

  select * into v_plan
  from public.exercise_plans p
  where p.id = p_plan_id and p.organization_id = v_org
  for update;

  if not found or not app.can_write_exercise_plans(v_plan.service_area) then
    raise exception 'exercise plan not found' using errcode = 'P0002';
  end if;
  return v_plan;
end;
$$;

revoke all on function app.exercise_plan_for_write(uuid) from public, anon, authenticated;

-- Ein Trainingsplan entsteht und waechst nur, solange der Vertrag laeuft -
-- wie das Voraussetzungsprofil (KND-005). Beenden geht immer.
create function app.exercise_plan_relationship_open(p_plan public.exercise_plans)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_plan.service_area = 'training' and exists (
    select 1 from public.training_relationships t
    where t.id = p_plan.training_relationship_id and t.contract_ended_on is not null
  ) then
    raise exception 'training relationship has ended' using errcode = '23514';
  end if;
end;
$$;

revoke all on function app.exercise_plan_relationship_open(public.exercise_plans) from public, anon, authenticated;

-- Freitext: getrimmt, leer wird null, zu lang ist ein Eingabefehler.
create function app.exercise_plan_text(p_text text, p_max integer, p_field text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
begin
  if v_text is not null and length(v_text) > p_max then
    raise exception '% is too long', p_field using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.exercise_plan_text(text, integer, text) from public, anon, authenticated;

-- Die Positionen eines Plans lueckenlos von 1 an, in ihrer Reihenfolge.
create function app.exercise_plan_renumber(p_plan_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.exercise_plan_items i
     set position = n.neu
    from (
      select x.id, row_number() over (order by x.position, x.created_at, x.id) as neu
      from public.exercise_plan_items x
      where x.plan_id = p_plan_id
    ) n
   where i.id = n.id and i.position is distinct from n.neu;
$$;

revoke all on function app.exercise_plan_renumber(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Entwurf anlegen
-- -----------------------------------------------------------------------------
create function public.create_exercise_plan(
  p_area            text,
  p_relationship_id uuid,
  p_title           text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_title text;
  v_ende  date;
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not (app.can_write_exercise_plans('therapy') or app.can_write_exercise_plans('training')) then
    raise exception 'not allowed to write exercise plans' using errcode = '42501';
  end if;
  if p_area is null or p_area not in ('therapy', 'training') then
    raise exception 'service area is invalid' using errcode = '22023';
  end if;
  if not app.can_write_exercise_plans(p_area) then
    raise exception 'not allowed to write exercise plans' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write exercise plans' using errcode = '42501';
  end if;

  v_title := app.exercise_plan_text(p_title, 80, 'title');
  if v_title is null then
    raise exception 'title is required' using errcode = '22023';
  end if;

  if p_area = 'therapy' then
    if not exists (
      select 1 from public.patients p where p.id = p_relationship_id and p.organization_id = v_org
    ) then
      raise exception 'relationship not found' using errcode = 'P0002';
    end if;
    insert into public.exercise_plans (
      organization_id, service_area, patient_id, title, created_by, updated_by
    )
    values (v_org, 'therapy', p_relationship_id, v_title, v_actor, v_actor)
    returning id into v_id;
  else
    select t.contract_ended_on into v_ende
    from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org;
    if not found then
      raise exception 'relationship not found' using errcode = 'P0002';
    end if;
    if v_ende is not null then
      raise exception 'training relationship has ended' using errcode = '23514';
    end if;
    insert into public.exercise_plans (
      organization_id, service_area, training_relationship_id, title, created_by, updated_by
    )
    values (v_org, 'training', p_relationship_id, v_title, v_actor, v_actor)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_exercise_plan(text, uuid, text) from public, anon;
grant execute on function public.create_exercise_plan(text, uuid, text) to authenticated;

comment on function public.create_exercise_plan(text, uuid, text) is
  'UEB-004: legt einen leeren Planentwurf an der Akte (therapy) oder am Trainingsverhaeltnis (training) an. Nur nach app.can_write_exercise_plans(Bereich) (ANN-298).';

-- -----------------------------------------------------------------------------
-- 7. Titel und Einheiten je Woche
-- -----------------------------------------------------------------------------
create function public.save_exercise_plan(
  p_plan_id           uuid,
  p_title             text,
  p_sessions_per_week integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.exercise_plans%rowtype;
  v_title text;
begin
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;
  perform app.exercise_plan_relationship_open(v_plan);

  v_title := app.exercise_plan_text(p_title, 80, 'title');
  if v_title is null then
    raise exception 'title is required' using errcode = '22023';
  end if;
  if p_sessions_per_week is not null and p_sessions_per_week not between 1 and 14 then
    raise exception 'sessions per week is invalid' using errcode = '22023';
  end if;

  update public.exercise_plans
     set title = v_title,
         sessions_per_week = p_sessions_per_week,
         updated_at = now(),
         updated_by = auth.uid()
   where id = v_plan.id;
end;
$$;

revoke all on function public.save_exercise_plan(uuid, text, integer) from public, anon;
grant execute on function public.save_exercise_plan(uuid, text, integer) to authenticated;

comment on function public.save_exercise_plan(uuid, text, integer) is
  'UEB-004: aendert Titel und Einheiten je Woche eines Entwurfs. Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 8. Position anlegen oder aendern
--
-- Eine neue Position kommt ans Ende. Die Variante muss in der Bibliothek
-- stehen und darf nicht archiviert sein; behaelt eine Position ihre Variante,
-- bleibt sie auch nach dem Archivieren stehen. Den Schritt gegenueber einer
-- vorigen Fassung (p_step_axis, p_step_direction) prueft UEB-006; bis dahin
-- gibt es keine vorige Fassung und damit keinen Schritt.
-- -----------------------------------------------------------------------------
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
  p_step_direction     text
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

  -- Dosierung (ANN-299)
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

  if p_step_axis is not null or p_step_direction is not null then
    raise exception 'step needs a previous version' using errcode = '22023';
  end if;

  if p_item_id is null then
    select count(*) into v_anzahl from public.exercise_plan_items i where i.plan_id = v_plan.id;
    if v_anzahl >= 30 then
      raise exception 'too many exercises in plan' using errcode = '22023';
    end if;
    insert into public.exercise_plan_items (
      organization_id, plan_id, position, variant_id, sets, reps_min, reps_max,
      duration_seconds, load, tempo, rest_seconds, double_progression, note,
      created_by, updated_by
    )
    values (
      v_plan.organization_id, v_plan.id, v_anzahl + 1, p_variant_id, p_sets, p_reps_min,
      p_reps_max, p_duration_seconds, v_load, v_tempo, p_rest_seconds,
      coalesce(p_double_progression, false), v_note, v_actor, v_actor
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

revoke all on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text) from public, anon;
grant execute on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text) to authenticated;

comment on function public.save_exercise_plan_item(uuid, uuid, uuid, integer, integer, integer, integer, text, text, integer, boolean, text, text, text) is
  'UEB-004: legt eine Position im Entwurf an (ohne Kennung, ans Ende) oder aendert sie - Variante und Dosierung (ANN-299). Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 9. Position verschieben und entfernen
-- -----------------------------------------------------------------------------
create function public.move_exercise_plan_item(p_item_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan    public.exercise_plans%rowtype;
  v_item    public.exercise_plan_items%rowtype;
  v_nachbar public.exercise_plan_items%rowtype;
begin
  select i.* into v_item from public.exercise_plan_items i where i.id = p_item_id;
  v_plan := app.exercise_plan_for_write(coalesce(v_item.plan_id, extensions.gen_random_uuid()));
  if v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'direction is invalid' using errcode = '22023';
  end if;

  select i.* into v_nachbar
  from public.exercise_plan_items i
  where i.plan_id = v_plan.id
    and case when p_direction = 'up' then i.position < v_item.position
             else i.position > v_item.position end
  order by case when p_direction = 'up' then -i.position else i.position end
  limit 1;

  if not found then
    return;
  end if;

  -- Die Eindeutigkeit der Position wird erst am Ende der Transaktion geprueft.
  update public.exercise_plan_items set position = v_nachbar.position where id = v_item.id;
  update public.exercise_plan_items set position = v_item.position where id = v_nachbar.id;
  update public.exercise_plans set updated_at = now(), updated_by = auth.uid() where id = v_plan.id;
end;
$$;

revoke all on function public.move_exercise_plan_item(uuid, text) from public, anon;
grant execute on function public.move_exercise_plan_item(uuid, text) to authenticated;

comment on function public.move_exercise_plan_item(uuid, text) is
  'UEB-004: tauscht eine Position im Entwurf mit ihrer Nachbarin (up, down). Nur nach app.can_write_exercise_plans(Bereich).';

create function public.delete_exercise_plan_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.exercise_plans%rowtype;
  v_item public.exercise_plan_items%rowtype;
begin
  select i.* into v_item from public.exercise_plan_items i where i.id = p_item_id;
  v_plan := app.exercise_plan_for_write(coalesce(v_item.plan_id, extensions.gen_random_uuid()));
  if v_plan.status <> 'draft' then
    raise exception 'exercise plan is not a draft' using errcode = '22023';
  end if;

  delete from public.exercise_plan_items where id = v_item.id;
  perform app.exercise_plan_renumber(v_plan.id);
  update public.exercise_plans set updated_at = now(), updated_by = auth.uid() where id = v_plan.id;
end;
$$;

revoke all on function public.delete_exercise_plan_item(uuid) from public, anon;
grant execute on function public.delete_exercise_plan_item(uuid) to authenticated;

comment on function public.delete_exercise_plan_item(uuid) is
  'UEB-004: entfernt eine Position aus dem Entwurf; die uebrigen ruecken auf. Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 10. Entwurf verwerfen
--
-- Ein Entwurf hat niemanden erreicht; er darf ganz weg. Was zugewiesen war,
-- wird beendet, nie geloescht (UEB-007).
-- -----------------------------------------------------------------------------
create function public.discard_exercise_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.exercise_plans%rowtype;
begin
  v_plan := app.exercise_plan_for_write(p_plan_id);
  if v_plan.status <> 'draft' then
    raise exception 'only a draft exercise plan can be discarded' using errcode = '22023';
  end if;
  delete from public.exercise_plans where id = v_plan.id;
end;
$$;

revoke all on function public.discard_exercise_plan(uuid) from public, anon;
grant execute on function public.discard_exercise_plan(uuid) to authenticated;

comment on function public.discard_exercise_plan(uuid) is
  'UEB-004: verwirft einen Entwurf samt Positionen. Nur nach app.can_write_exercise_plans(Bereich).';

-- -----------------------------------------------------------------------------
-- 11. Lesen
--
-- Das Lesen eines Plans ist das Oeffnen der Akte bzw. der Trainingskund:in
-- (app.log_record_access: einmal je Person, Akte und Tag). Eine Rolle ohne
-- Recht bekommt null und einen access.denied-Eintrag; ein Plan, den es nicht
-- gibt oder der zum anderen Bereich gehoert, ist null ohne Eintrag.
-- -----------------------------------------------------------------------------
create function app.exercise_plan_log_read(p_plan public.exercise_plans)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_plan.service_area = 'therapy' then
    perform app.log_record_access(
      p_plan.organization_id, auth.uid(), 'patient_record.viewed', 'patient', p_plan.patient_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'exercise_plans'));
  else
    perform app.log_record_access(
      p_plan.organization_id, auth.uid(), 'training_relationship.viewed', 'training_relationship',
      p_plan.training_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'exercise_plans'));
  end if;
end;
$$;

revoke all on function app.exercise_plan_log_read(public.exercise_plans) from public, anon, authenticated;

create function public.list_exercise_plans(p_area text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe: Wer gar nicht liest, erfaehrt auch
  -- nichts ueber die Form des Aufrufs (ADR-023 Punkt 21).
  if not (app.can_read_exercise_plans('therapy') or app.can_read_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  if p_area is null or p_area not in ('therapy', 'training') then
    raise exception 'service area is invalid' using errcode = '22023';
  end if;
  if not app.can_read_exercise_plans(p_area) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plans' using errcode = '42501';
  end if;

  if p_area = 'therapy' then
    if not exists (select 1 from public.patients p where p.id = p_relationship_id and p.organization_id = v_org) then
      return null;
    end if;
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'exercise_plans'));
  else
    if not exists (
      select 1 from public.training_relationships t
      where t.id = p_relationship_id and t.organization_id = v_org
    ) then
      return null;
    end if;
    perform app.log_record_access(v_org, v_actor, 'training_relationship.viewed', 'training_relationship',
      p_relationship_id, 'user', jsonb_build_object('surface', 'web', 'view', 'exercise_plans'));
  end if;

  return jsonb_build_object(
    'can_write', app.can_write_exercise_plans(p_area),
    'today', app.training_today(v_org),
    'plans', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'title', p.title,
          'status', p.status,
          'sessions_per_week', p.sessions_per_week,
          'previous_plan_id', p.previous_plan_id,
          'assigned_at', p.assigned_at,
          'runs_from', p.runs_from,
          'runs_until', p.runs_until,
          'ended_at', p.ended_at,
          'created_at', p.created_at,
          'item_count', (select count(*) from public.exercise_plan_items i where i.plan_id = p.id)
        )
        order by case p.status when 'draft' then 0 when 'assigned' then 1 else 2 end,
                 coalesce(p.assigned_at, p.created_at) desc, p.id
      )
      from public.exercise_plans p
      where p.organization_id = v_org
        and p.service_area = p_area
        and (p.patient_id = p_relationship_id or p.training_relationship_id = p_relationship_id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_exercise_plans(text, uuid) from public, anon;
grant execute on function public.list_exercise_plans(text, uuid) to authenticated;

comment on function public.list_exercise_plans(text, uuid) is
  'UEB-004: die Plaene einer Akte (therapy) oder eines Trainingsverhaeltnisses (training) - Entwuerfe, dann zugewiesene, dann beendete. Lesen nach app.can_read_exercise_plans(Bereich) (ANN-298), protokolliert als Akte geoeffnet (einmal je Tag); andere Rollen: null und access.denied.';

-- Eine Position in der Form, die die Oberflaeche liest: Im Entwurf die
-- Bezeichnungen der Bibliothek, nach der Zuweisung der Schnappschuss.
create function app.exercise_plan_item_json(p_item public.exercise_plan_items)
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
    'variant_archived', p_item.variant_name is null and (v.archived_at is not null or e.archived_at is not null),
    'sets', p_item.sets,
    'reps_min', p_item.reps_min,
    'reps_max', p_item.reps_max,
    'duration_seconds', p_item.duration_seconds,
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

revoke all on function app.exercise_plan_item_json(public.exercise_plan_items) from public, anon, authenticated;

create function public.get_exercise_plan(p_plan_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_plan  public.exercise_plans%rowtype;
  v_person record;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (app.can_read_exercise_plans('therapy') or app.can_read_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'exercise_plans.read', 'not allowed to read exercise plans');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read exercise plans' using errcode = '42501';
  end if;

  select * into v_plan
  from public.exercise_plans p
  where p.id = p_plan_id and p.organization_id = v_org;
  if not found or not app.can_read_exercise_plans(v_plan.service_area) then
    return null;
  end if;

  perform app.exercise_plan_log_read(v_plan);

  if v_plan.service_area = 'therapy' then
    select pe.given_name, pe.family_name into v_person
    from public.patients pa join public.persons pe on pe.id = pa.person_id
    where pa.id = v_plan.patient_id;
  else
    select pe.given_name, pe.family_name into v_person
    from public.training_relationships t join public.persons pe on pe.id = t.person_id
    where t.id = v_plan.training_relationship_id;
  end if;

  return jsonb_build_object(
    'id', v_plan.id,
    'service_area', v_plan.service_area,
    'relationship_id', coalesce(v_plan.patient_id, v_plan.training_relationship_id),
    'given_name', v_person.given_name,
    'family_name', v_person.family_name,
    'title', v_plan.title,
    'sessions_per_week', v_plan.sessions_per_week,
    'status', v_plan.status,
    'previous_plan_id', v_plan.previous_plan_id,
    'follow_up', (
      select jsonb_build_object('id', f.id, 'status', f.status)
      from public.exercise_plans f where f.previous_plan_id = v_plan.id
    ),
    'assigned_at', v_plan.assigned_at,
    'assigned_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.assigned_by),
    'runs_from', v_plan.runs_from,
    'runs_until', v_plan.runs_until,
    'original_runs_until', v_plan.original_runs_until,
    'extended_at', v_plan.extended_at,
    'ended_at', v_plan.ended_at,
    'ended_on', (select (v_plan.ended_at at time zone o.time_zone)::date
                 from public.organizations o where o.id = v_org),
    'ended_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.ended_by),
    'created_at', v_plan.created_at,
    'created_by_name', (select up.display_name from public.user_profiles up where up.id = v_plan.created_by),
    'today', app.training_today(v_org),
    'can_write', app.can_write_exercise_plans(v_plan.service_area),
    'relationship_open', not exists (
      select 1 from public.training_relationships t
      where t.id = v_plan.training_relationship_id and t.contract_ended_on is not null
    ),
    'previous', (
      select jsonb_build_object(
        'id', q.id, 'title', q.title, 'sessions_per_week', q.sessions_per_week,
        'runs_from', q.runs_from, 'runs_until', q.runs_until,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(qi) order by qi.position)
          from public.exercise_plan_items qi where qi.plan_id = q.id
        ), '[]'::jsonb)
      )
      from public.exercise_plans q where q.id = v_plan.previous_plan_id
    ),
    'items', coalesce((
      select jsonb_agg(app.exercise_plan_item_json(i) order by i.position)
      from public.exercise_plan_items i where i.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_exercise_plan(uuid) from public, anon;
grant execute on function public.get_exercise_plan(uuid) to authenticated;

comment on function public.get_exercise_plan(uuid) is
  'UEB-004: ein Plan mit Positionen und der vorigen Fassung - im Entwurf mit den Bezeichnungen der Bibliothek, nach der Zuweisung mit dem Schnappschuss. Lesen nach app.can_read_exercise_plans(Bereich), protokolliert als Akte geoeffnet (einmal je Tag); andere Rollen: null und access.denied.';

-- -----------------------------------------------------------------------------
-- 12. Zusammenfuehren (PRX-017)
--
-- Aus 20261016100000_knd_002_training_offers.sql (juengste Fassung)
-- uebernommen und um die Behandlungsplaene ergaenzt: Sie ziehen mit der Akte
-- mit; sonst fielen sie mit der Dublette (on delete cascade). Nichts sperrt:
-- Zwei Plaene an einer Akte sind kein Widerspruch.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.patient_merge_plan(p_organization_id uuid, p_source uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quelle     record;
  v_ziel       record;
  v_konflikte  text[] := '{}';
  v_angehaengt text[] := '{}';
  v_sperren    text[] := '{}';
  v_zaehler    jsonb;
  v_text       text;
  v_feld       text;
begin
  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_quelle
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_source and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_ziel
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_target and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Felder, in denen beide Akten etwas anderes tragen: Die bleibende gewinnt,
  -- die Vorschau zeigt beide (ANN-147). Die Anschrift zaehlt als ein Feld.
  foreach v_feld in array array[
    'given_name', 'family_name', 'date_of_birth', 'email', 'phone', 'phone_mobile',
    'phone_work', 'institution', 'primary_therapist_staff_member_id',
    'treatment_table_required'
  ] loop
    if (to_jsonb(v_quelle) ->> v_feld) is not null
       and (to_jsonb(v_ziel) ->> v_feld) is not null
       and lower(btrim(to_jsonb(v_quelle) ->> v_feld)) <> lower(btrim(to_jsonb(v_ziel) ->> v_feld)) then
      v_konflikte := v_konflikte || v_feld;
    end if;
  end loop;

  if coalesce(v_quelle.street, v_quelle.house_number, v_quelle.postal_code, v_quelle.city) is not null
     and coalesce(v_ziel.street, v_ziel.house_number, v_ziel.postal_code, v_ziel.city) is not null
     and row(lower(v_quelle.street), lower(v_quelle.house_number), v_quelle.postal_code, lower(v_quelle.city))
         is distinct from
         row(lower(v_ziel.street), lower(v_ziel.house_number), v_ziel.postal_code, lower(v_ziel.city)) then
    v_konflikte := v_konflikte || 'address'::text;
  end if;

  -- Freitexte: angehaengt, nie verworfen - aber nie ueber die Grenze der
  -- Spalte hinaus gekuerzt. Dann sperrt der Vorgang (ANN-149).
  v_text := app.merge_note(v_ziel.home_visit_access_note, v_quelle.home_visit_access_note);
  if v_text is distinct from v_ziel.home_visit_access_note and v_ziel.home_visit_access_note is not null then
    v_angehaengt := v_angehaengt || 'home_visit_access_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.special_note, v_quelle.special_note);
  if v_text is distinct from v_ziel.special_note and v_ziel.special_note is not null then
    v_angehaengt := v_angehaengt || 'special_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.remark, v_quelle.remark);
  if v_text is distinct from v_ziel.remark and v_ziel.remark is not null then
    v_angehaengt := v_angehaengt || 'remark'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 2000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  if not app.take_along_items_valid(
    app.merge_take_along(v_ziel.take_along_items, v_quelle.take_along_items)
  ) then
    v_sperren := v_sperren || 'take_along_too_many'::text;
  end if;

  -- Ein Konto an der Dublette: Es verloere seine Akte. Das klaert die Praxis
  -- vorher, nicht der Vorgang (ANN-149).
  if exists (
    select 1 from public.user_profiles up where up.person_id = v_quelle.person_id
  ) then
    v_sperren := v_sperren || 'source_has_account'::text;
  end if;

  -- Zwei Entwuerfe fuer denselben Monat und Bereich: Einer muss vorher weg.
  if exists (
    select 1
    from public.invoices q
    join public.invoices z
      on z.patient_id = p_target
     and z.status = 'draft'
     and z.period_month = q.period_month
     and z.service_area = q.service_area
     -- ABR-032: Entwuerfe je Grundlage stossen nicht zusammen - die
     -- Grundlagen bleiben verschieden.
     and z.treatment_basis_id is null
    where q.patient_id = p_source
      and q.status = 'draft'
      and q.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'draft_invoice_overlap'::text;
  end if;

  -- Zwei offene Eintraege ohne Grundlage auf der Warteliste. Mit Grundlage
  -- koennen sie nicht zusammenstossen: Die Grundlagen wandern mit.
  if exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_source and w.status = 'open' and w.treatment_basis_id is null
  ) and exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_target and w.status = 'open' and w.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'open_waitlist_overlap'::text;
  end if;

  -- ABR-030: Zwei Honorarvereinbarungen ab demselben Tag haetten keine
  -- Antwort auf die Frage, welche gilt.
  if exists (
    select 1
    from public.patient_fee_agreements q
    join public.patient_fee_agreements z on z.valid_from = q.valid_from
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'fee_agreement_overlap'::text;
  end if;

  -- ANG-001: Zwei Abos, deren Zeitraeume sich ueberschneiden, waeren zwei
  -- Vertraege ueber dieselbe Nachsorge; eines muss vorher entfernt sein.
  if exists (
    select 1
    from public.aftercare_subscriptions q
    join public.aftercare_subscriptions z
      on z.starts_on <= coalesce(q.ends_on, 'infinity'::date)
     and q.starts_on <= coalesce(z.ends_on, 'infinity'::date)
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'aftercare_overlap'::text;
  end if;

  -- KND-002: Je Akte hoechstens ein offenes Trainingsangebot (ANN-284).
  if exists (
    select 1
    from public.training_offers q
    join public.training_offers z
      on z.patient_id = p_target
     and app.training_offer_practice_state(z, app.training_today(p_organization_id)) = 'open'
    where q.patient_id = p_source
      and app.training_offer_practice_state(q, app.training_today(p_organization_id)) = 'open'
  ) then
    v_sperren := v_sperren || 'training_offer_overlap'::text;
  end if;

  v_zaehler := jsonb_build_object(
    'appointments',
      (select count(*) from public.appointments a where a.patient_id = p_source),
    'treatment_notes',
      (select count(*) from public.treatment_notes n
         join public.appointments a on a.id = n.appointment_id
        where a.patient_id = p_source),
    'treatment_bases',
      (select count(*) from public.treatment_bases b where b.patient_id = p_source),
    'billable_services',
      (select count(*) from public.billable_services s where s.patient_id = p_source),
    'invoices',
      (select count(*) from public.invoices i where i.patient_id = p_source),
    'invoices_issued',
      (select count(*) from public.invoices i where i.patient_id = p_source and i.status = 'issued'),
    'invoice_recipients',
      (select count(*) from public.invoice_recipients r where r.patient_id = p_source),
    'fee_agreements',
      (select count(*) from public.patient_fee_agreements f where f.patient_id = p_source),
    'aftercare_subscriptions',
      (select count(*) from public.aftercare_subscriptions s where s.patient_id = p_source),
    'training_offers',
      (select count(*) from public.training_offers o where o.patient_id = p_source),
    'exercise_plans',
      (select count(*) from public.exercise_plans x where x.patient_id = p_source),
    'patient_files',
      (select count(*) from public.patient_files f where f.patient_id = p_source),
    'privacy_records',
      (select count(*) from public.patient_privacy_records r where r.patient_id = p_source),
    'questionnaire_responses',
      (select count(*) from public.patient_questionnaire_responses r where r.patient_id = p_source),
    'course_events',
      (select count(*) from public.patient_course_events e where e.patient_id = p_source),
    'therapy_reports',
      (select count(*) from public.therapy_reports r where r.patient_id = p_source),
    'tasks',
      (select count(*) from public.tasks t where t.patient_id = p_source),
    'waitlist_entries',
      (select count(*) from public.waitlist_entries w where w.patient_id = p_source),
    'legal_holds',
      (select count(*) from public.legal_holds h
        where h.subject_type = 'patient' and h.subject_id = p_source)
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_quelle.id, 'given_name', v_quelle.given_name, 'family_name', v_quelle.family_name,
      'date_of_birth', v_quelle.date_of_birth, 'status', v_quelle.status,
      'care_concluded_on', v_quelle.care_concluded_on
    ),
    'target', jsonb_build_object(
      'id', v_ziel.id, 'given_name', v_ziel.given_name, 'family_name', v_ziel.family_name,
      'date_of_birth', v_ziel.date_of_birth, 'status', v_ziel.status,
      'care_concluded_on', v_ziel.care_concluded_on
    ),
    'counts', v_zaehler,
    'conflicts', to_jsonb(v_konflikte),
    'appended', to_jsonb(v_angehaengt),
    'blockers', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_sperren) x)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_plan        jsonb;
  v_quelle      public.patients%rowtype;
  v_ziel        public.patients%rowtype;
  v_person      uuid;
  v_status      text;
  v_ende_on     date;
  v_ende_at     timestamptz;
  v_ende_by     uuid;
  v_beginn      date;
  v_anschrift   boolean;
  v_fotos       integer := 0;
  v_sperre      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  -- Beide Akten sperren, in fester Reihenfolge - zwei gleichzeitige Vorgaenge
  -- ueber dasselbe Paar warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source_patient_id, p_target_patient_id)
    and p.organization_id = v_org
  order by p.id
  for update;

  select * into v_quelle from public.patients p
  where p.id = p_source_patient_id and p.organization_id = v_org;
  select * into v_ziel from public.patients p
  where p.id = p_target_patient_id and p.organization_id = v_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Was vor dem Zusammenfuehren schon faellig war, faellt unter dem Stand, der
  -- es faellig gemacht hat (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_quelle.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben geloeschtes Foto ist
  -- nicht mitgewandert und steht schon in photos_deleted.
  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147) --------------------------------------------------
  if exists (select 1 from public.patient_contact_details c where c.patient_id = v_ziel.id) then
    select coalesce(z.street, z.house_number, z.postal_code, z.city) is null
       and coalesce(q.street, q.house_number, q.postal_code, q.city) is not null
      into v_anschrift
    from public.patient_contact_details z
    left join public.patient_contact_details q on q.patient_id = v_quelle.id
    where z.patient_id = v_ziel.id;

    update public.patient_contact_details z
       set date_of_birth = coalesce(z.date_of_birth, q.date_of_birth),
           email         = coalesce(z.email, q.email),
           phone         = coalesce(z.phone, q.phone),
           phone_mobile  = coalesce(z.phone_mobile, q.phone_mobile),
           phone_work    = coalesce(z.phone_work, q.phone_work),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Trigger die Koordinate bei jeder
    -- Adressaenderung leert: Die Anschrift kommt mit ihrer Verortung.
    if v_anschrift then
      update public.patient_contact_details z
         set lat = q.lat, lon = q.lon, geocode_precision = q.geocode_precision
        from public.patient_contact_details q
       where z.patient_id = v_ziel.id
         and q.patient_id = v_quelle.id;
    end if;
  else
    update public.patient_contact_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  if exists (select 1 from public.patient_care_details d where d.patient_id = v_ziel.id) then
    update public.patient_care_details z
       set primary_therapist_staff_member_id =
             coalesce(z.primary_therapist_staff_member_id, q.primary_therapist_staff_member_id),
           treatment_table_required = coalesce(z.treatment_table_required, q.treatment_table_required),
           home_visit_access_note = app.merge_note(z.home_visit_access_note, q.home_visit_access_note),
           special_note           = app.merge_note(z.special_note, q.special_note),
           remark                 = app.merge_note(z.remark, q.remark),
           take_along_items       = app.merge_take_along(z.take_along_items, q.take_along_items)
      from public.patient_care_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;
  else
    update public.patient_care_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  -- Der Bezug wechselt ----------------------------------------------------
  -- Zwei Standardempfaenger kann es nicht geben; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ABR-030: Die Honorarvereinbarungen ziehen mit; gleiche Tage sperrt der Plan.
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ANG-001: Das Nachsorge-Abo zieht mit; sich ueberschneidende sperrt der Plan.
  update public.aftercare_subscriptions      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.training_offers              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- UEB-004: Die Behandlungsplaene ziehen mit; der Riegel laesst nur patient_id wechseln.
  update public.exercise_plans               set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Seit ABN-018
  -- (BEF-108) bleiben alle Gruende wirksam: Eine Akte kann mehrere aktive
  -- Sperren tragen, keine wird beim Zusammenfuehren aufgehoben.
  v_sperre := null;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Fruehere Nachweise der Dublette ziehen mit (ABN-018).
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148) --------------------------------------------
  v_status := case
    when v_quelle.status = 'active' or v_ziel.status = 'active' then 'active'
    else 'inactive'
  end;
  v_beginn := least(v_quelle.care_started_on, v_ziel.care_started_on);

  if v_quelle.care_concluded_on is null or v_ziel.care_concluded_on is null then
    null;
  elsif (v_quelle.care_concluded_on, v_quelle.care_concluded_at)
        > (v_ziel.care_concluded_on, v_ziel.care_concluded_at) then
    v_ende_on := v_quelle.care_concluded_on;
    v_ende_at := v_quelle.care_concluded_at;
    v_ende_by := v_quelle.care_concluded_by;
  else
    v_ende_on := v_ziel.care_concluded_on;
    v_ende_at := v_ziel.care_concluded_at;
    v_ende_by := v_ziel.care_concluded_by;
  end if;

  update public.patients
     set status            = v_status,
         care_started_on   = v_beginn,
         care_concluded_on = v_ende_on,
         care_concluded_at = v_ende_at,
         care_concluded_by = v_ende_by
   where id = v_ziel.id;

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein
  -- Widerruf in der einen trifft die aelteren Fotos der anderen - sofort,
  -- wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die leere Akte faellt (ANN-150) -----------------------------------------
  -- Was noch an ihr haengt, faellt mit ihr (Kontakt und Versorgungsangaben der
  -- Dublette, soweit sie in die bleibende Akte eingeflossen sind).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  -- Die Person nur, wenn nichts anderes an ihr haengt: Mitarbeiter:in, Konto,
  -- Trainingsverhaeltnis (ADR-021) bleiben, wie sie sind.
  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  -- Nachweis an der bleibenden Akte, so lange wie sie (ABN-018, BEF-108):
  -- nicht allein im dreijaehrigen Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted
  )
  values (v_org, v_ziel.id, v_quelle.id, v_actor, v_plan -> 'counts', v_fotos);


  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$function$;
