-- =============================================================================
-- Ein Teamereignis ist ein Vorgang, nicht n Termine (CAL-017)
--
-- CAL-015b legt je beteiligter Person eine Zeile an - richtig, denn die
-- Ueberschneidungspruefung haengt an `staff_member_id`, und eine Besprechung
-- muss in jedem beteiligten Kalender wirklich Zeit belegen. Was fehlte, war
-- die Klammer: Die Zeilen wussten nichts voneinander.
--
-- Die Folgen im Alltag:
--
--   * Eine Besprechung zu verschieben hiess, sie in jedem Kalender einzeln zu
--     verschieben. Wer dabei unterbrochen wurde, hinterliess ein Ereignis, das
--     bei Anna um 9 und bei Tim um 10 stand.
--   * Absagen ebenso: Die Besprechung war fuer die einen abgesagt und stand
--     fuer die anderen noch.
--   * Die Bezeichnung war nach dem Anlegen ueberhaupt nicht mehr aenderbar -
--     `update_appointment` nimmt sie nicht entgegen.
--
-- Die kleinste Erweiterung, die das schliesst: **eine Gruppenkennung**.
-- Zeilen mit derselben `event_group_id` sind dasselbe Ereignis. Daran haengen
-- zwei neue Schreibwege, die die ganze Gruppe in EINER Transaktion aendern
-- beziehungsweise absagen, und ein Lesepfad fuer die Beteiligten.
--
-- **Bestehende Ereignisse werden ausdruecklich NICHT zusammengefuehrt.** Jede
-- vorhandene Zeile bekommt ihre eigene Kennung. Zwei Besprechungen mit
-- gleichem Titel zur gleichen Zeit koennen zwei getrennte Vorgaenge sein, und
-- eine Heuristik ueber Titel und Uhrzeit wuerde sie stillschweigend
-- verheiraten - genau die Art stiller Umdeutung, die dieses Projekt nicht
-- macht (PROJECT_PRINCIPLES.md 13).
--
-- Was unveraendert bleibt: die Ueberschneidungsregel (`appointments_no_overlap`
-- an der einzelnen Zeile), die Berechtigungen (`can_update_appointment`,
-- `can_cancel_appointment`) und das Auditlog - je geaenderter Zeile ein
-- Eintrag, denn der auditpflichtige Vorgang ist der einzelne Termin (ADR-010).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Klammer
-- -----------------------------------------------------------------------------
alter table public.appointments add column event_group_id uuid;

comment on column public.appointments.event_group_id is
  'Klammer ueber die Zeilen EINES Ereignisses - je beteiligter Person eine (CAL-017). Nur bei kind = event gesetzt, dort verbindlich. Bestandszeilen tragen ihre eigene Kennung; sie werden nicht nachtraeglich zusammengefuehrt.';

-- Jede Bestandszeile wird ihre eigene Gruppe. Kein Zusammenfuehren.
update public.appointments set event_group_id = id where kind = 'event';

alter table public.appointments
  add constraint appointments_event_group check (
    (kind = 'event' and event_group_id is not null)
    or (kind <> 'event' and event_group_id is null)
  );

create index appointments_event_group_idx
  on public.appointments (organization_id, event_group_id)
  where kind = 'event';

