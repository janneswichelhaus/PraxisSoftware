-- =============================================================================
-- TRK-009 (TRK-EPIC-003): Freigabe ohne Netz per Passkey
--
-- ADR-025 Punkt 16 (Fassung 4), ADR-024 Punkt 9: Ohne Netz gibt ein Passkey
-- am Geraet frei, was auf dem Geraet liegt - nie eine Sitzung beim Server.
-- Die Anwendung prueft die Signatur mit Web Crypto gegen den oeffentlichen
-- Schluessel eines Passkeys des eigenen Kontos, den sie bei der letzten
-- Freigabe mit Netz abgelegt hat.
--
-- Woher der Schluessel kommt (ANN-359): Der Anmeldedienst gibt den
-- oeffentlichen Schluessel eines Passkeys nicht heraus. Die Anwendung liest
-- ihn deshalb beim Einrichten aus der Antwort des Browsers
-- (`getPublicKey()`, SPKI) und gibt ihn mit der Freigabe des Passkeys ab
-- (approve_own_passkey, ANN-329). In offener Sitzung holt sie ihn mit
-- own_offline_passkeys() auf das Geraet. Ein oeffentlicher Schluessel ist
-- kein Geheimnis; trotzdem gibt es ihn nur dem eigenen Konto in offener
-- Sitzung.
--
--   public.passkey_approvals      + webauthn_id, public_key, public_key_alg
--   public.approve_own_passkey    + den Schluessel mit abgeben (wahlweise)
--   public.own_offline_passkeys   die Schluessel fuer die Freigabe ohne Netz
--
-- Kein Auditereignis (ADR-025 Konsequenzen: Sperre und Freigabe sind keine).
-- =============================================================================

alter table public.passkey_approvals
  add column webauthn_id    text,
  add column public_key     text,
  add column public_key_alg integer;

alter table public.passkey_approvals
  add constraint passkey_approvals_offline_key check (
    (webauthn_id is null) = (public_key is null)
    and (public_key is null) = (public_key_alg is null)
    -- Kennung des Passkeys beim Browser (rawId) als base64url.
    and (webauthn_id is null
         or (webauthn_id ~ '^[A-Za-z0-9_-]+$' and length(webauthn_id) between 16 and 1366))
    -- Oeffentlicher Schluessel als SPKI in base64.
    and (public_key is null
         or (public_key ~ '^[A-Za-z0-9+/]+={0,2}$' and length(public_key) between 40 and 2048))
    -- ES256, EdDSA, RS256 (COSE) - was Web Crypto pruefen kann.
    and (public_key_alg is null or public_key_alg in (-7, -8, -257))
  );

comment on column public.passkey_approvals.webauthn_id is
  'TRK-009 (ANN-359): Kennung des Passkeys beim Browser (rawId, base64url) - damit die Freigabe ohne Netz genau diesen Passkey anfragt.';
comment on column public.passkey_approvals.public_key is
  'TRK-009 (ANN-359): oeffentlicher Schluessel des Passkeys (SPKI, base64), beim Einrichten aus der Antwort des Browsers gelesen. Kein Geheimnis; nur fuer die Freigabe ohne Netz auf dem Geraet (ADR-025 Punkt 16).';
comment on column public.passkey_approvals.public_key_alg is
  'TRK-009 (ANN-359): COSE-Algorithmus des Schluessels: -7 ES256, -8 EdDSA, -257 RS256.';

-- -----------------------------------------------------------------------------
-- Freigeben, wahlweise mit Schluessel
--
-- Aus 20261025120000_sec_009_passkey_freigabe.sql; neu sind die drei
-- Parameter fuer die Freigabe ohne Netz. Ohne sie bleibt alles wie bisher:
-- Ein Passkey ohne abgelegten Schluessel oeffnet ohne Netz nichts.
-- -----------------------------------------------------------------------------
drop function public.approve_own_passkey(uuid);

create function public.approve_own_passkey(
  p_credential_id  uuid,
  p_webauthn_id    text default null,
  p_public_key     text default null,
  p_public_key_alg integer default null
)
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
  -- Entweder alle drei oder keiner; die Form prueft der Constraint, der
  -- Fehler soll aber vor dem Blick in den Anmeldedienst stehen.
  if (p_webauthn_id is null) <> (p_public_key is null)
     or (p_public_key is null) <> (p_public_key_alg is null)
     or (p_webauthn_id is not null
         and (p_webauthn_id !~ '^[A-Za-z0-9_-]+$' or length(p_webauthn_id) not between 16 and 1366))
     or (p_public_key is not null
         and (p_public_key !~ '^[A-Za-z0-9+/]+={0,2}$' or length(p_public_key) not between 40 and 2048))
     or (p_public_key_alg is not null and p_public_key_alg not in (-7, -8, -257)) then
    raise exception 'invalid offline key' using errcode = '22023';
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

  insert into public.passkey_approvals (credential_id, user_id, webauthn_id, public_key, public_key_alg)
  values (p_credential_id, auth.uid(), p_webauthn_id, p_public_key, p_public_key_alg)
  on conflict (credential_id) do nothing;

  -- Freigaben zu Passkeys, die es beim Anmeldedienst nicht mehr gibt.
  execute $q$
    delete from public.passkey_approvals a
    where a.user_id = $1
      and not exists (select 1 from auth.webauthn_credentials c where c.id = a.credential_id)
  $q$ using auth.uid();
end;
$$;

comment on function public.approve_own_passkey(uuid, text, text, integer) is
  'Gibt einen Passkey des eigenen Kontos frei (ADR-025 Punkt 10, ANN-329): nur in offener Sitzung und hoechstens zehn Minuten nach dem Anlegen. Erst ein freigegebener Passkey oeffnet eine Sitzung. Wahlweise mit Kennung und oeffentlichem Schluessel fuer die Freigabe ohne Netz (TRK-009, ANN-359). Keine Auditzeile.';

revoke all on function public.approve_own_passkey(uuid, text, text, integer) from public, anon;
grant execute on function public.approve_own_passkey(uuid, text, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Die Schluessel fuer die Freigabe ohne Netz
--
-- Nur eigene, freigegebene Passkeys mit Schluessel, die es beim Anmeldedienst
-- noch gibt: Ein entfernter Passkey oeffnet nach dem naechsten Laden auch
-- ohne Netz nichts mehr. Nur in offener Sitzung - "bei der letzten Freigabe
-- mit Netz" (ADR-025 Punkt 16).
-- -----------------------------------------------------------------------------
create function public.own_offline_passkeys()
returns table (webauthn_id text, public_key text, public_key_alg integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.session_open() then
    raise exception 'session locked' using errcode = '42501';
  end if;
  if to_regclass('auth.webauthn_credentials') is null then
    return;
  end if;
  return query execute $q$
    select a.webauthn_id, a.public_key, a.public_key_alg
    from public.passkey_approvals a
    where a.user_id = $1
      and a.public_key is not null
      and exists (select 1 from auth.webauthn_credentials c
                  where c.id = a.credential_id and c.user_id = $1)
    order by a.approved_at
  $q$ using auth.uid();
end;
$$;

comment on function public.own_offline_passkeys() is
  'TRK-009 (ADR-025 Punkt 16, ANN-359): Kennung und oeffentlicher Schluessel der freigegebenen Passkeys des eigenen Kontos, die es beim Anmeldedienst noch gibt - fuer die Freigabe ohne Netz auf dem Geraet. Nur in offener Sitzung (42501).';

revoke all on function public.own_offline_passkeys() from public, anon;
grant execute on function public.own_offline_passkeys() to authenticated;
