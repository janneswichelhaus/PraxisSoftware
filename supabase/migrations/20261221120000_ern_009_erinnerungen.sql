-- =============================================================================
-- ERN-009 (ERN-EPIC-003): Erinnerungen an das Ernährungstagebuch
--
-- ADR-027 Punkt 12, ADR-024 Punkte 13 bis 17. Pfad A (neue Tabelle,
-- Plattformpfade, Katalog der Benachrichtigungen, Zeitplan).
--
--   app.notification_kinds()          + nutrition_diary_reminder (Katalog an
--                                       einer Stelle; Wortlaut in
--                                       src/lib/begriffe.ts)
--   public.nutrition_diary_reminders  je Zugang und Mahlzeit eine Uhrzeit
--   public.platform_diary_reminders, set_platform_diary_reminders
--                                       lesen und wählen (die Person)
--   public.enqueue_nutrition_diary_reminders  Zeitplan alle 15 Minuten
--   app.notification_drop_reason      + der Sinn einer Tagebucherinnerung,
--                                       Obergrenzen je Mahlzeit (ANN-662)
--
-- REGELN (ADR-027 Punkt 12): von Anfang an aus; die Person stellt je Mahlzeit
-- eine Uhrzeit ein; fester Text ohne Ernährungsbezug ("Erinnerung: Ihr
-- Eintrag für heute."); Mail oder Push nach ihrer Wahl; Ruhezeiten gelten -
-- was hineinfiele, entfällt; Abschalten kostet nichts. Keine Erinnerung von
-- der Praxis, kein Nachfassen bei ausbleibenden Einträgen, keine Serie.
--
-- WER: die Person und ihre rechtliche Vertretung, je für ihren eigenen
-- Zugang (ADR-024 Punkt 15); nie die Begleitung. Die Praxis sieht nicht, wer
-- Erinnerungen gewählt hat (ANN-344) - die Tabelle hat kein Tabellenrecht und
-- keine Lese-Policy. Kein Auditereignis (ADR-024 Punkt 17).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Katalog (aus 20261104100000_kom_009_benachrichtigungen.sql; neu ist
--    nur die letzte Art)
-- -----------------------------------------------------------------------------
create or replace function app.notification_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'appointment_reminder',
    'appointment_changed',
    'appointment_cancelled',
    'message_answered',
    'request_answered',
    'plan_assigned',
    -- ERN-009 (ADR-027 Punkt 12): zu den Zeiten, die die Person wählt.
    'nutrition_diary_reminder'
  ]::text[]
$$;

-- Die Zustellaufträge prüfen ihre Art am Katalog (Check-Constraint); der
-- neue Eintrag gilt ab hier auch dort.

-- Eine Erinnerung je Mahlzeit, Zeitpunkt, Zugang und Weg - der Zeitplan darf
-- alle 15 Minuten laufen.
create unique index notification_deliveries_one_diary_reminder
  on public.notification_deliveries (access_id, kind, channel, subject_id, subject_at)
  where kind = 'nutrition_diary_reminder';

-- -----------------------------------------------------------------------------
-- 2. Die Wahl der Person
-- -----------------------------------------------------------------------------
create table public.nutrition_diary_reminders (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  profile_id      uuid not null,
  -- Je Zugang (ADR-024 Punkt 15): eine Vertretung wählt für sich selbst.
  access_id       uuid not null references public.platform_accesses (id) on delete cascade,
  meal            text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- Ortszeit der Praxis, in Schritten von 15 Minuten.
  remind_at       time not null check (
                    extract(minute from remind_at)::integer % 15 = 0
                    and extract(second from remind_at) = 0),
  chosen_at       timestamptz not null default now(),
  chosen_by       uuid not null,

  constraint nutrition_diary_reminders_once unique (access_id, profile_id, meal),
  constraint nutrition_diary_reminders_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade
);

