-- ANN-865: „Nächsten passenden Termin buchen“ für Hausbesuche. Die Datenbank bestimmt Kandidaten und
-- Nachbarn selbst und prüft die Wege unter Sperre; die Fahrzeiten je Weg reicht die Serverfunktion
-- auto-booking aus dem Kartendienst herein (ADR-019 Punkt 15), gespeichert wird keine (Punkt 16).

create or replace function public.create_appointment(p_patient_id uuid, p_staff_member_id uuid, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false, p_treatment_basis_id uuid DEFAULT NULL::uuid, p_confirmed_past boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_location_id    uuid;
  v_appointment_id uuid;
  v_grid           smallint;
  v_ausserhalb     boolean;
  v_verordnung     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  -- ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt; ohne Bestätigung fragt die
  -- Oberfläche nach und schickt den Vorgang bestätigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- ANN-056: Die Länge ist frei, liegt aber im Raster; mit dem Beginn im Raster liegt so auch das
  -- Ende auf einem Rasterpunkt.
  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  -- ANN-510: Jede Akte der Organisation ist planbar; geprüft wird nur, dass es sie gibt.
  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Die Grundlage muss zur Organisation UND zu derselben Patient:in gehoeren.
  -- Eine fremde und eine unbekannte ID erzeugen dieselbe Meldung und taugen
  -- damit nicht als Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  if p_treatment_basis_id is not null then
    select p.id into v_verordnung
    from public.treatment_bases p
    where p.id = p_treatment_basis_id
      and p.organization_id = v_org
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'treatment basis not found' using errcode = 'P0002';
    end if;
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  -- ANN-865: dieselbe Sperre wie set_break_placement und die automatische Buchung, damit Pause,
  -- Arbeitszeit und Termin nacheinander geprüft werden.
  perform 1 from public.staff_members sm where sm.id = p_staff_member_id for no key update;

  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    select
      nullif(btrim(c.street), ''),
      nullif(btrim(c.house_number), ''),
      nullif(btrim(c.postal_code), ''),
      nullif(btrim(c.city), '')
      into v_street, v_house, v_postal, v_city
    from public.patient_contact_details c
    where c.patient_id = p_patient_id;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete patient address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, patient_id, staff_member_id, location_id,
      appointment_type, kind, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      treatment_basis_id, created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'therapy', 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_verordnung, v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;


  return v_appointment_id;
end;
$$;

comment on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) is
  'Legt einen Behandlungstermin im Zustand confirmed an. Die Laenge ist frei im Praxisraster (CAL-020); geprueft werden Raster des Beginns, Arbeitszeit und Belegung (CAL-003, CAL-005, CAL-007, ADR-018). Ein Tag in der Vergangenheit verlangt p_confirmed_past (ANN-057). Nimmt vor der Pruefung die Sperre der behandelnden Person (ANN-865).';

-- So viele Tage (je Gebietsklasse) prüft ein Aufruf; die Serverfunktion blättert weiter.
create function app.auto_booking_page_size()
returns integer
language sql immutable
set search_path to ''
as $$ select 7 $$;

revoke all on function app.auto_booking_page_size() from public, anon, authenticated, service_role;

-- So viele Wege nennt die Planung höchstens und nimmt die Buchung höchstens an.
create function app.auto_booking_max_legs()
returns integer
language sql immutable
set search_path to ''
as $$ select 1000 $$;

revoke all on function app.auto_booking_max_legs() from public, anon, authenticated, service_role;

-- Ein Weg ist nur ein Koordinatenpaar: Wer der Nachbar ist, bestimmt die Buchung selbst.
create function app.auto_booking_leg_key(
  p_from_lat double precision, p_from_lon double precision,
  p_to_lat double precision, p_to_lon double precision)
returns text
language sql immutable
set search_path to ''
as $$
  select md5(p_from_lat::text || '|' || p_from_lon::text || '|' || p_to_lat::text || '|' || p_to_lon::text)
$$;

revoke all on function app.auto_booking_leg_key(double precision, double precision, double precision, double precision)
  from public, anon, authenticated, service_role;

create function app.auto_booking_leg_seconds(
  p_legs jsonb, p_from_lat double precision, p_from_lon double precision,
  p_to_lat double precision, p_to_lon double precision)
returns integer
language sql immutable
set search_path to ''
as $$
  select case
    when p_from_lat = p_to_lat and p_from_lon = p_to_lon then 0
    else (
      select (l ->> 'seconds')::numeric::integer
      from jsonb_array_elements(p_legs) l
      where l ->> 'key' = app.auto_booking_leg_key(p_from_lat, p_from_lon, p_to_lat, p_to_lon)
        and jsonb_typeof(l -> 'seconds') = 'number'
      limit 1)
  end
