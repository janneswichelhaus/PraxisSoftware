-- =============================================================================
-- R3-010: Die IBAN der Praxis wird auf ihre Pruefziffer geprueft
--
-- Die Spalte pruefte bisher nur die Form (`^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$`),
-- und weder das Formular noch `save_practice_billing_profile` rechneten die
-- Pruefziffer nach. Eine Tippfehler-IBAN wurde damit gespeichert - und von da
-- an in den Snapshot jeder ausgestellten Rechnung uebernommen (ADR-009
-- Punkt 10). Auffallen wuerde das erst, wenn kein Geld ankommt; auf den
-- verschickten Blaettern stuende die falsche Nummer bereits.
--
-- Die Pruefung nach ISO 13616 (mod 97 == 1) steht an einer Stelle als
-- Funktion und wird von beiden Wegen benutzt: von der Tabelle als
-- Check-Constraint - damit sie fuer jeden Weg in die Zeile gilt, auch fuer
-- postgres - und von der Schreibfunktion, damit die Meldung sagt, was los
-- ist. Das Formular prueft dasselbe vor dem Absenden; die Zusage haengt
-- nicht daran (ADR-004).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Pruefziffer
--
-- Stellenweise gerechnet: Die umgestellte IBAN hat als Zahl bis zu 38
-- Stellen und passt in keinen numerischen Typ, den PostgreSQL mit `%`
-- rechnet, ohne zu numeric zu greifen.
-- -----------------------------------------------------------------------------
create or replace function app.iban_checksum_ok(p_iban text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_iban       text;
  v_umgestellt text;
  v_zeichen    text;
  v_rest       integer := 0;
  v_stelle     integer;
  i            integer;
begin
  if p_iban is null then
    return false;
  end if;

  -- Dieselbe Normalisierung wie beim Schreiben: auf dem Papier steht die
  -- IBAN mit Leerzeichen, in der Datenbank ohne.
  v_iban := upper(replace(btrim(p_iban), ' ', ''));

  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then
    return false;
  end if;

  -- Die ersten vier Zeichen wandern ans Ende, Buchstaben werden zu Zahlen
  -- (A = 10 ... Z = 35).
  v_umgestellt := substring(v_iban from 5) || substring(v_iban from 1 for 4);

  for i in 1..length(v_umgestellt) loop
    v_zeichen := substring(v_umgestellt from i for 1);

    if v_zeichen between '0' and '9' then
      v_rest := (v_rest * 10 + v_zeichen::integer) % 97;
    else
      v_stelle := ascii(v_zeichen) - 55;
      v_rest := (v_rest * 100 + v_stelle) % 97;
    end if;
  end loop;

  return v_rest = 1;
end;
$$;

comment on function app.iban_checksum_ok(text) is
  'Prueft eine IBAN nach ISO 13616 (mod 97 == 1) einschliesslich ihrer Form (R3-010). Null und jede Zeichenkette, die der Form nicht entspricht, gelten als nicht in Ordnung.';

revoke all on function app.iban_checksum_ok(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Zusage an der Tabelle
--
-- Die vorhandene Formpruefung bleibt stehen: Sie sagt etwas anderes und ist
-- nach Regel 5 ohnehin nicht zu aendern. Die neue Bedingung kommt daneben.
-- -----------------------------------------------------------------------------
alter table public.practice_billing_profiles
  add constraint practice_billing_profiles_iban_checksum
  check (app.iban_checksum_ok(iban));

-- -----------------------------------------------------------------------------
-- 3. Der Schreibpfad
--
-- Uebernommen aus 20260919130000_practice_billing_profile.sql, Abschnitt 5,
-- ergaenzt um die Pruefung hinter dem Umsatzsteuerstatus.
-- -----------------------------------------------------------------------------
create or replace function public.save_practice_billing_profile(
  p_legal_name            text,
  p_street                text,
  p_house_number          text,
  p_postal_code           text,
  p_city                  text,
  p_phone                 text,
  p_email                 text,
  p_tax_number            text,
  p_vat_id                text,
  p_small_business        boolean,
  p_bank_name             text,
  p_account_holder        text,
  p_iban                  text,
  p_bic                   text,
  p_invoice_number_prefix text,
  p_payment_term_days     smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_neu   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_billing_profile() then
    raise exception 'not allowed to manage the billing profile' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_small_business is null then
    raise exception 'the vat status must be stated explicitly' using errcode = '22023';
  end if;

  -- Die IBAN wird geprueft, bevor sie in den Snapshot jeder spaeteren
  -- Rechnung wandert (ADR-009 Punkt 10). Die Tabelle haelt dieselbe Zusage;
  -- hier steht sie, damit die Meldung sagt, was zu tun ist.
  if not app.iban_checksum_ok(p_iban) then
    raise exception 'the iban checksum does not match' using errcode = '22023';
  end if;

  v_neu := not exists (
    select 1 from public.practice_billing_profiles where organization_id = v_org
  );

  insert into public.practice_billing_profiles as b (
    organization_id, legal_name, street, house_number, postal_code, city,
    phone, email, tax_number, vat_id, small_business,
    bank_name, account_holder, iban, bic,
    invoice_number_prefix, payment_term_days, created_by, updated_by
  )
  values (
    v_org,
    btrim(p_legal_name), btrim(p_street), nullif(btrim(p_house_number), ''),
    btrim(p_postal_code), btrim(p_city),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    btrim(p_tax_number), nullif(btrim(p_vat_id), ''), p_small_business,
    nullif(btrim(p_bank_name), ''), nullif(btrim(p_account_holder), ''),
    -- Die IBAN steht auf dem Papier mit Leerzeichen und in der Datenbank ohne.
    upper(replace(btrim(p_iban), ' ', '')),
    upper(nullif(btrim(p_bic), '')),
    coalesce(upper(nullif(btrim(p_invoice_number_prefix), '')), 'RG'),
    coalesce(p_payment_term_days, 14::smallint),
    v_actor, v_actor
  )
  on conflict (organization_id) do update set
    legal_name            = excluded.legal_name,
    street                = excluded.street,
    house_number          = excluded.house_number,
    postal_code           = excluded.postal_code,
    city                  = excluded.city,
    phone                 = excluded.phone,
    email                 = excluded.email,
    tax_number            = excluded.tax_number,
    vat_id                = excluded.vat_id,
    small_business        = excluded.small_business,
    bank_name             = excluded.bank_name,
    account_holder        = excluded.account_holder,
    iban                  = excluded.iban,
    bic                   = excluded.bic,
    invoice_number_prefix = excluded.invoice_number_prefix,
    payment_term_days     = excluded.payment_term_days,
    updated_at            = now(),
    updated_by            = v_actor
  where b.organization_id = v_org;

  -- Kein Inhalt im Kontext: Eine Steuernummer gehoert nicht ins Auditlog
  -- (ADR-011). Was sich geaendert hat, steht in der Zeile selbst.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.billing_profile_changed', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web', 'created', v_neu)
  );
end;
$$;

comment on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint) is
  'Legt die Praxis-Stammdaten fuer Rechnungen an oder aendert sie (ABR-000, R3-010). Nur owner (ANN-074). Prueft die IBAN nach ISO 13616. Protokolliert organization.billing_profile_changed ohne Inhalte (ADR-011).';

revoke all on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint)
  from public, anon;
grant execute on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint)
  to authenticated;
