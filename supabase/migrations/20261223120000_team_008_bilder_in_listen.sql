-- =============================================================================
-- TEAM-008: Bilder auch in den Listen des Teamchats (Auftrag Jannes
-- 2026-10-19, Antwort auf Frage 5 der PR zu TEAM-006 und TEAM-007)
--
-- „Für dich“, Threads, Suche, „Für später“ und Angeheftetes zeigen vor jedem
-- Eintrag Bild oder Farbe der Person, die geschrieben hat - wie der Verlauf.
-- Dafür liefern die fünf Listen neben dem Namen die Kennung des
-- Mitarbeiterdatensatzes, die `list_team_messages` für dieselben Nachrichten
-- schon liefert. Nichts wird sichtbar, was es nicht schon war: dieselben
-- Nachrichten, dieselben Bedingungen, und eine entfernte Nachricht hat keine
-- Verfasser:in mehr (die Spalte ist dann leer, wie der Name).
--
-- Die Rümpfe sind die aus TEAM-002 (20261210100000), unverändert bis auf die
-- eine Spalte. Ein neuer Rückgabetyp verlangt drop und create; die Rechte
-- werden danach wie dort gesetzt.
-- =============================================================================

drop function public.search_team_messages(text, uuid, uuid, date, date);
drop function public.list_team_activity();
drop function public.list_team_threads();
drop function public.list_team_pins(uuid);
drop function public.list_team_saved(boolean);

-- Suche in allen lesbaren Gesprächen, die neuesten 50 zuerst; dazu Filter nach
-- Gespräch, Person und Zeitraum (Tage in der Zeitzone der Praxis). Ohne
-- Suchwort nur im einen Gespräch - wie Hochblättern. **Die Person filtert nur
-- mit Suchwort** (ANN-651, §20): „alles von Anna im Oktober“ wäre eine Liste
-- ihres Verhaltens, keine Suche nach einer Sache. Geplantes findet niemand,
-- Entferntes auch nicht.
create function public.search_team_messages(
  p_query   text default null,
  p_channel uuid default null,
  p_author  uuid default null,
  p_from    date default null,
  p_to      date default null
)
returns table (
  id           uuid,
  channel_id   uuid,
  channel_kind text,
  parent_id    uuid,
  author_staff_member_id uuid,
  author_name  text,
  body         text,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_nadel text := btrim(coalesce(p_query, ''));
  v_zone  text;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if length(v_nadel) > 100
     or (v_nadel <> '' and length(v_nadel) < 2)
     or (v_nadel = '' and (p_channel is null or p_author is not null)) then
    raise exception 'search needs two to 100 characters' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'Europe/Berlin') into v_zone
  from public.organizations o where o.id = v_org;

  return query
  select m.id, m.channel_id, c.kind, m.parent_id, m.author_staff_member_id,
         app.team_staff_name(m.author_staff_member_id), m.body, m.created_at
  from public.team_messages m
  join public.team_channels c on c.id = m.channel_id
  where m.organization_id = v_org and m.removed_at is null and m.created_at <= now()
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
    and (p_channel is null or m.channel_id = p_channel)
    and (p_author is null or m.author_staff_member_id = p_author)
    and (p_from is null or (m.created_at at time zone v_zone)::date >= p_from)
    and (p_to is null or (m.created_at at time zone v_zone)::date <= p_to)
    and (v_nadel = '' or strpos(lower(m.body), lower(v_nadel)) > 0)
  order by m.created_at desc, m.id desc
  limit 50;
end;
$$;

