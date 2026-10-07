-- =============================================================================
-- KND-003 (KND-EPIC-001): Den Trainingsvertrag im eigenen Konto schliessen
--
-- PROJECT_PRINCIPLES.md 4.10: "Geschlossen wird der Trainingsvertrag ueber das
-- eigene Konto, mit Widerrufsbelehrung und eigener Einwilligung. Aus der Akte
-- wird nur uebernommen, was die Person ausdruecklich freigibt, als Kopie nach
-- 4.8. Das Paket beginnt nach dem Ende der Behandlung."
--
--   public.training_contracts                 der Nachweis des Vertrags am
--                                             Trainingsverhaeltnis
--   app.training_contract_wording_version     Fassung von Belehrung und
--                                             Bedingungen (ANN-288)
--   app.training_withdrawal_days              Widerrufsfrist in Tagen
--   app.training_offer_blocker                warum ein Angebot heute nicht
--                                             angenommen werden kann
--   public.platform_training_offer            das offene Angebot im Konto
--   public.accept_platform_training_offer     annehmen: alles in einem Aufruf
--   public.platform_training_contract         der eigene Vertrag mit der
--                                             Bestaetigung (Textform)
--   public.platform_export                    + der eigene Vertrag
--
-- EIN AUFRUF (ADR-021 Punkte 3 und 7): Das Annehmen legt unter Sperre der Akte
-- an, was der Vertrag braucht - Trainingsverhaeltnis, Kontaktdaten (nur wenn
-- freigegeben), den eigenen Zugang zum Training am selben Konto, die
-- Einwilligung (nur wenn erteilt), das Paket mit seiner Leistung (wie
-- create_training_package, ANN-276), die Kopien der freigegebenen Angaben und
-- den Vertragsnachweis. Scheitert ein Schritt, entsteht nichts. Zwischen den
-- Verhaeltnissen entsteht kein Verweis: Das Angebot bekommt nur den
-- Zeitpunkt, der Vertrag nur den Tag des Angebots.
--
-- WER (ANN-289): nur der eigene Zugang der Person zur Behandlung. Eine
-- rechtliche Vertretung sieht das Angebot (Recht contract), schliesst aber
-- nicht ab - ihr Nachweis gilt fuer die Behandlung, nicht fuer einen neuen
-- Vertrag; das bleibt der Weg in der Praxis (ANN-173). Die Begleitung sieht
-- nichts.
--
-- WIDERRUF (ANN-288): Belehrung nach dem Muster der Anlage 1 zu Art. 246a
-- Par. 1 Abs. 2 EGBGB, Fassung im Nachweis. Beginnt das Paket innerhalb der
-- Widerrufsfrist, muss die Person ausdruecklich verlangen, dass vorher
-- begonnen wird (Par. 356 Abs. 4, 357a Abs. 2 BGB). Der Knopf heisst
-- "Zahlungspflichtig buchen" (Par. 312j Abs. 3 BGB). Die Bestaetigung steht
-- sofort und dauerhaft im Konto - der dauerhafte Datentraeger bis B13
-- (Par. 312f Abs. 2 BGB, wie ANN-272).
--
-- EINWILLIGUNG (ADR-021 Punkt 7, ANN-283): Angaben zur Gesundheit aus der
-- Behandlung werden nur mit der Einwilligung zu Gesundheitsangaben im
-- Training kopiert; die Kontaktdaten brauchen sie nicht.
--
-- PROTOKOLL (ADR-010 Fassung 3): Der Zugang zum Training steht als
-- platform_access.activated im Auditlog - eine vorhandene Aktion. Alles
-- andere weist das Datenmodell nach (Spalten des Nachweises).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fassung und Frist
-- -----------------------------------------------------------------------------
create function app.training_contract_wording_version()
returns text
language sql
immutable
set search_path = ''
as $$
  -- Muss deckungsgleich mit VERTRAGSFASSUNG in
  -- src/features/platform/vertragstexte.ts bleiben (ANN-288).
  select '2026-10'::text
