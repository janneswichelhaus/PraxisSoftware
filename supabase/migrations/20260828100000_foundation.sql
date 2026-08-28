-- =============================================================================
-- Fundament: Organisationen, Standorte, Personen, Mitarbeiter, Patienten,
-- Accounts und Rollen.
--
-- Verbindliche Grundlagen:
--   ADR-003  organization_id / location_id ab der ersten Migration
--   ADR-004  zentraler Policy-Layer + RLS als Defense-in-Depth
--   ADR-008  Retention-/Deletion-Faehigkeit (Datenklasse je Tabelle)
--   ADR-014  UUID-PKs, zeitzonenbewusste Zeitstempel, created_at/created_by,
--            Trennung von Person, Patient/Mitarbeiter und Account,
--            Mehrfachrollen je Benutzer
--
-- Bewusst NICHT enthalten: klinische Dokumentation, Termine, Abrechnung.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Internes Schema fuer Hilfsfunktionen. Wird NICHT ueber die API exponiert.
create schema if not exists app;

-- -----------------------------------------------------------------------------
-- organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default extensions.gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 200),
  created_at  timestamptz not null default now(),
  created_by  uuid
);
comment on table public.organizations is
  'Praxis/Organisation. V1 wird fuer genau eine Organisation betrieben (ADR-003). Datenklasse: Stammdaten, keine gesetzliche Frist.';
comment on column public.organizations.created_by is
  'auth.users.id des handelnden Accounts. Bewusst ohne FK, um Bootstrap-Zyklen zu vermeiden.';

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
create table public.locations (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (length(btrim(name)) between 1 and 200),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (organization_id, name)
);
comment on table public.locations is
  'Standort einer Organisation (ADR-003). Keine Multi-Location-Fachlogik in V1 (ADR-014). Datenklasse: Stammdaten.';
create index locations_organization_id_idx on public.locations (organization_id);

-- -----------------------------------------------------------------------------
-- persons
--   Eine natuerliche Person. Traegt die identifizierenden Stammdaten genau
--   einmal. Patient, Mitarbeiter und Account verweisen darauf (ADR-014).
-- -----------------------------------------------------------------------------
create table public.persons (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  given_name      text not null check (length(btrim(given_name)) between 1 and 100),
  family_name     text not null check (length(btrim(family_name)) between 1 and 100),
  date_of_birth   date,
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone           text check (phone is null or length(btrim(phone)) between 3 and 40),
  street          text,
  postal_code     text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  city            text,
  created_at      timestamptz not null default now(),
  created_by      uuid
);
comment on table public.persons is
  'Natuerliche Person. Traegt identifizierende Stammdaten. Datenklasse: folgt der laengsten Frist der verknuepften Rolle (ADR-008).';
create index persons_organization_id_idx on public.persons (organization_id);

-- -----------------------------------------------------------------------------
-- staff_members
-- -----------------------------------------------------------------------------
create table public.staff_members (
  id                  uuid primary key default extensions.gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  person_id           uuid not null references public.persons (id) on delete restrict,
  primary_location_id uuid references public.locations (id) on delete set null,
  employment_status   text not null default 'active'
                        check (employment_status in ('active', 'inactive')),
  created_at          timestamptz not null default now(),
  created_by          uuid,
  unique (organization_id, person_id)
);
comment on table public.staff_members is
  'Beschaeftigtenrolle einer Person. Beschaeftigtendaten unterliegen zusaetzlich PROJECT_PRINCIPLES.md 20. Datenklasse: Beschaeftigtenstammdaten.';
create index staff_members_organization_id_idx on public.staff_members (organization_id);
create index staff_members_person_id_idx on public.staff_members (person_id);

-- -----------------------------------------------------------------------------
-- patients
--   Bewusst OHNE klinische Felder. Die Akte ist ein eigenes, spaeteres
--   Konzept (PROJECT_PRINCIPLES.md 4.6, 5).
-- -----------------------------------------------------------------------------
create table public.patients (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  person_id       uuid not null references public.persons (id) on delete restrict,
  status          text not null default 'active'
                    check (status in ('active', 'inactive')),
  care_started_on date,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (organization_id, person_id)
);
comment on table public.patients is
  'Patientenrolle einer Person. Enthaelt KEINE klinischen Inhalte. Datenklasse: klinische Patientenakte, 10 Jahre nach Behandlungsabschluss (ADR-008).';
create index patients_organization_id_idx on public.patients (organization_id);
create index patients_person_id_idx on public.patients (person_id);

-- -----------------------------------------------------------------------------
-- user_profiles
--   Abbildung Authentifizierungsaccount -> Person/Organisation.
--   Account und Akte sind getrennte Konzepte (PROJECT_PRINCIPLES.md 4.6,
--   ADR-008): Das Loeschen eines Accounts loescht keine Fachdaten.
-- -----------------------------------------------------------------------------
create table public.user_profiles (
  id              uuid primary key references auth.users (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  person_id       uuid not null references public.persons (id) on delete restrict,
  display_name    text not null check (length(btrim(display_name)) between 1 and 200),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (organization_id, person_id)
);
comment on table public.user_profiles is
  'Zuordnung Authentifizierungsaccount zu Person und Organisation. Datenklasse: Accountdaten, getrennt von aufbewahrungspflichtigen Fachdaten (ADR-008).';
create index user_profiles_organization_id_idx on public.user_profiles (organization_id);
create index user_profiles_person_id_idx on public.user_profiles (person_id);

-- -----------------------------------------------------------------------------
-- roles / user_roles
--   Mehrere Rollen je Benutzer sind Pflicht (ADR-004, ADR-014).
-- -----------------------------------------------------------------------------
create table public.roles (
  key         text primary key check (key ~ '^[a-z_]+$'),
  label       text not null,
  description text not null,
  sort_order  smallint not null default 100
);
comment on table public.roles is
  'Rollenkatalog. Referenzdaten, organisationsuebergreifend. Datenklasse: Konfiguration, kein Personenbezug.';

insert into public.roles (key, label, description, sort_order) values
  ('owner',     'Praxisinhaber',      'Umfassender fachlicher Zugriff (PROJECT_PRINCIPLES.md 4.1). Keine technische Administratorrolle.', 10),
  ('therapist', 'Therapeut:in',       'Zugriff auf alle Patientenakten der eigenen Organisation (PROJECT_PRINCIPLES.md 4.2).',            20),
  ('team_lead', 'Teamleitung',        'Therapeutenrechte plus organisatorische Zusatzrechte (PROJECT_PRINCIPLES.md 4.5).',                30),
  ('office',    'Praxismanagement',   'Organisatorische Daten, kein klinischer Freitext (PROJECT_PRINCIPLES.md 4.3).',                    40),
  ('patient',   'Patient:in',         'Ausschliesslich eigener Patientenkontext (PROJECT_PRINCIPLES.md 4.6).',                            50);

create table public.user_roles (
  id              uuid primary key default extensions.gen_random_uuid(),
  user_id         uuid not null references public.user_profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  role_key        text not null references public.roles (key) on delete restrict,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (user_id, organization_id, role_key)
);
comment on table public.user_roles is
  'Rollenzuweisung. Mehrfachzuweisung ist ausdruecklich vorgesehen (ADR-004). Aenderungen sind auditpflichtig (ADR-010).';
create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_organization_id_idx on public.user_roles (organization_id);