-- -----------------------------------------------------------------------------
-- 2. Anlegen: eine Kennung fuer alle Zeilen des Vorgangs
--
-- Unveraendert aus 20260912210000_appointment_events.sql bis auf die
-- Gruppenkennung.
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment_event(
  p_title            text,
  p_staff_member_ids uuid[],
  p_appointment_type text,
  p_date             date,
  p_start_time       time,
  p_end_time         time,
  p_location_id      uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_gruppe      uuid;
  v_personen    uuid[];
  v_person      uuid;
  v_ausserhalb  boolean;
  v_id          uuid;
  v_anzahl      integer := 0;
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

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_staff_member_ids is null or array_length(p_staff_member_ids, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Doppelt genannt ist einmal beteiligt. Ohne das Zusammenfassen bekaeme die
  -- Person zwei Zeilen zur selben Zeit - und die zweite scheiterte an der
  -- Ueberschneidung mit der ersten (CAL-017).
  select coalesce(array_agg(distinct p), array[]::uuid[])
    into v_personen
  from unnest(p_staff_member_ids) as p
  where p is not null;

  if array_length(v_personen, 1) is null then
    raise exception 'event needs at least one participant' using errcode = '22023';
  end if;

  -- Ein Ereignis findet in der Praxis oder als Video statt. Ein Hausbesuch
  -- ohne Patient:in waere ein Termin ohne Anschrift.
  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
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

  -- Frei waehlbar heisst frei im RASTER: Beide Enden liegen auf einem
  -- Rasterpunkt. Beim Behandlungstermin genuegt der Beginn, weil die Laenge
  -- fest ist; hier ist sie es nicht (PROJECT_PRINCIPLES.md 8.1).
  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

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

  v_gruppe := gen_random_uuid();

  foreach v_person in array v_personen
  loop
    -- Eigene Pruefung statt is_assignable_therapist: Beteiligte eines
    -- Ereignisses sind Beschaeftigte, nicht notwendig Behandelnde.
    if not exists (
      select 1 from public.staff_members sm
      where sm.id = v_person
        and sm.organization_id = v_org
        and sm.employment_status = 'active'
    ) then
      raise exception 'staff member not found' using errcode = 'P0002';
    end if;

    v_ausserhalb := not app.is_within_working_hours(
      v_person, v_org, p_date, p_start_time, p_end_time
    );

    if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
      raise exception 'outside_working_hours' using errcode = '22023';
    end if;

    begin
      insert into public.appointments (
        organization_id, patient_id, staff_member_id, location_id,
        appointment_type, kind, title, event_group_id, status, starts_at, ends_at, created_by
      )
      values (
        v_org, null, v_person, v_location_id,
        p_appointment_type, 'event', v_titel, v_gruppe, 'confirmed',
        v_starts_at, v_ends_at, v_actor
      )
      returning id into v_id;
    exception
      when exclusion_violation then
        raise exception 'appointment overlaps an existing one' using errcode = '23P01';
    end;

    -- Je Zeile ein Auditeintrag, wie bei jedem anderen Termin auch. Kein
    -- Sammelereignis: Der auditpflichtige Vorgang ist der einzelne Termin
    -- (ADR-010).
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'appointment.created', 'appointment', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        -- Kein Personenbezug ueber die Beteiligten hinaus: Ein Ereignis hat
        -- keine Patient:in, und der Titel gehoert der Zeile (ADR-011).
        'kind', 'event',
        'staff_member_id', v_person,
        'outside_working_hours', v_ausserhalb
      )
    );

    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.create_appointment_event(text, uuid[], text, date, time, time, uuid, boolean) is
  'Legt ein Ereignis des Praxisbetriebs an - je beteiligter Person eine Zeile, alles oder nichts, alle unter einer gemeinsamen Gruppenkennung (CAL-015b, CAL-017). Doppelt genannte Beteiligte zaehlen einmal. Kein Patient, keine Verordnung, keine Leistung.';

