-- =============================================================================
-- TRK-002 (TRK-EPIC-001): Check-in mit einstellbarem Takt - die Praxisseite
--
-- IDEA-TRK-004: wiederkehrende Selbstauskunft in einem je Verhaeltnis
-- eingestellten Takt, kurz, ohne Mahnung; IDEA-TRK-002: wenige Fragen.
-- DSN-001 Abschnitt 6: Die Praxis stellt den Takt im Verhaeltnis ein und
-- liest die Angaben im Abschnitt "Zwischen den Terminen" - Liste mit Datum,
-- keine Farbe als Bewertung. D5: kein Alarm, keine Benachrichtigung je
-- Check-in.
--
--   public.checkin_schedules     der Takt eines Verhaeltnisses (ANN-350)
--   public.checkins              ein beantworteter Check-in
--   public.checkin_values        seine Angaben, je Groesse eine Zeile
--   public.get_checkins          Takt und Angaben fuer die Praxis
--   public.set_checkin_schedule  Takt einstellen oder aendern
--   public.end_checkin_schedule  Takt beenden; Angaben bleiben
--   public.export_patient_record + checkin_schedules, checkins (Art. 15)
--   public.merge_patients        + Takt und Check-ins ziehen mit
--
-- Die Plattform beantwortet die Check-ins in TRK-003. Wer einstellt und wer
-- liest, sind dieselben Rollen wie bei den Uebungsplaenen (ANN-351): die
-- eine Stelle app.can_write_exercise_plans bzw. app.can_read_exercise_plans.
-- Erfassen und anzeigen, nie bewerten (ADR-006 Punkt 11).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Takt
-- -----------------------------------------------------------------------------

-- Fragen eines Check-ins: eine bis fuenf verschiedene Groessen des Takts
-- `checkin` (ANN-349).
create function app.checkin_keys_valid(p_keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_keys), 0) between 1 and 5
     and (select count(distinct k) from unnest(p_keys) k) = cardinality(p_keys)
     and not exists (
       select 1 from unnest(p_keys) k
       where not exists (
         select 1 from app.tracking_parameters() t
         where t.parameter_key = k and t.cadence = 'checkin'
       )
     )
$$;

revoke all on function app.checkin_keys_valid(text[]) from public, anon, authenticated;

create table public.checkin_schedules (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  relationship_kind        text not null check (relationship_kind in ('treatment', 'training')),
  relationship_id          uuid not null,
  -- Die lebenden Verweise: Faellt das Verhaeltnis, faellt der Takt.
  patient_id               uuid references public.patients (id) on delete cascade,
  training_relationship_id uuid references public.training_relationships (id) on delete cascade,
  -- Alle N Tage (ANN-350).
  interval_days            smallint not null check (interval_days between 1 and 28),
  parameter_keys           text[] not null check (app.checkin_keys_valid(parameter_keys)),
  -- Von hier an ist der erste Check-in faellig.
  starts_on                date not null,
  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  updated_at               timestamptz not null default now(),
  updated_by               uuid not null,

  constraint checkin_schedules_one unique (relationship_kind, relationship_id),
  constraint checkin_schedules_relationship_matches check (
    (relationship_kind = 'treatment' and training_relationship_id is null
       and patient_id = relationship_id)
    or (relationship_kind = 'training' and patient_id is null
       and training_relationship_id = relationship_id)
  )
);

comment on table public.checkin_schedules is
  'TRK-002: Takt und Fragen des Check-ins eines Verhaeltnisses (IDEA-TRK-004, ANN-349, ANN-350). Datenklasse des Verhaeltnisses; faellt mit ihm. Geschrieben nur ueber set_checkin_schedule und end_checkin_schedule. Kein Tabellenrecht (ADR-004).';

create index checkin_schedules_training_idx on public.checkin_schedules (training_relationship_id)
  where training_relationship_id is not null;
create index checkin_schedules_patient_idx on public.checkin_schedules (patient_id)
  where patient_id is not null;

