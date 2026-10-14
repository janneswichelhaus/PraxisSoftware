-- =============================================================================
-- B1 (BEF-151, Auftrag Jannes 14.10.2026): „Nicht in Versorgung“ entfällt.
--
-- Der organisatorische Status einer Akte (`patients.status`, 'active'/'inactive',
-- PAT-002, ANN-002) hatte genau eine Wirkung: `create_appointment` wies jede
-- Person mit 'inactive' ab („patient is not in active care“). Für die Fristen
-- zählte er nie (ADR-008 rechnet ab dem Abschluss der Versorgung, nicht ab dem
-- Status). Jannes: „kein Nutzen, und es kann beim neuen Terminieren stören.“
--
-- Was diese Migration tut:
--   1. Jede Akte wird wieder 'active' (Datenumzug; der Status trägt danach
--      keine Information mehr).
--   2. Die Spalte bleibt mit genau einem Wert stehen, bis ein Aufräumen die
--      Sichten und Funktionen nachzieht, die sie lesen (Suche, Dublettenprüfung,
--      Zusammenführen, Erstaufnahme). Eine Spalte zu streichen hätte diesen
--      Auftrag über ein Dutzend Funktionen verbreitert; die Constraint sagt jetzt
--      ehrlich, dass es nur noch einen Wert gibt.
--   3. `create_appointment` prüft den Status nicht mehr (jüngste Fassung aus
--      20261006110100_log_001b_schreibpfade.sql, sonst wortgleich).
--   4. `set_patient_status` und `app.can_change_patient_status()` entfallen:
--      Es gibt nichts mehr umzuschalten.
--
-- Der Fristanker der Aufbewahrung folgt in 20261112110000_a_002 (abgeleitet
-- aus der letzten Behandlung, Leistung oder Rechnung).
-- =============================================================================

-- 1. Datenumzug -----------------------------------------------------------------

update public.patients
   set status = 'active'
 where status <> 'active';

-- 2. Constraint: nur noch ein Wert -----------------------------------------------

do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.patients'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%inactive%'
  loop
    execute format('alter table public.patients drop constraint %I', v_name);
  end loop;
end;
$$;

-- ANN-510: Es gibt keinen Versorgungsstatus mehr; jede Akte ist planbar.
alter table public.patients
  add constraint patients_status_active_only check (status = 'active');

comment on column public.patients.status is
  'Seit B1 (BEF-151, ANN-510) immer ''active'': „Nicht in Versorgung“ ist entfallen und sperrt keine Termine mehr. Die Spalte bleibt, bis die Sichten und Funktionen, die sie lesen, aufgeräumt sind.';

-- 3. create_appointment ohne Statussperre ----------------------------------------

CREATE OR REPLACE FUNCTION public.create_appointment(p_patient_id uuid, p_staff_member_id uuid, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false, p_treatment_basis_id uuid DEFAULT NULL::uuid, p_confirmed_past boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1: Die Laenge ist frei, aber sie
  -- liegt im Raster - mindestens ein Rasterschritt, ein ganzes Vielfaches
  -- davon (CAL-020, ANN-056). Mit dem Beginn im Raster liegt so auch das Ende
  -- auf einem Rasterpunkt.
  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  -- B1 (BEF-151, ANN-510): Jede Akte der Organisation ist planbar - der
  -- Versorgungsstatus ist entfallen. Geprueft wird nur noch, dass es sie gibt.
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
$function$;

-- 4. Umschalter entfällt ------------------------------------------------------

drop function if exists public.set_patient_status(uuid, text);
drop function if exists app.can_change_patient_status();
