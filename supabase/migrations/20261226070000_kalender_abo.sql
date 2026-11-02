-- Kalender-Abo (Prinzipien 0.32 §3.4, ANN-838): je Konto höchstens eine geheime Adresse, gespeichert
-- nur als SHA-256. Kein direkter Zugriff; erzeugt, gelesen und beendet nur über die Funktionen unten.
create table public.calendar_feeds (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

comment on table public.calendar_feeds is
  'Kalender-Abo je Konto (PRX-048, ANN-838, PROJECT_PRINCIPLES.md 3.4 dritte Ausnahme): die geheime Adresse nur als SHA-256, nie im Klartext; kein direkter Zugriff, auch nicht fuer service_role. Datenklasse: accountdaten; faellt mit dem Konto (on delete cascade), beim Sperren, beim Ausscheiden und beim Beenden.';

alter table public.calendar_feeds enable row level security;
revoke all on table public.calendar_feeds from public, anon, authenticated, service_role;

insert into public.data_registry (
  table_name, subject_kind, export_mode, export_patient, export_training, export_parent,
  journal_mode, journal_key, journal_class, journal_class_training, journal_daily, journal_rank,
  merge_mode, decision_note
) values
  ('calendar_feeds', 'staff', 'manual', '{}', '{}', null, 'none', 'id', null, null, false, null,
   'not_applicable',
   'Beschäftigtendaten: keine Auskunftsfunktion in der Anwendung; die Inhaberin beantwortet die Auskunft aus den Daten der Person (ANN-750). Nur die Pruefsumme der Adresse und ihr Datum; faellt mit dem Konto, beim Sperren, Ausscheiden und Beenden.');

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('calendar_feeds', 'accountdaten', 'ueber_elterndatensatz',
   'Kalender-Abo als SHA-256 (ANN-838). Faellt mit dem Konto (FK on delete cascade); Sperren, Ausscheiden und Beenden loeschen die Zeile.', 263);

-- Die Prüfsumme der Adresse an einer Stelle.
create function app.calendar_feed_hash(p_token text) returns text
  language sql immutable
  set search_path = ''
as $$ select encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex') $$;

-- Aktive Mitarbeiterdatensätze eines aktiven Kontos; ohne sie gibt es weder Abo noch Termine.
create function app.calendar_feed_staff(p_user uuid) returns setof uuid
  language sql stable
  set search_path = ''
as $$
  select sm.id
    from public.user_profiles up
    join public.staff_members sm
      on sm.person_id = up.person_id and sm.organization_id = up.organization_id
   where up.id = p_user and up.is_active and sm.employment_status = 'active'
$$;

revoke all on function app.calendar_feed_hash(text) from public, anon, authenticated, service_role;
revoke all on function app.calendar_feed_staff(uuid) from public, anon, authenticated, service_role;

-- Erzeugt oder ersetzt die Adresse und gibt sie genau einmal zurück; die alte gilt danach nicht mehr.
create function public.create_own_calendar_feed() returns text
  language plpgsql volatile security definer
  set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_angemeldet timestamptz := app.last_first_factor();
  v_token      text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if app.current_organization_id() is null
     or not exists (select 1 from app.calendar_feed_staff(v_user)) then
    raise exception 'not allowed to subscribe a calendar' using errcode = '42501';
  end if;
  -- Die Adresse liest über jede Sitzung hinaus: wie die PIN nur kurz nach einer echten Anmeldung,
  -- eine Freigabe per PIN zählt nicht (ANN-325, ANN-838).
  if v_angemeldet is null or v_angemeldet < now() - app.pin_fresh_authentication() then
    raise exception 'reauthentication required' using errcode = 'P0001';
  end if;

  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.calendar_feeds (user_id, token_hash)
  values (v_user, app.calendar_feed_hash(v_token))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now();
  return v_token;
end;
$$;

create function public.get_own_calendar_feed() returns table (created_at timestamptz)
  language sql stable security definer
  set search_path = ''
as $$
  select f.created_at
    from public.calendar_feeds f
   where f.user_id = auth.uid() and app.current_organization_id() is not null
$$;

-- Beenden geht immer, auch gesperrt oder ohne Organisation: Es nimmt nur weg.
create function public.end_own_calendar_feed() returns void
  language plpgsql volatile security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.calendar_feeds where user_id = auth.uid();
end;
$$;

-- Für die Function allein: eigene Termine ohne abgesagte, je Termin Beginn, Ende, Art und eine
-- Kennung ohne Rückschluss; null, wenn die Adresse unbekannt ist oder das Konto nicht mehr gilt.
create function public.calendar_feed(p_token text) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  v_hash text;
  v_user uuid;
  v_org  uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;
  v_hash := app.calendar_feed_hash(p_token);
  select f.user_id into v_user from public.calendar_feeds f where f.token_hash = v_hash;
  if v_user is null or not exists (select 1 from app.calendar_feed_staff(v_user)) then
    return null;
  end if;
  select up.organization_id into v_org from public.user_profiles up where up.id = v_user;

  return jsonb_build_object(
    'zeitzone', (select o.time_zone from public.organizations o where o.id = v_org),
    'termine', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'uid', encode(extensions.digest(convert_to(a.id::text || ':' || v_hash, 'UTF8'), 'sha256'), 'hex'),
                 'beginn', a.starts_at,
                 'ende', a.ends_at,
                 'art', case when a.kind = 'internal' then 'internal' else a.appointment_type end)
               order by a.starts_at, a.id)
        from public.appointments a
       where a.organization_id = v_org
         and a.staff_member_id in (select app.calendar_feed_staff(v_user))
         and a.status <> 'cancelled'
         and a.ends_at >= now() - interval '7 days'
         and a.starts_at < now() + interval '90 days'
    ), '[]'::jsonb));