revoke all on public.checkin_schedules from public, anon, authenticated;
alter table public.checkin_schedules enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Der beantwortete Check-in und seine Angaben
-- -----------------------------------------------------------------------------
create table public.checkins (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  relationship_kind        text not null check (relationship_kind in ('treatment', 'training')),
  relationship_id          uuid not null,
  patient_id               uuid references public.patients (id) on delete cascade,
  training_relationship_id uuid references public.training_relationships (id) on delete cascade,
  -- Der Tag in der Zeitzone der Praxis. Hoechstens einer je Tag prueft die
  -- Plattformfunktion (TRK-003); ein Constraint stuende dem Zusammenfuehren
  -- zweier Akten im Weg.
  answered_on              date not null,
  recorded_at              timestamptz not null default now(),
  -- Wer erfasst hat, wie an der Einheit (UEB-010): Zugang ohne
  -- Fremdschluessel, weil er eine kuerzere Frist hat (ADR-023 Punkt 5).
  platform_access_id       uuid not null,
  platform_access_kind     text not null check (platform_access_kind in ('self', 'legal_representative')),
  recorded_by              uuid not null,

  constraint checkins_id_organization unique (id, organization_id),
  constraint checkins_relationship_matches check (
    (relationship_kind = 'treatment' and training_relationship_id is null
       and patient_id = relationship_id)
    or (relationship_kind = 'training' and patient_id is null
       and training_relationship_id = relationship_id)
  )
);

comment on table public.checkins is
  'TRK-002: ein beantworteter Check-in eines Verhaeltnisses, von der Person oder ihrer rechtlichen Vertretung (TRK-003). Datenklasse des Verhaeltnisses; faellt mit ihm. Kein Alarm, keine Bewertung (DSN-001 D5, ADR-006 Punkt 11). Kein Tabellenrecht (ADR-004).';

create index checkins_relationship_idx
  on public.checkins (relationship_kind, relationship_id, answered_on desc);
create index checkins_training_idx on public.checkins (training_relationship_id)
  where training_relationship_id is not null;
create index checkins_patient_idx on public.checkins (patient_id) where patient_id is not null;

revoke all on public.checkins from public, anon, authenticated;
alter table public.checkins enable row level security;

create table public.checkin_values (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  checkin_id      uuid not null,
  parameter_key   text not null,
  value           smallint not null,

  constraint checkin_values_one unique (checkin_id, parameter_key),
  constraint checkin_values_valid check (app.tracking_value_valid(parameter_key, 'checkin', value)),
  constraint checkin_values_checkin_fk
    foreign key (checkin_id, organization_id)
    references public.checkins (id, organization_id) on delete cascade
);

comment on table public.checkin_values is
  'TRK-002: die Angaben eines Check-ins, je Groesse eine Zeile, unveraendert (ANN-348). Faellt mit dem Check-in. Kein Tabellenrecht (ADR-004).';

revoke all on public.checkin_values from public, anon, authenticated;
alter table public.checkin_values enable row level security;

-- Zweite Grenze (ADR-004): Ohne Tabellenrecht liest niemand direkt; stuende
-- es eines Tages da, saehe jede Rolle nur ihren Bereich.
create policy checkin_schedules_select_scoped
  on public.checkin_schedules for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_exercise_plans(
          case relationship_kind when 'treatment' then 'therapy' else 'training' end)
  );

create policy checkins_select_scoped
  on public.checkins for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_exercise_plans(
          case relationship_kind when 'treatment' then 'therapy' else 'training' end)
  );

