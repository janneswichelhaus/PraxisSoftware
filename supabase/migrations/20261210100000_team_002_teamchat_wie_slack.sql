-- =============================================================================
-- TEAM-002 Teamchat wie Slack (Überholung Teamchat, Pfad A)
--
-- Baut auf TEAM-001 auf (`20261204100000_team_001_teamchat.sql`); was dort
-- über Beschäftigtendaten, Löschen und Rechte steht, gilt unverändert: keine
-- Lesebestätigung, kein Online-Status, der Lesestand nur für die Person selbst
-- (ANN-609), Direktnachrichten nur für die Beteiligten - auch owner nicht -,
-- zwölf Monate je Nachricht (ADR-008 Punkt 12, ANN-610), Zugriff nur über
-- SECURITY-DEFINER-Funktionen, kein Auditeintrag (ADR-010 Punkt 17), kein
-- Text in Fehlern (ADR-011).
--
-- Teil 1 - Lesen und Zustellen ohne Verlust (ANN-640, ANN-641):
--   * Lesestand je Thread (`team_thread_states`): Das Gespräch zählt nur, was
--     in ihm steht (Ausgangsnachrichten, Antworten „auch im Kanal“), jeder
--     Thread seine Antworten. Das Öffnen eines Threads zieht nur dessen Stand
--     vor - bis TEAM-001 zog es den ganzen Kanal vor, auch Ungesehenes. Man
--     folgt einem Thread, den man begonnen, beantwortet hat oder in dem man
--     erwähnt ist, in Direkt- und Gruppennachrichten jedem; Folgen und
--     Entfolgen geht von Hand.
--   * Gelesen nur bis zur gezeigten Nachricht (`p_up_to`): Was zwischen dem
--     Laden und dem Markieren eintrifft, bleibt neu.
--   * Senden mit einer Kennung des Geräts (`p_id`, ADR-024 Punkt 7): zweimal
--     gesendet ist einmal gespeichert; eine fremde Kennung antwortet wie eine
--     unbekannte.
--   * Blättern mit Cursor (Zeit, Kennung) zurück, vorwärts und um eine Stelle
--     herum - ohne Lücke und ohne Doppel, auch bei gleicher Zeit.
--   * Behoben: Am Anker ohne Verfasser:in war `own` leer statt falsch.
--
-- Teil 2 - Slack-Kern ohne Regelkonflikt (ANN-642 bis ANN-647):
--   * private Kanäle (nur Mitglieder lesen, auch owner nicht) und
--     Gruppennachrichten mit drei bis neun Personen;
--   * Antworten „auch im Kanal“, Nachrichten zu einer späteren Zeit;
--   * Reaktionen aus einer festen Auswahl, Anheften, „Für später“ mit
--     Erinnerung in der App, je Gespräch „alle“, „nur Erwähnungen“ oder
--     „stumm“ und Favoriten, @alle in Kanälen;
--   * Suche mit Filtern (Gespräch, Person, Zeitraum) und ein Zähler für die
--     Navigation - Benachrichtigung in der App, kein Push (ADR-024 Punkt 12).
--
-- `public.apply_retention` und `public.reapply_deletion_journal` bleiben
-- unverändert: Jede neue Tabelle hängt an Nachricht oder Gespräch (cascade),
-- fällt mit dem Inhalt einer Nachricht (Auslöser unten) und mit dem
-- Ausscheiden (`app.delete_due_team_messages`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Gesprächsarten: private Kanäle und Gruppennachrichten (ANN-642)
-- -----------------------------------------------------------------------------
alter table public.team_channels drop constraint team_channels_kind_check;
alter table public.team_channels drop constraint team_channels_name;
alter table public.team_channels drop constraint team_channels_direct;
alter table public.team_channels
  add constraint team_channels_kind_check
    check (kind in ('channel', 'private', 'direct', 'group', 'fleet')),
  -- Kanäle tragen einen Namen; Direkt- und Gruppennachrichten heißen wie die
  -- anderen Beteiligten.
  add constraint team_channels_name
    check ((kind in ('channel', 'private')) = (name is not null)),
  add constraint team_channels_direct
    check (kind in ('channel', 'private') or (description is null and archived_at is null));

-- Ein Name gilt für offene und private Kanäle zusammen (wie Slack).
drop index public.team_channels_name_unique;
create unique index team_channels_name_unique
  on public.team_channels (organization_id, lower(name)) where kind in ('channel', 'private');

comment on table public.team_channels is
  'TEAM-001, TEAM-002: Gespräche des Teamchats - offene Kanäle (alle Teilnehmenden der Praxis), private Kanäle und Gruppennachrichten (nur ihre Mitglieder, team_channel_members, ANN-642), Direktnachrichten (genau zwei Personen) und das eine Gespräch der Radflotte (wer die Flotte liest, ANN-613). Datenklasse teamchat (ANN-610).';
comment on table public.team_channel_members is
  'TEAM-001, TEAM-002: die Mitglieder einer Direktnachricht (zwei), einer Gruppennachricht (drei bis neun) und eines privaten Kanals. Nur sie lesen das Gespräch, auch owner nicht (ANN-609, ANN-642).';

-- -----------------------------------------------------------------------------
-- 2. Nachrichten: „auch im Kanal“ und später senden (ANN-643)
-- -----------------------------------------------------------------------------
alter table public.team_messages
  add column also_in_channel boolean not null default false,
  add constraint team_messages_also_in_channel check (not also_in_channel or parent_id is not null);

comment on column public.team_messages.also_in_channel is
  'TEAM-002 (ANN-643): eine Antwort, die zusätzlich im Gespräch steht (wie Slack „auch an den Kanal senden“).';
comment on column public.team_messages.created_at is
  'Zeitpunkt der Nachricht. Liegt er in der Zukunft, ist sie geplant (ANN-643): Bis dahin sieht sie nur die Person, die sie verfasst hat, unter „Geplant“; danach steht sie im Gespräch wie jede andere.';

create index team_messages_view_idx
  on public.team_messages (channel_id, created_at, id) where parent_id is null or also_in_channel;

-- -----------------------------------------------------------------------------
-- 3. Lesestand und Folgen je Thread (ANN-640)
-- -----------------------------------------------------------------------------
create table public.team_thread_states (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  -- Die Ausgangsnachricht des Threads.
  root_message_id  uuid not null references public.team_messages (id) on delete cascade,
  staff_member_id  uuid not null references public.staff_members (id) on delete cascade,
  -- Folgt die Person dem Thread? Nur dann zählen neue Antworten für sie.
  following        boolean not null default true,
  -- Die Zeit der neuesten gesehenen Nachricht im Thread - NICHT, wann gelesen
  -- wurde (wie team_read_states, ANN-609).
  read_up_to       timestamptz not null,
  unique (root_message_id, staff_member_id)
);

create index team_thread_states_staff_idx on public.team_thread_states (staff_member_id);
create index team_thread_states_organization_id_idx on public.team_thread_states (organization_id);

comment on table public.team_thread_states is
  'TEAM-002 (ANN-640): der eigene Stand an einem Thread - ob die Person folgt und bis zu welcher Nachricht sie ihn gesehen hat. Nur für die eigenen Zähler, nur für die Person selbst lesbar (ANN-609). Datenklasse teamchat.';
comment on column public.team_thread_states.read_up_to is
  'Erstellzeit der neuesten gesehenen Nachricht im Thread, nicht der Zeitpunkt des Lesens.';
comment on table public.team_read_states is
  'TEAM-001, TEAM-002 (§20, ANN-609): der eigene Lesestand je Gespräch über das, was im Gespräch steht - Antworten im Thread zählt der Stand am Thread (team_thread_states). Nur für die eigenen Zähler, nur für die Person selbst lesbar, auch nicht für owner. Keine Lesebestätigung.';

-- Bestand: Wer bisher einem Thread folgte (begonnen, geantwortet, darin
-- erwähnt), folgt ihm weiter. Der bisherige Lesestand des Gesprächs zählte
-- auch Antworten und gilt deshalb als Stand am Thread.
insert into public.team_thread_states (organization_id, root_message_id, staff_member_id, following, read_up_to)
select r.organization_id, r.id, f.staff_member_id, true,
       coalesce(rs.read_up_to, '-infinity'::timestamptz)
from public.team_messages r
cross join lateral (
  select r.author_staff_member_id as staff_member_id
  union
  select t.author_staff_member_id from public.team_messages t where t.parent_id = r.id
  union
  select mm.staff_member_id
  from public.team_message_mentions mm
  join public.team_messages t on t.id = mm.message_id
  where t.id = r.id or t.parent_id = r.id
) f
left join public.team_read_states rs
  on rs.channel_id = r.channel_id and rs.staff_member_id = f.staff_member_id
where r.parent_id is null and f.staff_member_id is not null
on conflict (root_message_id, staff_member_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Reaktionen, Anheften, „Für später“, Einstellungen je Gespräch
-- -----------------------------------------------------------------------------
-- Reaktionen aus einer festen Auswahl (ANN-644): ein Schlüssel, kein freier
-- Text - es entsteht kein zweiter Kanal für Inhalte. Ohne Zeitpunkt: Wann
-- jemand reagiert hat, braucht niemand (§20).
create table public.team_message_reactions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id      uuid not null references public.team_messages (id) on delete cascade,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  reaction        text not null
    check (reaction in ('daumen', 'erledigt', 'augen', 'danke', 'herz', 'lachen', 'feier', 'frage')),
  unique (message_id, staff_member_id, reaction)
);

create index team_message_reactions_staff_idx on public.team_message_reactions (staff_member_id);
create index team_message_reactions_organization_id_idx on public.team_message_reactions (organization_id);

comment on table public.team_message_reactions is
  'TEAM-002 (ANN-644): Reaktionen auf Nachrichten aus einer festen Auswahl. Wer reagiert hat, sehen alle, die das Gespräch lesen - eine freiwillige Antwort, keine Lesebestätigung, ohne Zeitpunkt (§20). Fällt mit der Nachricht oder ihrem Inhalt.';

-- Angeheftet (ANN-645): je Gespräch eine kurze Liste, für alle, die es lesen.
-- Ohne „von wem“ und „wann“ - die Nachricht selbst trägt beides.
create table public.team_message_pins (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id      uuid not null references public.team_channels (id) on delete cascade,
  message_id      uuid not null unique references public.team_messages (id) on delete cascade
);

create index team_message_pins_channel_idx on public.team_message_pins (channel_id);
create index team_message_pins_organization_id_idx on public.team_message_pins (organization_id);

comment on table public.team_message_pins is
  'TEAM-002 (ANN-645): angeheftete Nachrichten eines Gesprächs, höchstens 50, für alle, die es lesen. Fällt mit der Nachricht oder ihrem Inhalt - Dauerhaftes gehört in den Fachprozess (§10).';

-- „Für später“ (ANN-646): nur für die Person selbst, mit optionaler
-- Erinnerung, die in der App erscheint (kein Push, ADR-024 Punkt 12).
create table public.team_saved_messages (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id      uuid not null references public.team_messages (id) on delete cascade,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  saved_at        timestamptz not null default now(),
  remind_at       timestamptz,
  done_at         timestamptz,
  unique (message_id, staff_member_id)
);

create index team_saved_messages_staff_idx on public.team_saved_messages (staff_member_id);
create index team_saved_messages_organization_id_idx on public.team_saved_messages (organization_id);

comment on table public.team_saved_messages is
  'TEAM-002 (ANN-646): Nachrichten „für später“ - nur für die Person selbst lesbar, mit Erinnerung in der App und „erledigt“. Verlängert die Frist der Nachricht nicht; fällt mit ihr oder ihrem Inhalt, beim Verlassen des Gesprächs und mit dem Ausscheiden.';

-- Je Person und Gespräch (ANN-647): Benachrichtigungsstufe und Favorit.
create table public.team_channel_settings (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id      uuid not null references public.team_channels (id) on delete cascade,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  -- all: alles zählt; mentions: nur Erwähnungen; none: stumm (Erwähnungen
  -- zählen trotzdem - wie Slack).
  notify          text not null default 'all' check (notify in ('all', 'mentions', 'none')),
  starred         boolean not null default false,
  unique (channel_id, staff_member_id)
);

create index team_channel_settings_staff_idx on public.team_channel_settings (staff_member_id);
create index team_channel_settings_organization_id_idx on public.team_channel_settings (organization_id);

comment on table public.team_channel_settings is
  'TEAM-002 (ANN-647): je Person und Gespräch die Benachrichtigungsstufe (alle, nur Erwähnungen, stumm) und der Favorit - nur für die Person selbst lesbar. Fällt mit dem Gespräch, beim Verlassen und mit dem Ausscheiden.';

alter table public.team_thread_states enable row level security;
alter table public.team_message_reactions enable row level security;
alter table public.team_message_pins enable row level security;
alter table public.team_saved_messages enable row level security;
alter table public.team_channel_settings enable row level security;
-- Wie die Tabellen aus TEAM-001: kein Tabellenrecht, auch kein TRUNCATE.
revoke all on public.team_thread_states, public.team_message_reactions, public.team_message_pins,
  public.team_saved_messages, public.team_channel_settings from public, anon, authenticated;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('team_thread_states', 'teamchat', 'automatisch',
   'Eigener Stand an einem Thread (TEAM-002): fällt mit der Ausgangsnachricht (cascade), beim Verlassen des Gesprächs und mit dem Ausscheiden der Person (ANN-640).',
   245),
  ('team_message_reactions', 'teamchat', 'automatisch',
   'Reaktionen (TEAM-002): fallen mit der Nachricht (cascade) oder ihrem Inhalt (ANN-644).',
   246),
  ('team_message_pins', 'teamchat', 'automatisch',
   'Angeheftetes (TEAM-002): fällt mit der Nachricht (cascade) oder ihrem Inhalt (ANN-645).',
   247),
  ('team_saved_messages', 'teamchat', 'automatisch',
   'Für später (TEAM-002): fällt mit der Nachricht (cascade) oder ihrem Inhalt, beim Verlassen des Gesprächs und mit dem Ausscheiden (ANN-646).',
   248),
  ('team_channel_settings', 'teamchat', 'automatisch',
   'Einstellungen je Gespräch (TEAM-002): fallen mit dem Gespräch (cascade), beim Verlassen und mit dem Ausscheiden (ANN-647).',
   249);

-- Fällt der Inhalt einer Nachricht (eigenes Löschen mit Antworten, Entfernen,
-- Frist, Wiederanwendung nach einem Restore), fällt alles, was an ihm hängt:
-- Erwähnungen, Reaktionen, Angeheftetes, „Für später“. Eine Stelle für alle
-- Wege, auch den aus `public.reapply_deletion_journal`.
create function app.team_message_content_removed()
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
  return null;
end;
$$;

revoke all on function app.team_message_content_removed() from public, anon, authenticated;

create trigger team_messages_inhalt_entfernt
  after update of body on public.team_messages
  for each row when (old.body is not null and new.body is null)
  execute function app.team_message_content_removed();

-- -----------------------------------------------------------------------------
-- 5. Hilfen
-- -----------------------------------------------------------------------------
-- Ob die Person das Gespräch liest: offener Kanal der Praxis, das Gespräch der
-- Radflotte (wer die Flotte liest, ANN-613) oder als Mitglied einer Direkt-
-- oder Gruppennachricht oder eines privaten Kanals (ANN-642).
create or replace function app.team_channel_readable(p_channel uuid, p_org uuid, p_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_channels c
    where c.id = p_channel and c.organization_id = p_org
      and (c.kind = 'channel'
           or (c.kind = 'fleet' and app.team_staff_reads_fleet(p_org, p_staff))
           -- Mitglieder zählen nur, wo es Mitglieder gibt (Zweitreview R3).
           or (c.kind in ('direct', 'group', 'private')
               and exists (select 1 from public.team_channel_members m
                           where m.channel_id = c.id and m.staff_member_id = p_staff)))
  )
$$;

create function app.team_channel_read_up_to(p_channel uuid, p_staff uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rs.read_up_to from public.team_read_states rs
                   where rs.channel_id = p_channel and rs.staff_member_id = p_staff),
                  '-infinity'::timestamptz)
