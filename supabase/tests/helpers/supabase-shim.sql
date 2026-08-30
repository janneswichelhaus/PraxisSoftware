-- =============================================================================
-- Minimaler Supabase-Nachbau fuer Tests gegen eine gewoehnliche PostgreSQL-
-- Instanz.
--
-- Zweck: Migrationen und RLS-Policies gegen eine ECHTE Datenbank pruefen, ohne
-- den vollstaendigen Supabase-Stack (Docker) zu benoetigen. Damit laufen die
-- Berechtigungstests aus ADR-013 auch in CI zuverlaessig.
--
-- Nachgebildet wird ausschliesslich das, worauf die Migrationen sich stuetzen:
--   * die Datenbankrollen anon / authenticated / service_role
--   * das Schema auth mit auth.users
--   * auth.uid() / auth.role() / auth.jwt() mit derselben Semantik wie bei
--     Supabase (Auswertung von request.jwt.claims)
--   * das Schema extensions
--
-- Diese Datei ist AUSSCHLIESSLICH Testinfrastruktur und wird niemals gegen
-- eine Supabase-Instanz eingespielt.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

-- Spaltenauswahl entspricht den von seed.sql verwendeten Feldern von GoTrue.
-- Die Token-Spalten sind NOT NULL mit Default '': seed.sql setzt sie explizit,
-- weil aktuelle GoTrue-Versionen NULL dort nicht mehr akzeptieren.
create table if not exists auth.users (
  instance_id                 uuid,
  id                          uuid primary key,
  aud                         varchar(255),
  role                        varchar(255),
  email                       varchar(255) unique,
  encrypted_password          varchar(255),
  email_confirmed_at          timestamptz,
  raw_app_meta_data           jsonb,
  raw_user_meta_data          jsonb,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now(),
  confirmation_token          varchar(255) not null default '',
  recovery_token              varchar(255) not null default '',
  email_change_token_new      varchar(255) not null default '',
  email_change                varchar(255) not null default '',
  email_change_token_current  varchar(255) not null default '',
  phone_change                text not null default '',
  phone_change_token          varchar(255) not null default '',
  reauthentication_token      varchar(255) not null default ''
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'role', ''), current_setting('role', true))
$$;

grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
