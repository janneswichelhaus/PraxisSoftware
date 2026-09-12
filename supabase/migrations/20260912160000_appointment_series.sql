-- =============================================================================
-- Terminserie aus einer Verordnung (CAL-007)
--
-- Eine Verordnung ueber zehn Behandlungen wird heute zehnmal einzeln in den
-- Kalender getragen: Akte oeffnen, Termin anlegen, Datum rechnen, speichern,
-- zurueck. Diese Migration macht daraus einen Vorgang.
--
-- Vier Festlegungen dahinter:
--
--   * DIE SERIE IST KEINE ENTITAET. ADR-018 Punkt 5: "Eine Terminserie ist eine
--     Erzeugungsregel, kein Zustandstraeger." Es gibt deshalb keine Tabelle
--     appointment_series, keinen Serienstatus und kein "Serie absagen" als
--     eigenen Uebergang. Jeder Termin traegt seinen eigenen Zustand.
--   * KEINE ZWEITE FACHLOGIK. create_appointment_series ruft je Termin
--     public.create_appointment auf - dasselbe Muster wie cancel_staff_day
--     (CAL-009) und complete_treatment (UX-007). Rollenpruefung, Raster,
--     Arbeitszeit, Terminfenster, Ueberschneidungsschutz und Auditeintrag
--     gelten damit unveraendert, und zwar an genau einer Stelle.
--   * ALLES ODER NICHTS. Scheitert ein Termin der Serie, faellt die ganze
--     Transaktion zurueck. Eine halb angelegte Serie waere schlimmer als ein
--     gescheiterter Versuch (PROJECT_PRINCIPLES.md 13) - und die Vorschau sagt
--     vorher, woran es haengt.
--   * DER TERMIN KENNT SEINE VERORDNUNG. appointments.prescription_id ist die
--     Voraussetzung dafuer, dass "Anzahl aus dem Kontingent" beim zweiten
--     Aufruf noch stimmt: ohne sie boete die Anwendung dieselben zehn
--     Behandlungen erneut an. ANN-012 bleibt davon unberuehrt - die GENUTZTE
--     Menge pflegt die Praxis weiter von Hand, verplant ist nicht genutzt
--     (ANN-038).
--
-- Bewusst NICHT hier: der Verordnungszaehler am Termin ("Termin 8 von 10",
-- IDEA-PRX-009, Vorschlag), das automatische Fortschreiben von used_quantity
-- (ABR-002) und die automatische Terminsuche (IDEA-PRX-008). Nichts davon
-- braucht diese Story, und ADR-014 verbietet den Vorbau.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- appointments.prescription_id
--
-- ON DELETE SET NULL und nicht RESTRICT, aus zwei Gruenden:
--
--   * VER-003 laesst eine falsch erfasste Verordnung loeschen (ADR-008 Punkt 10,
--     Art. 16 DSGVO). Ein RESTRICT wuerde genau diese Korrektur blockieren,
--     obwohl die Termine unabhaengig davon stattgefunden haben.
--   * Der Loeschlauf loescht je Patient:in erst die Verordnungen und dann die
--     Termine (LOE-002, retention_run). Ein RESTRICT liesse ihn scheitern.
--
-- Keine eigene Datenklasse und keine neue Frist: die Spalte ist ein Verweis an
-- einem bestehenden Datensatz und teilt dessen Klasse (ADR-008). Dass sie beim
-- Loeschen der Verordnung auf null faellt, ist kein Datenverlust - der Termin
-- behaelt alles, was ihn ausmacht.
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column prescription_id uuid references public.prescriptions (id) on delete set null;

comment on column public.appointments.prescription_id is
  'Verordnung, aus deren Kontingent dieser Termin geplant wurde (CAL-007). Nullbar: ein Termin entsteht auch ohne Verordnung, und eine geloeschte Verordnung setzt den Verweis zurueck. Organisatorisch - die Verordnung selbst traegt die klinischen Felder.';

create index appointments_prescription_idx
  on public.appointments (prescription_id)
  where prescription_id is not null;