end;
$$;

-- Sperren und Ausscheiden beenden das Abo, statt es ruhen zu lassen: Nach dem Entsperren gilt nie
-- die alte Adresse wieder (Zweitreview, wie das Profilbild beim Ausscheiden).
create function app.calendar_feed_end_on_lock() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  delete from public.calendar_feeds where user_id = new.id;
  return null;
end;
$$;

create function app.calendar_feed_end_on_leave() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  delete from public.calendar_feeds f
   using public.user_profiles up
   where up.id = f.user_id
     and up.person_id = new.person_id
     and up.organization_id = new.organization_id;
  return null;
end;
$$;

revoke all on function app.calendar_feed_end_on_lock() from public, anon, authenticated, service_role;
revoke all on function app.calendar_feed_end_on_leave() from public, anon, authenticated, service_role;

create trigger user_profiles_calendar_feed_on_lock
  after update of is_active on public.user_profiles
  for each row when (old.is_active and not new.is_active)
  execute function app.calendar_feed_end_on_lock();

create trigger staff_members_calendar_feed_on_leave
  after update of employment_status on public.staff_members
  for each row when (new.employment_status = 'inactive' and old.employment_status is distinct from 'inactive')
  execute function app.calendar_feed_end_on_leave();

-- Die Function ruft mit dem Token dieser Rolle (ANN-839): Sie darf genau `calendar_feed`, sonst
-- nichts, und ist keine allmächtige Kennung (ADR-004). Rollen gelten für den ganzen Cluster.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'calendar_feed_reader') then
    create role calendar_feed_reader nologin noinherit;
  end if;
end
$$;
grant calendar_feed_reader to authenticator;
grant usage on schema public to calendar_feed_reader;

revoke all on function public.create_own_calendar_feed() from public, anon;
revoke all on function public.get_own_calendar_feed() from public, anon;
revoke all on function public.end_own_calendar_feed() from public, anon;
grant execute on function public.create_own_calendar_feed() to authenticated;
grant execute on function public.get_own_calendar_feed() to authenticated;
grant execute on function public.end_own_calendar_feed() to authenticated;

revoke all on function public.calendar_feed(text) from public, anon, authenticated, service_role;
grant execute on function public.calendar_feed(text) to calendar_feed_reader;

comment on function public.create_own_calendar_feed() is
  'Kalender-Abo (PRX-048, ANN-838): erzeugt oder ersetzt die Adresse des eigenen Kontos aus 32 Zufallsbytes (pgcrypto) und gibt sie genau einmal zurueck; gespeichert wird nur die SHA-256. Nur ein aktives Konto mit eigenem, aktivem Mitarbeiterdatensatz und nur kurz nach einer echten Anmeldung (wie set_own_pin, ANN-325).';
comment on function public.get_own_calendar_feed() is
  'Kalender-Abo (PRX-049): seit wann das eigene Abo gilt; nie die Adresse.';
comment on function public.end_own_calendar_feed() is
  'Kalender-Abo (PRX-049): beendet das eigene Abo; die Adresse gilt sofort nicht mehr. Geht immer, auch gesperrt, weil es nur wegnimmt; auch "Alle Sitzungen beenden" ruft es.';
comment on function public.calendar_feed(text) is
  'Kalender-Abo (PRX-048, ANN-838, ANN-839): nur fuer die Rolle calendar_feed_reader der Function calendar-feed. Zeitzone der Praxis und eigene Termine ohne abgesagte, 7 Tage zurueck bis 90 voraus; je Termin uid (SHA-256 aus Termin und Abo, ohne Rueckschluss), beginn, ende, art (home_visit, practice, video oder internal fuer Fehlzeiten). null bei unbekannter Adresse, gesperrtem Konto oder ohne aktiven Mitarbeiterdatensatz.';
comment on function app.calendar_feed_end_on_lock() is
  'Kalender-Abo (ANN-838): Sperren des Zugangs loescht das Abo; nach dem Entsperren braucht es eine neue Adresse.';
comment on function app.calendar_feed_end_on_leave() is
  'Kalender-Abo (ANN-838): Ausscheiden (employment_status inactive) loescht das Abo des Kontos dieser Person in dieser Organisation.';
