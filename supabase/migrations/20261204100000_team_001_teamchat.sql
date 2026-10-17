-- =============================================================================
-- TEAM-001 Teamchat (PROJECT_PRINCIPLES.md §10 „Intern“, Pfad A)
--
-- Kanäle für das ganze Team, Direktnachrichten zwischen zwei Personen,
-- Antworten als Thread unter einer Ausgangsnachricht, Erwähnungen, Suche und
-- der eigene Lesestand. Teilnehmen kann jede Praxisrolle mit eigenem, aktivem
-- Mitarbeiterdatensatz (owner, therapist, team_lead, office, trainer);
-- Patienten- und Plattformkonten nie.
--
-- Beschäftigtendaten (§20, ANN-609):
--   * Keine Lesebestätigung, kein Online-Status, kein „zuletzt gesehen“, keine
--     Tipp-Anzeige. Der Lesestand je Person und Gespräch ist die Zeit der
--     neuesten gesehenen NACHRICHT, nicht die Zeit des Lesens; ihn liest nur
--     die Person selbst - auch owner nicht.
--   * Direktnachrichten lesen nur die zwei Beteiligten, auch owner nicht.
--   * Bearbeiten ohne Versionsverlauf, nur mit Marke „bearbeitet“.
--
-- Löschen (ADR-008 Fassung 5, ANN-610): jede Nachricht zwölf Monate ab ihrem
-- Tag, endgültig, mit Eintrag im Löschjournal. Eine Ausgangsnachricht, deren
-- Antworten noch laufen, verliert Text, Verfasser:in und Erwähnungen und
-- bleibt als inhaltsloser Anker, bis die letzte Antwort fällt. Eigenes Löschen
-- ist echtes Löschen; nur mit Antworten bleibt derselbe Anker. owner entfernt
-- fremde Nachrichten in offenen Kanälen und im Gespräch der Radflotte
-- (versehentliche Patientendaten), nie in Direktnachrichten.
--
-- Nur über SECURITY-DEFINER-Funktionen, kein Tabellenrecht (ADR-004). KEIN
-- Auditeintrag (ADR-010 Punkt 17); das Datenmodell ist der Nachweis
-- (`removed_kind`, `removed_by_staff_member_id`). Text steht nie in einer
-- Fehlermeldung: Alles wird vor dem Schreiben geprüft (ADR-011). Anhänge gibt
-- ADR-017 für den Teamchat nicht frei (Punkt 30); Benachrichtigungen regelt
-- ADR-024 nicht - beides fehlt hier bewusst.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer teilnimmt, wer Kanäle führt
-- -----------------------------------------------------------------------------
create function app.can_use_teamchat()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office', 'trainer')
$$;

-- Kanäle anlegen und archivieren: owner und Teamleitung (ANN-611).
create function app.can_manage_team_channels()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead')
$$;

revoke all on function app.can_use_teamchat() from public, anon, authenticated;
revoke all on function app.can_manage_team_channels() from public, anon, authenticated;

comment on function app.can_use_teamchat() is
  'TEAM-001 (§10): Wer am Teamchat teilnimmt - jede Praxisrolle mit eigenem, aktivem Mitarbeiterdatensatz. Die eine Stelle für die Regel.';
comment on function app.can_manage_team_channels() is
  'TEAM-001 (ANN-611): Wer offene Kanäle anlegt und archiviert - owner und Teamleitung.';

