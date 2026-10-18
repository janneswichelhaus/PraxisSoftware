-- =============================================================================
-- TEAM-003: Anhänge im Teamchat (ADR-017 Fassung 8, Abschnitt M)
--
-- Fotos (JPEG, PNG) und PDF an einer Nachricht, bis zu fünf, je 10 MB, ohne
-- Virenprüfung (ADR-017 Fassung 7). Derselbe Weg wie jede Datei (Punkte 5 bis
-- 27 und 49 bis 55), nach dem Muster der Belege (ERS-001): vor dem Senden
-- hochgeladen und bestätigt (Phase a und c), beim Senden genau einmal an die
-- Nachricht gebunden, unveränderlich, ein Löschauftrag auf jedem Löschweg.
--
-- Ein Anhang fällt mit seiner Nachricht (Punkt 75, ANN-610): mit der Zeile
-- (cascade, Journal der Nachricht) und mit ihrem Inhalt - dafür räumt
-- app.team_message_content_removed jetzt auch die Anhänge ab, auf jedem Weg
-- bis zur Wiederanwendung nach einem Restore. Was 24 Stunden an keiner
-- Nachricht hängt, fällt ohne Journal (wie KOM-005, ANN-652): Es wurde nie
-- gesendet, niemand außer der hochladenden Person kennt es, und gebunden wird
-- nur, was jünger als 24 Stunden ist.
--
--   public.team_message_attachments          Anhänge, Klasse teamchat
--   public.team_attachment_access_grants     einmalige Lesefreigaben (ANN-052)
--   Bucket teamchat                          privat, JPEG/PNG/PDF, 10 MB
--   public.prepare_team_attachment_upload    Phase (a)
--   public.confirm_team_attachment_upload    Phase (c)
--   public.discard_team_attachment           eigenen, nicht gesendeten verwerfen
--   public.discard_stale_team_attachments    täglich (pg_cron)
--   public.issue_team_attachment_link        Lesefreigabe (Punkte 15, 76)
--   public.list_team_channel_attachments     Dateien je Gespräch (Punkt 80)
--   public.post_team_message                 neu mit p_attachments
--   public.edit_team_message                 leerer Text, wo Anhänge sind
--   public.list_team_messages                neu mit attachments
--   Prüfung am Server (Punkte 49 bis 52):    team_attachment_for_verification,
--                                            record_team_attachment_verification
--   Abgleich (Punkt 27):                     count_orphaned_patient_file_objects,
--                                            order_orphaned_object_deletion
--
-- Funktionen, die angemeldete Konten ausführen (Bucket, Speicherregeln), tragen
-- kein „team“ im Namen: app.%team% bleibt ganz entzogen (teamchat-slack.test.ts).
-- Kein Auditeintrag (ADR-010 Punkte 15 bis 17; ADR-017 Punkt 78).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nachricht nur mit Anhängen: der Text darf dann leer sein
-- -----------------------------------------------------------------------------
-- Leer ('') heißt: nur Anhänge. Ohne Inhalt (entfernt, Anker) bleibt null.
alter table public.team_messages drop constraint team_messages_body_check;
alter table public.team_messages
  add constraint team_messages_body_check check (body is null or length(body) <= 4000);

comment on table public.team_messages is
  'TEAM-001, TEAM-003: Nachrichten des Teamchats. Zwölf Monate ab ihrem Tag, dann endgültig gelöscht (ANN-610). Anhänge in team_message_attachments (ADR-017 Abschnitt M); keine klinischen Inhalte (§10: die gehören in die Akte).';
comment on column public.team_messages.body is
  'Text der Nachricht, höchstens 4000 Zeichen. Leer nur, wenn Anhänge daran hängen (TEAM-003); null, wenn der Inhalt fehlt (removed_at).';