create policy checkin_values_select_scoped
  on public.checkin_values for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and exists (
      select 1 from public.checkins c
      where c.id = checkin_values.checkin_id
        and app.can_read_exercise_plans(
              case c.relationship_kind when 'treatment' then 'therapy' else 'training' end)
    )
  );

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('checkin_schedules', 'patientenakte', 'ueber_elterndatensatz',
   'Takt und Fragen des Check-ins einer Behandlung (TRK-002). Fallen mit der Akte (cascade).', 49),
  ('checkin_schedules', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Takt und Fragen des Check-ins im Training (TRK-002). Fallen mit dem Trainingsverhaeltnis (cascade).', 57),
  ('checkins', 'patientenakte', 'ueber_elterndatensatz',
   'Beantwortete Check-ins einer Behandlung (TRK-002), von der Person erfasst. Fallen mit der Akte (cascade).', 49),
  ('checkins', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Beantwortete Check-ins im Training (TRK-002), von der Person erfasst. Fallen mit dem Trainingsverhaeltnis (cascade).', 57),
  ('checkin_values', 'patientenakte', 'ueber_elterndatensatz',
   'Angaben eines Check-ins der Behandlung (TRK-002). Fallen mit dem Check-in.', 49),
  ('checkin_values', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Angaben eines Check-ins im Training (TRK-002). Fallen mit dem Check-in.', 57);

-- -----------------------------------------------------------------------------
-- 3. Faellig (ANN-350)
--
-- Der erste Check-in ist am Tag der Einstellung faellig, jeder weitere
-- interval_days nach dem letzten. Ein verpasster wird nicht nachgeholt und
-- nicht angemahnt (IDEA-TRK-004): Es gibt immer hoechstens einen faelligen.
-- -----------------------------------------------------------------------------
create function app.checkin_due_on(p_schedule public.checkin_schedules)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when l.zuletzt is null or l.zuletzt < p_schedule.starts_on then p_schedule.starts_on
    else l.zuletzt + p_schedule.interval_days
  end
  from (
    select max(c.answered_on) as zuletzt
    from public.checkins c
    where c.relationship_kind = p_schedule.relationship_kind
      and c.relationship_id = p_schedule.relationship_id
  ) l
$$;

revoke all on function app.checkin_due_on(public.checkin_schedules) from public, anon, authenticated;

comment on function app.checkin_due_on(public.checkin_schedules) is
  'TRK-002 (ANN-350): der Tag, ab dem der naechste Check-in faellig ist - der Tag der Einstellung, sonst interval_days nach dem letzten. Verpasstes wird nicht nachgeholt (IDEA-TRK-004).';

-- Das Verhaeltnis der Organisation - oder nichts. Bereich aus der Art.
create function app.checkin_relationship(p_kind text, p_relationship_id uuid, p_organization_id uuid)
returns table (area text, is_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select 'therapy', p.care_concluded_on is null
  from public.patients p
  where p_kind = 'treatment' and p.id = p_relationship_id and p.organization_id = p_organization_id
  union all
  select 'training', t.contract_ended_on is null
  from public.training_relationships t
  where p_kind = 'training' and t.id = p_relationship_id and t.organization_id = p_organization_id
$$;

revoke all on function app.checkin_relationship(text, uuid, uuid) from public, anon, authenticated;

-- Die Check-ins eines Verhaeltnisses fuer Praxis und Auskunft, juengste zuerst.
create function app.checkins_json(p_kind text, p_relationship_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'answered_on', c.answered_on,
    'recorded_at', c.recorded_at,
    'recorded_by_kind', c.platform_access_kind,
    'values', (select coalesce(jsonb_object_agg(v.parameter_key, v.value), '{}'::jsonb)
               from public.checkin_values v where v.checkin_id = c.id)
  ) order by c.answered_on desc, c.recorded_at desc), '[]'::jsonb)
  from public.checkins c
  where c.relationship_kind = p_kind and c.relationship_id = p_relationship_id
$$;

revoke all on function app.checkins_json(text, uuid) from public, anon, authenticated;

comment on function app.checkins_json(text, uuid) is
  'TRK-002: die Check-ins eines Verhaeltnisses - Tag, Zeitpunkt, wer erfasst hat (Person oder rechtliche Vertretung) und die Angaben unveraendert. Ohne Rechtepruefung: nur aus get_checkins und der Auskunft.';

-- -----------------------------------------------------------------------------
-- 4. Lesen: Takt und Angaben fuer die Praxis
-- -----------------------------------------------------------------------------
create function public.get_checkins(p_kind text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_area  text;
  v_takt  public.checkin_schedules%rowtype;
  v_offen boolean;
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
  else
    perform app.log_record_access(
      v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id,
      'user', jsonb_build_object('surface', 'web', 'view', 'checkins'));
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
    'checkins', app.checkins_json(p_kind, p_relationship_id)
  );
end;
$$;

revoke all on function public.get_checkins(text, uuid) from public, anon;
grant execute on function public.get_checkins(text, uuid) to authenticated;

comment on function public.get_checkins(text, uuid) is
  'TRK-002: Abschnitt "Zwischen den Terminen" (DSN-001 Abschnitt 6) - Takt, naechster Tag und die Check-ins mit ihren Angaben, unveraendert und ohne Bewertung (ADR-006 Punkt 11). Lesen wie die Uebungsplaene (ANN-351), protokolliert wie das Oeffnen von Akte bzw. Trainingsverhaeltnis. Ohne Recht null und eine Abweisung im Protokoll.';

-- -----------------------------------------------------------------------------
-- 5. Takt einstellen und beenden
-- -----------------------------------------------------------------------------
create function public.set_checkin_schedule(
  p_kind            text,
  p_relationship_id uuid,
  p_interval_days   integer,
  p_parameter_keys  text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_rel   record;
begin
  if v_actor is null
     or not (app.can_write_exercise_plans('therapy') or app.can_write_exercise_plans('training')) then
    raise exception 'not allowed to set checkin schedule' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.checkin_relationship(p_kind, p_relationship_id, v_org);
  if v_rel.area is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;
  if not app.can_write_exercise_plans(v_rel.area) then
    raise exception 'not allowed to set checkin schedule' using errcode = '42501';
  end if;
  if not v_rel.is_open then
    raise exception 'relationship has ended' using errcode = '22023';
  end if;
  if p_interval_days is null or p_interval_days not between 1 and 28 then
    raise exception 'interval out of range' using errcode = '22023';
  end if;
  if not coalesce(app.checkin_keys_valid(p_parameter_keys), false) then
    raise exception 'invalid checkin questions' using errcode = '22023';
  end if;

  insert into public.checkin_schedules (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    interval_days, parameter_keys, starts_on, created_by, updated_by
  )
  values (
    v_org, p_kind, p_relationship_id,
    case when p_kind = 'treatment' then p_relationship_id end,
    case when p_kind = 'training' then p_relationship_id end,
    p_interval_days, p_parameter_keys, app.training_today(v_org), v_actor, v_actor
  )
  -- Aendern laesst den Anfang stehen: Der naechste Check-in rechnet vom
  -- letzten (ANN-350).
  on conflict (relationship_kind, relationship_id) do update
     set interval_days = excluded.interval_days,
         parameter_keys = excluded.parameter_keys,
         updated_at = now(),
         updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_checkin_schedule(text, uuid, integer, text[]) from public, anon;
grant execute on function public.set_checkin_schedule(text, uuid, integer, text[]) to authenticated;

comment on function public.set_checkin_schedule(text, uuid, integer, text[]) is
  'TRK-002: stellt den Check-in eines offenen Verhaeltnisses ein oder aendert ihn - alle 1 bis 28 Tage (ANN-350), eine bis fuenf Fragen des Takts checkin (ANN-349). Wer: app.can_write_exercise_plans des Bereichs (ANN-351). Der Schreibvorgang steht am Datensatz (updated_by, ADR-010 Fassung 3).';

create function public.end_checkin_schedule(p_kind text, p_relationship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_rel   record;
begin
  if v_actor is null
     or not (app.can_write_exercise_plans('therapy') or app.can_write_exercise_plans('training')) then
    raise exception 'not allowed to end checkin schedule' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.checkin_relationship(p_kind, p_relationship_id, v_org);
  if v_rel.area is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;
  if not app.can_write_exercise_plans(v_rel.area) then
    raise exception 'not allowed to end checkin schedule' using errcode = '42501';
  end if;

  delete from public.checkin_schedules s
  where s.relationship_kind = p_kind and s.relationship_id = p_relationship_id;
end;
$$;

revoke all on function public.end_checkin_schedule(text, uuid) from public, anon;
grant execute on function public.end_checkin_schedule(text, uuid) to authenticated;

comment on function public.end_checkin_schedule(text, uuid) is
  'TRK-002: beendet den Check-in eines Verhaeltnisses; beantwortete Check-ins bleiben (ANN-350). Dieselben Rollen wie das Einstellen. Auch nach dem Ende des Verhaeltnisses moeglich.';

-- -----------------------------------------------------------------------------
-- 6. Auskunft nach Art. 15: Takt und Check-ins
--
-- Aus 20261103100000_bef_145_plattformzugang_in_der_auskunft.sql (juengste
-- Fassung); neu sind nur 'checkin_schedules' und 'checkins'. Signatur, Rechte
-- und Protokoll unveraendert. Die Angaben zur Einheit (TRK-001) stehen schon
-- ueber app.exercise_plan_sessions_json an jeder Einheit.
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
        -- UEB-011: die Uebungstage, die die Person an diesem Plan gewaehlt hat.
        'weekdays', (select to_jsonb(d.weekdays) from public.exercise_plan_days d
                     where d.plan_id = x.id),
        -- UEB-010: die durchgefuehrten Einheiten, ohne interne Kennung.
        'sessions', (
          select coalesce(jsonb_agg(z - 'id'), '[]'::jsonb)
          from jsonb_array_elements(app.exercise_plan_sessions_json(x.id)) z
        )
      ) order by x.created_at)
      from public.exercise_plans x
      where x.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KOM-004: die Rueckfragen ueber die Plattform mit allen Eintraegen
    -- (Art. 15), zugeordnete und nicht zugeordnete.
    'platform_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'topic', m.topic,
        'reference_label', m.reference_label,
        'status', m.status,
        'created_at', m.created_at,
        'closed_at', m.closed_at,
        'record_assigned_at', m.record_assigned_at,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'side', e.side,
            'author_kind', e.author_kind,
            'author_label', e.author_label,
            'body', e.body,
            'created_at', e.created_at
          ) order by e.created_at, e.id)
          from public.platform_message_entries e where e.message_id = m.id
        ), '[]'::jsonb)
      ) order by m.created_at)
      from public.platform_messages m
      where m.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- BEF-144: die Terminwuensche ueber die Plattform (POR-009) mit Tagen,
    -- Tageszeiten, Notiz, Zustand und Antwort der Praxis (Art. 15), offene wie
    -- beantwortete. Wer gewuenscht hat, steht wie in der Praxisliste (POR-011):
    -- die Person selbst oder die Vertretung mit Namen.
    'platform_appointment_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', w.kind,
        'appointment_id', w.appointment_id,
        'preferred_days', to_jsonb(w.preferred_days),
        'preferred_times', to_jsonb(w.preferred_times),
        'note', w.note,
        'status', w.status,
        'requested_by', z.access_kind,
        'representative_name', case when z.access_kind <> 'self' then z.representative_name end,
        'created_at', w.created_at,
        'resolved_at', w.resolved_at,
        'answer', w.answer,
        'resulting_appointment_id', w.resulting_appointment_id
      ) order by w.created_at, w.id)
      from public.platform_appointment_requests w
      join public.platform_accesses z on z.id = w.created_by_access_id
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- TRK-002: Takt und Fragen des Check-ins (Art. 15), ohne bearbeitendes
    -- Praxiskonto.
    'checkin_schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'interval_days', s.interval_days,
        'parameter_keys', to_jsonb(s.parameter_keys),
        'starts_on', s.starts_on,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ))
      from public.checkin_schedules s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- TRK-002: die beantworteten Check-ins mit ihren Angaben, unveraendert.
    'checkins', app.checkins_json('treatment', p_patient_id),

    -- BEF-145: die Zugaenge zur Plattform an dieser Akte (Art. 15) - der
    -- eigene und die einer Vertretung oder Begleitung, mit Zustand und
    -- Zeitpunkten, Grundlage, Umfang und Art der angesehenen Nachweise
    -- (ANN-342). Keine Kennung von Zugang, Konto, Verhaeltnis oder
    -- bearbeitendem Praxiskonto.
    'platform_accesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'access_kind', z.access_kind,
        'representative_name', z.representative_name,
        'legal_basis', z.legal_basis,
        'proof_documents', to_jsonb(z.proof_documents),
        'proof_recorded_at', z.proof_recorded_at,
        'health_scope', z.health_scope,
        'finance_scope', z.finance_scope,
        'consent_text_version', z.consent_text_version,
        'consent_recorded_at', z.consent_recorded_at,
        'consent_earlier_messages', z.consent_earlier_messages,
        'companion_declined_at', z.companion_declined_at,
        'companion_declined_reason', z.companion_declined_reason,
        'status', z.status,
        'created_at', z.created_at,
        'activated_at', z.activated_at,
        'locked_at', z.locked_at,
        'revoked_at', z.revoked_at,
        'revoked_reason', z.revoked_reason,
        'onboarding_finished_at', z.onboarding_finished_at,
        'onboarding_skipped_at', z.onboarding_skipped_at
      ) order by z.created_at, z.id)
      from public.platform_accesses z
      where z.patient_id = p_patient_id
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