$$;

comment on function app.auto_booking_leg_seconds(jsonb, double precision, double precision, double precision, double precision) is
  'ANN-865: Fahrzeit eines Wegs aus den hereingereichten Wegen; derselbe Ort ist 0, ein fehlender oder leerer Wert null (nicht geprueft, nie passend).';
revoke all on function app.auto_booking_leg_seconds(jsonb, double precision, double precision, double precision, double precision)
  from public, anon, authenticated, service_role;

create function app.auto_booking_free_seconds(
  p_arbeit app.timemultirange, p_belegt app.timemultirange, p_von time, p_bis time)
returns integer
language sql immutable
set search_path to ''
as $$
  select coalesce(sum(extract(epoch from (upper(r) - lower(r)))), 0)::integer
  from unnest(
    (coalesce(p_arbeit, '{}'::app.timemultirange) * app.timemultirange(app.timerange(p_von, p_bis, '[)')))
    - coalesce(p_belegt, '{}'::app.timemultirange)) r
$$;

comment on function app.auto_booking_free_seconds(app.timemultirange, app.timemultirange, time, time) is
  'ANN-865: Sekunden zwischen zwei Uhrzeiten, die Arbeitszeit sind und frei von Terminen - nur in ihnen wird gefahren, nie in der Pause.';
revoke all on function app.auto_booking_free_seconds(app.timemultirange, app.timemultirange, time, time)
  from public, anon, authenticated, service_role;

-- Dieselbe Regel wie list_day_route: Hausbesuch an der Anschrift des Termins, sonst der Standort;
-- weicht die Akte inzwischen ab (ANN-236) oder ist der Kontext nicht lesbar, gibt es keinen Ort.
create function app.appointment_position(
  p_appointment_id uuid, p_org uuid, out lat double precision, out lon double precision)
language sql stable security definer
set search_path to ''
as $$
  select case when o.ohne then null when a.appointment_type = 'home_visit' then a.visit_lat else l.lat end,
         case when o.ohne then null when a.appointment_type = 'home_visit' then a.visit_lon else l.lon end
  from public.appointments a
  left join public.locations l on l.id = a.location_id and l.organization_id = p_org
  left join public.patient_contact_details c on c.patient_id = a.patient_id and c.organization_id = p_org
  cross join lateral (
    select not app.may_read_appointment_context(a.kind)
        or a.appointment_type not in ('home_visit', 'practice')
        or coalesce(
             a.kind = 'therapy'
             and a.appointment_type = 'home_visit'
             and a.status = 'confirmed'
             and a.starts_at > now()
             and nullif(btrim(c.street), '')       is not null
             and nullif(btrim(c.house_number), '') is not null
             and nullif(btrim(c.postal_code), '')  is not null
             and nullif(btrim(c.city), '')         is not null
             and (a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city)
                 is distinct from
                 (nullif(btrim(c.street), ''), nullif(btrim(c.house_number), ''),
                  nullif(btrim(c.postal_code), ''), nullif(btrim(c.city), '')),
             false) as ohne
  ) o
  where a.id = p_appointment_id and a.organization_id = p_org
$$;

comment on function app.appointment_position(uuid, uuid) is
  'ANN-865: Ort eines Termins fuer die Wegregel der automatischen Buchung. Null, wenn der Termin keinen Ort hat, die Anschrift veraltet ist (ANN-236) oder der Kontext fuer die aufrufende Person nicht lesbar ist (ADR-022 Punkt 11).';
revoke all on function app.appointment_position(uuid, uuid) from public, anon, authenticated, service_role;

create function app.auto_booking_sides(
  p_org uuid, p_staff_member_id uuid, p_date date, p_start time, p_end time, p_tz text)
returns table (
  prev_kind text, prev_lat double precision, prev_lon double precision, prev_at timestamptz,
  next_kind text, next_lat double precision, next_lon double precision, next_at timestamptz,
  arbeit app.timemultirange, belegt app.timemultirange)
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_tag_von timestamptz := p_date::timestamp at time zone p_tz;
  v_tag_bis timestamptz := (p_date + 1)::timestamp at time zone p_tz;
  v_ab      timestamptz := (p_date + p_start)::timestamp at time zone p_tz;
  v_bis     timestamptz := (p_date + p_end)::timestamp at time zone p_tz;
  v_ort_lat double precision;
  v_ort_lon double precision;
  v_stopp   record;