-- Ein Text: getrimmt, höchstens 4000 Zeichen, leer nur mit Anhängen (ANN-653) - geprüft
-- vor dem Schreiben, damit keine Prüfregel mit dem Text antwortet (ADR-011).
create function app.team_message_body(p_text text, p_with_attachments boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_text = '' and not coalesce(p_with_attachments, false) then
    raise exception 'message is empty' using errcode = '22023';
  end if;
  if length(v_text) > 4000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.team_message_body(text, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Bucket und Grenzen
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teamchat', 'teamchat', false, 10485760,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create function app.chat_attachment_bucket()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'teamchat'::text
$$;

comment on function app.chat_attachment_bucket() is
  'TEAM-003 (ADR-017 Punkt 73): Name des privaten Buckets der Anhänge im Teamchat - Klasse teamchat. Die einzige Stelle, an der er steht.';

-- Höchstens fünf Anhänge je Nachricht (ADR-017 Punkt 71).
create function app.team_attachment_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 5
$$;

-- Höchstens so viele liegen bei einer Person ungesendet (vier Entwürfe voll).
create function app.team_attachment_open_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20
$$;

revoke all on function app.chat_attachment_bucket() from public, anon;
grant execute on function app.chat_attachment_bucket() to authenticated;
revoke all on function app.team_attachment_limit() from public, anon, authenticated;
revoke all on function app.team_attachment_open_limit() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Tabellen
-- -----------------------------------------------------------------------------
create table public.team_message_attachments (
  id                        uuid primary key default extensions.gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  channel_id                uuid not null references public.team_channels (id) on delete cascade,
  -- Bis zum Senden ohne Nachricht; dann genau einmal an sie gebunden.
  message_id                uuid references public.team_messages (id) on delete cascade,
  position                  smallint check (position >= 1),
  attached_at               timestamptz,
  -- Wer hochlädt - beim Senden dieselbe Person wie die Verfasser:in.
  staff_member_id           uuid references public.staff_members (id) on delete set null,
  display_name              text not null check (
                              length(display_name) between 1 and 120
                              and display_name = btrim(display_name)
                              and display_name !~ '[[:cntrl:]]'
                            ),
  mime_type                 text not null
                              check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
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
                              organization_id::text || '/' || channel_id::text || '/' || id::text
                            ) stored,

  constraint team_message_attachments_attached check (
    (message_id is null) = (attached_at is null)
    and (message_id is null) = (position is null)
    and (message_id is null or status = 'ready')
  ),
  constraint team_message_attachments_ready_confirmed check ((status = 'ready') = (confirmed_at is not null))
);

comment on table public.team_message_attachments is
  'TEAM-003 (ADR-017 Abschnitt M): Foto (JPEG, PNG) oder PDF an einer Nachricht des Teamchats, bis zu fünf je Nachricht. Bis zum Senden ohne Nachricht bei der hochladenden Person (nach 24 Stunden verworfen, ANN-652), danach an der Nachricht und mit ihr in der Klasse teamchat: Sie fällt mit der Zeile (cascade) und mit ihrem Inhalt (app.team_message_content_removed); das Objekt folgt über den Löschauftrag (ADR-017 Punkt 25). Unveränderlich bis auf Zustand, Prüfung und die eine Bindung. Kein Tabellenrecht.';
comment on column public.team_message_attachments.display_name is
  'Anzeigename (Dateiname oder „Foto …“) - steht nur hier, nie im Objektschlüssel, in einer Adresse oder einem Log (ADR-017 Punkt 5, ADR-011).';
comment on column public.team_message_attachments.checksum_sha256 is
  'SHA-256 der abgelegten Bytes, im Browser gerechnet; zum Nachweis des Servers erst mit verified_at (ADR-017 Punkte 9 und 49).';

create unique index team_message_attachments_object_key_idx
  on public.team_message_attachments (object_key);
create unique index team_message_attachments_position_idx
  on public.team_message_attachments (message_id, position) where message_id is not null;
create index team_message_attachments_channel_idx
  on public.team_message_attachments (channel_id);
create index team_message_attachments_staged_idx
  on public.team_message_attachments (staff_member_id, created_at) where message_id is null;

alter table public.team_message_attachments enable row level security;
revoke all on public.team_message_attachments from public, anon, authenticated;

create function app.team_message_attachments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_veraenderlich text[] := array['status', 'confirmation_requested_at', 'confirmed_at',
                                  'verified_at', 'object_key', 'message_id', 'position',
                                  'attached_at', 'staff_member_id'];
begin
  -- Was eine Datei ist, ändert sich nicht (ADR-017 Punkt 8): nur Zustand,
  -- Prüfung und - genau einmal - die Bindung an die Nachricht. Die Person
  -- fällt nur über `on delete set null`. Der Objektschlüssel ist generiert
  -- und im BEFORE-Trigger leer.
  if (to_jsonb(new) - v_veraenderlich) is distinct from (to_jsonb(old) - v_veraenderlich)
     or (new.staff_member_id is not null
         and new.staff_member_id is distinct from old.staff_member_id)
     or (old.message_id is not null
         and (new.message_id, new.position, new.attached_at)
             is distinct from (old.message_id, old.position, old.attached_at)) then
    raise exception 'team attachments are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.team_message_attachments_guard() from public, anon, authenticated;

create trigger team_message_attachments_guard
  before update on public.team_message_attachments
  for each row execute function app.team_message_attachments_guard();

-- Jede gelöschte Zeile hinterlässt einen Löschauftrag für ihr Objekt - auf
-- jedem Weg: Verwerfen, Kaskade von Nachricht und Gespräch, Inhalt entfernt,
-- Löschlauf, Wiederanwendung.
create function app.order_team_attachment_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = app.chat_attachment_bucket() and o.name = old.object_key
  ) then
    insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
    values (old.organization_id, app.chat_attachment_bucket(), old.object_key)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

revoke all on function app.order_team_attachment_object_deletion() from public, anon, authenticated;

create trigger team_message_attachments_order_object_deletion
  after delete on public.team_message_attachments
  for each row execute function app.order_team_attachment_object_deletion();

create table public.team_attachment_access_grants (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null,
  attachment_id   uuid not null references public.team_message_attachments (id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint team_attachment_access_grants_short_lived check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  )
);

comment on table public.team_attachment_access_grants is
  'TEAM-003: einmalige, personengebundene Freigabe für genau einen Verweis auf einen Anhang im Teamchat (ANN-052). Verbraucht beim ersten Zugriff, verfällt nach 30 Sekunden; abgelaufene löscht public.discard_stale_team_attachments täglich. Fällt spätestens mit dem Anhang (cascade).';

create index team_attachment_access_grants_attachment_idx
  on public.team_attachment_access_grants (attachment_id);
create index team_attachment_access_grants_expiry_idx
  on public.team_attachment_access_grants (organization_id, expires_at);

alter table public.team_attachment_access_grants enable row level security;
revoke all on public.team_attachment_access_grants from public, anon, authenticated;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('team_message_attachments', 'teamchat', 'automatisch',
   'Anhänge im Teamchat (TEAM-003, ADR-017 Abschnitt M): fallen mit der Nachricht (cascade) oder ihrem Inhalt - auf jedem Weg mit Löschauftrag für das Objekt; ungesendete nach 24 Stunden (ANN-652).',
   261),
  ('team_attachment_access_grants', 'teamchat', 'ueber_elterndatensatz',
   'Einmalige Lesefreigaben für Anhänge im Teamchat (ANN-052): verbraucht beim ersten Zugriff, abgelaufene täglich gelöscht; fallen mit dem Anhang (cascade).',
   262);

-- -----------------------------------------------------------------------------
-- 4. Fällt der Inhalt einer Nachricht, fallen auch ihre Anhänge
-- -----------------------------------------------------------------------------
-- Eine Stelle für alle Wege: eigenes Löschen mit Antworten, Entfernen durch
-- owner, Frist am Anker (app.strip_due_team_anchors) und die Wiederanwendung
-- nach einem Restore (`team_message_contents`). Die gelöschten Anhänge
-- hinterlassen ihren Löschauftrag über den Trigger oben.
create or replace function app.team_message_content_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.team_message_mentions where message_id = new.id;
  delete from public.team_message_reactions where message_id = new.id;
  delete from public.team_message_pins where message_id = new.id;
  delete from public.team_saved_messages where message_id = new.id;
  delete from public.team_message_attachments where message_id = new.id;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Hochladen - Phase (a), (c) und der Rückweg (ADR-017 Punkt 7)
