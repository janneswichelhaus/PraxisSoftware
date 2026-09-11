-- =============================================================================
-- Zustandsautomat des Termins: Wertebereich und Umbenennung (CAL-008a, ADR-018)
--
-- ADR-018 legt EIN Statusfeld mit acht Werten fest, sechs davon in V1
-- erreichbar. Diese Migration setzt den Wertebereich und die Umbenennung;
-- die Schreibpfade fuer 'no_show' und 'documented' folgen in CAL-008c und
-- CAL-008d.
--
--   requested   angefragt          NICHT in der Constraint - Etappe 4
--   tentative   vorgemerkt         NICHT in der Constraint - Etappe 4
--   confirmed   bestaetigt         (frueher 'scheduled')
--   cancelled   abgesagt
--   no_show     nicht angetroffen  Schreibpfad in CAL-008c
--   completed   durchgefuehrt
--   documented  dokumentiert       Schreibpfad in CAL-008d
--   invoiced    abgerechnet        Schreibpfad in ABR-003
--
-- 'requested' und 'tentative' stehen bewusst NICHT in der Constraint: ein
-- Wert, den niemand setzen kann, waere Vorbau (ADR-014, ADR-018 Punkt 1).
--
-- 'invoiced' steht in der Constraint, weil ADR-018 Punkt 1 nur die beiden
-- oberen Werte davon ausnimmt. Es hat heute keinen Schreiber: die
-- Rechnungsausstellung setzt ihn in derselben Transaktion (ABR-003). Die
-- beiden Feld-Constraints unten schliessen ihn deshalb noch nicht ein -
-- ABR-003 zieht sie nach, wenn es den Uebergang baut. Nichts wird hier
-- prophylaktisch dafuer gebaut.
--
-- WARUM die Umbenennung jetzt und nicht spaeter (ADR-018 Punkt 6): Ein Feld,
-- das 'scheduled' heisst und "bestaetigt" bedeutet, waere eine Luege im
-- Datenmodell, die jede spaetere Portal-Erweiterung erbt. Die Aenderung ist
-- mechanisch, aber breit - sie beruehrt jede Abfrage, jeden Filter, die
-- EXCLUDE-Constraint und die Planungsregeln. Sie wird teurer, je laenger sie
-- wartet.
--
-- Die Rumpfe der ersetzten Funktionen sind unveraendert aus ihren bisherigen
-- Migrationen uebernommen; PostgreSQL kennt kein teilweises Ersetzen einer
-- Funktion. Der fachliche Unterschied beschraenkt sich auf die Statuswerte und
-- auf die Zustandspruefungen, die jetzt die vollstaendige Wertemenge kennen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Wertebereich und Bestandsdaten
--
-- Beides in derselben Migration (ADR-018 Punkt 6): es darf keinen Stand geben,
-- in dem die Constraint die alten Werte noch zulaesst.
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_status_check;

alter table public.appointments alter column status drop default;

update public.appointments set status = 'confirmed' where status = 'scheduled';

-- Ein abgeschlossener Termin mit bereits finalisierter Dokumentation ist nach
-- ADR-018 'documented'. Der Wert wird gesetzt, nicht abgeleitet - die
-- Migration stellt denselben Zustand her, den CAL-008d ab dann fortschreibt.
update public.appointments a
   set status = 'documented'
 where a.status = 'completed'
   and exists (
     select 1
     from public.treatment_notes t
     where t.appointment_id = a.id
       and t.addendum_to_note_id is null
       and t.status = 'final'
   );

alter table public.appointments add constraint appointments_status_check
  check (status in (
    'confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced'
  ));

alter table public.appointments alter column status set default 'confirmed';

comment on column public.appointments.status is
  'Zustand des Termins nach ADR-018. Geschrieben ausschliesslich von SECURITY-DEFINER-Funktionen mit eigener Rollenpruefung und eigenem Auditereignis; es gibt keinen freien Statuswechsel ueber die Tabelle.';

-- -----------------------------------------------------------------------------
-- Ueberschneidungsschutz: nur eine Absage gibt den Zeitraum frei
--
-- Bisher waren die belegenden Werte einzeln aufgezaehlt ('scheduled',
-- 'completed'). Mit sechs Werten ist die Aussage umgekehrt kuerzer UND
-- richtiger: Ein Termin, der stattgefunden hat - durchgefuehrt, dokumentiert,
-- abgerechnet - hat seinen Zeitraum tatsaechlich belegt. Ein Termin, an dem
-- niemand angetroffen wurde, ebenfalls: die behandelnde Person ist hingefahren,
-- und ein wieder geoeffneter No-show braucht seinen Zeitraum zurueck. Nur die
-- Absage gibt ihn frei (ADR-018 Punkt 2).
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_no_overlap;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    staff_member_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status <> 'cancelled');

