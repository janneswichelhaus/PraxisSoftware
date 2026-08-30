-- =============================================================================
-- Mitarbeiterverwaltung (STAFF-001)
--
-- Anlegen, Stammdaten aendern, deaktivieren und reaktivieren. Wieder nach dem
-- Muster der bisherigen Schreibvorgaenge: SECURITY-DEFINER-RPCs statt direkter
-- Schreibrechte. authenticated behaelt auf persons, staff_members und
-- staff_private_details ausschliesslich SELECT.
--
-- Vier Festlegungen praegen diesen Loop:
--
--   * TRENNUNG DER KONZEPTE. Person, Mitarbeiterdatensatz und
--     Authentifizierungsaccount bleiben getrennt (ADR-014). Diese Migration
--     legt AUSSCHLIESSLICH Person und Mitarbeiterdatensatz an. Sie erzeugt
--     kein auth.users, kein user_profiles und keine user_roles. Ein eigener
--     Zugang ist ein eigener, spaeterer Vorgang.
--   * KEINE LOESCHUNG. Es gibt weiterhin kein DELETE ueber den
--     Anwendungspfad. Ein Mitarbeiterdatensatz wird deaktiviert, nicht
--     entfernt; Termine, Arbeitszeiten und Auditbezuege der Vergangenheit
--     bleiben damit vollstaendig lesbar. Eine echte Loeschung nach Ablauf der
--     Aufbewahrung ist ein eigener Retention-Vorgang (ADR-008), kein
--     Bedienschritt.
--   * AKTIVSTATUS SERVERSEITIG. Dass ein inaktiver Mitarbeiter keine neuen
--     Terminzuweisungen erhaelt, wird nicht mehr nur in den Termin-RPCs
--     geprueft, sondern zusaetzlich von einem Trigger auf public.appointments.
--     Der Trigger sperrt die Mitarbeiterzeile und schliesst damit das Zeit-
--     fenster zwischen Pruefung und Einfuegung (siehe unten).
--   * ZUKUENFTIGE TERMINE WERDEN SICHTBAR, NICHT STILL ENTFERNT. Eine
--     Deaktivierung mit offenen zukuenftigen Terminen wird beim ersten Versuch
--     abgewiesen. Die Oberflaeche zeigt die betroffenen Termine und schickt
--     denselben Vorgang mit ausdruecklicher Bestaetigung erneut - dasselbe
--     Muster wie `outside_working_hours` bei der Terminplanung (CAL-005).
--     Abgesagt oder umgebucht wird dabei nichts.
--
-- Beschaeftigtendaten unterliegen zusaetzlich PROJECT_PRINCIPLES.md 20. Die
-- Aufteilung aus 20260828110000 bleibt unveraendert: dienstliche
-- Erreichbarkeit an staff_members (fuer Praxisrollen sichtbar), Privatdaten in
-- staff_private_details (nur owner und die betroffene Person selbst).
--
-- Klinische Daten entstehen hier keine.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
    'organization.appointment_grid_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member'
  ));