-- Gemeinsamer Einstieg: angemeldet, darf, Organisation, eigener aktiver
-- Mitarbeiterdatensatz - sonst 42501 ohne Unterschied.
create function app.teamchat_member(out o_org uuid, out o_staff uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  o_org := app.staff_request_org(app.can_use_teamchat(), 'not allowed to use the team chat');
  select sm.id into o_staff
  from public.staff_members sm
  where sm.id = app.own_staff_member(o_org) and sm.employment_status = 'active';
  if o_staff is null then
    raise exception 'not allowed to use the team chat' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.teamchat_member() from public, anon, authenticated;

-- Wer am Teamchat teilnehmen kann: aktive Mitarbeitende mit aktivem Konto und
-- einer Praxisrolle. Für Erwähnungen und Direktnachrichten.
create function app.teamchat_participant(p_org uuid, p_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members sm
    join public.user_profiles up
      on up.person_id = sm.person_id and up.organization_id = sm.organization_id and up.is_active
    join public.user_roles ur
      on ur.user_id = up.id and ur.organization_id = sm.organization_id
     and ur.role_key in ('owner', 'therapist', 'team_lead', 'office', 'trainer')
    where sm.id = p_staff and sm.organization_id = p_org and sm.employment_status = 'active'
  )
$$;

revoke all on function app.teamchat_participant(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Tabellen
-- -----------------------------------------------------------------------------
create table public.team_channels (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- fleet: das eine Gespräch der Radflotte je Praxis - es steht in der
  -- Radflotte, nicht im Teamchat, und lesen es, die die Flotte lesen
  -- (Jannes 2026-10-17, ANN-613).
  kind            text not null check (kind in ('channel', 'direct', 'fleet')),
  -- Nur offene Kanäle tragen Namen und Beschreibung; eine Direktnachricht
  -- heißt wie die andere Person.
  name            text check (name is null or length(name) between 1 and 40),
  description     text check (description is null or length(description) between 1 and 200),
  created_at      timestamptz not null default now(),
  -- Archiviert: nur noch lesbar. Die Löschfrist läuft weiter.
  archived_at     timestamptz,
  constraint team_channels_name check ((kind = 'channel') = (name is not null)),
  constraint team_channels_direct check (kind = 'channel' or (description is null and archived_at is null))
);

create unique index team_channels_name_unique
  on public.team_channels (organization_id, lower(name)) where kind = 'channel';
create unique index team_channels_fleet_unique
  on public.team_channels (organization_id) where kind = 'fleet';
create index team_channels_organization_id_idx on public.team_channels (organization_id);

comment on table public.team_channels is
  'TEAM-001: Gespräche des Teamchats - offene Kanäle (alle Teilnehmenden der Praxis), Direktnachrichten (genau zwei Personen, team_channel_members) und das eine Gespräch der Radflotte (wer die Flotte liest, ANN-613). Datenklasse teamchat (ANN-610).';
comment on column public.team_channels.archived_at is
  'Archiviert: nur noch lesbar, keine neuen Nachrichten. Hält keine Löschung auf.';

-- Nur Direktnachrichten haben Mitglieder: die zwei Beteiligten.
create table public.team_channel_members (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id      uuid not null references public.team_channels (id) on delete cascade,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  unique (channel_id, staff_member_id)
);

create index team_channel_members_staff_idx on public.team_channel_members (staff_member_id);

comment on table public.team_channel_members is
  'TEAM-001: die zwei Beteiligten einer Direktnachricht. Nur sie lesen sie (auch owner nicht).';

create table public.team_messages (
  id                         uuid primary key default extensions.gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete cascade,
  channel_id                 uuid not null references public.team_channels (id) on delete cascade,
  -- Antwort im Thread: die Ausgangsnachricht. Antworten haben keine Antworten.
  parent_id                  uuid references public.team_messages (id) on delete cascade,
  -- Leer nur am Anker nach Ablauf der Frist (Text und Verfasser:in fallen).
  author_staff_member_id     uuid references public.staff_members (id) on delete set null,
  body                       text check (body is null or length(body) between 1 and 4000),
  created_at                 timestamptz not null default now(),
  edited_at                  timestamptz,
  -- Ohne Inhalt: von der Person selbst gelöscht (mit Antworten), von owner
  -- entfernt oder nach der Frist nur noch Anker. Kein Soft-Delete: Text und
  -- Erwähnungen sind dann fort.
  removed_at                 timestamptz,
  removed_kind               text check (removed_kind in ('author', 'owner', 'retention')),
  removed_by_staff_member_id uuid references public.staff_members (id) on delete set null,
  constraint team_messages_removed check (
    (removed_at is null) = (removed_kind is null)
    and (removed_at is null) = (body is not null)
    and (removed_kind = 'owner' or removed_by_staff_member_id is null)
    and (removed_kind is not null or edited_at is null or edited_at >= created_at)
  )
);

create index team_messages_channel_idx on public.team_messages (channel_id, created_at);
create index team_messages_parent_idx on public.team_messages (parent_id) where parent_id is not null;
create index team_messages_organization_id_idx on public.team_messages (organization_id);

comment on table public.team_messages is
  'TEAM-001: Nachrichten des Teamchats. Zwölf Monate ab ihrem Tag, dann endgültig gelöscht (ANN-610). Keine Anhänge (ADR-017 Punkt 30), keine klinischen Inhalte (§10: die gehören in die Akte).';
comment on column public.team_messages.edited_at is
  'Zuletzt bearbeitet - nur für die Marke „bearbeitet“, kein Verlauf früherer Fassungen (ANN-609).';
comment on column public.team_messages.removed_kind is
  'Warum der Inhalt fehlt: author (selbst gelöscht, Antworten hängen daran), owner (von der Praxisleitung entfernt), retention (Frist abgelaufen, Antworten laufen noch).';
comment on column public.team_messages.removed_by_staff_member_id is
  'Nur bei removed_kind owner: wer entfernt hat - das Datenmodell ist der Nachweis, kein Auditeintrag (ADR-010 Punkt 15).';

create table public.team_message_mentions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id      uuid not null references public.team_messages (id) on delete cascade,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  unique (message_id, staff_member_id)
);

create index team_message_mentions_staff_idx on public.team_message_mentions (staff_member_id);

comment on table public.team_message_mentions is
  'TEAM-001: wer in einer Nachricht erwähnt ist - für den eigenen Zähler „Für dich“. Fällt mit der Nachricht oder ihrem Inhalt.';

create table public.team_read_states (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel_id      uuid not null references public.team_channels (id) on delete cascade,
  staff_member_id uuid not null references public.staff_members (id) on delete cascade,
  -- Die Zeit der neuesten gesehenen Nachricht - NICHT, wann gelesen wurde.
  read_up_to      timestamptz not null,
  unique (channel_id, staff_member_id)
);

comment on table public.team_read_states is
  'TEAM-001 (§20, ANN-609): der eigene Lesestand je Gespräch - nur für die eigenen Zähler, nur für die Person selbst lesbar, auch nicht für owner. Keine Lesebestätigung.';
comment on column public.team_read_states.read_up_to is
  'Erstellzeit der neuesten gesehenen Nachricht, nicht der Zeitpunkt des Lesens.';

alter table public.team_channels enable row level security;
alter table public.team_channel_members enable row level security;
alter table public.team_messages enable row level security;
alter table public.team_message_mentions enable row level security;
alter table public.team_read_states enable row level security;
-- Bewusst keine Policy und kein Tabellenrecht: Zugriff nur über die
-- Funktionen unten (ADR-004, Defense in Depth). Supabase vergibt neuen
-- Tabellen in public alle Rechte an anon und authenticated - hier ausdrücklich
-- entzogen, auch TRUNCATE, das RLS nicht erfasst (Zweitreview TEAM-001).
revoke all on public.team_channels, public.team_channel_members, public.team_messages,
  public.team_message_mentions, public.team_read_states from public, anon, authenticated;
-- Fällt eine Praxis, fällt ihr Teamchat mit (cascade): Er hat keine
-- Aufbewahrungspflicht, und das Gespräch der Radflotte entsteht mit jeder Praxis.

-- -----------------------------------------------------------------------------
-- 3. Datenklasse und Frist (ADR-008 Fassung 5, ANN-610)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('teamchat', 'intern', null, 'event_time', interval '12 months', 'ANN-610',
   'Interner Teamchat (§10): jede Nachricht zwölf Monate ab ihrem Tag, dann endgültig gelöscht; eine Ausgangsnachricht mit laufenden Antworten bleibt ohne Inhalt als Anker. Dauerhaft Relevantes gehört in den Fachprozess.',
   103);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('team_messages', 'teamchat', 'automatisch',
   'Nachrichten des Teamchats (TEAM-001): zwölf Monate ab ihrem Tag, endgültig gelöscht, mit Eintrag im Löschjournal (ANN-610).',
   240),
  ('team_message_mentions', 'teamchat', 'automatisch',
   'Erwähnungen (TEAM-001): fallen mit ihrer Nachricht oder deren Inhalt (cascade).',
   241),
  ('team_channels', 'teamchat', 'automatisch',
   'Gespräche (TEAM-001): offene Kanäle und das Gespräch der Radflotte bleiben, solange die Praxis sie führt; Direktnachrichten ohne Nachricht fallen zwölf Monate nach ihrem Beginn, mit Eintrag im Löschjournal (ANN-610).',
   242),
  ('team_channel_members', 'teamchat', 'automatisch',
   'Beteiligte einer Direktnachricht (TEAM-001): fallen mit ihr (cascade).',
   243),
  ('team_read_states', 'teamchat', 'automatisch',
   'Eigener Lesestand (TEAM-001): fällt mit dem Gespräch (cascade) und mit dem Ausscheiden der Person (ANN-609).',
   244);

-- -----------------------------------------------------------------------------
-- 4. Das Gespräch der Radflotte - Kanäle legt die Praxis selbst an
--    (Jannes 2026-10-17, ANN-611)
-- -----------------------------------------------------------------------------
create function app.create_team_fleet_channel(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  -- Räder, Schlüssel und Pannen bespricht die Radflotte selbst (ANN-613).
  insert into public.team_channels (organization_id, kind)
  values (p_org, 'fleet')
  on conflict do nothing;
$$;

revoke all on function app.create_team_fleet_channel(uuid) from public, anon, authenticated;

create function app.team_channels_for_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.create_team_fleet_channel(new.id);
  return new;
end;
$$;

revoke all on function app.team_channels_for_new_organization() from public, anon, authenticated;

create trigger organizations_default_team_channels
  after insert on public.organizations
  for each row execute function app.team_channels_for_new_organization();

select app.create_team_fleet_channel(o.id) from public.organizations o;

-- -----------------------------------------------------------------------------
-- 5. Lesen
-- -----------------------------------------------------------------------------
-- Ob die Person das Gespräch liest: offener Kanal der Praxis, das Gespräch
-- der Radflotte (wer die Flotte liest, ANN-613) oder eigene Direktnachricht.
-- Wer die Radflotte liest (wie app.can_read_fleet, FLT-001), hier für eine
-- beliebige Person - für Erwähnungen und das Gespräch der Flotte.
create function app.team_staff_reads_fleet(p_org uuid, p_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members sm
    join public.user_profiles up
      on up.person_id = sm.person_id and up.organization_id = sm.organization_id and up.is_active
    join public.user_roles ur
      on ur.user_id = up.id and ur.organization_id = sm.organization_id
     and ur.role_key in ('owner', 'therapist', 'team_lead', 'office')
    where sm.id = p_staff and sm.organization_id = p_org and sm.employment_status = 'active'
  )
$$;

revoke all on function app.team_staff_reads_fleet(uuid, uuid) from public, anon, authenticated;

create function app.team_channel_readable(p_channel uuid, p_org uuid, p_staff uuid)
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
           -- Mitglieder zählen nur bei Direktnachrichten (Zweitreview R3).
           or (c.kind = 'direct'
               and exists (select 1 from public.team_channel_members m
                           where m.channel_id = c.id and m.staff_member_id = p_staff)))
  )
