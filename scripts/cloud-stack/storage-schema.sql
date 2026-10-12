-- =============================================================================
-- Grundgeruest des Cloud-Stacks (scripts/cloud-stack.sh), Teil 2 von 2.
--
-- Das Schema storage, wie es die Storage-API von Supabase (supabase/storage)
-- mit ihren eigenen Migrationen anlegt - in dem Umfang, den die Migrationen
-- dieses Repositorys und die Nachbildung der Storage-API im Gateway
-- (scripts/cloud-stack/storage.mjs) brauchen. Laeuft nach GoTrue und vor den
-- Migrationen; die legen ihre Buckets und Policies selbst an.
--
-- Wie bei Supabase:
--   * RLS ist auf buckets und objects eingeschaltet; ohne Policy sieht und
--     schreibt keine Rolle der API etwas (service_role umgeht RLS)
--   * die Rollen der API haben die Tabellenrechte, die Grenze zieht RLS
--   * path_tokens und storage.search() fuer das Auflisten
-- =============================================================================

create schema storage authorization supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  owner_id           text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create unique index bname on storage.buckets (name);

create table storage.objects (
  id               uuid primary key default extensions.gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  owner_id         text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  user_metadata    jsonb
);
create unique index bucketid_objname on storage.objects (bucket_id, name);
create index name_prefix_search on storage.objects (name text_pattern_ops);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;

grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

create function storage.foldername(name text)
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

create function storage.filename(name text)
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

create function storage.extension(name text)
returns text
language plpgsql
immutable
as $$
declare
  _parts text[];
  _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end
$$;

-- Auflisten eines Ordners: Unterordner und Dateien einer Ebene. Laeuft mit
-- den Rechten der aufrufenden Rolle (kein security definer), RLS gilt also
-- wie bei jedem anderen Lesezugriff.
create function storage.search(
  prefix     text,
  bucketname text,
  limits     int default 100,
  levels     int default 1,
  offsets    int default 0,
  search     text default '',
  sortcolumn text default 'name',
  sortorder  text default 'asc'
)
returns table (
  name             text,
  id               uuid,
  updated_at       timestamptz,
  created_at       timestamptz,
  last_accessed_at timestamptz,
  metadata         jsonb
)
language plpgsql
stable
as $$
declare
  v_order_by   text;
  v_sort_order text;
begin
  v_order_by := case
    when sortcolumn in ('name', 'updated_at', 'created_at', 'last_accessed_at') then sortcolumn
    else 'name'
  end;
  v_sort_order := case when lower(sortorder) = 'desc' then 'desc' else 'asc' end;

  return query execute
    'with folders as (
       select path_tokens[$1] as folder
       from storage.objects
       where objects.name ilike $2 || $3 || ''%''
         and bucket_id = $4
         and array_length(objects.path_tokens, 1) <> $1
       group by folder
       order by folder ' || v_sort_order || '
     )
     (select folder as "name", null::uuid as id, null::timestamptz as updated_at,
             null::timestamptz as created_at, null::timestamptz as last_accessed_at,
             null::jsonb as metadata
      from folders)
     union all
     (select path_tokens[$1] as "name", id, updated_at, created_at, last_accessed_at, metadata
      from storage.objects
      where objects.name ilike $2 || $3 || ''%''
        and bucket_id = $4
        and array_length(objects.path_tokens, 1) = $1
      order by ' || quote_ident(v_order_by) || ' ' || v_sort_order || ')
     limit $5
     offset $6'
    using levels, prefix, search, bucketname, limits, offsets;
end
$$;

alter function storage.foldername(text) owner to supabase_storage_admin;
alter function storage.filename(text) owner to supabase_storage_admin;
alter function storage.extension(text) owner to supabase_storage_admin;
alter function storage.search(text, text, int, int, int, text, text, text) owner to supabase_storage_admin;

grant execute on all functions in schema storage to anon, authenticated, service_role;
