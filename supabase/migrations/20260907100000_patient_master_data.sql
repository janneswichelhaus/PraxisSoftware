-- =============================================================================
-- Erweiterte Patientenstammdaten (PAT-005)
--
-- Die Kartei kannte bisher eine Telefonnummer, eine E-Mail und eine Adresse.
-- Fuer eine Praxis, die ausschliesslich Hausbesuche faehrt, fehlen damit
-- genau die Angaben, an denen ein Besuch scheitert: welche Nummer erreicht die
-- Person unterwegs, wer ist die Einrichtung dahinter, und wie kommt man
-- ueberhaupt an die Wohnungstuer.
--
-- Zwei verschiedene Arten von Angaben entstehen hier, und sie liegen bewusst
-- an zwei Stellen:
--
--   patient_contact_details  weitere ERREICHBARKEIT derselben Person:
--                            Telefon geschaeftlich, Mobil, Telefax, Einrichtung.
--                            Das sind die Kontaktdaten des Patienten selbst.
--
--   patient_care_details     INTERNE organisatorische Angaben der Praxis UEBER
--                            die Versorgung: Zugangshinweis, Besonderheit,
--                            Bemerkung, feste Therapeut:in. Sie stehen in einer
--                            eigenen Tabelle, weil ihre Sichtbarkeit eine andere
--                            ist (siehe unten, ANN-010).
--
-- Die Aufteilung folgt derselben Ueberlegung wie
-- 20260828110000_person_data_minimisation.sql: die Sichtbarkeit wird
-- strukturell an den fachlichen Kontext gebunden, nicht durch Ausblenden im
-- Client (ADR-004).
--
-- Keine klinischen Inhalte. Die Felder sind organisatorisch; die Beschriftung
-- in der Oberflaeche sagt das ausdruecklich, damit dort keine zweite,
-- unversionierte Behandlungsdokumentation entsteht (PROJECT_PRINCIPLES.md 5,
-- ADR-016).
--
-- ANN-010 (docs/decisions/ASSUMPTIONS.md): Datenklasse und Sichtbarkeit der
-- internen organisatorischen Angaben.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Weitere Erreichbarkeit am Kontaktsatz
--
-- phone bleibt unveraendert und bedeutet weiterhin die private Festnetznummer;
-- die Oberflaeche beschriftet es entsprechend. Die Laengenpruefungen sind
-- dieselben wie bei phone, damit sich die Felder nicht auseinander entwickeln.
-- -----------------------------------------------------------------------------
alter table public.patient_contact_details
  add column phone_work text
    check (phone_work is null or length(btrim(phone_work)) between 3 and 40),
  add column phone_mobile text
    check (phone_mobile is null or length(btrim(phone_mobile)) between 3 and 40),
  add column fax text
    check (fax is null or length(btrim(fax)) between 3 and 40),
  add column institution text
    check (institution is null or length(btrim(institution)) between 1 and 200);

comment on column public.patient_contact_details.phone_work is
  'Geschaeftliche Telefonnummer der Person. Erreichbarkeit, keine Beschaeftigtendaten der Praxis.';
comment on column public.patient_contact_details.phone_mobile is
  'Mobilnummer. Im Hausbesuch die Nummer, unter der eine Verspaetung angekuendigt wird.';
comment on column public.patient_contact_details.institution is
  'Einrichtung, in der die Person lebt oder betreut wird (Pflegeheim, betreutes Wohnen). Organisatorisch, kein Rechnungsempfaenger - der kommt mit ABR-003a.';