$$;

revoke all on function app.team_channel_readable(uuid, uuid, uuid) from public, anon, authenticated;

create function app.team_staff_name(p_staff uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.given_name || ' ' || p.family_name
  from public.staff_members sm
  join public.persons p on p.id = sm.person_id
  where sm.id = p_staff
$$;

revoke all on function app.team_staff_name(uuid) from public, anon, authenticated;

-- Die Gespräche der Person mit eigenem Ungelesen- und Erwähnungszähler.
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
  unread           integer,
  mentions         integer,
  last_message_at  timestamptz
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
         (select count(*)::integer from public.team_messages m
          where m.channel_id = c.id and m.removed_at is null
            and m.author_staff_member_id is distinct from v_staff
            and m.created_at > coalesce(rs.read_up_to, '-infinity'::timestamptz)),
         (select count(*)::integer from public.team_messages m
          join public.team_message_mentions mm on mm.message_id = m.id and mm.staff_member_id = v_staff
          where m.channel_id = c.id and m.removed_at is null
            and m.created_at > coalesce(rs.read_up_to, '-infinity'::timestamptz)),
         (select max(m.created_at) from public.team_messages m where m.channel_id = c.id)
  from public.team_channels c
  left join public.team_read_states rs on rs.channel_id = c.id and rs.staff_member_id = v_staff
  left join lateral (
    select m.staff_member_id from public.team_channel_members m
    where m.channel_id = c.id and m.staff_member_id <> v_staff
    limit 1
  ) pm on c.kind = 'direct'
  where c.organization_id = v_org
    and app.team_channel_readable(c.id, v_org, v_staff);
end;
$$;

-- Nachrichten eines Gesprächs: ohne p_parent die Ausgangsnachrichten (die
-- neuesten p_limit vor p_before), mit p_parent der Thread - die
-- Ausgangsnachricht und alle Antworten.
create function public.list_team_messages(
  p_channel uuid,
  p_parent  uuid default null,
  p_before  timestamptz default null,
  p_limit   integer default 50
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
  reply_count    integer,
  last_reply_at  timestamptz,
  mentions       uuid[],
  own            boolean,
  -- Nur für die Person selbst, aus ihrem eigenen Lesestand: neue Antworten
  -- anderer und ob sie darin erwähnt ist - damit eine Erwähnung im Thread
  -- am Thread sichtbar bleibt (Praxis-Review TEAM-001).
  new_replies    integer,
  mentioned_in_new_replies boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_seit  timestamptz;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  select coalesce(max(rs.read_up_to), '-infinity'::timestamptz) into v_seit
  from public.team_read_states rs
  where rs.channel_id = p_channel and rs.staff_member_id = v_staff;
  if p_parent is not null and not exists (
    select 1 from public.team_messages m
    where m.id = p_parent and m.channel_id = p_channel and m.parent_id is null
  ) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;

  return query
  select m.id, m.parent_id, m.author_staff_member_id,
         app.team_staff_name(m.author_staff_member_id),
         m.body, m.created_at, m.edited_at is not null, m.removed_kind,
         (select count(*)::integer from public.team_messages r where r.parent_id = m.id),
         (select max(r.created_at) from public.team_messages r where r.parent_id = m.id),
         coalesce((select array_agg(mm.staff_member_id order by mm.staff_member_id)
                   from public.team_message_mentions mm where mm.message_id = m.id), '{}'::uuid[]),
         m.author_staff_member_id = v_staff,
         (select count(*)::integer from public.team_messages r
          where r.parent_id = m.id and r.removed_at is null and r.created_at > v_seit
            and r.author_staff_member_id is distinct from v_staff),
         exists (select 1 from public.team_messages r
                 join public.team_message_mentions mm
                   on mm.message_id = r.id and mm.staff_member_id = v_staff
                 where r.parent_id = m.id and r.removed_at is null and r.created_at > v_seit)
  from (
    select x.*
    from public.team_messages x
    where x.channel_id = p_channel
      and case when p_parent is null
               then x.parent_id is null
                    and (p_before is null or x.created_at < p_before)
               else x.id = p_parent or x.parent_id = p_parent end
    order by x.created_at desc
    -- Im Thread ohne Grenze: Sonst fiele bei sehr vielen Antworten die
    -- Ausgangsnachricht heraus (Zweitreview TEAM-001).
    limit case when p_parent is null then least(greatest(coalesce(p_limit, 50), 1), 100) end
  ) m
  order by m.created_at;
end;
$$;

-- Die Personen, die man erwähnen und anschreiben kann: aktive Teilnehmende
-- ohne die Person selbst. Nur Namen, keine Rollen, kein Status.
create function public.list_team_people()
returns table (staff_member_id uuid, name text)
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
  select sm.id, p.given_name || ' ' || p.family_name
  from public.staff_members sm
  join public.persons p on p.id = sm.person_id
  where sm.organization_id = v_org and sm.id <> v_staff
    and app.teamchat_participant(v_org, sm.id)
  order by p.given_name, p.family_name;
end;
$$;

-- Suche in allen lesbaren Gesprächen, höchstens 30 Treffer, die neuesten
-- zuerst. Mindestens zwei Zeichen.
create function public.search_team_messages(p_query text)
returns table (
  id           uuid,
  channel_id   uuid,
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
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if length(v_nadel) < 2 or length(v_nadel) > 100 then
    raise exception 'search needs two to 100 characters' using errcode = '22023';
  end if;

  return query
  select m.id, m.channel_id, m.parent_id, app.team_staff_name(m.author_staff_member_id),
         m.body, m.created_at
  from public.team_messages m
  where m.organization_id = v_org and m.removed_at is null
    and app.team_channel_readable(m.channel_id, v_org, v_staff)
    and strpos(lower(m.body), lower(v_nadel)) > 0
  order by m.created_at desc
  limit 30;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Schreiben
-- -----------------------------------------------------------------------------
-- Ein Text: getrimmt, 1 bis 4000 Zeichen - geprüft vor dem Schreiben, damit
-- keine Prüfregel mit dem Text im Detail antwortet (ADR-011).
create function app.team_message_text(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if v_text is null then
    raise exception 'message is empty' using errcode = '22023';
  end if;
  if length(v_text) > 4000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.team_message_text(text) from public, anon, authenticated;

-- Erwähnungen neu setzen: nur Personen, die das Gespräch lesen, ohne die
-- verfassende Person. Unbekanntes fällt still weg.
create function app.set_team_mentions(p_message uuid, p_mentions uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.team_messages%rowtype;
begin
  select * into v_m from public.team_messages where id = p_message;
  delete from public.team_message_mentions where message_id = p_message;
  insert into public.team_message_mentions (organization_id, message_id, staff_member_id)
  select distinct v_m.organization_id, p_message, x.staff
  from unnest(coalesce(p_mentions, '{}'::uuid[])) as x (staff)
  where x.staff is distinct from v_m.author_staff_member_id
    and app.teamchat_participant(v_m.organization_id, x.staff)
    and app.team_channel_readable(v_m.channel_id, v_m.organization_id, x.staff);
end;
$$;

revoke all on function app.set_team_mentions(uuid, uuid[]) from public, anon, authenticated;

-- Den eigenen Lesestand bis zur neuesten Nachricht vorziehen (nie zurück).
create function app.mark_team_read(p_channel uuid, p_org uuid, p_staff uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.team_read_states (organization_id, channel_id, staff_member_id, read_up_to)
  select p_org, p_channel, p_staff, max(m.created_at)
  from public.team_messages m
  where m.channel_id = p_channel
  having max(m.created_at) is not null
  on conflict (channel_id, staff_member_id)
  do update set read_up_to = greatest(public.team_read_states.read_up_to, excluded.read_up_to)
$$;

revoke all on function app.mark_team_read(uuid, uuid, uuid) from public, anon, authenticated;

create function public.post_team_message(
  p_channel  uuid,
  p_parent   uuid,
  p_body     text,
  p_mentions uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_text    text;
  v_channel public.team_channels%rowtype;
  v_id      uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_text := app.team_message_text(p_body);
  if not app.team_channel_readable(p_channel, v_org, v_staff) then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
  select * into v_channel from public.team_channels where id = p_channel;
  if v_channel.archived_at is not null then
    raise exception 'team channel is archived' using errcode = '22023';
  end if;
  -- In eine Direktnachricht nur, solange die andere Person teilnehmen kann.
  if v_channel.kind = 'direct' and not exists (
    select 1 from public.team_channel_members m
    where m.channel_id = p_channel and m.staff_member_id <> v_staff
      and app.teamchat_participant(v_org, m.staff_member_id)
  ) then
    raise exception 'team chat partner is not available' using errcode = '22023';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.team_messages m
    where m.id = p_parent and m.channel_id = p_channel and m.parent_id is null
  ) then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;

  insert into public.team_messages (organization_id, channel_id, parent_id, author_staff_member_id, body)
  values (v_org, p_channel, p_parent, v_staff, v_text)
  returning id into v_id;

  perform app.set_team_mentions(v_id, p_mentions);
  perform app.mark_team_read(p_channel, v_org, v_staff);
  return v_id;
end;
$$;

-- Eigene Nachricht bearbeiten: neuer Text und neue Erwähnungen, Marke
-- „bearbeitet“, kein Verlauf.
create function public.edit_team_message(p_message uuid, p_body text, p_mentions uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_text  text;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  v_text := app.team_message_text(p_body);
  update public.team_messages m
     set body = v_text, edited_at = now()
   where m.id = p_message and m.organization_id = v_org
     and m.author_staff_member_id = v_staff and m.removed_at is null
     and app.team_channel_readable(m.channel_id, v_org, v_staff)
     and not exists (select 1 from public.team_channels c
                     where c.id = m.channel_id and c.archived_at is not null);
  if not found then
    raise exception 'team message not found' using errcode = 'P0002';
  end if;
  perform app.set_team_mentions(p_message, p_mentions);
end;
$$;

-- Löschen: die eigene Nachricht endgültig; hängen Antworten daran, bleibt sie
-- ohne Inhalt als Anker. owner entfernt fremde Nachrichten in offenen Kanälen
-- und im Gespräch der Radflotte und hinterlässt immer den Anker „von der
-- Praxisleitung entfernt“.
create function public.delete_team_message(p_message uuid)
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
  -- Punkt 8): die ganze Zeile oder nur ihren Inhalt (`team_message_contents`,
  -- reapply leert dann statt zu löschen).
  -- Tageweise gebündelt (Zweitreview N4): eine Lauf-Kennung je Praxis und
  -- Tag, Tag statt Uhrzeit - sonst stünde jede einzelne Löschung, auch in
  -- fremden Direktnachrichten, sekundengenau im Nachweis der Praxisleitung.
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
  values (v_org, md5('team_manual:' || v_org::text || ':' || current_date::text)::uuid,
          case when v_kind = 'author' and not v_antwort then 'team_messages'
               else 'team_message_contents' end,
          v_m.id, 'teamchat', date_trunc('day', now()), date_trunc('day', now()));
  if v_kind = 'author' and not v_antwort then
    delete from public.team_messages where id = v_m.id;
  else
    delete from public.team_message_mentions where message_id = v_m.id;
    -- Der Anker trägt keinen Namen mehr: Niemand sieht, wessen Nachricht
    -- gelöscht oder entfernt wurde (ADR-008 Punkt 12, Zweitreview N2).
    update public.team_messages
       set body = null, edited_at = null, author_staff_member_id = null,
           removed_at = now(), removed_kind = v_kind,
           removed_by_staff_member_id = case when v_kind = 'owner' then v_staff end
     where id = v_m.id;
  end if;
end;
$$;

create function public.mark_team_channel_read(p_channel uuid)
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
  perform app.mark_team_read(p_channel, v_org, v_staff);
end;
$$;

-- Alle eigenen Gespräche als gelesen.
create function public.mark_all_team_channels_read()
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
  perform app.mark_team_read(c.id, v_org, v_staff)
  from public.team_channels c
  where c.organization_id = v_org and app.team_channel_readable(c.id, v_org, v_staff);
end;
$$;

-- Direktnachricht öffnen: das bestehende Gespräch mit der Person oder ein
-- neues. Mit sich selbst nicht.
create function public.open_team_direct(p_staff_member uuid)
returns uuid
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
  if p_staff_member is null or p_staff_member = v_staff
     or not app.teamchat_participant(v_org, p_staff_member) then
    raise exception 'team chat partner is not available' using errcode = '22023';
  end if;

  -- Gleichzeitiges Öffnen durch beide legt nur ein Gespräch an.
  perform pg_advisory_xact_lock(
    hashtextextended('team_direct:' || least(v_staff, p_staff_member)::text
                     || greatest(v_staff, p_staff_member)::text, 0));

  select c.id into v_id
  from public.team_channels c
  where c.organization_id = v_org and c.kind = 'direct'
    and exists (select 1 from public.team_channel_members m
                where m.channel_id = c.id and m.staff_member_id = v_staff)
    and exists (select 1 from public.team_channel_members m
                where m.channel_id = c.id and m.staff_member_id = p_staff_member)
  limit 1;

  if v_id is null then
    insert into public.team_channels (organization_id, kind) values (v_org, 'direct')
    returning id into v_id;
    insert into public.team_channel_members (organization_id, channel_id, staff_member_id)
    values (v_org, v_id, v_staff), (v_org, v_id, p_staff_member);
  end if;
  return v_id;
end;
$$;

-- Offenen Kanal anlegen (owner, Teamleitung).
create function public.create_team_channel(p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_text  text := nullif(btrim(coalesce(p_description, '')), '');
  v_id    uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not app.can_manage_team_channels() then
    raise exception 'not allowed to manage team channels' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 40 or (v_text is not null and length(v_text) > 200) then
    raise exception 'channel name needs one to 40 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_channels c
             where c.organization_id = v_org and c.kind = 'channel' and lower(c.name) = lower(v_name)) then
    raise exception 'channel name is taken' using errcode = '23505';
  end if;
  insert into public.team_channels (organization_id, kind, name, description)
  values (v_org, 'channel', v_name, v_text)
  returning id into v_id;
  return v_id;
end;
$$;

-- Archivieren und zurückholen (owner, Teamleitung).
create function public.set_team_channel_archived(p_channel uuid, p_archived boolean)
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
  update public.team_channels c
     set archived_at = case when p_archived then coalesce(c.archived_at, now()) end
   where c.id = p_channel and c.organization_id = v_org and c.kind = 'channel';
  if not found then
    raise exception 'team channel not found' using errcode = 'P0002';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Rechte an den Funktionen
-- -----------------------------------------------------------------------------
revoke all on function public.list_team_channels() from public, anon;
revoke all on function public.list_team_messages(uuid, uuid, timestamptz, integer) from public, anon;
revoke all on function public.list_team_people() from public, anon;
revoke all on function public.search_team_messages(text) from public, anon;
revoke all on function public.post_team_message(uuid, uuid, text, uuid[]) from public, anon;
revoke all on function public.edit_team_message(uuid, text, uuid[]) from public, anon;
revoke all on function public.delete_team_message(uuid) from public, anon;
revoke all on function public.mark_team_channel_read(uuid) from public, anon;
revoke all on function public.mark_all_team_channels_read() from public, anon;
revoke all on function public.open_team_direct(uuid) from public, anon;
revoke all on function public.create_team_channel(text, text) from public, anon;
revoke all on function public.set_team_channel_archived(uuid, boolean) from public, anon;

grant execute on function public.list_team_channels() to authenticated;
grant execute on function public.list_team_messages(uuid, uuid, timestamptz, integer) to authenticated;
grant execute on function public.list_team_people() to authenticated;
grant execute on function public.search_team_messages(text) to authenticated;
grant execute on function public.post_team_message(uuid, uuid, text, uuid[]) to authenticated;
grant execute on function public.edit_team_message(uuid, text, uuid[]) to authenticated;
grant execute on function public.delete_team_message(uuid) to authenticated;
grant execute on function public.mark_team_channel_read(uuid) to authenticated;
grant execute on function public.mark_all_team_channels_read() to authenticated;
grant execute on function public.open_team_direct(uuid) to authenticated;
grant execute on function public.create_team_channel(text, text) to authenticated;
grant execute on function public.set_team_channel_archived(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Löschlauf (ADR-008 Fassung 5, ANN-610)
-- -----------------------------------------------------------------------------
create function app.delete_due_team_messages(p_org uuid, p_time_zone text, p_run uuid)
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

  -- Ausgangsnachrichten erst sperren, dann prüfen (Zweitreview TEAM-001,
  -- N3): Eine Antwort, die nach dem Sperren eingeht, wartet und scheitert
  -- danach am Fremdschlüssel; eine vorher bestätigte sieht die nächste
  -- Anweisung. So nimmt cascade keine neue Antwort still mit.
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

  -- Anker ohne Inhalt, an denen keine Antwort mehr hängt: Sie haben ihren
  -- Zweck verloren und fallen im nächsten Lauf (ANN-610). Nicht der Anker
  -- einer Entfernung durch owner - er ist der Nachweis (`removed_by`,
  -- ADR-010 Punkt 15) und fällt erst mit seiner Frist.
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

  -- Der Lesestand Ausgeschiedener: Er dient nur den eigenen Zählern und
  -- fällt mit dem Ausscheiden (ANN-609, Zweitreview TEAM-001). Ohne Journal -
  -- die Regel greift nach einem Restore im nächsten Lauf ebenso.
  delete from public.team_read_states rs
  using public.staff_members sm
  where rs.organization_id = p_org and sm.id = rs.staff_member_id
    and sm.employment_status <> 'active';

  -- Fällige Ausgangsnachrichten mit laufenden Antworten: Inhalt, Verfasser:in
  -- und Erwähnungen fallen, die Zeile bleibt als Anker. Zählt nicht als
  -- Löschung; nach einem Restore greift dieselbe Regel (reapply).
  perform app.strip_due_team_anchors(p_org, p_time_zone);

  -- Direktnachrichten ohne jede Nachricht, zwölf Monate nach ihrem Beginn.
  with faellig as (
    select c.id,
           app.retention_due_at((c.created_at at time zone p_time_zone)::date,
                                app.retention_interval('teamchat'), p_time_zone) as due_at
    from public.team_channels c
    where c.organization_id = p_org and c.kind = 'direct'
      and not exists (select 1 from public.team_messages m where m.channel_id = c.id)
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

create function app.strip_due_team_anchors(p_org uuid, p_time_zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(m.id) into v_ids
  from public.team_messages m
  where m.organization_id = p_org and m.parent_id is null
    and (m.removed_kind is distinct from 'retention' or m.author_staff_member_id is not null)
    and app.retention_due_at((m.created_at at time zone p_time_zone)::date,
                             app.retention_interval('teamchat'), p_time_zone) <= now();
  if v_ids is null then
    return;
  end if;
  delete from public.team_message_mentions where message_id = any (v_ids);
  update public.team_messages
     set body = null, edited_at = null, author_staff_member_id = null,
         removed_at = coalesce(removed_at, now()), removed_kind = 'retention',
         removed_by_staff_member_id = null
   where id = any (v_ids);
end;
$$;

revoke all on function app.delete_due_team_messages(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app.strip_due_team_anchors(uuid, text) from public, anon, authenticated;

comment on function app.delete_due_team_messages(uuid, text, uuid) is
  'TEAM-001 (ANN-610): löscht Nachrichten des Teamchats zwölf Monate ab ihrem Tag endgültig (mit Eintrag im Löschjournal); fällige Ausgangsnachrichten mit laufenden Antworten bleiben ohne Inhalt als Anker; leere Direktnachrichten fallen zwölf Monate nach Beginn. Aufgerufen aus public.apply_retention().';

-- -----------------------------------------------------------------------------
-- 9. Der Lauf ruft den Teamchat mit auf - sonst unverändert (Stand ORG-006)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_auftraege integer;
  v_journal   integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_wuensche  integer;
  v_nachrichten integer;
  v_anhaenge  integer;
  v_radflotte integer;
  v_urlaub integer;
  v_arbeitszeit integer;
  v_zeitkonto integer;
  v_erstattung integer;
  v_rueckmeldung integer;
  v_teamchat     integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Behandlung.
    --
    -- B1 (BEF-151, ADR-008 Fassung 3): Der Anker ist nicht mehr allein der
    -- ausdrueckliche Abschluss, sondern app.patient_retention_anchor - das
    -- spaeteste Datum aus letzter Behandlung, erfasster Leistung und einem
    -- etwaigen ausdruecklichen Abschluss. Eine Akte mit kuenftigem Termin
    -- faellt nie, und ohne jede Behandlung laeuft weiter keine Frist.
    -- -------------------------------------------------------------------
    for v_akte in
      select k.id, k.due_at
      from (
        select p.id,
               app.retention_due_at(
                 app.patient_retention_anchor(p.id),
                 app.retention_interval('patientenakte'),
                 v_org.time_zone
               ) as due_at
        from public.patients p
        where p.organization_id = v_org.id
      ) k
      join public.patients p on p.id = k.id
      where k.due_at is not null
        and k.due_at <= now()
        and not app.patient_has_upcoming_care(k.id)
      order by k.due_at
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    -- LOG-EPIC-001: zwei Klassen (app.audit_retention_class), und ein Legal
    -- Hold haelt jede Zeile seiner Akte - ueber den Gegenstand oder
    -- context.patient_id, auch fuer zusammengefuehrte Doppelanlagen.
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval(app.audit_retention_class(a.action))
        and not app.audit_entry_held(v_org.id, a.subject_type, a.subject_id, a.context)
      returning a.id, a.organization_id, a.occurred_at, app.audit_retention_class(a.action) as klasse
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, g.klasse,
           g.occurred_at + app.retention_interval(g.klasse)
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung
    -- (LOG-EPIC-001). Offene Auftraege bleiben. Nicht im Journal: Ein
    -- Auftrag ist selbst der Nachweis einer Loeschung, kein Fachdatensatz.
    -- -------------------------------------------------------------------
    delete from public.storage_deletion_orders o
    where o.organization_id = v_org.id
      and o.receipted_at is not null
      and o.receipted_at < now() - app.retention_interval('loeschauftrag');
    get diagnostics v_auftraege = row_count;

    -- -------------------------------------------------------------------
    -- Loeschjournal: 60 Tage ab der Loeschung (ADR-012: Backups 30 Tage,
    -- dazu 30 Tage Puffer). Zuletzt, damit die Eintraege dieses Laufs nicht
    -- mitfallen.
    -- -------------------------------------------------------------------
    delete from public.deletion_journal j
    where j.organization_id = v_org.id
      and j.deleted_at < now() - app.retention_interval('loeschjournal');
    get diagnostics v_journal = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Terminwuensche der Plattform (POR-009, ANN-246): zwoelf Monate nach
    -- der Antwort der Praxis bzw. dem Zurueckziehen. Offene Wuensche
    -- bleiben; mit dem Verhaeltnis fallen sie ohnehin (cascade). Ein Legal
    -- Hold an der Akte haelt auch den beantworteten Wunsch.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.resolved_at + app.retention_interval('terminwunsch') as due_at
      from public.platform_appointment_requests w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.resolved_at is not null
        and (w.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', w.patient_id))
    ),
    geloescht as (
      delete from public.platform_appointment_requests w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_appointment_requests', g.id, 'terminwunsch', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_wuensche = row_count;

    -- -------------------------------------------------------------------
    -- KOM-005 (ADR-017 Punkt 65): Anhaenge an Rueckfragen, 30 Tage ab der
    -- Aufnahme oder ab ihrer Sperre. Vor den Vorgaengen: ein Anhang, der mit
    -- seinem Vorgang faellt, steht nicht doppelt im Journal. Ein Legal Hold
    -- an der Akte haelt (gesperrt, ANN-335).
    -- -------------------------------------------------------------------
    v_anhaenge := app.remove_message_attachments(v_org.id, 'due', null, v_run);

    -- -------------------------------------------------------------------
    -- FLT-001 (ANN-551): Radflotte - Schluessel 30 Tage nach der Rueckgabe,
    -- Sperren, Check-Ups und Pannen drei Jahre ab Ende des Kalenderjahres;
    -- offene nie. Ohne Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_radflotte := app.delete_due_fleet_records(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- URL-001 (ANN-579): Urlaub - genehmigte und stornierte Antraege und
    -- Ansprueche drei Jahre ab Ende des Urlaubsjahres, abgelehnte und
    -- zurueckgezogene ein Jahr nach ihrem Ende; offene nie. Ohne
    -- Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_urlaub := app.delete_due_staff_leave(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- AZ-001 (ANN-591): Arbeitszeitaenderungen - genehmigte drei Jahre ab
    -- Ende des Jahres ihrer Wirkung, abgelehnte und zurueckgezogene ein Jahr
    -- nach ihrem Ende; offene nie. Ohne Patientenbezug, ohne Legal Hold.
    -- -------------------------------------------------------------------
    v_arbeitszeit := app.delete_due_working_time_requests(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ZK-001 (ANN-597): Zeitkonto - gültige Einträge drei Jahre ab Ende
    -- ihres Jahres, ihr Saldo bleibt als Übertrag; zurückgewiesene und
    -- zurückgenommene ein Jahr nach ihrem Ende. Ohne Patientenbezug.
    -- -------------------------------------------------------------------
    v_zeitkonto := app.delete_due_time_account_entries(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ERS-001 (ANN-602): Erstattungen - ausgezahlte acht Jahre ab Ende des
    -- Jahres der Auszahlung (Par. 147 AO), abgelehnte und zurückgezogene ein
    -- Jahr; die Belege fallen mit, ihre Objekte über den Löschauftrag.
    -- -------------------------------------------------------------------
    v_erstattung := app.delete_due_reimbursements(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ORG-006 (ANN-607): Rückmeldungen von Beschäftigten - zwölf Monate ab
    -- Ende des Monats der Abgabe, endgültig; Teilnahmemarken nach ihrem
    -- Monat. Bewusst NICHT in der Zusammenfassung unten (ADR-010 Punkt 17,
    -- §20.2): Der Nachweis ist das Löschjournal.
    -- -------------------------------------------------------------------
    v_rueckmeldung := app.delete_due_staff_feedback(v_org.id, v_org.time_zone, v_run);
    -- TEAM-001: der Teamchat (ANN-610).
    v_teamchat := app.delete_due_team_messages(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- Nachrichten der Behandlung (KOM-001, ADR-008 "Organisatorische
    -- Patientenkommunikation", ANN-001): drei Jahre ab Ende des
    -- Kalenderjahres, in dem der Vorgang abgeschlossen wurde: erledigt, oder
    -- beantwortet und danach nichts mehr von der Person (Anker: die letzte
    -- Antwort; Zweitreview S1, ANN-308). Offene bleiben; der Akte
    -- zugeordnete (KOM-004, ANN-312) fallen erst mit ihr; im Training fallen
    -- sie mit dem Verhaeltnis (cascade). Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select m.id,
             m.organization_id,
             app.retention_due_at(
               (date_trunc('year', coalesce(m.closed_at, m.last_entry_at)
                                     at time zone v_org.time_zone)
                 + interval '1 year' - interval '1 day')::date,
               app.retention_interval('patientenkommunikation'),
               v_org.time_zone
             ) as due_at
      from public.platform_messages m
      where m.organization_id = v_org.id
        and m.relationship_kind = 'treatment'
        and m.status in ('closed', 'answered')
        and m.record_assigned_at is null
        and not app.under_legal_hold(v_org.id, 'patient', m.patient_id)
    ),
    geloescht as (
      delete from public.platform_messages m
      using faellig f
      where m.id = f.id
        and f.due_at <= now()
      returning m.id, m.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_messages', g.id, 'patientenkommunikation', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_nachrichten = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche + v_nachrichten + v_anhaenge
                + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung + v_rueckmeldung + v_teamchat;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung + v_teamchat > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'loeschauftrag', v_auftraege,
          'loeschjournal', v_journal,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'terminwunsch', v_wuensche,
          'patientenkommunikation', v_nachrichten,
          'rueckfrageanhang', v_anhaenge,
          'radflotte', v_radflotte,
          'urlaub', v_urlaub,
          'arbeitszeit', v_arbeitszeit,
          'zeitkonto', v_zeitkonto,
          'erstattung', v_erstattung,
          'teamchat', v_teamchat,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore fallen Nachrichten des Teamchats wie alle anderen erneut.
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- POR-009: ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- KOM-005: ein Anhang haengt am Vorgang (cascade) und faellt vor ihm.
    'platform_message_attachments',
    -- KOM-001: ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    -- FLT-001: die Radflotte haengt an keiner Akte. Schluessel und Sperren
    -- vor den Pannen (eine Sperre zeigt auf ihre Panne, set null); einzeln
    -- geloeschte Fotos vor Check-Up und Panne, deren Stellen und uebrige
    -- Fotos mit ihnen fallen (cascade); das ausgemusterte Rad zuletzt.
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_photos',
    'fleet_checkups',
    'fleet_breakdowns',
    'fleet_bikes',
    -- URL-001: Storno und Abwesenheiten in den Arbeitszeiten fallen mit ihrem
    -- Urlaub (cascade).
    'staff_leave_requests',
    'staff_leave_entitlements',
    -- AZ-001: Arbeitszeitaenderungen haengen an keiner anderen Zeile.
    'staff_working_time_requests',
    -- ZK-001: ein Eintrag im Zeitkonto; seine Abweichung faellt mit ihm
    -- (cascade).
    'staff_time_account_entries',
    -- ERS-001: einzeln verworfene Belege vor ihrem Antrag; eine Erstattung
    -- nimmt ihre übrigen Belege mit (cascade), deren Objekte über den
    -- Löschauftrag.
    'staff_reimbursement_receipts',
    'staff_reimbursements',
    -- ORG-006: Rückmeldungen von Beschäftigten hängen an keiner anderen Zeile.
    'staff_feedback',
    -- TEAM-001: erst geleerte Inhalte (die Zeile bleibt als Anker), dann
    -- Nachrichten vor ihren Gesprächen; Antworten, Erwähnungen und Lesestand
    -- fallen mit (cascade).
    'team_message_contents',
    'team_messages',
    'team_channels',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    -- TEAM-001: Nur der Inhalt fiel (Anker mit Antworten) - leeren, nicht
    -- löschen, sonst nähme cascade die Antworten mit. Wer entfernt hat, steht
    -- nach einem Restore nicht mehr fest; der Anker heißt dann „gelöscht“.
    elsif v_tabelle = 'team_message_contents' then
      delete from public.team_message_mentions where message_id = any (v_ids);
      with g as (
        update public.team_messages
           set body = null, edited_at = null, author_staff_member_id = null,
               removed_at = coalesce(removed_at, now()),
               removed_kind = coalesce(removed_kind, 'author')
         where id = any (v_ids) and body is not null
        returning id
      )
      select array_agg(id) into v_geloescht from g;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- ORG-006 (Nachprüfung N2): Anonyme Rückmeldungen schreibt der Lauf mit
  -- neuer Kennung neu - ein älteres Backup trägt andere Kennungen als das
  -- Journal. Was nach dem Restore über der Frist liegt, fällt hier nach der
  -- Regel selbst, nicht erst im nächsten Lauf.
  delete from public.staff_feedback f
  using public.organizations o
  where o.id = f.organization_id
    and app.retention_due_at(
          (f.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          o.time_zone
        ) <= now();

  -- TEAM-001: Fällige Ausgangsnachrichten mit laufenden Antworten verlieren
  -- ihren Inhalt nach der Regel, nicht über das Journal (ANN-610).
  perform app.strip_due_team_anchors(o.id, o.time_zone) from public.organizations o;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;