-- -----------------------------------------------------------------------------
-- 3. Das ganze Ereignis aendern
--
-- Zeit, Laenge, Bezeichnung, Art und Ort - fuer alle Beteiligten zugleich.
-- Wer wechseln will, WER teilnimmt, aendert die einzelne Zeile ueber
-- `update_appointment`; das ist eine Teilnahme und kein Ereignis.
--
-- Drei Dinge, auf die es ankommt:
--
--   1. **Ein Stand fuer die Gruppe.** Erwartet wird der juengste `updated_at`
--      der Gruppe. Hat jemand zwischenzeitlich irgendeine Zeile angefasst,
--      wird der ganze Vorgang abgewiesen statt halb ausgefuehrt.
--   2. **Konflikte vor dem Schreiben, fuer alle.** Die Constraint greift
--      ohnehin, aber sie greift bei der ersten Zeile und meldet nicht, wen es
--      trifft. Die Vorpruefung nennt die Person.
--   3. **Alles oder nichts.** Eine Funktion, eine Transaktion.
-- -----------------------------------------------------------------------------
create function public.update_appointment_event(
  p_event_group_id      uuid,
  p_expected_updated_at timestamptz,
  p_title               text,
  p_appointment_type    text,
  p_date                date,
  p_start_time          time,
  p_end_time            time,
  p_location_id         uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_tz          text;
  v_grid        smallint;
  v_heute       date;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_titel       text;
  v_location_id uuid;
  v_stand       timestamptz;
  v_zeile       record;
  v_ausserhalb  boolean;
  v_konflikt    text;
  v_anzahl      integer := 0;
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

  if p_event_group_id is null or p_expected_updated_at is null then
    raise exception 'event and expected updated_at are required' using errcode = '22023';
  end if;

  v_titel := btrim(coalesce(p_title, ''));
  if v_titel = '' then
    raise exception 'event title is required' using errcode = '22023';
  end if;
  if length(v_titel) > 120 then
    raise exception 'event title is too long' using errcode = '22023';
  end if;

  if p_appointment_type is null or p_appointment_type not in ('practice', 'video') then
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

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;
  if not app.is_on_appointment_grid(p_end_time, v_grid) then
    raise exception 'end time is not on the appointment grid' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_tz)::date;
  if p_date < v_heute then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_tz;
  v_ends_at   := (p_date + p_end_time)   at time zone v_tz;

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

  -- Alle Zeilen der Gruppe sperren, bevor irgendetwas geprueft wird: Sonst
  -- entschiede ein paralleler Vorgang zwischen Pruefung und Schreiben.
  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'event'
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'event';

  if v_stand is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Eine abgesagte Zeile ist terminal; ein Ereignis mit einer solchen ist als
  -- Ganzes nicht mehr aenderbar (ADR-018 Punkt 2). Fuer einen neuen Zeitraum
  -- wird ein neues Ereignis eingetragen.
  if exists (
    select 1 from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.status <> 'confirmed'
  ) then
    raise exception 'cancelled appointment cannot be changed' using errcode = '22023';
  end if;

  for v_zeile in
    select a.id, a.staff_member_id, a.starts_at, a.ends_at
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
    order by a.staff_member_id
  loop
    -- Arbeitszeit je Beteiligter, und nur wenn sich der Zeitraum wirklich
    -- aendert - sonst fragte ein blosses Umbenennen nach einer Bestaetigung,
    -- die mit der Aenderung nichts zu tun hat.
    if v_starts_at is distinct from v_zeile.starts_at
       or v_ends_at is distinct from v_zeile.ends_at then
      v_ausserhalb := not app.is_within_working_hours(
        v_zeile.staff_member_id, v_org, p_date, p_start_time, p_end_time
      );
      if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
        raise exception 'outside_working_hours' using errcode = '22023';
      end if;
    end if;

    -- Konflikt VOR dem Schreiben, und mit Namen: Die Constraint greift sonst
    -- bei irgendeiner Zeile, und die Meldung sagt nicht, wen es trifft.
    select coalesce(pp.given_name || ' ' || pp.family_name, 'Eine beteiligte Person')
      into v_konflikt
    from public.appointments b
    join public.staff_members sm on sm.id = b.staff_member_id
    join public.persons pp       on pp.id = sm.person_id
    where b.organization_id = v_org
      and b.staff_member_id = v_zeile.staff_member_id
      and b.status <> 'cancelled'
      and b.event_group_id is distinct from p_event_group_id
      and tstzrange(b.starts_at, b.ends_at, '[)')
          && tstzrange(v_starts_at, v_ends_at, '[)')
    limit 1;

    if v_konflikt is not null then
      raise exception 'appointment overlaps an existing one for %', v_konflikt
        using errcode = '23P01';
    end if;
  end loop;

  -- Der Riegel aus Abschnitt 7 laesst eine Zeitaenderung an einer Ereigniszeile
  -- nur zu, wenn sie aus genau diesem Vorgang kommt. Transaktionslokal, und
  -- unten ausdruecklich wieder zurueckgenommen.
  perform set_config('app.event_group_update', 'on', true);

  for v_zeile in
    select a.id, a.staff_member_id, a.starts_at, a.ends_at,
           a.appointment_type, a.location_id, a.title
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
    order by a.staff_member_id
  loop
    update public.appointments
       set title            = v_titel,
           appointment_type = p_appointment_type,
           location_id      = v_location_id,
           starts_at        = v_starts_at,
           ends_at          = v_ends_at,
           updated_at       = now()
     where id = v_zeile.id;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'appointment.updated', 'appointment', v_zeile.id, 'success',
      jsonb_build_object(
        'surface', 'web',
        -- Kein Titel und kein Personenbezug ueber die Beteiligte hinaus
        -- (ADR-011). Dass es das ganze Ereignis betraf, gehoert dazu: Es
        -- erklaert, warum mehrere Zeilen zugleich wandern.
        'kind', 'event',
        'scope', 'event',
        'staff_member_id', v_zeile.staff_member_id
      )
    );

    v_anzahl := v_anzahl + 1;
  end loop;

  perform set_config('app.event_group_update', 'off', true);

  return v_anzahl;
