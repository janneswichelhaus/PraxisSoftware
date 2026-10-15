-- =============================================================================
-- FLT-002 (FLT-EPIC-001): Fotos am Rad
--
-- Jannes, 2026-10-08 (Handoff Lastenrad 3D, Abschnitt 0): "Fotos haengen an
-- der markierten Stelle; fuer alles andere gibt es 'Weitere Fotos'." Ein Foto
-- zeigt einen Gegenstand, nie eine Person (Abschnitt 6).
--
-- EIGENER BEREICH, DERSELBE WEG (ANN-547): ADR-017 regelt Dateien zu
-- Patient:innen. Fotos am Rad sind keine - sie folgen den Abschnitten A bis F
-- sinngemaess, wie die Anhaenge an Rueckfragen (ADR-017 Punkt 60): eigene
-- Datenklasse, eigener Bucket, eigene Tabelle, zwei Phasen mit Bestaetigung,
-- unveraenderlich, Pruefsumme, Bezugsdatensatz, einmalige Lesefreigabe,
-- Loeschauftrag, Abgleich und die Pruefung am Server mit demselben Schalter.
--
--   public.fleet_photos                 ein Foto an einer Stelle oder an einem
--                                       Check-Up ("Weitere Fotos")
--   public.fleet_photo_access_grants    einmalige Lesefreigabe (ANN-052)
--   public.prepare_fleet_photo_upload   Phase (a)
--   public.confirm_fleet_photo_upload   Phase (c)
--   public.discard_fleet_photo_upload   Rueckweg nach einem Abbruch
--   public.issue_fleet_photo_link       Ansehen, gegen eine Freigabe
--   public.delete_fleet_photo           Loeschen (aufnehmende Person am selben
--                                       Tag, owner immer)
--
-- WER: Hochladen nur zum eigenen Check-Up oder zur eigenen Panne, binnen 24
-- Stunden nach der Meldung (die Fotos folgen der Meldung). Ansehen jede
-- Praxisrolle der Behandlung (app.can_read_fleet). Loeschen die aufnehmende
-- Person am Tag der Aufnahme - etwa wenn doch eine Person im Bild ist - und
-- owner jederzeit.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer hochgeladen hat, steht an
-- der Zeile; wer geloescht hat, am Loeschauftrag (ordered_by).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bucket und Konstanten - je eine Stelle
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('radflotte', 'radflotte', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create function app.fleet_photo_bucket()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'radflotte'::text
$$;

comment on function app.fleet_photo_bucket() is
  'FLT-002 (ANN-547): Name des privaten Buckets der Fotos am Rad. Die einzige Stelle, an der er steht.';

-- Hoechstens vier Fotos je Stelle und je Check-Up.
create function app.fleet_photo_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 4
$$;

revoke all on function app.fleet_photo_bucket() from public, anon;
grant execute on function app.fleet_photo_bucket() to authenticated;
revoke all on function app.fleet_photo_limit() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Tabelle
--
-- Kein Tabellenrecht, keine Policy: erreichbar nur ueber die Funktionen.
-- Unveraenderlich bis auf Zustand und Pruefung (ADR-017 Punkt 8).
-- -----------------------------------------------------------------------------
create table public.fleet_photos (
  id                        uuid primary key default extensions.gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  bike_id                   uuid not null,
  -- Bezugsdatensatz (ADR-017 Punkt 10): eine Stelle oder ein Check-Up.
  spot_id                   uuid,
  checkup_id                uuid,
  mime_type                 text not null check (mime_type = 'image/jpeg'),
  byte_size                 bigint not null check (byte_size > 0 and byte_size <= 10485760),
  checksum_sha256           text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status                    text not null default 'pending' check (status in ('pending', 'ready')),
  confirmation_requested_at timestamptz,
  confirmed_at              timestamptz,
  verified_at               timestamptz,
  created_by                uuid not null,
  created_at                timestamptz not null default now(),

  -- ADR-017 Punkt 5: nur Kennungen, generiert.
  object_key                text not null generated always as (
                              organization_id::text || '/' || coalesce(spot_id, checkup_id)::text
                                || '/' || id::text
                            ) stored,

  constraint fleet_photos_bike_fk
    foreign key (bike_id, organization_id)
    references public.fleet_bikes (id, organization_id) on delete cascade,
  constraint fleet_photos_spot_fk
    foreign key (spot_id, organization_id)
    references public.fleet_spots (id, organization_id) on delete cascade,
  constraint fleet_photos_checkup_fk
    foreign key (checkup_id, organization_id)
    references public.fleet_checkups (id, organization_id) on delete cascade,
  constraint fleet_photos_one_reference check ((spot_id is null) <> (checkup_id is null)),
  constraint fleet_photos_ready_confirmed check ((status = 'ready') = (confirmed_at is not null))
);

comment on table public.fleet_photos is
  'FLT-002 (ANN-547): Foto an einer Stelle am Rad oder an einem Check-Up ("Weitere Fotos"). Nur Gegenstaende, nie Personen. Datenklasse radflotte_ereignis, faellt mit Stelle oder Check-Up (cascade) und hinterlaesst einen Loeschauftrag fuer das Objekt (ADR-017 Punkt 25). Kein Tabellenrecht.';
comment on column public.fleet_photos.checksum_sha256 is
  'SHA-256 der abgelegten Bytes, im Browser gerechnet; zum Nachweis des Servers erst mit verified_at (ADR-017 Punkte 9 und 49).';

create unique index fleet_photos_object_key_idx on public.fleet_photos (object_key);
create index fleet_photos_spot_idx on public.fleet_photos (spot_id) where spot_id is not null;
create index fleet_photos_checkup_idx on public.fleet_photos (checkup_id) where checkup_id is not null;
create index fleet_photos_bike_idx on public.fleet_photos (bike_id);

alter table public.fleet_photos enable row level security;
revoke all on public.fleet_photos from public, anon, authenticated;

create function app.fleet_photos_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Was eine Datei ist, aendert sich nicht (ADR-017 Punkt 8): nur Zustand und
  -- Pruefung. Der Objektschluessel ist generiert und im BEFORE-Trigger leer.
  if (to_jsonb(new) - array['status', 'confirmation_requested_at', 'confirmed_at', 'verified_at',
                            'object_key'])
     is distinct from
     (to_jsonb(old) - array['status', 'confirmation_requested_at', 'confirmed_at', 'verified_at',
                            'object_key']) then
    raise exception 'fleet photos are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger fleet_photos_guard
  before update on public.fleet_photos
  for each row execute function app.fleet_photos_guard();

-- Jede geloeschte Zeile hinterlaesst einen Loeschauftrag fuer ihr Objekt - auf
-- jedem Weg, auch ueber die Kaskade von Stelle, Check-Up oder Rad.
create function app.order_fleet_photo_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = app.fleet_photo_bucket() and o.name = old.object_key
  ) then
    insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
    values (old.organization_id, app.fleet_photo_bucket(), old.object_key)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