comment on constraint appointments_no_overlap on public.appointments is
  'Verhindert ueberschneidende Termine derselben behandelnden Person. Halboffen, angrenzende Termine zulaessig. Nur eine Absage gibt den Zeitraum frei (CAL-001, CAL-004, CAL-008a).';

-- -----------------------------------------------------------------------------
-- Abschlussfelder: 'documented' behaelt sie
--
-- Wer dokumentiert ist, war vorher durchgefuehrt - completed_at bleibt stehen.
-- completed_by darf bei 'documented' fehlen: die automatische Finalisierung
-- (ADR-016 Punkt 7) hat keinen Akteur, genauso wie finalized_by dort null ist.
-- 'invoiced' ist hier bewusst unbeschraenkt: der Wert kann nach ADR-018 aus
-- 'documented' ODER aus 'no_show' entstehen und hat bis ABR-003 keinen
-- Schreiber.
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_completion_fields;

alter table public.appointments
  add constraint appointments_completion_fields check (
    (status = 'completed'  and completed_at is not null and completed_by is not null)
    or (status = 'documented' and completed_at is not null)
    or (status = 'invoiced')
    -- Bewusst als Ausschluss und nicht als Aufzaehlung: ein unbekannter Wert
    -- soll an der Statusconstraint scheitern und nicht hier - sonst meldet die
    -- Datenbank fuer einen Tippfehler im Status die falsche Ursache.
    or (status not in ('completed', 'documented', 'invoiced')
        and completed_at is null and completed_by is null)
  );

-- -----------------------------------------------------------------------------
-- create_appointment: legt 'confirmed' an
--
-- Unveraendert aus 20260830120200_appointment_scheduling_rules.sql bis auf den
-- Statuswert im INSERT.
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
  'Legt einen Termin im Zustand confirmed an. Prueft Raster und Arbeitszeit; ausserhalb der Arbeitszeit nur mit ausdruecklicher Bestaetigung (CAL-001, CAL-005, ADR-018).';

-- -----------------------------------------------------------------------------
-- update_appointment: nur ein bestaetigter Termin ist aenderbar
--
-- Bisher pruefte die Funktion zwei Werte einzeln und liess damit jeden weiteren
-- Zustand durch die Pruefung fallen. Mit sechs Werten wird die Regel
-- ausgesprochen: geaendert wird ausschliesslich aus 'confirmed'. Die Meldungen
-- bleiben getrennt, weil die Oberflaeche daraus verschiedene Hinweise macht.
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
  'Aendert einen bestaetigten Termin. Prueft einen geaenderten Beginn gegen das Raster und eine Neuplanung gegen die Arbeitszeit (CAL-003, CAL-005, ADR-018).';

-- -----------------------------------------------------------------------------
-- cancel_appointment: aus 'confirmed'
-- -----------------------------------------------------------------------------
create or replace function public.cancel_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.cancelled', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- complete_appointment: aus 'confirmed'
-- -----------------------------------------------------------------------------
create or replace function public.complete_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'no-show appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'appointment is already completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'completed',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.completed', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.complete_appointment(uuid, timestamptz) is
  'Schliesst einen bestaetigten Termin ab und protokolliert appointment.completed (CAL-004, ADR-010, ADR-018). Verlangt keine Behandlungsdokumentation (ANN-005).';

-- -----------------------------------------------------------------------------
-- reopen_appointment: zurueck nach 'confirmed'
-- -----------------------------------------------------------------------------
create or replace function public.reopen_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_reopen_appointment() then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  -- 'documented' und 'invoiced' haben keinen Rueckweg: korrigiert wird in der
  -- Dokumentation beziehungsweise ueber den Rechnungsstorno (ADR-018 Punkt 2).
  if v_alt.status <> 'completed' then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'confirmed',
         completed_at = null,
         completed_by = null,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'completed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.reopened', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.reopen_appointment(uuid, timestamptz) is
  'Setzt einen versehentlich abgeschlossenen Termin auf bestaetigt zurueck und protokolliert appointment.reopened (CAL-004, ADR-010, ADR-018).';