-- -----------------------------------------------------------------------------
-- Wer darf Mitarbeiterdatensaetze verwalten
--
-- owner. Abgeleitet aus PROJECT_PRINCIPLES.md 4.1, der einzigen verbindlichen
-- Aussage zu Mitarbeiterdatensaetzen und Personalprozessen: sie nennt
-- "Mitarbeiter" und "Personalprozesse" ausdruecklich beim Praxisinhaber.
--
-- 4.3 nennt fuer das Office "Mitarbeiterorganisation" und 4.5 fuehrt fuer die
-- Teamleitung "Mitarbeiterplanung" als MOEGLICHES Zusatzrecht - beides ist
-- nicht entschieden. Fuer einen schreibenden Vorgang gilt 13 ("im Zweifel
-- blockieren"); der Schnitt bleibt deshalb zunaechst eng und laesst sich durch
-- eine ausdrueckliche Entscheidung erweitern, ohne dass eine Rechtematrix
-- beilaeufig entsteht.
--
-- Das LESEN der Mitarbeiterliste bleibt unveraendert bei allen Praxisrollen
-- (Policy staff_members_select_staff_only aus 20260828100100); Privatdaten
-- bleiben unveraendert bei owner und der betroffenen Person.
-- -----------------------------------------------------------------------------
create or replace function app.can_manage_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_manage_staff() is
  'Wer Mitarbeiterdatensaetze anlegen, aendern und deaktivieren darf (PROJECT_PRINCIPLES.md 4.1, STAFF-001).';

grant execute on function app.can_manage_staff() to authenticated;

-- -----------------------------------------------------------------------------
-- Aktivstatus als Tabellen-Invariante
--
-- Die Termin-RPCs pruefen die Zuordenbarkeit bereits ueber
-- app.is_assignable_therapist. Diese Pruefung ist jedoch eine gewoehnliche
-- Abfrage: zwischen ihr und dem INSERT kann eine parallele Transaktion den
-- Mitarbeiter deaktivieren. Der Termin waere dann angelegt, obwohl der
-- Aktivstatus zum Zeitpunkt des Commits nicht mehr galt.
--
-- Der Trigger schliesst dieses Fenster, indem er die Mitarbeiterzeile mit
-- FOR SHARE sperrt. FOR SHARE steht im Konflikt mit dem FOR-NO-KEY-UPDATE-
-- Lock, den set_staff_employment_status beim UPDATE nimmt. Daraus folgt eine
-- eindeutige Reihenfolge:
--
--   * Terminanlage zuerst  -> die Deaktivierung wartet, sieht den Termin
--                             anschliessend in ihrer Zaehlung und fragt nach.
--   * Deaktivierung zuerst -> die Terminanlage wartet, wertet die Zeile danach
--                             neu aus, findet sie nicht mehr als 'active' und
--                             wird abgewiesen.
--
-- Beide Transaktionen sperren dieselbe Zeile zuerst; eine Verklemmung ist
-- damit ausgeschlossen.
--
-- Der Trigger greift beim INSERT und beim WECHSEL der behandelnden Person.
-- Er greift bewusst NICHT bei anderen Aenderungen eines bestehenden Termins:
-- ein Termin einer inzwischen ausgeschiedenen Person muss abgesagt oder einer
-- aktiven Person neu zugeordnet werden koennen. Genau das waere sonst
-- gesperrt.
-- -----------------------------------------------------------------------------
create or replace function app.assert_appointment_staff_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.staff_members sm
  where sm.id = new.staff_member_id
    and sm.organization_id = new.organization_id
    and sm.employment_status = 'active'
  for share;

  if not found then
    raise exception 'staff member is not active' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function app.assert_appointment_staff_active() is
  'Verhindert Terminzuweisungen an inaktive Mitarbeitende - konkurrenzsicher ueber eine Zeilensperre (STAFF-001).';

create trigger appointments_staff_active_on_insert
  before insert on public.appointments
  for each row
  execute function app.assert_appointment_staff_active();

create trigger appointments_staff_active_on_reassign
  before update of staff_member_id on public.appointments
  for each row
  when (new.staff_member_id is distinct from old.staff_member_id)
  execute function app.assert_appointment_staff_active();

-- -----------------------------------------------------------------------------
-- staff_directory
--
-- Lesesicht fuer die Anwendung, nach dem Vorbild von patient_directory.
-- security_invoker: die RLS der Basistabellen gilt unveraendert, die Sicht
-- erweitert also keine Sichtbarkeit.
--
-- Die Privatdaten sind LEFT JOIN. Fuer eine Rolle ohne Zugriff filtert die
-- Policy auf staff_private_details die Zeile weg; die Spalten kommen dann als
-- NULL zurueck. Es wird also nichts ausgeliefert und im Client ausgeblendet
-- (PROJECT_PRINCIPLES.md 4.7).
-- -----------------------------------------------------------------------------
create view public.staff_directory
with (security_invoker = true) as
select
  sm.id,
  sm.organization_id,
  sm.person_id,
  pe.given_name,
  pe.family_name,
  sm.employment_status,
  sm.work_email,
  sm.work_phone,
  sm.primary_location_id,
  l.name as primary_location_name,
  spd.date_of_birth,
  spd.private_email,
  spd.private_phone,
  spd.street,
  spd.postal_code,
  spd.city
from public.staff_members sm
join public.persons pe on pe.id = sm.person_id
left join public.locations l on l.id = sm.primary_location_id
left join public.staff_private_details spd on spd.staff_member_id = sm.id;

comment on view public.staff_directory is
  'Mitarbeiterliste fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert. Privatdaten erscheinen nur fuer owner und die betroffene Person (PROJECT_PRINCIPLES.md 20).';

revoke all on public.staff_directory from anon, authenticated;
grant select on public.staff_directory to authenticated;

-- -----------------------------------------------------------------------------
-- create_staff_member
--
-- Nimmt ausschliesslich fachliche Eingabefelder entgegen. Keine IDs, keine
-- Organisation: die Organisation stammt aus auth.uid(), die Schluessel erzeugt
-- die Funktion selbst (ADR-003).
--
-- Atomar: Person, Mitarbeiterdatensatz, Privatdaten und Auditeintrag entstehen
-- in EINER Transaktion. Eine plpgsql-Funktion laeuft in genau einer
-- Transaktion; schlaegt ein Schritt fehl, bleibt nichts davon stehen - auch
-- kein Erfolgsaudit (PROJECT_PRINCIPLES.md 13).
--
-- Der Vorgang legt bewusst IMMER eine neue Person an. Eine bestehende Person
-- wiederzuverwenden - etwa wenn eine Patientin zugleich Mitarbeiterin wird -
-- setzt eine Identitaetszuordnung voraus, die es noch nicht gibt; sie waere
-- hier eine stillschweigende Fachentscheidung.
-- -----------------------------------------------------------------------------
create or replace function public.create_staff_member(
  p_given_name          text,
  p_family_name         text,
  p_work_email          text default null,
  p_work_phone          text default null,
  p_primary_location_id uuid default null,
  p_date_of_birth       date default null,
  p_private_email       text default null,
  p_private_phone       text default null,
  p_street              text default null,
  p_postal_code         text default null,
  p_city                text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_person_id   uuid;
  v_staff_id    uuid;
  v_given       text;
  v_family      text;
  v_location_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_manage_staff() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_given  := btrim(coalesce(p_given_name, ''));
  v_family := btrim(coalesce(p_family_name, ''));

  if v_given = '' or v_family = '' then
    raise exception 'given name and family name are required' using errcode = '22023';
  end if;

  -- Standort ausschliesslich in der eigenen Organisation suchen: eine fremde
  -- und eine unbekannte ID sind damit ununterscheidbar.
  if p_primary_location_id is not null then
    select l.id into v_location_id
    from public.locations l
    where l.id = p_primary_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, v_given, v_family, v_actor)
  returning id into v_person_id;

  insert into public.staff_members (
    organization_id, person_id, primary_location_id,
    employment_status, work_email, work_phone, created_by
  )
  values (
    v_org, v_person_id, v_location_id,
    'active',
    nullif(btrim(coalesce(p_work_email, '')), ''),
    nullif(btrim(coalesce(p_work_phone, '')), ''),
    v_actor
  )
  returning id into v_staff_id;

  -- Die Zeile entsteht immer, auch wenn alle Felder leer bleiben. Damit hat
  -- eine spaetere Aenderung der Privatdaten einen festen Anker und muss nicht
  -- zwischen Anlegen und Aendern unterscheiden.
  insert into public.staff_private_details (
    staff_member_id, organization_id, date_of_birth,
    private_email, private_phone, street, postal_code, city, created_by
  )
  values (
    v_staff_id, v_org, p_date_of_birth,
    nullif(btrim(coalesce(p_private_email, '')), ''),
    nullif(btrim(coalesce(p_private_phone, '')), ''),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    v_actor
  );

  -- Auditeintrag ohne Stammdaten: kein Name, keine Kontaktdaten, keine
  -- Privatangaben. Akteur, Organisation, Bezug, Zeitpunkt und Ergebnis
  -- genuegen fuer die Nachvollziehbarkeit (ADR-010, PROJECT_PRINCIPLES.md 20).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_member.created', 'staff_member', v_staff_id, 'success',
    jsonb_build_object('surface', 'web')
  );

  return v_staff_id;
