-- =============================================================================
-- KND-005 (KND-EPIC-001): Das Voraussetzungsprofil im Training
--
-- IDEA-LZK-004: Das Profil ist nicht Stammdaten mit Sportfoto, sondern das,
-- was ein Plan braucht, um durchfuehrbar zu sein - Ziele in der Sprache der
-- Person, Ausruestung, Zeitbudget, Orte, Belastungsgrenzen, Vorgeschichte,
-- Vorlieben. Daneben steht, was die Person beim Abschluss aus der Behandlung
-- freigegeben hat (KND-003), als Kopie mit Herkunftsvermerk.
--
--   public.training_profiles         das Profil, eines je Trainingsverhaeltnis
--   public.training_takeovers        die freigegebenen Angaben aus der
--                                    Behandlung - Kopie, nie Verweis
--   public.get_training_profile      Profil und Uebernahmen lesen
--   public.save_training_profile     das Profil schreiben
--
-- WER (ANN-287): owner und Trainingsbetreuung, wie das Trainingsprotokoll
-- (app.can_access_training_protocols). Das Buero nicht: Profil und
-- Uebernahmen sind Gesundheitsangaben des Trainings, die ADR-021 Punkt 10 dem
-- Buero ausdruecklich sperrt. Die Rollen der Behandlung nicht (Punkt 6).
--
-- KOPIE (ADR-021 Punkt 7): Eine Uebernahme traegt Ueberschrift und Text so,
-- wie die Person sie freigegeben hat, dazu den Tag des Angebots, den
-- Zeitpunkt der Freigabe und den Zugang, ueber den sie freigab. Sie verweist
-- auf nichts in der Akte und ist ab dem Kopieren ein Trainingsdatum mit der
-- Frist des Trainingsverhaeltnisses. Sie wird nicht bearbeitet: Was sich
-- aendert, schreibt die Betreuung ins Profil.
--
-- PROTOKOLL (ADR-010 Fassung 3, ADR-021 Punkt 8): Jedes Lesen steht als
-- training_relationship.viewed mit `view: profile` im Auditlog - eine
-- vorhandene Aktion, kein neuer Wert. Geschrieben wird mit Stempel an der
-- Zeile.
--
-- EINWILLIGUNG (ANN-264): Das Profil bleibt bedienbar; die Seite sagt, ob
-- eine Einwilligung zu Gesundheitsangaben vermerkt ist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Das Profil
-- -----------------------------------------------------------------------------
create table public.training_profiles (
  training_relationship_id uuid primary key,
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  goals                    text check (goals is null or char_length(goals) between 1 and 1000),
  equipment                text check (equipment is null or char_length(equipment) between 1 and 1000),
  time_budget              text check (time_budget is null or char_length(time_budget) between 1 and 1000),
  places                   text check (places is null or char_length(places) between 1 and 1000),
  limits                   text check (limits is null or char_length(limits) between 1 and 1000),
  history                  text check (history is null or char_length(history) between 1 and 1000),
  preferences              text check (preferences is null or char_length(preferences) between 1 and 1000),
  created_at               timestamptz not null default now(),
  created_by               uuid,
  updated_at               timestamptz not null default now(),
  updated_by               uuid,
  constraint training_profiles_relationship_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete cascade
);

comment on table public.training_profiles is
  'KND-005 (IDEA-LZK-004): Voraussetzungsprofil einer Trainingskund:in - Ziele, Ausruestung, Zeitbudget, Orte, Belastungsgrenzen, Vorgeschichte, Vorlieben als Freitext. Gesundheitsangaben des Trainings (ADR-021 Punkt 4); owner und Trainingsbetreuung (ANN-287). Datenklasse: Trainingsverhaeltnis, faellt mit ihm. Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';