-- -----------------------------------------------------------------------------
-- Phase (a): ein Anhang für ein Gespräch, das die Person lesen und in das sie
-- schreiben kann. Der Objektschlüssel steht fest, bevor Bytes fließen.
create function public.prepare_team_attachment_upload(
  p_channel         uuid,
  p_mime_type       text,
  p_byte_size       bigint,
  p_checksum_sha256 text,
  p_name            text
)
returns table (attachment_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  -- Die Person ist gesperrt, damit die Zahl auch gleichzeitig stimmt.
  perform 1 from public.staff_members s where s.id = v_staff for no key update;

  perform 1 from public.team_channels c where c.id = p_channel and c.organization_id = v_org for share;
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.team_channels c where c.id = p_channel and c.archived_at is not null) then
    raise exception 'team channel is archived' using errcode = '22023';
  end if;

  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;
  if length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid file name' using errcode = '22023';
  end if;
  if (select count(*) from public.team_message_attachments a
       where a.staff_member_id = v_staff and a.message_id is null
         and a.created_at > now() - interval '24 hours')
     >= app.team_attachment_open_limit() then
    raise exception 'too many unsent attachments' using errcode = '23514';
  end if;

  insert into public.team_message_attachments (
    organization_id, channel_id, staff_member_id, display_name, mime_type, byte_size,
    checksum_sha256, created_by
  )
  values (v_org, p_channel, v_staff, v_name, p_mime_type, p_byte_size, p_checksum_sha256, auth.uid())
  returning id into v_id;

  return query
    select a.id, app.chat_attachment_bucket(), a.object_key
    from public.team_message_attachments a where a.id = v_id;
end;
$$;

revoke all on function public.prepare_team_attachment_upload(uuid, text, bigint, text, text) from public, anon;
grant execute on function public.prepare_team_attachment_upload(uuid, text, bigint, text, text) to authenticated;

comment on function public.prepare_team_attachment_upload(uuid, text, bigint, text, text) is
  'TEAM-003 (ADR-017 Punkte 7a und 71): Phase (a) - ein Anhang für ein lesbares, nicht archiviertes Gespräch, JPEG, PNG oder PDF bis 10 MB, höchstens 20 ungesendet; liefert den Objektschlüssel, bevor Bytes fließen.';

-- Die eigene vorbereitete, noch nicht bestätigte Zeile des Kontos.
create function app.own_pending_team_attachment(p_attachment_id uuid, p_org uuid, p_staff uuid)
returns public.team_message_attachments
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_anhang public.team_message_attachments%rowtype;
begin
  select a.* into v_anhang
  from public.team_message_attachments a
  where a.id = p_attachment_id
    and a.organization_id = p_org
    and a.staff_member_id = p_staff
    and a.created_by = auth.uid()
    and a.message_id is null
    and a.status = 'pending'
    and a.confirmation_requested_at is null
    and a.created_at > now() - interval '24 hours';
  if v_anhang.id is null then
    raise exception 'team attachment not found' using errcode = 'P0002';
  end if;
  return v_anhang;
end;
$$;

revoke all on function app.own_pending_team_attachment(uuid, uuid, uuid) from public, anon, authenticated;

create function public.confirm_team_attachment_upload(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_staff    uuid;
  v_anhang   public.team_message_attachments%rowtype;
  v_metadata jsonb;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_anhang := app.own_pending_team_attachment(p_attachment_id, v_org, v_staff);
  -- Sperren und dabei den Zustand erneut prüfen: Ein gleichzeitig verworfener
  -- oder geprüfter Anhang meldet keinen Erfolg (wie ERS-001).
  perform 1 from public.team_message_attachments a
   where a.id = v_anhang.id and a.status = 'pending' and a.confirmation_requested_at is null
     and a.message_id is null
   for update;
  if not found then
    raise exception 'team attachment not found' using errcode = 'P0002';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.chat_attachment_bucket() and o.name = v_anhang.object_key;
  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'size', '')::bigint is distinct from v_anhang.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'mimetype', '') is distinct from v_anhang.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  -- ADR-017 Punkt 51: Ist die Prüfung am Server scharf, wird der Anhang erst
  -- mit ihrem Ergebnis ready - derselbe Schalter wie für die Akte.
  if app.patient_file_verification_required() then
    update public.team_message_attachments set confirmation_requested_at = now()
     where id = v_anhang.id;
  else
    update public.team_message_attachments set status = 'ready', confirmed_at = now()
     where id = v_anhang.id;
  end if;
end;
$$;

revoke all on function public.confirm_team_attachment_upload(uuid) from public, anon;
grant execute on function public.confirm_team_attachment_upload(uuid) to authenticated;

comment on function public.confirm_team_attachment_upload(uuid) is
  'TEAM-003 (ADR-017 Punkt 7c): Phase (c) - prüft Größe und Typ gegen storage.objects; ready, solange die Prüfung am Server nicht scharf ist (Punkt 51).';

-- Verwirft einen eigenen Anhang, der noch nicht gesendet ist - nach einem
-- abgebrochenen Hochladen oder wenn die Person ihn vor dem Senden entfernt.
create function public.discard_team_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_id    uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  -- Der Trigger schreibt den Löschauftrag, falls schon ein Objekt liegt. Kein
  -- Journal: Ungesendetes ist nach 24 Stunden nicht mehr bindbar (ANN-652).
  delete from public.team_message_attachments a
   where a.id = p_attachment_id and a.organization_id = v_org and a.created_by = auth.uid()
     and a.staff_member_id = v_staff and a.message_id is null
  returning a.id into v_id;
  if v_id is null then
    raise exception 'team attachment not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.discard_team_attachment(uuid) from public, anon;