begin
  prev_kind := 'none';
  next_kind := 'none';
  arbeit := coalesce(app.working_ranges(p_staff_member_id, p_org, p_date), '{}'::app.timemultirange);

  select coalesce(range_agg(app.timerange(
           greatest(a.starts_at at time zone p_tz, p_date::timestamp)::time,
           case when a.ends_at at time zone p_tz >= (p_date + 1)::timestamp then time '24:00'
                else (a.ends_at at time zone p_tz)::time end,
           '[)')), '{}'::app.timemultirange)
    into belegt
  from public.appointments a
  where a.organization_id = p_org
    and a.staff_member_id = p_staff_member_id
    and a.status <> 'cancelled'
    and a.starts_at < v_tag_bis
    and a.ends_at > v_tag_von;

  -- ANN-240: Der Tag beginnt und endet an der Garage, sonst am Startort der Praxis.
  select case when l.garage_lat is not null and l.garage_lon is not null then l.garage_lat else l.lat end,
         case when l.garage_lat is not null and l.garage_lon is not null then l.garage_lon else l.lon end
    into v_ort_lat, v_ort_lon
  from public.locations l
  where l.organization_id = p_org
  order by l.name, l.id
  limit 1;

  select a.id, a.ends_at as zeit into v_stopp
  from public.appointments a
  where a.organization_id = p_org
    and a.staff_member_id = p_staff_member_id
    and a.status <> 'cancelled'
    and a.appointment_type in ('home_visit', 'practice')
    and a.ends_at <= v_ab
    and a.ends_at > v_tag_von
  order by a.ends_at desc, a.id
  limit 1;
  if found then
    prev_kind := 'stop';
    prev_at := v_stopp.zeit;
    select p.lat, p.lon into prev_lat, prev_lon from app.appointment_position(v_stopp.id, p_org) p;
  elsif not isempty(arbeit) and v_ort_lat is not null and lower(arbeit) <= p_start then
    prev_kind := 'edge';
    prev_at := (p_date + lower(arbeit))::timestamp at time zone p_tz;
    prev_lat := v_ort_lat;
    prev_lon := v_ort_lon;
  end if;

  select a.id, a.starts_at as zeit into v_stopp
  from public.appointments a
  where a.organization_id = p_org
    and a.staff_member_id = p_staff_member_id
    and a.status <> 'cancelled'
    and a.appointment_type in ('home_visit', 'practice')
    and a.starts_at >= v_bis
    and a.starts_at < v_tag_bis
  order by a.starts_at, a.id
  limit 1;
  if found then
    next_kind := 'stop';
    next_at := v_stopp.zeit;
    select p.lat, p.lon into next_lat, next_lon from app.appointment_position(v_stopp.id, p_org) p;
  elsif not isempty(arbeit) and v_ort_lat is not null and upper(arbeit) >= p_end then
    next_kind := 'edge';
    next_at := (p_date + upper(arbeit))::timestamp at time zone p_tz;
    next_lat := v_ort_lat;
    next_lon := v_ort_lon;
  end if;

  return next;
end;
$$;

comment on function app.auto_booking_sides(uuid, uuid, date, time, time, text) is
  'ANN-865: die beiden Seiten eines freien Fensters fuer die Wegregel. stop: der naechste Termin mit Ort davor oder danach (Ort null = nicht pruefbar); edge: Arbeitsbeginn oder -ende am Tagesort (ANN-240); none: nichts zu pruefen. Dazu Arbeitszeit und Belegung der Person an dem Tag.';
revoke all on function app.auto_booking_sides(uuid, uuid, date, time, time, text)
  from public, anon, authenticated, service_role;

-- Die Wegregel an einem Beginn (§8.1): Zwischen Nachbar und Termin zählt nur freie Arbeitszeit;
-- Pause und andere Termine dazwischen kommen zur Fahrzeit hinzu.
create function app.auto_booking_fits(
  p_date date, p_start_minute integer, p_duration_minutes integer, p_tz text, p_grid integer,
  p_arbeit app.timemultirange, p_belegt app.timemultirange,
  p_prev_at timestamptz, p_prev_seconds integer,
  p_next_at timestamptz, p_next_seconds integer,
  out arrival_ok boolean, out departure_ok boolean)
language plpgsql immutable
set search_path to ''
as $$
declare
  v_von   time := make_time(p_start_minute / 60, p_start_minute % 60, 0);
  v_bis   time := make_time((p_start_minute + p_duration_minutes) / 60,
                            (p_start_minute + p_duration_minutes) % 60, 0);
  v_ab    timestamptz := (p_date + v_von)::timestamp at time zone p_tz;
  v_ende  timestamptz := (p_date + v_bis)::timestamp at time zone p_tz;
  v_rand  time;
  v_sperr integer;