$$;

revoke all on function app.training_contract_wording_version() from public, anon, authenticated;

create function app.training_withdrawal_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  -- Par. 355 Abs. 2 BGB: 14 Tage ab Vertragsschluss.
  select 14
$$;

revoke all on function app.training_withdrawal_days() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Der Vertragsnachweis
--
-- Haelt fest, was die Person gebucht hat, so wie sie es gesehen hat: Paket,
-- Preis, Zeitraum, Fassung der Belehrung, ob sie den fruehen Beginn verlangt
-- hat, was sie freigegeben und ob sie eingewilligt hat. Der Preis steht als
-- Wert, nicht nur als Verweis - auch wenn das Paket spaeter entfernt wird.
-- -----------------------------------------------------------------------------
create table public.training_contracts (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null,
  training_package_id      uuid references public.training_packages (id) on delete set null,
  package_label            text not null,
  package_months           smallint not null check (package_months between 1 and 24),
  price_cents              integer not null check (price_cents >= 0),
  currency                 text not null,
  tax_rate_permille        smallint not null,
  vat_included             boolean not null,
  starts_on                date not null,
  ends_on                  date not null,
  offered_on               date not null,
  wording_version          text not null check (wording_version ~ '^[0-9]{4}-[0-9]{2}$'),
  early_start_requested    boolean not null,
  contact_released         boolean not null,
  health_consent_granted   boolean not null,
  concluded_at             timestamptz not null default now(),
  concluded_on             date not null,
  withdrawal_ends_on       date not null,
  -- Der Zugang zum Training, der mit dem Vertrag entstand. Ohne FK: Der
  -- Zugang ist Nachweis mit eigener Frist (ADR-023 Punkt 5).
  platform_access_id       uuid not null,
  constraint training_contracts_relationship_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete cascade,
  constraint training_contracts_period check (ends_on >= starts_on),
  constraint training_contracts_withdrawal check (withdrawal_ends_on >= concluded_on)
);

comment on table public.training_contracts is
  'KND-003 (PROJECT_PRINCIPLES.md 4.10): Nachweis eines Trainingsvertrags, den die Person im eigenen Konto geschlossen hat - Paket und Preis wie gebucht, Fassung der Widerrufsbelehrung, frueher Beginn, Freigaben (ANN-288). Datenklasse: Trainingsverhaeltnis, faellt mit ihm. Kein Tabellenrecht und keine Policy.';
comment on column public.training_contracts.offered_on is
  'Tag des Angebots aus der Akte - als Wert, ohne Verweis auf die Akte (ADR-021 Punkt 3).';
comment on column public.training_contracts.early_start_requested is
  'Die Person hat verlangt, dass das Training vor dem Ende der Widerrufsfrist beginnt (Par. 356 Abs. 4, 357a Abs. 2 BGB; ANN-288).';

create index training_contracts_relationship_idx
  on public.training_contracts (organization_id, training_relationship_id, concluded_at desc);

revoke all on public.training_contracts from anon, authenticated;
alter table public.training_contracts enable row level security;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'training_contracts', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
  'Nachweis des im eigenen Konto geschlossenen Trainingsvertrags mit Widerrufsbelehrung (KND-003). Faellt mit dem Trainingsverhaeltnis (on delete cascade); das haelt der Lauf, solange seine Rechnungen es verlangen.',
  57
);

