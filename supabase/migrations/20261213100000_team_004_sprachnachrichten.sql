-- =============================================================================
-- TEAM-004: Sprachnachrichten im Teamchat (ADR-017 Abschnitt N, Fassung 9)
--
-- Jannes, 18.10.2026: „Sprachnachrichten möchte ich ermöglichen.“ Eine
-- Sprachnachricht ist ein Anhang wie Foto und PDF (TEAM-003, Abschnitt M):
-- dieselbe Tabelle, derselbe Bucket, dieselben Rechte, Löschpfade, Freigaben
-- und Prüfung am Inhalt. Neu sind nur zwei Arten - WebM (Opus) und MP4 (AAC),
-- wie `MediaRecorder` sie liefert - und die Dauer, die das Gerät misst
-- (ANN-655). Kein neues Recht, keine neue Tabelle, nichts Neues im Protokoll
-- (Punkt 78).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Grenze: höchstens zwei Minuten (Punkt 83, Bestätigungsfrage 33)
-- -----------------------------------------------------------------------------
create function app.team_voice_max_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$ select 120 $$;

comment on function app.team_voice_max_seconds() is
  'TEAM-004 (ADR-017 Punkt 83, ANN-655): Höchstdauer einer Sprachnachricht in Sekunden - die eine Stelle für die Grenze am Server.';

revoke all on function app.team_voice_max_seconds() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Bucket und Tabelle: zwei Arten mehr, die Dauer dazu
-- -----------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf',
                                  'audio/webm', 'audio/mp4']
 where id = 'teamchat';

alter table public.team_message_attachments
  drop constraint team_message_attachments_mime_type_check;
alter table public.team_message_attachments
  add constraint team_message_attachments_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'application/pdf', 'audio/webm', 'audio/mp4'));

-- Die Dauer hat genau eine Sprachnachricht; der Wächter hält sie wie alles,
-- was eine Datei ist, unveränderlich (ADR-017 Punkt 8).
alter table public.team_message_attachments
  add column duration_seconds smallint;
alter table public.team_message_attachments
  add constraint team_message_attachments_duration check (
    (mime_type in ('audio/webm', 'audio/mp4')) = (duration_seconds is not null)
    and (duration_seconds is null or duration_seconds between 1 and app.team_voice_max_seconds())
  );

comment on table public.team_message_attachments is
  'TEAM-003 und TEAM-004 (ADR-017 Abschnitte M und N): Foto (JPEG, PNG), PDF oder Sprachnachricht (WebM, MP4) an einer Nachricht des Teamchats, bis zu fünf je Nachricht. Bis zum Senden ohne Nachricht bei der hochladenden Person (nach 24 Stunden verworfen, ANN-652), danach an der Nachricht und mit ihr in der Klasse teamchat: Sie fällt mit der Zeile (cascade) und mit ihrem Inhalt (app.team_message_content_removed); das Objekt folgt über den Löschauftrag (ADR-017 Punkt 25). Unveränderlich bis auf Zustand, Prüfung und die eine Bindung. Kein Tabellenrecht.';
comment on column public.team_message_attachments.duration_seconds is
  'TEAM-004 (ADR-017 Punkt 84, ANN-655): Dauer einer Sprachnachricht in ganzen Sekunden, auf dem Gerät gemessen - nur zur Anzeige; bei Foto und PDF leer.';

-- -----------------------------------------------------------------------------
-- 3. Phase (a) mit Dauer
--
-- Rumpf wie in 20261212100000_team_003_teamchat_anhaenge.sql, dazu die zwei
-- Arten und `p_duration_seconds` (Vorgabe leer: Foto und PDF wie bisher).
-- -----------------------------------------------------------------------------
drop function public.prepare_team_attachment_upload(uuid, text, bigint, text, text);

create function public.prepare_team_attachment_upload(
  p_channel          uuid,
  p_mime_type        text,
  p_byte_size        bigint,
  p_checksum_sha256  text,
  p_name             text,
  p_duration_seconds integer default null
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
  v_ton   boolean;
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

  if p_mime_type is null
     or p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf', 'audio/webm', 'audio/mp4') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;
  -- Eine Sprachnachricht hat eine Dauer, sonst nichts (Punkt 84).
  v_ton := p_mime_type in ('audio/webm', 'audio/mp4');
  if v_ton <> (p_duration_seconds is not null)
     or (p_duration_seconds is not null
         and p_duration_seconds not between 1 and app.team_voice_max_seconds()) then
    raise exception 'invalid duration' using errcode = '22023';
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
    checksum_sha256, duration_seconds, created_by
  )
  values (v_org, p_channel, v_staff, v_name, p_mime_type, p_byte_size, p_checksum_sha256,
          p_duration_seconds, auth.uid())
  returning id into v_id;

  return query
    select a.id, app.chat_attachment_bucket(), a.object_key
    from public.team_message_attachments a where a.id = v_id;