begin
  arrival_ok := true;
  departure_ok := true;
  if p_prev_at is not null then
    v_rand := (p_prev_at at time zone p_tz)::time;
    v_sperr := extract(epoch from (v_von - v_rand))::integer
               - app.auto_booking_free_seconds(p_arbeit, p_belegt, v_rand, v_von);
    arrival_ok := app.earliest_follow_up_start(
      p_prev_at + make_interval(secs => v_sperr), p_prev_seconds, p_grid, p_tz) <= v_ab;
  end if;
  if p_next_at is not null then
    v_rand := case when (p_next_at at time zone p_tz)::date > p_date then time '24:00'
                   else (p_next_at at time zone p_tz)::time end;
    v_sperr := extract(epoch from (v_rand - v_bis))::integer
               - app.auto_booking_free_seconds(p_arbeit, p_belegt, v_bis, v_rand);
    departure_ok := app.earliest_follow_up_start(
      v_ende + make_interval(secs => v_sperr), p_next_seconds, p_grid, p_tz) <= p_next_at;
  end if;
end;
$$;

comment on function app.auto_booking_fits(date, integer, integer, text, integer, app.timemultirange, app.timemultirange, timestamptz, integer, timestamptz, integer) is
  'ANN-865: Gehen An- und Weiterfahrt an diesem Beginn auf? Je Seite: Zeit des Nachbarn plus gesperrte Zeit dazwischen (Pause, andere Termine) plus Fahrzeit, aufgerundet aufs Raster (app.earliest_follow_up_start). Eine Seite ohne Nachbarzeit ist nicht zu pruefen.';
revoke all on function app.auto_booking_fits(date, integer, integer, text, integer, app.timemultirange, app.timemultirange, timestamptz, integer, timestamptz, integer)
  from public, anon, authenticated, service_role;

create function app.auto_booking_request(
  p_org uuid, p_patient_id uuid, p_staff_member_id uuid, p_duration_minutes integer,
  p_from date, p_to date, p_windows jsonb, p_offset integer,
  out o_tz text, out o_grid integer, out o_factor numeric, out o_postal_code text,
  out o_lat double precision, out o_lon double precision)
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_von     date;
  v_strasse text;
  v_haus    text;
  v_stadt   text;
