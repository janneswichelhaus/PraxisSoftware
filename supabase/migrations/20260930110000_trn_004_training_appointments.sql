-- =============================================================================
-- TRN-004: Trainingstermine anlegen, verschieben und absagen (TRN-EPIC-002)
--
-- Etappe L hat den Platz im Kalender gebaut (CAL-024 bis CAL-027): den dritten
-- Kontext an `kind`, `training_relationship_id`, die Constraint ueber drei
-- Zweige, die Lesepolicy je Kontext. Was fehlte, war jeder Weg dorthin. Diese
-- Migration baut ihn - ueber die VORHANDENEN Schreibwege, wo es sie gibt
-- (ADR-022 Punkte 1, 9, 10):
--
--   create_training_appointment   neu; create_appointment nimmt eine
--                                 Patient:in, und ein zweiter, nullbarer
--                                 Parameter daneben haette jede Pruefung
--                                 dort verdoppelt
--   update_appointment            kennt den Trainingstermin (Verschieben)
--   cancel_appointment            kennt den Trainingstermin (Absagen)
--   list_assignable_trainers      wer einen Trainingstermin betreuen kann
--
-- WER SCHREIBT (ANN-176): owner, trainer und office - dieselbe Stelle wie am
-- Verhaeltnis, app.can_write_training_relationships() (ANN-172). Zugeordnet
-- wird, wer die Rolle Trainingsbetreuung traegt (app.is_assignable_trainer).
--
-- KEIN DURCHGRIFF BEIM SCHREIBEN (ADR-022 Punkt 11, ADR-021 Punkt 6). CAL-026
-- hat das LESEN nach Kontext gefiltert; geschrieben wurde bisher ueber
-- Wege, die nur die Rolle pruefen und dann eine Zeile per Kennung holen. Eine
-- Therapeut:in haette einen Trainingstermin, dessen Kennung sie kennt,
-- absagen koennen. Deshalb an zwei Stellen:
--
--   1. In jedem Weg, der einen Termin per Kennung holt, filtert die Abfrage
--      nach app.may_write_appointment_context(kind). Ein fremder Kontext ist
--      "nicht gefunden" - dieselbe Meldung wie eine unbekannte Kennung, damit
--      der Weg kein Existenz- oder Zustandsorakel ist (PROJECT_PRINCIPLES.md 13).
--   2. Ein Riegel an der Tabelle haelt den naechsten Weg auf, der es vergisst
--      - dieselbe Absicht wie appointments_context_guard (CAL-024).
--
-- Unveraendert: cancel_staff_day, transfer_appointments_to_treatment_basis und
-- merge_patients beruehren nur kind = 'therapy'; finalize_overdue_treatment_notes
-- und apply_retention laufen ohne Sitzung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer welchen Kontext schreibt - die eine Stelle
-- -----------------------------------------------------------------------------
create function app.may_write_appointment_context(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'training' then app.can_write_training_relationships()
    else app.is_staff()
  end
$$;

comment on function app.may_write_appointment_context(text) is
  'Welche Rolle einen Termin welchen Kontexts schreiben darf (TRN-004, ANN-176, ADR-022 Punkt 11). Trainingstermin: owner, trainer, office wie am Verhaeltnis. Behandlungstermin und internes Ereignis: die vier Praxisrollen; welche davon was genau darf, pruefen die Schreibwege selbst.';

revoke all on function app.may_write_appointment_context(text) from public, anon;
grant execute on function app.may_write_appointment_context(text) to authenticated;

-- Der Riegel an der Tabelle. Nur mit Sitzung: Loeschlauf und automatische
-- Finalisierung laufen ohne auth.uid() und sind keine Rolle.
create function public.appointments_context_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not app.may_write_appointment_context(new.kind) then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

comment on function public.appointments_context_write_guard() is
  'Kein Durchgriff ueber den gemeinsamen Kalender beim Schreiben (TRN-004, ADR-022 Punkt 11): Wer einen Kontext nicht schreiben darf, findet den Termin nicht - auch ueber einen kuenftigen Schreibweg nicht.';

create trigger appointments_context_write_guard
  before insert or update on public.appointments
  for each row execute function public.appointments_context_write_guard();

-- -----------------------------------------------------------------------------
-- 2. Wer einen Trainingstermin betreut (ANN-176)
--
-- Gebaut wie app.is_assignable_therapist: aktive Beschaeftigung, aktiver
-- Zugang, die Rolle. Wer behandelt und trainiert, traegt beide Rollen (§4.8
-- erlaubt die Haeufung); aus der Behandlungsrolle folgt keine Zuordnung im
-- Training.
-- -----------------------------------------------------------------------------
create function app.is_assignable_trainer(
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members sm
    join public.user_profiles up
      on up.person_id = sm.person_id
     and up.organization_id = sm.organization_id
    join public.user_roles ur
      on ur.user_id = up.id
     and ur.organization_id = up.organization_id
    where sm.id = p_staff_member_id
      and sm.organization_id = p_organization_id
      and sm.employment_status = 'active'
      and up.is_active
      and ur.role_key = 'trainer'
  )
$$;

comment on function app.is_assignable_trainer(uuid, uuid) is
  'Wer einen Trainingstermin betreuen kann (TRN-004, ANN-176): aktive Beschaeftigung, aktiver Zugang, Rolle trainer.';

revoke all on function app.is_assignable_trainer(uuid, uuid) from public, anon, authenticated;

create function public.list_assignable_trainers()
returns table (staff_member_id uuid, display_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to plan training appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to plan training appointments' using errcode = '42501';
  end if;

  return query
    select sm.id, pe.given_name || ' ' || pe.family_name
    from public.staff_members sm
    join public.persons pe on pe.id = sm.person_id
    where sm.organization_id = v_org
      and app.is_assignable_trainer(sm.id, v_org)
    order by pe.family_name, pe.given_name;
end;
$$;

comment on function public.list_assignable_trainers() is
  'TRN-004: Auswahl fuer die betreuende Person eines Trainingstermins. owner, trainer, office; abgewiesen mit denied unter appointments.read.';
revoke all on function public.list_assignable_trainers() from public, anon;
grant execute on function public.list_assignable_trainers() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Anschrift eines Hausbesuchs im Training (ANN-177)
--
-- Die Anschrift steht im Trainingskontakt (TRN-001), nie in der Akte: Die
-- Kopie am Termin kommt aus dem Verhaeltnis, an dem der Termin haengt (ADR-022,
-- offene Folgefrage "Adress-Snapshot"). Der Trainingskontakt fuehrt Strasse
-- und Hausnummer in EINEM Feld; der Termin braucht sie getrennt
-- (appointments_address_matches_type). Getrennt wird am letzten Leerzeichen
-- vor einer Hausnummer, die mit einer Ziffer beginnt ("12", "12a", "12 a",
-- "3-5", "7/9"). Gelingt das nicht, gibt es keine vollstaendige Anschrift -
-- und der Hausbesuch wird abgewiesen, statt eine Hausnummer zu erfinden.
-- -----------------------------------------------------------------------------
create function app.split_street_and_house_number(p_line text)
returns table (street text, house_number text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_line  text := btrim(coalesce(p_line, ''));
  v_haus  text;
  v_weg   text;
begin
  v_haus := substring(v_line from '\s([0-9][0-9a-zA-Z]*(\s*[-/]\s*[0-9][0-9a-zA-Z]*)?(\s?[a-zA-Z])?)$');
  if v_haus is null then
    return query select null::text, null::text;
    return;
  end if;
  v_weg := btrim(left(v_line, length(v_line) - length(v_haus)));
  if v_weg = '' then
    return query select null::text, null::text;
    return;
  end if;
  return query select v_weg, v_haus;
end;
$$;

comment on function app.split_street_and_house_number(text) is
  'Teilt "Strasse und Hausnummer" am letzten Leerzeichen vor einer Hausnummer, die mit einer Ziffer beginnt (TRN-004, ANN-177). Ohne erkennbare Hausnummer: beides null.';

revoke all on function app.split_street_and_house_number(text) from public, anon, authenticated;

create function app.training_visit_address(p_relationship_id uuid)
returns table (street text, house_number text, postal_code text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.street, s.house_number,
         nullif(btrim(d.postal_code), ''), nullif(btrim(d.city), '')
  from public.training_contact_details d
  cross join lateral app.split_street_and_house_number(d.street) s
  where d.training_relationship_id = p_relationship_id
$$;

comment on function app.training_visit_address(uuid) is
  'Anschrift fuer den Hausbesuch im Training aus training_contact_details (TRN-004, ANN-177). Keine Zeile oder null-Felder heissen: keine vollstaendige Anschrift.';

revoke all on function app.training_visit_address(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. create_training_appointment
--
-- Dieselben Regeln wie create_appointment, wo sie fuer beide gelten: Kanal,
-- Raster, freie Laenge im Raster (8.1), Vergangenheit nur bestaetigt
-- (ANN-057), Arbeitszeit nur bestaetigt, Standort bei "practice", Belegung
-- ueber alle Kontexte. Anders ist nur, woran der Termin haengt:
--
--   - am Trainingsverhaeltnis, das aktiv sein muss (ein beendeter Vertrag
--     plant keine Termine mehr);
--   - optional an einer Trainingsgrundlage DESSELBEN Verhaeltnisses, die
--     laufen muss (ADR-022 Punkt 5: Pflicht ist das Verhaeltnis, nicht die
--     Klammer - die Einzelstunde bleibt moeglich);
--   - nie an einer Behandlungsgrundlage (Punkt 4, haelt die Constraint).
--
-- DIE BELEGUNG SAGT "BELEGT" UND NICHTS DARUEBER HINAUS (ADR-022 Punkt 11).
-- Die EXCLUDE-Constraint wirkt ueber alle Kontexte; ihre Meldung ist dieselbe
-- wie am Behandlungstermin und nennt keinen fremden Termin.
-- -----------------------------------------------------------------------------
create function public.create_training_appointment(
  p_training_relationship_id    uuid,
  p_staff_member_id             uuid,
  p_appointment_type            text,
  p_date                        date,
  p_start_time                  time,
  p_end_time                    time,
  p_location_id                 uuid default null,
  p_allow_outside_working_hours boolean default false,
  p_training_basis_id           uuid default null,
  p_confirmed_past              boolean default false
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
  v_grid           smallint;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_status         text;
  v_basis_status   text;
  v_location_id    uuid;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_ausserhalb     boolean;
  v_appointment_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_training_relationships() then
    -- Abgewiesen mit bestaetigtem denied-Eintrag und HTTP 403 (G6c, ANN-176).
    perform app.record_denied_write(v_actor, 'appointment.created', 'not allowed to create training appointments');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create training appointments' using errcode = '42501';
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

  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select t.status into v_status
  from public.training_relationships t
  where t.id = p_training_relationship_id
    and t.organization_id = v_org;

  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if v_status <> 'active' then
    raise exception 'training relationship is not active' using errcode = '22023';
  end if;

  -- Eine fremde und eine unbekannte Klammer erzeugen dieselbe Meldung.
  if p_training_basis_id is not null then
    select b.status into v_basis_status
    from public.training_bases b
    where b.id = p_training_basis_id
      and b.organization_id = v_org
      and b.training_relationship_id = p_training_relationship_id;

    if not found then
      raise exception 'training basis not found' using errcode = 'P0002';
    end if;

    if v_basis_status <> 'active' then
      raise exception 'training basis is concluded' using errcode = '22023';
    end if;
  end if;

  if not app.is_assignable_trainer(p_staff_member_id, v_org) then
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

  -- ANN-177: Hausbesuch mit der Anschrift aus dem Trainingskontakt.
  if p_appointment_type = 'home_visit' then
    select x.street, x.house_number, x.postal_code, x.city
      into v_street, v_house, v_postal, v_city
    from app.training_visit_address(p_training_relationship_id) x;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, training_relationship_id, training_basis_id,
      staff_member_id, location_id, appointment_type, kind, status,
      starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      created_by
    )
    values (
      v_org, p_training_relationship_id, p_training_basis_id,
      p_staff_member_id, v_location_id, p_appointment_type, 'training', 'confirmed',
      v_starts_at, v_ends_at,
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
    -- Kennungen, kein Name und keine Anschrift (ADR-010 Punkt 3).
    jsonb_build_object(
      'surface', 'web',
      'kind', 'training',
      'training_relationship_id', p_training_relationship_id,
      'staff_member_id', p_staff_member_id,
      'training_basis_id', p_training_basis_id,
      'outside_working_hours', v_ausserhalb,
      'in_the_past', p_date < v_heute
    )
  );

  return v_appointment_id;
end;
$$;

comment on function public.create_training_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) is
  'TRN-004: legt einen Trainingstermin im gemeinsamen Kalender an (ADR-022 Punkte 1, 3, 5, 9). owner, trainer, office (ANN-176); protokolliert appointment.created, abgewiesen mit denied und HTTP 403.';
revoke all on function public.create_training_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) from public, anon;
grant execute on function public.create_training_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Die vorhandenen Schreibwege kennen den Trainingstermin
--
-- Aus der jeweils letzten Fassung (20260921170000_appointment_kind_rename.sql),
-- geaendert nur an den markierten Stellen (TRN-004, TRN-006). PostgreSQL
-- kennt kein teilweises Ersetzen einer Funktion.
--
-- update_appointment: Eingang auch fuer die Trainingsbetreuung; am
-- Trainingstermin freie Laenge im Raster, Zuordnung nach ANN-176, Hausbesuch
-- nach ANN-177; im Protokoll Kontext und Verhaeltnis statt Patient:in.
--
-- cancel_appointment: Eingang auch fuer die Trainingsbetreuung. Kein
-- Ausfallhonorar-Kennzeichen am Trainingstermin (ANN-178): der Anlass bleibt
-- an kind = 'therapy' gebunden, wie appointments_fee_basis_values es seit
-- CAL-024 sagt.
--
-- complete_appointment, record_no_show, reopen_appointment,
-- set_appointment_notification und create_treatment_note: nur der
-- Kontextfilter (TRN-006). Abschliessen und Nichtantreffen im Training
-- gehoeren zu TRN-EPIC-004. create_treatment_note meldete bis hierher je nach
-- Zustand eines fremden Trainingstermins verschiedene Saetze - ein
-- Zustandsorakel (Zweitreview TRN-EPIC-002).
-- -----------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.update_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_staff_member_id uuid, p_appointment_type text, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_id uuid DEFAULT NULL::uuid, p_allow_outside_working_hours boolean DEFAULT false, p_confirmed_past boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- TRN-004: Die Trainingsbetreuung verschiebt Trainingstermine; welchen
  -- Kontext jemand schreiben darf, entscheidet der Riegel an der Zeile.
  if not (app.can_update_appointment() or app.can_write_training_relationships()) then
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
         a.kind, a.status, a.starts_at, a.ends_at, a.updated_at,
         a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
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

  -- Ein Ereignis hat keine Patientenanschrift, also auch keinen Hausbesuch.
  if v_alt.kind = 'internal' and p_appointment_type = 'home_visit' then
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

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1, ANN-056: Die Laenge einer
  -- Behandlung ist frei im Raster, und geprueft wird sie nur, wenn sie sich
  -- aendert. Beide Laengen in Ortszeit, damit ein Bestandstermin an einem
  -- Umstellungstag nicht allein deshalb als geaendert gilt.
  --
  -- Ein Ereignis ist ans Raster gebunden, und zwar an beiden Enden (CAL-015b).
  v_alt_laenge := (v_alt.ends_at   at time zone v_tz)
                - (v_alt.starts_at at time zone v_tz);
  v_neu_laenge := p_end_time - p_start_time;

  -- TRN-004: Ein Trainingstermin ist frei im Raster wie die Behandlung.
  if v_alt.kind in ('therapy', 'training') then
    if v_neu_laenge is distinct from v_alt_laenge
       and not app.is_valid_treatment_length(v_neu_laenge, v_grid) then
      raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
    end if;
  elsif not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

  if v_starts_at is distinct from v_alt.starts_at
     and not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- Behandeln darf nur, wer zuordenbar ist; an einem Ereignis nimmt auch das
  -- Buero teil (CAL-015b).
  if v_alt.kind = 'therapy' then
    if not app.is_assignable_therapist(p_staff_member_id, v_org) then
      raise exception 'staff member not assignable' using errcode = 'P0002';
    end if;
  elsif v_alt.kind = 'training' then
    -- ANN-176: Einen Trainingstermin betreut, wer die Rolle Trainingsbetreuung hat.
    if not app.is_assignable_trainer(p_staff_member_id, v_org) then
      raise exception 'staff member not assignable' using errcode = 'P0002';
    end if;
  elsif not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
      and sm.employment_status = 'active'
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
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
    elsif v_alt.kind = 'training' then
      -- ANN-177: Die Anschrift kommt aus dem Trainingskontakt, nie aus der Akte.
      select x.street, x.house_number, x.postal_code, x.city
        into v_street, v_house, v_postal, v_city
      from app.training_visit_address(v_alt.training_relationship_id) x;

      if v_street is null or v_house is null or v_postal is null or v_city is null then
        raise exception 'home visit requires a complete address' using errcode = '22023';
      end if;
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
      'outside_working_hours', v_ausserhalb,
      -- FIX-019: Nachgetragen oder zurueckgelegt - das Auditlog sagt es.
      'in_the_past', p_date < v_heute
    )
    -- TRN-004: Am Trainingstermin nennt der Eintrag das Verhaeltnis statt
    -- einer Patient:in; der Behandlungstermin behaelt seine Form.
    || case when v_alt.kind = 'training' then
         jsonb_build_object('kind', 'training',
                            'training_relationship_id', v_alt.training_relationship_id)
       else '{}'::jsonb end
  );

  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_received_on date, p_received_time time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_tz      text;
  v_alt     record;
  v_eingang timestamptz;
  v_anlass  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-004: wie update_appointment - der Riegel an der Zeile entscheidet den Kontext.
  if not (app.can_cancel_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  -- Halb angegeben ist nicht angegeben: Ein Datum ohne Uhrzeit waere
  -- Mitternacht, und das ist eine Erfindung, keine Angabe.
  if (p_received_on is null) <> (p_received_time is null) then
    raise exception 'cancellation receipt needs date and time' using errcode = '22023';
  end if;

  if p_received_on is null then
    v_eingang := now();
  else
    select o.time_zone into v_tz from public.organizations o where o.id = v_org;
    if v_tz is null then
      raise exception 'organization has no time zone' using errcode = '22023';
    end if;
    v_eingang := (p_received_on + p_received_time) at time zone v_tz;
  end if;

  -- Eine Absage, die noch nicht eingegangen ist, gibt es nicht. Ohne diese
  -- Grenze liesse sich die Frist durch ein Datum in der Zukunft aushebeln.
  if v_eingang > now() then
    raise exception 'cancellation cannot be received in the future' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
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

  -- Die Frist rechnet der Server, aus dem Eingang und dem VEREINBARTEN Beginn
  -- des Termins - nie aus der Eingabezeit und nie im Browser
  -- (PROJECT_PRINCIPLES.md 8).
  --
  -- Und nur an einer BEHANDLUNG: Ein Ereignis des Praxisbetriebs hat keine
  -- Patient:in, die absagen koennte, und keinen Behandlungsbeginn, auf den
  -- sich eine Frist beziehen liesse (CAL-016, 8.1).
  -- ANN-178: Auch am Trainingstermin nicht - ob der Anlass im Dienstvertrag
  -- ueber Training entsteht, ist eine offene Vertragsfrage (ADR-022).
  v_anlass := case
    when v_alt.kind = 'therapy'
     and app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
    else null
  end;

  update public.appointments
     set status                   = 'cancelled',
         cancellation_reason      = p_reason,
         cancellation_received_at = v_eingang,
         fee_basis                = v_anlass,
         cancelled_at             = now(),
         cancelled_by             = v_actor,
         updated_at               = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Ohne den Grund (ANN-034: er steht an der Zeile und laeuft mit ihrer
  -- Frist), aber MIT der Gebuehrenentscheidung: Sie begruendet spaeter eine
  -- Forderung und gehoert damit in das Protokoll (ADR-010) - so, wie es der
  -- Vermerk "nicht angetroffen" bis ADR-018 Fassung 1 tat. Der Anlass selbst
  -- bleibt draussen; er liesse den codierten Grund die Zeile ueberleben.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.cancelled', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'fee', v_anlass is not null,
      -- Ob der Eingang nachgetragen wurde, sagt spaeter, warum eine Frist so
      -- ausgegangen ist. Organisatorisch, ohne zusaetzlichen Personenbezug.
      'received_later', p_received_on is not null
    )
    -- TRN-004: Am Trainingstermin nennt der Eintrag das Verhaeltnis statt
    -- einer Patient:in; der Behandlungstermin behaelt seine Form.
    || case when v_alt.kind = 'training' then
         jsonb_build_object('kind', 'training',
                            'training_relationship_id', v_alt.training_relationship_id)
       else '{}'::jsonb end
  );

  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be completed' using errcode = '22023';
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
$function$;

