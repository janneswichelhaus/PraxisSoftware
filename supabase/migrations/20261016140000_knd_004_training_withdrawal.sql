-- =============================================================================
-- KND-004 (KND-EPIC-001): Den Trainingsvertrag widerrufen - mit einem Knopf
--
-- Par. 356a BGB (seit dem 19. Juni 2026, Art. 11a der Richtlinie 2011/83/EU in
-- der Fassung 2023/2673): Wer einen Vertrag ueber eine Online-Oberflaeche
-- schliesst, muss ihn dort auch widerrufen koennen - mit einer gut lesbaren
-- Schaltflaeche "Vertrag widerrufen", einer Bestaetigung "Widerruf
-- bestaetigen" und einer sofortigen Eingangsbestaetigung mit Datum und
-- Uhrzeit auf einem dauerhaften Datentraeger.
--
--   training_contracts.withdrawn_*              der Widerruf am Nachweis
--   public.withdraw_platform_training_contract  der Knopf
--   public.platform_training_contract           + Widerruf und can_withdraw
--   public.list_platform_training_withdrawals   Widerrufe in Offene Punkte
--   public.get_training_contracts               der Nachweis am
--                                               Trainingsverhaeltnis
--
-- WAS DANACH GESCHIEHT (ANN-290): Der Widerruf ist die Erklaerung; er
-- loescht und storniert nichts selbst. Die Praxis sieht ihn 14 Tage in Offene
-- Punkte und dauerhaft am Trainingsverhaeltnis und wickelt ab - Paket
-- entfernen oder stornieren, erstatten, Vertrag beenden - mit den
-- vorhandenen Funktionen. Eine automatische Rueckabwicklung waere ein
-- Korrekturbeleg ohne Regel fuer den Wertersatz (Par. 357a Abs. 2 BGB).
--
-- WER: die Person selbst und eine rechtliche Vertretung mit Vermoegenssorge
-- am Trainingszugang (Recht contract, ANN-273), nie die Begleitung. In der
-- Praxis lesen owner und office (die Rollen des Pakets).
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Zeitpunkt, Zugang, Art und
-- Name einer Vertretung stehen am Nachweis.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Widerruf am Nachweis
-- -----------------------------------------------------------------------------
alter table public.training_contracts
  add column withdrawn_at                  timestamptz,
  add column withdrawn_on                  date,
  add column withdrawn_platform_access_id  uuid,
  add column withdrawn_access_kind         text
    check (withdrawn_access_kind in ('self', 'legal_representative')),
  add column withdrawn_representative_name text
    check (withdrawn_representative_name is null
           or length(btrim(withdrawn_representative_name)) between 1 and 200),
  add constraint training_contracts_withdrawal_shape check (
    (withdrawn_at is null and withdrawn_on is null and withdrawn_platform_access_id is null
       and withdrawn_access_kind is null and withdrawn_representative_name is null)
    or (withdrawn_at is not null and withdrawn_on is not null
        and withdrawn_platform_access_id is not null and withdrawn_access_kind is not null
        and (withdrawn_access_kind = 'legal_representative') = (withdrawn_representative_name is not null))
  );

comment on column public.training_contracts.withdrawn_at is
  'KND-004 (Par. 356a BGB): Eingang des Widerrufs ueber die Schaltflaeche im Konto. Loescht und storniert nichts selbst; die Praxis wickelt ab (ANN-290).';

-- -----------------------------------------------------------------------------
-- 2. Der Knopf
-- -----------------------------------------------------------------------------
create function public.withdraw_platform_training_contract(p_access_id uuid, p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_vertrag public.training_contracts%rowtype;
  v_heute   date;
begin
  if not app.platform_access_allows(p_access_id, 'contract') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'training' then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  perform 1 from public.training_relationships t
  where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id
  for update;

  select * into v_vertrag
  from public.training_contracts k
  where k.id = p_contract_id
    and k.training_relationship_id = v_zugang.relationship_id
    and k.organization_id = v_zugang.organization_id
  for update;
  if not found then
    raise exception 'training contract not found' using errcode = '42501';
  end if;
  if v_vertrag.withdrawn_at is not null then
    raise exception 'training contract already withdrawn' using errcode = '23514';
  end if;

  v_heute := app.training_today(v_vertrag.organization_id);
  if v_heute > v_vertrag.withdrawal_ends_on then
    raise exception 'withdrawal period has ended' using errcode = '23514';
  end if;

  update public.training_contracts k
     set withdrawn_at = now(),
         withdrawn_on = v_heute,
         withdrawn_platform_access_id = v_zugang.id,
         withdrawn_access_kind = v_zugang.access_kind,
         withdrawn_representative_name = case when v_zugang.access_kind = 'legal_representative'
                                              then v_zugang.representative_name end
   where k.id = p_contract_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'training_contract_withdrawn')
  );

  return (
    select jsonb_build_object(
      'withdrawn_at', k.withdrawn_at,
      'withdrawn_on', k.withdrawn_on,
      'label', k.package_label,
      'concluded_at', k.concluded_at
    )
    from public.training_contracts k where k.id = p_contract_id
  );
end;
$$;

revoke all on function public.withdraw_platform_training_contract(uuid, uuid) from public, anon;
grant execute on function public.withdraw_platform_training_contract(uuid, uuid) to authenticated;