begin
  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = p_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;
  if p_staff_member_id is not null and not app.is_assignable_therapist(p_staff_member_id, p_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;
  if not app.waitlist_windows_valid(coalesce(p_windows, '[]'::jsonb)) then
    raise exception 'invalid time windows' using errcode = '22023';
  end if;
  if p_offset is null or p_offset not between 0 and 200 then
    raise exception 'invalid offset' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes, o.travel_time_factor
    into o_tz, o_grid, o_factor
  from public.organizations o where o.id = p_org;
  if o_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  if p_duration_minutes is null or p_duration_minutes > 240
     or not app.is_valid_treatment_length(make_interval(mins => p_duration_minutes), o_grid) then
    raise exception 'invalid duration' using errcode = '22023';
  end if;

  v_von := greatest(p_from, (now() at time zone o_tz)::date);
  if p_from is null or p_to is null or p_to < v_von or p_to - v_von > 41 then
    raise exception 'date range must lie ahead and span at most 42 days' using errcode = '22023';
  end if;

  select nullif(btrim(c.street), ''), nullif(btrim(c.house_number), ''),
         nullif(btrim(c.postal_code), ''), nullif(btrim(c.city), ''), c.lat, c.lon
    into v_strasse, v_haus, o_postal_code, v_stadt, o_lat, o_lon
  from public.patient_contact_details c
  where c.patient_id = p_patient_id;
  if v_strasse is null or v_haus is null or o_postal_code is null or v_stadt is null then
    raise exception 'home visit requires a complete patient address' using errcode = '22023';
  end if;
  if o_lat is null or o_lon is null then
    raise exception 'patient address is not located' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.auto_booking_request(uuid, uuid, uuid, integer, date, date, jsonb, integer)
  from public, anon, authenticated, service_role;

-- Dieselbe Suche wie find_free_slots, aber als Fenster möglicher Beginne: Der früheste Beginn nach
-- einer Fahrt liegt selten auf einem Vielfachen der Dauer. Vor- und Nachmittag sind getrennt, weil
-- der Gebietstag am Beginn hängt.
create function app.auto_booking_windows(
  p_org uuid, p_patient_id uuid, p_staff_member_id uuid, p_duration_minutes integer,
  p_from date, p_to date, p_windows jsonb, p_offset integer,
  p_tz text, p_grid integer, p_postal_code text)
returns table (
  tagrang bigint, personrang bigint, staff_member_id uuid, staff_name text, slot_date date,
  first_start integer, last_start integer, territory_status text,
  prev_kind text, prev_lat double precision, prev_lon double precision, prev_at timestamptz,
  next_kind text, next_lat double precision, next_lon double precision, next_at timestamptz,
  arbeit app.timemultirange, belegt app.timemultirange)
language plpgsql stable security definer
set search_path to ''
-- Die Schätzung der Funktionsaufrufe löst sonst JIT aus: rund eine Sekunde für 40 ms Arbeit.
set jit to off
as $$
declare
  v_fenster jsonb := coalesce(p_windows, '[]'::jsonb);
  -- Frühestens morgen: Wer heute schon unterwegs ist, erführe von einem neuen Besuch nichts.
  v_von     date := greatest(p_from, (now() at time zone p_tz)::date + 1);
  v_mittag  integer := (ceil(720::numeric / p_grid) * p_grid)::integer;
  v_stamm   uuid;
begin
  -- Weich (§8): bei gleichem Tag und Beginn zuerst, wer die Person zuletzt behandelt hat.
  select a.staff_member_id into v_stamm
  from public.appointments a
  where a.organization_id = p_org
    and a.patient_id = p_patient_id
    and a.kind = 'therapy'
    and a.status <> 'cancelled'
  order by a.starts_at desc
  limit 1;

  return query
  with tage as (
    select d::date as tag
    from generate_series(v_von::timestamp, p_to::timestamp, interval '1 day') d
    -- Ein Termin je Tag: Hat die Person an dem Tag schon einen, wird dort nicht gebucht.
    where not exists (
      select 1 from public.appointments t
      where t.organization_id = p_org
        and t.patient_id = p_patient_id
        and t.status <> 'cancelled'
        and t.starts_at < ((d::date + 1)::timestamp at time zone p_tz)
        and t.ends_at > (d::date::timestamp at time zone p_tz)
    )
  ),
  personen as (
    select sm.id,
           nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), '') as name,
           row_number() over (
             order by (sm.id = v_stamm) desc nulls last,
                      nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), ''), sm.id) as platz
    from public.staff_members sm
    join public.persons pe on pe.id = sm.person_id
    where sm.organization_id = p_org
      and (p_staff_member_id is null or sm.id = p_staff_member_id)
      and app.is_assignable_therapist(sm.id, p_org)
  ),
  arbeitstage as (
    select p.id as staff, p.name, p.platz, t.tag, app.working_ranges(p.id, p_org, t.tag) as bereiche
    from personen p cross join tage t
  ),
  belegung as (
    select a.staff, a.tag,
           range_agg(app.timerange(
             greatest(t.starts_at at time zone p_tz, a.tag::timestamp)::time,
             case when t.ends_at at time zone p_tz >= (a.tag + 1)::timestamp
                  then time '24:00'
                  else (t.ends_at at time zone p_tz)::time end,
             '[)'
           )) as zeiten
    from arbeitstage a
    join public.appointments t
      on t.organization_id = p_org
     and t.status <> 'cancelled'
     and t.staff_member_id = a.staff
     and t.starts_at < ((a.tag + 1)::timestamp at time zone p_tz)
     and t.ends_at > (a.tag::timestamp at time zone p_tz)
    where a.bereiche is not null
    group by a.staff, a.tag
  ),
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
    select a.staff, a.name, a.platz, a.tag,
           unnest((a.bereiche - coalesce(b.zeiten, '{}'::app.timemultirange)) * w.zeiten) as r
    from arbeitstage a
    join wunsch w on w.tag = a.tag
    left join belegung b on b.staff = a.staff and b.tag = a.tag
    where a.bereiche is not null
      and w.zeiten is not null
  ),
  grenzen as (
    select f.staff, f.name, f.platz, f.tag,
           (ceil((extract(epoch from lower(f.r)) / 60)::numeric / p_grid) * p_grid)::integer as erster,
           least((extract(epoch from upper(f.r)) / 60)::integer, 24 * 60 - 1) - p_duration_minutes as letzter
    from frei f
  ),
  halb as (
    select g.staff, g.name, g.platz, g.tag, g.erster as von, least(g.letzter, v_mittag - 1) as bis
    from grenzen g
    union all
    select g.staff, g.name, g.platz, g.tag, greatest(g.erster, v_mittag), g.letzter
    from grenzen g
  ),
  fenster as (
    select h.staff, h.name, h.platz, h.tag, h.von,
           h.von + ((h.bis - h.von) / p_grid) * p_grid as bis,
           app.territory_day_status(p_org, p_postal_code, h.tag, make_time(h.von / 60, h.von % 60, 0)) as gebiet
    from halb h
    where h.bis >= h.von
  ),
  gereiht as (
    select f.*,
           dense_rank() over (
             order by (f.gebiet = 'match') desc, (f.gebiet = 'outside') asc, f.tag) as gruppe
    from fenster f
  )
  select g.gruppe, g.platz, g.staff, g.name, g.tag, g.von, g.bis, g.gebiet,
         n.prev_kind, n.prev_lat, n.prev_lon, n.prev_at,
         n.next_kind, n.next_lat, n.next_lon, n.next_at,
         n.arbeit, n.belegt
  from gereiht g
  cross join lateral app.auto_booking_sides(
    p_org, g.staff, g.tag,
    make_time(g.von / 60, g.von % 60, 0),
    make_time((g.bis + p_duration_minutes) / 60, (g.bis + p_duration_minutes) % 60, 0),
    p_tz) n
  where g.gruppe > p_offset
    and g.gruppe <= p_offset + app.auto_booking_page_size()
  order by g.gruppe, g.von, g.platz;