$$;

-- Ist eine Nachricht für die Person neu? Was im Gespräch steht, nach dem Stand
-- des Gesprächs; eine Antwort nach dem Stand am Thread - nur, wenn sie folgt;
-- eine Antwort „auch im Kanal“ ist gelesen, wo immer sie gesehen wurde.
-- Eigenes, Entferntes und noch nicht Veröffentlichtes ist nie neu.
create function app.team_unread(
  p_channel   uuid,
  p_parent    uuid,
  p_broadcast boolean,
  p_created   timestamptz,
  p_author    uuid,
  p_removed   timestamptz,
  p_staff     uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_removed is null and p_created <= now()
     and p_author is distinct from p_staff
     and case
           when p_parent is null then p_created > app.team_channel_read_up_to(p_channel, p_staff)
           when p_broadcast then
             p_created > greatest(
               app.team_channel_read_up_to(p_channel, p_staff),
               coalesce((select ts.read_up_to from public.team_thread_states ts
                         where ts.root_message_id = p_parent and ts.staff_member_id = p_staff
                           and ts.following),
                        '-infinity'::timestamptz))
           else coalesce((select ts.following and p_created > ts.read_up_to
                          from public.team_thread_states ts
                          where ts.root_message_id = p_parent and ts.staff_member_id = p_staff),
                         false)
         end
$$;

-- Folgt die Person dem Thread?
create function app.team_follows(p_root uuid, p_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select ts.following from public.team_thread_states ts
                   where ts.root_message_id = p_root and ts.staff_member_id = p_staff), false)
