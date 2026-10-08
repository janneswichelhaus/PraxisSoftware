-- =============================================================================
-- UEB-010 (UEB-EPIC-003): Die Durchfuehrungsansicht fuer die Einheit
--
-- IDEA-ORG-003: "Ich stehe gerade in der Kueche und mache meine Uebungen" -
-- Uebung fuer Uebung, Satz abhaken, Pause, Abbrechen ohne Datenverlust.
-- DSN-001 4.1: ein Haken "gemacht" und ein freiwilliges Feld "Das war
-- schwierig, weil ...". Keine Punktzahl, keine Serie, kein Lob (ADR-006).
--
--   public.exercise_plan_sessions       eine Einheit an einem Plan
--   public.exercise_plan_session_sets   ein abgehakter Satz einer Uebung
--   app.platform_access_allows          + Faehigkeit 'exercise' (ANN-306)
--   app.platform_access_writable        nicht in der Lesefrist (ANN-305)
--   public.start_platform_exercise_session
--   public.mark_platform_exercise_set
--   public.finish_platform_exercise_session
--   public.platform_exercise_plans      + Stand der Einheit, letzte Tage
--   public.get_exercise_plan            + die Einheiten fuer die Praxis
--   public.export_patient_record        + die Einheiten (Art. 15)
--
-- Jeder Haken wird sofort gespeichert (ANN-305): Wer abbricht, verliert
-- nichts, und auf dem Geraet liegt nichts (ADR-001, ADR-015 Punkt 16). Den
-- Schreibvorgang weist das Datenmodell nach (ADR-010 Fassung 3): Zugang, Art
-- und Konto stehen an der Einheit; eine Vertretung wird protokolliert wie
-- jede Vertretung (ADR-023 Punkt 24).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Einheit
-- -----------------------------------------------------------------------------
create table public.exercise_plan_sessions (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  plan_id              uuid not null,
  -- Der Tag in der Zeitzone der Praxis.
  performed_on         date not null,
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  -- "Das war schwierig, weil ..." - freiwillig, von der Person (DSN-001 4.1).
  difficulty_note      text check (difficulty_note is null
                                   or length(btrim(difficulty_note, E' \t\r\n')) between 1 and 500),
  -- Wer erfasst hat: der Zugang und seine Art, das Konto. Ohne Fremdschluessel
  -- wie an training_consent_records: Der Zugang hat eine kuerzere Frist als
  -- der Plan (ADR-023 Punkt 5).
  platform_access_id   uuid not null,
  platform_access_kind text not null check (platform_access_kind in ('self', 'legal_representative')),
  recorded_by          uuid not null,
  updated_at           timestamptz not null default now(),

  constraint exercise_plan_sessions_id_organization unique (id, organization_id),
  constraint exercise_plan_sessions_plan_fk
    foreign key (plan_id, organization_id)
    references public.exercise_plans (id, organization_id) on delete cascade,
  constraint exercise_plan_sessions_note_when_finished check (
    difficulty_note is null or finished_at is not null
  )
);

comment on table public.exercise_plan_sessions is
  'UEB-010: eine Einheit, die die Person an einem zugewiesenen Plan durchfuehrt (IDEA-ORG-003). Datenklasse wie ihr Plan (Patientenakte bzw. Trainingsverhaeltnis); faellt mit ihm. Geschrieben nur ueber die Plattformfunktionen (ANN-305, ANN-306). Kein Tabellenrecht (ADR-004).';
comment on column public.exercise_plan_sessions.difficulty_note is
  'Freitext der Person. Darf NIEMALS in Betriebslogs oder in den Auditkontext gelangen (ADR-011). Im Training nur mit Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4, ANN-306).';
comment on column public.exercise_plan_sessions.finished_at is
  'Beendet: Danach aendert sich nichts mehr. Eine nicht beendete Einheit eines frueheren Tages bleibt so stehen - abgebrochen, nicht verloren (ANN-305).';

create index exercise_plan_sessions_plan_idx
  on public.exercise_plan_sessions (plan_id, performed_on desc);
-- Hoechstens eine offene Einheit je Plan und Tag: Zwei schnelle Haken auf dem
-- Telefon beginnen nicht zwei Einheiten (ANN-305).
create unique index exercise_plan_sessions_one_open
  on public.exercise_plan_sessions (plan_id, performed_on) where finished_at is null;

