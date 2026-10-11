-- =============================================================================
-- SEC-009: Befunde aus dem Zweitreview von SEC-EPIC-002 (ADR-025 Fassung 2)
--
-- Der Anmeldedienst kennt die Sitzungssperre der Datenbank nicht. Fünf Wege
-- daran vorbei werden hier geschlossen:
--
--   1. Ein Passkey zählt nur, wenn er **freigegeben** ist (ANN-329). Mit einem
--      gesperrten Token lässt sich beim Anmeldedienst ein eigener Passkey
--      anlegen; freigeben lässt er sich nur in offener Sitzung, kurz nach dem
--      Anlegen. Welcher Passkey eine Sitzung geöffnet hat, zeigt
--      `auth.webauthn_credentials.last_used_at`: Der Anmeldedienst setzt es in
--      derselben Transaktion, in der er die Sitzung ausstellt. Das Urteil steht
--      danach an der Sitzung (`session_unlocks.passkey_ok`).
--   2. Kein Kennwort über den Anmeldedienst (ANN-330): Ein Trigger lehnt jedes
--      Kennwort ab, das der Anmeldedienst (`supabase_auth_admin`) setzt -
--      Selbstbedienung, Admin-API, Wiederherstellung. Testkonten bekommen ihr
--      Kennwort per SQL (Seed, Test-Umgebung), nicht über den Dienst.
--   3. Der fünfte Fehlversuch bleibt, auch wenn das Löschen der Sitzung beim
--      Anmeldedienst scheitert (kein fail-open).
--   4. Mails: kein Wiederherstellungslink für irgendein Konto; ein Anmeldelink
--      an ein Praxiskonto nur zu einer offenen Einladung oder einem von der
--      Inhaberin vor höchstens einer Stunde angestoßenen Anmeldelink (ANN-331).
--   5. Zeilen mit offenem Fehlversuch fallen, wenn die Sitzung beim
--      Anmeldedienst nicht mehr besteht (ADR-008).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Freigegebene Passkeys
-- -----------------------------------------------------------------------------
create table public.passkey_approvals (
  credential_id uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  approved_at   timestamptz not null default now()
);

comment on table public.passkey_approvals is
  'Passkeys, die das Konto in offener Sitzung freigegeben hat (ADR-025 Punkt 10, ANN-329). Nur die Kennung des Passkeys beim Anmeldedienst, kein Schlüssel. Kein direkter Zugriff; geschrieben nur über approve_own_passkey. Datenklasse accountdaten: fällt mit dem Konto; eine Freigabe zu einem entfernten Passkey räumt approve_own_passkey ab.';

alter table public.passkey_approvals enable row level security;
revoke all on public.passkey_approvals from public, anon, authenticated;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('passkey_approvals', 'accountdaten', 'ueber_elterndatensatz',
   'Freigabe eines Passkeys (SEC-009). Fällt mit dem Konto (FK on delete cascade); Freigaben zu entfernten Passkeys räumt approve_own_passkey ab.', 132);

alter table public.session_unlocks add column passkey_ok boolean;

comment on column public.session_unlocks.passkey_ok is
  'Ob die Passkey-Anmeldung dieser Sitzung von einem freigegebenen Passkey stammt (ANN-329); null bis zur ersten Prüfung durch session_status.';

-- Die Passkey-Anmeldung im Claim amr, getrennt von den übrigen Anmeldungen.
create or replace function app.jwt_passkey_authentication()
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
  return (
    select to_timestamp(max((e ->> 'timestamp')::double precision))
    from jsonb_array_elements(v_amr) e
    where jsonb_typeof(e) = 'object'
      and jsonb_typeof(e -> 'timestamp') = 'number'
      and e ->> 'method' = 'passkey'
  );
end;
$$;

-- Die übrigen ersten Faktoren - ohne Passkey; der zählt nur freigegeben.
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
  -- Nur Anmeldungen mit einem ersten Faktor zählen; ein zweiter Faktor
  -- (`totp`, `phone`, `webauthn`) nicht (Zweitreview SEC-EPIC-001). Der
  -- Passkey (`passkey`) steht in app.jwt_passkey_authentication() und zählt
  -- nur, wenn er freigegeben ist (SEC-009, ANN-329).
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