revoke all on public.training_profiles from anon, authenticated;
alter table public.training_profiles enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Die Uebernahmen aus der Behandlung
-- -----------------------------------------------------------------------------
create table public.training_takeovers (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null,
  position                 smallint not null check (position between 1 and 5),
  title                    text not null check (char_length(title) between 1 and 80),
  body                     text not null check (char_length(body) between 1 and 600),
  -- Woher die Kopie kommt. Ein Wert; ein Rueckweg in die Akte gibt es nicht
  -- (IDEA-LZK-003: kein Fluss vom Training in die Akte).
  source                   text not null default 'treatment' check (source = 'treatment'),
  offered_on               date not null,
  released_at              timestamptz not null default now(),
  -- Der Zugang zum Training, ueber den die Person freigab. Ohne FK: Der
  -- Zugang ist Nachweis mit eigener Frist (ADR-023 Punkt 5).
  released_platform_access_id uuid not null,
  constraint training_takeovers_relationship_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete cascade,
  constraint training_takeovers_position_unique unique (training_relationship_id, position)
);

comment on table public.training_takeovers is
  'KND-005 (ADR-021 Punkt 7, ANN-283): Angaben aus der Behandlung, die die Person beim Abschluss des Trainingsvertrags einzeln freigegeben hat - als Kopie mit Herkunftsvermerk, nie als Verweis auf die Akte. Unveraenderlich. Datenklasse: Trainingsverhaeltnis, faellt mit ihm. Kein Tabellenrecht und keine Policy.';

create index training_takeovers_relationship_idx
  on public.training_takeovers (organization_id, training_relationship_id, position);

revoke all on public.training_takeovers from anon, authenticated;
alter table public.training_takeovers enable row level security;

-- Die Kopie ist ein Nachweis: Sie aendert sich nicht.
create function app.training_takeovers_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'training takeovers are immutable' using errcode = '23514';
end;
$$;

revoke all on function app.training_takeovers_immutable() from public, anon, authenticated;

create trigger training_takeovers_immutable
  before update on public.training_takeovers
  for each row execute function app.training_takeovers_immutable();