comment on function public.withdraw_platform_training_contract(uuid, uuid) is
  'KND-004 (Par. 356a BGB): die Widerrufsfunktion der Plattform. Recht contract (Person, rechtliche Vertretung mit Vermoegenssorge), nur innerhalb der Frist und einmal. Liefert die Eingangsbestaetigung mit Zeitpunkt; die Abwicklung macht die Praxis (ANN-290).';

-- -----------------------------------------------------------------------------
-- 3. Der eigene Vertrag mit Widerruf
--
-- Aus 20261016130000_knd_003_training_contract.sql; neu sind withdrawn_at und
-- can_withdraw.
-- -----------------------------------------------------------------------------
create or replace function public.platform_training_contract(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_heute  date;
begin
  if not app.platform_access_allows(p_access_id, 'billing') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'training' then
    return null;
  end if;
  if not exists (
    select 1 from public.training_contracts k
    where k.training_relationship_id = v_zugang.relationship_id
  ) then
    return null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'training_contract')
  );
  v_heute := app.training_today(v_zugang.organization_id);

  return (
    select jsonb_build_object(
      'id', k.id,
      'concluded_at', k.concluded_at,
      'label', k.package_label,
      'package_months', k.package_months,
      'price_cents', k.price_cents,
      'currency', k.currency,
      'tax_rate_permille', k.tax_rate_permille,
      'vat_included', k.vat_included,
      'starts_on', k.starts_on,
      'ends_on', k.ends_on,
      'offered_on', k.offered_on,
      'wording_version', k.wording_version,
      'early_start_requested', k.early_start_requested,
      'contact_released', k.contact_released,
      'health_consent_granted', k.health_consent_granted,
      'withdrawal_ends_on', k.withdrawal_ends_on,
      -- KND-004: der Widerruf und ob der Knopf da ist (Recht contract).
      'withdrawn_at', k.withdrawn_at,
      'can_withdraw', k.withdrawn_at is null and v_heute <= k.withdrawal_ends_on
                      and app.platform_access_allows(p_access_id, 'contract'),
      'released_titles', coalesce((
        select jsonb_agg(t.title order by t.position)
        from public.training_takeovers t where t.training_relationship_id = k.training_relationship_id
      ), '[]'::jsonb)
    )
    from public.training_contracts k
    where k.training_relationship_id = v_zugang.relationship_id
    order by k.concluded_at desc
    limit 1
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Praxis: Widerrufe in Offene Punkte
--
-- Wie die Kuendigungen des Abos (ANG-003): 14 Tage, kein Zustand "gesehen".
-- Sehen duerfen sie die Rollen, die das Paket fuehren (owner, office).
-- -----------------------------------------------------------------------------
create function public.list_platform_training_withdrawals()
returns table (
  contract_id              uuid,
  training_relationship_id uuid,
  given_name               text,
  family_name              text,
  withdrawn_on             date,
  package_label            text,
  withdrawn_access_kind    text,
  withdrawn_representative_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null or not app.can_manage_training_packages() then
    return;
  end if;

  return query
  select k.id, k.training_relationship_id, pe.given_name, pe.family_name, k.withdrawn_on,
         k.package_label, k.withdrawn_access_kind, k.withdrawn_representative_name
  from public.training_contracts k
  join public.training_relationships t on t.id = k.training_relationship_id
  join public.persons pe on pe.id = t.person_id
  where k.organization_id = v_org
    and k.withdrawn_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
  order by k.withdrawn_at desc, k.id;
end;
$$;

revoke all on function public.list_platform_training_withdrawals() from public, anon;
grant execute on function public.list_platform_training_withdrawals() to authenticated;

comment on function public.list_platform_training_withdrawals() is
  'KND-004: Widerrufe von Trainingsvertraegen ueber die Plattform der letzten 14 Tage fuer Offene Punkte (owner, office). Ohne Recht keine Zeile.';

-- -----------------------------------------------------------------------------
-- 5. Praxis: der Nachweis am Trainingsverhaeltnis
-- -----------------------------------------------------------------------------
create function public.get_training_contracts(p_relationship_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null or not app.can_manage_training_packages() then
    return null;
  end if;
  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', k.id,
             'concluded_at', k.concluded_at,
             'concluded_on', k.concluded_on,
             'package_label', k.package_label,
             'price_cents', k.price_cents,
             'currency', k.currency,
             'starts_on', k.starts_on,
             'ends_on', k.ends_on,
             'wording_version', k.wording_version,
             'early_start_requested', k.early_start_requested,
             'withdrawal_ends_on', k.withdrawal_ends_on,
             'withdrawn_on', k.withdrawn_on,
             'withdrawn_access_kind', k.withdrawn_access_kind,
             'withdrawn_representative_name', k.withdrawn_representative_name
           ) order by k.concluded_at desc)
    from public.training_contracts k
    where k.training_relationship_id = p_relationship_id and k.organization_id = v_org
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_training_contracts(uuid) from public, anon;
grant execute on function public.get_training_contracts(uuid) to authenticated;

comment on function public.get_training_contracts(uuid) is
  'KND-004: die im Konto geschlossenen Trainingsvertraege eines Verhaeltnisses mit Widerrufsfrist und Widerruf (owner, office). Andere: null.';