end;
$$;

revoke all on function public.prepare_team_attachment_upload(uuid, text, bigint, text, text, integer)
  from public, anon;
grant execute on function public.prepare_team_attachment_upload(uuid, text, bigint, text, text, integer)
  to authenticated;

comment on function public.prepare_team_attachment_upload(uuid, text, bigint, text, text, integer) is
  'TEAM-003 und TEAM-004 (ADR-017 Punkte 7a, 71 und 84): Phase (a) - ein Anhang für ein lesbares, nicht archiviertes Gespräch, JPEG, PNG oder PDF bis 10 MB oder eine Sprachnachricht (WebM, MP4) mit Dauer von 1 bis 120 Sekunden, höchstens 20 ungesendet; liefert den Objektschlüssel, bevor Bytes fließen.';

-- -----------------------------------------------------------------------------
-- 4. Dateien je Gespräch mit Dauer (Punkt 80)
--
-- Rumpf wie in TEAM-003, dazu `duration_seconds`; die Spalten ändern sich,
-- deshalb neu angelegt.
-- -----------------------------------------------------------------------------
drop function public.list_team_channel_attachments(uuid, integer);

create function public.list_team_channel_attachments(p_channel uuid, p_limit integer default null)
returns table (
  id               uuid,
  message_id       uuid,
  parent_id        uuid,
  display_name     text,
  mime_type        text,
  byte_size        bigint,
  created_at       timestamptz,
  author_name      text,
  verified         boolean,
  duration_seconds smallint
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
         app.team_staff_name(m.author_staff_member_id), a.verified_at is not null,
         a.duration_seconds
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
  'TEAM-003 und TEAM-004 (ADR-017 Punkte 51, 80 und 86): Dateien eines lesbaren Gesprächs - Name, Art, Größe, Dauer einer Sprachnachricht, von wem, wann, ob am Server geprüft; ohne Vorschaubild und ohne Objektschlüssel.';

-- -----------------------------------------------------------------------------
-- 5. Verlauf mit der Dauer am Anhang (Punkt 86)
--
-- Rumpf unverändert aus TEAM-003, im Objekt je Anhang dazu `duration_seconds`.
-- Spalten und Rechte bleiben; die Rechte stehen der Klarheit halber noch einmal.
-- -----------------------------------------------------------------------------
create or replace function public.list_team_messages(
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
                    'byte_size', a.byte_size, 'verified', a.verified_at is not null,
                    'duration_seconds', a.duration_seconds)
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
-- 6. Prüfung am Server (Punkte 49 und 84): Sprachnachrichten mit
--    Metadatenergebnis wie Bilder. Rumpf sonst unverändert aus TEAM-003.
-- -----------------------------------------------------------------------------
create or replace function public.record_team_attachment_verification(
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
  -- Bilder und Sprachnachrichten bekommen ein Metadatenergebnis, PDF nicht
  -- (Punkte 49 und 84).
  if (v_anhang.mime_type in ('image/jpeg', 'image/png', 'audio/webm', 'audio/mp4'))
     <> (p_metadata_ok is not null) then
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

  -- Punkt 52: Befund heißt verwerfen; der Trigger schreibt den Löschauftrag,
  -- das Journal hält es über eine Wiederherstellung (ADR-008 Punkt 8).
  delete from public.team_message_attachments where id = p_attachment_id;
  -- Tageweise gebündelt wie das Verwerfen von Hand.
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
  values (v_anhang.organization_id,
          md5('team_manual:' || v_anhang.organization_id::text || ':' || current_date::text)::uuid,
          'team_message_attachments', p_attachment_id, 'teamchat', date_trunc('day', now()),
          date_trunc('day', now()));
  return 'rejected';
end;
$$;

revoke all on function public.record_team_attachment_verification(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_team_attachment_verification(uuid, boolean, boolean, boolean)
  to service_role;

comment on function public.record_team_attachment_verification(uuid, boolean, boolean, boolean) is
  'TEAM-003 und TEAM-004 (ADR-017 Punkte 49 bis 52, 73 und 84): Ergebnis der Prüfung am Inhalt eines noch nicht gesendeten Anhangs - Typ an der Signatur bzw. Struktur, Prüfsumme, bei Bildern und Sprachnachrichten keine Metadaten. Bestanden: geprüft und ready. Befund: verworfen mit Löschauftrag und Journal. Nur für den Dienst.';