create trigger fleet_photos_order_object_deletion
  after delete on public.fleet_photos
  for each row execute function app.order_fleet_photo_object_deletion();

-- -----------------------------------------------------------------------------
-- 3. Einmalige Lesefreigaben (ANN-052) - eine eigene Tabelle, weil die der
--    Akte an Datei oder Loeschauftrag haengt.
-- -----------------------------------------------------------------------------
create table public.fleet_photo_access_grants (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null,
  photo_id        uuid not null references public.fleet_photos (id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint fleet_photo_access_grants_short_lived check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  )
);

comment on table public.fleet_photo_access_grants is
  'FLT-002: einmalige, personengebundene Freigabe fuer genau einen Verweis auf ein Foto am Rad (ANN-052). Verbraucht beim ersten Zugriff, verfaellt nach 30 Sekunden. Keine Schluessel, keine Namen.';

create index fleet_photo_access_grants_photo_idx on public.fleet_photo_access_grants (photo_id);
create index fleet_photo_access_grants_expiry_idx
  on public.fleet_photo_access_grants (organization_id, expires_at);

alter table public.fleet_photo_access_grants enable row level security;
revoke all on public.fleet_photo_access_grants from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Datenklasse (ADR-008): mit dem Bezugsdatensatz
-- -----------------------------------------------------------------------------
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('fleet_photos', 'radflotte_ereignis', 'ueber_elterndatensatz',
   'Fotos am Rad (FLT-002): fallen mit ihrer Stelle oder ihrem Check-Up (cascade) und damit nach deren Frist (ANN-546); das Objekt folgt ueber den Loeschauftrag (ADR-017 Punkt 25).',
   221),
  ('fleet_photo_access_grants', 'radflotte_ereignis', 'ueber_elterndatensatz',
   'Einmalige Lesefreigabe an einem Foto am Rad (ANN-052): beim ersten Zugriff verbraucht, nach 30 Sekunden verfallen; faellt spaetestens mit dem Foto (cascade).',
   222);