grant execute on function public.discard_team_attachment(uuid) to authenticated;

comment on function public.discard_team_attachment(uuid) is
  'TEAM-003 (ADR-017 Punkte 7 und 79): verwirft einen eigenen, noch nicht gesendeten Anhang - mit Löschauftrag für das Objekt, ohne Journal (ANN-652).';

-- Nach 24 Stunden ohne Nachricht verworfen (ADR-017 Punkt 73), dazu die
-- abgelaufenen Lesefreigaben. Aufräumen, keine Frist.
create function public.discard_stale_team_attachments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.team_message_attachments
   where message_id is null
     and created_at < now() - interval '24 hours';
  get diagnostics v_anzahl = row_count;
  -- Abgelaufene, nicht verbrauchte Lesefreigaben hielten sonst fest, wer
  -- wann welchen Anhang öffnen wollte (PROJECT_PRINCIPLES.md §20).
  delete from public.team_attachment_access_grants where expires_at <= now();
  return v_anzahl;
end;
$$;

revoke all on function public.discard_stale_team_attachments() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'discard-stale-team-attachments',
      '55 3 * * *',
      'select public.discard_stale_team_attachments()'
    );
  else
    raise notice 'pg_cron ist nicht verfuegbar - ungesendete Anhaenge im Teamchat (TEAM-003) werden nicht automatisch verworfen.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Ansehen - gegen eine einmalige Freigabe (ADR-017 Punkte 15 und 76, ANN-052)
--
-- Nur gesendete Anhänge einer Nachricht, die die Person lesen darf; private
-- Kanäle, Direkt- und Gruppennachrichten also nur ihre Mitglieder, auch owner
-- nicht. Der Objektschlüssel verlässt die Datenbank nur hier.
-- -----------------------------------------------------------------------------
create function public.issue_team_attachment_link(p_attachment_id uuid)
returns table (bucket_id text, object_key text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_staff  uuid;
  v_anhang public.team_message_attachments%rowtype;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  select a.* into v_anhang
  from public.team_message_attachments a
  where a.id = p_attachment_id and a.organization_id = v_org and a.status = 'ready'
    and a.message_id is not null;
  if v_anhang.id is null then
    raise exception 'team attachment not found' using errcode = 'P0002';
  end if;
  -- Gleichzeitiges Löschen wartet auf die Freigabe - oder umgekehrt.
  perform 1 from public.team_messages m
   where m.id = v_anhang.message_id and m.organization_id = v_org for share;
  if (app.team_readable_message(v_anhang.message_id, v_org, v_staff)).id is null then
    raise exception 'team attachment not found' using errcode = 'P0002';
  end if;

  delete from public.team_attachment_access_grants g
   where g.organization_id = v_org and g.expires_at <= now();
  insert into public.team_attachment_access_grants
    (organization_id, user_id, attachment_id, expires_at)
  values (v_org, auth.uid(), v_anhang.id, now() + app.patient_file_access_grant_ttl());

  return query select app.chat_attachment_bucket(), v_anhang.object_key, v_anhang.mime_type;
end;
$$;

revoke all on function public.issue_team_attachment_link(uuid) from public, anon;
grant execute on function public.issue_team_attachment_link(uuid) to authenticated;

comment on function public.issue_team_attachment_link(uuid) is
  'TEAM-003 (ADR-017 Punkte 15, 76 und 77, ANN-052): einmalige Freigabe für genau einen Verweis auf einen gesendeten Anhang einer lesbaren Nachricht. Kein Auditeintrag (Punkt 78).';

-- Dateien je Gespräch (ADR-017 Punkt 80): die Anhänge gesendeter Nachrichten
-- mit Inhalt, die neuesten zuerst - ohne Vorschau, ohne Objektschlüssel.
create function public.list_team_channel_attachments(p_channel uuid, p_limit integer default null)
returns table (
  id           uuid,
  message_id   uuid,
  parent_id    uuid,
  display_name text,
  mime_type    text,
  byte_size    bigint,
  created_at   timestamptz,
  author_name  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  return query
  select a.id, m.id, m.parent_id, a.display_name, a.mime_type, a.byte_size, m.created_at,
         app.team_staff_name(m.author_staff_member_id)
  from public.team_message_attachments a
  join public.team_messages m on m.id = a.message_id
  where a.channel_id = p_channel and a.organization_id = v_org and a.status = 'ready'
    and m.channel_id = p_channel and m.removed_at is null and m.created_at <= now()
  order by m.created_at desc, m.id desc, a.position
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.list_team_channel_attachments(uuid, integer) from public, anon;
grant execute on function public.list_team_channel_attachments(uuid, integer) to authenticated;

comment on function public.list_team_channel_attachments(uuid, integer) is
  'TEAM-003 (ADR-017 Punkt 80): Dateien eines lesbaren Gesprächs - Name, Art, Größe, von wem, wann; ohne Vorschaubild und ohne Objektschlüssel.';

-- -----------------------------------------------------------------------------
-- 7. Speicherregeln auf storage.objects (ADR-017 Punkt 11)
-- -----------------------------------------------------------------------------
create function app.may_upload_chat_attachment_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_message_attachments a
    where a.object_key = p_object_key
      and a.status = 'pending'
      and a.confirmation_requested_at is null
      and a.message_id is null
      and a.created_by = auth.uid()
      and a.organization_id = app.current_organization_id()
      and a.created_at > now() - interval '24 hours'
      and app.can_use_teamchat()
  )
$$;

create function app.may_read_chat_attachment_object(p_object_key text)
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
  if v_actor is null or not app.can_use_teamchat() then
    return false;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;

  select g.id into v_grant
  from public.team_attachment_access_grants g
  join public.team_message_attachments a on a.id = g.attachment_id
  where a.object_key = p_object_key
    and a.status = 'ready'
    and a.message_id is not null
    and a.organization_id = v_org
    and g.organization_id = v_org
    and g.user_id = v_actor
    and g.expires_at > now()
  order by g.created_at
  limit 1
  for update of g skip locked;

  if v_grant is null then
    return false;
  end if;
  delete from public.team_attachment_access_grants where id = v_grant;
  return true;
end;
$$;

revoke all on function app.may_upload_chat_attachment_object(text) from public, anon;
revoke all on function app.may_read_chat_attachment_object(text) from public, anon;
grant execute on function app.may_upload_chat_attachment_object(text) to authenticated;
grant execute on function app.may_read_chat_attachment_object(text) to authenticated;

create policy team_chat_attachments_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = app.chat_attachment_bucket()
    and app.may_upload_chat_attachment_object(name)
  );