-- Für dich (Aktivität, ANN-614): Erwähnungen der Person und Antworten in
-- Threads, denen sie folgt; „neu“ nach dem eigenen Stand. Nur aus lesbaren
-- Gesprächen, die neuesten 50. Fällige Erinnerungen stehen in
-- `list_team_saved`.
create function public.list_team_activity()
returns table (
  id           uuid,
  channel_id   uuid,
  channel_kind text,
  parent_id    uuid,
  author_staff_member_id uuid,
  author_name  text,
  body         text,
  created_at   timestamptz,
  reason       text,
  unread       boolean
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

  return query
  select m.id, m.channel_id, c.kind, m.parent_id,
         m.author_staff_member_id, app.team_staff_name(m.author_staff_member_id), m.body,
         m.created_at,
         case when exists (select 1 from public.team_message_mentions mm
                           where mm.message_id = m.id and mm.staff_member_id = v_staff)
              then 'mention' else 'reply' end,
         app.team_unread(m.channel_id, m.parent_id, m.also_in_channel, m.created_at,
                         m.author_staff_member_id, m.removed_at, v_staff)
  from public.team_messages m
  join public.team_channels c on c.id = m.channel_id
  where m.organization_id = v_org and m.removed_at is null and m.created_at <= now()
    and m.author_staff_member_id is distinct from v_staff
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
    and (exists (select 1 from public.team_message_mentions mm
                 where mm.message_id = m.id and mm.staff_member_id = v_staff)
         or (m.parent_id is not null and app.team_follows(m.parent_id, v_staff)))
  order by m.created_at desc, m.id desc
  limit 50;
end;
$$;

-- Threads (ANN-614): alle, denen die Person folgt und die Antworten haben -
-- die mit neuen Antworten zuerst, dann nach der letzten Antwort.
create function public.list_team_threads()
returns table (
  id            uuid,
  channel_id    uuid,
  channel_kind  text,
  author_staff_member_id uuid,
  author_name   text,
  body          text,
  removed_kind  text,
  reply_count   integer,
  last_reply_at timestamptz,
  new_replies   integer
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

  return query
  select x.id, x.channel_id, x.kind, x.author_staff_member_id, x.author_name, x.body,
         x.removed_kind, x.reply_count, x.last_reply_at, x.new_replies
  from (
    select m.id, m.channel_id, c.kind,
           m.author_staff_member_id,
           app.team_staff_name(m.author_staff_member_id) as author_name, m.body, m.removed_kind,
           (select count(*)::integer from public.team_messages r
            where r.parent_id = m.id and r.created_at <= now()) as reply_count,
           (select max(r.created_at) from public.team_messages r
            where r.parent_id = m.id and r.created_at <= now()) as last_reply_at,
           (select count(*)::integer from public.team_messages r
            where r.parent_id = m.id and r.removed_at is null and r.created_at <= now()
              and r.author_staff_member_id is distinct from v_staff
              and r.created_at > ts.read_up_to) as new_replies
    from public.team_thread_states ts
    join public.team_messages m on m.id = ts.root_message_id
    join public.team_channels c on c.id = m.channel_id
    where ts.staff_member_id = v_staff and ts.following and ts.organization_id = v_org
      and m.created_at <= now()
      and exists (select 1 from public.team_messages r
                  where r.parent_id = m.id and r.created_at <= now())
      and app.team_channel_readable(m.channel_id, v_org, v_staff)
  ) x
  order by (x.new_replies > 0) desc, x.last_reply_at desc, x.id
  limit 50;
end;
$$;

-- Angeheftetes eines Gesprächs, das Neueste zuerst.
create function public.list_team_pins(p_channel uuid)
returns table (
  id          uuid,
  parent_id   uuid,
  author_staff_member_id uuid,
  author_name text,
  body        text,
  created_at  timestamptz
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
  select m.id, m.parent_id, m.author_staff_member_id,
         app.team_staff_name(m.author_staff_member_id), m.body, m.created_at
  from public.team_message_pins p
  join public.team_messages m on m.id = p.message_id
  where p.channel_id = p_channel and m.removed_at is null and m.created_at <= now()
  order by m.created_at desc, m.id desc;
end;
$$;

-- „Für später“ der Person - offen (`p_done` falsch) oder erledigt; nur aus
-- Gesprächen, die sie noch liest. Fällige Erinnerungen zuerst, dann nach der
-- nächsten Erinnerung, dann die neuesten Nachrichten.
create function public.list_team_saved(p_done boolean default false)
returns table (
  id           uuid,
  channel_id   uuid,
  channel_kind text,
  parent_id    uuid,
  author_staff_member_id uuid,
  author_name  text,
  body         text,
  created_at   timestamptz,
  remind_at    timestamptz,
  done         boolean,
  due          boolean
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

  return query
  select m.id, m.channel_id, c.kind, m.parent_id, m.author_staff_member_id,
         app.team_staff_name(m.author_staff_member_id), m.body, m.created_at, s.remind_at, s.done,
         not s.done and s.remind_at is not null and s.remind_at <= now()
  from public.team_saved_messages s
  join public.team_messages m on m.id = s.message_id
  join public.team_channels c on c.id = m.channel_id
  where s.staff_member_id = v_staff and s.organization_id = v_org
    and s.done = coalesce(p_done, false)
    and m.removed_at is null and m.created_at <= now()
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
  order by (not s.done and s.remind_at is not null and s.remind_at <= now()) desc,
           s.remind_at nulls last, m.created_at desc, m.id
  limit 200;
end;
$$;

revoke all on function public.search_team_messages(text, uuid, uuid, date, date) from public, anon;
revoke all on function public.list_team_activity() from public, anon;
revoke all on function public.list_team_threads() from public, anon;
revoke all on function public.list_team_pins(uuid) from public, anon;
revoke all on function public.list_team_saved(boolean) from public, anon;
grant execute on function public.search_team_messages(text, uuid, uuid, date, date) to authenticated;
grant execute on function public.list_team_activity() to authenticated;
grant execute on function public.list_team_threads() to authenticated;
grant execute on function public.list_team_pins(uuid) to authenticated;
grant execute on function public.list_team_saved(boolean) to authenticated;