revoke all on public.exercise_plan_sessions from public, anon, authenticated;
alter table public.exercise_plan_sessions enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Der abgehakte Satz
-- -----------------------------------------------------------------------------
create table public.exercise_plan_session_sets (
  id              uuid primary key default extensions.gen_random_uuid(),
  session_id      uuid not null,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  item_id         uuid not null references public.exercise_plan_items (id) on delete cascade,
  set_number      smallint not null check (set_number between 1 and 20),
  done_at         timestamptz not null default now(),

  constraint exercise_plan_session_sets_one_tick unique (session_id, item_id, set_number),
  constraint exercise_plan_session_sets_session_fk
    foreign key (session_id, organization_id)
    references public.exercise_plan_sessions (id, organization_id) on delete cascade
);

comment on table public.exercise_plan_session_sets is
  'UEB-010: ein abgehakter Satz einer Uebung in einer Einheit. Gespeichert mit dem Haken, nicht erst am Ende (ANN-305). Datenklasse wie die Einheit; faellt mit ihr. Kein Tabellenrecht (ADR-004).';

create index exercise_plan_session_sets_item_idx on public.exercise_plan_session_sets (item_id);

revoke all on public.exercise_plan_session_sets from public, anon, authenticated;
alter table public.exercise_plan_session_sets enable row level security;

-- Zweite Grenze (ADR-004): wie Plan und Positionen.
create policy exercise_plan_sessions_select_scoped
  on public.exercise_plan_sessions for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and exists (
      select 1 from public.exercise_plans p
      where p.id = exercise_plan_sessions.plan_id
        and app.can_read_exercise_plans(p.service_area)
    )
  );

create policy exercise_plan_session_sets_select_scoped
  on public.exercise_plan_session_sets for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and exists (
      select 1 from public.exercise_plan_sessions s
      join public.exercise_plans p on p.id = s.plan_id
      where s.id = exercise_plan_session_sets.session_id
        and app.can_read_exercise_plans(p.service_area)
    )
  );

-- Datenklasse je Zeile am Bereich des Plans (ADR-008, ANN-297)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('exercise_plan_sessions', 'patientenakte', 'ueber_elterndatensatz',
   'Durchgefuehrte Einheiten eines Behandlungsplans (UEB-010), von der Person erfasst. Fallen mit ihrem Plan und damit mit der Akte.',
   49),
  ('exercise_plan_sessions', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Durchgefuehrte Einheiten eines Trainingsplans (UEB-010), von der Person erfasst. Fallen mit ihrem Plan und damit mit dem Trainingsverhaeltnis.',
   57),
  ('exercise_plan_session_sets', 'patientenakte', 'ueber_elterndatensatz',
   'Abgehakte Saetze einer Einheit eines Behandlungsplans (UEB-010). Fallen mit der Einheit.',
   49),
  ('exercise_plan_session_sets', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Abgehakte Saetze einer Einheit eines Trainingsplans (UEB-010). Fallen mit der Einheit.',
   57);

-- -----------------------------------------------------------------------------
-- 3. Wer eine Einheit erfasst (ANN-306)
--
-- Aus 20261014120000_ang_003_aftercare_cancellation.sql (juengste Fassung);
-- neu ist nur 'exercise': die Person selbst und ihre rechtliche Vertretung.
-- Eine Begleitung liest mit, erfasst aber keine Angaben fuer die Person - wie
-- beim Befundbogen (ADR-023 Punkt 13, ANN-248).
-- -----------------------------------------------------------------------------
create or replace function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      -- Gesundheit: Lesen, Wuensche, Nachrichten. Jede Vertretung traegt
      -- diesen Bereich nachgewiesen (Constraint platform_accesses_kind_fields).
      when p_capability in ('read', 'request', 'message') then true
      -- Rechnungen und Zahlungen: der eigene Zugang, sonst nur mit
      -- nachgewiesener Vermoegenssorge bzw. Einwilligung (ABN-010).
      when p_capability = 'billing'
        then a.access_kind = 'self' or coalesce(a.finance_scope, false)
      -- ANG-003 (ANN-273): einen Vertrag kuendigen die Person selbst und eine
      -- rechtliche Vertretung mit Vermoegenssorge, nie eine Begleitung.
      when p_capability = 'contract'
        then a.access_kind = 'self'
             or (a.access_kind = 'legal_representative' and coalesce(a.finance_scope, false))
      -- POR-012 (ANN-248): den Befundbogen fuellt die Person selbst oder ihre
      -- rechtliche Vertretung aus - eine Angabe zur Gesundheit, die eine
      -- Begleitung nicht fuer sie macht.
      -- UEB-010 (ANN-306): ebenso die Einheit am Plan.
      when p_capability in ('consent', 'export', 'manage_companions', 'questionnaire', 'exercise')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 4. In der Lesefrist wird nicht mehr geschrieben (ANN-305, DSN-001 4.3)