-- -----------------------------------------------------------------------------
-- 5. Hochladen - Phase (a), (c) und der Rueckweg (ADR-017 Punkt 7)
-- -----------------------------------------------------------------------------
create function public.prepare_fleet_photo_upload(
  p_spot_id         uuid,
  p_checkup_id      uuid,
  p_byte_size       bigint,
  p_checksum_sha256 text
)
returns table (photo_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_bike    uuid;
  v_von     uuid;
  v_am      timestamptz;
  v_offen   boolean := true;
  v_id      uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  if (p_spot_id is null) = (p_checkup_id is null) then
    raise exception 'photo needs exactly one reference' using errcode = '22023';
  end if;

  -- Der Bezug ist gesperrt, damit die Zahl auch gleichzeitig stimmt.
  if p_spot_id is not null then
    select s.bike_id, s.created_by, s.created_at, s.resolved_at is null
      into v_bike, v_von, v_am, v_offen
    from public.fleet_spots s
    where s.id = p_spot_id and s.organization_id = v_org
    for update;
  else
    select c.bike_id, c.checked_by, c.checked_at
      into v_bike, v_von, v_am
    from public.fleet_checkups c
    where c.id = p_checkup_id and c.organization_id = v_org
    for update;
  end if;
  -- Fremd, alt, erledigt, an einem ausgemusterten Rad oder nicht vorhanden
  -- sehen gleich aus.
  if v_bike is null or v_von <> auth.uid() or v_am <= now() - interval '24 hours'
     or not v_offen
     or not exists (
       select 1 from public.fleet_bikes b where b.id = v_bike and b.archived_at is null
     ) then
    raise exception 'reference not found' using errcode = 'P0002';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;
  if (select count(*) from public.fleet_photos f
       where f.spot_id is not distinct from p_spot_id
         and f.checkup_id is not distinct from p_checkup_id)
     >= app.fleet_photo_limit() then
    raise exception 'too many photos' using errcode = '23514';
  end if;

  insert into public.fleet_photos (
    organization_id, bike_id, spot_id, checkup_id, mime_type, byte_size, checksum_sha256, created_by
  )
  values (
    v_org, v_bike, p_spot_id, p_checkup_id, 'image/jpeg', p_byte_size, p_checksum_sha256, auth.uid()
  )
  returning id into v_id;

  return query
    select f.id, app.fleet_photo_bucket(), f.object_key
    from public.fleet_photos f where f.id = v_id;
end;
$$;

revoke all on function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text) to authenticated;

comment on function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text) is
  'FLT-002 (ANN-547, ADR-017 Punkt 7a): Phase (a) - Foto zur eigenen Stelle oder zum eigenen Check-Up, binnen 24 Stunden, hoechstens vier je Bezug, nur JPEG; liefert den Objektschluessel, bevor Bytes fliessen.';

-- Die eigene vorbereitete Zeile des Kontos.
create function app.own_pending_fleet_photo(p_photo_id uuid)
returns public.fleet_photos
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_foto public.fleet_photos%rowtype;
begin
  select f.* into v_foto
  from public.fleet_photos f
  where f.id = p_photo_id
    and f.organization_id = app.current_organization_id()
    and f.created_by = auth.uid()
    and f.status = 'pending'
    and f.confirmation_requested_at is null;
  if v_foto.id is null then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;
  return v_foto;
end;
$$;

revoke all on function app.own_pending_fleet_photo(uuid) from public, anon, authenticated;

create function public.confirm_fleet_photo_upload(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto     public.fleet_photos%rowtype;
  v_metadata jsonb;
begin
  perform app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  v_foto := app.own_pending_fleet_photo(p_photo_id);
  perform 1 from public.fleet_photos f where f.id = v_foto.id for update;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.fleet_photo_bucket() and o.name = v_foto.object_key;
  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'size', '')::bigint is distinct from v_foto.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'mimetype', '') is distinct from v_foto.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  -- ADR-017 Punkt 51: Ist die Pruefung am Server scharf, wird das Foto erst
  -- mit ihrem Ergebnis ready - derselbe Schalter wie fuer die Akte.
  if app.patient_file_verification_required() then
    update public.fleet_photos set confirmation_requested_at = now() where id = v_foto.id;
  else
    update public.fleet_photos set status = 'ready', confirmed_at = now() where id = v_foto.id;
  end if;