-- -----------------------------------------------------------------------------
-- patient_care_details
--
-- Interne organisatorische Angaben der Praxis. Sie beschreiben nicht die
-- Person, sondern wie die Praxis ihre Versorgung organisiert.
--
-- ANN-010: Diese Tabelle ist die eine Stelle, an der die Annahme greift.
--   * Datenklasse wie die Patientenakte: 10 Jahre nach Behandlungsabschluss
--     (ADR-008). Die Angaben haengen am Behandlungsverhaeltnis; eine kuerzere
--     Frist waere nur mit eigener Loeschregel haltbar.
--   * Sichtbar ausschliesslich fuer die Rollen der Patientenkartei -
--     ausdruecklich NICHT fuer das Patientenkonto selbst. Ein Zugangshinweis
--     ("Schluessel bei der Nachbarin") und eine interne Bemerkung sind
--     Arbeitsnotizen der Praxis; sie im Portal zu spiegeln waere eine eigene
--     fachliche Entscheidung (PROJECT_PRINCIPLES.md 4.6). Das Auskunftsrecht
--     nach Art. 15 DSGVO bleibt davon unberuehrt und laeuft ueber OPS-006.
--   * Office ist eingeschlossen: Terminorganisation und Anrufe sind genau die
--     Aufgabe, fuer die diese Angaben da sind (4.3).
--
-- Freitext, der niemals in Logs erscheinen darf (ADR-011).
-- -----------------------------------------------------------------------------
create table public.patient_care_details (
  patient_id                        uuid primary key references public.patients (id) on delete cascade,
  organization_id                   uuid not null references public.organizations (id) on delete restrict,
  primary_therapist_staff_member_id uuid references public.staff_members (id) on delete set null,
  home_visit_access_note            text
    check (home_visit_access_note is null or length(btrim(home_visit_access_note)) between 1 and 1000),
  special_note                      text
    check (special_note is null or length(btrim(special_note)) between 1 and 1000),
  remark                            text
    check (remark is null or length(btrim(remark)) between 1 and 2000),
  created_at                        timestamptz not null default now(),
  created_by                        uuid
);

comment on table public.patient_care_details is
  'Interne organisatorische Angaben der Praxis zur Versorgung einer Patientin (PAT-005, ANN-010). Keine klinischen Inhalte. Sichtbar nur fuer die Rollen der Patientenkartei, nicht fuer das Patientenkonto. Datenklasse: wie Patientenakte, 10 Jahre nach Behandlungsabschluss (ADR-008).';
comment on column public.patient_care_details.home_visit_access_note is
  'Zugangshinweis fuer den Hausbesuch: Etage, Klingelname, Schluessel, Hund, Radabstellplatz. Organisatorisch, kein Gesundheitsdatum. Darf nie in Logs erscheinen (ADR-011).';
comment on column public.patient_care_details.special_note is
  'Organisatorische Besonderheit, die vor dem Besuch bekannt sein muss. Klinische Inhalte gehoeren in die Behandlungsdokumentation (PROJECT_PRINCIPLES.md 5).';
comment on column public.patient_care_details.primary_therapist_staff_member_id is
  'Fest zugeordnete behandelnde Person. Organisatorische Vorbelegung, KEINE Zugriffsbeschraenkung - 4.2 bleibt unveraendert.';

create index patient_care_details_organization_id_idx
  on public.patient_care_details (organization_id);
create index patient_care_details_primary_therapist_idx
  on public.patient_care_details (primary_therapist_staff_member_id);

revoke all on public.patient_care_details from anon, authenticated;
grant select on public.patient_care_details to authenticated;

alter table public.patient_care_details enable row level security;

-- ANN-010: Rollenschnitt der internen Angaben. Bewusst ohne den Zweig
-- "eigene Person", den patients_select_scoped und
-- patient_contact_details_select_scoped enthalten.
create policy patient_care_details_select_directory_only
  on public.patient_care_details for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_patient_directory()
    and exists (
      select 1
      from public.patients p
      where p.id = patient_care_details.patient_id
        and p.organization_id = app.current_organization_id()
    )
  );

-- -----------------------------------------------------------------------------
-- Bestandsdaten
--
-- Jeder vorhandene Patient bekommt einen leeren Versorgungssatz, damit die
-- Sicht und die Aenderungsfunktion nicht zwischen "kein Satz" und "leere
-- Felder" unterscheiden muessen. Bei einer frischen Datenbank ist das
-- wirkungslos; der Seed befuellt die Tabelle selbst.
-- -----------------------------------------------------------------------------
insert into public.patient_care_details (patient_id, organization_id)
select p.id, p.organization_id from public.patients p;

