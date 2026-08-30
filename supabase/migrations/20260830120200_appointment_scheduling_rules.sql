-- =============================================================================
-- Terminplanung gegen Raster und Arbeitszeiten (CAL-005)
--
-- Die beiden Schreibpfade fuer Zeiten bekommen zwei zusaetzliche Pruefungen
-- und einen ausdruecklichen Bestaetigungsweg:
--
--   * RASTER - harte Grenze. Ein neuer Beginn muss auf dem Praxisraster
--     liegen; das laesst sich nicht bestaetigen und nicht umgehen. Geprueft
--     wird nur ein GEAENDERTER Beginn, damit bestehende Termine ausserhalb
--     des Rasters weiter bearbeitbar bleiben.
--   * ARBEITSZEIT - Rueckfrage, keine Sperre. Ausserhalb der hinterlegten
--     Arbeitszeit wird der Vorgang zunaechst mit `outside_working_hours`
--     abgewiesen. Die Oberflaeche fragt nach und schickt denselben Vorgang
--     mit p_allow_outside_working_hours = true erneut. Der Server prueft dann
--     ALLES noch einmal von vorn; bestaetigt wird ausschliesslich diese eine
--     Pruefung.
--
-- Die Bestaetigung umgeht damit ausdruecklich nicht: Ueberschneidungsschutz,
-- RLS, Rollenpruefung, Organisationsgrenzen, Rasterpruefung und Optimistic
-- Concurrency. Das ist keine Zusicherung im Kommentar, sondern folgt aus der
-- Stelle: das Flag wirkt an genau einer Bedingung, alle uebrigen Pruefungen
-- laufen unveraendert davor und danach.
--
-- Ein Termin ohne hinterlegte Arbeitszeit gilt als ausserhalb - eine fehlende
-- Angabe ist keine Zusage. Die Bestaetigung wird im Audit vermerkt.
--
-- Beide Funktionen bekommen einen zusaetzlichen Parameter und muessen deshalb
-- ersetzt werden; PostgreSQL kann eine Signatur nicht erweitern. Die Rumpfe
-- sind bis auf die oben genannten Pruefungen unveraendert aus
-- 20260830100100_appointments.sql und 20260830100300_appointment_changes.sql
-- uebernommen.
-- =============================================================================

drop function public.create_appointment(uuid, uuid, text, date, time, time, uuid);
drop function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid);

create or replace function public.create_appointment(
  p_patient_id      uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date            date,
  p_start_time      time,
  p_end_time        time,
  p_location_id     uuid default null,
  -- Ausdrueckliche Bestaetigung fuer einen Termin ausserhalb der Arbeitszeit.
  -- Wirkt an genau einer Bedingung und an keiner anderen.
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

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
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

  -- Halboffenes Intervall: ein Ende gleich dem Beginn ist kein Termin. Ein
  -- Termin endet am selben Kalendertag, an dem er beginnt.
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

  -- Kalendertag und Uhrzeit werden in der Zeitzone der Praxis ausgelegt.
  v_heute := (now() at time zone v_time_zone)::date;

  -- Ein vollstaendig vergangener Kalendertag ist nicht mehr planbar. Der
  -- laufende Tag bleibt es, damit eine organisatorische Nachtragung moeglich
  -- ist, auch wenn der Beginn schon kurz zurueckliegt.
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  -- Raster: gerechnet auf der Ortszeit, also gegen Mitternacht der
  -- Praxiszeitzone. Nur der Beginn, die Dauer bleibt frei (CAL-005).
  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  -- Patient ausschliesslich in der eigenen Organisation suchen.
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
    -- Bewusst dieselbe Meldung fuer "gibt es nicht", "fremde Praxis",
    -- "nicht aktiv" und "keine therapeutische Rolle".
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  -- Arbeitszeit: Rueckfrage statt Sperre. Ohne hinterlegte Arbeitszeit gilt
  -- der Termin als ausserhalb - eine fehlende Angabe ist keine Zusage.
  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  -- Ortsangaben strikt nach Terminart. Die CHECK-Constraints im Schema sind
  -- die zweite Verteidigungslinie; hier entstehen die verstaendlichen Fehler.
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
    -- Nicht zur Terminart passende Ortsdaten werden nicht gespeichert.
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
      p_appointment_type, 'scheduled', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      -- Die Constraint hat zugeschlagen. Auch bei zwei gleichzeitigen
      -- Anlagen kann hier nur eine gewinnen.
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  -- Auditeintrag ohne Stammdaten und ohne konkrete Terminzeiten: nur Akteur,
  -- Organisation, Bezuege, Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.created', 'appointment', v_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'staff_member_id', p_staff_member_id,
      -- Immer mitgefuehrt, nicht nur im Bestaetigungsfall: so ist am Eintrag
      -- ablesbar, dass die Pruefung gelaufen ist und wie sie ausging. Ein
      -- Wahrheitswert, keine Terminzeit (ADR-010).
      'outside_working_hours', v_ausserhalb
    )
  );

  return v_appointment_id;