end;
$$;

comment on function public.create_staff_member(text, text, text, text, uuid, date, text, text, text, text, text) is
  'Legt Person und Mitarbeiterdatensatz atomar an und protokolliert staff_member.created. Erzeugt KEINEN Zugang und keine Rollen (STAFF-001).';

revoke all on function public.create_staff_member(text, text, text, text, uuid, date, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_staff_member(text, text, text, text, uuid, date, text, text, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- update_staff_member
--
-- Nimmt die Mitarbeiter-ID und die fachlichen Eingabefelder entgegen. Weder
-- Organisation noch Beschaeftigungsstatus: der Status hat einen eigenen
-- Vorgang. Optionalfelder duerfen geleert werden und werden dann als null
-- gespeichert.
--
-- Protokolliert werden ausschliesslich die NAMEN der tatsaechlich geaenderten
-- Felder - niemals alte oder neue Werte (ADR-010). Aendert sich nichts,
-- entsteht weder ein Schreibvorgang noch ein Auditeintrag.
-- -----------------------------------------------------------------------------
create or replace function public.update_staff_member(
  p_staff_member_id     uuid,
  p_given_name          text,
  p_family_name         text,
  p_work_email          text default null,
  p_work_phone          text default null,
  p_primary_location_id uuid default null,
  p_date_of_birth       date default null,
  p_private_email       text default null,
  p_private_phone       text default null,
  p_street              text default null,
  p_postal_code         text default null,
  p_city                text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_person_id   uuid;
  v_location_id uuid;
  v_given       text;
  v_family      text;
  v_work_email  text;
  v_work_phone  text;
  v_priv_email  text;
  v_priv_phone  text;
  v_street      text;
  v_postal      text;
  v_city        text;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_given  := btrim(coalesce(p_given_name, ''));
  v_family := btrim(coalesce(p_family_name, ''));

  if v_given = '' or v_family = '' then
    raise exception 'given name and family name are required' using errcode = '22023';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen.
  select sm.id, sm.person_id, sm.primary_location_id, sm.work_email, sm.work_phone
    into v_alt
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  v_person_id := v_alt.person_id;

  if p_primary_location_id is not null then
    select l.id into v_location_id
    from public.locations l
    where l.id = p_primary_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  end if;

  v_work_email := nullif(btrim(coalesce(p_work_email, '')), '');
  v_work_phone := nullif(btrim(coalesce(p_work_phone, '')), '');
  v_priv_email := nullif(btrim(coalesce(p_private_email, '')), '');
  v_priv_phone := nullif(btrim(coalesce(p_private_phone, '')), '');
  v_street     := nullif(btrim(coalesce(p_street, '')), '');
  v_postal     := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city       := nullif(btrim(coalesce(p_city, '')), '');

  -- Identitaetskern
  if exists (
    select 1 from public.persons pe
    where pe.id = v_person_id
      and (pe.given_name is distinct from v_given or pe.family_name is distinct from v_family)
  ) then
    update public.persons
       set given_name = v_given, family_name = v_family
     where id = v_person_id
       and organization_id = v_org;
    v_geaendert := array_append(v_geaendert, 'name');
  end if;

  -- Dienstliche Angaben
  if v_alt.work_email is distinct from v_work_email then
    v_geaendert := array_append(v_geaendert, 'work_email');
  end if;
  if v_alt.work_phone is distinct from v_work_phone then
    v_geaendert := array_append(v_geaendert, 'work_phone');
  end if;
  if v_alt.primary_location_id is distinct from v_location_id then
    v_geaendert := array_append(v_geaendert, 'primary_location_id');
  end if;

  update public.staff_members
     set work_email          = v_work_email,
         work_phone          = v_work_phone,
         primary_location_id = v_location_id
   where id = p_staff_member_id
     and organization_id = v_org;

  -- Privatdaten. Die Zeile kann bei Bestandsdaten fehlen; dann entsteht sie
  -- hier. Beschaeftigtendaten bleiben auf staff_private_details beschraenkt
  -- (PROJECT_PRINCIPLES.md 20).
  if exists (
    select 1 from public.staff_private_details spd
    where spd.staff_member_id = p_staff_member_id
  ) then
    if exists (
      select 1 from public.staff_private_details spd
      where spd.staff_member_id = p_staff_member_id
        and (
          spd.date_of_birth is distinct from p_date_of_birth
          or spd.private_email is distinct from v_priv_email
          or spd.private_phone is distinct from v_priv_phone
          or spd.street        is distinct from v_street
          or spd.postal_code   is distinct from v_postal
          or spd.city          is distinct from v_city
        )
    ) then
      v_geaendert := array_append(v_geaendert, 'private_details');
    end if;

    update public.staff_private_details
       set date_of_birth = p_date_of_birth,
           private_email = v_priv_email,
           private_phone = v_priv_phone,
           street        = v_street,
           postal_code   = v_postal,
           city          = v_city
     where staff_member_id = p_staff_member_id
       and organization_id = v_org;
  else
    insert into public.staff_private_details (
      staff_member_id, organization_id, date_of_birth,
      private_email, private_phone, street, postal_code, city, created_by
    )
    values (
      p_staff_member_id, v_org, p_date_of_birth,
      v_priv_email, v_priv_phone, v_street, v_postal, v_city, v_actor
    );

    if p_date_of_birth is not null or v_priv_email is not null or v_priv_phone is not null
       or v_street is not null or v_postal is not null or v_city is not null then
      v_geaendert := array_append(v_geaendert, 'private_details');
    end if;
  end if;

  -- Kein Unterschied, kein Ereignis. Der Schreibvorgang oben ist dann
  -- wertgleich; ein Auditeintrag wuerde eine Aenderung behaupten, die es nicht
  -- gab (ADR-010).
  if array_length(v_geaendert, 1) is null then
    return p_staff_member_id;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_member.updated', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'changed_fields', to_jsonb(v_geaendert))
  );

  return p_staff_member_id;
end;
$$;

comment on function public.update_staff_member(uuid, text, text, text, text, uuid, date, text, text, text, text, text) is
  'Aendert die Stammdaten eines Mitarbeiterdatensatzes und protokolliert ausschliesslich die Namen der geaenderten Felder (STAFF-001, ADR-010).';

revoke all on function public.update_staff_member(uuid, text, text, text, text, uuid, date, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_staff_member(uuid, text, text, text, text, uuid, date, text, text, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- count_staff_future_appointments
--
-- Wie viele geplante Termine dieser Person liegen noch in der Zukunft. Eigener
-- Lesepfad, damit die Oberflaeche die Rueckfrage stellen kann, ohne die
-- Terminliste selbst auswerten zu muessen - und damit die Zahl im Auditeintrag
-- und in der Rueckfrage aus derselben Quelle stammt.
--
-- Liefert ausschliesslich eine Anzahl, keine Termindetails. Wer die Termine
-- selbst sehen will, liest sie ueber appointment_directory mit der dort
-- geltenden RLS.
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
    and a.status = 'scheduled'
    and a.ends_at > now()
$$;

comment on function app.count_staff_future_appointments(uuid, uuid) is
  'Anzahl noch offener geplanter Termine einer Person. Nur fuer serverseitige Pfade (STAFF-001).';

-- Der Aufrufer gibt die Organisation selbst mit; direkt aufrufbar waere die
-- Funktion damit ein Orakel fuer fremde Mitarbeiter-IDs
-- (PROJECT_PRINCIPLES.md 13).
revoke all on function app.count_staff_future_appointments(uuid, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- set_staff_employment_status
--
-- Deaktivieren und Reaktivieren. Bewusst von der Stammdatenaenderung getrennt:
-- der Vorgang aendert keine Personendaten, sondern nimmt eine Person aus dem
-- laufenden Einsatz beziehungsweise zurueck hinein.
--
-- 'inactive' ist eine ORGANISATORISCHE Markierung. Sie beendet weder ein
-- Beschaeftigungsverhaeltnis im arbeitsrechtlichen Sinn noch einen Zugang: ein
-- vorhandenes Benutzerkonto bleibt unveraendert bestehen und wird durch diesen
-- Vorgang weder gesperrt noch geloescht (ADR-008, ADR-014). Wer sich selbst
-- deaktiviert, sperrt sich deshalb auch nicht aus.
--
-- Rueckfrage statt Sperre bei offenen zukuenftigen Terminen: der erste Versuch
-- wird mit `staff_has_future_appointments` abgewiesen, ohne irgendetwas zu
-- schreiben. Die Oberflaeche zeigt die betroffenen Termine und schickt
-- denselben Vorgang mit p_acknowledge_future_appointments = true erneut. Die
-- Bestaetigung wirkt an genau dieser einen Bedingung; Rolle, Organisation und
-- Zielsatz werden erneut vollstaendig geprueft. Die Termine bleiben in jedem
-- Fall unveraendert stehen - sie werden weder abgesagt noch umgebucht.
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_employment_status(
  p_staff_member_id uuid,
  p_status          text,
  p_acknowledge_future_appointments boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    text;
  v_offen  integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff() then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'unknown employment status' using errcode = '22023';
  end if;

  -- FOR UPDATE ist hier nicht optional: die Sperre steht im Konflikt mit dem
  -- FOR-SHARE-Lock der Terminanlage. Erst danach wird gezaehlt, damit eine
  -- parallel angelegte Terminzuweisung in der Zaehlung enthalten ist.
  select sm.employment_status into v_alt
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  -- Kein Wechsel, kein Vorgang: weder Schreibzugriff noch Auditeintrag.
  if v_alt = p_status then
    return;
  end if;

  if p_status = 'inactive' then
    v_offen := app.count_staff_future_appointments(p_staff_member_id, v_org);

    if v_offen > 0 and not coalesce(p_acknowledge_future_appointments, false) then
      -- Nichts geschrieben, nichts abgesagt, nichts umgebucht.
      raise exception 'staff_has_future_appointments' using errcode = '22023';
    end if;
  end if;

  update public.staff_members
     set employment_status = p_status
   where id = p_staff_member_id
     and organization_id = v_org;

  -- Der neue Status ist hier kein Stammdatum, sondern das Ereignis selbst. Die
  -- Anzahl offener Termine haelt fest, unter welcher Lage die Deaktivierung
  -- bestaetigt wurde. Beides ist Metadatum ohne Personen- oder Patientenbezug
  -- (ADR-010, PROJECT_PRINCIPLES.md 20).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_member.status_changed', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'employment_status', p_status,
      'open_future_appointments', v_offen
    )
  );
end;
$$;

comment on function public.set_staff_employment_status(uuid, text, boolean) is
  'Deaktiviert oder reaktiviert einen Mitarbeiterdatensatz. Fragt bei offenen zukuenftigen Terminen zurueck und aendert diese Termine nie (STAFF-001).';

revoke all on function public.set_staff_employment_status(uuid, text, boolean) from public, anon;
grant execute on function public.set_staff_employment_status(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- list_staff_future_appointments
--
-- Die noch offenen zukuenftigen Termine EINER Person, damit die Rueckfrage vor
-- der Deaktivierung zeigen kann, was zu regeln ist. Ohne diese Sicht bliebe die
-- Warnung eine blosse Zahl, und die Termine waeren praktisch unsichtbar - genau
-- das soll nicht passieren.
--
-- Eigener Lesepfad statt list_appointments: jener begrenzt den Zeitraum auf 31
-- Tage, ein Termin in drei Monaten fiele also aus der Warnung heraus.
--
-- Der Zugriff ist auf die Rolle beschraenkt, die deaktivieren darf. Es werden
-- ausschliesslich organisatorische Angaben geliefert; klinische Inhalte
-- existieren an Terminen ohnehin nicht (PROJECT_PRINCIPLES.md 4.6, 5).
-- -----------------------------------------------------------------------------
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

  if not app.can_manage_staff() then
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
      and a.status = 'scheduled'
      and a.ends_at > now()
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_staff_future_appointments(uuid) is
  'Noch offene zukuenftige Termine einer Person - Grundlage der Rueckfrage vor einer Deaktivierung (STAFF-001).';

revoke all on function public.list_staff_future_appointments(uuid) from public, anon;
grant execute on function public.list_staff_future_appointments(uuid) to authenticated;