comment on function app.jwt_last_authentication() is
  'Jüngster Zeitstempel einer Anmeldung mit erstem Faktor im Claim amr, ohne Passkey (ADR-025 Punkt 1). Der Passkey zählt über app.last_first_factor() nur freigegeben.';

-- Stammt die Passkey-Anmeldung zum Zeitpunkt p von einem freigegebenen
-- Passkey dieses Kontos? Der zum Zeitpunkt zuletzt benutzte Passkey (höchstens
-- zwei Minuten daneben) muss freigegeben sein. Ohne Tabelle des
-- Anmeldedienstes oder bei jedem Fehler: nein (fail-closed).
create or replace function app.passkey_sign_in_approved(p_zeitpunkt timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_zeitpunkt is null or auth.uid() is null
     or to_regclass('auth.webauthn_credentials') is null then
    return false;
  end if;
  execute $q$
    select exists (
      select 1
      from public.passkey_approvals a
      where a.user_id = $1
        and a.credential_id = (
          select c.id
          from auth.webauthn_credentials c
          where c.user_id = $1
            and c.last_used_at between $2 - interval '2 minutes' and $2 + interval '2 minutes'
          order by abs(extract(epoch from (c.last_used_at - $2)))
          limit 1
        )
    )
  $q$ into v_ok using auth.uid(), p_zeitpunkt;
  return coalesce(v_ok, false);
exception when others then
  return false;
end;
$$;

-- Das Urteil der Sitzung, wenn es schon steht; sonst die Prüfung von jetzt.
create or replace function app.passkey_counts(p_zeitpunkt timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_urteil boolean;
begin
  if p_zeitpunkt is null then
    return false;
  end if;
  select u.passkey_ok into v_urteil
  from public.session_unlocks u
  where u.session_id = app.jwt_session_id()
    and u.user_id = auth.uid();
  if v_urteil is not null then
    return v_urteil;
  end if;
  return app.passkey_sign_in_approved(p_zeitpunkt);
end;
$$;

-- Die letzte echte Anmeldung: erster Faktor oder freigegebener Passkey.
create or replace function app.last_first_factor()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    app.jwt_last_authentication(),
    case when app.passkey_counts(p.zeitpunkt) then p.zeitpunkt end
  )
  from (select app.jwt_passkey_authentication() as zeitpunkt) p
$$;

comment on function app.last_first_factor() is
  'Jüngste echte Anmeldung der laufenden Sitzung: erster Faktor aus amr oder Passkey, wenn dieser freigegeben ist (ANN-329). Eine Freigabe per PIN zählt nicht.';

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
  from (select app.last_first_factor() as letzte_anmeldung) a
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

revoke all on function app.jwt_passkey_authentication() from public;
revoke all on function app.jwt_last_authentication() from public;
revoke all on function app.passkey_sign_in_approved(timestamptz) from public;
revoke all on function app.passkey_counts(timestamptz) from public;
revoke all on function app.last_first_factor() from public;
revoke all on function app.session_times() from public;

-- Einen gerade angelegten Passkey freigeben: offene Sitzung, eigenes Konto,
-- höchstens zehn Minuten alt (wie ANN-325).
create or replace function public.approve_own_passkey(p_credential_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_da boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.session_open() then
    raise exception 'session locked' using errcode = '42501';
  end if;
  if to_regclass('auth.webauthn_credentials') is null then
    raise exception 'passkey not approvable' using errcode = 'P0001';
  end if;
  execute $q$
    select exists (
      select 1 from auth.webauthn_credentials c
      where c.id = $1 and c.user_id = $2 and c.created_at >= now() - $3
    )
  $q$ into v_da using p_credential_id, auth.uid(), app.pin_fresh_authentication();
  if not v_da then
    raise exception 'passkey not approvable' using errcode = 'P0001';
  end if;

  insert into public.passkey_approvals (credential_id, user_id)
  values (p_credential_id, auth.uid())
  on conflict (credential_id) do nothing;

  -- Freigaben zu Passkeys, die es beim Anmeldedienst nicht mehr gibt.
  execute $q$
    delete from public.passkey_approvals a
    where a.user_id = $1
      and not exists (select 1 from auth.webauthn_credentials c where c.id = a.credential_id)
  $q$ using auth.uid();
end;
$$;

comment on function public.approve_own_passkey(uuid) is
  'Gibt einen Passkey des eigenen Kontos frei (ADR-025 Punkt 10, ANN-329): nur in offener Sitzung und höchstens zehn Minuten nach dem Anlegen. Erst ein freigegebener Passkey öffnet eine Sitzung. Keine Auditzeile.';

create or replace function public.own_passkey_approvals()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.credential_id from public.passkey_approvals a where a.user_id = auth.uid()
$$;

comment on function public.own_passkey_approvals() is
  'Die freigegebenen Passkeys des eigenen Kontos (Kennungen), für „Mein Konto“ und die Einrichtung (ANN-329).';

revoke all on function public.approve_own_passkey(uuid) from public, anon;
grant execute on function public.approve_own_passkey(uuid) to authenticated;
revoke all on function public.own_passkey_approvals() from public, anon;
grant execute on function public.own_passkey_approvals() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Kein Kennwort über den Anmeldedienst (ANN-330)
-- -----------------------------------------------------------------------------
create or replace function app.reject_password_via_auth_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'supabase_auth_admin'
     and coalesce(new.encrypted_password, '') <> ''
     and (tg_op = 'INSERT' or new.encrypted_password is distinct from old.encrypted_password) then
    raise exception 'password sign-in is disabled' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function app.reject_password_via_auth_service() is
  'Kein Kennwort über den Anmeldedienst (ADR-025 Punkt 9, ANN-330): lehnt jedes Kennwort ab, das supabase_auth_admin setzt. Kennwörter der Testkonten kommen per SQL (Seed, Test-Umgebung).';

create trigger auth_users_no_password
  before insert or update of encrypted_password on auth.users
  for each row execute function app.reject_password_via_auth_service();

-- -----------------------------------------------------------------------------
-- 3. und 5. Freigabe per PIN: kein fail-open, keine Zeile ohne Sitzung
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
  v_angemeldet timestamptz := app.last_first_factor();
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.session_open() then
    raise exception 'session locked' using errcode = '42501';
  end if;
  -- Eine Freigabe per PIN zählt hier nicht: nur eine echte Anmeldung
  -- (ANN-325), ein Passkey nur freigegeben (ANN-329).
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
  -- Ohne Token, Sitzung und echte Anmeldung gibt es keinen Versuch: Die PIN
  -- meldet nie an. Eine Sitzung aus einem nicht freigegebenen Passkey hat
  -- keinen - sonst brächte jeder neue fremde Passkey fünf neue Versuche.
  if v_konto is null or v_sitzung is null or app.last_first_factor() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.pin_hash into v_hash from public.account_pins p where p.user_id = v_konto;
  if v_hash is null then
    raise exception 'no pin' using errcode = 'P0002';
  end if;

  -- Eigene Löschregel der Datenklasse sitzungsvermerk für diese Tabelle:
  -- ohne offenen Fehlversuch oder verbraucht einen Tag nach der letzten
  -- Änderung; mit offenem Fehlversuch, sobald es die Sitzung beim
  -- Anmeldedienst nicht mehr gibt. Ein Tag trägt, solange jwt_expiry unter
  -- einem Tag liegt (heute 3600 Sekunden).
  delete from public.session_unlocks u
  where u.changed_at < now() - interval '1 day'
    and (u.failed_attempts = 0 or u.consumed_at is not null)
    and u.session_id <> v_sitzung;
  if to_regclass('auth.sessions') is not null then
    begin
      execute $q$
        delete from public.session_unlocks u
        where u.changed_at < now() - interval '1 day'
          and u.session_id <> $1
          and not exists (select 1 from auth.sessions s where s.id = u.session_id)
      $q$ using v_sitzung;
    exception when others then
      null;
    end;
  end if;

  insert into public.session_unlocks (session_id, user_id)
  values (v_sitzung, v_konto)
  on conflict (session_id) do nothing;

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
    -- Die Sitzung endet auch beim Anmeldedienst. Scheitert das, trägt die
    -- Sperre über consumed_at allein: kein Zurückrollen des Verbrauchs
    -- (Zweitreview SEC-EPIC-002, Befund 3).
    if to_regclass('auth.sessions') is not null then
      begin
        execute 'delete from auth.sessions where id = $1' using v_sitzung;
      exception when others then
        null;
      end;
    end if;
    return query select false, 0, true;
    return;
  end if;

  return query select false, app.pin_max_attempts() - v_versuche, false;
end;
$$;

-- session_status hält das Urteil über die Passkey-Anmeldung an der Sitzung
-- fest, sobald es die Sitzung zum ersten Mal sieht (ANN-329).
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
  v_passkey timestamptz := app.jwt_passkey_authentication();
  v_offen boolean;
  v_zeiten record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if v_session is not null and v_passkey is not null then
    insert into public.session_unlocks as u (session_id, user_id, passkey_ok)
    values (v_session, auth.uid(), app.passkey_sign_in_approved(v_passkey))
    on conflict (session_id) do update
      set passkey_ok = coalesce(u.passkey_ok, excluded.passkey_ok)
      where u.user_id = excluded.user_id;
  end if;

  v_offen := app.session_open();

  if p_bedient and v_offen then
    insert into public.session_activity as s (session_id, user_id, last_activity_at)
    values (v_session, auth.uid(), now())
    on conflict (session_id) do update
      set last_activity_at = excluded.last_activity_at
      where s.user_id = excluded.user_id;

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

revoke all on function public.session_status(boolean) from public, anon;
grant execute on function public.session_status(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Mails des Anmeldedienstes (ANN-331)
-- -----------------------------------------------------------------------------
create or replace function public.auth_email_allowed(p_user_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null or p_action is null then false
    -- Kein Kennwort, keine Wiederherstellung (ADR-025 Punkt 9).
    when p_action = 'recovery' then false
    -- Plattformkonten bekommen keine Mail des Anmeldedienstes (ADR-023
    -- Fassung 4, Punkt 18; die Einladung verschickt der Zugangsdienst).
    when app.is_platform_account(p_user_id) then false
    -- Praxiskonten: ein Anmeldelink nur zu einer offenen Einladung oder zu
    -- einem Anmeldelink, den die Inhaberin vor höchstens einer Stunde
    -- angestoßen hat (ADR-025 Punkt 12, ANN-328, ANN-331).
    when p_action = 'magiclink' then
      exists (
        select 1
        from public.staff_account_invitations i
        join auth.users u on u.id = p_user_id
        where i.email = lower(u.email)
          and i.status = 'pending'
          and i.expires_at > now()
      )
      or exists (
        select 1
        from public.audit_log a
        join public.staff_members sm on sm.id = a.subject_id
        join public.user_profiles up
          on up.person_id = sm.person_id and up.organization_id = sm.organization_id
        where up.id = p_user_id
          and a.action = 'staff_account.password_reset_requested'
          and a.subject_type = 'staff_member'
          and a.occurred_at > now() - interval '1 hour'
      )
    else true
  end
$$;

comment on function public.auth_email_allowed(uuid, text) is
  'Darf der Anmeldedienst diese Mail an dieses Konto schicken? Nie einen Wiederherstellungslink; Plattformkonten nichts; Praxiskonten einen Anmeldelink nur zu offener Einladung oder frisch angestoßenem Anmeldelink (ADR-025 Fassung 2, ANN-331). Nur service_role (Mail-Hook des Zugangsdienstes).';

revoke all on function public.auth_email_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.auth_email_allowed(uuid, text) to service_role;