end;
$$;

revoke all on function public.confirm_fleet_photo_upload(uuid) from public, anon;
grant execute on function public.confirm_fleet_photo_upload(uuid) to authenticated;

comment on function public.confirm_fleet_photo_upload(uuid) is
  'FLT-002 (ADR-017 Punkt 7c): Phase (c) - prueft Groesse und Typ gegen storage.objects; ready, solange die Pruefung am Server nicht scharf ist (Punkt 51).';

create function public.discard_fleet_photo_upload(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto public.fleet_photos%rowtype;
begin
  perform app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  v_foto := app.own_pending_fleet_photo(p_photo_id);
  -- Der Trigger schreibt den Loeschauftrag, falls doch schon ein Objekt liegt.
  delete from public.fleet_photos where id = v_foto.id;
end;
$$;

revoke all on function public.discard_fleet_photo_upload(uuid) from public, anon;
grant execute on function public.discard_fleet_photo_upload(uuid) to authenticated;

comment on function public.discard_fleet_photo_upload(uuid) is
  'FLT-002 (ADR-017 Punkt 7): verwirft die eigene, nicht bestaetigte Zeile nach einem abgebrochenen Upload.';

-- Nach 24 Stunden unbestaetigt: verworfen (ADR-017 Punkt 7). Aufraeumen,
-- keine Frist.
create function public.discard_stale_fleet_photo_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.fleet_photos
   where status = 'pending'
     and created_at < now() - interval '24 hours';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.discard_stale_fleet_photo_uploads() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'discard-stale-fleet-photo-uploads',
      '45 3 * * *',
      'select public.discard_stale_fleet_photo_uploads()'
    );
  else
    raise notice 'pg_cron ist nicht verfuegbar - unbestaetigte Fotos am Rad (FLT-002) werden nicht automatisch verworfen.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Ansehen - gegen eine einmalige Freigabe (ADR-017 Punkt 15, ANN-052)
