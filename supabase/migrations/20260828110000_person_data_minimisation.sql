-- =============================================================================
-- Datenminimierung: Aufteilung von persons
--
-- Ausgangslage: persons trug Name, Geburtsdatum, Kontakt UND Adresse. Damit
-- konnte jede Praxisrolle - auch das Office - die Privatadresse und das
-- Geburtsdatum von Kolleg:innen lesen, sobald sie persons lesen durfte. Das
-- widerspricht der Datensparsamkeit aus PROJECT_PRINCIPLES.md 3 und 20 und
-- geht ueber das hinaus, was 4.3 dem Office zubilligt.
--
-- Neue Aufteilung:
--   persons                  identitaetskern: nur Name
--   patient_contact_details  Kontakt-/Adressdaten IM PATIENTENKONTEXT
--   staff_members            zusaetzlich dienstliche Erreichbarkeit
--   staff_private_details    Privatdaten von Mitarbeitenden
--
-- Die Satellitentabellen haengen am Rollendatensatz (patient bzw.
-- staff_member), nicht an persons. Die Sichtbarkeit ist damit strukturell an
-- den fachlichen Kontext gebunden.
--
-- Person, Patient, Mitarbeiter und Auth-Account bleiben getrennte Konzepte
-- (ADR-014). Klinische Daten entstehen hier keine.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dienstliche Erreichbarkeit am Mitarbeiterdatensatz
-- -----------------------------------------------------------------------------
alter table public.staff_members
  add column work_email text
    check (work_email is null or work_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add column work_phone text
    check (work_phone is null or length(btrim(work_phone)) between 3 and 40);

comment on column public.staff_members.work_email is
  'Dienstliche Erreichbarkeit. Fuer Praxisrollen sichtbar - im Unterschied zu staff_private_details.';

-- -----------------------------------------------------------------------------
-- patient_contact_details
-- -----------------------------------------------------------------------------
create table public.patient_contact_details (
  patient_id      uuid primary key references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  date_of_birth   date,
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone           text check (phone is null or length(btrim(phone)) between 3 and 40),
  street          text,
  postal_code     text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  city            text,
  created_at      timestamptz not null default now(),
  created_by      uuid
);
comment on table public.patient_contact_details is
  'Kontakt- und Adressdaten im Patientenkontext. Organisatorische Daten, keine klinischen Inhalte. Datenklasse: wie Patientenakte, 10 Jahre nach Behandlungsabschluss (ADR-008).';
create index patient_contact_details_organization_id_idx
  on public.patient_contact_details (organization_id);

-- -----------------------------------------------------------------------------
-- staff_private_details
-- -----------------------------------------------------------------------------
create table public.staff_private_details (
  staff_member_id uuid primary key references public.staff_members (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  date_of_birth   date,
  private_email   text check (private_email is null or private_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  private_phone   text check (private_phone is null or length(btrim(private_phone)) between 3 and 40),
  street          text,
  postal_code     text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  city            text,
  created_at      timestamptz not null default now(),
  created_by      uuid
);
comment on table public.staff_private_details is
  'Privatdaten von Mitarbeitenden. Zugriff ausschliesslich owner und die betroffene Person selbst (PROJECT_PRINCIPLES.md 20). Datenklasse: Beschaeftigtendaten.';
create index staff_private_details_organization_id_idx
  on public.staff_private_details (organization_id);

-- -----------------------------------------------------------------------------
-- Bestandsdaten umziehen
--
-- Bei einer frischen Datenbank ist persons zu diesem Zeitpunkt leer; die
-- Anweisungen sind dann wirkungslos. Der Seed befuellt die neuen Tabellen
-- direkt.
-- -----------------------------------------------------------------------------
insert into public.patient_contact_details
  (patient_id, organization_id, date_of_birth, email, phone, street, postal_code, city)
select p.id, p.organization_id, pe.date_of_birth, pe.email, pe.phone, pe.street, pe.postal_code, pe.city
from public.patients p
join public.persons pe on pe.id = p.person_id;

insert into public.staff_private_details
  (staff_member_id, organization_id, date_of_birth, private_email, private_phone, street, postal_code, city)
select s.id, s.organization_id, pe.date_of_birth, pe.email, pe.phone, pe.street, pe.postal_code, pe.city
from public.staff_members s
join public.persons pe on pe.id = s.person_id;

-- -----------------------------------------------------------------------------
-- persons auf den Identitaetskern reduzieren
-- -----------------------------------------------------------------------------
alter table public.persons
  drop column date_of_birth,
  drop column email,
  drop column phone,
  drop column street,
  drop column postal_code,
  drop column city;

comment on table public.persons is
  'Identitaetskern einer natuerlichen Person: ausschliesslich Name. Kontakt-, Adress- und Geburtsdaten liegen kontextbezogen in patient_contact_details bzw. staff_private_details.';

-- -----------------------------------------------------------------------------
-- Rechte und Policies
-- -----------------------------------------------------------------------------
revoke all on public.patient_contact_details from anon, authenticated;
revoke all on public.staff_private_details  from anon, authenticated;

grant select on public.patient_contact_details to authenticated;
grant select on public.staff_private_details  to authenticated;

alter table public.patient_contact_details enable row level security;
alter table public.staff_private_details   enable row level security;

-- Patientenkontaktdaten: dieselben Rollen wie die Kartei, plus der Patient
-- selbst. Office ist bewusst enthalten - Terminorganisation und Abrechnung
-- brauchen Adresse und Erreichbarkeit (PROJECT_PRINCIPLES.md 4.3).
create policy patient_contact_details_select_scoped
  on public.patient_contact_details for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and exists (
      select 1
      from public.patients p
      where p.id = patient_contact_details.patient_id
        and p.organization_id = app.current_organization_id()
        and (app.can_read_patient_directory() or p.person_id = app.current_person_id())
    )
  );

-- Mitarbeiter-Privatdaten: ausschliesslich owner und die betroffene Person.
-- Therapeut:innen und Teamleitung erhalten hier bewusst nichts; fuer die
-- Einsatzplanung genuegt die dienstliche Erreichbarkeit an staff_members.
create policy staff_private_details_select_owner_or_self
  on public.staff_private_details for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (
      app.has_any_role('owner')
      or exists (
        select 1
        from public.staff_members s
        where s.id = staff_private_details.staff_member_id
          and s.organization_id = app.current_organization_id()
          and s.person_id = app.current_person_id()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Lesesicht fuer die Patientenkartei
--
-- security_invoker: Die Policies der zugrunde liegenden Tabellen gelten fuer
-- die aufrufende Person. Die Sicht buendelt nur, sie erweitert nichts.
-- -----------------------------------------------------------------------------
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
  c.street,
  c.postal_code,
  c.city
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id;

comment on view public.patient_directory is
  'Patientenkartei fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert.';

revoke all on public.patient_directory from anon, authenticated;
grant select on public.patient_directory to authenticated;