-- -----------------------------------------------------------------------------
-- Obergrenze einer Serie, an genau einer Stelle
--
-- Dreissig Termine sind rund ein halbes Jahr bei zwei Behandlungen je Woche -
-- mehr plant keine Verordnung dieser Praxis am Stueck (ANN-038). Die Grenze
-- begrenzt zugleich die Transaktion: Eine Serie ist alles oder nichts, und
-- eine Transaktion ueber hunderte Termine haelt Sperren, die den Kalender
-- fuer alle anderen blockieren.
-- -----------------------------------------------------------------------------
create function app.appointment_series_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 30
$$;

comment on function app.appointment_series_limit() is
  'Hoechstzahl der Termine, die ein Serienvorgang anlegt (CAL-007, ANN-038).';

revoke all on function app.appointment_series_limit() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Kontingent einer Verordnung: verordnet, genutzt, verplant
--
-- "Offen" ist verordnet abzueglich des GROESSEREN von genutzt und verplant.
-- Nicht abzueglich der Summe: eine durchgefuehrte Behandlung ist beides - ein
-- verplanter Termin und eine genutzte Einheit -, und eine Addition wuerde sie
-- doppelt zaehlen (ANN-038).
--
-- Abgesagte Termine zaehlen nicht als verplant: ihr Platz im Kontingent ist
-- wieder frei. "Nicht angetroffen" zaehlt mit - die Fahrt hat stattgefunden,
-- und ob daraus ein Ausfallhonorar wird, entscheidet ABR-003.
-- -----------------------------------------------------------------------------
create function app.prescription_slot_counts(
  p_prescription_id uuid,
  p_organization_id uuid,
  out prescribed integer,
  out used       integer,
  out planned    integer,
  out remaining  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select coalesce(sum(i.prescribed_quantity), 0), coalesce(sum(i.used_quantity), 0)
    into prescribed, used
  from public.prescription_items i
  join public.prescriptions p on p.id = i.prescription_id
  where i.prescription_id = p_prescription_id
    and p.organization_id = p_organization_id;

  select count(*)
    into planned
  from public.appointments a
  where a.prescription_id = p_prescription_id
    and a.organization_id = p_organization_id
    and a.status <> 'cancelled';

  remaining := greatest(coalesce(prescribed, 0) - greatest(coalesce(used, 0), planned), 0);
end;
$$;

comment on function app.prescription_slot_counts(uuid, uuid) is
  'Kontingent einer Verordnung: verordnet, genutzt, verplant und offen (CAL-007, ANN-038). Nur fuer die serverseitigen Lese- und Schreibpfade.';

revoke all on function app.prescription_slot_counts(uuid, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- get_prescription_slots: was die Serienseite ueber die Verordnung wissen muss
--
-- Ausschliesslich organisatorische Angaben: Kontingent, Frequenz als Notiz und
-- die Patient:in, zu der die Verordnung gehoert. Keine Diagnose, kein
-- Therapieziel, kein Hinweis der Verordner:in - die Serienplanung braucht sie
-- nicht, und 'office' plant Termine (PROJECT_PRINCIPLES.md 4.3, ANN-011).
-- Deshalb reicht app.can_read_prescriptions(); die klinische Sicht bleibt
-- list_patient_prescriptions_clinical vorbehalten.
--
-- Kein eigener Auditeintrag: gelesen wird dasselbe, was die Akte ohnehin als
-- Kontingent zeigt (VER-002), und der Zugriff auf die Akte ist protokolliert.
-- -----------------------------------------------------------------------------
create function public.get_prescription_slots(p_prescription_id uuid)
returns table (
  patient_id     uuid,
  frequency_note text,
  prescribed     integer,
  used           integer,
  planned        integer,
  remaining      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_zahlen record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_prescriptions() then
    raise exception 'not allowed to read prescriptions' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read prescriptions' using errcode = '42501';
  end if;

  select p.patient_id, p.frequency_note
    into patient_id, frequency_note
  from public.prescriptions p
  where p.id = p_prescription_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'prescription not found' using errcode = 'P0002';
  end if;

  select * into v_zahlen from app.prescription_slot_counts(p_prescription_id, v_org);
  prescribed := v_zahlen.prescribed;
  used       := v_zahlen.used;
  planned    := v_zahlen.planned;
  remaining  := v_zahlen.remaining;
  return next;
end;
$$;

comment on function public.get_prescription_slots(uuid) is
  'Kontingent und Frequenz einer Verordnung fuer die Serienplanung (CAL-007). Ohne klinische Felder.';

revoke all on function public.get_prescription_slots(uuid) from public, anon;
grant execute on function public.get_prescription_slots(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- create_appointment: nimmt die Verordnung entgegen
--
-- Die Signatur waechst um einen Parameter und muss deshalb ersetzt werden;
-- PostgreSQL kann eine Signatur nicht erweitern (dasselbe Vorgehen wie in
-- 20260830120200_appointment_scheduling_rules.sql). Der Rumpf ist bis auf die
-- Verordnungspruefung, die Spalte im INSERT und den Auditkontext unveraendert
-- aus 20260912150000_appointment_window.sql uebernommen.
--
-- Warum ueberhaupt hier und nicht nachtraeglich in der Serienfunktion: Die
-- Verordnung gehoert zum Termin, und ein zweiter Schreibweg auf dieselbe
-- Tabelle haette eine zweite Stelle mit eigener Pruefung ergeben. So bleibt es
-- bei einem Schreibpfad, und der Verweis steht im Auditkontext des Termins.
-- -----------------------------------------------------------------------------
drop function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean);

create function public.create_appointment(
  p_patient_id      uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date            date,
  p_start_time      time,
  p_end_time        time,
  p_location_id     uuid default null,
  p_allow_outside_working_hours boolean default false,
  -- Verordnung, aus deren Kontingent der Termin geplant wird. Optional: der
  -- Regelfall "einzelner Termin" kennt keine (CAL-001).
  p_prescription_id uuid default null
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

  -- PROJECT_PRINCIPLES.md 8.1: jedes NEU ANGELEGTE Zeitfenster hat die feste
  -- Laenge (CAL-010a).
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

  -- Die Verordnung muss zur Organisation UND zu derselben Patient:in gehoeren.
  -- Eine fremde und eine unbekannte ID erzeugen dieselbe Meldung und taugen
  -- damit nicht als Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  if p_prescription_id is not null then
    select p.id into v_verordnung
    from public.prescriptions p
    where p.id = p_prescription_id
      and p.organization_id = v_org
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'prescription not found' using errcode = 'P0002';
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
      appointment_type, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      prescription_id, created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_verordnung, v_actor
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
      -- Eine ID, kein Inhalt: die Verordnung selbst traegt die klinischen
      -- Felder, und die gehoeren nicht ins Auditlog (ADR-010 Punkt 3).
      'prescription_id', v_verordnung,
      'outside_working_hours', v_ausserhalb
    )
  );

  return v_appointment_id;
end;
$$;

comment on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid) is
  'Legt einen Termin im Zustand confirmed an, wahlweise mit Verordnungsbezug. Prueft Terminfenster, Raster und Arbeitszeit (CAL-001, CAL-005, CAL-007, CAL-010a, ADR-018).';

revoke all on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid)
  from public, anon;