--
-- Der Objektschluessel verlaesst die Datenbank nur hier. Kein Auditeintrag:
-- ein Foto am Rad ist kein Datum einer Person.
-- -----------------------------------------------------------------------------
create function public.issue_fleet_photo_link(p_photo_id uuid)
returns table (bucket_id text, object_key text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_foto public.fleet_photos%rowtype;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to read the fleet');
  select f.* into v_foto
  from public.fleet_photos f
  where f.id = p_photo_id and f.organization_id = v_org and f.status = 'ready';
  if v_foto.id is null then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;

  delete from public.fleet_photo_access_grants g
   where g.organization_id = v_org and g.expires_at <= now();
  insert into public.fleet_photo_access_grants (organization_id, user_id, photo_id, expires_at)
  values (v_org, auth.uid(), v_foto.id, now() + app.patient_file_access_grant_ttl());

  return query select app.fleet_photo_bucket(), v_foto.object_key, v_foto.mime_type;
end;
$$;

revoke all on function public.issue_fleet_photo_link(uuid) from public, anon;
grant execute on function public.issue_fleet_photo_link(uuid) to authenticated;

comment on function public.issue_fleet_photo_link(uuid) is
  'FLT-002 (ADR-017 Punkt 15, ANN-052): einmalige Freigabe fuer genau einen Verweis auf ein Foto am Rad. Lesen nach app.can_read_fleet(). Kein Auditeintrag.';

-- Die Fotos der Stellen und Check-Ups eines Rads: Kennung, Bezug, Zeitpunkt.
-- Nie der Objektschluessel, nie ein Verweis (Punkt 15: nie fuer eine Liste).
create function public.list_fleet_photos(p_bike_id uuid)
returns table (
  id          uuid,
  spot_id     uuid,
  checkup_id  uuid,
  created_at  timestamptz,
  verified    boolean,
  may_delete  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to read the fleet');
  if not exists (
    select 1 from public.fleet_bikes b where b.id = p_bike_id and b.organization_id = v_org
  ) then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  return query
    select f.id, f.spot_id, f.checkup_id, f.created_at, f.verified_at is not null,
           app.can_delete_fleet_photo(f)
    from public.fleet_photos f
    where f.bike_id = p_bike_id and f.organization_id = v_org and f.status = 'ready'
    order by f.created_at, f.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Loeschen
--
-- Die aufnehmende Person am Tag der Aufnahme (in der Zeitzone der Praxis) -
-- etwa wenn doch eine Person im Bild ist -, owner jederzeit.
-- -----------------------------------------------------------------------------
create function app.can_delete_fleet_photo(p_photo public.fleet_photos)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_manage_fleet()
         or (p_photo.created_by = auth.uid()
             and (p_photo.created_at at time zone o.time_zone)::date
                 = (now() at time zone o.time_zone)::date)
  from public.organizations o
  where o.id = p_photo.organization_id
$$;

revoke all on function app.can_delete_fleet_photo(public.fleet_photos) from public, anon, authenticated;

revoke all on function public.list_fleet_photos(uuid) from public, anon;
grant execute on function public.list_fleet_photos(uuid) to authenticated;

comment on function public.list_fleet_photos(uuid) is
  'FLT-002: die fertigen Fotos eines Rads mit Bezug (Stelle oder Check-Up), Zeitpunkt, Pruefstand und ob die anfragende Person loeschen darf. Kein Objektschluessel, kein Verweis. Lesen nach app.can_read_fleet().';

create function public.delete_fleet_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_foto public.fleet_photos%rowtype;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  select f.* into v_foto
  from public.fleet_photos f
  where f.id = p_photo_id and f.organization_id = v_org and f.status = 'ready'
  for update;
  if v_foto.id is null then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;
  if not app.can_delete_fleet_photo(v_foto) then
    raise exception 'not allowed to delete this photo' using errcode = '42501';
  end if;
  -- Der Trigger schreibt den Loeschauftrag; ordered_by ist dort auth.uid()
  -- (LOG-EPIC-001).
  delete from public.fleet_photos where id = v_foto.id;
end;
$$;

revoke all on function public.delete_fleet_photo(uuid) from public, anon;
grant execute on function public.delete_fleet_photo(uuid) to authenticated;

comment on function public.delete_fleet_photo(uuid) is
  'FLT-002: Foto am Rad loeschen - die aufnehmende Person am Tag der Aufnahme, owner jederzeit. Nachweis am Loeschauftrag (ordered_by).';

-- -----------------------------------------------------------------------------
-- 8. RLS auf storage.objects fuer den neuen Bucket (ADR-017 Punkt 11)
--
-- Hochladen nur zu einer eigenen pending-Zeile; lesen nur gegen eine
-- Freigabe, die dabei verbraucht wird; loeschen nur zu einem offenen
-- Loeschauftrag - dieselben Funktionen wie fuer die Akte. Kein UPDATE.
-- -----------------------------------------------------------------------------
create function app.may_upload_fleet_photo_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fleet_photos f
    where f.object_key = p_object_key
      and f.status = 'pending'
      and f.confirmation_requested_at is null
      and f.created_by = auth.uid()
      and f.organization_id = app.current_organization_id()
      and f.created_at > now() - interval '24 hours'
      and app.can_read_fleet()
  )
$$;

create function app.may_read_fleet_photo_object(p_object_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_grant uuid;
begin
  if v_actor is null or not app.can_read_fleet() then
    return false;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;

  select g.id into v_grant
  from public.fleet_photo_access_grants g
  join public.fleet_photos f on f.id = g.photo_id
  where f.object_key = p_object_key
    and f.status = 'ready'
    and f.organization_id = v_org
    and g.organization_id = v_org
    and g.user_id = v_actor
    and g.expires_at > now()
  order by g.created_at
  limit 1
  for update of g skip locked;

  if v_grant is null then
    return false;
  end if;
  delete from public.fleet_photo_access_grants where id = v_grant;
  return true;
end;
$$;

revoke all on function app.may_upload_fleet_photo_object(text) from public, anon;
revoke all on function app.may_read_fleet_photo_object(text) from public, anon;
grant execute on function app.may_upload_fleet_photo_object(text) to authenticated;
grant execute on function app.may_read_fleet_photo_object(text) to authenticated;

create policy fleet_photos_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = app.fleet_photo_bucket()
    and app.may_upload_fleet_photo_object(name)
  );

create policy fleet_photos_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = app.fleet_photo_bucket()
    and app.may_read_fleet_photo_object(name)
  );

