-- =============================================================================
-- SEC-004: App-PIN und Passkey in der Sitzungssperre (ADR-025 Fassung 2,
-- Punkte 7, 10 und 11; PROJECT_PRINCIPLES.md 0.25, §3.4 Ausnahme)
--
-- Jannes, 2026-10-10: im Alltag Passkey, als Rueckweg eine eigene App-PIN,
-- kein Kennwort, keine PIN-Frist. Was dieser Teil leistet:
--
--   * Der Passkey zaehlt als Anmeldung: Die Anmeldeart `passkey` im Claim
--     `amr` setzt die Uhr aus Punkt 1 wie jede andere Anmeldung.
--   * Die App-PIN gibt eine bestehende, gesperrte Sitzung frei (Punkt 11).
--     Sie meldet nie an: Ohne Token mit Sitzung und Anmeldung gibt es keinen
--     Versuch. Gehasht und verglichen wird mit `pgcrypto` (bcrypt); selbst
--     gebaut sind allein der Fehlversuchszaehler und der Freigabevermerk.
--   * Nach fuenf Fehlversuchen in Folge ist die Sitzung verbraucht: Die
--     Datenbank sieht sie nie wieder offen und beendet sie beim Anmeldedienst.
--     Weiter geht es nur mit einer neuen Anmeldung per Passkey.
--   * Eine PIN festlegen oder aendern geht nur kurz nach einer Anmeldung
--     (ANN-325): Wer ein offenes, liegen gelassenes Geraet findet, kann sich
--     keine eigene PIN setzen und damit die Sitzung auf Dauer halten.
--
-- Nicht protokolliert (ADR-025, Konsequenzen; ADR-010 Punkt 15): Festlegen,
-- Freigeben und Verbrauchen sind keine Auditereignisse.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Konstanten an einer Stelle (Punkt 11, ANN-324, ANN-325)
-- -----------------------------------------------------------------------------
create or replace function app.pin_max_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 5
$$;

create or replace function app.pin_fresh_authentication()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '10 minutes'
$$;

comment on function app.pin_max_attempts() is
  'Fehlversuche in Folge, nach denen die Sitzung verbraucht ist (ADR-025 Punkt 11, ANN-324).';
comment on function app.pin_fresh_authentication() is
  'So kurz nach einer Anmeldung darf eine PIN festgelegt oder geaendert werden (ANN-325).';

-- Regel fuer eine PIN: sechs Ziffern, keine triviale Folge (Punkt 11, ANN-324).
-- `null` heisst zulaessig; sonst der Grund.
create or replace function app.pin_problem(p_pin text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return 'format';
  end if;
  if p_pin ~ '^(.)\1{5}$'
     or position(p_pin in '0123456789') > 0
     or position(p_pin in '9876543210') > 0 then
    return 'trivial';
  end if;
  return null;
end;
$$;

comment on function app.pin_problem(text) is
  'Prueft eine App-PIN: sechs Ziffern, keine gleichen Ziffern, keine auf- oder absteigende Reihe (ADR-025 Punkt 11). null heisst zulaessig, sonst format oder trivial.';

-- -----------------------------------------------------------------------------
-- 2. Die PIN je Konto und der Stand je Sitzung
-- -----------------------------------------------------------------------------
create table public.account_pins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  set_at   timestamptz not null default now()
);

comment on table public.account_pins is
  'App-PIN je Konto als bcrypt-Hash aus pgcrypto (ADR-025 Punkt 11, PROJECT_PRINCIPLES.md 3.4 Ausnahme). Nie im Klartext, kein direkter Zugriff; geschrieben nur ueber set_own_pin, geprueft nur ueber unlock_with_pin. Datenklasse accountdaten: faellt mit dem Konto.';

alter table public.account_pins enable row level security;
revoke all on public.account_pins from public, anon, authenticated;

create table public.session_unlocks (
  session_id      uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  pin_unlocked_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  consumed_at     timestamptz,
  changed_at      timestamptz not null default now()
);

create index session_unlocks_changed_idx on public.session_unlocks (changed_at);

comment on table public.session_unlocks is
  'Freigabe per App-PIN und Fehlversuche je Sitzung des Anmeldedienstes (ADR-025 Punkt 11, ANN-324). Nur Zeitpunkte und ein Zaehler, kein Inhalt. Kein direkter Zugriff; geschrieben nur ueber unlock_with_pin. Datenklasse sitzungsvermerk: ein Tag nach der letzten Aenderung, solange kein Fehlversuch offen ist.';

alter table public.session_unlocks enable row level security;
revoke all on public.session_unlocks from public, anon, authenticated;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('account_pins', 'accountdaten', 'ueber_elterndatensatz',
   'App-PIN als Hash (SEC-004). Faellt mit dem Konto (FK on delete cascade); eine neue PIN ersetzt die alte.', 131),
  ('session_unlocks', 'sitzungsvermerk', 'automatisch',
   'Eigene Regel in unlock_with_pin: Zeilen ohne offenen Fehlversuch und verbrauchte Sitzungen fallen einen Tag nach der letzten Aenderung; mit offenem Fehlversuch bleibt die Zeile, bis die PIN stimmt (sonst begaenne der Zaehler von vorn). Faellt mit dem Konto.', 54);

