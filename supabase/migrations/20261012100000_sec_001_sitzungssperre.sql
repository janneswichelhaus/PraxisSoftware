-- =============================================================================
-- SEC-001: Sitzungssperre im Server (ADR-025 Punkte 1, 2, 6 und 8; W1 und W2)
--
-- Jannes, 2026-10-06: "Wichtiger ist, dass Nutzer nach 30/60 min automatisch
-- ausgeloggt werden." Das ist ADR-025: hoechstens 60 Minuten nach der letzten
-- Anmeldung (Punkt 1), 30 Minuten nach der letzten Bedienung (Punkt 2, W1 (a),
-- entschieden). Die Oberflaeche sperrt sich selbst; dieser Teil sorgt dafuer,
-- dass ein Token nach Ablauf einer der beiden Fristen keine Zeile mehr liest
-- und keinen Aufruf mehr durchbringt (Punkt 6, ADR-004).
--
-- Woher die Zeitpunkte kommen:
--   * Letzte Anmeldung: der juengste Zeitstempel im Claim `amr` des Tokens.
--     Der Anmeldedienst schreibt ihn bei jeder Anmeldung (Kennwort, Link,
--     zweiter Faktor) und laesst ihn beim Erneuern des Tokens stehen. Eine
--     erneute Freigabe ist eine neue Anmeldung und damit ein neuer Zeitstempel.
--   * Letzte Bedienung (W2 (a), ANN-256): ein Vermerk je Sitzung
--     (`session_activity`, Schluessel ist der Claim `session_id`), den die
--     Anwendung bei Bedienung hoechstens einmal je Minute ueber
--     `session_status(true)` schreibt. Ohne Vermerk gilt die Anmeldung als
--     letzte Bedienung.
--   Ein Token ohne `amr` oder ohne `session_id` gilt als gesperrt: Der
--   Anmeldedienst stellt keines ohne beide aus.
--
-- Wo geprueft wird (Punkt 6): in den vier Funktionen, an denen heute jeder
-- Lesepfad und jeder Schreibweg haengt - `app.current_organization_id()`,
-- `app.current_person_id()`, `app.has_any_role()` (Praxiskonten; dort wird
-- heute `is_active` gelesen) und `app.platform_readable_access()`
-- (Plattformkonten, ADR-023 Punkt 19). Jede Policy, jede Projektion und jede
-- RPC erbt die Sperre; die Pruefung steht in `app.session_open()`.
--
-- Was die Sperre nicht tut: abmelden (Punkt 3), protokollieren (Konsequenzen:
-- keine Auditereignisse, kein `denied`-Eintrag), Konten unterscheiden (Punkt 8:
-- beide Fristen gelten fuer Praxis- und Plattformkonten gleich).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die beiden Fristen - je eine Konstante an einer Stelle (Punkt 8)
-- -----------------------------------------------------------------------------
create or replace function app.session_max_duration()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '60 minutes'
$$;

create or replace function app.session_idle_timeout()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 minutes'
$$;

comment on function app.session_max_duration() is
  'Hoechstdauer bis zur erneuten Freigabe, gezaehlt ab der letzten Anmeldung (ADR-025 Punkt 1). Gilt fuer Praxis- und Plattformkonten (Punkt 8).';
comment on function app.session_idle_timeout() is
  'Inaktivitaetsfrist (ADR-025 Punkt 2, W1 (a), Jannes 2026-10-06). Gilt fuer Praxis- und Plattformkonten (Punkt 8).';

-- -----------------------------------------------------------------------------
-- 2. Der Vermerk der letzten Bedienung (W2 (a), ANN-256)
-- -----------------------------------------------------------------------------
create table public.session_activity (
  session_id       uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  last_activity_at timestamptz not null
);

create index session_activity_last_activity_idx on public.session_activity (last_activity_at);