create policy fleet_photos_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = app.fleet_photo_bucket()
    and app.may_delete_storage_object(bucket_id, name)
  );

create policy fleet_photos_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id = app.fleet_photo_bucket()
    and app.may_read_storage_object_for_deletion(bucket_id, name)
  );

-- -----------------------------------------------------------------------------
-- 9. Pruefung am Server (ADR-017 Punkte 49 bis 52) - nur fuer den Dienst
--
-- Dieselbe Edge Function wie fuer Akte und Anhaenge (patient-file-verify),
-- mit `photo_id`. Ein Befund heisst verwerfen (Punkt 52).
-- -----------------------------------------------------------------------------
create function public.fleet_photo_for_verification(p_photo_id uuid, p_user_id uuid)
returns table (
  bucket_id        text,
  object_key       text,
  mime_type        text,
  byte_size        bigint,
  checksum_sha256  text,
  already_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select app.fleet_photo_bucket(), f.object_key, f.mime_type, f.byte_size, f.checksum_sha256,
         f.verified_at is not null
  from public.fleet_photos f
  where f.id = p_photo_id
    and f.created_by = p_user_id
    and f.created_at > now() - interval '24 hours'
    and (f.status = 'ready' or f.confirmation_requested_at is not null)
$$;

create function public.record_fleet_photo_verification(
  p_photo_id        uuid,
  p_content_type_ok boolean,
  p_checksum_ok     boolean,
  p_metadata_ok     boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto public.fleet_photos%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null or p_metadata_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select f.* into v_foto from public.fleet_photos f where f.id = p_photo_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_foto.verified_at is not null then
    return 'already_verified';
  end if;
  if v_foto.status <> 'ready' and v_foto.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;

  if p_content_type_ok and p_checksum_ok and p_metadata_ok then
    update public.fleet_photos
       set verified_at = now(),
           status = 'ready',
           confirmed_at = coalesce(confirmed_at, now())
     where id = p_photo_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heisst verwerfen; der Trigger schreibt den Loeschauftrag.
  delete from public.fleet_photos where id = p_photo_id;
  return 'rejected';
end;
$$;

revoke all on function public.fleet_photo_for_verification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_fleet_photo_verification(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.fleet_photo_for_verification(uuid, uuid) to service_role;
grant execute on function public.record_fleet_photo_verification(uuid, boolean, boolean, boolean)
  to service_role;

comment on function public.record_fleet_photo_verification(uuid, boolean, boolean, boolean) is
  'FLT-002 (ADR-017 Punkte 49 bis 52, ANN-547): Ergebnis der Pruefung am Inhalt - Typ an der Signatur, Pruefsumme, keine Metadaten. Bestanden: geprueft und ready. Befund: verworfen mit Loeschauftrag. Nur fuer den Dienst.';

-- -----------------------------------------------------------------------------
-- 10. Abgleich (ADR-017 Punkt 27): verwaiste Objekte auch im neuen Bucket.
--     Rumpf sonst unveraendert aus 20261026100000_kom_005_message_attachments.sql.
-- -----------------------------------------------------------------------------
create or replace function public.count_orphaned_patient_file_objects()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return null;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  select count(*)
    into v_anzahl
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket(),
                        app.message_attachment_bucket(), app.fleet_photo_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.platform_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.message_attachment_bucket()
    )
    and not exists (
      select 1
      from public.fleet_photos x
      where x.object_key = o.name
        and o.bucket_id = app.fleet_photo_bucket()
    )
    and not exists (
      select 1
      from public.storage_deletion_orders d
      where d.bucket_id = o.bucket_id
        and d.object_key = o.name
        and d.receipted_at is null
    );

  return v_anzahl;
end;
$$;

create or replace function public.order_orphaned_object_deletion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    perform app.record_denied_write(auth.uid(), 'storage_deletion.ordered', 'not allowed to order deletions');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to order deletions' using errcode = '42501';
  end if;

  insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
  select v_org, o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket(),
                        app.message_attachment_bucket(), app.fleet_photo_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.platform_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.message_attachment_bucket()
    )
    and not exists (
      select 1
      from public.fleet_photos x
      where x.object_key = o.name
        and o.bucket_id = app.fleet_photo_bucket()
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