end;
$$;

comment on function app.auto_booking_windows(uuid, uuid, uuid, integer, date, date, jsonb, integer, text, integer, text) is
  'ANN-865: die Fenster moeglicher Beginne fuer die automatische Buchung, seitenweise nach Tag (Gebietstag zuerst, ausserhalb zuletzt), fruehestens morgen und nie an einem Tag, an dem die Patient:in schon einen Termin hat. Frei ist, was Arbeitszeit der Person ist und sie nicht belegt, in den Wunschzeiten. Je Fenster die beiden Seiten fuer die Wegregel; personrang: zuletzt behandelnde Person zuerst, dann Name.';
revoke all on function app.auto_booking_windows(uuid, uuid, uuid, integer, date, date, jsonb, integer, text, integer, text)
  from public, anon, authenticated, service_role;

create function public.plan_auto_booking(
  p_patient_id uuid, p_staff_member_id uuid, p_duration_minutes integer,
  p_from date, p_to date, p_windows jsonb default '[]'::jsonb, p_offset integer default 0)
returns jsonb
-- Nicht stable: Hinter PostgREST liefe sie sonst in einer lesenden Transaktion, und der Vermerk
-- der Abweisung scheiterte dort.
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org     uuid;
  v_a       record;
  v_gruppen integer;
  v_wege    jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to create appointments');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  select * into v_a
  from app.auto_booking_request(v_org, p_patient_id, p_staff_member_id, p_duration_minutes,
                                p_from, p_to, p_windows, p_offset);

  with seite as materialized (
    select s.tagrang, s.prev_kind, s.prev_lat, s.prev_lon, s.next_kind, s.next_lat, s.next_lon
    from app.auto_booking_windows(v_org, p_patient_id, p_staff_member_id, p_duration_minutes,
                                  p_from, p_to, p_windows, p_offset,
                                  v_a.o_tz, v_a.o_grid, v_a.o_postal_code) s
  ),
  wege as (
    select s.prev_lat as von_lat, s.prev_lon as von_lon, v_a.o_lat as nach_lat, v_a.o_lon as nach_lon
    from seite s
    where s.prev_kind <> 'none' and s.prev_lat is not null
      and not (s.prev_lat = v_a.o_lat and s.prev_lon = v_a.o_lon)
    union
    select v_a.o_lat, v_a.o_lon, s.next_lat, s.next_lon
    from seite s
    where s.next_kind <> 'none' and s.next_lat is not null
      and not (s.next_lat = v_a.o_lat and s.next_lon = v_a.o_lon)
  )
  select (select count(distinct s.tagrang) from seite s)::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'key', app.auto_booking_leg_key(w.von_lat, w.von_lon, w.nach_lat, w.nach_lon),
                    'from', jsonb_build_object('lat', w.von_lat, 'lon', w.von_lon),
                    'to', jsonb_build_object('lat', w.nach_lat, 'lon', w.nach_lon)))
           from wege w), '[]'::jsonb)
    into v_gruppen, v_wege;

  if jsonb_array_length(v_wege) > app.auto_booking_max_legs() then
    raise exception 'too many legs' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'days', v_gruppen,
    'page_size', app.auto_booking_page_size(),
    'target', jsonb_build_object('lat', v_a.o_lat, 'lon', v_a.o_lon),
    'legs', v_wege);
end;
$$;

comment on function public.plan_auto_booking(uuid, uuid, integer, date, date, jsonb, integer) is
  'ANN-865: welche Wege die automatische Buchung fuer eine Seite von Tagen braucht - nur Koordinatenpaare (ADR-019 Punkt 12 und 13), keine Namen, Kennungen oder Uhrzeiten. Die Serverfunktion auto-booking fragt sie beim Kartendienst an und reicht die Fahrzeiten an book_next_appointment. Nur Hausbesuche; liest, reserviert nichts.';
