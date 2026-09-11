-- =============================================================================
-- Rechteschnitt der Mitarbeiterverwaltung (STAFF-002a, Entscheidung E10)
--
-- STAFF-001 hat den schreibenden Zugriff auf Mitarbeiterdatensaetze bewusst eng
-- bei `owner` gelassen: fuer Office (4.3 "Mitarbeiterorganisation") und
-- Teamleitung (4.5, ausdruecklich nur MOEGLICHE Zusatzrechte) lag keine
-- Entscheidung vor, und fuer schreibende Vorgaenge gilt 13 ("im Zweifel
-- blockieren").
--
-- Jannes hat E10 am 2026-09-08 dreigeteilt entschieden. Diese Migration setzt
-- die Dreiteilung um und ersetzt app.can_manage_staff() durch drei benannte
-- Funktionen - eine je Bereich, damit eine spaetere Korrektur genau einen
-- Ausdruck aendert und keine Rechtematrix beilaeufig entsteht:
--
--   * STAMMDATEN          -> owner UND office. Woertlich die
--     (Name, dienstliche      "Mitarbeiterorganisation" aus 4.3. Liefe jede
--      Erreichbarkeit,        Adressaenderung ueber den Praxisinhaber, waere er
--      Hauptstandort)         das Nadeloehr - bei Bus-Faktor 1 ein reales
--                             Betriebsrisiko (ADR-012).
--   * BESCHAEFTIGUNGS-    -> nur owner. Der Wechsel nimmt eine Person aus dem
--     STATUS                 laufenden Einsatz und hat arbeitsrechtliche
--                            Wirkung.
--   * ZUGANG UND ROLLEN   -> nur owner. Eine Rolle zu vergeben ist
--                            Berechtigungsvergabe und damit eine
--                            Sicherheitsentscheidung nach ADR-004. Die
--                            Funktion entsteht hier und wird in STAFF-002b
--                            gebraucht.
--
-- `team_lead` erhaelt keinen dieser Bereiche: 4.5 fuehrt "Mitarbeiterplanung"
-- als moegliches Zusatzrecht, 16 sagt im Zweifel restriktiver, und spaeter
-- oeffnen ist billig.
--
-- ABGRENZUNG PRIVATDATEN (ANN-024). E10 nennt bei den Stammdaten "Anschrift"
-- und "Telefon". Die privaten Angaben einer beschaeftigten Person liegen seit
-- 20260828110000 in staff_private_details und sind nach 20 ausschliesslich fuer
-- owner und die betroffene Person selbst lesbar. Office darf sie deshalb auch
-- nicht schreiben: Wer sie nicht lesen darf, bekommt sie im Formular als leere
-- Felder zurueck und wuerde sie beim Speichern ueberschreiben. Ein
-- Schreibrecht ohne Leserecht ist hier also nicht die restriktivere, sondern
-- die datenverlustgefaehrdete Variante. Office schreibt die dienstliche
-- Erreichbarkeit; privat bleibt bei owner.
--
-- Klinische Daten entstehen hier keine.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Die drei Bereiche
-- -----------------------------------------------------------------------------
create or replace function app.can_manage_staff_master_data()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

comment on function app.can_manage_staff_master_data() is
  'Wer Mitarbeiterstammdaten anlegen und aendern darf: owner und office (PROJECT_PRINCIPLES.md 4.1/4.3, E10).';

create or replace function app.can_manage_staff_private_details()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_manage_staff_private_details() is
  'Wer die Privatangaben einer beschaeftigten Person schreiben darf: nur owner - deckungsgleich mit dem Leserecht (PROJECT_PRINCIPLES.md 20, ANN-024).';

create or replace function app.can_manage_staff_employment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_manage_staff_employment() is
  'Wer den Beschaeftigungsstatus wechseln darf: nur owner (E10).';

create or replace function app.can_manage_staff_accounts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_manage_staff_accounts() is
  'Wer Zugaenge einlaedt, Rollen vergibt und Konten sperrt: nur owner. Berechtigungsvergabe ist eine Sicherheitsentscheidung (ADR-004, E10).';

grant execute on function app.can_manage_staff_master_data()     to authenticated;
grant execute on function app.can_manage_staff_private_details() to authenticated;
grant execute on function app.can_manage_staff_employment()      to authenticated;
grant execute on function app.can_manage_staff_accounts()        to authenticated;

-- -----------------------------------------------------------------------------
-- create_staff_member: Stammdaten fuer owner und office
--
-- Unveraendert gegenueber STAFF-001 bis auf zwei Punkte:
--   * die Berechtigungspruefung nutzt app.can_manage_staff_master_data()
--   * Privatangaben darf nur schreiben, wer sie auch lesen darf. Wer das nicht
--     darf und trotzdem welche mitschickt, bekommt einen Fehler statt einer
--     stillen Verwerfung - eine Erfolgsmeldung fuer einen nicht ausgefuehrten
--     Schreibvorgang waere schlimmer als die Ablehnung (13).
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
  v_priv_email  text;
  v_priv_phone  text;
  v_street      text;
  v_postal      text;
  v_city        text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_manage_staff_master_data() then
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

  v_priv_email := nullif(btrim(coalesce(p_private_email, '')), '');
  v_priv_phone := nullif(btrim(coalesce(p_private_phone, '')), '');
  v_street     := nullif(btrim(coalesce(p_street, '')), '');
  v_postal     := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city       := nullif(btrim(coalesce(p_city, '')), '');

  if not app.can_manage_staff_private_details()
     and (p_date_of_birth is not null or v_priv_email is not null or v_priv_phone is not null
          or v_street is not null or v_postal is not null or v_city is not null) then
    raise exception 'private_details_not_allowed' using errcode = '42501';
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
    v_priv_email, v_priv_phone, v_street, v_postal, v_city, v_actor
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
  'Legt Person und Mitarbeiterdatensatz atomar an (owner und office, E10). Privatangaben nur durch owner. Erzeugt KEINEN Zugang und keine Rollen (STAFF-001, STAFF-002a).';

-- -----------------------------------------------------------------------------
-- update_staff_member: Stammdaten fuer owner und office
--
-- Wie STAFF-001, mit derselben Zweiteilung. Wer die Privatangaben nicht
-- verwalten darf, laesst sie unangetastet: seine Parameter MUESSEN null sein,
-- und die gespeicherten Werte bleiben stehen. Genau das ist der Unterschied
-- zum Anlegen - ein Formular ohne Privatfelder wuerde sie sonst beim Speichern
-- leeren, obwohl die Rolle sie nie zu Gesicht bekommen hat (ANN-024).
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
  v_privat      boolean;
  v_alt         record;
  v_geaendert   text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_master_data() then
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

  v_work_email := nullif(btrim(coalesce(p_work_email, '')), '');
  v_work_phone := nullif(btrim(coalesce(p_work_phone, '')), '');
  v_priv_email := nullif(btrim(coalesce(p_private_email, '')), '');
  v_priv_phone := nullif(btrim(coalesce(p_private_phone, '')), '');
  v_street     := nullif(btrim(coalesce(p_street, '')), '');
  v_postal     := nullif(btrim(coalesce(p_postal_code, '')), '');
  v_city       := nullif(btrim(coalesce(p_city, '')), '');

  v_privat := app.can_manage_staff_private_details();

  if not v_privat
     and (p_date_of_birth is not null or v_priv_email is not null or v_priv_phone is not null
          or v_street is not null or v_postal is not null or v_city is not null) then
    raise exception 'private_details_not_allowed' using errcode = '42501';
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

  -- Privatdaten. Nur fuer Rollen, die sie auch lesen duerfen; fuer alle
  -- anderen bleibt die Zeile unberuehrt. Beschaeftigtendaten bleiben auf
  -- staff_private_details beschraenkt (PROJECT_PRINCIPLES.md 20).
  if v_privat then
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
  'Aendert die Stammdaten eines Mitarbeiterdatensatzes (owner und office, E10); Privatangaben nur durch owner. Protokolliert ausschliesslich die Namen der geaenderten Felder (STAFF-001, STAFF-002a, ADR-010).';

-- -----------------------------------------------------------------------------
-- Beschaeftigungsstatus: nur owner
--
-- Beide Funktionen unveraendert bis auf die Berechtigungspruefung.
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

  if not app.can_manage_staff_employment() then
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
  'Deaktiviert oder reaktiviert einen Mitarbeiterdatensatz - nur owner (E10). Fragt bei offenen zukuenftigen Terminen zurueck und aendert diese Termine nie (STAFF-001, STAFF-002a).';

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

  -- Der Lesepfad bleibt an die Rolle gebunden, die deaktivieren darf: er
  -- existiert ausschliesslich fuer die Rueckfrage vor der Deaktivierung.
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
      and a.status = 'scheduled'
      and a.ends_at > now()
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_staff_future_appointments(uuid) is
  'Noch offene zukuenftige Termine einer Person - Grundlage der Rueckfrage vor einer Deaktivierung, nur owner (STAFF-001, STAFF-002a).';

-- -----------------------------------------------------------------------------
-- Die alte Sammelfunktion faellt weg
--
-- Sie war der bewusst enge Platzhalter bis zur Entscheidung E10. Sie bleibt
-- nicht als Alias stehen: ein Name, der drei verschiedene Bereiche
-- zusammenfasst, waere genau die Rechtematrix-Unschaerfe, die STAFF-001
-- vermeiden wollte. Ein spaeterer Aufruf soll am fehlenden Namen scheitern,
-- nicht am falschen Ergebnis.
-- -----------------------------------------------------------------------------
drop function app.can_manage_staff();