create policy team_chat_attachments_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = app.chat_attachment_bucket()
    and app.may_read_chat_attachment_object(name)
  );

create policy team_chat_attachments_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = app.chat_attachment_bucket()
    and app.may_delete_storage_object(bucket_id, name)
  );

create policy team_chat_attachments_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id = app.chat_attachment_bucket()
    and app.may_read_storage_object_for_deletion(bucket_id, name)
  );

-- -----------------------------------------------------------------------------
-- 8. Senden mit Anhängen
-- -----------------------------------------------------------------------------
drop function public.post_team_message(uuid, uuid, text, uuid[], uuid, boolean, boolean, timestamptz);

-- Senden (TEAM-002), dazu `p_attachments` (TEAM-003): eigene, bestätigte,
-- noch nicht gesendete Anhänge desselben Gesprächs, höchstens fünf, jünger als
-- 24 Stunden - in dieser Reihenfolge an die Nachricht gebunden. Mit Anhängen
-- darf der Text leer sein. Eine geplante Nachricht trägt keine Anhänge
-- (ADR-017 Punkt 71). Scheitert die Bindung, entsteht auch die Nachricht nicht.
create function public.post_team_message(
  p_channel         uuid,
  p_parent          uuid,
  p_body            text,
  p_mentions        uuid[] default '{}',
  p_id              uuid default null,
  p_mention_all     boolean default false,
  p_also_in_channel boolean default false,
  p_send_at         timestamptz default null,
  p_attachments     uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_staff     uuid;
  v_text      text;
  v_anhaenge  uuid[] := coalesce(p_attachments, '{}'::uuid[]);
  v_gebunden  integer;
  v_channel   public.team_channels%rowtype;
  v_vorhanden public.team_messages%rowtype;
  v_id        uuid;
  v_neu       uuid;
  v_zeit      timestamptz;
  v_seit      timestamptz;
  v_erwaehnt  uuid[];
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if cardinality(v_anhaenge) > app.team_attachment_limit() then
    raise exception 'too many attachments' using errcode = '22023';
  end if;
  if array_position(v_anhaenge, null) is not null
     or cardinality(v_anhaenge) <> (select count(distinct x) from unnest(v_anhaenge) x) then
    raise exception 'invalid attachments' using errcode = '22023';
  end if;
  v_text := app.team_message_body(p_body, cardinality(v_anhaenge) > 0);

  if p_id is null then
    v_id := extensions.gen_random_uuid();
  else
    -- Eine Zeile mit dieser Kennung kann nur die eigene sein - als Nachricht
    -- oder als Anker, nachdem die Person sie mit Antworten gelöscht hat. Kam
    -- sie schon an, hängen auch ihre Anhänge schon daran.
    v_id := app.team_message_key(v_staff, p_id);
    select * into v_vorhanden from public.team_messages where id = v_id;
    if v_vorhanden.id is not null then
      if v_vorhanden.channel_id = p_channel and v_vorhanden.parent_id is not distinct from p_parent then
        return v_id;
      end if;
      raise exception 'message id is already used' using errcode = '22023';
    end if;
    -- Eine Wiederholung nach dem eigenen Löschen bringt nichts zurück.
    if exists (select 1 from public.deletion_journal j
               where j.organization_id = v_org and j.target_id = v_id
                 and j.target_table in ('team_messages', 'team_message_contents')) then
      return v_id;
    end if;
  end if;

  -- Prüfen und Einfügen sehen denselben Kanal: Herausnehmen, Verlassen und
  -- Archivieren sperren ihn zum Ändern und warten so auf das Senden - oder
  -- umgekehrt (Zweitreview TEAM-002, Runde 3, Befund 2).
  perform 1 from public.team_channels c where c.id = p_channel and c.organization_id = v_org for share;
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  select * into v_channel from public.team_channels where id = p_channel;
  if v_channel.archived_at is not null then
    raise exception 'team channel is archived' using errcode = '22023';
  end if;
  -- In eine Direktnachricht nur, solange die andere Person teilnehmen kann; in
  -- eine Gruppennachricht, solange es noch jemand kann.
  if v_channel.kind in ('direct', 'group') and not exists (
    select 1 from public.team_channel_members m
    where m.channel_id = p_channel and m.staff_member_id <> v_staff
      and app.teamchat_participant(v_org, m.staff_member_id)
  ) then
    raise exception 'team chat partner is not available' using errcode = '22023';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.team_messages m
    where m.id = p_parent and m.channel_id = p_channel and m.parent_id is null
      and m.created_at <= now()
  ) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  if coalesce(p_also_in_channel, false) and p_parent is null then
    raise exception 'only a reply can also go to the conversation' using errcode = '22023';
  end if;
  if p_send_at is not null and (
       p_parent is not null
       or p_send_at < now() + interval '1 minute'
       or p_send_at > now() + interval '30 days') then
    raise exception 'send time must be one minute to 30 days ahead' using errcode = '22023';
  end if;
  if p_send_at is not null and cardinality(v_anhaenge) > 0 then
    raise exception 'a scheduled message has no attachments' using errcode = '22023';
  end if;

  insert into public.team_messages
    (id, organization_id, channel_id, parent_id, author_staff_member_id, body, also_in_channel, created_at)
  values (v_id, v_org, p_channel, p_parent, v_staff, v_text,
          coalesce(p_also_in_channel, false), coalesce(p_send_at, now()))
  on conflict (id) do nothing
  returning id, created_at into v_neu, v_zeit;

  if v_neu is null then
    -- Gleichzeitig mit derselben Kennung: Die andere Anfrage hat angelegt.
    select * into v_vorhanden from public.team_messages where id = v_id;
    if v_vorhanden.channel_id = p_channel and v_vorhanden.parent_id is not distinct from p_parent then
      return v_id;
    end if;
    raise exception 'message id is already used' using errcode = '22023';
  end if;

  -- Anhänge binden: gesperrt in fester Reihenfolge, damit zwei Sendungen mit
  -- denselben Anhängen nicht ineinander warten; nur eine gewinnt.
  if cardinality(v_anhaenge) > 0 then
    perform 1 from public.team_message_attachments a
     where a.id = any (v_anhaenge)
     order by a.id
     for update;
    update public.team_message_attachments a
       set message_id = v_id,
           attached_at = now(),
           position = array_position(v_anhaenge, a.id)
     where a.id = any (v_anhaenge)
       and a.organization_id = v_org
       and a.channel_id = p_channel
       and a.staff_member_id = v_staff
       and a.created_by = auth.uid()
       and a.message_id is null
       and a.status = 'ready'
       and a.created_at > now() - interval '24 hours';
    get diagnostics v_gebunden = row_count;
    if v_gebunden <> cardinality(v_anhaenge) then
      raise exception 'team attachment not found' using errcode = 'P0002';
    end if;
  end if;

  -- @alle: alle, die das Gespräch lesen; set_team_mentions prüft jede Person.
  v_erwaehnt := coalesce(p_mentions, '{}'::uuid[]);
  if coalesce(p_mention_all, false) then
    v_erwaehnt := v_erwaehnt || array(select l.staff_member_id
                                      from public.list_team_channel_members(p_channel) l
                                      where l.active);
  end if;
  perform app.set_team_mentions(v_id, v_erwaehnt);

  -- Senden zieht keinen Lesestand vor: Eigenes ist nie neu, und was andere
  -- inzwischen schrieben, gilt erst als gelesen, wenn die Ansicht es gezeigt
  -- hat (ANN-640; Zweitreview TEAM-002, Runde 3, Befund 5).
  if p_parent is null then
    -- Wer beginnt oder erwähnt ist, folgt dem Thread ab hier.
    perform app.team_follow_thread(v_id, v_staff, v_zeit);
    perform app.team_follow_thread(v_id, mm.staff_member_id, v_zeit)
    from public.team_message_mentions mm where mm.message_id = v_id;
  else
    v_seit := (select max(m.created_at) from public.team_messages m
               where (m.id = p_parent or m.parent_id = p_parent) and m.created_at < v_zeit);
    perform app.team_follow_thread(p_parent, v_staff, v_zeit);
    -- Erwähnte folgen; was vor der Erwähnung kam, gilt für sie als gesehen.
    perform app.team_follow_thread(p_parent, mm.staff_member_id, v_seit)
    from public.team_message_mentions mm where mm.message_id = v_id;
    -- In Direkt- und Gruppennachrichten folgen alle jedem Thread (wie Slack).
    if v_channel.kind in ('direct', 'group') then
      perform app.team_follow_thread(p_parent, m.staff_member_id, v_seit)
      from public.team_channel_members m
      where m.channel_id = p_channel and m.staff_member_id <> v_staff;
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.post_team_message(uuid, uuid, text, uuid[], uuid, boolean, boolean, timestamptz, uuid[])
  from public, anon;