--
-- "Alle Knoepfe, die schreiben, fallen weg": Hat das Verhaeltnis ein Ende,
-- von dem an die Lesefrist zaehlt (app.platform_read_from, ANN-274), und ist
-- dieser Tag erreicht, ist der Zugang nur noch lesbar. Ein laufendes
-- Nachsorge-Abo haelt ihn offen.
-- -----------------------------------------------------------------------------
create function app.platform_access_writable(p_access_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select l.lese_ab is null or l.lese_ab > app.training_today(a.organization_id)
    from public.platform_accesses a
    left join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r on true
    left join lateral (
      select app.platform_read_from(a.relationship_kind, a.relationship_id, r.ended_on) as lese_ab
    ) l on true
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

revoke all on function app.platform_access_writable(uuid) from public, anon, authenticated;

comment on function app.platform_access_writable(uuid) is
  'UEB-010 (ANN-305): ob ein lesbarer Zugang noch schreiben darf - nicht in der Lesefrist nach dem Ende des Verhaeltnisses bzw. des Nachsorge-Abos (DSN-001 4.3, ANN-274).';

-- Im Training ist "Das war schwierig, weil ..." eine Angabe zur Gesundheit,
-- die die Einwilligung braucht (ADR-021 Punkt 4, ANN-264): der juengste
-- Vermerk entscheidet. In der Behandlung traegt die Heilbehandlung sie.
create function app.platform_exercise_note_allowed(p_kind text, p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then true
    when 'training' then coalesce((
      select r.record_kind = 'consent_granted'
      from public.training_consent_records r
      where r.training_relationship_id = p_relationship_id
        and r.purpose = 'training_health_data'
      order by r.recorded_at desc, r.id desc
      limit 1
    ), false)
    else false
  end
$$;

revoke all on function app.platform_exercise_note_allowed(text, uuid) from public, anon, authenticated;

comment on function app.platform_exercise_note_allowed(text, uuid) is
  'UEB-010 (ANN-306): ob die Person zu einer Einheit "Das war schwierig, weil ..." schreiben darf - in der Behandlung immer, im Training nur mit erteilter Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4).';

-- Der Plan, an dem ein Zugang heute ueben darf, oder nichts (ANN-305).
create function app.platform_exercise_plan(p_access_id uuid, p_plan_id uuid)
returns public.exercise_plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.platform_accesses a
  join public.exercise_plans p on p.organization_id = a.organization_id
  where a.id = p_access_id
    and p.id = p_plan_id
    and p.status = 'assigned'
    and p.runs_from <= app.training_today(a.organization_id)
    and (
      (a.relationship_kind = 'treatment' and p.service_area = 'therapy'
         and p.patient_id = a.relationship_id)
      or (a.relationship_kind = 'training' and p.service_area = 'training'
         and p.training_relationship_id = a.relationship_id)
    )
$$;

revoke all on function app.platform_exercise_plan(uuid, uuid) from public, anon, authenticated;

-- Die Pruefung vor jedem Schreiben - die eine Stelle.
create function app.assert_platform_exercise(p_access_id uuid)
returns public.platform_accesses
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'exercise')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  return v_zugang;
end;
$$;

revoke all on function app.assert_platform_exercise(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Beginnen, abhaken, beenden
-- -----------------------------------------------------------------------------
create function public.start_platform_exercise_session(p_access_id uuid, p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_plan   public.exercise_plans%rowtype;
  v_heute  date;
  v_id     uuid;
begin
  v_zugang := app.assert_platform_exercise(p_access_id);
  v_plan := app.platform_exercise_plan(p_access_id, p_plan_id);
  if v_plan.id is null then
    raise exception 'exercise plan not found' using errcode = 'P0002';
  end if;
  v_heute := app.training_today(v_zugang.organization_id);

  -- Eine heute begonnene, nicht beendete Einheit geht weiter (ANN-305):
  -- Abbrechen und wieder Anfangen verliert nichts.
  insert into public.exercise_plan_sessions (
    organization_id, plan_id, performed_on, platform_access_id, platform_access_kind, recorded_by
  )
  values (
    v_plan.organization_id, v_plan.id, v_heute, v_zugang.id, v_zugang.access_kind, auth.uid()
  )
  on conflict (plan_id, performed_on) where finished_at is null do nothing
  returning id into v_id;

  if v_id is null then
    select s.id into v_id
    from public.exercise_plan_sessions s
    where s.plan_id = v_plan.id and s.performed_on = v_heute and s.finished_at is null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'exercise_session')
  );
  return v_id;
end;
$$;

revoke all on function public.start_platform_exercise_session(uuid, uuid) from public, anon;
grant execute on function public.start_platform_exercise_session(uuid, uuid) to authenticated;

comment on function public.start_platform_exercise_session(uuid, uuid) is
  'UEB-010: beginnt eine Einheit am laufenden Plan des Verhaeltnisses oder setzt die heute begonnene fort (ANN-305). Nur die Person und ihre rechtliche Vertretung (ANN-306), nicht in der Lesefrist. Sonst 42501, ein fremder oder nicht laufender Plan P0002.';

-- Die Einheit des Zugangs, die noch offen ist - sonst nichts.
create function app.platform_open_exercise_session(p_access_id uuid, p_session_id uuid)
returns public.exercise_plan_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.exercise_plan_sessions s
  where s.id = p_session_id
    and s.finished_at is null
    and (app.platform_exercise_plan(p_access_id, s.plan_id)).id is not null
$$;

revoke all on function app.platform_open_exercise_session(uuid, uuid) from public, anon, authenticated;

create function public.mark_platform_exercise_set(
  p_access_id  uuid,
  p_session_id uuid,
  p_item_id    uuid,
  p_set_number integer,
  p_done       boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_einheit public.exercise_plan_sessions%rowtype;
  v_saetze  smallint;
begin
  v_zugang := app.assert_platform_exercise(p_access_id);
  v_einheit := app.platform_open_exercise_session(p_access_id, p_session_id);
  if v_einheit.id is null then
    raise exception 'exercise session not found' using errcode = 'P0002';
  end if;

  select i.sets into v_saetze
  from public.exercise_plan_items i
  where i.id = p_item_id and i.plan_id = v_einheit.plan_id;
  if v_saetze is null then
    raise exception 'exercise not found' using errcode = 'P0002';
  end if;
  if p_set_number is null or p_set_number < 1 or p_set_number > v_saetze then
    raise exception 'set out of range' using errcode = '22023';
  end if;

  if coalesce(p_done, false) then
    insert into public.exercise_plan_session_sets (session_id, organization_id, item_id, set_number)
    values (v_einheit.id, v_einheit.organization_id, p_item_id, p_set_number)
    on conflict do nothing;
  else
    delete from public.exercise_plan_session_sets
    where session_id = v_einheit.id and item_id = p_item_id and set_number = p_set_number;
  end if;

  update public.exercise_plan_sessions set updated_at = now() where id = v_einheit.id;
end;
$$;

revoke all on function public.mark_platform_exercise_set(uuid, uuid, uuid, integer, boolean)
  from public, anon;
grant execute on function public.mark_platform_exercise_set(uuid, uuid, uuid, integer, boolean)
  to authenticated;

comment on function public.mark_platform_exercise_set(uuid, uuid, uuid, integer, boolean) is
  'UEB-010: hakt einen Satz einer Uebung in einer offenen Einheit ab oder nimmt den Haken zurueck - sofort gespeichert (ANN-305). Satznummer 1 bis zu den Saetzen der Position. Dieselben Rechte wie das Beginnen.';

create function public.finish_platform_exercise_session(
  p_access_id  uuid,
  p_session_id uuid,
  p_note       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_einheit public.exercise_plan_sessions%rowtype;
  v_notiz   text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
begin
  v_zugang := app.assert_platform_exercise(p_access_id);
  v_einheit := app.platform_open_exercise_session(p_access_id, p_session_id);
  if v_einheit.id is null then
    raise exception 'exercise session not found' using errcode = 'P0002';
  end if;
  if v_notiz is not null then
    if length(v_notiz) > 500 then
      raise exception 'note too long' using errcode = '22023';
    end if;
    if not app.platform_exercise_note_allowed(v_zugang.relationship_kind, v_zugang.relationship_id) then
      raise exception 'note requires consent' using errcode = '42501';
    end if;
  end if;

  update public.exercise_plan_sessions
     set finished_at = now(), difficulty_note = v_notiz, updated_at = now()
   where id = v_einheit.id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'exercise_session')
  );
end;
$$;

revoke all on function public.finish_platform_exercise_session(uuid, uuid, text) from public, anon;
grant execute on function public.finish_platform_exercise_session(uuid, uuid, text) to authenticated;

comment on function public.finish_platform_exercise_session(uuid, uuid, text) is
  'UEB-010: beendet eine offene Einheit, wahlweise mit "Das war schwierig, weil ..." (hoechstens 500 Zeichen; im Training nur mit Einwilligung, ANN-306). Danach aendert sich an der Einheit nichts mehr.';

-- -----------------------------------------------------------------------------
-- 6. Die Projektion der Plattform: Stand der Einheit und die letzten Tage
--
-- Aus 20261019100000_ueb_009_platform_exercise_plans.sql; neu sind
-- can_exercise, note_allowed, open_session und recent_sessions.
-- -----------------------------------------------------------------------------
create or replace function public.platform_exercise_plans(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
  v_heute  date;
  v_darf   boolean;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := app.training_today(v_zugang.organization_id);
  v_darf := app.platform_access_allows(p_access_id, 'exercise')
            and app.platform_access_writable(p_access_id);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'exercise_plans')
  );

  return jsonb_build_object(
    'today', v_heute,
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'service_area', p.service_area,
        'title', p.title,
        'status', p.status,
        'sessions_per_week', p.sessions_per_week,
        'assigned_on', (p.assigned_at at time zone v_zone)::date,
        'runs_from', p.runs_from,
        'runs_until', p.runs_until,
        'ended_on', (p.ended_at at time zone v_zone)::date,
        -- UEB-010: Darf dieser Zugang heute an diesem Plan ueben?
        'can_exercise', v_darf and p.status = 'assigned' and p.runs_from <= v_heute,
        'note_allowed', app.platform_exercise_note_allowed(
                          v_zugang.relationship_kind, v_zugang.relationship_id),
        -- Die heute begonnene, nicht beendete Einheit mit ihren Haken.
        'open_session', (
          select jsonb_build_object(
            'id', s.id,
            'sets', coalesce((
              select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'set_number', x.set_number)
                               order by x.item_id, x.set_number)
              from public.exercise_plan_session_sets x where x.session_id = s.id
            ), '[]'::jsonb)
          )
          from public.exercise_plan_sessions s
          where s.plan_id = p.id and s.performed_on = v_heute and s.finished_at is null
          order by s.started_at desc
          limit 1
        ),
        -- Die Tage der letzten vier Wochen, an denen die Person geuebt hat.
        'recent_sessions', coalesce((
          select jsonb_agg(jsonb_build_object('performed_on', s.performed_on,
                                              'finished', s.finished_at is not null)
                           order by s.performed_on desc, s.started_at desc)
          from public.exercise_plan_sessions s
          where s.plan_id = p.id and s.performed_on > v_heute - 28
        ), '[]'::jsonb),
        'items', coalesce((
          select jsonb_agg(app.platform_exercise_plan_item_json(i) order by i.position)
          from public.exercise_plan_items i where i.plan_id = p.id
        ), '[]'::jsonb)
      ) order by p.status, p.runs_from, p.id)
      from app.platform_visible_exercise_plans(v_zugang.relationship_kind, v_zugang.relationship_id) p
      where p.organization_id = v_zugang.organization_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.platform_exercise_plans(uuid) is
  'UEB-009/UEB-010: Plattformprojektion "Uebungen" bzw. "Training" (DSN-001 4.1, 5): die laufenden Plaene des Verhaeltnisses hinter einem lesbaren Zugang, sonst der zuletzt beendete (ANN-304), als Schnappschuss in Alltagssprache mit fester Schluesselliste (ADR-023 Punkt 22); dazu, ob heute geuebt werden darf, die offene Einheit und die Tage der letzten vier Wochen (ANN-305). Ueber eine Vertretung protokolliert (Punkt 24). Ohne Recht null.';

