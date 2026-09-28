-- =============================================================================
-- Automatische Terminsuche als Vorschlagsliste (PRX-EPIC-001, Story PRX-003)
--
-- "Naechster freier Termin fuer diese Person": Die Datenbank zaehlt freie
-- Plaetze auf - aus Arbeitszeit, Abweichungen, bestehenden Terminen der
-- Therapeut:innen UND der Patient:in, Raster und Dauer, auf Wunsch nur in den
-- Wunschzeiten. Sie schlaegt vor; einen Termin macht erst das Speichern im
-- Terminformular, und create_appointment prueft dort alles noch einmal. Nichts
-- wird verschoben, nichts reserviert (PROJECT_PRINCIPLES.md §8).
--
--   * DETERMINISTISCH (§6.2). Kandidaten beginnen am ersten Rasterpunkt einer
--     freien Luecke und folgen dicht aufeinander (Beginn + Dauer); eine
--     Punktzahl gibt es nicht. Reihenfolge: im Gebietstag vor den uebrigen
--     (PRX-002, nur beim Hausbesuch), dann Tag, Beginn, Name.
--   * FAHRZEIT (§8 harte Constraint, E12, ANN-097, ANN-136). Die Datenbank
--     kann den Kartendienst nicht fragen (ANN-017). Sie liefert deshalb je
--     Vorschlag die Nachbartermine derselben Person am selben Tag und deren
--     Koordinaten; der Browser holt die Fahrzeiten mit EINER Matrix beim
--     eigenen Dienst und gibt sie an rate_slot_travel zurueck. Dort - und
--     nur dort - gilt die Rundungsregel aus §8.1 (app.earliest_follow_up_start).
--     Ein knapper Weg wird gekennzeichnet und nach hinten gestellt, nicht
--     verworfen; eine pauschale Fahrzeit gibt es nicht (E12 Punkt 3/4).
--   * WER: die Rollen der Terminverwaltung; ein abgewiesener Aufruf bleibt
--     als appointments.read nachweisbar (G6b). Kein Leseprotokoll je Aufruf -
--     die Suche zeigt Belegung wie der Kalender.
--   * NICHTS WIRD GESPEICHERT. Keine Tabelle, keine Frist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Arbeitszeit eines Tages als Menge von Zeitraeumen
--
-- Dieselbe Regel wie app.is_within_working_hours (CAL-005): Eine datumsbezogene
-- Abweichung ersetzt den Wochenplan, 'unavailable' heisst nichts. Ohne
-- hinterlegte Arbeitszeit null.
-- -----------------------------------------------------------------------------
create function app.working_ranges(
  p_staff_member_id uuid,
  p_organization_id uuid,
  p_date            date
)
returns app.timemultirange
language plpgsql
stable
security definer
set search_path = ''
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
      and h.weekday = extract(isodow from p_date);
  end if;

  return v_bereiche;
end;
$$;

comment on function app.working_ranges(uuid, uuid, date) is
  'Arbeitszeit einer Person an einem Tag als Zeitraeume (PRX-003); dieselbe Regel wie app.is_within_working_hours. Null ohne Arbeitszeit oder bei Abwesenheit.';
