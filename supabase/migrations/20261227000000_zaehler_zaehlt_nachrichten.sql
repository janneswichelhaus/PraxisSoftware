-- ANN-647 (Jannes 2026-11-17): Der Zähler an „Nachrichten“ zählt jede neue Nachricht in einem
-- Gespräch, das benachrichtigt - auch im Kanal mit Stufe „alle“ und im verfolgten Thread -, dazu
-- Erwähnungen überall, jede nur einmal, und fällige Erinnerungen. Bis dahin zählten Kanäle nicht.

create or replace function public.get_team_chat_summary() RETURNS TABLE(badge integer, unread_conversations integer, threads_new integer, activity_unread integer, saved_open integer, reminders_due integer, scheduled integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_org         uuid;
  v_staff       uuid;
  v_neu         integer;
  v_fett        integer;
  v_threads     integer;
  v_aktivitaet  integer;
  v_offen       integer;
  v_faellig     integer;
  v_geplant     integer;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  -- Dieselbe Regel wie für fett gezeigte Gespräche, nur je Nachricht statt je Gespräch.
  select count(*) into v_neu
  from public.list_team_channels() k
  join public.team_messages m on m.channel_id = k.id
  where app.team_unread(m.channel_id, m.parent_id, m.also_in_channel, m.created_at,
                        m.author_staff_member_id, m.removed_at, v_staff)
    and ((k.kind <> 'fleet' and not k.archived
          and (k.notify = 'all' or (k.kind in ('direct', 'group') and k.notify <> 'none')))
         or exists (select 1 from public.team_message_mentions mm
                    where mm.message_id = m.id and mm.staff_member_id = v_staff));

  select count(*) filter (where k.kind <> 'fleet' and not k.archived
                          and (k.mentions > 0 or (k.notify = 'all' and k.unread > 0)
                               or (k.kind in ('direct', 'group') and k.notify <> 'none' and k.unread > 0)))
    into v_fett
  from public.list_team_channels() k;

  select count(*) filter (where t.new_replies > 0) into v_threads from public.list_team_threads() t;
  select count(*) filter (where a.unread) into v_aktivitaet from public.list_team_activity() a;
  select count(*), count(*) filter (where s.due) into v_offen, v_faellig
  from public.list_team_saved(false) s;
  select count(*) into v_geplant from public.list_team_scheduled();

  return query
  select (v_neu + v_faellig)::integer, v_fett, v_threads, v_aktivitaet,
         v_offen, v_faellig, v_geplant;
end;
$$;