comment on table public.nutrition_diary_reminders is
  'ERN-009 (ADR-027 Punkt 12, ADR-024 Punkt 15): Erinnerungen an das Ernährungstagebuch - je Zugang und Mahlzeit eine Uhrzeit, von der Person bzw. ihrer rechtlichen Vertretung gewählt. Ohne Zeile keine Erinnerung. Kein Tabellenrecht und keine Lese-Policy: die Praxis sieht nicht, wer Erinnerungen gewählt hat (ANN-344). Datenklasse: Ernährungsberatung, fällt mit dem Profil und mit dem Zugang.';

create index nutrition_diary_reminders_profile_idx on public.nutrition_diary_reminders (profile_id);
create index nutrition_diary_reminders_organization_idx on public.nutrition_diary_reminders (organization_id);

alter table public.nutrition_diary_reminders enable row level security;
revoke all on public.nutrition_diary_reminders from public, anon, authenticated;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('nutrition_diary_reminders', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Erinnerungen an das Ernährungstagebuch (ERN-009): fallen mit dem Ernährungsprofil (ADR-027 Punkt 6) und mit dem Zugang.',
   251);

-- -----------------------------------------------------------------------------
-- 3. Hat eine Tagebucherinnerung noch Sinn?
--
-- Die Zeile gibt es noch mit derselben Uhrzeit, der Zugang gehört zur
-- laufenden Beratung, das Tagebuch ist an, die Einwilligung erteilt, und der
-- Zeitpunkt ist höchstens zwei Stunden her (ANN-662).
-- -----------------------------------------------------------------------------
create function app.nutrition_diary_reminder_live(p_reminder_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (p_at at time zone o.time_zone)::time = r.remind_at
           and p_at > now() - interval '2 hours'
           and a.access_kind in ('self', 'legal_representative')
           and app.notification_access_live(a.id)
           and n.ended_on is null and n.diary_enabled
           and app.nutrition_consent_granted(n.id)
           and a.organization_id = n.organization_id
           and a.relationship_kind = n.relationship_kind
           and a.relationship_id = n.relationship_id
    from public.nutrition_diary_reminders r
    join public.platform_accesses a on a.id = r.access_id
    join public.nutrition_profiles n on n.id = r.profile_id
    join public.organizations o on o.id = r.organization_id
    where r.id = p_reminder_id
  ), false)
$$;