CREATE OR REPLACE FUNCTION public.record_no_show(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_protocol_confirmed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_protokoll boolean;
  v_anlass   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind,
         a.appointment_type, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.kind <> 'therapy' then
    -- Der Trainingstermin: Vermerk ja, Forderung nein. Das Protokoll aus
    -- ANN-055 traegt den Anlass; ohne Anlass hat es nichts zu bestaetigen.
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to treatment appointments only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;

  -- Das Protokoll ist ein Hausbesuchsprotokoll (ANN-055). An der Praxistuer
  -- gibt es nichts zu klingeln, und eine Bestaetigung, die niemand geben
  -- kann, waere hier die Grundlage einer Forderung.
  elsif v_alt.appointment_type = 'home_visit' then
    if p_protocol_confirmed is not true then
      raise exception 'no-show protocol must be confirmed for home visits'
        using errcode = '22023';
    end if;
    v_protokoll := true;
    v_anlass    := 'no_show';
  else
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to home visits only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                    = 'no_show',
         no_show_recorded_at       = now(),
         no_show_recorded_by       = v_actor,
         no_show_protocol_confirmed = v_protokoll,
         fee_basis                 = v_anlass,
         updated_at                = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Das Protokoll steht im Kontext, weil es eine Forderung begruendet
  -- (ADR-010). Kein klinischer Inhalt: Dass niemand geoeffnet hat, ist eine
  -- organisatorische Feststellung.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.no_show', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'protocol_confirmed', v_protokoll,
      'fee_basis', v_anlass
    )
  );

  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  -- 'documented' und 'invoiced' haben keinen Rueckweg: korrigiert wird in der
  -- Dokumentation beziehungsweise ueber den Rechnungsstorno (ADR-018 Punkt 2).
  if v_alt.status not in ('completed', 'no_show') then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  -- Eine erfasste Leistung haengt an diesem Termin und an seinem Zustand
  -- (ABR-002): Das Ausfallhonorar entsteht aus dem Gebuehrenanlass, die
  -- Behandlung aus 'dokumentiert'. Wer den Termin zurueckdreht, ohne die
  -- Leistung zu entfernen, laesst eine Forderung ohne Anlass stehen. Der Weg
  -- zurueck bleibt offen - er fuehrt ueber delete_billable_services.
  if exists (
    select 1 from public.billable_services b where b.appointment_id = p_appointment_id
  ) then
    raise exception 'billable services recorded, remove them first' using errcode = '23514';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                     = 'confirmed',
         completed_at               = null,
         completed_by               = null,
         no_show_recorded_at        = null,
         no_show_recorded_by        = null,
         no_show_protocol_confirmed = null,
         fee_basis                  = null,
         updated_at                 = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status in ('completed', 'no_show');

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
      'staff_member_id', v_alt.staff_member_id,
      -- Aus welchem Zustand zurueck: organisatorisch, kein Personenbezug.
      'from_status', v_alt.status
    )
  );

  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_appointment_notification(p_appointment_id uuid, p_channels text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_patient  uuid;
  v_kind     text;
  v_stand    timestamptz;
  v_kanaele  text[];
  v_kanal    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Der Vermerk gehoert zur Terminorganisation und traegt dasselbe Recht wie
  -- das Aendern eines Termins (ADR-004).
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.updated_at
    into v_patient, v_kind, v_stand
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_kind = 'internal' then
    raise exception 'event has nobody to notify' using errcode = '22023';
  end if;

  -- Doppelte Angaben sind kein Fehler, aber auch kein zweiter Vermerk.
  v_kanaele := (
    select coalesce(array_agg(distinct k order by k), array[]::text[])
    from unnest(coalesce(p_channels, array[]::text[])) as k
    where k is not null
  );

  foreach v_kanal in array v_kanaele loop
    if v_kanal not in ('slip', 'phone', 'in_person', 'email') then
      raise exception 'unknown notification channel' using errcode = '22023';
    end if;
  end loop;

  -- Nur die gueltigen Zeilen weichen; die aelteren bleiben als Historie.
  delete from public.appointment_notifications n
  where n.appointment_id = p_appointment_id
    and n.notified_at >= v_stand;

  insert into public.appointment_notifications
    (organization_id, appointment_id, channel, notified_by)
  select v_org, p_appointment_id, k, v_actor
  from unnest(v_kanaele) as k;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.notified', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      -- Die Wege, kein Inhalt: was gesagt oder geschrieben wurde, steht hier
      -- ausdruecklich nicht (ADR-010 Punkt 3, ADR-011).
      'channels', to_jsonb(v_kanaele)
    )
  );

  return v_kanaele;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_treatment_note(p_appointment_id uuid, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_note   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.kind
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Ein Ereignis des Praxisbetriebs hat keine Patient:in - eine
  -- Behandlungsdokumentation daran haette kein Gegenueber (CAL-015b).
  if v_termin.kind = 'internal' then
    raise exception 'event cannot be documented' using errcode = '22023';
  end if;

  -- Eine Absage sagt aus, dass die Behandlung NICHT stattgefunden hat.
  -- Bestaetigte und abgeschlossene Termine sind dokumentierbar - der laufende
  -- Hausbesuch ist der Regelfall und noch nicht abgeschlossen.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nicht angetroffen heisst: keine Behandlung, also auch kein Nachweis
  -- (CAL-008c). Wer sich vertan hat, oeffnet den Termin wieder.
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor
    )
    returning id into v_note;
  exception
    when unique_violation then
      raise exception 'treatment note already exists' using errcode = '23505';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.created', 'treatment_note', v_note, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'patient_id', v_termin.patient_id
    )
  );

  return v_note;
end;
$function$;