-- -----------------------------------------------------------------------------
-- Sicht neu aufbauen
--
-- security_invoker bleibt: die RLS der Basistabellen entscheidet weiterhin,
-- welche Zeilen und welche Spalten Inhalt haben. Fuer ein Patientenkonto
-- liefert der Left Join auf patient_care_details deshalb NULL - die Spalten
-- existieren, tragen aber nichts. Genau das ist die Projektion aus ADR-004:
-- die Datenbank entscheidet, nicht der Client.
--
-- Der Name der festen Therapeut:in kommt aus demselben Join. Auch er
-- unterliegt der RLS auf persons; ein Patientenkonto sieht ihn nicht.
-- -----------------------------------------------------------------------------
drop view public.patient_directory;

create view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.status,
  p.care_started_on,
  pe.given_name,
  pe.family_name,
  c.date_of_birth,
  c.email,
  c.phone,
  c.phone_work,
  c.phone_mobile,
  c.fax,
  c.institution,
  c.street,
  c.house_number,
  c.postal_code,
  c.city,
  cd.primary_therapist_staff_member_id,
  case
    when tp.id is null then null
    else tp.given_name || ' ' || tp.family_name
  end as primary_therapist_name,
  cd.home_visit_access_note,
  cd.special_note,
  cd.remark
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id
left join public.patient_care_details cd on cd.patient_id = p.id
left join public.staff_members tsm on tsm.id = cd.primary_therapist_staff_member_id
left join public.persons tp on tp.id = tsm.person_id;

comment on view public.patient_directory is
  'Patientenkartei fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert - die internen Versorgungsangaben bleiben fuer ein Patientenkonto leer (PAT-005, ANN-010).';

revoke all on public.patient_directory from anon, authenticated;
grant select on public.patient_directory to authenticated;

-- -----------------------------------------------------------------------------
-- create_patient / update_patient
--
-- Beide Funktionen bekommen die neuen Felder. Die alten Signaturen werden
-- ausdruecklich entfernt: zwei Ueberladungen gleichen Namens waeren fuer
-- PostgREST mehrdeutig und die Anwendung wuerde die falsche treffen.
--
-- Die feste Therapeut:in wird als staff_member_id uebergeben und
-- serverseitig gegen die eigene Organisation geprueft. Eine fremde ID wird
-- abgewiesen, ohne zu verraten, ob sie existiert (PROJECT_PRINCIPLES.md 13).
-- -----------------------------------------------------------------------------
drop function public.create_patient(text, text, date, text, text, text, text, text, text);
drop function public.update_patient(uuid, text, text, date, text, text, text, text, text, text);