-- -----------------------------------------------------------------------------
-- 3. Der Passkey zaehlt als Anmeldung (Punkt 10)
-- -----------------------------------------------------------------------------
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
  -- Anmeldung auf (Zweitreview SEC-EPIC-001). `passkey` ist der Passkey als
  -- erster Faktor (ADR-025 Punkt 10), nicht der zweite Faktor `webauthn`.
  -- Unbekannte Methoden zaehlen nicht - lieber eine Anmeldung zu viel.
  return (
    select to_timestamp(max((e ->> 'timestamp')::double precision))
    from jsonb_array_elements(v_amr) e
    where jsonb_typeof(e) = 'object'
      and jsonb_typeof(e -> 'timestamp') = 'number'
      and e ->> 'method' in (
        'password', 'otp', 'magiclink', 'recovery', 'invite', 'email/signup', 'oauth', 'sso/saml',
        'passkey'
      )
  );
end;
$$;

comment on function app.jwt_last_authentication() is
  'Juengster Zeitstempel einer Anmeldung mit erstem Faktor im Claim amr (ADR-025 Punkte 1 und 10), Passkey eingeschlossen; ein zweiter Faktor zaehlt nicht. null ohne passende Angabe.';

-- -----------------------------------------------------------------------------
-- 4. Die Zeitpunkte der Sitzung: Eine Freigabe per PIN zaehlt wie eine
--    Anmeldung (Punkt 11); eine verbrauchte Sitzung hat keine Zeitpunkte.
-- -----------------------------------------------------------------------------
create or replace function app.session_consumed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_unlocks u
    where u.session_id = app.jwt_session_id()
      and u.consumed_at is not null
  )
$$;

comment on function app.session_consumed() is
  'Ob die laufende Sitzung durch Fehlversuche mit der App-PIN verbraucht ist (ADR-025 Punkt 11). Eine verbrauchte Sitzung oeffnet sich nie wieder.';

