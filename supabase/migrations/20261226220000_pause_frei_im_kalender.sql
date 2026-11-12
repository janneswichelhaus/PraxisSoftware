-- ANN-863: Die Pause des Wochenplans liegt nicht mehr fest. Ihre Dauer bleibt im Plan,
-- ihre Lage an einem Tag steht hier; Soll, Konto und Urlaub rechnen weiter mit dem Plan.

create table public.staff_break_placements (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete restrict,
  on_date         date not null,
  plan_starts_at  time not null,
  starts_at       time not null,
  ends_at         time not null,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  constraint staff_break_placements_time_order check (ends_at > starts_at),
  constraint staff_break_placements_moved check (starts_at <> plan_starts_at),
  constraint staff_break_placements_whole_minutes check (
    date_part('second', plan_starts_at) = 0 and date_part('second', starts_at) = 0
    and date_part('second', ends_at) = 0),
  constraint staff_break_placements_one unique (staff_member_id, on_date, plan_starts_at)
);

comment on table public.staff_break_placements is
  'ANN-863: Lage einer Pause des Wochenplans an einem Tag, wenn sie von der Lage im Plan abweicht. Die Pause ist eine Luecke von 15 bis 60 Minuten zwischen zwei Bloecken; Dauer und Soll bleiben beim Plan. Passt die Zeile nicht mehr zum Plan des Tages, gilt sie nicht. Datenklasse: organisatorische Personaldaten. Kein Tabellenrecht zum Schreiben.';
comment on column public.staff_break_placements.plan_starts_at is
  'Beginn der Luecke im Plan des Tages - so findet die Zeile ihre Pause wieder.';

create index staff_break_placements_lookup_idx
  on public.staff_break_placements (organization_id, staff_member_id, on_date);

alter table public.staff_break_placements enable row level security;
revoke all on table public.staff_break_placements from public, anon, authenticated, service_role;
create policy staff_break_placements_select_staff_only on public.staff_break_placements
  for select to authenticated
  using (organization_id = app.current_organization_id() and app.is_staff());
grant select (id, organization_id, staff_member_id, on_date, plan_starts_at, starts_at, ends_at)
  on table public.staff_break_placements to authenticated;

insert into public.data_registry (
  table_name, subject_kind, export_mode, export_patient, export_training, export_parent,
  journal_mode, journal_key, journal_class, journal_class_training, journal_daily, journal_rank,
  merge_mode, decision_note
) values
  ('staff_break_placements', 'staff', 'manual', '{}', '{}', null, 'none', 'id', null, null, false,
   null, 'not_applicable',
   'Beschäftigtendaten: keine Auskunftsfunktion in der Anwendung (ANN-750). Zurück auf die Lage im Plan löscht die Zeile; sonst Frist der Beschäftigtendaten offen (ANN-030).');

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_break_placements', 'beschaeftigtendaten', 'keine',
   'Lage der Pause an einem Tag (ANN-863). Frist offen wie die Abweichungen vom Wochenplan (ANN-030).', 268);

-- Der Plan des Tages ohne verschobene Pausen: der bisherige Inhalt von app.working_ranges.
create function app.planned_working_ranges(p_staff_member_id uuid, p_organization_id uuid, p_date date)
returns app.timemultirange
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_abweichungen integer;
  v_abwesend     boolean;
  v_bereiche     app.timemultirange;
begin
  select count(*), bool_or(a.kind = 'unavailable')
    into v_abweichungen, v_abwesend
  from public.staff_working_hour_exceptions a
  where a.staff_member_id = p_staff_member_id
    and a.organization_id = p_organization_id
    and a.on_date = p_date;

  if v_abweichungen > 0 then
    if v_abwesend then
      return null;
    end if;
    select range_agg(app.timerange(a.starts_at, a.ends_at, '[)'))
      into v_bereiche
    from public.staff_working_hour_exceptions a
    where a.staff_member_id = p_staff_member_id
      and a.organization_id = p_organization_id
      and a.on_date = p_date
      and a.kind = 'block';
  else
    select range_agg(app.timerange(h.starts_at, h.ends_at, '[)'))
      into v_bereiche
    from public.staff_working_hours h
    where h.staff_member_id = p_staff_member_id
      and h.organization_id = p_organization_id
      and h.weekday = extract(isodow from p_date)
      and daterange(h.valid_from, h.valid_until, '[]') @> p_date;
  end if;

  return v_bereiche;