-- -----------------------------------------------------------------------------
-- 7. Zusammenfuehren: Takt und Check-ins ziehen mit
--
-- Aus 20261030100000_bef_131_terminwuensche_beim_zusammenfuehren.sql
-- (juengste Fassung); neu ist nur der Block TRK-002.
-- -----------------------------------------------------------------------------
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
  -- KOM-004: Rueckfragen ueber die Plattform ziehen mit, zugeordnete wie
  -- nicht zugeordnete - sonst fielen sie mit der Dublette (cascade). Der
  -- Riegel an der Zuordnung laesst das Verhaeltnis nur hier wechseln.
  update public.platform_messages
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- BEF-131: Terminwuensche ueber die Plattform ziehen mit, offene wie
  -- beantwortete - sonst fielen sie mit der Dublette (cascade). Der
  -- Plattformzugang der Dublette bleibt als Nachweis (set null, BEF-132).
  update public.platform_appointment_requests
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- TRK-002: Check-ins ziehen mit, sonst fielen sie mit der Dublette
  -- (cascade). Den Takt behaelt die bleibende Akte; hat sie keinen, zieht
  -- der der Dublette mit (ANN-350).
  update public.checkins
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  if exists (select 1 from public.checkin_schedules s where s.patient_id = v_ziel.id) then
    delete from public.checkin_schedules where patient_id = v_quelle.id;
  else
    update public.checkin_schedules
       set patient_id = v_ziel.id, relationship_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;
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