$$;

-- Einem Thread folgen. Neu angelegt gilt als gesehen, was bis `p_seit` kam;
-- ein vorhandener Stand bleibt, die Person folgt wieder.
create function app.team_follow_thread(p_root uuid, p_staff uuid, p_seit timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.team_thread_states
    (organization_id, root_message_id, staff_member_id, following, read_up_to)
  select r.organization_id, r.id, p_staff, true, coalesce(p_seit, r.created_at)
  from public.team_messages r
  where r.id = p_root and r.parent_id is null
  on conflict (root_message_id, staff_member_id) do update set following = true
$$;

-- Den Stand des Gesprächs bis zur neuesten Nachricht im Gespräch vorziehen,
-- die höchstens `p_up_to` alt ist - nie zurück, nie über Ungezeigtes hinaus.
create function app.team_mark_channel_read(
  p_channel uuid,
  p_org     uuid,
  p_staff   uuid,
  p_up_to   timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.team_read_states (organization_id, channel_id, staff_member_id, read_up_to)
  select p_org, p_channel, p_staff, max(m.created_at)
  from public.team_messages m
  where m.channel_id = p_channel and (m.parent_id is null or m.also_in_channel)
    and m.created_at <= now()
    and m.created_at <= coalesce(p_up_to, 'infinity'::timestamptz)
  having max(m.created_at) is not null
  on conflict (channel_id, staff_member_id)
  do update set read_up_to = greatest(public.team_read_states.read_up_to, excluded.read_up_to)
$$;

-- Den Stand am Thread vorziehen - nur, wenn es einen gibt. Wer einem Thread
-- nicht folgt, hat keinen und braucht keinen.
create function app.team_mark_thread_read(p_root uuid, p_staff uuid, p_up_to timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.team_thread_states ts
     set read_up_to = greatest(ts.read_up_to, x.bis)
  from (select max(m.created_at) as bis
        from public.team_messages m
        where (m.id = p_root or m.parent_id = p_root) and m.created_at <= now()
          and m.created_at <= coalesce(p_up_to, 'infinity'::timestamptz)) x
  where ts.root_message_id = p_root and ts.staff_member_id = p_staff and x.bis is not null
$$;

-- Die Nachrichten einer Ansicht: ohne `p_parent` was im Gespräch steht
-- (Ausgangsnachrichten und Antworten „auch im Kanal“), mit `p_parent` die
-- Antworten des Threads; nur Veröffentlichtes.
create function app.team_view(p_channel uuid, p_parent uuid)
returns setof public.team_messages
language sql
stable
security definer
set search_path = ''
as $$
  select x.*
  from public.team_messages x
  where x.channel_id = p_channel and x.created_at <= now()
    and case when p_parent is null then x.parent_id is null or x.also_in_channel
             else x.parent_id = p_parent end
$$;

-- Eine lesbare, veröffentlichte Nachricht mit Inhalt - sonst nichts. Für
-- Reaktionen, Anheften und „Für später“.
create function app.team_readable_message(p_message uuid, p_org uuid, p_staff uuid)
returns public.team_messages
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.team_messages m
  where m.id = p_message and m.organization_id = p_org and m.removed_at is null
    and m.created_at <= now()
    and app.team_channel_readable(m.channel_id, p_org, p_staff)
$$;

-- Was eine Person verlässt oder verliert, nimmt ihren eigenen Stand mit:
-- Lesestand, Stand an Threads, Einstellungen und „Für später“ in diesem
-- Gespräch. Ihre Nachrichten und Reaktionen bleiben - sie gehören allen, die
-- das Gespräch lesen.
create function app.team_forget_channel(p_channel uuid, p_staff uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.team_read_states where channel_id = p_channel and staff_member_id = p_staff;
  delete from public.team_thread_states ts
  using public.team_messages m
  where m.id = ts.root_message_id and m.channel_id = p_channel and ts.staff_member_id = p_staff;
  delete from public.team_channel_settings where channel_id = p_channel and staff_member_id = p_staff;
  delete from public.team_saved_messages s
  using public.team_messages m
  where m.id = s.message_id and m.channel_id = p_channel and s.staff_member_id = p_staff;
$$;

-- Ein Kanalname: getrimmt, 1 bis 40 Zeichen; die Beschreibung höchstens 200.
create function app.team_channel_name(p_name text, p_description text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_text text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_name is null or length(v_name) > 40 or (v_text is not null and length(v_text) > 200) then
    raise exception 'channel name needs one to 40 characters' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

-- Darf die Person das Gespräch verwalten (umbenennen, archivieren, Mitglieder
-- entfernen)? owner und Teamleitung - am privaten Kanal nur als Mitglied
-- (ANN-611, ANN-642).
create function app.team_channel_manageable(p_channel uuid, p_org uuid, p_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_manage_team_channels() and exists (
    select 1 from public.team_channels c
    where c.id = p_channel and c.organization_id = p_org
      and (c.kind = 'channel'
           or (c.kind = 'private'
               and exists (select 1 from public.team_channel_members m
                           where m.channel_id = c.id and m.staff_member_id = p_staff)))
  )
$$;

revoke all on function app.team_channel_read_up_to(uuid, uuid) from public, anon, authenticated;
revoke all on function app.team_unread(uuid, uuid, boolean, timestamptz, uuid, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function app.team_follows(uuid, uuid) from public, anon, authenticated;
revoke all on function app.team_follow_thread(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.team_mark_channel_read(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function app.team_mark_thread_read(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.team_view(uuid, uuid) from public, anon, authenticated;
revoke all on function app.team_readable_message(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app.team_forget_channel(uuid, uuid) from public, anon, authenticated;
revoke all on function app.team_channel_name(text, text) from public, anon, authenticated;
revoke all on function app.team_channel_manageable(uuid, uuid, uuid) from public, anon, authenticated;

-- Ersetzt durch den Stand am Thread und den neuen Helfer.
drop function public.list_team_threads();
drop function public.list_team_activity();
drop function app.team_follows_thread(uuid, uuid);
drop function app.mark_team_read(uuid, uuid, uuid);

-- -----------------------------------------------------------------------------
-- 6. Lesen
-- -----------------------------------------------------------------------------
drop function public.list_team_channels();

-- Die Gespräche der Person mit eigenem Zähler: `unread` zählt Neues anderer im
-- Gespräch, `mentions` neue Erwähnungen - auch in Threads. Dazu ihre
-- Einstellungen und ob sie das Gespräch verwalten darf.
create function public.list_team_channels()
returns table (
  id               uuid,
  kind             text,
  name             text,
  description      text,
  archived         boolean,
  partner_staff_member_id uuid,
  partner_name     text,
  partner_active   boolean,
  -- Gruppennachricht: die anderen Mitglieder, nach Namen.
  member_names     text[],
  -- Privater Kanal und Gruppennachricht: wie viele Mitglieder.
  member_count     integer,
  unread           integer,
  mentions         integer,
  last_message_at  timestamptz,
  notify           text,
  starred          boolean,
  manageable       boolean
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
  select c.id, c.kind, c.name, c.description, c.archived_at is not null,
         pm.staff_member_id,
         app.team_staff_name(pm.staff_member_id),
         case when pm.staff_member_id is null then null
              else app.teamchat_participant(v_org, pm.staff_member_id) end,
         case when c.kind = 'group' then
           array(select app.team_staff_name(m.staff_member_id)
                 from public.team_channel_members m
                 where m.channel_id = c.id and m.staff_member_id <> v_staff
                 order by 1)
         end,
         case when c.kind in ('group', 'private') then
           (select count(*)::integer from public.team_channel_members m where m.channel_id = c.id)
         end,
         (select count(*)::integer from public.team_messages m
          where m.channel_id = c.id and (m.parent_id is null or m.also_in_channel)
            and app.team_unread(m.channel_id, m.parent_id, m.also_in_channel, m.created_at,
                                m.author_staff_member_id, m.removed_at, v_staff)),
         (select count(*)::integer from public.team_messages m
          join public.team_message_mentions mm on mm.message_id = m.id and mm.staff_member_id = v_staff
          where m.channel_id = c.id
            and app.team_unread(m.channel_id, m.parent_id, m.also_in_channel, m.created_at,
                                m.author_staff_member_id, m.removed_at, v_staff)),
         (select max(m.created_at) from public.team_messages m
          where m.channel_id = c.id and m.created_at <= now()),
         coalesce(cs.notify, 'all'),
         coalesce(cs.starred, false),
         app.team_channel_manageable(c.id, v_org, v_staff)
  from public.team_channels c
  left join public.team_channel_settings cs on cs.channel_id = c.id and cs.staff_member_id = v_staff
  left join lateral (
    select m.staff_member_id from public.team_channel_members m
    where m.channel_id = c.id and m.staff_member_id <> v_staff
    limit 1
  ) pm on c.kind = 'direct'
  where c.organization_id = v_org
    and app.team_channel_readable(c.id, v_org, v_staff);
end;
$$;

drop function public.list_team_messages(uuid, uuid, timestamptz, integer);

-- Nachrichten eines Gesprächs (ohne `p_parent`: was im Gespräch steht) oder
-- eines Threads (mit `p_parent`: die Ausgangsnachricht und die Antworten),
-- aufsteigend nach (Zeit, Kennung). Geblättert wird mit Cursor:
--   * ohne Angabe die neuesten `p_limit`,
--   * `p_before_*` die neuesten vor der Stelle (ältere laden),
--   * `p_after_*` die ältesten nach der Stelle (nachholen),
--   * `p_around` die Stelle mit ihrer Umgebung (Sprung aus Suche und „Für dich“).
-- Die Kennung entscheidet bei gleicher Zeit - so fällt beim Blättern nichts
-- zwischen zwei Seiten und nichts kommt doppelt.
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
  root_body      text
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
             where r.message_id = m.id
             group by r.reaction
           ) x), '[]'::jsonb),
         exists (select 1 from public.team_message_pins p where p.message_id = m.id),
         exists (select 1 from public.team_saved_messages s
                 where s.message_id = m.id and s.staff_member_id = v_staff),
         case when m.also_in_channel then app.team_staff_name(w.author_staff_member_id) end,
         case when m.also_in_channel then left(w.body, 200) end
  from public.team_messages m
  left join public.team_thread_states ts
    on ts.root_message_id = m.id and ts.staff_member_id = v_staff
  left join public.team_messages w on w.id = m.parent_id
  where m.id = any (coalesce(v_ids, '{}'::uuid[]))
  order by m.created_at, m.id;
end;
$$;

-- Die Personen, die man erwähnen und anschreiben kann - unverändert aus
-- TEAM-001 (`public.list_team_people`).

-- Wer ein Gespräch liest: im offenen Kanal alle Teilnehmenden, im Gespräch der
-- Radflotte, wer die Flotte liest, sonst die Mitglieder. Nur Namen, keine
-- Rollen, kein Status - und nur für die, die selbst lesen.
create function public.list_team_channel_members(p_channel uuid)
returns table (staff_member_id uuid, name text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_kind  text;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  select c.kind into v_kind from public.team_channels c where c.id = p_channel;

  return query
  select sm.id, p.given_name || ' ' || p.family_name, app.teamchat_participant(v_org, sm.id)
  from public.staff_members sm
  join public.persons p on p.id = sm.person_id
  where sm.organization_id = v_org
    and case v_kind
          when 'channel' then app.teamchat_participant(v_org, sm.id)
          when 'fleet' then app.team_staff_reads_fleet(v_org, sm.id)
          else exists (select 1 from public.team_channel_members m
                       where m.channel_id = p_channel and m.staff_member_id = sm.id)
        end
  order by p.given_name, p.family_name;
end;
$$;

drop function public.search_team_messages(text);

-- Suche in allen lesbaren Gesprächen, die neuesten 50 zuerst. Ein Wort mit
-- mindestens zwei Zeichen oder ein Filter: Gespräch, Person, Zeitraum (Tage in
-- der Zeitzone der Praxis). Geplantes findet niemand, Entferntes auch nicht.
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
     or (length(v_nadel) < 2 and (v_nadel <> '' or (p_channel is null and p_author is null))) then
    raise exception 'search needs two to 100 characters' using errcode = '22023';
  end if;
  select coalesce(o.time_zone, 'Europe/Berlin') into v_zone
  from public.organizations o where o.id = v_org;

  return query
  select m.id, m.channel_id, c.kind, m.parent_id, app.team_staff_name(m.author_staff_member_id),
         m.body, m.created_at
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
         app.team_staff_name(m.author_staff_member_id), m.body, m.created_at,
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
  select x.id, x.channel_id, x.kind, x.author_name, x.body, x.removed_kind,
         x.reply_count, x.last_reply_at, x.new_replies
  from (
    select m.id, m.channel_id, c.kind,
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
  select m.id, m.parent_id, app.team_staff_name(m.author_staff_member_id), m.body, m.created_at
  from public.team_message_pins p
  join public.team_messages m on m.id = p.message_id
  where p.channel_id = p_channel and m.removed_at is null and m.created_at <= now()
  order by m.created_at desc, m.id desc;
end;
$$;

-- „Für später“ der Person - offen (`p_done` falsch) oder erledigt; nur aus
-- Gesprächen, die sie noch liest. Fällige Erinnerungen zuerst.
create function public.list_team_saved(p_done boolean default false)
returns table (
  id           uuid,
  channel_id   uuid,
  channel_kind text,
  parent_id    uuid,
  author_name  text,
  body         text,
  created_at   timestamptz,
  saved_at     timestamptz,
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
  select m.id, m.channel_id, c.kind, m.parent_id, app.team_staff_name(m.author_staff_member_id),
         m.body, m.created_at, s.saved_at, s.remind_at, s.done_at is not null,
         s.done_at is null and s.remind_at is not null and s.remind_at <= now()
  from public.team_saved_messages s
  join public.team_messages m on m.id = s.message_id
  join public.team_channels c on c.id = m.channel_id
  where s.staff_member_id = v_staff and s.organization_id = v_org
    and (s.done_at is not null) = coalesce(p_done, false)
    and m.removed_at is null and m.created_at <= now()
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
  order by (s.done_at is null and s.remind_at is not null and s.remind_at <= now()) desc,
           s.remind_at nulls last, s.saved_at desc, m.id
  limit 200;
end;
$$;

-- Die eigenen geplanten Nachrichten (ANN-643), die früheste zuerst.
create function public.list_team_scheduled()
returns table (
  id           uuid,
  channel_id   uuid,
  channel_kind text,
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
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  return query
  select m.id, m.channel_id, c.kind, m.body, m.created_at
  from public.team_messages m
  join public.team_channels c on c.id = m.channel_id
  where m.organization_id = v_org and m.author_staff_member_id = v_staff
    and m.created_at > now() and m.removed_at is null
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
  order by m.created_at, m.id;
end;
$$;

-- Der Zähler für die Navigation (ANN-647) - die Benachrichtigung in der App
-- (ADR-024 Punkt 12, kein Push):
--   * `badge`: neue Direkt- und Gruppennachrichten (außer stummen), alle neuen
--     Erwähnungen und fällige Erinnerungen;
--   * `unread_conversations`: Gespräche im Teamchat, die fett stehen;
--   * `threads_new`, `activity_unread`, `saved_open`, `reminders_due`,
--     `scheduled` für die Kurzwege.
-- Nur aus dem eigenen Stand; über andere steht hier nichts.
create function public.get_team_chat_summary()
returns table (
  badge                integer,
  unread_conversations integer,
  threads_new          integer,
  activity_unread      integer,
  saved_open           integer,
  reminders_due        integer,
  scheduled            integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org         uuid;
  v_staff       uuid;
  v_direkt      integer;
  v_erwaehnt    integer;
  v_fett        integer;
  v_threads     integer;
  v_aktivitaet  integer;
  v_offen       integer;
  v_faellig     integer;
  v_geplant     integer;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  select coalesce(sum(k.unread) filter (where k.kind in ('direct', 'group') and k.notify <> 'none'), 0),
         coalesce(sum(k.mentions), 0),
         count(*) filter (where k.kind <> 'fleet' and not k.archived
                          and (k.mentions > 0 or (k.notify = 'all' and k.unread > 0)
                               or (k.kind in ('direct', 'group') and k.notify <> 'none' and k.unread > 0)))
    into v_direkt, v_erwaehnt, v_fett
  from public.list_team_channels() k;

  select count(*) filter (where t.new_replies > 0) into v_threads from public.list_team_threads() t;
  select count(*) filter (where a.unread) into v_aktivitaet from public.list_team_activity() a;
  select count(*), count(*) filter (where s.due) into v_offen, v_faellig
  from public.list_team_saved(false) s;
  select count(*) into v_geplant from public.list_team_scheduled();

  return query
  select (v_direkt + v_erwaehnt + v_faellig)::integer, v_fett, v_threads, v_aktivitaet,
         v_offen, v_faellig, v_geplant;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Schreiben
-- -----------------------------------------------------------------------------
drop function public.post_team_message(uuid, uuid, text, uuid[]);

-- Senden.
--   * `p_id` vergibt das Gerät (ADR-024 Punkt 7, ANN-641): Eine bekannte
--     Kennung derselben Person im selben Gespräch und Thread liefert die
--     Nachricht zurück, ohne sie zu verdoppeln; eine schon gelöschte legt
--     nichts neu an; jede andere antwortet wie eine unbekannte.
--   * `p_mention_all` (@alle, ANN-647): erwähnt alle, die das Gespräch lesen.
--   * `p_also_in_channel`: eine Antwort steht zusätzlich im Gespräch.
--   * `p_send_at` (ANN-643): eine Ausgangsnachricht erscheint erst dann -
--     frühestens in einer Minute, spätestens in 30 Tagen.
create function public.post_team_message(
  p_channel         uuid,
  p_parent          uuid,
  p_body            text,
  p_mentions        uuid[] default '{}',
  p_id              uuid default null,
  p_mention_all     boolean default false,
  p_also_in_channel boolean default false,
  p_send_at         timestamptz default null
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
  v_channel   public.team_channels%rowtype;
  v_vorhanden public.team_messages%rowtype;
  v_id        uuid;
  v_zeit      timestamptz;
  v_seit      timestamptz;
  v_erwaehnt  uuid[];
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_text := app.team_message_text(p_body);

  if p_id is not null then
    select * into v_vorhanden from public.team_messages where id = p_id;
    if v_vorhanden.id is not null then
      if v_vorhanden.organization_id = v_org and v_vorhanden.channel_id = p_channel
         and v_vorhanden.author_staff_member_id = v_staff
         and v_vorhanden.parent_id is not distinct from p_parent then
        return p_id;
      end if;
      raise exception 'team message not found' using errcode = 'P0002';
    end if;
    -- Eine Wiederholung nach dem eigenen Löschen bringt nichts zurück.
    if exists (select 1 from public.deletion_journal j
               where j.organization_id = v_org and j.target_id = p_id
                 and j.target_table in ('team_messages', 'team_message_contents')) then
      return p_id;
    end if;
  end if;

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

  insert into public.team_messages
    (id, organization_id, channel_id, parent_id, author_staff_member_id, body, also_in_channel, created_at)
  values (coalesce(p_id, extensions.gen_random_uuid()), v_org, p_channel, p_parent, v_staff, v_text,
          coalesce(p_also_in_channel, false), coalesce(p_send_at, now()))
  on conflict (id) do nothing
  returning id, created_at into v_id, v_zeit;

  if v_id is null then
    -- Gleichzeitig mit derselben Kennung: Die andere Anfrage hat angelegt.
    select * into v_vorhanden from public.team_messages where id = p_id;
    if v_vorhanden.organization_id = v_org and v_vorhanden.channel_id = p_channel
       and v_vorhanden.author_staff_member_id = v_staff
       and v_vorhanden.parent_id is not distinct from p_parent then
      return p_id;
    end if;
    raise exception 'team message not found' using errcode = 'P0002';
  end if;

  -- @alle: alle, die das Gespräch lesen; set_team_mentions prüft jede Person.
  v_erwaehnt := coalesce(p_mentions, '{}'::uuid[]);
  if coalesce(p_mention_all, false) then
    v_erwaehnt := v_erwaehnt || array(select l.staff_member_id
                                      from public.list_team_channel_members(p_channel) l
                                      where l.active);
  end if;
  perform app.set_team_mentions(v_id, v_erwaehnt);

  if p_parent is null then
    -- Eine geplante Nachricht zieht den eigenen Stand nicht vor.
    if p_send_at is null then
      perform app.team_mark_channel_read(p_channel, v_org, v_staff, v_zeit);
    end if;
    -- Wer beginnt oder erwähnt ist, folgt dem Thread ab hier.
    perform app.team_follow_thread(v_id, v_staff, v_zeit);
    perform app.team_follow_thread(v_id, mm.staff_member_id, v_zeit)
    from public.team_message_mentions mm where mm.message_id = v_id;
  else
    v_seit := (select max(m.created_at) from public.team_messages m
               where (m.id = p_parent or m.parent_id = p_parent) and m.created_at < v_zeit);
    perform app.team_follow_thread(p_parent, v_staff, v_zeit);
    perform app.team_mark_thread_read(p_parent, v_staff, v_zeit);
    if coalesce(p_also_in_channel, false) then
      perform app.team_mark_channel_read(p_channel, v_org, v_staff, v_zeit);
    end if;
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

drop function public.edit_team_message(uuid, text, uuid[]);

-- Bearbeiten: neuer Text und neue Erwähnungen, Marke „bearbeitet“, kein
-- Verlauf. Wer neu erwähnt ist, folgt dem Thread. Eine geplante Nachricht hat
-- noch niemand gesehen - sie trägt danach keine Marke.
create function public.edit_team_message(
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
  v_text := app.team_message_text(p_body);
  update public.team_messages m
     set body = v_text,
         edited_at = case when m.created_at <= now() then now() end
   where m.id = p_message and m.organization_id = v_org
     and m.author_staff_member_id = v_staff and m.removed_at is null
     and app.team_channel_readable(m.channel_id, v_org, v_staff)
     and not exists (select 1 from public.team_channels c
                     where c.id = m.channel_id and c.archived_at is not null)
  returning m.* into v_m;
  if v_m.id is null then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
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

-- Löschen (TEAM-001): die eigene Nachricht endgültig, mit Antworten bleibt der
-- Anker; owner entfernt fremde Nachrichten in offenen Kanälen und im Gespräch
-- der Radflotte - nie in privaten Kanälen, Direkt- oder Gruppennachrichten.
-- Eine noch nicht veröffentlichte Nachricht sieht und löscht nur, wer sie
-- verfasst hat.
create or replace function public.delete_team_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_m       public.team_messages%rowtype;
  v_kind    text;
  v_antwort boolean;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  -- for update: Eine gleichzeitig eingehende Antwort wartet, bis hier
  -- entschieden ist - sonst nähme das Löschen sie über cascade mit.
  select * into v_m from public.team_messages
   where id = p_message and organization_id = v_org and removed_at is null
     and (created_at <= now() or author_staff_member_id = v_staff)
   for update;
  if v_m.id is null or not app.team_channel_readable(v_m.channel_id, v_org, v_staff) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;

  if v_m.author_staff_member_id = v_staff then
    v_kind := 'author';
  elsif app.has_any_role('owner')
        and exists (select 1 from public.team_channels c
                    where c.id = v_m.channel_id and c.kind in ('channel', 'fleet')) then
    v_kind := 'owner';
  else
    raise exception 'not allowed to delete this team message' using errcode = '42501';
  end if;

  v_antwort := exists (select 1 from public.team_messages r where r.parent_id = v_m.id);
  -- Ins Löschjournal, damit ein Restore den Text nicht zurückbringt (ADR-008
  -- Punkt 8), tageweise gebündelt (Zweitreview TEAM-001, N4).
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
  values (v_org, md5('team_manual:' || v_org::text || ':' || current_date::text)::uuid,
          case when v_kind = 'author' and not v_antwort then 'team_messages'
               else 'team_message_contents' end,
          v_m.id, 'teamchat', date_trunc('day', now()), date_trunc('day', now()));
  if v_kind = 'author' and not v_antwort then
    delete from public.team_messages where id = v_m.id;
  else
    -- Der Anker trägt keinen Namen mehr (ADR-008 Punkt 12, Zweitreview N2);
    -- Erwähnungen, Reaktionen, Angeheftetes und „Für später“ fallen über den
    -- Auslöser `team_messages_inhalt_entfernt`.
    update public.team_messages
       set body = null, edited_at = null, author_staff_member_id = null,
           removed_at = now(), removed_kind = v_kind,
           removed_by_staff_member_id = case when v_kind = 'owner' then v_staff end
     where id = v_m.id;
  end if;
end;
$$;

drop function public.mark_team_channel_read(uuid);

-- Gelesen bis höchstens `p_up_to` - der Zeit der neuesten Nachricht, die die
-- Ansicht gezeigt hat. Ohne Angabe bis zur neuesten.
create function public.mark_team_channel_read(p_channel uuid, p_up_to timestamptz default null)
returns void
language plpgsql
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
  perform app.team_mark_channel_read(p_channel, v_org, v_staff, p_up_to);
end;
$$;

-- Den eigenen Stand an einem Thread vorziehen, bis höchstens `p_up_to`. Den
-- Stand des Gesprächs lässt das unberührt (ANN-640).
create function public.mark_team_thread_read(p_root uuid, p_up_to timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_kanal uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  select m.channel_id into v_kanal from public.team_messages m
  where m.id = p_root and m.organization_id = v_org and m.parent_id is null
    and m.created_at <= now();
  if v_kanal is null or not app.team_channel_readable(v_kanal, v_org, v_staff) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  perform app.team_mark_thread_read(p_root, v_staff, p_up_to);
end;
$$;

-- Einem Thread folgen oder entfolgen. Wer folgt, hat bis jetzt alles gesehen.
create function public.set_team_thread_following(p_root uuid, p_following boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_kanal uuid;
  v_bis   timestamptz;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  select m.channel_id into v_kanal from public.team_messages m
  where m.id = p_root and m.organization_id = v_org and m.parent_id is null
    and m.created_at <= now();
  if v_kanal is null or not app.team_channel_readable(v_kanal, v_org, v_staff) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  v_bis := (select max(m.created_at) from public.team_messages m
            where (m.id = p_root or m.parent_id = p_root) and m.created_at <= now());
  insert into public.team_thread_states
    (organization_id, root_message_id, staff_member_id, following, read_up_to)
  values (v_org, p_root, v_staff, coalesce(p_following, false), v_bis)
  on conflict (root_message_id, staff_member_id)
  do update set following = excluded.following,
                read_up_to = case when excluded.following
                                  then greatest(public.team_thread_states.read_up_to, excluded.read_up_to)
                                  else public.team_thread_states.read_up_to end;
end;
$$;

-- Ab dieser Nachricht wieder ungelesen: Der eigene Stand springt vor sie zurück
-- - im Gespräch für das, was dort steht, am Thread für eine Antwort.
create function public.mark_team_unread(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_m     public.team_messages%rowtype;
  v_bis   timestamptz;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  select * into v_m from public.team_messages
  where id = p_message and organization_id = v_org and created_at <= now();
  if v_m.id is null or not app.team_channel_readable(v_m.channel_id, v_org, v_staff) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  if v_m.parent_id is null or v_m.also_in_channel then
    v_bis := coalesce((select max(x.created_at) from public.team_messages x
                       where x.channel_id = v_m.channel_id
                         and (x.parent_id is null or x.also_in_channel)
                         and x.created_at < v_m.created_at), '-infinity'::timestamptz);
    insert into public.team_read_states (organization_id, channel_id, staff_member_id, read_up_to)
    values (v_org, v_m.channel_id, v_staff, v_bis)
    on conflict (channel_id, staff_member_id) do update set read_up_to = excluded.read_up_to;
  end if;
  if v_m.parent_id is not null then
    v_bis := coalesce((select max(x.created_at) from public.team_messages x
                       where (x.id = v_m.parent_id or x.parent_id = v_m.parent_id)
                         and x.created_at < v_m.created_at), '-infinity'::timestamptz);
    insert into public.team_thread_states
      (organization_id, root_message_id, staff_member_id, following, read_up_to)
    values (v_org, v_m.parent_id, v_staff, true, v_bis)
    on conflict (root_message_id, staff_member_id)
    do update set following = true, read_up_to = excluded.read_up_to;
  end if;
end;
$$;

-- Alle eigenen Gespräche und alle Threads, denen die Person folgt, als gelesen.
create or replace function public.mark_all_team_channels_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  perform app.team_mark_channel_read(c.id, v_org, v_staff, null)
  from public.team_channels c
  where c.organization_id = v_org and app.team_channel_readable(c.id, v_org, v_staff);
  perform app.team_mark_thread_read(ts.root_message_id, v_staff, null)
  from public.team_thread_states ts
  join public.team_messages m on m.id = ts.root_message_id
  where ts.staff_member_id = v_staff and ts.following and ts.organization_id = v_org
    and app.team_channel_readable(m.channel_id, v_org, v_staff);
end;
$$;

-- Eine geplante Nachricht sofort senden oder neu planen (ANN-643).
create function public.reschedule_team_message(p_message uuid, p_send_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_m     public.team_messages%rowtype;
  v_zeit  timestamptz;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if p_send_at is not null
     and (p_send_at < now() + interval '1 minute' or p_send_at > now() + interval '30 days') then
    raise exception 'send time must be one minute to 30 days ahead' using errcode = '22023';
  end if;
  v_zeit := coalesce(p_send_at, now());
  update public.team_messages m
     set created_at = v_zeit
   where m.id = p_message and m.organization_id = v_org and m.author_staff_member_id = v_staff
     and m.created_at > now() and m.removed_at is null
     and app.team_channel_readable(m.channel_id, v_org, v_staff)
     and not exists (select 1 from public.team_channels c
                     where c.id = m.channel_id and c.archived_at is not null)
  returning m.* into v_m;
  if v_m.id is null then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  -- Wer folgt, folgt ab der neuen Zeit.
  update public.team_thread_states set read_up_to = v_zeit where root_message_id = v_m.id;
  if p_send_at is null then
    perform app.team_mark_channel_read(v_m.channel_id, v_org, v_staff, v_zeit);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Gespräche anlegen und verwalten (ANN-611, ANN-642)
-- -----------------------------------------------------------------------------
drop function public.create_team_channel(text, text);

-- Kanal anlegen (owner, Teamleitung): offen für alle oder privat mit
-- Mitgliedern - wer anlegt, gehört dazu. Unbekannte fallen still weg.
create function public.create_team_channel(
  p_name        text,
  p_description text default null,
  p_private     boolean default false,
  p_members     uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_name  text;
  v_text  text := nullif(btrim(coalesce(p_description, '')), '');
  v_id    uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.can_manage_team_channels() then
    raise exception 'not allowed to manage team channels' using errcode = '42501';
  end if;
  v_name := app.team_channel_name(p_name, p_description);
  if exists (select 1 from public.team_channels c
             where c.organization_id = v_org and c.kind in ('channel', 'private')
               and lower(c.name) = lower(v_name)) then
    raise exception 'channel name is taken' using errcode = '23505';
  end if;
  insert into public.team_channels (organization_id, kind, name, description)
  values (v_org, case when coalesce(p_private, false) then 'private' else 'channel' end, v_name, v_text)
  returning id into v_id;
  if coalesce(p_private, false) then
    insert into public.team_channel_members (organization_id, channel_id, staff_member_id)
    select v_org, v_id, x.staff
    from (select v_staff as staff
          union
          select distinct u.staff from unnest(coalesce(p_members, '{}'::uuid[])) as u (staff)
          where u.staff is not null and app.teamchat_participant(v_org, u.staff)) x;
  end if;
  return v_id;
end;
$$;

-- Name und Beschreibung ändern (wer verwalten darf).
create function public.update_team_channel(p_channel uuid, p_name text, p_description text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_name  text;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.team_channel_manageable(p_channel, v_org, v_staff) then
    if app.team_channel_readable(p_channel, v_org, v_staff) then
      raise exception 'not allowed to manage team channels' using errcode = '42501';
    end if;
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  v_name := app.team_channel_name(p_name, p_description);
  if exists (select 1 from public.team_channels c
             where c.organization_id = v_org and c.kind in ('channel', 'private')
               and lower(c.name) = lower(v_name) and c.id <> p_channel) then
    raise exception 'channel name is taken' using errcode = '23505';
  end if;
  update public.team_channels
     set name = v_name, description = nullif(btrim(coalesce(p_description, '')), '')
   where id = p_channel;
end;
$$;

-- Archivieren und zurückholen (wer verwalten darf).
create or replace function public.set_team_channel_archived(p_channel uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.can_manage_team_channels() then
    raise exception 'not allowed to manage team channels' using errcode = '42501';
  end if;
  if not app.team_channel_manageable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  update public.team_channels c
     set archived_at = case when p_archived then coalesce(c.archived_at, now()) end
   where c.id = p_channel;
end;
$$;

-- Gruppennachricht öffnen: die bestehende mit genau diesen Personen oder eine
-- neue - drei bis neun mit der Person selbst (wie Slack). Mit einer anderen
-- Person wird es die Direktnachricht.
create function public.open_team_group(p_staff_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_staff  uuid;
  v_andere uuid[];
  v_alle   uuid[];
  v_id     uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_andere := array(select distinct u.staff from unnest(coalesce(p_staff_members, '{}'::uuid[])) as u (staff)
                    where u.staff is not null and u.staff <> v_staff
                    order by 1);
  if cardinality(v_andere) = 0 or cardinality(v_andere) > 8 then
    raise exception 'a group needs three to nine people' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_andere) as u (staff)
             where not app.teamchat_participant(v_org, u.staff)) then
    raise exception 'team chat partner is not available' using errcode = '22023';
  end if;
  if cardinality(v_andere) = 1 then
    return public.open_team_direct(v_andere[1]);
  end if;
  v_alle := array(select u.staff from unnest(v_andere || v_staff) as u (staff) order by 1);

  -- Gleichzeitiges Öffnen legt nur ein Gespräch an.
  perform pg_advisory_xact_lock(hashtextextended('team_group:' || array_to_string(v_alle, ','), 0));

  select c.id into v_id
  from public.team_channels c
  where c.organization_id = v_org and c.kind = 'group'
    and (select array_agg(m.staff_member_id order by m.staff_member_id)
         from public.team_channel_members m where m.channel_id = c.id) = v_alle
  limit 1;

  if v_id is null then
    insert into public.team_channels (organization_id, kind) values (v_org, 'group')
    returning id into v_id;
    insert into public.team_channel_members (organization_id, channel_id, staff_member_id)
    select v_org, v_id, u.staff from unnest(v_alle) as u (staff);
  end if;
  return v_id;
end;
$$;

-- Personen in einen privaten Kanal holen: jedes Mitglied darf das (wie Slack).
-- Neue Mitglieder lesen auch, was vorher geschrieben wurde.
create function public.add_team_channel_members(p_channel uuid, p_staff_members uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_neu   integer;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not exists (select 1 from public.team_channels c
                 where c.id = p_channel and c.organization_id = v_org and c.kind = 'private'
                   and c.archived_at is null)
     or not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  insert into public.team_channel_members (organization_id, channel_id, staff_member_id)
  select distinct v_org, p_channel, u.staff
  from unnest(coalesce(p_staff_members, '{}'::uuid[])) as u (staff)
  where u.staff is not null and app.teamchat_participant(v_org, u.staff)
  on conflict (channel_id, staff_member_id) do nothing;
  get diagnostics v_neu = row_count;
  return v_neu;
end;
$$;

-- Jemanden aus einem privaten Kanal nehmen: wer ihn verwalten darf. Der eigene
-- Stand der Person fällt mit (`app.team_forget_channel`).
create function public.remove_team_channel_member(p_channel uuid, p_staff_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not exists (select 1 from public.team_channels c
                 where c.id = p_channel and c.organization_id = v_org and c.kind = 'private')
     or not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  if not app.team_channel_manageable(p_channel, v_org, v_staff) then
    raise exception 'not allowed to manage team channels' using errcode = '42501';
  end if;
  if p_staff_member is null or p_staff_member = v_staff then
    raise exception 'leave the channel instead' using errcode = '22023';
  end if;
  delete from public.team_channel_members
  where channel_id = p_channel and staff_member_id = p_staff_member;
  if not found then
    raise exception 'team chat partner is not available' using errcode = '22023';
  end if;
  perform app.team_forget_channel(p_channel, p_staff_member);
end;
$$;

-- Einen privaten Kanal verlassen. Der eigene Stand fällt mit; geht das letzte
-- Mitglied, liest niemand mehr - dann fällt der Kanal mit allen Nachrichten,
-- mit Eintrag im Löschjournal (ANN-642).
create function public.leave_team_channel(p_channel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not exists (select 1 from public.team_channels c
                 where c.id = p_channel and c.organization_id = v_org and c.kind = 'private')
     or not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  -- Gleichzeitiges Verlassen: einer nach dem anderen.
  perform 1 from public.team_channels where id = p_channel for update;
  delete from public.team_channel_members where channel_id = p_channel and staff_member_id = v_staff;
  perform app.team_forget_channel(p_channel, v_staff);
  if not exists (select 1 from public.team_channel_members m where m.channel_id = p_channel) then
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
    values (v_org, md5('team_manual:' || v_org::text || ':' || current_date::text)::uuid,
            'team_channels', p_channel, 'teamchat', date_trunc('day', now()), date_trunc('day', now()));
    delete from public.team_channels where id = p_channel;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Einstellungen, Reaktionen, Anheften, „Für später“
-- -----------------------------------------------------------------------------
-- Je Gespräch: Benachrichtigungsstufe und Favorit (ANN-647). Ohne Angabe
-- bleibt der bisherige Wert.
create function public.set_team_channel_preferences(
  p_channel uuid,
  p_notify  text default null,
  p_starred boolean default null
)
returns void
language plpgsql
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
  if p_notify is not null and p_notify not in ('all', 'mentions', 'none') then
    raise exception 'notify must be all, mentions or none' using errcode = '22023';
  end if;
  insert into public.team_channel_settings (organization_id, channel_id, staff_member_id, notify, starred)
  values (v_org, p_channel, v_staff, coalesce(p_notify, 'all'), coalesce(p_starred, false))
  on conflict (channel_id, staff_member_id)
  do update set notify = coalesce(p_notify, public.team_channel_settings.notify),
                starred = coalesce(p_starred, public.team_channel_settings.starred);
end;
$$;

-- Reaktion setzen oder zurücknehmen (ANN-644). Liefert, ob sie danach steht.
create function public.toggle_team_reaction(p_message uuid, p_reaction text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_m     public.team_messages%rowtype;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if p_reaction is null
     or p_reaction not in ('daumen', 'erledigt', 'augen', 'danke', 'herz', 'lachen', 'feier', 'frage') then
    raise exception 'unknown reaction' using errcode = '22023';
  end if;
  v_m := app.team_readable_message(p_message, v_org, v_staff);
  if v_m.id is null then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.team_channels c where c.id = v_m.channel_id and c.archived_at is not null) then
    raise exception 'team channel is archived' using errcode = '22023';
  end if;
  delete from public.team_message_reactions
  where message_id = p_message and staff_member_id = v_staff and reaction = p_reaction;
  if found then
    return false;
  end if;
  insert into public.team_message_reactions (organization_id, message_id, staff_member_id, reaction)
  values (v_org, p_message, v_staff, p_reaction)
  on conflict do nothing;
  return true;
end;
$$;

-- Anheften und lösen (ANN-645): jede Person, die das Gespräch liest; höchstens
-- 50 je Gespräch.
create function public.set_team_message_pinned(p_message uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_m     public.team_messages%rowtype;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_m := app.team_readable_message(p_message, v_org, v_staff);
  if v_m.id is null then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.team_channels c where c.id = v_m.channel_id and c.archived_at is not null) then
    raise exception 'team channel is archived' using errcode = '22023';
  end if;
  if not coalesce(p_pinned, false) then
    delete from public.team_message_pins where message_id = p_message;
    return;
  end if;
  -- Gleichzeitiges Anheften: die Grenze gilt für beide.
  perform 1 from public.team_channels where id = v_m.channel_id for update;
  if (select count(*) from public.team_message_pins p where p.channel_id = v_m.channel_id) >= 50
     and not exists (select 1 from public.team_message_pins p where p.message_id = p_message) then
    raise exception 'at most 50 pinned messages' using errcode = '22023';
  end if;
  insert into public.team_message_pins (organization_id, channel_id, message_id)
  values (v_org, v_m.channel_id, p_message)
  on conflict (message_id) do nothing;
end;
$$;

-- Für später merken, auf Wunsch mit Erinnerung (ANN-646) - frühestens in einer
-- Minute, spätestens in 90 Tagen. Erneutes Merken holt Erledigtes zurück.
create function public.save_team_message(p_message uuid, p_remind_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_m     public.team_messages%rowtype;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_m := app.team_readable_message(p_message, v_org, v_staff);
  if v_m.id is null then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  if p_remind_at is not null
     and (p_remind_at < now() + interval '1 minute' or p_remind_at > now() + interval '90 days') then
    raise exception 'reminder must be one minute to 90 days ahead' using errcode = '22023';
  end if;
  insert into public.team_saved_messages (organization_id, message_id, staff_member_id, remind_at)
  values (v_org, p_message, v_staff, p_remind_at)
  on conflict (message_id, staff_member_id)
  do update set remind_at = excluded.remind_at, done_at = null;
end;
$$;

-- „Für später“ ändern: erledigt oder wieder offen, Erinnerung neu oder weg.
-- `p_clear_reminder` nimmt die Erinnerung ganz weg.
create function public.update_team_saved(
  p_message        uuid,
  p_done           boolean default null,
  p_remind_at      timestamptz default null,
  p_clear_reminder boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if p_remind_at is not null
     and (p_remind_at < now() + interval '1 minute' or p_remind_at > now() + interval '90 days') then
    raise exception 'reminder must be one minute to 90 days ahead' using errcode = '22023';
  end if;
  update public.team_saved_messages s
     set done_at = case when p_done is null then s.done_at
                        when p_done then coalesce(s.done_at, now()) end,
         remind_at = case when coalesce(p_clear_reminder, false) then null
                          else coalesce(p_remind_at, s.remind_at) end
   where s.message_id = p_message and s.staff_member_id = v_staff and s.organization_id = v_org;
  if not found then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Nicht mehr merken.
create function public.unsave_team_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  delete from public.team_saved_messages
  where message_id = p_message and staff_member_id = v_staff and organization_id = v_org;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Rechte an den Funktionen
-- -----------------------------------------------------------------------------
revoke all on function public.list_team_channels() from public, anon;
revoke all on function public.list_team_messages(uuid, uuid, timestamptz, uuid, timestamptz, uuid, uuid, integer)
  from public, anon;
revoke all on function public.list_team_channel_members(uuid) from public, anon;
revoke all on function public.search_team_messages(text, uuid, uuid, date, date) from public, anon;
revoke all on function public.list_team_activity() from public, anon;
revoke all on function public.list_team_threads() from public, anon;
revoke all on function public.list_team_pins(uuid) from public, anon;
revoke all on function public.list_team_saved(boolean) from public, anon;
revoke all on function public.list_team_scheduled() from public, anon;
revoke all on function public.get_team_chat_summary() from public, anon;
revoke all on function public.post_team_message(uuid, uuid, text, uuid[], uuid, boolean, boolean, timestamptz)
  from public, anon;
revoke all on function public.edit_team_message(uuid, text, uuid[], boolean) from public, anon;
revoke all on function public.mark_team_channel_read(uuid, timestamptz) from public, anon;
revoke all on function public.mark_team_thread_read(uuid, timestamptz) from public, anon;
revoke all on function public.set_team_thread_following(uuid, boolean) from public, anon;
revoke all on function public.mark_team_unread(uuid) from public, anon;
revoke all on function public.mark_all_team_channels_read() from public, anon;
revoke all on function public.reschedule_team_message(uuid, timestamptz) from public, anon;
revoke all on function public.create_team_channel(text, text, boolean, uuid[]) from public, anon;
revoke all on function public.update_team_channel(uuid, text, text) from public, anon;
revoke all on function public.set_team_channel_archived(uuid, boolean) from public, anon;
revoke all on function public.open_team_group(uuid[]) from public, anon;
revoke all on function public.add_team_channel_members(uuid, uuid[]) from public, anon;
revoke all on function public.remove_team_channel_member(uuid, uuid) from public, anon;
revoke all on function public.leave_team_channel(uuid) from public, anon;
revoke all on function public.set_team_channel_preferences(uuid, text, boolean) from public, anon;
revoke all on function public.toggle_team_reaction(uuid, text) from public, anon;
revoke all on function public.set_team_message_pinned(uuid, boolean) from public, anon;
revoke all on function public.save_team_message(uuid, timestamptz) from public, anon;
revoke all on function public.update_team_saved(uuid, boolean, timestamptz, boolean) from public, anon;
revoke all on function public.unsave_team_message(uuid) from public, anon;

grant execute on function public.list_team_channels() to authenticated;
grant execute on function public.list_team_messages(uuid, uuid, timestamptz, uuid, timestamptz, uuid, uuid, integer)
  to authenticated;
grant execute on function public.list_team_channel_members(uuid) to authenticated;
grant execute on function public.search_team_messages(text, uuid, uuid, date, date) to authenticated;
grant execute on function public.list_team_activity() to authenticated;
grant execute on function public.list_team_threads() to authenticated;
grant execute on function public.list_team_pins(uuid) to authenticated;
grant execute on function public.list_team_saved(boolean) to authenticated;
grant execute on function public.list_team_scheduled() to authenticated;
grant execute on function public.get_team_chat_summary() to authenticated;
grant execute on function public.post_team_message(uuid, uuid, text, uuid[], uuid, boolean, boolean, timestamptz)
  to authenticated;
grant execute on function public.edit_team_message(uuid, text, uuid[], boolean) to authenticated;
grant execute on function public.mark_team_channel_read(uuid, timestamptz) to authenticated;
grant execute on function public.mark_team_thread_read(uuid, timestamptz) to authenticated;
grant execute on function public.set_team_thread_following(uuid, boolean) to authenticated;
grant execute on function public.mark_team_unread(uuid) to authenticated;
grant execute on function public.mark_all_team_channels_read() to authenticated;
grant execute on function public.reschedule_team_message(uuid, timestamptz) to authenticated;
grant execute on function public.create_team_channel(text, text, boolean, uuid[]) to authenticated;
grant execute on function public.update_team_channel(uuid, text, text) to authenticated;
grant execute on function public.set_team_channel_archived(uuid, boolean) to authenticated;
grant execute on function public.open_team_group(uuid[]) to authenticated;
grant execute on function public.add_team_channel_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_team_channel_member(uuid, uuid) to authenticated;
grant execute on function public.leave_team_channel(uuid) to authenticated;
grant execute on function public.set_team_channel_preferences(uuid, text, boolean) to authenticated;
grant execute on function public.toggle_team_reaction(uuid, text) to authenticated;
grant execute on function public.set_team_message_pinned(uuid, boolean) to authenticated;
grant execute on function public.save_team_message(uuid, timestamptz) to authenticated;
grant execute on function public.update_team_saved(uuid, boolean, timestamptz, boolean) to authenticated;
grant execute on function public.unsave_team_message(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Löschlauf (ADR-008 Punkt 12, ANN-610): dazu der eigene Stand
--     Ausgeschiedener und leere Gruppennachrichten
-- -----------------------------------------------------------------------------
create or replace function app.delete_due_team_messages(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Antworten: zwölf Monate ab ihrem Tag.
  with faellig as (
    select m.id,
           app.retention_due_at((m.created_at at time zone p_time_zone)::date,
                                app.retention_interval('teamchat'), p_time_zone) as due_at
    from public.team_messages m
    where m.organization_id = p_org and m.parent_id is not null
  ),
  geloescht as (
    delete from public.team_messages m
    using faellig x
    where m.id = x.id and x.due_at <= now()
    returning m.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_org, p_run, 'team_messages', g.id, 'teamchat', x.due_at
  from geloescht g join faellig x on x.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Ausgangsnachrichten erst sperren, dann prüfen (Zweitreview TEAM-001, N3).
  perform 1 from public.team_messages m
  where m.organization_id = p_org and m.parent_id is null
  for update;

  -- Ausgangsnachrichten, an denen keine Antwort mehr hängt (auch Anker).
  with faellig as (
    select m.id,
           app.retention_due_at((m.created_at at time zone p_time_zone)::date,
                                app.retention_interval('teamchat'), p_time_zone) as due_at
    from public.team_messages m
    where m.organization_id = p_org and m.parent_id is null
      and not exists (select 1 from public.team_messages r where r.parent_id = m.id)
  ),
  geloescht as (
    delete from public.team_messages m
    using faellig x
    where m.id = x.id and x.due_at <= now()
    returning m.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_org, p_run, 'team_messages', g.id, 'teamchat', x.due_at
  from geloescht g join faellig x on x.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Anker ohne Inhalt, an denen keine Antwort mehr hängt (ANN-610); nicht der
  -- Anker einer Entfernung durch owner - er ist der Nachweis (ADR-010 Punkt 15).
  with geloescht as (
    delete from public.team_messages m
    where m.organization_id = p_org and m.parent_id is null and m.removed_at is not null
      and m.removed_kind is distinct from 'owner'
      and not exists (select 1 from public.team_messages r where r.parent_id = m.id)
    returning m.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_org, p_run, 'team_messages', g.id, 'teamchat', now()
  from geloescht g;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Der eigene Stand Ausgeschiedener: Lesestand (ANN-609), Stand an Threads
  -- (ANN-640), „Für später“ (ANN-646) und Einstellungen (ANN-647). Er dient
  -- nur der Person selbst und fällt mit dem Ausscheiden. Ohne Journal - die
  -- Regel greift nach einem Restore im nächsten Lauf ebenso. Nachrichten und
  -- Reaktionen bleiben bis zu ihrer Frist; sie gehören dem Gespräch.
  delete from public.team_read_states rs
  using public.staff_members sm
  where rs.organization_id = p_org and sm.id = rs.staff_member_id
    and sm.employment_status <> 'active';
  delete from public.team_thread_states ts
  using public.staff_members sm
  where ts.organization_id = p_org and sm.id = ts.staff_member_id
    and sm.employment_status <> 'active';
  delete from public.team_saved_messages s
  using public.staff_members sm
  where s.organization_id = p_org and sm.id = s.staff_member_id
    and sm.employment_status <> 'active';
  delete from public.team_channel_settings cs
  using public.staff_members sm
  where cs.organization_id = p_org and sm.id = cs.staff_member_id
    and sm.employment_status <> 'active';

  -- Fällige Ausgangsnachrichten mit laufenden Antworten werden Anker.
  perform app.strip_due_team_anchors(p_org, p_time_zone);

  -- Direkt- und Gruppennachrichten ohne jede Nachricht, zwölf Monate nach
  -- ihrem Beginn; private Kanäle ohne Mitglied sofort - sie liest niemand mehr.
  with faellig as (
    select c.id,
           case when c.kind = 'private' then now()
                else app.retention_due_at((c.created_at at time zone p_time_zone)::date,
                                          app.retention_interval('teamchat'), p_time_zone)
           end as due_at
    from public.team_channels c
    where c.organization_id = p_org
      and ((c.kind in ('direct', 'group')
            and not exists (select 1 from public.team_messages m where m.channel_id = c.id))
           or (c.kind = 'private'
               and not exists (select 1 from public.team_channel_members m where m.channel_id = c.id)))
  ),
  geloescht as (
    delete from public.team_channels c
    using faellig x
    where c.id = x.id and x.due_at <= now()
    returning c.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_org, p_run, 'team_channels', g.id, 'teamchat', x.due_at
  from geloescht g join faellig x on x.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;