-- Pruefung der festen Therapeut:in. Eigene Funktion, weil beide Schreibpfade
-- sie brauchen und eine Abweichung sonst unbemerkt bliebe.
create or replace function app.assert_staff_member_in_org(
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_staff_member_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = p_organization_id
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function app.assert_staff_member_in_org(uuid, uuid) is
  'Prueft, dass eine Mitarbeiter-ID zur uebergebenen Organisation gehoert. Eine fremde und eine unbekannte ID sind nicht zu unterscheiden (PROJECT_PRINCIPLES.md 13).';

revoke all on function app.assert_staff_member_in_org(uuid, uuid) from public, anon, authenticated;

create function public.create_patient(
  p_given_name          text,
  p_family_name         text,
  p_date_of_birth       date,
  p_email               text default null,
  p_phone               text default null,
  p_street              text default null,
  p_house_number        text default null,
  p_postal_code         text default null,
  p_city                text default null,
  p_phone_work          text default null,
  p_phone_mobile        text default null,
  p_fax                 text default null,
  p_institution         text default null,
  p_primary_therapist_staff_member_id uuid default null,
  p_home_visit_access_note text default null,
  p_special_note        text default null,
  p_remark              text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_person_id  uuid;
  v_patient_id uuid;
  v_given      text;
  v_family     text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_create_patient() then
    raise exception 'not allowed to create patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create patients' using errcode = '42501';
  end if;

  -- Eingaben serverseitig normalisieren. Die Pruefung im Client ist
  -- Bedienkomfort, keine Zusicherung (ADR-004).
  v_given  := nullif(btrim(p_given_name), '');
  v_family := nullif(btrim(p_family_name), '');

  if v_given is null or v_family is null then
    raise exception 'given_name and family_name are required' using errcode = '22023';
  end if;

  if p_date_of_birth is null then
    raise exception 'date_of_birth is required' using errcode = '22023';
  end if;

  if p_date_of_birth > current_date then
    raise exception 'date_of_birth must not be in the future' using errcode = '22023';
  end if;

  perform app.assert_staff_member_in_org(p_primary_therapist_staff_member_id, v_org);

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, v_given, v_family, v_actor)
  returning id into v_person_id;

  insert into public.patients (organization_id, person_id, status, created_by)
  values (v_org, v_person_id, 'active', v_actor)
  returning id into v_patient_id;

  insert into public.patient_contact_details (
    patient_id, organization_id, date_of_birth,
    email, phone, street, house_number, postal_code, city,
    phone_work, phone_mobile, fax, institution, created_by
  )
  values (
    v_patient_id, v_org, p_date_of_birth,
    nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_street), ''),
    nullif(btrim(p_house_number), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_phone_work), ''),
    nullif(btrim(p_phone_mobile), ''),
    nullif(btrim(p_fax), ''),
    nullif(btrim(p_institution), ''),
    v_actor
  );

  insert into public.patient_care_details (
    patient_id, organization_id, primary_therapist_staff_member_id,
    home_visit_access_note, special_note, remark, created_by
  )
  values (
    v_patient_id, v_org, p_primary_therapist_staff_member_id,
    nullif(btrim(p_home_visit_access_note), ''),
    nullif(btrim(p_special_note), ''),
    nullif(btrim(p_remark), ''),
    v_actor
  );

  -- Auditeintrag ohne Stammdaten: nur Akteur, Organisation, Patientenbezug,
  -- Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.created', 'patient', v_patient_id, 'success',
    jsonb_build_object('surface', 'web')
  );

  return v_patient_id;
end;
$$;

comment on function public.create_patient(text, text, date, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text) is
  'Legt Person, Patient, Kontaktdaten und Versorgungsangaben atomar an und protokolliert patient.created (PAT-001, PAT-005, ADR-010).';

revoke all on function public.create_patient(text, text, date, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text)
  from public, anon;
grant execute on function public.create_patient(text, text, date, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text)
  to authenticated;

