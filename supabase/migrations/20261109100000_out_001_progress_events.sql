-- =============================================================================
-- OUT-001 (OUT-EPIC-001): Verlaufsbild mit Ereignissen
--
-- "Zwischen den Terminen" zeigt die Angaben je Groesse kuenftig auch als Bild:
-- Punkte, keine Linie, daneben die Ereignisse, die einen Wert erklaeren
-- koennten (IDEA-OUT-005). Ereignisse sind:
--
--   * vermerkte Ereignisse - Operation, Erkrankung, Urlaub, Medikation,
--     Sonstiges. In der Behandlung die vorhandenen der Akte (FRB-002e), im
--     Training neu public.training_course_events (ADR-021 Punkt 5: am
--     Verhaeltnis, kein Verweis auf die Akte);
--   * Planwechsel - ein Plan wurde zugewiesen oder beendet (UEB-004 bis -007);
--   * durchgefuehrte Termine des Verhaeltnisses, als Striche an der Achse.
--
--   public.training_course_events      Ereignisse im Training (ANN-364)
--   public.add_training_course_event   vermerken
--   public.remove_training_course_event entfernen, nachvollziehbar
--   app.progress_plan_events_json      Planwechsel eines Verhaeltnisses
--   app.progress_appointment_days_json Tage durchgefuehrter Termine
--   public.get_checkins                + events, plan_events, appointment_days,
--                                        events_writable, health_consent
--
-- MARKIERUNG, KEINE BEWERTUNG. Die Anwendung setzt Ereignisse neben die Werte
-- und sagt nichts darueber, ob sie sie erklaeren (ADR-006 Punkt 11,
-- verbot-verlaufsbewertung in src/app/mdr.ts).
--
-- Protokoll (ADR-010 Fassung 3): keine neue Aktion. Das Lesen steht wie
-- bisher als Oeffnen von Akte bzw. Trainingsverhaeltnis (view: checkins), auch
-- fuer die vermerkten Ereignisse der Akte (wie list_patient_course_events seit
-- LOG-001a). Schreiben weist das Datenmodell nach (created_by, removed_by).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ereignisse im Training
-- -----------------------------------------------------------------------------
create table public.training_course_events (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null
                             references public.training_relationships (id) on delete cascade,

  -- Auch ein kuenftiger Tag ist zulaessig (wie ANN-106).
  occurred_on              date not null check (occurred_on >= date '1900-01-01'),

  -- Dieselben Arten wie in der Akte; muss deckungsgleich mit EREIGNISARTEN in
  -- src/lib/verlaufsereignisse.ts bleiben.
  kind                     text not null
                             check (kind in ('operation', 'erkrankung', 'urlaub', 'medikation', 'sonstiges')),

  note                     text check (note is null or length(btrim(note)) between 1 and 200),

  created_at               timestamptz not null default now(),
  created_by               uuid not null,

  -- Entfernen nimmt aus dem Verlauf, loescht nicht (wie ABN-013).
  removed_at               timestamptz,
  removed_by               uuid,
  constraint training_course_events_removed_pair
    check ((removed_at is null) = (removed_by is null))
);

comment on table public.training_course_events is
  'OUT-001 (IDEA-OUT-005, ANN-364): Ereignisse im Verlauf eines Trainingsverhaeltnisses - Operation, Erkrankung, Urlaub, Medikation, Sonstiges. Markierung ohne Bewertung; Gesundheitsangabe, nur mit Einwilligung. Kein direkter Zugriff, nur ueber die Funktionen. Datenklasse: Trainingsverhaeltnis, faellt mit ihm.';

create index training_course_events_relationship_idx
  on public.training_course_events (training_relationship_id, occurred_on);