revoke all on function app.working_ranges(uuid, uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- find_free_slots
-- -----------------------------------------------------------------------------
create function public.find_free_slots(
  p_patient_id        uuid,
  p_staff_member_id   uuid,
  p_appointment_type  text,
  p_duration_minutes  integer,
  p_from              date,
  p_to                date,
  p_windows           jsonb default '[]'::jsonb,
  p_limit             integer default 20
)
returns table (
  staff_member_id      uuid,
  staff_name           text,
  slot_date            date,
  start_time           time,
  end_time             time,
  territory_status     text,
  prev_appointment_id  uuid,
  prev_lat             double precision,
  prev_lon             double precision,
  next_appointment_id  uuid,
  next_lat             double precision,
  next_lon             double precision,
  target_lat           double precision,
  target_lon           double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_tz       text;
  v_grid     integer;
  v_heute    date;
  v_jetzt    integer;
  v_von      date;
  v_plz      text;
  v_lat      double precision;
  v_lon      double precision;
  v_fenster  jsonb := coalesce(p_windows, '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;
  if p_staff_member_id is not null and not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;
  if p_appointment_type is null or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'invalid appointment type' using errcode = '22023';
  end if;
  if not app.waitlist_windows_valid(v_fenster) then
    raise exception 'invalid time windows' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'limit must be between 1 and 50' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes into v_tz, v_grid
  from public.organizations o where o.id = v_org;

  if p_duration_minutes is null or p_duration_minutes > 240
     or not app.is_valid_treatment_length(make_interval(mins => p_duration_minutes), v_grid) then
    raise exception 'invalid duration' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  v_jetzt := extract(hour from (now() at time zone v_tz))::integer * 60
             + extract(minute from (now() at time zone v_tz))::integer;
  v_von := greatest(p_from, v_heute);
  if p_from is null or p_to is null or p_to < v_von or p_to - v_von > 41 then
    raise exception 'date range must lie ahead and span at most 42 days' using errcode = '22023';
  end if;

  if p_appointment_type = 'home_visit' then
    select cd.postal_code, cd.lat, cd.lon into v_plz, v_lat, v_lon
    from public.patient_contact_details cd
    where cd.patient_id = p_patient_id;
  end if;

  return query
  with tage as (
    select d::date as tag
    from generate_series(v_von::timestamp, p_to::timestamp, interval '1 day') d
  ),
  personen as (
    select sm.id,
           nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), '') as name
    from public.staff_members sm
    join public.persons pe on pe.id = sm.person_id
    where sm.organization_id = v_org
      and (p_staff_member_id is null or sm.id = p_staff_member_id)
      and app.is_assignable_therapist(sm.id, v_org)
  ),
  arbeit as (
    select p.id as staff, p.name, t.tag, app.working_ranges(p.id, v_org, t.tag) as bereiche
    from personen p cross join tage t
  ),
  -- Belegt ist, was die Person ODER die Patient:in an diesem Tag schon hat
  -- (§8: Patienten- und Therapeutenverfuegbarkeit sind harte Constraints).
  belegt as (
    select a.staff, a.tag,
           range_agg(app.timerange(
             greatest(t.starts_at at time zone v_tz, a.tag::timestamp)::time,
             case when t.ends_at at time zone v_tz >= (a.tag + 1)::timestamp
                  then time '24:00'
                  else (t.ends_at at time zone v_tz)::time end,
             '[)'
           )) as zeiten
    from arbeit a
    join public.appointments t
      on t.organization_id = v_org
     and t.status <> 'cancelled'
     and (t.staff_member_id = a.staff or t.patient_id = p_patient_id)
     and t.starts_at < ((a.tag + 1)::timestamp at time zone v_tz)
     and t.ends_at > (a.tag::timestamp at time zone v_tz)
    where a.bereiche is not null
    group by a.staff, a.tag
  ),
  -- Wunschzeiten als Zeitraeume je Tag; ohne Wunschzeiten der ganze Tag.
  -- Geschnitten wird VOR dem Packen, damit ein Vorschlag am Beginn des
  -- Wunschfensters beginnt und nicht an einem Raster, das die Luecke vorgibt.
  wunsch as (
    select t.tag,
           case when jsonb_array_length(v_fenster) = 0
                then app.timemultirange(app.timerange(time '00:00', time '24:00', '[)'))
                else (
                  select range_agg(app.timerange((w ->> 'from')::time, (w ->> 'to')::time, '[)'))
                  from jsonb_array_elements(v_fenster) w
                  where (w ->> 'weekday')::int = extract(isodow from t.tag)::int
                ) end as zeiten
    from tage t
  ),
  frei as (
    select a.staff, a.name, a.tag,
           unnest((a.bereiche - coalesce(b.zeiten, '{}'::app.timemultirange)) * w.zeiten) as r
    from arbeit a
    join wunsch w on w.tag = a.tag
    left join belegt b on b.staff = a.staff and b.tag = a.tag
    where a.bereiche is not null
      and w.zeiten is not null
  ),
  grenzen as (
    select f.staff, f.name, f.tag,
           (extract(epoch from lower(f.r)) / 60)::integer as von_min,
           (extract(epoch from upper(f.r)) / 60)::integer as bis_min
    from frei f
  ),
  kandidaten as (
    select g.staff, g.name, g.tag, k.beginn
    from grenzen g,
         generate_series(
           (ceil(greatest(
              g.von_min,
              case when g.tag = v_heute then v_jetzt + 1 else 0 end
            )::numeric / v_grid) * v_grid)::integer,
           g.bis_min - p_duration_minutes,
           p_duration_minutes
         ) as k(beginn)
  ),
  passend as (
    select k.*,
           make_time(k.beginn / 60, k.beginn % 60, 0) as zeit_von,
           make_time((k.beginn + p_duration_minutes) / 60 % 24, (k.beginn + p_duration_minutes) % 60, 0) as zeit_bis
    from kandidaten k
    where k.beginn + p_duration_minutes <= 24 * 60 - 1
  ),
  bewertet as (
    select p.*,
           case when p_appointment_type = 'home_visit'
                then app.territory_day_status(v_org, v_plz, p.tag, p.zeit_von)
                else 'none' end as gebiet,
           ((p.tag + p.zeit_von)::timestamp at time zone v_tz) as ab,
           ((p.tag + p.zeit_von)::timestamp at time zone v_tz) + make_interval(mins => p_duration_minutes) as bis
    from passend p
  ),
  auswahl as (
    select b.*
    from bewertet b
    order by (b.gebiet = 'match') desc, (b.gebiet = 'outside') asc, b.tag, b.beginn, b.name
    limit p_limit
  )
  select a.staff,
         a.name,
         a.tag,
         a.zeit_von,
         a.zeit_bis,
         a.gebiet,
         vor.id, vor.visit_lat, vor.visit_lon,
         nach.id, nach.visit_lat, nach.visit_lon,
         v_lat, v_lon
  from auswahl a
  left join lateral (
    select t.id, t.visit_lat, t.visit_lon
    from public.appointments t
    where t.organization_id = v_org
      and t.staff_member_id = a.staff
      and t.status <> 'cancelled'
      and t.ends_at <= a.ab
      and t.ends_at > (a.tag::timestamp at time zone v_tz)
    order by t.ends_at desc
    limit 1
  ) vor on p_appointment_type = 'home_visit'
  left join lateral (
    select t.id, t.visit_lat, t.visit_lon
    from public.appointments t
    where t.organization_id = v_org
      and t.staff_member_id = a.staff
      and t.status <> 'cancelled'
      and t.starts_at >= a.bis
      and t.starts_at < ((a.tag + 1)::timestamp at time zone v_tz)
    order by t.starts_at
    limit 1
  ) nach on p_appointment_type = 'home_visit'
  order by (a.gebiet = 'match') desc, (a.gebiet = 'outside') asc, a.tag, a.beginn, a.name;
end;
$$;

comment on function public.find_free_slots(uuid, uuid, text, integer, date, date, jsonb, integer) is
  'Terminsuche als Vorschlagsliste (PRX-003): freie Plaetze aus Arbeitszeit, Belegung der Therapeut:innen und der Patient:in, Raster, Dauer und Wunschzeiten; hoechstens 42 Tage und 50 Vorschlaege. Gebietstag zuerst (PRX-002). Beim Hausbesuch mit Nachbarterminen fuer die Fahrzeitpruefung (rate_slot_travel, ANN-136). Reserviert nichts.';
revoke all on function public.find_free_slots(uuid, uuid, text, integer, date, date, jsonb, integer) from public, anon;
grant execute on function public.find_free_slots(uuid, uuid, text, integer, date, date, jsonb, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- rate_slot_travel - Fahrzeit der Vorschlaege mit der Rundungsregel aus §8.1
--
-- p_items: [{index, staff_member_id, date, start, end,
--            prev_appointment_id?, travel_to_seconds?,
--            next_appointment_id?, travel_from_seconds?}]
-- Der Vorgaenger muss mit Ende plus Fahrzeit (aufgerundet aufs Raster) vor
-- dem Beginn liegen, der Vorschlag ebenso vor dem Nachfolger. Fehlt eine
-- noetige Fahrzeit, heisst das 'unknown' - nie 'ok'.
-- -----------------------------------------------------------------------------
create function public.rate_slot_travel(p_items jsonb)
returns table (
  item_index        integer,
  status            text,
  shortfall_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_grid    integer;
  v_item    jsonb;
  v_ab      timestamptz;
  v_bis     timestamptz;
  v_vor     public.appointments;
  v_nach    public.appointments;
  v_fehlt   integer;
  v_knapp   boolean;
  v_unklar  boolean;
  v_frueh   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 25 then
    raise exception 'items must be an array of at most 25 entries' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes into v_tz, v_grid
  from public.organizations o where o.id = v_org;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      item_index := (v_item ->> 'index')::integer;
      v_ab  := ((v_item ->> 'date')::date + (v_item ->> 'start')::time)::timestamp at time zone v_tz;
      v_bis := ((v_item ->> 'date')::date + (v_item ->> 'end')::time)::timestamp at time zone v_tz;
    exception
      when others then
        raise exception 'invalid item' using errcode = '22023';
    end;
    if item_index is null then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    foreach v_fehlt in array array[
      nullif(v_item ->> 'travel_to_seconds', '')::numeric::integer,
      nullif(v_item ->> 'travel_from_seconds', '')::numeric::integer
    ] loop
      if v_fehlt is not null and v_fehlt not between 0 and 86400 then
        raise exception 'invalid travel time' using errcode = '22023';
      end if;
    end loop;

    v_knapp := false;
    v_unklar := false;
    shortfall_minutes := 0;

    v_vor := null;
    if v_item ? 'prev_appointment_id' and v_item ->> 'prev_appointment_id' is not null then
      select * into v_vor from public.appointments a
      where a.id = (v_item ->> 'prev_appointment_id')::uuid and a.organization_id = v_org;
      if v_vor.id is null then
        raise exception 'appointment not found' using errcode = 'P0002';
      end if;
      if v_item ->> 'travel_to_seconds' is null then
        v_unklar := true;
      else
        v_frueh := app.earliest_follow_up_start(
          v_vor.ends_at, (v_item ->> 'travel_to_seconds')::numeric::integer, v_grid, v_tz
        );
        if v_frueh > v_ab then
          v_knapp := true;
          shortfall_minutes := greatest(
            shortfall_minutes, ceil(extract(epoch from (v_frueh - v_ab)) / 60)::integer
          );
        end if;
      end if;
    end if;

    v_nach := null;
    if v_item ? 'next_appointment_id' and v_item ->> 'next_appointment_id' is not null then
      select * into v_nach from public.appointments a
      where a.id = (v_item ->> 'next_appointment_id')::uuid and a.organization_id = v_org;
      if v_nach.id is null then
        raise exception 'appointment not found' using errcode = 'P0002';
      end if;
      if v_item ->> 'travel_from_seconds' is null then
        v_unklar := true;
      else
        v_frueh := app.earliest_follow_up_start(
          v_bis, (v_item ->> 'travel_from_seconds')::numeric::integer, v_grid, v_tz
        );
        if v_frueh > v_nach.starts_at then
          v_knapp := true;
          shortfall_minutes := greatest(
            shortfall_minutes, ceil(extract(epoch from (v_frueh - v_nach.starts_at)) / 60)::integer
          );
        end if;
      end if;
    end if;

    status := case when v_knapp then 'tight' when v_unklar then 'unknown' else 'ok' end;
    return next;
  end loop;
end;
$$;

comment on function public.rate_slot_travel(jsonb) is
  'Fahrzeit der Vorschlaege aus find_free_slots (PRX-003, ANN-136): ok, tight (mit fehlenden Minuten) oder unknown. Die Fahrzeiten kommen live aus dem eigenen Kartendienst und werden nicht gespeichert (ANN-097); gerundet wird hier mit app.earliest_follow_up_start (§8.1). Warnung, keine Sperre.';
revoke all on function public.rate_slot_travel(jsonb) from public, anon;
grant execute on function public.rate_slot_travel(jsonb) to authenticated;