create function public.update_patient(
  p_patient_id    uuid,
  p_given_name    text,
  p_family_name   text,
  p_date_of_birth date,
  p_email         text default null,
  p_phone         text default null,
  p_street        text default null,
  p_house_number  text default null,
  p_postal_code   text default null,
  p_city          text default null,
  p_phone_work    text default null,
  p_phone_mobile  text default null,
  p_fax           text default null,
  p_institution   text default null,
  p_primary_therapist_staff_member_id uuid default null,
  p_home_visit_access_note text default null,
  p_special_note  text default null,
  p_remark        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor          uuid;
  v_org            uuid;
  v_person_id      uuid;
  v_given          text;
  v_family         text;
  v_email          text;
  v_phone          text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_phone_work     text;
  v_phone_mobile   text;
  v_fax            text;
  v_institution    text;
  v_zugang         text;
  v_besonderheit   text;
  v_bemerkung      text;
  v_alt_given      text;
  v_alt_family     text;
  v_alt_dob        date;
  v_alt_email      text;
  v_alt_phone      text;
  v_alt_street     text;
  v_alt_house      text;
  v_alt_postal     text;
  v_alt_city       text;
  v_alt_work       text;
  v_alt_mobile     text;
  v_alt_fax        text;
  v_alt_inst       text;
  v_alt_therapist  uuid;
  v_alt_zugang     text;
  v_alt_besonder   text;
  v_alt_bemerkung  text;
  v_hat_kontakt    boolean;
  v_hat_versorgung boolean;
  v_geaendert      text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  -- Eingaben serverseitig normalisieren. Die Pruefung im Client ist
  -- Bedienkomfort, keine Zusicherung (ADR-004).
  v_given        := nullif(btrim(p_given_name), '');
  v_family       := nullif(btrim(p_family_name), '');
  v_email        := nullif(btrim(p_email), '');
  v_phone        := nullif(btrim(p_phone), '');
  v_street       := nullif(btrim(p_street), '');
  v_house        := nullif(btrim(p_house_number), '');
  v_postal       := nullif(btrim(p_postal_code), '');
  v_city         := nullif(btrim(p_city), '');
  v_phone_work   := nullif(btrim(p_phone_work), '');
  v_phone_mobile := nullif(btrim(p_phone_mobile), '');
  v_fax          := nullif(btrim(p_fax), '');
  v_institution  := nullif(btrim(p_institution), '');
  v_zugang       := nullif(btrim(p_home_visit_access_note), '');
  v_besonderheit := nullif(btrim(p_special_note), '');
  v_bemerkung    := nullif(btrim(p_remark), '');

  if v_given is null or v_family is null then
    raise exception 'given_name and family_name are required' using errcode = '22023';
  end if;

  if p_date_of_birth is null then
    raise exception 'date_of_birth is required' using errcode = '22023';
  end if;

  if p_date_of_birth > current_date then
    raise exception 'date_of_birth must not be in the future' using errcode = '22023';
  end if;

  -- Zielpatient ausschliesslich in der Organisation des Aufrufers suchen. Ein
  -- Patient einer fremden Praxis wird damit nicht gefunden und ist von einer
  -- unbekannten ID nicht zu unterscheiden.
  select p.person_id, pe.given_name, pe.family_name
    into v_person_id, v_alt_given, v_alt_family
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Erst nach der Existenzpruefung: eine fremde Mitarbeiter-ID darf nicht
  -- verraten, ob der Patient existiert - und umgekehrt.
  perform app.assert_staff_member_in_org(p_primary_therapist_staff_member_id, v_org);

  select c.date_of_birth, c.email, c.phone, c.street, c.house_number,
         c.postal_code, c.city, c.phone_work, c.phone_mobile, c.fax, c.institution
    into v_alt_dob, v_alt_email, v_alt_phone, v_alt_street, v_alt_house,
         v_alt_postal, v_alt_city, v_alt_work, v_alt_mobile, v_alt_fax, v_alt_inst
  from public.patient_contact_details c
  where c.patient_id = p_patient_id;
  v_hat_kontakt := found;

  select cd.primary_therapist_staff_member_id, cd.home_visit_access_note,
         cd.special_note, cd.remark
    into v_alt_therapist, v_alt_zugang, v_alt_besonder, v_alt_bemerkung
  from public.patient_care_details cd
  where cd.patient_id = p_patient_id;
  v_hat_versorgung := found;

  -- Nur die NAMEN der tatsaechlich geaenderten Felder werden spaeter
  -- protokolliert - niemals alte oder neue Werte (ADR-010, ADR-011).
  if v_alt_given  is distinct from v_given  then v_geaendert := array_append(v_geaendert, 'given_name');    end if;
  if v_alt_family is distinct from v_family then v_geaendert := array_append(v_geaendert, 'family_name');   end if;
  if v_alt_dob    is distinct from p_date_of_birth then v_geaendert := array_append(v_geaendert, 'date_of_birth'); end if;
  if v_alt_email  is distinct from v_email  then v_geaendert := array_append(v_geaendert, 'email');         end if;
  if v_alt_phone  is distinct from v_phone  then v_geaendert := array_append(v_geaendert, 'phone');         end if;
  if v_alt_street is distinct from v_street then v_geaendert := array_append(v_geaendert, 'street');        end if;
  if v_alt_house  is distinct from v_house  then v_geaendert := array_append(v_geaendert, 'house_number');  end if;
  if v_alt_postal is distinct from v_postal then v_geaendert := array_append(v_geaendert, 'postal_code');   end if;
  if v_alt_city   is distinct from v_city   then v_geaendert := array_append(v_geaendert, 'city');          end if;
  if v_alt_work   is distinct from v_phone_work   then v_geaendert := array_append(v_geaendert, 'phone_work');   end if;
  if v_alt_mobile is distinct from v_phone_mobile then v_geaendert := array_append(v_geaendert, 'phone_mobile'); end if;
  if v_alt_fax    is distinct from v_fax          then v_geaendert := array_append(v_geaendert, 'fax');          end if;
  if v_alt_inst   is distinct from v_institution  then v_geaendert := array_append(v_geaendert, 'institution');  end if;
  if v_alt_therapist is distinct from p_primary_therapist_staff_member_id
    then v_geaendert := array_append(v_geaendert, 'primary_therapist_staff_member_id'); end if;
  if v_alt_zugang    is distinct from v_zugang       then v_geaendert := array_append(v_geaendert, 'home_visit_access_note'); end if;
  if v_alt_besonder  is distinct from v_besonderheit then v_geaendert := array_append(v_geaendert, 'special_note');           end if;
  if v_alt_bemerkung is distinct from v_bemerkung    then v_geaendert := array_append(v_geaendert, 'remark');                 end if;

  -- Ein Absenden ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if array_length(v_geaendert, 1) is null then
    return p_patient_id;
  end if;

  update public.persons
     set given_name = v_given,
         family_name = v_family
   where id = v_person_id;

  if v_hat_kontakt then
    update public.patient_contact_details
       set date_of_birth = p_date_of_birth,
           email         = v_email,
           phone         = v_phone,
           street        = v_street,
           house_number  = v_house,
           postal_code   = v_postal,
           city          = v_city,
           phone_work    = v_phone_work,
           phone_mobile  = v_phone_mobile,
           fax           = v_fax,
           institution   = v_institution
     where patient_id = p_patient_id;
  else
    -- Bestandsdaten ohne Kontaktsatz: der Satz entsteht mit der ersten
    -- Aenderung, in der Organisation des Patienten.
    insert into public.patient_contact_details (
      patient_id, organization_id, date_of_birth,
      email, phone, street, house_number, postal_code, city,
      phone_work, phone_mobile, fax, institution, created_by
    )
    values (
      p_patient_id, v_org, p_date_of_birth,
      v_email, v_phone, v_street, v_house, v_postal, v_city,
      v_phone_work, v_phone_mobile, v_fax, v_institution, v_actor
    );
  end if;

  if v_hat_versorgung then
    update public.patient_care_details
       set primary_therapist_staff_member_id = p_primary_therapist_staff_member_id,
           home_visit_access_note            = v_zugang,
           special_note                      = v_besonderheit,
           remark                            = v_bemerkung
     where patient_id = p_patient_id;
  else
    insert into public.patient_care_details (
      patient_id, organization_id, primary_therapist_staff_member_id,
      home_visit_access_note, special_note, remark, created_by
    )
    values (
      p_patient_id, v_org, p_primary_therapist_staff_member_id,
      v_zugang, v_besonderheit, v_bemerkung, v_actor
    );
  end if;

  -- Auditeintrag ohne Stammdaten: Akteur, Organisation, Patientenbezug,
  -- Zeitpunkt, Ergebnis und die Feldnamen als Metadatum (ADR-010). Die NAMEN
  -- der neuen Freitextfelder sind unbedenklich, ihre Inhalte waeren es nicht
  -- (ADR-011).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.updated', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'changed_fields', to_jsonb(v_geaendert))
  );

  return p_patient_id;
end;
$$;

comment on function public.update_patient(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text) is
  'Aendert Person, Kontaktdaten und Versorgungsangaben eines Patienten atomar und protokolliert patient.updated mit den geaenderten Feldnamen (PAT-002, PAT-005, ADR-010).';

revoke all on function public.update_patient(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text)
  from public, anon;
grant execute on function public.update_patient(uuid, text, text, date, text, text, text, text, text, text, text, text, text, text, uuid, text, text, text)
  to authenticated;