-- -----------------------------------------------------------------------------
-- 7. Fuer die Praxis: die Einheiten am Plan
-- -----------------------------------------------------------------------------
create function app.exercise_plan_sessions_json(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'performed_on', s.performed_on,
    'started_at', s.started_at,
    'finished_at', s.finished_at,
    'sets_done', (select count(*) from public.exercise_plan_session_sets x where x.session_id = s.id),
    'sets_total', (select coalesce(sum(i.sets), 0) from public.exercise_plan_items i
                   where i.plan_id = s.plan_id),
    'difficulty_note', s.difficulty_note,
    'recorded_by_kind', s.platform_access_kind
  ) order by s.performed_on desc, s.started_at desc), '[]'::jsonb)
  from public.exercise_plan_sessions s
  where s.plan_id = p_plan_id
$$;

revoke all on function app.exercise_plan_sessions_json(uuid) from public, anon, authenticated;

comment on function app.exercise_plan_sessions_json(uuid) is
  'UEB-010: die Einheiten eines Plans fuer die Praxis - Tag, beendet, Saetze, "schwierig, weil ..." und wer erfasst hat (Person oder rechtliche Vertretung). Ohne Rechtepruefung: nur aus get_exercise_plan und der Auskunft.';

-- Aus 20261018130000_ueb_007_plan_review.sql (juengste Fassung); neu ist nur
-- der Schluessel 'sessions'. Rechte, Protokoll und Projektion unveraendert.
create or replace function public.get_exercise_plan(p_plan_id uuid)
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
    'review_due', app.exercise_plan_review_due(v_plan),
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
    ), '[]'::jsonb),
    -- UEB-010: was die Person an diesem Plan durchgefuehrt hat.
    'sessions', app.exercise_plan_sessions_json(v_plan.id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Auskunft nach Art. 15: die Einheiten stehen am Plan
--
-- Aus 20261018110000_ueb_005_assign_exercise_plan.sql (juengste Fassung); neu
-- ist nur 'sessions' an jedem Uebungsplan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'take_along_items', v.take_along_items,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'fee_waived_at', t.fee_waived_at,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at,
        'photo_locked_at', da.photo_locked_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Die Fotos gehoeren zur vollstaendigen Kopie, auch
    -- gesperrte, solange sie vorhanden sind. Die Datei selbst gibt owner je
    -- Foto heraus (hand_out_patient_photo, protokolliert); dieser Abschnitt
    -- ist die Liste dazu.
    'patient_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fo.id,
        'display_name', fo.display_name,
        'art', fo.document_type,
        'aufgenommen_am', fo.created_at,
        'gesperrt', not app.patient_photo_usable(fo.document_type, fo.patient_id, fo.created_at, fo.photo_locked_at),
        'datei_vorhanden', exists (
          select 1 from storage.objects o
          where o.bucket_id = app.patient_file_bucket_for(fo.document_type) and o.name = fo.object_key)
      ) order by fo.created_at)
      from public.patient_files fo
      where fo.patient_id = p_patient_id
        and app.is_patient_photo_type(fo.document_type)
        and fo.status = 'ready'
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Datum und Zweck der Zugriffe aus dem Auditlog -
    -- ohne Namen und ohne Kennung der Beschaeftigten (Art. 15 Abs. 4 DSGVO);
    -- eine begruendete Ausnahme prueft owner im Einzelfall (ANN-092).
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zeitpunkt', al.occurred_at,
        'aktion', al.action,
        'gegenstand', al.subject_type,
        'ergebnis', al.outcome,
        'durch', case al.actor_kind
                   when 'user' then 'praxis'
                   when 'system' then 'system'
                   when 'platform' then 'person_selbst'
                   when 'representative' then 'vertretung'
                 end
      ) order by al.occurred_at)
      from public.audit_log al
      where al.organization_id = v_org
        -- LOG-EPIC-001: Zugriffe, keine Abweisungen. Die Aktionen sind seit
        -- ADR-010 Fassung 3 ohnehin nur noch, was die Daten nicht zeigen.
        and al.outcome = 'success'
        -- Auch die Zugriffe auf zusammengefuehrte Doppelanlagen gehoeren
        -- zu dieser Person (ABN-018, BEF-108).
        and ((al.subject_type = 'patient' and al.subject_id = any(array(
                select p_patient_id
                union all
                select mr2.source_patient_id from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
             or al.context ->> 'patient_id' = any(array(
                select p_patient_id::text
                union all
                select mr2.source_patient_id::text from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
    ), '[]'::jsonb),

    -- ABN-018 (BEF-108): Nachweise des Zusammenfuehrens an dieser Akte.
    'patient_merge_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'merged_at', mr.merged_at,
        'source_patient_id', mr.source_patient_id,
        'counts', mr.counts
      ) order by mr.merged_at)
      from public.patient_merge_records mr
      where mr.target_patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ANG-001: das Nachsorge-Abo mit Beginn, Ende und Kuendigung (Art. 15).
    'aftercare_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_on', s.starts_on,
        'ends_on', s.ends_on,
        'created_at', s.created_at,
        'cancelled_on', s.cancelled_on,
        'cancelled_via', s.cancelled_via,
        'cancelled_access_kind', s.cancelled_access_kind,
        'cancelled_representative_name', s.cancelled_representative_name
      ) order by s.starts_on)
      from public.aftercare_subscriptions s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KND-002: die Trainingsangebote aus der Akte mit Uebergabeangaben (Art. 15).
    'training_offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.label,
        'starts_on', o.starts_on,
        'valid_until', o.valid_until,
        'handover_items', o.handover_items,
        'offers_contact', o.offers_contact,
        'created_at', o.created_at,
        'withdrawn_at', o.withdrawn_at
      ) order by o.created_at)
      from public.training_offers o
      join public.service_catalog_items c on c.id = o.catalog_item_id
      where o.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- UEB-005: die Uebungsplaene der Behandlung mit Positionen (Art. 15).
    'exercise_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', x.title,
        'status', x.status,
        'sessions_per_week', x.sessions_per_week,
        'created_at', x.created_at,
        'assigned_at', x.assigned_at,
        'runs_from', x.runs_from,
        'runs_until', x.runs_until,
        'ended_at', x.ended_at,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(xi) - 'id' - 'variant_id'
                           - 'previous_item_id' - 'variant_archived' order by xi.position)
          from public.exercise_plan_items xi where xi.plan_id = x.id
        ), '[]'::jsonb),
        -- UEB-010: die durchgefuehrten Einheiten, ohne interne Kennung.
        'sessions', (
          select coalesce(jsonb_agg(z - 'id'), '[]'::jsonb)
          from jsonb_array_elements(app.exercise_plan_sessions_json(x.id)) z
        )
      ) order by x.created_at)
      from public.exercise_plans x
      where x.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABR-030: Honorarvereinbarungen sind Daten zur Person (Art. 15 DSGVO).
    -- ABR-031: das festgeschriebene Terminhonorar je Termin (Art. 15 DSGVO).
    'session_fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', f.appointment_id,
        'performed_on', f.performed_on,
        'amount_cents', f.amount_cents,
        'source', f.source,
        'created_at', f.created_at
      ) order by f.performed_on)
      from public.appointment_session_fees f
      join public.appointments a on a.id = f.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    'fee_agreements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'valid_from', f.valid_from,
        'session_fee_cents', f.session_fee_cents,
        'created_at', f.created_at
      ) order by f.valid_from)
      from public.patient_fee_agreements f
      where f.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at,
        -- POR-016: Herkunft, Vertretung und Textfassung (Zweitreview).
        'source', pr.source,
        'platform_access_kind', pr.platform_access_kind,
        'representative_name', pr.representative_name,
        'wording_version', pr.wording_version
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at,
        -- ABN-013 (BEF-102): Ein entferntes Ereignis bleibt Teil der Akte.
        'removed_at', ce.removed_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-015: gesicherte, noch nicht uebernommene Befundangaben.
    'treatment_draft_findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', df.appointment_id,
        'findings', df.findings,
        'updated_at', df.updated_at
      ) order by df.updated_at)
      from public.treatment_draft_findings df
      join public.appointments a on a.id = df.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien und Fotos',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme und jedes Foto, auch gesperrte; die Datei selbst wird je Datei herausgegeben (ADR-017, ANN-128).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$function$;