comment on table public.session_activity is
  'Letzte Bedienung je Sitzung des Anmeldedienstes (ADR-025 Punkt 2, W2 (a), ANN-256). Nur Zeitpunkt und Konto, kein Inhalt, keine Seite. Geschrieben nur ueber session_status(true), hoechstens einmal je Minute. Kein direkter Zugriff. Datenklasse sitzungsvermerk: ein Tag nach der letzten Bedienung; faellt mit dem Konto.';

alter table public.session_activity enable row level security;
revoke all on public.session_activity from public, anon, authenticated;

insert into public.retention_classes (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values (
  'sitzungsvermerk', 'intern', null, 'event_time', interval '1 day', 'ANN-256',
  'Letzte Bedienung je Sitzung fuer die Sitzungssperre (ADR-025). Nach 60 Minuten ohne neue Anmeldung ist die Sitzung ohnehin gesperrt; ein Tag laesst Spielraum fuer Uhren und Laeufe.',
  56
);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'session_activity', 'sitzungsvermerk', 'automatisch',
  'Eigene Regel in session_status: jeder Aufruf mit Bedienung entfernt Vermerke, deren letzte Bedienung laenger als einen Tag zurueckliegt; faellt ausserdem mit dem Konto (FK on delete cascade).',
  53
);

-- -----------------------------------------------------------------------------
-- 3. Die Pruefung an einer Stelle
-- -----------------------------------------------------------------------------
create or replace function app.jwt_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(auth.jwt() ->> 'session_id', '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function app.jwt_last_authentication()
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_amr jsonb := auth.jwt() -> 'amr';
begin
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    return null;
  end if;
  -- Nur Anmeldungen mit einem ersten Faktor zaehlen. Ein zweiter Faktor
  -- (`totp`, `phone`, `webauthn`) laesst sich mit einem gesperrten Token
  -- einrichten und bestaetigen; zaehlte er, hoebe er die Sperre ohne
  -- Kennwort auf (Zweitreview SEC-EPIC-001). Unbekannte Methoden zaehlen
  -- nicht - lieber eine Anmeldung zu viel.
  return (
    select to_timestamp(max((e ->> 'timestamp')::double precision))
    from jsonb_array_elements(v_amr) e
    where jsonb_typeof(e) = 'object'
      and jsonb_typeof(e -> 'timestamp') = 'number'
      and e ->> 'method' in (
        'password', 'otp', 'magiclink', 'recovery', 'invite', 'email/signup', 'oauth', 'sso/saml'
      )
  );
end;
$$;

comment on function app.jwt_session_id() is
  'Claim session_id des Tokens; null, wenn er fehlt oder keine UUID ist (ADR-025).';
comment on function app.jwt_last_authentication() is
  'Juengster Zeitstempel einer Anmeldung mit erstem Faktor im Claim amr (ADR-025 Punkt 1); ein zweiter Faktor zaehlt nicht. null ohne passende Angabe.';

-- Die beiden Zeitpunkte der laufenden Sitzung; ohne Token oder Claims leer.
create or replace function app.session_times(
  out last_authentication timestamptz,
  out last_activity timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.letzte_anmeldung,
         greatest(a.letzte_anmeldung, (
           select s.last_activity_at
           from public.session_activity s
           where s.session_id = app.jwt_session_id()
             and s.user_id = auth.uid()
         ))
  from (select app.jwt_last_authentication() as letzte_anmeldung) a
  where auth.uid() is not null
    and app.jwt_session_id() is not null
    and a.letzte_anmeldung is not null
$$;

create or replace function app.session_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select now() < t.last_authentication + app.session_max_duration()
       and now() < t.last_activity + app.session_idle_timeout()
       -- Eine Anmeldung aus der Zukunft (falsche Uhr, gebautes Token) oeffnet nichts.
       and t.last_authentication <= now() + interval '1 minute'
    from app.session_times() t
  ), false)
$$;

comment on function app.session_open() is
  'Ob die laufende Sitzung offen ist: hoechstens 60 Minuten nach der letzten Anmeldung und 30 Minuten nach der letzten Bedienung (ADR-025 Punkte 1, 2, 6). Ohne Token, amr oder session_id: false.';