alter table public.training_course_events enable row level security;
revoke all on public.training_course_events from public, anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('training_course_events', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Ereignisse im Verlauf des Trainings (OUT-001), auch entfernte. Gesundheitsangaben mit Einwilligung; fallen mit dem Trainingsverhaeltnis (FK on delete cascade).', 57);

-- Ob die Einwilligung zu Gesundheitsangaben im Training erteilt ist - der
-- juengste Vermerk entscheidet (ADR-021 Punkt 4). Dieselbe Regel wie fuer
-- "schwierig, weil ..." (app.platform_exercise_note_allowed, ANN-306).
create function app.training_health_consent(p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.platform_exercise_note_allowed('training', p_relationship_id)
$$;

revoke all on function app.training_health_consent(uuid) from public, anon, authenticated;

comment on function app.training_health_consent(uuid) is
  'OUT-001 (ANN-364): ob im Trainingsverhaeltnis die Einwilligung zu Gesundheitsangaben erteilt ist - der juengste Vermerk entscheidet, wie app.platform_exercise_note_allowed.';

create function public.add_training_course_event(
  p_relationship_id uuid,
  p_occurred_on     date,
  p_kind            text,
  p_note            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_rel   record;
  v_id    uuid;
begin
  if v_actor is null or not app.can_write_exercise_plans('training') then
    raise exception 'not allowed to record course events' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.checkin_relationship('training', p_relationship_id, v_org);
  if v_rel.area is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;
  if not v_rel.is_open then
    raise exception 'relationship has ended' using errcode = '22023';
  end if;
  -- Operation, Erkrankung, Medikation sind Gesundheitsangaben (ANN-364).
  if not app.training_health_consent(p_relationship_id) then
    raise exception 'health data consent missing' using errcode = '42501';
  end if;
  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  -- Art, Notiz und Tag pruefen die Constraints der Tabelle.
  insert into public.training_course_events (
    organization_id, training_relationship_id, occurred_on, kind, note, created_by
  )
  values (
    v_org, p_relationship_id, p_occurred_on, p_kind, nullif(btrim(p_note), ''), v_actor
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.add_training_course_event(uuid, date, text, text) from public, anon;
grant execute on function public.add_training_course_event(uuid, date, text, text) to authenticated;

comment on function public.add_training_course_event(uuid, date, text, text) is
  'OUT-001 (ANN-364): vermerkt ein Ereignis im Verlauf eines offenen Trainingsverhaeltnisses. Wer: app.can_write_exercise_plans(training); nur mit Einwilligung zu Gesundheitsangaben. Der Schreibvorgang steht am Datensatz (created_by, ADR-010 Fassung 3).';

create function public.remove_training_course_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  if v_actor is null or not app.can_write_exercise_plans('training') then
    raise exception 'not allowed to remove course events' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  update public.training_course_events e
     set removed_at = now(), removed_by = v_actor
   where e.id = p_event_id
     and e.organization_id = v_org
     and e.removed_at is null;
  if not found then
    raise exception 'course event not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_training_course_event(uuid) from public, anon;
grant execute on function public.remove_training_course_event(uuid) to authenticated;

comment on function public.remove_training_course_event(uuid) is
  'OUT-001 (ANN-364): nimmt ein Ereignis aus dem Verlauf des Trainings; Inhalt, Urheber und wer entfernt hat bleiben am Datensatz. Wer: app.can_write_exercise_plans(training). Auch nach Vertragsende, damit ein falscher Vermerk nicht stehen bleibt.';

-- -----------------------------------------------------------------------------
-- 2. Planwechsel und Termine eines Verhaeltnisses
-- -----------------------------------------------------------------------------

-- Zugewiesen und beendet, je Plan des Verhaeltnisses, aeltestes zuerst. Ein
-- Plan, der von einer neuen Fassung abgeloest wurde, endet mit deren
-- Zuweisung - das ist schon die Markierung der neuen Fassung.
create function app.progress_plan_events_json(p_kind text, p_relationship_id uuid, p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with plaene as (
    select p.*
    from public.exercise_plans p
    where p.organization_id = p_org
      and p.status <> 'draft'
      and (
        (p_kind = 'treatment' and p.service_area = 'therapy' and p.patient_id = p_relationship_id)
        or (p_kind = 'training' and p.service_area = 'training'
            and p.training_relationship_id = p_relationship_id)
      )
  ), zone as (
    select o.time_zone from public.organizations o where o.id = p_org
  ), ereignisse as (
    select (pl.assigned_at at time zone z.time_zone)::date as occurred_on,
           case when pl.previous_plan_id is null then 'plan_assigned' else 'plan_version' end as kind,
           pl.title, pl.assigned_at as zeitpunkt
    from plaene pl cross join zone z
    where pl.assigned_at is not null
    union all
    select (pl.ended_at at time zone z.time_zone)::date, 'plan_ended', pl.title, pl.ended_at
    from plaene pl cross join zone z
    where pl.status = 'ended' and pl.ended_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurred_on', e.occurred_on, 'kind', e.kind, 'title', e.title
  ) order by e.occurred_on, e.zeitpunkt), '[]'::jsonb)
  from ereignisse e
$$;

revoke all on function app.progress_plan_events_json(text, uuid, uuid) from public, anon, authenticated;

comment on function app.progress_plan_events_json(text, uuid, uuid) is
  'OUT-001 (IDEA-OUT-005): Planwechsel eines Verhaeltnisses - zugewiesen, neue Fassung, beendet - mit Tag in der Zeitzone der Praxis und Titel. Ohne Rechtepruefung: nur aus get_checkins.';

-- Die Tage durchgefuehrter Termine des Verhaeltnisses, hoechstens die
-- letzten 100, aeltester zuerst. Nur der Tag: kein Titel, keine Person.
create function app.progress_appointment_days_json(p_kind text, p_relationship_id uuid, p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.tag order by t.tag), '[]'::jsonb)
  from (
    select distinct (a.starts_at at time zone o.time_zone)::date as tag
    from public.appointments a
    join public.organizations o on o.id = a.organization_id
    where a.organization_id = p_org
      and a.status in ('completed', 'documented', 'invoiced')
      and (
        (p_kind = 'treatment' and a.kind = 'therapy' and a.patient_id = p_relationship_id)
        or (p_kind = 'training' and a.kind = 'training'
            and a.training_relationship_id = p_relationship_id)
      )
    order by 1 desc
    limit 100
  ) t
$$;

revoke all on function app.progress_appointment_days_json(text, uuid, uuid) from public, anon, authenticated;

comment on function app.progress_appointment_days_json(text, uuid, uuid) is
  'OUT-001 (IDEA-OUT-005): die Tage der letzten 100 durchgefuehrten Termine eines Verhaeltnisses (abgeschlossen, dokumentiert, abgerechnet) in der Zeitzone der Praxis - nur der Tag. Ohne Rechtepruefung: nur aus get_checkins.';

-- -----------------------------------------------------------------------------
-- 3. get_checkins: dazu Ereignisse, Planwechsel und Termine
--
-- Aus 20261106120000_trk_006_time_series.sql; neu sind events, plan_events,
-- appointment_days, events_writable und health_consent.
-- -----------------------------------------------------------------------------
create or replace function public.get_checkins(p_kind text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_org       uuid;
  v_area      text;
  v_takt      public.checkin_schedules%rowtype;
  v_offen     boolean;
  v_events    jsonb := '[]'::jsonb;
  v_consent   boolean;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not (app.can_read_exercise_plans('therapy') or app.can_read_exercise_plans('training')) then
    perform app.record_denied_read(v_actor, 'checkins.read', 'not allowed to read checkins');
    return null;
  end if;
  v_org := app.current_organization_id();
  select r.area, r.is_open into v_area, v_offen
  from app.checkin_relationship(p_kind, p_relationship_id, v_org) r;
  if v_area is null then
    return null;
  end if;
  -- Kein Durchgriff zwischen den Bereichen (ADR-021 Punkt 6).
  if not app.can_read_exercise_plans(v_area) then
    perform app.record_denied_read(v_actor, 'checkins.read', 'not allowed to read checkins');
    return null;
  end if;

  if p_kind = 'treatment' then
    perform app.log_record_access(
      v_org, v_actor, 'patient_record.viewed', 'patient', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'checkins'));
    -- OUT-001: die vermerkten Ereignisse der Akte, wer sie im Befund lesen
    -- darf; das Lesen steht schon als Oeffnen der Akte im Protokoll.
    if app.can_read_treatment_note() then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'occurred_on', e.occurred_on, 'kind', e.kind, 'note', e.note,
               'created_at', e.created_at, 'author_name', up.display_name
             ) order by e.occurred_on, e.created_at), '[]'::jsonb)
        into v_events
      from public.patient_course_events e
      left join public.user_profiles up on up.id = e.created_by
      where e.patient_id = p_relationship_id and e.organization_id = v_org
        and e.removed_at is null;
    end if;
  else
    perform app.log_record_access(
      v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'checkins'));
    v_consent := app.training_health_consent(p_relationship_id);
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'occurred_on', e.occurred_on, 'kind', e.kind, 'note', e.note,
             'created_at', e.created_at, 'author_name', up.display_name
           ) order by e.occurred_on, e.created_at), '[]'::jsonb)
      into v_events
    from public.training_course_events e
    left join public.user_profiles up on up.id = e.created_by
    where e.training_relationship_id = p_relationship_id and e.organization_id = v_org
      and e.removed_at is null;
  end if;

  select * into v_takt
  from public.checkin_schedules s
  where s.relationship_kind = p_kind and s.relationship_id = p_relationship_id;

  return jsonb_build_object(
    'today', app.training_today(v_org),
    'can_write', app.can_write_exercise_plans(v_area),
    -- Nach Abschluss bzw. Vertragsende antwortet niemand mehr (Lesefrist);
    -- dann gibt es keinen faelligen Tag (Zweitreview S5, ANN-350).
    'relationship_open', v_offen,
    'schedule', case when v_takt.id is null then null else jsonb_build_object(
      'interval_days', v_takt.interval_days,
      'parameter_keys', to_jsonb(v_takt.parameter_keys),
      'starts_on', v_takt.starts_on,
      'due_on', case when v_offen then app.checkin_due_on(v_takt) end,
      'updated_at', v_takt.updated_at,
      'updated_by_name', (select up.display_name from public.user_profiles up
                          where up.id = v_takt.updated_by)
    ) end,
    'checkins', app.checkins_json(p_kind, p_relationship_id),
    -- TRK-006: Uhrzeiten in der Zeitzone der Praxis (IDEA-TRK-006).
    'time_zone', (select o.time_zone from public.organizations o where o.id = v_org),
    -- TRK-006: die Angaben nach den Einheiten aller Plaene des Verhaeltnisses,
    -- dieselben Rollen wie die Plaene (ANN-351, ANN-356).
    'sessions', app.checkin_sessions_json(p_kind, p_relationship_id),
    -- OUT-001: was neben den Werten steht (IDEA-OUT-005, ANN-364).
    'events', v_events,
    'plan_events', app.progress_plan_events_json(p_kind, p_relationship_id, v_org),
    'appointment_days', app.progress_appointment_days_json(p_kind, p_relationship_id, v_org),
    -- Im Training vermerkt die Betreuung hier; in der Behandlung im Befund.
    'events_writable', p_kind = 'training' and v_offen and coalesce(v_consent, false)
                       and app.can_write_exercise_plans(v_area),
    'health_consent', v_consent
  );
end;
$$;

revoke all on function public.get_checkins(text, uuid) from public, anon;
grant execute on function public.get_checkins(text, uuid) to authenticated;

comment on function public.get_checkins(text, uuid) is
  'TRK-002, TRK-006, OUT-001: Abschnitt "Zwischen den Terminen" (DSN-001 Abschnitt 6) - Takt, naechster Tag, die Check-ins mit ihren Angaben und die Angaben nach den Einheiten, unveraendert und ohne Bewertung (ADR-006 Punkt 11), mit der Zeitzone der Praxis; dazu die Ereignisse, Planwechsel und Tage durchgefuehrter Termine fuer das Verlaufsbild (IDEA-OUT-005). Lesen wie die Uebungsplaene (ANN-351), protokolliert wie das Oeffnen von Akte bzw. Trainingsverhaeltnis. Ohne Recht null und eine Abweisung im Protokoll.';
