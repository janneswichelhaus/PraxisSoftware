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
--   * das Schema storage mit storage.buckets und storage.objects (ADR-017):
--     ohne diese Nachbildung bliebe ausgerechnet der Dateizugriff im
--     wichtigsten Gate der Cloudumgebung ungeprueft
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

-- =============================================================================
-- Schema storage (ADR-017)
--
-- Nachgebildet ist genau das, worauf die Migrationen und ihre Tests sich
-- stuetzen - nicht der Objektspeicher selbst:
--
--   storage.buckets   damit eine Migration ihren privaten Bucket anlegen kann
--   storage.objects   damit die RLS-Policies aus ADR-017 Punkt 11 hier
--                     dieselben sind wie in Supabase und pruefbar werden
--
-- Spaltenauswahl und Typen folgen dem Schema von supabase/storage-api. Wichtig
-- fuer die Tests sind drei Dinge, die dort genauso gelten:
--   * ein Objekt ist ueber (bucket_id, name) eindeutig
--   * metadata traegt 'size' und 'mimetype', die die Storage-API beim Upload
--     selbst setzt - genau deshalb kann die Bestaetigung aus Punkt 7c gegen
--     sie pruefen statt gegen eine Behauptung des Browsers
--   * RLS ist aktiv; ohne Policy laedt und liest niemand
--
-- Was hier NICHT nachgebildet wird und deshalb im Test nicht geprueft werden
-- kann: signierte Verweise, cacheControl, das CDN und die Frage, ob Bytes
-- tatsaechlich geflossen sind. Das ist eine Grenze des Gates, keine Aussage
-- ueber die Anwendung.
-- =============================================================================
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

create unique index if not exists bname on storage.buckets (name);

create table if not exists storage.objects (
  id               uuid primary key default extensions.gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  owner_id         text,
  user_metadata    jsonb
);

create unique index if not exists bucketid_objname on storage.objects (bucket_id, name);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.objects to anon;
grant execute on function storage.foldername(text), storage.filename(text)
  to anon, authenticated, service_role;
