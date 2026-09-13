-- =============================================================================
-- Nachbesserungen aus dem Review zu CAL-014 und CAL-015 (CAL-016)
--
-- Drei Befunde aus der unabhaengigen Pruefung der beiden vorangegangenen
-- Migrationen. Alle drei haben dieselbe Ursache: Die Ereignisse aus CAL-015b
-- sind eine neue Terminart, und drei Stellen, die es vorher nicht geben
-- konnte, fragen nicht nach ihr.
--
--   1. `cancel_appointment` haette einem EREIGNIS einen Gebuehrenanlass geben
--      koennen. Wer eine Teambesprechung mit dem Grund "Patient:in hat
--      abgesagt" weniger als 24 Stunden vorher absagt, bekam
--      `fee_basis = 'late_cancellation'` - an einem Termin, der weder eine
--      Patient:in noch einen Behandlungsbeginn hat. PROJECT_PRINCIPLES.md 8.1
--      sagt ueber Ereignisse ausdruecklich: "Sie DUERFEN keine abrechenbare
--      Leistung erzeugen (19)", und 8 knuepft die Frist an die Absage DURCH
--      DIE PATIENT:IN vor dem BEHANDLUNGSbeginn. Nebenwirkung: Der Loeschlauf
--      haelt jeden Vorgang mit Gebuehrenanlass zurueck - die falsch abgesagte
--      Besprechung waere nie wieder geloescht worden (16, ADR-008).
--   2. `cancel_staff_day` reichte den Absagegrund ungeprueft durch. "Tag
--      umplanen" ist definitionsgemaess praxisbedingt - die behandelnde Person
--      faellt aus -, und ADR-018 Fassung 2 Punkt 8.4 ist eindeutig: Eine
--      praxisbedingte Absage loest die Regel NICHT aus. Ein Fehlgriff im
--      Auswahlfeld haette Forderungen gegen ALLE Patient:innen des Tages
--      erzeugt, die innerhalb der Frist lagen.
--   3. `list_day_plan` liess Ereignisse still fallen (INNER JOIN auf
--      `patients`) - genau der Fehler, den CAL-015b bei `list_appointments`
--      und `list_staff_future_appointments` behoben hat, hier uebersehen.
--      Sichtbar auf EINEM Bildschirm: Die eigene Tagesliste der Uebersicht
--      liest `list_day_plan`, der Tagesplan des Teams darunter
--      `list_appointments`. Die Besprechung, die den Kalender blockiert,
--      fehlte oben und stand unten.
--
-- Dazu eine kleinere Haertung aus derselben Pruefung: der Mitteilungsvermerk
-- weist ein Ereignis jetzt auch serverseitig ab. Bisher hielt ihn nur die
-- Oberflaeche zurueck, und "Autorisierung niemals nur ueber die UI" ist eine
-- harte Regel (ADR-004).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Gebuehrenanlass gehoert zur Behandlung
--
-- Zwei Riegel statt einem (ADR-004, Defense-in-Depth): die Bedingung im
-- Schreibpfad UND die Constraint. Ein Gebuehrenanlass an einem Ereignis ist ab
-- jetzt auch dann unmoeglich, wenn eine spaetere Funktion die Pruefung
-- vergisst.
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_fee_basis_values;

alter table public.appointments
  add constraint appointments_fee_basis_values check (
    fee_basis is null
    or (kind = 'treatment'
        and ((fee_basis = 'late_cancellation' and status = 'cancelled')
          or (fee_basis = 'no_show'           and status = 'no_show')))
  );

create or replace function public.cancel_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_reason              text,
  p_received_on         date,
  p_received_time       time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at
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

  -- Die Frist rechnet der Server, aus dem Eingang und dem VEREINBARTEN Beginn
  -- des Termins - nie aus der Eingabezeit und nie im Browser
  -- (PROJECT_PRINCIPLES.md 8).
  --
  -- Und nur an einer BEHANDLUNG: Ein Ereignis des Praxisbetriebs hat keine
  -- Patient:in, die absagen koennte, und keinen Behandlungsbeginn, auf den
  -- sich eine Frist beziehen liesse (CAL-016, 8.1).
  v_anlass := case
    when v_alt.kind = 'treatment'
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
  );

  return p_appointment_id;
end;
$$;

comment on function public.cancel_appointment(uuid, timestamptz, text, date, time) is
  'Sagt einen bestaetigten Termin mit Pflichtgrund ab, haelt den Eingang der Absage in Ortszeit fest, rechnet die 24-Stunden-Frist serverseitig und protokolliert appointment.cancelled (CAL-003, CAL-008b, CAL-014b, CAL-016, ADR-018 Fassung 2). Ein Gebuehrenanlass entsteht nur an einer Behandlung. Datum und Uhrzeit beide null heisst "jetzt".';

