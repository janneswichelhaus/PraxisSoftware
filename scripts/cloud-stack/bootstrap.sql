-- =============================================================================
-- Grundgeruest des Cloud-Stacks (scripts/cloud-stack.sh), Teil 1 von 2.
--
-- Laeuft einmal auf einem frischen Cluster, VOR dem Anmeldedienst (GoTrue)
-- und vor den Migrationen. Nachgebildet ist, was im Supabase-Postgres-Image
-- (supabase/postgres, init-scripts) schon vorhanden ist, bevor
-- `supabase db reset` die Migrationen einspielt:
--
--   * die Rollen anon / authenticated / service_role und authenticator, ueber
--     den PostgREST die Rolle je Anfrage wechselt
--   * supabase_auth_admin (Eigentuemer des Schemas auth, mit dem GoTrue seine
--     eigenen Migrationen einspielt) und supabase_storage_admin
--   * das Schema extensions mit pgcrypto und uuid-ossp
--   * die Standardrechte im Schema public, wie Supabase sie setzt - die
--     Migrationen nehmen sie ausdruecklich zurueck (20260828100100)
--
-- Das Schema auth selbst legt GoTrue an, nicht diese Datei: So steht in auth
-- genau das, was der echte Anmeldedienst erwartet. Der Cluster lauscht nur auf
-- 127.0.0.1 und enthaelt ausschliesslich synthetische Daten
-- (PROJECT_PRINCIPLES.md 3.1).
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

create role supabase_auth_admin login noinherit createrole;
create role supabase_storage_admin login noinherit createrole;
alter role supabase_auth_admin set search_path = auth;
alter role supabase_storage_admin set search_path = storage;

-- Wie bei Supabase: kurze Fristen fuer die Rollen der API.
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';

create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;

-- Buchfuehrung der eingespielten Migrationen, wie die Supabase-CLI sie fuehrt.
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version     text primary key,
  name        text,
  applied_at  timestamptz not null default now()
);