create or replace function app.session_times(
  out last_authentication timestamptz,
  out last_activity timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(a.letzte_anmeldung, f.pin_unlocked_at),
         greatest(a.letzte_anmeldung, f.pin_unlocked_at, (
           select s.last_activity_at
           from public.session_activity s
           where s.session_id = app.jwt_session_id()
             and s.user_id = auth.uid()
         ))
  from (select app.jwt_last_authentication() as letzte_anmeldung) a
  left join lateral (
    select u.pin_unlocked_at
    from public.session_unlocks u
    where u.session_id = app.jwt_session_id()
      and u.user_id = auth.uid()
  ) f on true
  where auth.uid() is not null
    and app.jwt_session_id() is not null
    and a.letzte_anmeldung is not null
    and not app.session_consumed()
$$;

revoke all on function app.pin_max_attempts() from public;
revoke all on function app.pin_fresh_authentication() from public;
revoke all on function app.pin_problem(text) from public;
revoke all on function app.session_consumed() from public;
revoke all on function app.jwt_last_authentication() from public;
revoke all on function app.session_times() from public;

-- -----------------------------------------------------------------------------
-- 5. PIN festlegen - nur in offener Sitzung, nur kurz nach einer Anmeldung
-- -----------------------------------------------------------------------------
create or replace function public.set_own_pin(p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_angemeldet timestamptz := app.jwt_last_authentication();
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.session_open() then
    raise exception 'session locked' using errcode = '42501';
  end if;
  -- Eine Freigabe per PIN zaehlt hier nicht: nur eine echte Anmeldung
  -- (ANN-325). Sonst setzte sich, wer die alte PIN kennt, eine neue.
  if v_angemeldet is null or v_angemeldet < now() - app.pin_fresh_authentication() then
    raise exception 'reauthentication required' using errcode = 'P0001';
  end if;
  v_problem := app.pin_problem(p_pin);
  if v_problem is not null then
    raise exception 'pin rejected: %', v_problem using errcode = '22023';
  end if;

  insert into public.account_pins as p (user_id, pin_hash, set_at)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        set_at = excluded.set_at;
end;
$$;

comment on function public.set_own_pin(text) is
  'Legt die App-PIN des eigenen Kontos fest (ADR-025 Punkt 11): nur in offener Sitzung und hoechstens zehn Minuten nach einer Anmeldung (ANN-325); sechs Ziffern, keine triviale Folge. Speichert nur den bcrypt-Hash. Keine Auditzeile.';

-- -----------------------------------------------------------------------------
-- 6. Ob das eigene Konto eine PIN hat - fuer die Sperrseite und die Einrichtung
-- -----------------------------------------------------------------------------
create or replace function public.own_pin_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_pins p where p.user_id = auth.uid())
$$;

comment on function public.own_pin_status() is
  'Ob das eigene Konto eine App-PIN hat (ADR-025 Punkt 11). Auch in gesperrter Sitzung: Die Sperrseite bietet die PIN nur an, wenn es eine gibt. Kein Inhalt.';

-- -----------------------------------------------------------------------------
-- 7. Mit der PIN freigeben (Punkt 11)
-- -----------------------------------------------------------------------------
create or replace function public.unlock_with_pin(p_pin text)
returns table (unlocked boolean, attempts_left integer, consumed boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_konto   uuid := auth.uid();
  v_sitzung uuid := app.jwt_session_id();
  v_hash    text;
  v_zeile   public.session_unlocks%rowtype;
  v_versuche integer;
begin
  -- Ohne Token, Sitzung und Anmeldung gibt es keinen Versuch: Die PIN meldet
  -- nie an, sie gibt nur eine bestehende Sitzung frei.
  if v_konto is null or v_sitzung is null or app.jwt_last_authentication() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.pin_hash into v_hash from public.account_pins p where p.user_id = v_konto;
  if v_hash is null then
    raise exception 'no pin' using errcode = 'P0002';
  end if;

  -- Eigene Loeschregel der Datenklasse sitzungsvermerk fuer diese Tabelle:
  -- ohne offenen Fehlversuch oder verbraucht, einen Tag nach der letzten
  -- Aenderung.
  delete from public.session_unlocks u
  where u.changed_at < now() - interval '1 day'
    and (u.failed_attempts = 0 or u.consumed_at is not null)
    and u.session_id <> v_sitzung;

  insert into public.session_unlocks (session_id, user_id)
  values (v_sitzung, v_konto)
  on conflict (session_id) do nothing;

  -- Eine Zeile je Sitzung, gesperrt fuer die Dauer des Versuchs: Zwei
  -- gleichzeitige Versuche zaehlen beide.
  select * into v_zeile
  from public.session_unlocks u
  where u.session_id = v_sitzung
  for update;

  if v_zeile.user_id <> v_konto then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_zeile.consumed_at is not null then
    return query select false, 0, true;
    return;
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_hash) = v_hash then
    update public.session_unlocks u
    set pin_unlocked_at = now(), failed_attempts = 0, changed_at = now()
    where u.session_id = v_sitzung;
    return query select true, app.pin_max_attempts(), false;
    return;
  end if;

  update public.session_unlocks u
  set failed_attempts = u.failed_attempts + 1, changed_at = now()
  where u.session_id = v_sitzung
  returning u.failed_attempts into v_versuche;

  if v_versuche >= app.pin_max_attempts() then
    update public.session_unlocks u
    set consumed_at = now()
    where u.session_id = v_sitzung;
    -- Die Sitzung endet auch beim Anmeldedienst: Ihr Erneuerungstoken traegt
    -- nicht mehr (wie beim Entziehen eines Plattformzugangs).
    if to_regclass('auth.sessions') is not null then
      execute 'delete from auth.sessions where id = $1' using v_sitzung;
    end if;
    return query select false, 0, true;
    return;
  end if;

  return query select false, app.pin_max_attempts() - v_versuche, false;
end;
$$;

comment on function public.unlock_with_pin(text) is
  'Gibt die laufende, gesperrte Sitzung mit der App-PIN des eigenen Kontos frei (ADR-025 Punkt 11). Meldet nie an. Nach fuenf Fehlversuchen in Folge ist die Sitzung verbraucht und beim Anmeldedienst beendet. Keine Auditzeile.';

-- -----------------------------------------------------------------------------
-- 8. Der Stand der Sperre nennt eine verbrauchte Sitzung (Grund `verbraucht`)
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
  -- wieder aufheben - genau das, was die erneute Freigabe verlangt.
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

  if not v_offen and app.session_consumed() then
    return query select true, 'verbraucht'::text, 0, 0;
    return;
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
  'Stand der Sitzungssperre (ADR-025): gesperrt mit Grund (inaktiv, hoechstdauer, verbraucht, unbekannt), sonst die Sekunden bis zu beiden Fristen. Mit p_bedient = true vermerkt der Aufruf eine Bedienung - nur, solange die Sitzung offen ist. Kein Inhalt, keine Auditzeile.';

revoke all on function public.session_status(boolean) from public, anon;
grant execute on function public.session_status(boolean) to authenticated;

revoke all on function public.set_own_pin(text) from public, anon;
grant execute on function public.set_own_pin(text) to authenticated;
revoke all on function public.own_pin_status() from public, anon;
grant execute on function public.own_pin_status() to authenticated;
revoke all on function public.unlock_with_pin(text) from public, anon;
grant execute on function public.unlock_with_pin(text) to authenticated;