-- -----------------------------------------------------------------------------
-- 2. "Tag umplanen" ist praxisbedingt
--
-- Unveraendert aus 20260912210000_appointment_events.sql bis auf die
-- Grundpruefung - und die Begruendungskommentare, die beim Umbau verloren
-- gegangen waren, stehen wieder da.
--
-- Der Vorgang sagt alle Termine EINER behandelnden Person an EINEM Tag ab.
-- Der Anlass ist immer die Praxis: Die Person faellt aus. "Patient:in hat
-- abgesagt" waere an dieser Stelle keine Angabe, sondern ein Fehlgriff mit
-- Folgen fuer jede einzelne Patient:in des Tages (ADR-018 Fassung 2
-- Punkt 8.4).
-- -----------------------------------------------------------------------------
create or replace function public.cancel_staff_day(
  p_staff_member_id uuid,
  p_date            date,
  p_reason          text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_termin  record;
  v_anzahl  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_staff_member_id is null or p_date is null then
    raise exception 'staff member and date are required' using errcode = '22023';
  end if;

  -- Der Ausfall einer behandelnden Person ist praxisbedingt. Der Grund bleibt
  -- eine Angabe - aber nicht jede (CAL-016).
  if p_reason is null or p_reason not in ('practice_request', 'moved', 'other') then
    raise exception 'day rescheduling needs a practice reason' using errcode = '22023';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs
  -- (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_day_plan und list_appointments.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  -- FOR UPDATE ohne SKIP LOCKED: ein Termin, an dem gerade jemand arbeitet,
  -- soll die Umplanung aufhalten und nicht stillschweigend stehen bleiben.
  for v_termin in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
      and a.kind = 'treatment'
    order by a.starts_at, a.id
    for update
  loop
    perform public.cancel_appointment(v_termin.id, v_termin.updated_at, p_reason, null, null);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010, ADR-018
  -- Punkt 5). Ein zusaetzlicher Eintrag "Tag umgeplant" wuerde dieselbe
  -- Tatsache ein zweites Mal festhalten.
  return v_anzahl;
end;
$$;

comment on function public.cancel_staff_day(uuid, date, text) is
  'Sagt alle bestaetigten BEHANDLUNGSTERMINE einer Person an einem Kalendertag in einer Transaktion ab und liefert ihre Anzahl (CAL-009, CAL-015b, CAL-016). Nur mit praxisbedingtem Grund - der Ausfall einer Person ist keine Patientenabsage. Ereignisse bleiben stehen.';

-- -----------------------------------------------------------------------------
-- 3. Die Tagesliste zeigt, was den Tag belegt
--
-- Unveraendert aus 20260910100000_day_plan.sql bis auf den LEFT JOIN und die
-- beiden neuen Spalten. Rueckgabespalten aendern sich, also abraeumen und neu
-- anlegen.
--
-- Adresse, Rufnummern und Zugangshinweis bleiben an die Patient:in gebunden
-- und sind an einem Ereignis leer - es hat keine (ANN-010, ADR-004). Der
-- Dokumentationsstand ebenso: Ein Ereignis kann nicht dokumentiert werden.
-- -----------------------------------------------------------------------------
drop function public.list_day_plan(date, uuid);

create function public.list_day_plan(
  p_date            date,
  p_staff_member_id uuid
)
returns table (
  id                     uuid,
  patient_id             uuid,
  staff_member_id        uuid,
  appointment_type       text,
  kind                   text,
  title                  text,
  status                 text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  patient_given_name     text,
  patient_family_name    text,
  location_name          text,
  visit_street           text,
  visit_house_number     text,
  visit_postal_code      text,
  visit_city             text,
  patient_phone          text,
  patient_phone_mobile   text,
  home_visit_access_note text,
  special_note           text,
  documentation_status   text,
  organization_time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_evidence();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016).
      case when v_darf_nachweis and a.kind = 'treatment' then coalesce(t.status, 'none') end,
      v_tz
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id  = v_org
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_day_plan(date, uuid) is
  'Tagesliste einer behandelnden Person fuer genau einen Kalendertag (UX-001, CAL-016): Termine und Ereignisse mit Besuchsadresse, Rufnummern, Zugangshinweis und Dokumentationsstand. Adresse und Zugangshinweis nur beim Hausbesuch (ANN-010, ADR-004); an einem Ereignis ist beides leer.';

revoke all on function public.list_day_plan(date, uuid) from public, anon;
grant execute on function public.list_day_plan(date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Eine Haertung aus derselben Pruefung
--
-- Der Mitteilungsvermerk gehoert zu einer Patient:in - die Oberflaeche zeigt
-- ihn an einem Ereignis nicht, und ab jetzt weist ihn auch der Server ab.
-- "Autorisierung niemals nur ueber die UI" gilt auch fuer Fachregeln, deren
-- Bruch nur unsinnige Daten erzeugt (ADR-004).
-- -----------------------------------------------------------------------------
create or replace function public.set_appointment_notification(
  p_appointment_id uuid,
  p_channels       text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
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
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_kind = 'event' then
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
$$;

comment on function public.set_appointment_notification(uuid, text[]) is
  'Setzt die gueltigen Mitteilungswege eines Termins auf genau diese Menge; eine leere Liste nimmt den Vermerk zurueck (CAL-012, CAL-016). An einem Ereignis nicht moeglich - es gibt niemanden, dem etwas mitzuteilen waere.';