end;
$$;

comment on function app.planned_working_ranges(uuid, uuid, date) is
  'Arbeitszeit einer Person an einem Tag laut Plan oder Abweichung, ohne verschobene Pausen (ANN-863). Null ohne Arbeitszeit oder bei Abwesenheit.';
revoke all on function app.planned_working_ranges(uuid, uuid, date)
  from public, anon, authenticated, service_role;

-- Pausen sind die Luecken von 15 bis 60 Minuten; eine laengere Luecke ist ein geteilter Dienst.
create function app.break_gaps(p_bereiche app.timemultirange)
returns table (von time, bis time)
language sql immutable
set search_path to ''
as $$
  select l.bis_vorher, lower(l.r)
  from (
    select r, lag(upper(r)) over (order by lower(r)) as bis_vorher
    from unnest(p_bereiche) as r
  ) l
  where l.bis_vorher is not null
    and lower(l.r) - l.bis_vorher between interval '15 minutes' and interval '60 minutes'
  order by 1
$$;

comment on function app.break_gaps(app.timemultirange) is
  'Die verschiebbaren Pausen eines Tages: Luecken von 15 bis 60 Minuten zwischen zwei Bloecken (ANN-863).';
revoke all on function app.break_gaps(app.timemultirange)
  from public, anon, authenticated, service_role;

create or replace function app.working_ranges(p_staff_member_id uuid, p_organization_id uuid, p_date date)
returns app.timemultirange
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_bereiche app.timemultirange := app.planned_working_ranges(p_staff_member_id, p_organization_id, p_date);
  v_luecke   app.timerange;
  v_lage     app.timerange;
  g          record;
begin
  if v_bereiche is null then
    return null;
  end if;
  -- Nur eine Zeile, die zur Luecke des Tages passt und ganz in der Arbeitszeit liegt, verschiebt.
  for g in
    select l.von, l.bis, p.starts_at, p.ends_at
    from app.break_gaps(v_bereiche) l
    join public.staff_break_placements p
      on p.staff_member_id = p_staff_member_id
     and p.organization_id = p_organization_id
     and p.on_date = p_date
     and p.plan_starts_at = l.von
     and p.ends_at - p.starts_at = l.bis - l.von
  loop
    v_luecke := app.timerange(g.von, g.bis, '[)');
    v_lage := app.timerange(g.starts_at, g.ends_at, '[)');
    if (v_bereiche + app.timemultirange(v_luecke)) @> v_lage then
      v_bereiche := (v_bereiche + app.timemultirange(v_luecke)) - app.timemultirange(v_lage);
    end if;
  end loop;
  return v_bereiche;
end;
$$;

comment on function app.working_ranges(uuid, uuid, date) is
  'Arbeitszeit einer Person an einem Tag als Zeitraeume (PRX-003) mit der Fassung des Tages (AZ-001); eine verschobene Pause liegt an ihrer Lage des Tages (ANN-863). Null ohne Arbeitszeit oder bei Abwesenheit.';

create or replace function app.is_within_working_hours(
  p_staff_member_id uuid, p_organization_id uuid, p_date date, p_start time, p_end time)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select coalesce(
    app.working_ranges(p_staff_member_id, p_organization_id, p_date)
      @> app.timerange(p_start, p_end, '[)'),
    false)
$$;

comment on function app.is_within_working_hours(uuid, uuid, date, time, time) is
  'Prueft, ob ein Zeitraum vollstaendig durch die Arbeitszeit der Person gedeckt ist - dieselbe Regel wie app.working_ranges, also mit der Pause an ihrer Lage des Tages (ANN-863). Ohne hinterlegte Arbeitszeit false (CAL-005).';

create function app.ranges_as_blocks(p_bereiche app.timemultirange)
returns jsonb
language sql immutable
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('von', lower(r)::text, 'bis', upper(r)::text)
                            order by lower(r)), '[]'::jsonb)
  from unnest(p_bereiche) as r
$$;

revoke all on function app.ranges_as_blocks(app.timemultirange)
  from public, anon, authenticated, service_role;