revoke all on function public.plan_auto_booking(uuid, uuid, integer, date, date, jsonb, integer) from public, anon;
grant execute on function public.plan_auto_booking(uuid, uuid, integer, date, date, jsonb, integer) to authenticated;

create function public.book_next_appointment(
  p_patient_id uuid, p_staff_member_id uuid, p_duration_minutes integer,
  p_from date, p_to date, p_windows jsonb default '[]'::jsonb, p_offset integer default 0,
  p_legs jsonb default '[]'::jsonb, p_treatment_basis_id uuid default null,
  p_waitlist_entry_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org        uuid;
  v_a          record;
  v_eintrag    record;
  w            record;
  v_passt      record;
  v_hin        integer;
  v_weiter     integer;
  v_s          integer;
  v_gruppe     bigint := null;
  v_gruppen    integer := 0;
  v_best       record;
  v_best_start integer := null;
  v_best_rang  bigint;
  v_id         uuid;
  v_ungeprueft integer := 0;
  v_knapp      integer := 0;
  v_von        time;
  v_bis        time;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ANN-865: nur Rollen, die Termine anlegen. Ob Patient:innen selbst buchen, entscheidet das ADR
  -- zur Online-Buchung; bis dahin schreibt ein Plattformzugang nur Wünsche (ADR-018, ADR-023).
  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  select * into v_a
  from app.auto_booking_request(v_org, p_patient_id, p_staff_member_id, p_duration_minutes,
                                p_from, p_to, p_windows, p_offset);

  if p_legs is null or jsonb_typeof(p_legs) <> 'array'
     or jsonb_array_length(p_legs) > app.auto_booking_max_legs()
     or exists (
       select 1 from jsonb_array_elements(p_legs) l
       where jsonb_typeof(l) <> 'object'
          or coalesce(jsonb_typeof(l -> 'key'), '') <> 'string'
          or coalesce(jsonb_typeof(l -> 'seconds'), '') not in ('number', 'null')
          or (jsonb_typeof(l -> 'seconds') = 'number'
              and (l ->> 'seconds')::numeric not between 0 and 86400)
     ) then
    raise exception 'invalid legs' using errcode = '22023';
  end if;

  -- Feste Reihenfolge der Sperren: Eintrag, Akte, dann die Personen nach Kennung. Ab hier ändert
  -- kein Anlegen und keine Pause den Tag einer dieser Personen, bis gebucht ist.
  if p_waitlist_entry_id is not null then
    select e.patient_id, e.status into v_eintrag
    from public.waitlist_entries e
    where e.id = p_waitlist_entry_id and e.organization_id = v_org
    for update;
    -- Dieselben Antworten wie create_appointment_from_waitlist, aber bevor gesucht wird.
    if not found then
      raise exception 'waitlist entry not found' using errcode = 'P0002';
    end if;
    if v_eintrag.patient_id <> p_patient_id then
      raise exception 'waitlist entry belongs to another patient' using errcode = '22023';
    end if;
    if v_eintrag.status <> 'open' then
      raise exception 'waitlist entry closed' using errcode = '22023';
    end if;
  end if;
  perform 1 from public.patients p
   where p.id = p_patient_id and p.organization_id = v_org
     for no key update;
  perform 1 from public.staff_members sm
   where sm.organization_id = v_org
     and (p_staff_member_id is null or sm.id = p_staff_member_id)
   order by sm.id
     for no key update;

  for w in
    select f.* from app.auto_booking_windows(v_org, p_patient_id, p_staff_member_id, p_duration_minutes,
                                             p_from, p_to, p_windows, p_offset,
                                             v_a.o_tz, v_a.o_grid, v_a.o_postal_code) f
    order by f.tagrang, f.first_start, f.personrang
  loop
    if v_gruppe is distinct from w.tagrang then
      -- Ein Tag ist fertig geprüft: Sein frühester passender Beginn gewinnt.
      exit when v_best_start is not null;
      v_gruppe := w.tagrang;
      v_gruppen := v_gruppen + 1;
    end if;
    -- Die Fenster eines Tages kommen nach Beginn: Ab hier ist keines mehr früher.
    continue when v_best_start is not null and w.first_start > v_best_start;

    -- Die Fahrzeit ist hier eine harte Regel (§8, §8.1): ohne Ort oder ohne Fahrzeit kein Platz.
    v_hin := null;
    v_weiter := null;
    if w.prev_kind <> 'none' then
      v_hin := case when w.prev_lat is null then null
                    else app.auto_booking_leg_seconds(p_legs, w.prev_lat, w.prev_lon, v_a.o_lat, v_a.o_lon) end;
      if v_hin is null then
        v_ungeprueft := v_ungeprueft + 1;
        continue;
      end if;
      v_hin := round(v_hin * v_a.o_factor)::integer;
    end if;
    if w.next_kind <> 'none' then
      v_weiter := case when w.next_lat is null then null
                       else app.auto_booking_leg_seconds(p_legs, v_a.o_lat, v_a.o_lon, w.next_lat, w.next_lon) end;
      if v_weiter is null then
        v_ungeprueft := v_ungeprueft + 1;
        continue;
      end if;
      v_weiter := round(v_weiter * v_a.o_factor)::integer;
    end if;

    v_s := w.first_start;
    loop
      if v_s > w.last_start then
        v_knapp := v_knapp + 1;
        exit;
      end if;
      -- Gleicher Beginn: Es gewinnt, wer in der Reihenfolge der Personen vorn steht.
      exit when v_best_start is not null
                and (v_s > v_best_start or (v_s = v_best_start and w.personrang > v_best_rang));
      select * into v_passt
      from app.auto_booking_fits(
        w.slot_date, v_s, p_duration_minutes, v_a.o_tz, v_a.o_grid, w.arbeit, w.belegt,
        case when w.prev_kind = 'none' then null else w.prev_at end, v_hin,
        case when w.next_kind = 'none' then null else w.next_at end, v_weiter);
      if not v_passt.departure_ok then
        -- Später bleibt für die Weiterfahrt nur weniger Zeit.
        v_knapp := v_knapp + 1;
        exit;
      end if;
      if v_passt.arrival_ok then
        v_best := w;
        v_best_start := v_s;
        v_best_rang := w.personrang;
        exit;
      end if;
      v_s := v_s + v_a.o_grid;
    end loop;
  end loop;

  if v_best_start is null then
    return jsonb_build_object(
      'outcome', 'none',
      'days', v_gruppen,
      'unverified', v_ungeprueft,
      'tight', v_knapp,
      'page_size', app.auto_booking_page_size());
  end if;

  v_von := make_time(v_best_start / 60, v_best_start % 60, 0);
  v_bis := make_time((v_best_start + p_duration_minutes) / 60, (v_best_start + p_duration_minutes) % 60, 0);
  begin
    if p_waitlist_entry_id is not null then
      v_id := public.create_appointment_from_waitlist(
        p_waitlist_entry_id, p_patient_id, v_best.staff_member_id, 'home_visit',
        v_best.slot_date, v_von, v_bis, null, false, p_treatment_basis_id, false);
    else
      v_id := public.create_appointment(
        p_patient_id, v_best.staff_member_id, 'home_visit',
        v_best.slot_date, v_von, v_bis, null, false, p_treatment_basis_id, false);
    end if;
  exception
    when exclusion_violation then
      -- Ein Weg ohne die Sperre der Person hat den Platz eben belegt: neu planen statt raten.
      return jsonb_build_object('outcome', 'retry');
  end;

  return jsonb_build_object(
    'outcome', 'booked',
    'appointment_id', v_id,
    'staff_member_id', v_best.staff_member_id,
    'staff_name', v_best.staff_name,
    'date', v_best.slot_date,
    'start', to_char(v_von, 'HH24:MI'),
    'end', to_char(v_bis, 'HH24:MI'),
    'territory_status', v_best.territory_status);
end;
$$;

comment on function public.book_next_appointment(uuid, uuid, integer, date, date, jsonb, integer, jsonb, uuid, uuid) is
  'ANN-865: bucht den fruehesten Beginn einer Seite von Tagen, an dem An- und Weiterfahrt aufgehen, als Hausbesuch ueber create_appointment (oder create_appointment_from_waitlist). Sperrt Akte und Personen, bestimmt die Nachbarn selbst und prueft je Seite: Zeit des Nachbarn plus Pause und Termine dazwischen plus Fahrzeit mal Fahrzeitfaktor, aufgerundet aufs Raster. Ein Weg ohne Fahrzeit oder ein Nachbar ohne Ort ist nicht geprueft und wird uebersprungen. Die Fahrzeiten kommen aus der Serverfunktion auto-booking; Praxisrollen duerfen Termine auch von Hand anlegen. Gibt booked mit dem Termin, none mit Zaehlern oder retry zurueck.';
revoke all on function public.book_next_appointment(uuid, uuid, integer, date, date, jsonb, integer, jsonb, uuid, uuid) from public, anon;
grant execute on function public.book_next_appointment(uuid, uuid, integer, date, date, jsonb, integer, jsonb, uuid, uuid) to authenticated;