grant execute on function public.create_appointment(uuid, uuid, text, date, time, time, uuid, boolean, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- check_appointment_slots: die Konfliktpruefung je Termin, vor dem Anlegen
--
-- Die Serie ist "alles oder nichts". Ohne Vorschau hiesse das: zehn Termine
-- absenden, eine Meldung zurueckbekommen und raten, welcher Tag der Feiertag
-- war. Diese Funktion sagt es je Zeile - und aendert dabei nichts.
--
-- Geliefert wird ein Befundwort, nicht der kollidierende Termin: Wer die Serie
-- plant, darf den Kalender ohnehin lesen (list_appointments), aber diese
-- Funktion muss ihn deshalb nicht zweimal ausliefern (ADR-004,
-- Datenminimierung). Insbesondere kein Patientenname.
--
-- Reihenfolge der Befunde ist fest: der erste zutreffende gewinnt. 'past' vor
-- 'off_grid' vor 'duplicate' vor 'overlap' vor 'outside_working_hours' - von
-- der Ursache, die man selbst gesetzt hat, zu der, die von aussen kommt.
-- -----------------------------------------------------------------------------
create function public.check_appointment_slots(
  p_staff_member_id uuid,
  p_slots           jsonb
)
returns table (slot_index integer, conflict text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_grid    smallint;
  v_heute   date;
  v_dauer   interval;
  v_anzahl  integer;
  v_i       integer;
  v_j       integer;
  v_daten   date[] := array[]::date[];
  v_zeiten  time[] := array[]::time[];
  v_datum   date;
  v_beginn  time;
  v_ende    time;
  v_von     timestamptz;
  v_bis     timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  -- Ohne diese Pruefung waere die Funktion ein Existenz-Orakel fuer fremde
  -- Mitarbeitende (dieselbe Meldung wie in create_appointment).
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_slots) > app.appointment_series_limit() then
    raise exception 'series is limited to % appointments', app.appointment_series_limit()
      using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_tz, v_grid
  from public.organizations o
  where o.id = v_org;

  v_heute  := (now() at time zone v_tz)::date;
  v_dauer  := make_interval(mins => app.appointment_window_minutes());
  v_anzahl := jsonb_array_length(p_slots);

  -- Erster Durchgang: einlesen. Was sich nicht lesen laesst, wird null und
  -- bekommt im zweiten Durchgang den Befund 'invalid'. Getrennt, weil die
  -- Pruefung auf Doppelungen die Zeilen davor bereits geparst braucht.
  for v_i in 0 .. v_anzahl - 1 loop
    begin
      v_daten[v_i]  := (p_slots -> v_i ->> 'datum')::date;
      v_zeiten[v_i] := (p_slots -> v_i ->> 'beginn')::time;
    exception
      when others then
        v_daten[v_i]  := null;
        v_zeiten[v_i] := null;
    end;
  end loop;

  for v_i in 0 .. v_anzahl - 1 loop
    slot_index := v_i;
    conflict := null;
    v_datum  := v_daten[v_i];
    v_beginn := v_zeiten[v_i];

    -- time + interval laeuft ueber Mitternacht um: 23:30 plus 60 Minuten
    -- ergibt 00:30. Ein Termin ueber den Tageswechsel ist keiner (8.1 rechnet
    -- in Ortszeit), deshalb ist das hier ungueltig und nicht der Folgetag.
    v_ende := case when v_beginn is null then null else v_beginn + v_dauer end;

    if v_datum is null or v_beginn is null or v_ende <= v_beginn then
      conflict := 'invalid';
    elsif v_datum < v_heute then
      conflict := 'past';
    elsif not app.is_on_appointment_grid(v_beginn, v_grid) then
      conflict := 'off_grid';
    else
      v_von := (v_datum + v_beginn) at time zone v_tz;
      v_bis := v_von + v_dauer;

      -- Ueberschneidung innerhalb derselben Serie. Muss vor der Pruefung gegen
      -- die Datenbank stehen: dort stehen die anderen Zeilen noch nicht.
      for v_j in 0 .. v_i - 1 loop
        if v_daten[v_j] is not null and v_zeiten[v_j] is not null
           and (v_daten[v_j] + v_zeiten[v_j]) at time zone v_tz < v_bis
           and ((v_daten[v_j] + v_zeiten[v_j]) at time zone v_tz) + v_dauer > v_von then
          conflict := 'duplicate';
          exit;
        end if;
      end loop;

      if conflict is null
         and exists (
           select 1
           from public.appointments a
           where a.organization_id = v_org
             and a.staff_member_id = p_staff_member_id
             and a.status <> 'cancelled'
             and tstzrange(a.starts_at, a.ends_at, '[)')
                 && tstzrange(v_von, v_bis, '[)')
         ) then
        conflict := 'overlap';
      end if;

      if conflict is null
         and not app.is_within_working_hours(
           p_staff_member_id, v_org, v_datum, v_beginn, v_ende
         ) then
        conflict := 'outside_working_hours';
      end if;
    end if;

    return next;
  end loop;
end;
$$;

comment on function public.check_appointment_slots(uuid, jsonb) is
  'Prueft geplante Terminzeiten einer Serie je Zeile und aendert nichts (CAL-007). Liefert ein Befundwort, nicht den kollidierenden Termin.';

revoke all on function public.check_appointment_slots(uuid, jsonb) from public, anon;
grant execute on function public.check_appointment_slots(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- create_appointment_series
--
-- Ruft je Zeile public.create_appointment auf. Keine eigene Fachlogik: was
-- dort geprueft wird, gilt hier unveraendert, und je Termin entsteht ein
-- eigener appointment.created-Eintrag (ADR-018 Punkt 5, ADR-010).
--
-- Kein eigenes Auditereignis fuer die Serie: sie ist kein Vorgang am
-- Datenbestand, sondern n Vorgaenge. Ein Sammeleintrag daneben wuerde
-- dieselben Termine ein zweites Mal behaupten.
--
-- Das Kontingent begrenzt die Anzahl NICHT (ANN-038): Wer die Folgeverordnung
-- schon in Aussicht hat, plant zu Recht darueber hinaus. Die Oberflaeche
-- schlaegt das offene Kontingent vor und weist auf eine Ueberschreitung hin;
-- die harte Grenze sitzt bei der genutzten Menge (VER-001) und damit an der
-- Abrechnung, nicht am Kalender.
-- -----------------------------------------------------------------------------
create function public.create_appointment_series(
  p_patient_id       uuid,
  p_prescription_id  uuid,
  p_staff_member_id  uuid,
  p_appointment_type text,
  p_slots            jsonb,
  p_location_id      uuid default null,
  p_allow_outside_working_hours boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_dauer  interval;
  v_i      integer;
  v_datum  date;
  v_beginn time;
  v_anzahl integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_prescription_id is null then
    raise exception 'prescription is required' using errcode = '22023';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array'
     or jsonb_array_length(p_slots) = 0 then
    raise exception 'slots must be a non-empty array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_slots) > app.appointment_series_limit() then
    raise exception 'series is limited to % appointments', app.appointment_series_limit()
      using errcode = '22023';
  end if;

  v_dauer := make_interval(mins => app.appointment_window_minutes());

  for v_i in 0 .. jsonb_array_length(p_slots) - 1 loop
    v_datum  := (p_slots -> v_i ->> 'datum')::date;
    v_beginn := (p_slots -> v_i ->> 'beginn')::time;

    if v_datum is null or v_beginn is null then
      raise exception 'slot % is incomplete', v_i using errcode = '22023';
    end if;

    -- Laeuft das Fenster ueber Mitternacht, wuerde die Zeitarithmetik
    -- stillschweigend umlaufen (23:30 + 60 Minuten = 00:30). Lieber hier
    -- abweisen als am Folgetag anlegen.
    if (v_beginn + v_dauer)::time <= v_beginn then
      raise exception 'slot % crosses midnight', v_i using errcode = '22023';
    end if;

    perform public.create_appointment(
      p_patient_id,
      p_staff_member_id,
      p_appointment_type,
      v_datum,
      v_beginn,
      (v_beginn + v_dauer)::time,
      p_location_id,
      p_allow_outside_working_hours,
      p_prescription_id
    );
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean) is
  'Legt die Termine einer Verordnung in einem Vorgang an (CAL-007). Ruft je Zeile create_appointment auf; alles oder nichts.';

revoke all on function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean)
  from public, anon;
grant execute on function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean)
  to authenticated;