revoke all on function app.session_max_duration() from public;
revoke all on function app.session_idle_timeout() from public;
revoke all on function app.jwt_session_id() from public;
revoke all on function app.jwt_last_authentication() from public;
revoke all on function app.session_times() from public;
revoke all on function app.session_open() from public;

-- -----------------------------------------------------------------------------
-- 4. Die vier Stellen, an denen jeder Zugriff haengt (Punkt 6)
--    Jeweils die letzte Fassung, ergaenzt um app.session_open().
-- -----------------------------------------------------------------------------
create or replace function app.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.organization_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active
    and app.session_open()
$$;

create or replace function app.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.person_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active
    and app.session_open()
$$;

create or replace function app.has_any_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.user_profiles up on up.id = ur.user_id
    where ur.user_id = auth.uid()
      and up.is_active
      and ur.organization_id = up.organization_id
      and ur.role_key = any (p_roles)
  ) and app.session_open()
$$;

create or replace function app.platform_readable_access(p_access_id uuid)
returns table (organization_id uuid, relationship_kind text, relationship_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, a.relationship_kind, a.relationship_id
  from public.platform_accesses a
  where a.id = p_access_id
    and a.account_user_id = auth.uid()
    and a.status = 'active'
    and not exists (select 1 from public.user_profiles up where up.id = auth.uid())
    and coalesce(app.platform_access_ended_at(a.id) > now(), true)
    and app.session_open()
$$;

-- -----------------------------------------------------------------------------
-- 5. Was die Anwendung fragt: Stand der Sperre, und bei Bedienung der Vermerk
-- -----------------------------------------------------------------------------
create or replace function public.session_status(p_bedient boolean default false)
returns table (
  locked boolean,
  reason text,
  seconds_until_idle integer,
  seconds_until_max integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session uuid := app.jwt_session_id();
  v_offen boolean;
  v_zeiten record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_offen := app.session_open();

  -- Eine gesperrte Sitzung bleibt gesperrt: Der Vermerk wird nur geschrieben,
  -- solange sie offen ist. Sonst liesse sich eine Sperre mit einem Aufruf
  -- wieder aufheben - genau das, was die erneute Anmeldung verlangt.
  if p_bedient and v_offen then
    insert into public.session_activity as s (session_id, user_id, last_activity_at)
    values (v_session, auth.uid(), now())
    on conflict (session_id) do update
      set last_activity_at = excluded.last_activity_at
      where s.user_id = excluded.user_id;

    -- Eigene Loeschregel der Datenklasse sitzungsvermerk (ANN-256).
    delete from public.session_activity s
    where s.last_activity_at < now() - interval '1 day';
  end if;

  select * into v_zeiten from app.session_times();

  if not v_offen then
    return query select
      true,
      case
        when v_zeiten.last_authentication is null
          or v_zeiten.last_authentication > now() + interval '1 minute' then 'unbekannt'
        when now() >= v_zeiten.last_authentication + app.session_max_duration() then 'hoechstdauer'
        else 'inaktiv'
      end,
      0,
      0;
    return;
  end if;

  return query select
    false,
    null::text,
    greatest(0, floor(extract(epoch from (v_zeiten.last_activity + app.session_idle_timeout() - now())))::integer),
    greatest(0, floor(extract(epoch from (v_zeiten.last_authentication + app.session_max_duration() - now())))::integer);
end;
$$;

comment on function public.session_status(boolean) is
  'Stand der Sitzungssperre (ADR-025): gesperrt mit Grund, sonst die Sekunden bis zu beiden Fristen. Mit p_bedient = true vermerkt der Aufruf eine Bedienung - nur, solange die Sitzung offen ist. Kein Inhalt, keine Auditzeile.';

revoke all on function public.session_status(boolean) from public, anon;
grant execute on function public.session_status(boolean) to authenticated;