grant execute on function public.post_team_message(uuid, uuid, text, uuid[], uuid, boolean, boolean, timestamptz, uuid[])
  to authenticated;

-- Bearbeiten (TEAM-002): erst die eigene Nachricht finden und sperren, dann
-- den Text prüfen - leer nur, wenn Anhänge daran hängen. So antwortet eine
-- fremde Kennung immer gleich (P0002), nie mit einer Prüfregel zum Text.
create or replace function public.edit_team_message(
  p_message     uuid,
  p_body        text,
  p_mentions    uuid[] default '{}',
  p_mention_all boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_staff    uuid;
  v_text     text;
  v_m        public.team_messages%rowtype;
  v_root     uuid;
  v_seit     timestamptz;
  v_erwaehnt uuid[];
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  select m.* into v_m
  from public.team_messages m
  where m.id = p_message and m.organization_id = v_org
    and m.author_staff_member_id = v_staff and m.removed_at is null
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
    and not exists (select 1 from public.team_channels c
                    where c.id = m.channel_id and c.archived_at is not null)
  for update;
  if v_m.id is null then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  v_text := app.team_message_body(
    p_body,
    exists (select 1 from public.team_message_attachments a where a.message_id = v_m.id)
  );
  update public.team_messages m
     set body = v_text,
         edited_at = case when m.created_at <= now() then now() end
   where m.id = v_m.id
  returning m.* into v_m;
  v_erwaehnt := coalesce(p_mentions, '{}'::uuid[]);
  if coalesce(p_mention_all, false) then
    v_erwaehnt := v_erwaehnt || array(select l.staff_member_id
                                      from public.list_team_channel_members(v_m.channel_id) l
                                      where l.active);
  end if;
  perform app.set_team_mentions(p_message, v_erwaehnt);
  v_root := coalesce(v_m.parent_id, v_m.id);
  v_seit := case when v_m.parent_id is null then v_m.created_at
                 else (select max(x.created_at) from public.team_messages x
                       where (x.id = v_root or x.parent_id = v_root)
                         and x.created_at < v_m.created_at) end;
  perform app.team_follow_thread(v_root, mm.staff_member_id, v_seit)
  from public.team_message_mentions mm where mm.message_id = p_message;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Verlauf mit Anhängen
-- -----------------------------------------------------------------------------
drop function public.list_team_messages(uuid, uuid, timestamptz, uuid, timestamptz, uuid, uuid, integer);

-- Unverändert aus TEAM-002, dazu `attachments`: je Anhang Kennung, Name, Art
-- und Größe in der Reihenfolge des Sendens - ohne Objektschlüssel, ohne
-- Vorschau (ADR-017 Punkt 77). Am Anker nichts.
create function public.list_team_messages(
  p_channel   uuid,
  p_parent    uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_after_at  timestamptz default null,
  p_after_id  uuid default null,
  p_around    uuid default null,
  p_limit     integer default null
)
returns table (
  id             uuid,
  parent_id      uuid,
  author_staff_member_id uuid,
  author_name    text,
  body           text,
  created_at     timestamptz,
  edited         boolean,
  removed_kind   text,
  also_in_channel boolean,
  reply_count    integer,
  last_reply_at  timestamptz,
  mentions       uuid[],
  own            boolean,
  -- Nur aus dem eigenen Stand: neue Antworten anderer in einem Thread, dem die
  -- Person folgt, und ob sie darin erwähnt ist.
  new_replies    integer,
  mentioned_in_new_replies boolean,
  -- Für die Linie „Neu“: nach dem eigenen Stand, nicht eigen.
  unread         boolean,
  -- An der Ausgangsnachricht: Folgt die Person dem Thread?
  following      boolean,
  -- Reaktionen in fester Reihenfolge: Schlüssel, Zahl, ob eigene, wer.
  reactions      jsonb,
  pinned         boolean,
  -- Nur für die Person selbst: ob sie die Nachricht für später gemerkt hat.
  saved          boolean,
  -- An einer Antwort „auch im Kanal“: worauf sie antwortet (ohne Anker-Text).
  root_author_name text,
  root_body      text,
  -- TEAM-003: Anhänge (Kennung, Name, Art, Größe), am Anker leer.
  attachments    jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_staff  uuid;
  v_grenze integer;
  v_ids    uuid[];
  v_mitte  public.team_messages%rowtype;
  c_min    constant uuid := '00000000-0000-0000-0000-000000000000';
  c_max    constant uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.team_messages m
    where m.id = p_parent and m.channel_id = p_channel and m.parent_id is null
      and m.created_at <= now()
  ) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  -- Im Gespräch höchstens 100 je Seite, im Thread 200.
  v_grenze := case when p_parent is null then least(greatest(coalesce(p_limit, 50), 1), 100)
                   else least(greatest(coalesce(p_limit, 100), 1), 200) end;

  if p_around is not null then
    select x.* into v_mitte from app.team_view(p_channel, p_parent) x where x.id = p_around;
    if v_mitte.id is null then
      raise exception 'team message not found' using errcode = 'P0002';
    end if;
    select array_agg(w.id) into v_ids from (
      (select x.id from app.team_view(p_channel, p_parent) x
        where (x.created_at, x.id) <= (v_mitte.created_at, v_mitte.id)
        order by x.created_at desc, x.id desc
        limit v_grenze / 2 + 1)
      union all
      (select x.id from app.team_view(p_channel, p_parent) x
        where (x.created_at, x.id) > (v_mitte.created_at, v_mitte.id)
        order by x.created_at, x.id
        limit v_grenze / 2)
    ) w;
  elsif p_after_at is not null then
    select array_agg(w.id) into v_ids from (
      select x.id from app.team_view(p_channel, p_parent) x
      where (x.created_at, x.id) > (p_after_at, coalesce(p_after_id, c_min))
      order by x.created_at, x.id
      limit v_grenze
    ) w;
  else
    select array_agg(w.id) into v_ids from (
      select x.id from app.team_view(p_channel, p_parent) x
      where p_before_at is null
         or (x.created_at, x.id) < (p_before_at, coalesce(p_before_id, c_max))
      order by x.created_at desc, x.id desc
      limit v_grenze
    ) w;
  end if;
  -- Im Thread steht die Ausgangsnachricht auf jeder Seite oben.
  if p_parent is not null then
    v_ids := array_append(coalesce(v_ids, '{}'::uuid[]), p_parent);
  end if;

  return query
  select m.id, m.parent_id, m.author_staff_member_id,
         app.team_staff_name(m.author_staff_member_id),
         m.body, m.created_at, m.edited_at is not null, m.removed_kind, m.also_in_channel,
         (select count(*)::integer from public.team_messages r
          where r.parent_id = m.id and r.created_at <= now()),
         (select max(r.created_at) from public.team_messages r
          where r.parent_id = m.id and r.created_at <= now()),
         coalesce((select array_agg(mm.staff_member_id order by mm.staff_member_id)
                   from public.team_message_mentions mm where mm.message_id = m.id), '{}'::uuid[]),
         -- Am Anker fehlt die Verfasser:in: dann nicht eigen (bis TEAM-001 leer).
         coalesce(m.author_staff_member_id = v_staff, false),
         case when m.parent_id is null and coalesce(ts.following, false) then
           (select count(*)::integer from public.team_messages r
            where r.parent_id = m.id and r.removed_at is null and r.created_at <= now()
              and r.created_at > ts.read_up_to
              and r.author_staff_member_id is distinct from v_staff)
         else 0 end,
         m.parent_id is null and coalesce(ts.following, false) and exists (
           select 1 from public.team_messages r
           join public.team_message_mentions mm
             on mm.message_id = r.id and mm.staff_member_id = v_staff
           where r.parent_id = m.id and r.removed_at is null and r.created_at <= now()
             and r.created_at > ts.read_up_to),
         app.team_unread(m.channel_id, m.parent_id, m.also_in_channel, m.created_at,
                         m.author_staff_member_id, m.removed_at, v_staff),
         coalesce(ts.following, false),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'reaction', x.reaction, 'count', x.anzahl, 'own', x.eigen, 'names', x.namen)
                  order by x.rang)
           from (
             select r.reaction,
                    array_position(array['daumen', 'erledigt', 'augen', 'danke', 'herz',
                                         'lachen', 'feier', 'frage'], r.reaction) as rang,
                    count(*)::integer as anzahl,
                    bool_or(r.staff_member_id = v_staff) as eigen,
                    array_agg(app.team_staff_name(r.staff_member_id)
                              order by app.team_staff_name(r.staff_member_id)) as namen
             from public.team_message_reactions r
             -- Am leeren Anker nichts, auch nach einem Rennen mit dem Entfernen.
             where r.message_id = m.id and m.removed_at is null
             group by r.reaction
           ) x), '[]'::jsonb),
         m.removed_at is null
           and exists (select 1 from public.team_message_pins p where p.message_id = m.id),
         exists (select 1 from public.team_saved_messages s
                 where s.message_id = m.id and s.staff_member_id = v_staff),
         case when m.also_in_channel then app.team_staff_name(w.author_staff_member_id) end,
         case when m.also_in_channel then left(w.body, 200) end,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', a.id, 'name', a.display_name, 'mime_type', a.mime_type,
                    'byte_size', a.byte_size)
                  order by a.position)
           from public.team_message_attachments a
           where a.message_id = m.id and a.status = 'ready' and m.removed_at is null
         ), '[]'::jsonb)
  from public.team_messages m
  left join public.team_thread_states ts
    on ts.root_message_id = m.id and ts.staff_member_id = v_staff
  left join public.team_messages w on w.id = m.parent_id
  where m.id = any (coalesce(v_ids, '{}'::uuid[]))
  order by m.created_at, m.id;