-- -----------------------------------------------------------------------------
-- list_appointments: Statusfilter mit zwei Gruppen
--
--   active  alles, was den Tag belegt - also alles ausser der Absage
--   done    erledigt: durchgefuehrt, dokumentiert, abgerechnet
--
-- Die Gruppen stehen im Lesepfad und nicht in der Oberflaeche: der Filter darf
-- sich nicht darauf verlassen, dass der Browser die Wertemenge kennt.
-- -----------------------------------------------------------------------------
create or replace function public.list_appointments(
  p_from            date,
  p_to              date,
  p_staff_member_id uuid default null,
  p_location_id     uuid default null,
  p_status          text default 'active'
)
returns table (
  id                  uuid,
  patient_id          uuid,
  staff_member_id     uuid,
  location_id         uuid,
  appointment_type    text,
  status              text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  patient_given_name  text,
  patient_family_name text,
  staff_given_name    text,
  staff_family_name   text,
  location_name       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_from is null or p_to is null then
    raise exception 'from and to are required' using errcode = '22023';
  end if;

  if p_to <= p_from then
    raise exception 'to must be after from' using errcode = '22023';
  end if;

  if p_to - p_from > 31 then
    raise exception 'requested range is too large' using errcode = '22023';
  end if;

  if p_status is null
     or p_status not in (
       'confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced',
       'active', 'done', 'all'
     ) then
    raise exception 'unknown status filter' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.location_id,
      a.appointment_type,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name
    from public.appointments a
    join public.patients p       on p.id  = a.patient_id
    join public.persons pp       on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
      and (p_location_id     is null or a.location_id     = p_location_id)
      and (
        p_status = 'all'
        or (p_status = 'active' and a.status <> 'cancelled')
        or (p_status = 'done'   and a.status in ('completed', 'documented', 'invoiced'))
        or a.status = p_status
      )
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$$;

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten (CAL-002, CAL-004, CAL-008a).';

-- -----------------------------------------------------------------------------
-- complete_treatment: derselbe Ablauf, neuer Statusname
--
-- Unveraendert aus 20260910130000_complete_treatment.sql bis auf den
-- Statuswert. Die Reihenfolge Finalisierung -> Abschluss zieht CAL-008d gerade,
-- wenn die Finalisierung den Terminzustand mitsetzt.
-- -----------------------------------------------------------------------------
create or replace function public.complete_treatment(
  p_appointment_id                 uuid,
  p_content                        text,
  p_expected_appointment_updated_at timestamptz,
  p_expected_note_updated_at       timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_id      uuid;
  v_note_stand   timestamptz;
  v_note_status  text;
  v_org          uuid;
  v_termin       record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  select a.id, a.status
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  select t.id, t.updated_at, t.status
    into v_note_id, v_note_stand, v_note_status
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if v_note_id is null then
    if p_expected_note_updated_at is not null then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    v_note_id := public.create_treatment_note(p_appointment_id, p_content);
  else
    if p_expected_note_updated_at is null
       or v_note_stand is distinct from p_expected_note_updated_at then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    if v_note_status = 'final' then
      raise exception 'treatment note is already final' using errcode = '22023';
    end if;
    perform public.update_treatment_note(v_note_id, v_note_stand, p_content);
  end if;

  select t.updated_at into v_note_stand
  from public.treatment_notes t
  where t.id = v_note_id;

  perform public.finalize_treatment_note(v_note_id, v_note_stand);

  -- Ein bereits abgeschlossener Termin wird nicht noch einmal abgeschlossen.
  -- Der Fall kommt aus der Tagesliste: dort steht ein abgeschlossener Termin
  -- ohne finalisierte Dokumentation weiterhin unter "offen" (UX-001).
  if v_termin.status = 'confirmed' then
    perform public.complete_appointment(p_appointment_id, p_expected_appointment_updated_at);
  end if;

  return v_note_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Personalpfade: "noch offene Termine" heisst jetzt 'confirmed'
--
-- Unveraendert aus 20260830140000_staff_management.sql beziehungsweise
-- 20260911100000_staff_permission_split.sql bis auf den Statuswert.
-- -----------------------------------------------------------------------------
create or replace function app.count_staff_future_appointments(
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.appointments a
  where a.staff_member_id = p_staff_member_id
    and a.organization_id = p_organization_id
    and a.status = 'confirmed'
    and a.ends_at > now()
$$;

create or replace function public.list_staff_future_appointments(p_staff_member_id uuid)
returns table (
  id                  uuid,
  starts_at           timestamptz,
  ends_at             timestamptz,
  appointment_type    text,
  patient_id          uuid,
  patient_given_name  text,
  patient_family_name text,
  location_name       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_employment() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs.
  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.patient_id,
      pp.given_name,
      pp.family_name,
      l.name
    from public.appointments a
    join public.patients p  on p.id  = a.patient_id
    join public.persons pp  on pp.id = p.person_id
    left join public.locations l on l.id = a.location_id
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.status = 'confirmed'
      and a.ends_at > now()
    order by a.starts_at, a.id;
end;
$$;