-- -----------------------------------------------------------------------------
-- 3. Warum ein Angebot heute nicht angenommen werden kann
--
--   has_training     die Person hat schon ein Trainingsverhaeltnis - das
--                    Paket legt dann die Praxis dort an
--   care_open        eine Behandlung derselben Person laeuft (ANN-278)
--   before_care_end  der Beginn liegt vor dem Abschluss (ANN-278)
--   price_changed    die Preisliste am Beginn fuehrt das Paket nicht mehr
--
-- Gelesen wird ueber die gemeinsame Identitaet, aber nur fuer die Person
-- selbst in ihrem eigenen Konto - sie erfaehrt nichts ueber andere (4.8).
-- -----------------------------------------------------------------------------
create function app.training_offer_blocker(p_offer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offer  public.training_offers%rowtype;
  v_person uuid;
  v_offen  boolean;
  v_abschluss date;
begin
  select * into v_offer from public.training_offers o where o.id = p_offer_id;
  select p.person_id into v_person from public.patients p where p.id = v_offer.patient_id;

  if exists (
    select 1 from public.training_relationships t
    where t.person_id = v_person and t.organization_id = v_offer.organization_id
  ) then
    return 'has_training';
  end if;

  select bool_or(p.care_concluded_on is null), max(p.care_concluded_on)
    into v_offen, v_abschluss
  from public.patients p
  where p.person_id = v_person and p.organization_id = v_offer.organization_id;
  if v_offen then
    return 'care_open';
  end if;
  if v_abschluss is not null and v_offer.starts_on < v_abschluss then
    return 'before_care_end';
  end if;

  if not exists (
    select 1 from public.service_catalog_items c
    where c.id = v_offer.catalog_item_id
      and c.catalog_version_id = app.active_service_catalog_version(v_offer.organization_id, v_offer.starts_on)
  ) then
    return 'price_changed';
  end if;
  return null;
end;
$$;

revoke all on function app.training_offer_blocker(uuid) from public, anon, authenticated;

comment on function app.training_offer_blocker(uuid) is
  'KND-003: warum ein Trainingsangebot heute nicht angenommen werden kann (has_training, care_open, before_care_end, price_changed) oder null. Nur fuer die Projektionen der Person selbst.';

-- -----------------------------------------------------------------------------
-- 4. Das offene Angebot im eigenen Konto
--
-- Feste Feldliste (ADR-023 Punkt 22). Recht contract: die Person und eine
-- rechtliche Vertretung mit Vermoegenssorge sehen es; annehmen kann nur der
-- eigene Zugang (can_accept, ANN-289). Die Kontaktdaten stehen dabei, wenn
-- die Praxis sie zur Uebernahme anbietet - die Person sieht, was kopiert
-- wuerde.
-- -----------------------------------------------------------------------------
create function public.platform_training_offer(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_offer  public.training_offers%rowtype;
  v_heute  date;
  v_grund  text;
begin
  if not app.platform_access_allows(p_access_id, 'contract') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'treatment' then
    return null;
  end if;
  v_heute := app.training_today(v_zugang.organization_id);

  select * into v_offer
  from public.training_offers o
  where o.patient_id = v_zugang.relationship_id
    and o.organization_id = v_zugang.organization_id
    and app.training_offer_state(o, v_heute) = 'open'
  order by o.created_at desc
  limit 1;
  if not found then
    return null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'training_offer')
  );

  v_grund := app.training_offer_blocker(v_offer.id);

  return (
    select jsonb_build_object(
      'id', v_offer.id,
      'label', c.label,
      'package_months', c.package_months,
      'price_cents', c.unit_price_cents,
      'currency', c.currency,
      'tax_rate_permille', c.tax_rate_permille,
      'vat_included', not coalesce(b.small_business, false),
      'starts_on', v_offer.starts_on,
      'ends_on', app.training_package_ends_on(v_offer.starts_on, c.package_months),
      'valid_until', v_offer.valid_until,
      'offered_on', (v_offer.created_at at time zone o.time_zone)::date,
      'handover_items', v_offer.handover_items,
      'contact', case when v_offer.offers_contact then (
        select jsonb_build_object(
                 'date_of_birth', d.date_of_birth,
                 'street', d.street,
                 'house_number', d.house_number,
                 'postal_code', d.postal_code,
                 'city', d.city,
                 'phone', coalesce(d.phone_mobile, d.phone),
                 'email', d.email
               )
        from public.patient_contact_details d
        where d.patient_id = v_offer.patient_id
      ) end,
      'early_start', v_offer.starts_on <= v_heute + app.training_withdrawal_days(),
      'withdrawal_days', app.training_withdrawal_days(),
      'wording_version', app.training_contract_wording_version(),
      'blocker', v_grund,
      'can_accept', v_zugang.access_kind = 'self' and v_grund is null,
      'practice', jsonb_build_object(
        'name', coalesce(b.legal_name, o.name),
        'street', b.street,
        'house_number', b.house_number,
        'postal_code', b.postal_code,
        'city', b.city,
        'phone', b.phone,
        'email', b.email
      )
    )
    from public.service_catalog_items c
    join public.organizations o on o.id = v_offer.organization_id
    left join public.practice_billing_profiles b on b.organization_id = v_offer.organization_id
    where c.id = v_offer.catalog_item_id
  );