end;
$$;

revoke all on function public.list_team_messages(uuid, uuid, timestamptz, uuid, timestamptz, uuid, uuid, integer)
  from public, anon;
grant execute on function public.list_team_messages(uuid, uuid, timestamptz, uuid, timestamptz, uuid, uuid, integer)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Prüfung am Server (ADR-017 Punkte 49 bis 52) - nur für den Dienst
--
-- Dieselbe Edge Function wie für Akte, Rückfragen, Räder und Belege
-- (patient-file-verify), mit `team_attachment_id`. Geprüft wird vor dem
-- Senden: nur ein eigener, noch nicht gesendeter Anhang. Ein Befund heißt
-- verwerfen (Punkt 52), ohne Journal wie jedes ungesendete Verwerfen.
-- -----------------------------------------------------------------------------
create function public.team_attachment_for_verification(p_attachment_id uuid, p_user_id uuid)
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
  select app.chat_attachment_bucket(), a.object_key, a.mime_type, a.byte_size,
         a.checksum_sha256, a.verified_at is not null
  from public.team_message_attachments a
  where a.id = p_attachment_id
    and a.created_by = p_user_id
    and a.message_id is null
    and a.created_at > now() - interval '24 hours'
    and (a.status = 'ready' or a.confirmation_requested_at is not null)
