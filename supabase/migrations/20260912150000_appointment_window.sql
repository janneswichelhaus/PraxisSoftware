-- =============================================================================
-- Terminfenster: 60 Minuten, serverseitig durchgesetzt (CAL-010a)
--
-- PROJECT_PRINCIPLES.md 8.1 (entschieden 2026-09-08): Ein angebotener
-- Behandlungstermin MUSS ein Zeitfenster von 60 Minuten haben, die
-- Dokumentation eingeschlossen. Der Abschnitt sagt ausdruecklich: "Die Laenge
-- des Zeitfensters MUSS serverseitig durchgesetzt und geprueft werden; eine
-- Vorbelegung im Formular allein erfuellt sie nicht."
--
-- Drei Festlegungen dahinter:
--
--   * EINE Stelle. Die Zahl steht in app.appointment_window_minutes() und
--     sonst nirgends in der Datenbank. Ob sie je Praxis einstellbar wird, ist
--     E12 Punkt 2 und offen; bis dahin waere eine Spalte an organizations
--     Vorbau (ADR-014).
--   * KEINE Ausnahme. E12 Punkt 1 fragt, ob ein Erstbefund laenger dauern
--     darf - die Frage ist offen. Ohne Antwort baut CAL-010a die Regel ohne
--     Ausnahmeparameter: PROJECT_PRINCIPLES.md 16 verlangt im Zweifel die
--     restriktivere Option, und spaeter oeffnen ist billig (ein weiterer
--     Parameter nach dem Muster von p_allow_outside_working_hours).
--   * GEPRUEFT WIRD DIE LAENGE, nicht der Zeitpunkt (ANN-037). Beim Anlegen
--     immer; beim Aendern genau dann, wenn sich die Laenge aendert. Ein
--     Bestandstermin mit abweichender Laenge bleibt damit verschiebbar, ohne
--     dass die Anwendung ihn selbsttaetig verlaengert oder verkuerzt - genau
--     das verbietet 8.1 im Abschnitt "Bestehende Termine". Wer seine Laenge
--     anfasst, bekommt die 60 Minuten.
--
-- Gerechnet wird in ORTSZEIT der Praxis, nicht in absoluter Dauer: 8.1 meint
-- das Zeitfenster, das im Kalender steht. An einem Umstellungstag ist
-- 09:00-10:00 damit ein gueltiges Fenster, auch wenn absolut eine Stunde mehr
-- oder weniger vergeht.
--
-- Nicht Bestandteil dieser Migration: der Fahrpuffer zwischen zwei
-- Hausbesuchen (CAL-010b). Woher eine Fahrzeit kommt und ob eine
-- Unterschreitung warnt oder sperrt, ist E12 Punkt 3 und 4 und offen; 8.1
-- nimmt beides ausdruecklich aus.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Die Zahl aus 8.1, an genau einer Stelle
-- -----------------------------------------------------------------------------
create or replace function app.appointment_window_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 60
$$;

comment on function app.appointment_window_minutes() is
  'Laenge eines angebotenen Terminfensters in Minuten (PROJECT_PRINCIPLES.md 8.1, CAL-010a). Feste Zahl, kein Praxiswert: ob sie je Praxis einstellbar wird, ist E12 Punkt 2 und offen.';

-- Kein EXECUTE fuer Aufrufer: die Zahl gehoert in die Schreibpfade. Die
-- Oberflaeche traegt ihre eigene Vorbelegung (TERMINFENSTER_MINUTEN in
-- src/features/appointments/api.ts); ein Test haelt beide gegeneinander.
revoke all on function app.appointment_window_minutes() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_appointment: jedes neue Zeitfenster ist 60 Minuten lang
--
-- Unveraendert aus 20260912100000_appointment_states.sql bis auf die
-- Laengenpruefung direkt hinter der Reihenfolgepruefung. PostgreSQL kennt kein
-- teilweises Ersetzen einer Funktion.
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment(
  p_patient_id      uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date            date,
  p_start_time      time,
  p_end_time        time,
  p_location_id     uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_patient_status text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_location_id    uuid;
  v_appointment_id uuid;
  v_grid           smallint;
  v_ausserhalb     boolean;
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

  -- PROJECT_PRINCIPLES.md 8.1: jedes NEU ANGELEGTE Zeitfenster hat die feste
  -- Laenge. Ohne Ausnahme - siehe Kopfkommentar.
  if (p_end_time - p_start_time)
       <> make_interval(mins => app.appointment_window_minutes()) then
    raise exception 'appointment window must be % minutes',
      app.appointment_window_minutes() using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select p.status into v_patient_status
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if v_patient_status <> 'active' then
    raise exception 'patient is not in active care' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

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
      appointment_type, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.created', 'appointment', v_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'staff_member_id', p_staff_member_id,
      'outside_working_hours', v_ausserhalb
    )
  );

  return v_appointment_id;
end;
$$;

comment on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean) is
  'Legt einen Termin im Zustand confirmed an. Prueft Terminfenster, Raster und Arbeitszeit; ausserhalb der Arbeitszeit nur mit ausdruecklicher Bestaetigung (CAL-001, CAL-005, CAL-010a, ADR-018).';