end;
$$;

comment on function public.update_appointment_event(uuid, timestamptz, text, text, date, time, time, uuid, boolean) is
  'Aendert Bezeichnung, Zeit, Laenge, Art und Ort EINES Ereignisses fuer alle Beteiligten in einer Transaktion (CAL-017). Erwartet den juengsten Stand der Gruppe; prueft Arbeitszeit und Ueberschneidung fuer jede beteiligte Person vor dem Schreiben. Wer teilnimmt, aendert update_appointment an der einzelnen Zeile.';

revoke all on function public.update_appointment_event(uuid, timestamptz, text, text, date, time, time, uuid, boolean) from public, anon;
grant execute on function public.update_appointment_event(uuid, timestamptz, text, text, date, time, time, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Das ganze Ereignis absagen
--
-- Ruft je Zeile `cancel_appointment` auf: Dort stehen Berechtigung,
-- Zustandspruefung, Auditeintrag - und seit CAL-016 die Gewissheit, dass an
-- einem Ereignis kein Gebuehrenanlass entsteht. Kein zweiter Schreibpfad
-- neben dem bestehenden.
-- -----------------------------------------------------------------------------
create function public.cancel_appointment_event(
  p_event_group_id      uuid,
  p_expected_updated_at timestamptz,
  p_reason              text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_stand  timestamptz;
  v_zeile  record;
  v_anzahl integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Pruefung wie in der aufgerufenen Funktion, hier nur damit die
  -- Meldung die Ursache trifft statt auf halbem Weg zu scheitern.
  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_event_group_id is null or p_expected_updated_at is null then
    raise exception 'event and expected updated_at are required' using errcode = '22023';
  end if;

  perform 1
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'event'
  for update;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'event';

  if v_stand is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_stand is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  for v_zeile in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.status = 'confirmed'
    order by a.staff_member_id
  loop
    perform public.cancel_appointment(v_zeile.id, v_zeile.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010).
  return v_anzahl;
end;
$$;

comment on function public.cancel_appointment_event(uuid, timestamptz, text) is
  'Sagt alle noch bestaetigten Zeilen EINES Ereignisses in einer Transaktion ab und liefert ihre Anzahl (CAL-017). Erwartet den juengsten Stand der Gruppe. Ein Gebuehrenanlass entsteht dabei nie (CAL-016).';

revoke all on function public.cancel_appointment_event(uuid, timestamptz, text) from public, anon;
grant execute on function public.cancel_appointment_event(uuid, timestamptz, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Wer ist beteiligt?
--
-- Eigener Lesepfad statt eines Joins im Client: Die RLS auf `staff_members`
-- zeigt einem Nicht-owner nicht alles, und die Oberflaeche braucht genau zwei
-- Angaben - Name und Zustand der Teilnahme (ADR-004).
--
-- `updated_at` kommt als juengster Stand der GRUPPE zurueck, nicht je Zeile:
-- Genau diesen Wert erwarten die beiden Schreibwege oben.
-- -----------------------------------------------------------------------------
create function public.list_event_participants(p_event_group_id uuid)
returns table (
  appointment_id  uuid,
  staff_member_id uuid,
  display_name    text,
  status          text,
  group_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_stand timestamptz;
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

  if p_event_group_id is null then
    raise exception 'event is required' using errcode = '22023';
  end if;

  select max(a.updated_at) into v_stand
  from public.appointments a
  where a.organization_id = v_org
    and a.event_group_id  = p_event_group_id
    and a.kind = 'event';

  return query
    select a.id, a.staff_member_id,
           pp.given_name || ' ' || pp.family_name,
           a.status,
           v_stand
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons pp       on pp.id = sm.person_id
    where a.organization_id = v_org
      and a.event_group_id  = p_event_group_id
      and a.kind = 'event'
    order by pp.family_name, pp.given_name;
end;
$$;

comment on function public.list_event_participants(uuid) is
  'Beteiligte EINES Ereignisses mit Anzeigename und Zustand ihrer Teilnahme, dazu der juengste Stand der Gruppe (CAL-017). Kein klinischer Inhalt, kein Patientenbezug.';

revoke all on function public.list_event_participants(uuid) from public, anon;
grant execute on function public.list_event_participants(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Die Gruppenkennung im Lesepfad der Terminsicht
--
-- Unveraendert aus 20260912210000_appointment_events.sql bis auf die eine
-- Spalte. Die Detailansicht braucht sie, um von einer Zeile zum ganzen
-- Ereignis zu kommen.
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.prescription_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.event_group_id,
  a.status,
  a.starts_at,
  a.ends_at,
  a.updated_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.completed_at,
  a.cancellation_reason,
  a.cancellation_received_at,
  a.fee_basis,
  a.no_show_recorded_at,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone,
  -- Nur die Wege, nicht wer wann vermerkt hat: Akteure stehen im Auditlog
  -- (ADR-010), und die Detailansicht zeigt sie auch sonst nicht.
  coalesce(
    (select array_agg(distinct n.channel order by n.channel)
     from public.appointment_notifications n
     where n.appointment_id = a.id
       and n.notified_at >= a.updated_at),
    array[]::text[]
  ) as notification_channels
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses.';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Der Riegel: ein Ereignis wandert nur als Ganzes
--
-- Ohne ihn bliebe eine Luecke offen, die genau den Zustand erzeugt, den dieser
-- Abschnitt beseitigt: `update_appointment` nimmt EINE Zeile und verschiebt
-- sie. An einem Behandlungstermin ist das richtig; an einer Ereigniszeile
-- hiesse es, die Besprechung fuer eine Person auf 10 Uhr zu legen und fuer die
-- uebrigen auf 9 zu lassen.
--
-- Der Riegel steht als Trigger und nicht als Pruefung in der einen Funktion:
-- Er gilt dann fuer jeden Schreibweg, auch fuer einen spaeter hinzukommenden
-- (ADR-004, Defense-in-Depth). Was er ausdruecklich weiter zulaesst, ist der
-- Wechsel der **beteiligten Person** - das ist eine Teilnahme und kein
-- Ereignis - sowie Absage und Wiederoeffnen einer einzelnen Teilnahme.
--
-- `update_appointment_event` hebt ihn fuer seine eigene Transaktion auf. Die
-- Einstellung ist transaktionslokal (`set_config(..., true)`): Sie endet mit
-- der Transaktion und wird dort ausserdem ausdruecklich zurueckgenommen.
-- -----------------------------------------------------------------------------
create function app.ereignis_gruppenweise_aktiv()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.event_group_update', true), '') = 'on';
$$;

comment on function app.ereignis_gruppenweise_aktiv() is
  'Laeuft gerade eine gruppenweite Aenderung eines Ereignisses? Nur update_appointment_event setzt das, transaktionslokal (CAL-017).';

create function public.appointments_event_group_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> 'event' then
    return new;
  end if;

  if app.ereignis_gruppenweise_aktiv() then
    return new;
  end if;

  if new.title            is distinct from old.title
     or new.starts_at        is distinct from old.starts_at
     or new.ends_at          is distinct from old.ends_at
     or new.appointment_type is distinct from old.appointment_type
     or new.location_id      is distinct from old.location_id
     or new.event_group_id   is distinct from old.event_group_id then
    raise exception 'event must be changed as a whole' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.appointments_event_group_guard() is
  'Haelt die Zeilen eines Ereignisses zusammen: Bezeichnung, Zeit, Art und Ort aendert nur update_appointment_event, und dann fuer alle Beteiligten zugleich (CAL-017). Der Wechsel der beteiligten Person, die Absage und das Wiederoeffnen einer einzelnen Teilnahme bleiben moeglich.';

create trigger appointments_event_group_guard
  before update on public.appointments
  for each row execute function public.appointments_event_group_guard();