-- -----------------------------------------------------------------------------
-- 8. Der Plan des Zusammenfuehrens zaehlt Check-ins und Takt (Zweitreview S1)
--
-- Aus 20261031100000_bef_132_plattformzugang_an_der_dublette.sql (juengste
-- Fassung); neu sind nur die Zaehler 'checkins' und 'checkin_schedules'. Sie
-- gehen ueber den Plan in Vorschau und Vermerk (patient_merge_records.counts).
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

  -- BEF-132: Ein Plattformzugang an der Dublette endete mit ihr, und die
  -- Person saehe die Antworten auf ihre Rueckfragen nicht mehr, die zur
  -- bleibenden Akte ziehen. Jeder Zugang, der nicht entzogen ist - auch eine
  -- offene Einladung oder ein gesperrter Zugang -, sperrt; die Praxis
  -- entzieht ihn vorher und laedt an der bleibenden Akte ein (ANN-149,
  -- ADR-023 Punkt 5: der Vorgang aendert keinen Zugang).
  if exists (
    select 1 from public.platform_accesses z
    where z.patient_id = p_source and z.status <> 'revoked'
  ) then
    v_sperren := v_sperren || 'source_has_platform_access'::text;
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
    -- BEF-132: ziehen seit KOM-004 und BEF-131 mit.
    'platform_messages',
      (select count(*) from public.platform_messages m where m.patient_id = p_source),
    'platform_appointment_requests',
      (select count(*) from public.platform_appointment_requests w where w.patient_id = p_source),
    -- TRK-002: Check-ins ziehen mit; den Takt der Dublette zaehlt der Plan,
    -- ob er mitzieht oder vor dem der bleibenden Akte weicht (ANN-350).
    'checkins',
      (select count(*) from public.checkins c where c.patient_id = p_source),
    'checkin_schedules',
      (select count(*) from public.checkin_schedules s where s.patient_id = p_source),
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