revoke all on function app.nutrition_diary_reminder_live(uuid, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lesen und wählen (die Person)
-- -----------------------------------------------------------------------------
create function public.platform_diary_reminders(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_profil public.nutrition_profiles%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'nutrition') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_profil := app.platform_nutrition_profile(p_access_id);
  if v_profil.id is null then
    return jsonb_build_object('reminders', null);
  end if;
  -- Kein Vertretungseintrag: die Wahl ist Sache des eigenen Zugangs (wie
  -- platform_notification_settings).
  return jsonb_build_object(
    'reminders', coalesce((
      select jsonb_agg(jsonb_build_object('meal', r.meal, 'time', to_char(r.remind_at, 'HH24:MI'))
                       order by r.remind_at, r.meal)
      from public.nutrition_diary_reminders r
      where r.access_id = p_access_id and r.profile_id = v_profil.id), '[]'::jsonb),
    'email', coalesce((
      select 'nutrition_diary_reminder' = any (s.email_kinds)
      from public.platform_notification_settings s where s.access_id = p_access_id), false),
    'push', coalesce((
      select 'nutrition_diary_reminder' = any (s.push_kinds)
      from public.platform_notification_settings s where s.access_id = p_access_id), false),
    'switched_off', exists (
      select 1 from public.notification_kind_switches k
      where k.organization_id = v_zugang.organization_id and k.kind = 'nutrition_diary_reminder'),
    'quiet_from', coalesce((select s.quiet_from from public.platform_notification_settings s
                            where s.access_id = p_access_id),
                           app.notification_rule('quiet_from')::smallint),
    'quiet_until', coalesce((select s.quiet_until from public.platform_notification_settings s
                             where s.access_id = p_access_id),
                            app.notification_rule('quiet_until')::smallint)
  );
end;
$$;

revoke all on function public.platform_diary_reminders(uuid) from public, anon;
grant execute on function public.platform_diary_reminders(uuid) to authenticated;

comment on function public.platform_diary_reminders(uuid) is
  'ERN-009 (ADR-027 Punkt 12): die eigenen Erinnerungen an das Tagebuch - je Mahlzeit eine Uhrzeit, ob per Mail und Push, ob die Praxis die Art abgeschaltet hat, die Ruhezeit. Recht nutrition (Person, rechtliche Vertretung; nie die Begleitung), nur für diesen Zugang. Ohne Recht null; ohne laufende Beratung reminders null.';

-- Ersetzt die Wahl dieses Zugangs: Uhrzeiten je Mahlzeit und die Wege dieser
-- Art. Einschalten braucht Einwilligung und eingeschaltetes Tagebuch;
-- abschalten (leere Liste, keine Wege) geht immer - auch in der Lesefrist
-- (wie set_platform_notification_settings).
create function public.set_platform_diary_reminders(
  p_access_id uuid,
  p_reminders jsonb,
  p_email     boolean,
  p_push      boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_profil public.nutrition_profiles%rowtype;
  v_aus    boolean;
  v_art    constant text := 'nutrition_diary_reminder';
begin
  if not app.platform_access_allows(p_access_id, 'nutrition') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  if p_email is null or p_push is null or jsonb_typeof(p_reminders) is distinct from 'array'
     or jsonb_array_length(p_reminders) > 4
     or exists (
       select 1 from jsonb_array_elements(p_reminders) e
       where jsonb_typeof(e) <> 'object'
          or (e ->> 'meal') is null
          or (e ->> 'meal') not in ('breakfast', 'lunch', 'dinner', 'snack')
          or coalesce(e ->> 'time', '') !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
          or exists (select 1 from jsonb_object_keys(e) k where k not in ('meal', 'time')))
     or (select count(distinct e ->> 'meal') from jsonb_array_elements(p_reminders) e)
        <> jsonb_array_length(p_reminders) then
    raise exception 'invalid reminders' using errcode = '22023';
  end if;
  v_aus := jsonb_array_length(p_reminders) = 0 and not p_email and not p_push;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  select p.* into v_profil from public.nutrition_profiles p
  where p.id = (app.platform_nutrition_profile(p_access_id)).id
  for update;
  if v_profil.id is null then
    raise exception 'nutrition profile not found' using errcode = 'P0002';
  end if;
  if not v_aus then
    if not app.platform_access_writable(p_access_id)
       or not app.nutrition_consent_granted(v_profil.id) then
      raise exception 'nutrition consent missing' using errcode = '42501';
    end if;
    if not v_profil.diary_enabled then
      raise exception 'nutrition diary is off' using errcode = '42501';
    end if;
  end if;

  delete from public.nutrition_diary_reminders r
  where r.access_id = p_access_id and r.profile_id = v_profil.id;
  insert into public.nutrition_diary_reminders
    (organization_id, profile_id, access_id, meal, remind_at, chosen_by)
  select v_profil.organization_id, v_profil.id, p_access_id, e ->> 'meal', (e ->> 'time')::time,
         auth.uid()
  from jsonb_array_elements(p_reminders) e;

  -- Die Wege dieser einen Art in der Wahl des Zugangs (ADR-024 Punkt 15);
  -- die anderen Arten bleiben, wie sie sind.
  insert into public.platform_notification_settings
    (access_id, organization_id, email_kinds, push_kinds, chosen_at, chosen_by)
  values (
    p_access_id, v_zugang.organization_id,
    case when p_email then array[v_art] else '{}' end,
    case when p_push then array[v_art] else '{}' end,
    now(), auth.uid()
  )
  on conflict (access_id) do update
    set email_kinds = (
          select coalesce(array_agg(distinct k order by k), '{}')
          from unnest(array_remove(platform_notification_settings.email_kinds, v_art)
                      || case when p_email then array[v_art] else '{}'::text[] end) k),
        push_kinds = (
          select coalesce(array_agg(distinct k order by k), '{}')
          from unnest(array_remove(platform_notification_settings.push_kinds, v_art)
                      || case when p_push then array[v_art] else '{}'::text[] end) k),
        chosen_at = now(),
        chosen_by = auth.uid();
end;
$$;

revoke all on function public.set_platform_diary_reminders(uuid, jsonb, boolean, boolean) from public, anon;
grant execute on function public.set_platform_diary_reminders(uuid, jsonb, boolean, boolean) to authenticated;

comment on function public.set_platform_diary_reminders(uuid, jsonb, boolean, boolean) is
  'ERN-009 (ADR-027 Punkt 12, ADR-024 Punkt 15): die eigenen Erinnerungen an das Tagebuch wählen - je Mahlzeit höchstens eine Uhrzeit in Schritten von 15 Minuten, dazu Mail und Push dieser Art. Einschalten mit Einwilligung, eingeschaltetem Tagebuch, nicht in der Lesefrist; alles aus geht immer. Nur für diesen Zugang, nie die Begleitung. Kein Auditereignis.';

-- -----------------------------------------------------------------------------
-- 5. Der Zeitplan: alle 15 Minuten, was seit dem letzten Lauf fällig wurde
-- -----------------------------------------------------------------------------
create function public.enqueue_nutrition_diary_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  insert into public.notification_deliveries
    (organization_id, access_id, kind, channel, subject_id, subject_at, due_at)
  select r.organization_id, r.access_id, 'nutrition_diary_reminder', w.channel, r.id, z.am, z.am
  from public.nutrition_diary_reminders r
  join public.organizations o on o.id = r.organization_id
  join public.platform_notification_settings s on s.access_id = r.access_id
  cross join (values ('email'), ('push')) w(channel)
  cross join lateral (
    select ((now() at time zone o.time_zone)::date + r.remind_at) at time zone o.time_zone as am
  ) z
  where z.am <= now() and z.am > now() - interval '20 minutes'
    and not exists (
      select 1 from public.notification_kind_switches k
      where k.organization_id = r.organization_id and k.kind = 'nutrition_diary_reminder')
    and (
      (w.channel = 'email' and 'nutrition_diary_reminder' = any (s.email_kinds))
      or (w.channel = 'push' and 'nutrition_diary_reminder' = any (s.push_kinds)
          and exists (select 1 from public.platform_push_subscriptions p
                      where p.access_id = r.access_id))
    )
    -- Was in die Ruhezeit fiele, entfällt (ADR-024 Punkt 15): Eine
    -- Erinnerung an den heutigen Eintrag hat am nächsten Morgen keinen Sinn.
    and app.notification_due_at(
          z.am, o.time_zone,
          coalesce(s.quiet_from, app.notification_rule('quiet_from')::smallint),
          coalesce(s.quiet_until, app.notification_rule('quiet_until')::smallint)) = z.am
    and app.nutrition_diary_reminder_live(r.id, z.am)
  on conflict (access_id, kind, channel, subject_id, subject_at)
    where kind = 'nutrition_diary_reminder' do nothing;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.enqueue_nutrition_diary_reminders() from public, anon, authenticated;

comment on function public.enqueue_nutrition_diary_reminders() is
  'ERN-009 (ADR-027 Punkt 12): legt die Erinnerungen an das Tagebuch an, die in den letzten 20 Minuten fällig wurden - je gewähltem Weg, nicht in der Ruhezeit, nur mit laufender Beratung, eingeschaltetem Tagebuch und Einwilligung. Alle 15 Minuten wiederholbar. Nur für den Zeitplan.';

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format('select cron.schedule(%L, %L, %L)',
      'enqueue-nutrition-diary-reminders', '*/15 * * * *',
      'select public.enqueue_nutrition_diary_reminders()');
  else
    raise notice 'pg_cron ist nicht verfuegbar - Tagebucherinnerungen (ERN-009) entstehen nicht automatisch.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. Beim Abholen: Sinn und Obergrenzen (ANN-662)
--
-- Aus 20261104100000_kom_009_benachrichtigungen.sql; neu sind der Sinn einer
-- Tagebucherinnerung und die Obergrenzen: eine je Mahlzeit und Tag statt
-- einer je Art, und sie zählen nicht in die Woche der übrigen Arten.
-- -----------------------------------------------------------------------------
create or replace function app.notification_drop_reason(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d       public.notification_deliveries%rowtype;
  s       public.platform_notification_settings%rowtype;
  v_tz    text;
  v_heute date;
  v_termin public.appointments%rowtype;
  v_tagebuch boolean;
begin
  select * into d from public.notification_deliveries x where x.id = p_id;
  v_tagebuch := d.kind = 'nutrition_diary_reminder';
  if not app.notification_access_live(d.access_id) then
    return 'access_ended';
  end if;
  if exists (
    select 1 from public.notification_kind_switches k
    where k.organization_id = d.organization_id and k.kind = d.kind
  ) then
    return 'switched_off';
  end if;
  select * into s from public.platform_notification_settings x where x.access_id = d.access_id;
  if not found
     or (d.channel = 'email' and not (d.kind = any (s.email_kinds)))
     or (d.channel = 'push' and not (d.kind = any (s.push_kinds))) then
    return 'not_wanted';
  end if;
  if d.channel = 'push' and not exists (
    select 1 from public.platform_push_subscriptions p where p.access_id = d.access_id
  ) then
    return 'no_device';
  end if;
  if d.channel = 'email' and not exists (
    select 1 from public.platform_accesses a
    join auth.users u on u.id = a.account_user_id
    where a.id = d.access_id and coalesce(btrim(u.email), '') <> ''
  ) then
    return 'no_address';
  end if;
  if d.due_at < now() - make_interval(hours => app.notification_rule('stale_hours')) then
    return 'stale';
  end if;

  if d.kind in ('appointment_reminder', 'appointment_changed') then
    select * into v_termin from public.appointments a where a.id = d.subject_id;
    if not found or v_termin.status <> 'confirmed'
       or v_termin.starts_at is distinct from d.subject_at or v_termin.starts_at <= now() then
      return 'obsolete';
    end if;
  elsif d.kind = 'appointment_cancelled' and d.subject_at <= now() then
    return 'obsolete';
  elsif v_tagebuch and not app.nutrition_diary_reminder_live(d.subject_id, d.subject_at) then
    -- ERN-009: Uhrzeit geändert, Tagebuch aus, Widerruf, Beratung beendet,
    -- mehr als zwei Stunden her.
    return 'obsolete';
  end if;

  -- Obergrenzen je Weg: eine je Art und Tag (Tagebuch: je Mahlzeit), eine
  -- Zahl je Woche über die übrigen Arten. Mitgezaehlt wird, was gerade
  -- abgeholt ist.
  select o.time_zone into v_tz from public.organizations o where o.id = d.organization_id;
  v_heute := (now() at time zone v_tz)::date;
  if exists (
    select 1 from public.notification_deliveries x
    where x.access_id = d.access_id and x.channel = d.channel and x.kind = d.kind and x.id <> d.id
      and (not v_tagebuch or x.subject_id = d.subject_id)
      and (x.state = 'sent' or (x.state = 'pending' and x.claimed_at > now() - interval '15 minutes'))
      and (coalesce(x.finished_at, x.claimed_at) at time zone v_tz)::date = v_heute
  ) then
    return 'daily_cap';
  end if;
  if not v_tagebuch and (
    select count(*) from public.notification_deliveries x
    where x.access_id = d.access_id and x.channel = d.channel and x.id <> d.id
      and x.kind <> 'nutrition_diary_reminder'
      and (x.state = 'sent' or (x.state = 'pending' and x.claimed_at > now() - interval '15 minutes'))
      and coalesce(x.finished_at, x.claimed_at) > now() - interval '7 days'
  ) >= app.notification_rule('weekly_cap') then
    return 'weekly_cap';
  end if;
  return null;
end;
$$;