create function public.set_break_placement(
  p_staff_member_id uuid, p_date date, p_plan_starts_at time, p_starts_at time,
  p_confirmed boolean default false)
returns text
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_org    uuid := app.current_organization_id();
  v_tz     text;
  v_plan   app.timemultirange;
  v_luecke app.timerange;
  v_lage   app.timerange;
  v_tag    app.timemultirange;
  v_dauer  integer;
  v_beginn integer;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_org is null or not (
    app.can_manage_working_hours()
    or (app.can_update_appointment() and p_staff_member_id = app.own_staff_member(v_org))
  ) then
    raise exception 'not allowed to move breaks' using errcode = '42501';
  end if;
  if p_date is null or p_plan_starts_at is null or p_starts_at is null then
    raise exception 'date and times are required' using errcode = '22023';
  end if;
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;
  if date_part('second', p_starts_at) <> 0 then
    raise exception 'break must start on a whole minute' using errcode = '22023';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;

  -- Dieselbe Sperre wie Urlaub und Abweichungen: eine Lage je Person und Augenblick.
  perform 1 from public.staff_members sm where sm.id = p_staff_member_id for no key update;

  v_plan := app.planned_working_ranges(p_staff_member_id, v_org, p_date);
  select app.timerange(l.von, l.bis, '[)') into v_luecke
  from app.break_gaps(v_plan) l
  where l.von = p_plan_starts_at;
  if v_luecke is null then
    raise exception 'no movable break at this time' using errcode = '22023';
  end if;

  if p_starts_at = p_plan_starts_at then
    delete from public.staff_break_placements
     where staff_member_id = p_staff_member_id and organization_id = v_org
       and on_date = p_date and plan_starts_at = p_plan_starts_at;
    return 'plan';
  end if;

  v_dauer := (extract(epoch from (upper(v_luecke) - lower(v_luecke))) / 60)::integer;
  v_beginn := (extract(epoch from p_starts_at) / 60)::integer;
  if v_beginn + v_dauer >= 24 * 60 then
    raise exception 'break outside working time' using errcode = '22023';
  end if;
  v_lage := app.timerange(p_starts_at, p_starts_at + make_interval(mins => v_dauer), '[)');
  v_tag := v_plan + app.timemultirange(v_luecke);
  if not v_tag @> v_lage then
    raise exception 'break outside working time' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.status <> 'cancelled'
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(
            (p_date + lower(v_lage)) at time zone v_tz,
            (p_date + lower(v_lage) + make_interval(mins => v_dauer)) at time zone v_tz, '[)')
  ) then
    raise exception 'break overlaps appointment' using errcode = '23P01';
  end if;

  -- Par. 4 ArbZG: Rueckfrage, wenn erst die neue Lage mehr als 6 Stunden am Stueck ergibt.
  if not coalesce(p_confirmed, false)
     and 'more_than_six_hours_in_a_row' = any (
           app.working_day_problems(app.ranges_as_blocks(v_tag - app.timemultirange(v_lage))))
     and not 'more_than_six_hours_in_a_row' = any (
           app.working_day_problems(app.ranges_as_blocks(v_plan))) then
    raise exception 'more_than_six_hours_in_a_row' using errcode = '22023';
  end if;

  insert into public.staff_break_placements (
    organization_id, staff_member_id, on_date, plan_starts_at, starts_at, ends_at,
    created_by, updated_by)
  values (v_org, p_staff_member_id, p_date, p_plan_starts_at, lower(v_lage),
          p_starts_at + make_interval(mins => v_dauer), v_actor, v_actor)
  on conflict (staff_member_id, on_date, plan_starts_at) do update
    set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        updated_at = now(), updated_by = v_actor;
  return 'moved';
end;
$$;

comment on function public.set_break_placement(uuid, date, time, time, boolean) is
  'ANN-863: legt die Pause eines Tages an eine andere Stelle der Arbeitszeit oder zurueck auf den Plan. Die eigene Pause verschiebt, wer Termine aendert; fremde, wer Arbeitszeiten pflegt. Nicht ueber einen Termin; mehr als 6 Stunden am Stueck nur mit p_confirmed. Gibt moved oder plan zurueck.';
revoke all on function public.set_break_placement(uuid, date, time, time, boolean) from public, anon;
grant execute on function public.set_break_placement(uuid, date, time, time, boolean) to authenticated;