$$;

create function public.record_team_attachment_verification(
  p_attachment_id   uuid,
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
  v_anhang public.team_message_attachments%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select a.* into v_anhang from public.team_message_attachments a
   where a.id = p_attachment_id for update;
  -- Ein gesendeter Anhang wird nicht mehr geprüft: Er hängt an der Nachricht.
  if not found or v_anhang.message_id is not null then
    return 'not_found';
  end if;
  if v_anhang.verified_at is not null then
    return 'already_verified';
  end if;
  if v_anhang.status <> 'ready' and v_anhang.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;
  -- Bilder bekommen ein Metadatenergebnis, PDF nicht (Punkt 49).
  if (v_anhang.mime_type in ('image/jpeg', 'image/png')) <> (p_metadata_ok is not null) then
    raise exception 'metadata result does not match the media type' using errcode = '22023';
  end if;

  if p_content_type_ok and p_checksum_ok and coalesce(p_metadata_ok, true) then
    update public.team_message_attachments
       set verified_at = now(),
           status = 'ready',
           confirmed_at = coalesce(confirmed_at, now())
     where id = p_attachment_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heißt verwerfen; der Trigger schreibt den Löschauftrag.
  delete from public.team_message_attachments where id = p_attachment_id;
  return 'rejected';
end;
$$;

revoke all on function public.team_attachment_for_verification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_team_attachment_verification(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.team_attachment_for_verification(uuid, uuid) to service_role;
grant execute on function public.record_team_attachment_verification(uuid, boolean, boolean, boolean)
  to service_role;

comment on function public.record_team_attachment_verification(uuid, boolean, boolean, boolean) is
  'TEAM-003 (ADR-017 Punkte 49 bis 52 und 73): Ergebnis der Prüfung am Inhalt eines noch nicht gesendeten Anhangs - Typ an der Signatur, Prüfsumme, bei Bildern keine Metadaten. Bestanden: geprüft und ready. Befund: verworfen mit Löschauftrag. Nur für den Dienst.';

-- -----------------------------------------------------------------------------
-- 11. Abgleich (ADR-017 Punkt 27): verwaiste Objekte auch im Bucket des
--     Teamchats. Rumpf sonst unverändert aus 20261127100000_ers_001_erstattungen.sql.
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
                        app.message_attachment_bucket(), app.fleet_photo_bucket(),
                        app.reimbursement_receipt_bucket(), app.chat_attachment_bucket())
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
      from public.staff_reimbursement_receipts x
      where x.object_key = o.name
        and o.bucket_id = app.reimbursement_receipt_bucket()
    )
    and not exists (
      select 1
      from public.team_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.chat_attachment_bucket()
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
                        app.message_attachment_bucket(), app.fleet_photo_bucket(),
                        app.reimbursement_receipt_bucket(), app.chat_attachment_bucket())
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
      from public.staff_reimbursement_receipts x
      where x.object_key = o.name
        and o.bucket_id = app.reimbursement_receipt_bucket()
    )
    and not exists (
      select 1
      from public.team_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.chat_attachment_bucket()
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