end;
$$;

revoke all on function public.platform_training_offer(uuid) from public, anon;
grant execute on function public.platform_training_offer(uuid) to authenticated;

comment on function public.platform_training_offer(uuid) is
  'KND-003: Plattformprojektion "Angebot der Praxis" - das offene Trainingsangebot der Akte hinter dem Zugang mit Paket, Preis, Zeitraum, Uebergabeangaben, angebotenen Kontaktdaten, Praxisanschrift fuer die Belehrung und warum es (noch) nicht angenommen werden kann. Recht contract; annehmen nur der eigene Zugang (ANN-289). Vertretung protokolliert.';

-- -----------------------------------------------------------------------------
-- 5. Annehmen
-- -----------------------------------------------------------------------------
create function public.accept_platform_training_offer(
  p_access_id       uuid,
  p_offer_id        uuid,
  p_release_items   integer[],
  p_release_contact boolean,
  p_health_consent  boolean,
  p_early_start     boolean,
  p_wording_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_zugang  public.platform_accesses%rowtype;
  v_offer   public.training_offers%rowtype;
  v_person  uuid;
  v_zone    text;
  v_heute   date;
  v_grund   text;
  v_item    public.service_catalog_items%rowtype;
  v_mwst    boolean;
  v_ende    date;
  v_frueh   boolean;
  v_rel     uuid;
  v_neu     uuid;
  v_paket   uuid;
  v_vertrag uuid;
  v_kontakt public.patient_contact_details%rowtype;
  v_anzahl  integer;
begin
  -- ANN-289: nur der eigene Zugang der Person zu ihrer Behandlung.
  if not app.platform_access_allows(p_access_id, 'contract') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'treatment' or v_zugang.access_kind <> 'self' then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  if p_release_contact is null or p_health_consent is null or p_early_start is null then
    raise exception 'all choices required' using errcode = '22023';
  end if;
  if p_wording_version is distinct from app.training_contract_wording_version() then
    raise exception 'wording outdated' using errcode = '22023';
  end if;

  -- Erst die Akte sperren, dann das Angebot: dieselbe Reihenfolge wie das
  -- Zurueckziehen in der Praxis (KND-002).
  select p.person_id into v_person
  from public.patients p
  where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id
  for update;

  select * into v_offer
  from public.training_offers o
  where o.id = p_offer_id
    and o.patient_id = v_zugang.relationship_id
    and o.organization_id = v_zugang.organization_id
  for update;
  if not found then
    raise exception 'training offer not found' using errcode = '42501';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_offer.organization_id;
  v_heute := app.training_today(v_offer.organization_id);

  if app.training_offer_state(v_offer, v_heute) <> 'open' then
    raise exception 'training offer is not open' using errcode = '23514';
  end if;

  -- Die Person kann nur freigeben, was angeboten ist.
  v_anzahl := jsonb_array_length(v_offer.handover_items);
  if exists (
    select 1 from unnest(coalesce(p_release_items, '{}'::integer[])) i
    where i is null or i < 1 or i > v_anzahl
  ) or cardinality(coalesce(p_release_items, '{}'::integer[]))
       <> (select count(distinct i) from unnest(coalesce(p_release_items, '{}'::integer[])) i) then
    raise exception 'release items invalid' using errcode = '22023';
  end if;
  if p_release_contact and not v_offer.offers_contact then
    raise exception 'contact data not offered' using errcode = '22023';
  end if;
  -- ADR-021 Punkt 7: Angaben zur Gesundheit nur mit Einwilligung.
  if cardinality(coalesce(p_release_items, '{}'::integer[])) > 0 and not p_health_consent then
    raise exception 'health consent required for handover items' using errcode = '22023';
  end if;

  v_grund := app.training_offer_blocker(v_offer.id);
  if v_grund is not null then
    raise exception 'training offer cannot be accepted: %', v_grund using errcode = '23514';
  end if;

  select * into v_item from public.service_catalog_items c where c.id = v_offer.catalog_item_id;
  v_ende := app.training_package_ends_on(v_offer.starts_on, v_item.package_months);
  v_frueh := v_offer.starts_on <= v_heute + app.training_withdrawal_days();
  -- ANN-288: Beginnt das Training in der Widerrufsfrist, nur auf
  -- ausdrueckliches Verlangen.
  if v_frueh and not p_early_start then
    raise exception 'early start must be requested' using errcode = '22023';
  end if;
  v_mwst := not coalesce((
    select b.small_business from public.practice_billing_profiles b
    where b.organization_id = v_offer.organization_id
  ), false);

  -- Das Trainingsverhaeltnis: Vertragsbeginn heute, der Tag des Abschlusses.
  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (v_offer.organization_id, v_person, 'active', v_heute, v_actor)
  returning id into v_rel;

  -- Kontaktdaten nur, wenn freigegeben - als Kopie (ANN-283).
  if p_release_contact then
    select * into v_kontakt from public.patient_contact_details d
    where d.patient_id = v_offer.patient_id;
    perform app.write_training_contact(
      v_rel, v_offer.organization_id, v_actor, v_kontakt.date_of_birth, v_kontakt.email,
      coalesce(v_kontakt.phone_mobile, v_kontakt.phone), v_kontakt.street,
      v_kontakt.house_number, v_kontakt.postal_code, v_kontakt.city
    );
  end if;

  -- Der eigene Zugang zum Training, am selben Konto (ADR-023 Punkt 4). Den
  -- Einstieg braucht er nicht: Die Einwilligung hat die Person gerade
  -- entschieden.
  insert into public.platform_accesses (
    organization_id, relationship_kind, relationship_id, training_relationship_id,
    access_kind, account_user_id, status, created_by, activated_at, onboarding_finished_at
  )
  values (
    v_offer.organization_id, 'training', v_rel, v_rel, 'self', v_actor, 'active', v_actor,
    now(), now()
  )
  returning id into v_neu;

  perform app.log_platform_access_event(
    v_offer.organization_id, v_actor, 'platform', 'platform_access.activated', v_neu,
    jsonb_build_object('surface', 'platform', 'via', 'training_contract')
  );

  if p_health_consent then
    insert into public.training_consent_records (
      organization_id, training_relationship_id, record_kind, purpose, occurred_on,
      recorded_by, source, platform_access_id, platform_access_kind, wording_version
    )
    values (
      v_offer.organization_id, v_rel, 'consent_granted', 'training_health_data', v_heute,
      v_actor, 'platform', v_neu, 'self', app.platform_consent_wording_version()
    );
  end if;

  -- Das Paket mit seiner einen Leistung, wie create_training_package
  -- (ANN-276, ANN-277, ANN-278).
  v_grund := app.training_package_start_blocker(v_rel, v_offer.starts_on);
  if v_grund is not null then
    raise exception 'training package cannot start: %', v_grund using errcode = '23514';
  end if;
  insert into public.training_packages (
    organization_id, training_relationship_id, catalog_item_id, starts_on, ends_on, created_by
  )
  values (v_offer.organization_id, v_rel, v_offer.catalog_item_id, v_offer.starts_on, v_ende, v_actor)
  returning id into v_paket;

  insert into public.billable_services (
    organization_id, training_relationship_id, appointment_id, training_package_id,
    catalog_item_id, quantity, performed_on, created_by
  )
  values (
    v_offer.organization_id, v_rel, null, v_paket, v_offer.catalog_item_id, 1,
    v_offer.starts_on, v_actor
  );

  -- Die freigegebenen Angaben als Kopie (ADR-021 Punkt 7, KND-005).
  insert into public.training_takeovers (
    organization_id, training_relationship_id, position, title, body, offered_on,
    released_platform_access_id
  )
  select v_offer.organization_id, v_rel, e.n::smallint, e.wert ->> 'title', e.wert ->> 'body',
         (v_offer.created_at at time zone v_zone)::date, v_neu
  from jsonb_array_elements(v_offer.handover_items) with ordinality as e(wert, n)
  where e.n = any (coalesce(p_release_items, '{}'::integer[]));

  insert into public.training_contracts (
    organization_id, training_relationship_id, training_package_id, package_label,
    package_months, price_cents, currency, tax_rate_permille, vat_included, starts_on, ends_on,
    offered_on, wording_version, early_start_requested, contact_released,
    health_consent_granted, concluded_on, withdrawal_ends_on, platform_access_id
  )
  values (
    v_offer.organization_id, v_rel, v_paket, v_item.label, v_item.package_months,
    v_item.unit_price_cents, v_item.currency, v_item.tax_rate_permille, v_mwst,
    v_offer.starts_on, v_ende, (v_offer.created_at at time zone v_zone)::date,
    p_wording_version, v_frueh and p_early_start, p_release_contact, p_health_consent,
    v_heute, v_heute + app.training_withdrawal_days(), v_neu
  )
  returning id into v_vertrag;

  -- ANN-285: Die Akte erfaehrt nur, dass und wann.
  update public.training_offers set accepted_at = now() where id = v_offer.id;

  return (
    select jsonb_build_object(
      'contract_id', k.id,
      'training_access_id', v_neu,
      'concluded_at', k.concluded_at,
      'label', k.package_label,
      'package_months', k.package_months,
      'price_cents', k.price_cents,
      'currency', k.currency,
      'starts_on', k.starts_on,
      'ends_on', k.ends_on,
      'withdrawal_ends_on', k.withdrawal_ends_on,
      'early_start_requested', k.early_start_requested,
      'contact_released', k.contact_released,
      'health_consent_granted', k.health_consent_granted,
      'released_titles', coalesce((
        select jsonb_agg(t.title order by t.position)
        from public.training_takeovers t where t.training_relationship_id = v_rel
      ), '[]'::jsonb)
    )
    from public.training_contracts k where k.id = v_vertrag
  );
exception
  when unique_violation then
    -- Zwei gleichzeitige Annahmen derselben Person: Eine gewinnt.
    raise exception 'training offer cannot be accepted: has_training' using errcode = '23514';
end;
$$;

revoke all on function public.accept_platform_training_offer(uuid, uuid, integer[], boolean, boolean, boolean, text) from public, anon;
grant execute on function public.accept_platform_training_offer(uuid, uuid, integer[], boolean, boolean, boolean, text) to authenticated;

comment on function public.accept_platform_training_offer(uuid, uuid, integer[], boolean, boolean, boolean, text) is
  'KND-003: das Trainingsangebot im eigenen Konto annehmen (nur der eigene Zugang zur Behandlung, ANN-289). Legt in einem Aufruf Trainingsverhaeltnis, freigegebene Kontaktdaten, eigenen Zugang zum Training, Einwilligung, Paket mit Leistung, Kopien der freigegebenen Angaben (nur mit Einwilligung) und den Vertragsnachweis an (ADR-021 Punkt 7, ANN-288). Liefert die Bestaetigung.';

-- -----------------------------------------------------------------------------
-- 6. Der eigene Vertrag mit der Bestaetigung
--
-- Recht billing wie das eigene Paket (ANG-008). Die Bestaetigung ist der
-- dauerhafte Datentraeger bis B13: jederzeit unter "Ich" abrufbar und zum
-- Drucken oder Speichern.
-- -----------------------------------------------------------------------------
create function public.platform_training_contract(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
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

revoke all on function public.platform_training_contract(uuid) from public, anon;
grant execute on function public.platform_training_contract(uuid) to authenticated;

comment on function public.platform_training_contract(uuid) is
  'KND-003: Plattformprojektion "Mein Trainingsvertrag" - der im Konto geschlossene Vertrag mit Paket, Preis, Zeitraum, Widerrufsfrist und Freigaben (Bestaetigung in Textform bis B13). Recht billing; Vertretung protokolliert.';

-- -----------------------------------------------------------------------------
-- 7. Der Export nimmt den eigenen Vertrag mit
--
-- Aus 20261015130000_ang_008_platform_training_package.sql; neu ist nur der
-- letzte Schluessel.
-- -----------------------------------------------------------------------------
create or replace function public.platform_export(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_person  jsonb;
  v_ergebnis jsonb;
begin
  if not app.platform_access_allows(p_access_id, 'export') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  -- Die Stammdaten, die die Person der Praxis gegeben hat. Keine
  -- Einrichtung, keine Koordinaten (abgeleitet, nicht von ihr).
  if v_zugang.relationship_kind = 'treatment' then
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'phone_mobile', c.phone_mobile,
             'phone_work', c.phone_work,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details c on c.patient_id = p.id
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id;
  else
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details c on c.training_relationship_id = t.id
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id;
  end if;

  v_ergebnis := jsonb_build_object(
    'format', 'plattform-export',
    'format_version', 1,
    'exported_at', now(),
    'organization', (select o.name from public.organizations o where o.id = v_zugang.organization_id),
    'relationship', v_zugang.relationship_kind,
    'exported_by', v_zugang.access_kind,
    'person', coalesce(v_person, '{}'::jsonb),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                     from public.platform_appointments(p_access_id) x),
    'appointment_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                             from public.platform_appointment_requests(p_access_id) x),
    'questionnaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                       from public.platform_questionnaire(p_access_id) x),
    -- Rechnungen nur mit dem Recht billing - die Projektion prueft selbst.
    'invoices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                 from public.platform_invoices(p_access_id) x),
    -- Nur die Liste; jedes Dokument holt die Person einzeln (protokolliert).
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                  from public.platform_files(p_access_id) x),
    'consents', (select coalesce(jsonb_agg(to_jsonb(x) - 'can_grant'), '[]'::jsonb)
                 from public.platform_consents(p_access_id) x),
    -- ANG-008: die eigenen Trainingspakete, wie die Plattform sie zeigt
    -- (Recht billing; ohne Recht oder in der Behandlung leer).
    'training_packages', coalesce(public.platform_training_packages(p_access_id), '[]'::jsonb),
    -- KND-003: der im Konto geschlossene Trainingsvertrag (Recht billing;
    -- ohne Recht, in der Behandlung oder ohne Vertrag null).
    'training_contract', public.platform_training_contract(p_access_id)
  );

  -- ANN-265: ein Eintrag je Export, wie die Auskunft in der Praxis.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_zugang.organization_id, auth.uid(),
    case when v_zugang.access_kind = 'self' then 'platform' else 'representative' end,
    'patient_record.exported',
    case v_zugang.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'success',
    jsonb_build_object('surface', 'platform', 'purpose', 'platform_export',
                       'platform_access_id', v_zugang.id, 'access_kind', v_zugang.access_kind)
  );

  return v_ergebnis;
end;
$$;