-- -----------------------------------------------------------------------------
-- update_appointment: eine GEAENDERTE Laenge ist 60 Minuten lang
--
-- Unveraendert aus 20260912100000_appointment_states.sql bis auf die
-- Laengenpruefung hinter der Zeitzonenermittlung.
--
-- Die Abgrenzung ist dieselbe wie beim Raster (CAL-005): geprueft wird, was neu
-- gesetzt wird. Beim Raster ist das der Beginn, hier die Laenge. Ein
-- Bestandstermin mit 45 Minuten laesst sich damit weiter verschieben und
-- organisatorisch bearbeiten; sobald jemand seine Laenge aendert, gilt 8.1.
-- -----------------------------------------------------------------------------
create or replace function public.update_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_staff_member_id     uuid,
  p_appointment_type    text,
  p_date                date,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_location_id uuid;
  v_street      text;
  v_house       text;
  v_postal      text;
  v_city        text;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
  v_zeit        boolean := false;
  v_organisch   boolean := false;
  v_aktion      text;
  v_grid        smallint;
  v_ausserhalb  boolean := false;
  v_alt_laenge  interval;
  v_neu_laenge  interval;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.location_id, a.appointment_type,
         a.status, a.starts_at, a.ends_at, a.updated_at,
         a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Abgesagte Termine sind terminal (ADR-018 Punkt 2).
  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  -- Durchgefuehrt und nicht angetroffen sind nicht terminal, aber auch nicht
  -- direkt aenderbar: erst wieder oeffnen, dann bearbeiten (CAL-004, CAL-008c).
  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Dokumentiert und abgerechnet haben keinen Rueckweg (ADR-018 Punkt 2).
  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
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
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 8.1, ANN-037: geprueft wird die Laenge, und nur wenn
  -- sie sich aendert. Beide Laengen in Ortszeit, damit ein Bestandstermin an
  -- einem Umstellungstag nicht allein deshalb als geaendert gilt.
  v_alt_laenge := (v_alt.ends_at   at time zone v_tz)
                - (v_alt.starts_at at time zone v_tz);
  v_neu_laenge := p_end_time - p_start_time;

  if v_neu_laenge is distinct from v_alt_laenge
     and v_neu_laenge <> make_interval(mins => app.appointment_window_minutes()) then
    raise exception 'appointment window must be % minutes',
      app.appointment_window_minutes() using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;

  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if v_starts_at is distinct from v_alt.starts_at
     and not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if v_starts_at is distinct from v_alt.starts_at
     or v_ends_at is distinct from v_alt.ends_at
     or p_staff_member_id is distinct from v_alt.staff_member_id then
    v_ausserhalb := not app.is_within_working_hours(
      p_staff_member_id, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;
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
    if v_alt.appointment_type = 'home_visit' then
      v_street := v_alt.visit_street;
      v_house  := v_alt.visit_house_number;
      v_postal := v_alt.visit_postal_code;
      v_city   := v_alt.visit_city;
    else
      select
        nullif(btrim(c.street), ''),
        nullif(btrim(c.house_number), ''),
        nullif(btrim(c.postal_code), ''),
        nullif(btrim(c.city), '')
        into v_street, v_house, v_postal, v_city
      from public.patient_contact_details c
      where c.patient_id = v_alt.patient_id;

      if v_street is null or v_house is null or v_postal is null or v_city is null then
        raise exception 'home visit requires a complete patient address' using errcode = '22023';
      end if;
    end if;
  end if;

  if v_alt.staff_member_id is distinct from p_staff_member_id then
    v_geaendert := array_append(v_geaendert, 'staff_member_id');
    v_organisch := true;
  end if;
  if v_alt.appointment_type is distinct from p_appointment_type then
    v_geaendert := array_append(v_geaendert, 'appointment_type');
    v_organisch := true;
  end if;
  if v_alt.location_id is distinct from v_location_id then
    v_geaendert := array_append(v_geaendert, 'location_id');
    v_organisch := true;
  end if;
  if v_alt.starts_at is distinct from v_starts_at then
    v_geaendert := array_append(v_geaendert, 'starts_at');
    v_zeit := true;
  end if;
  if v_alt.ends_at is distinct from v_ends_at then
    v_geaendert := array_append(v_geaendert, 'ends_at');
    v_zeit := true;
  end if;

  if array_length(v_geaendert, 1) is null then
    return p_appointment_id;
  end if;

  begin
    update public.appointments
       set staff_member_id    = p_staff_member_id,
           appointment_type   = p_appointment_type,
           location_id        = v_location_id,
           starts_at          = v_starts_at,
           ends_at            = v_ends_at,
           visit_street       = v_street,
           visit_house_number = v_house,
           visit_postal_code  = v_postal,
           visit_city         = v_city,
           updated_at         = now()
     where id = p_appointment_id
       and updated_at = p_expected_updated_at;

    if not found then
      raise exception 'appointment was changed meanwhile' using errcode = '40001';
    end if;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  v_aktion := case
    when v_zeit and not v_organisch then 'appointment.rescheduled'
    else 'appointment.updated'
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, v_aktion, 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', p_staff_member_id,
      'changed_fields', to_jsonb(v_geaendert),
      'outside_working_hours', v_ausserhalb
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid, boolean) is
  'Aendert einen bestaetigten Termin. Prueft eine geaenderte Laenge gegen das Terminfenster, einen geaenderten Beginn gegen das Raster und eine Neuplanung gegen die Arbeitszeit (CAL-003, CAL-005, CAL-010a, ADR-018).';