end;
$$;

comment on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean) is
  'Legt einen Termin an. Prueft Raster und Arbeitszeit; ausserhalb der Arbeitszeit nur mit ausdruecklicher Bestaetigung (CAL-001, CAL-005).';

revoke all on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean)
  from public, anon;
grant execute on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean)
  to authenticated;

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

  -- Bestehenden Termin ausschliesslich in der eigenen Organisation suchen. Eine
  -- fremde und eine unbekannte ID sind damit ununterscheidbar.
  -- FOR UPDATE ist hier nicht optional. Ohne die Sperre laese eine zweite
  -- Transaktion unter READ COMMITTED den Stand VOR dem Commit der ersten,
  -- fande ihren erwarteten updated_at-Wert bestaetigt und wuerde die fremde
  -- Aenderung anschliessend ueberschreiben - genau der verlorene Update, den
  -- diese Funktion verhindern soll.
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

  -- Abgesagte Termine sind terminal.
  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  -- Abgeschlossene Termine sind nicht terminal, aber auch nicht direkt
  -- aenderbar: erst wieder oeffnen, dann bearbeiten (CAL-004).
  if v_alt.status = 'completed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Optimistic Concurrency: wer auf einem veralteten Stand speichert, wird
  -- abgewiesen. Kein Teilupdate, kein Erfolgsaudit.
  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Alle neuen Werte werden erneut geprueft - genau wie beim Anlegen.
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

  -- Ein Termin laesst sich nicht in einen vollstaendig vergangenen Kalendertag
  -- verschieben; der laufende Tag bleibt zulaessig.
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  -- Raster nur bei einem GEAENDERTEN Beginn. Ein bestehender Termin
  -- ausserhalb des Rasters bleibt sonst unbearbeitbar, sobald das Raster
  -- nachtraeglich verschaerft wurde (CAL-005).
  if v_starts_at is distinct from v_alt.starts_at
     and not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  -- Arbeitszeit nur, wenn der Termin tatsaechlich neu eingeplant wird: andere
  -- Zeit, anderer Tag oder andere behandelnde Person. Eine rein
  -- organisatorische Aenderung soll an einem Bestandstermin nicht scheitern.
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
      -- Bleibt es ein Hausbesuch, bleibt der Snapshot unveraendert.
      v_street := v_alt.visit_street;
      v_house  := v_alt.visit_house_number;
      v_postal := v_alt.visit_postal_code;
      v_city   := v_alt.visit_city;
    else
      -- Wechsel ZU einem Hausbesuch: Adresse jetzt uebernehmen.
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

  -- Nur die NAMEN der tatsaechlich geaenderten Felder werden protokolliert -
  -- niemals alte oder neue Werte, und niemals die konkreten Zeiten (ADR-010).
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

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
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
     -- Der erwartete Stand steht zusaetzlich in der Bedingung: zweite
     -- Verteidigungslinie neben der Sperre oben.
     where id = p_appointment_id
       and updated_at = p_expected_updated_at;

    if not found then
      raise exception 'appointment was changed meanwhile' using errcode = '40001';
    end if;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  -- Abgrenzung der Ereignisse (Auftrag Abschnitt 7):
  --   nur Zeit                -> appointment.rescheduled
  --   organisatorische Felder -> appointment.updated
  --   beides                  -> genau EIN appointment.updated, die Zeitfelder
  --                              stehen in changed_fields
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
  'Aendert einen geplanten Termin. Prueft einen geaenderten Beginn gegen das Raster und eine Neuplanung gegen die Arbeitszeit (CAL-003, CAL-005).';

revoke all on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid, boolean)
  from public, anon;
grant execute on function public.update_appointment(uuid, timestamptz, uuid, text, date, time, time, uuid, boolean)
  to authenticated;