-- Datenklassen (ADR-008, ADR-013 Punkt 9 Nr. 4)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('training_profiles', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Voraussetzungsprofil im Training (KND-005). Faellt mit dem Trainingsverhaeltnis (on delete cascade).', 57),
  ('training_takeovers', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Aus der Behandlung freigegebene Angaben als Kopie (KND-005, ADR-021 Punkt 7). Ab dem Kopieren Trainingsdaten mit der Frist des Verhaeltnisses; fallen mit ihm (on delete cascade).', 57);

-- -----------------------------------------------------------------------------
-- 3. Lesen
-- -----------------------------------------------------------------------------
create function public.get_training_profile(p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_einwilligung text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_relationship.viewed', 'not allowed to read training profiles');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null or not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    return null;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id,
    'success', jsonb_build_object('surface', 'web', 'view', 'profile')
  );

  select r.record_kind into v_einwilligung
  from public.training_consent_records r
  where r.training_relationship_id = p_relationship_id and r.purpose = 'training_health_data'
  order by r.recorded_at desc, r.id desc
  limit 1;

  return jsonb_build_object(
    'health_consent', v_einwilligung is not distinct from 'consent_granted',
    'profile', (
      select jsonb_build_object(
               'goals', p.goals,
               'equipment', p.equipment,
               'time_budget', p.time_budget,
               'places', p.places,
               'limits', p.limits,
               'history', p.history,
               'preferences', p.preferences,
               'updated_at', p.updated_at,
               'updated_by_name', up.display_name
             )
      from public.training_profiles p
      left join public.user_profiles up on up.id = p.updated_by
      where p.training_relationship_id = p_relationship_id
    ),
    'takeovers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', k.title,
               'body', k.body,
               'offered_on', k.offered_on,
               'released_at', k.released_at,
               -- Der Tag in der Zeitzone der Praxis, nicht in UTC (Zweitreview).
               'released_on', (k.released_at at time zone o.time_zone)::date
             ) order by k.position)
      from public.training_takeovers k
      join public.organizations o on o.id = k.organization_id
      where k.training_relationship_id = p_relationship_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_training_profile(uuid) from public, anon;
grant execute on function public.get_training_profile(uuid) to authenticated;

comment on function public.get_training_profile(uuid) is
  'KND-005: Voraussetzungsprofil und Uebernahmen aus der Behandlung eines Trainingsverhaeltnisses (owner, Trainingsbetreuung; ANN-287), dazu ob eine Einwilligung zu Gesundheitsangaben vermerkt ist. Jedes Lesen im Auditlog (training_relationship.viewed, view profile); andere Rollen: null und ein Eintrag der Abweisung.';

-- -----------------------------------------------------------------------------
-- 4. Schreiben
--
-- Ein Aufruf schreibt das ganze Profil. Mit dem erwarteten Stand
-- (`updated_at` beim Laden, null beim ersten Speichern): Zwei offene Fenster
-- ueberschreiben einander nicht still (PROJECT_PRINCIPLES.md 13).
-- -----------------------------------------------------------------------------
create function public.save_training_profile(
  p_relationship_id uuid,
  p_fields          jsonb,
  p_expected        timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_ende   date;
  v_stand  timestamptz;
  v_neu    timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    raise exception 'not allowed to write training profiles' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  select t.contract_ended_on into v_ende
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = '42501';
  end if;
  if v_ende is not null then
    raise exception 'training relationship has ended' using errcode = '23514';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_fields) k
    where k not in ('goals', 'equipment', 'time_budget', 'places', 'limits', 'history', 'preferences')
  ) or exists (
    select 1 from jsonb_each(p_fields) e
    where jsonb_typeof(e.value) not in ('string', 'null')
  ) then
    raise exception 'profile fields invalid' using errcode = '22023';
  end if;

  select p.updated_at into v_stand
  from public.training_profiles p
  where p.training_relationship_id = p_relationship_id;
  if v_stand is distinct from p_expected then
    raise exception 'training profile changed meanwhile' using errcode = '40001';
  end if;

  -- Ein leeres Feld ist kein Eintrag (app.leer_zu_null).
  insert into public.training_profiles as p (
    training_relationship_id, organization_id, goals, equipment, time_budget, places,
    limits, history, preferences, created_by, updated_by
  )
  values (
    p_relationship_id, v_org,
    app.leer_zu_null(p_fields ->> 'goals'),
    app.leer_zu_null(p_fields ->> 'equipment'),
    app.leer_zu_null(p_fields ->> 'time_budget'),
    app.leer_zu_null(p_fields ->> 'places'),
    app.leer_zu_null(p_fields ->> 'limits'),
    app.leer_zu_null(p_fields ->> 'history'),
    app.leer_zu_null(p_fields ->> 'preferences'),
    v_actor, v_actor
  )
  on conflict (training_relationship_id) do update
     set goals       = excluded.goals,
         equipment   = excluded.equipment,
         time_budget = excluded.time_budget,
         places      = excluded.places,
         limits      = excluded.limits,
         history     = excluded.history,
         preferences = excluded.preferences,
         -- Mindestens eine Mikrosekunde spaeter: Der neue Stand unterscheidet
         -- sich immer vom erwarteten, auch in derselben Transaktion.
         updated_at  = greatest(now(), p.updated_at + interval '1 microsecond'),
         updated_by  = v_actor
  returning p.updated_at into v_neu;

  return v_neu;
end;
$$;

revoke all on function public.save_training_profile(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_training_profile(uuid, jsonb, timestamptz) to authenticated;

comment on function public.save_training_profile(uuid, jsonb, timestamptz) is
  'KND-005: Voraussetzungsprofil schreiben (owner, Trainingsbetreuung; ANN-287) - sieben Freitexte, mit erwartetem Stand gegen stilles Ueberschreiben, nicht nach dem Vertragsende. Liefert den neuen Stand.';
