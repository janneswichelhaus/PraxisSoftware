-- =============================================================================
-- ANG-005 (ANG-EPIC-002): Das Trainingspaket in der Preisliste
--
-- PROJECT_PRINCIPLES.md 4.10 und 19, ADR-009 Punkt 21: Training wird als
-- Paket verkauft. Ein Paket gilt fuer einen festen Zeitraum, ist nicht
-- pausierbar und wird als EINE Leistung des Bereichs `training` berechnet.
-- Sein Preis steht in der Preisliste, versioniert wie jeder andere (Punkt 5):
-- Ein laufendes Paket behaelt den Preis, mit dem es begann.
--
--   service_catalog_items.item_kind       + 'training_package'
--   service_catalog_items.package_months  Laufzeit in Monaten (ANN-275)
--   app.training_package_tax_allowed      das Steuerkennzeichen (ANN-275)
--   write_service_catalog_items           + package_months
--   create_service_catalog_version        die Kopie nimmt die Laufzeit mit
--
-- DER UMFANG (ANN-275) steht in der Bezeichnung ("3 Monate Personal Training,
-- eine Einheit je Woche, Plattform inklusive"). Ein Kontingent mit Zaehlung
-- gibt es bewusst nicht: Jannes hat den Umfang noch nicht festgelegt (BEF-114),
-- und eine Zaehlung ohne Regel waere ein Feature auf Vorrat (ADR-014). Die
-- Abgeltung der Termine im Zeitraum regelt ANG-007 an einer Stelle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Das Steuerkennzeichen (ANN-275)
--
-- Training ist keine Heilbehandlung (ADR-021) und damit steuerpflichtig zum
-- Regelsatz (ADR-009 Punkt 15). Ob ein vorausbezahltes Paket anders
-- einzuordnen ist, klaert die Steuerberatung (B4); bis dahin gilt hier der
-- Regelsatz - die eine Stelle fuer die Annahme.
-- -----------------------------------------------------------------------------
create function app.training_package_tax_allowed(p_tax_treatment text, p_tax_rate_permille smallint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tax_treatment = 'taxable' and p_tax_rate_permille = 190
$$;

revoke all on function app.training_package_tax_allowed(text, smallint) from public, anon, authenticated;

comment on function app.training_package_tax_allowed(text, smallint) is
  'ANG-005 (ANN-275): das Steuerkennzeichen, das ein Trainingspaket tragen darf - bis zur Antwort der Steuerberatung (B4) steuerpflichtig zum Regelsatz. Die eine Stelle fuer die Annahme.';

-- -----------------------------------------------------------------------------
-- 2. Positionsart und Laufzeit
-- -----------------------------------------------------------------------------
alter table public.service_catalog_items
  add column package_months smallint
    check (package_months is null or package_months between 1 and 24);

comment on column public.service_catalog_items.package_months is
  'ANG-005 (ANN-275): Laufzeit eines Trainingspakets in Monaten, gerechnet nach Paragraf 188 BGB vom Beginn aus. Nur an der Art training_package gesetzt, dort Pflicht.';

alter table public.service_catalog_items
  drop constraint service_catalog_items_item_kind_check;
alter table public.service_catalog_items
  add constraint service_catalog_items_item_kind_check
    check (item_kind in ('treatment', 'absence_fee', 'aftercare_month', 'training_package'));

alter table public.service_catalog_items
  add constraint service_catalog_items_training_package check (
    (item_kind = 'training_package') = (package_months is not null)
    and (
      item_kind <> 'training_package'
      or (service_area = 'training'
          and remedy is null
          and app.training_package_tax_allowed(tax_treatment, tax_rate_permille))
    )
  );

comment on constraint service_catalog_items_training_package on public.service_catalog_items is
  'ANG-005: Ein Trainingspaket ist eine Leistung des Bereichs training (ADR-009 Punkt 21), ohne Heilmittel, mit Laufzeit und mit dem Steuerkennzeichen aus app.training_package_tax_allowed (ANN-275). Eine Laufzeit traegt nur das Paket.';

-- -----------------------------------------------------------------------------
-- 3. Schreiben und Kopieren der Preisliste
--
-- Aus 20261006110100_log_001b_schreibpfade.sql bzw.
-- 20261007100000_abr_030_session_fee_tariff.sql; neu ist nur die Laufzeit.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_service_catalog_items(p_version_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  delete from public.service_catalog_items where catalog_version_id = p_version_id;

  insert into public.service_catalog_items (
    organization_id, catalog_version_id, sort_order, code, label,
    item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille,
    service_area, package_months, created_by
  )
  select
    v_org,
    p_version_id,
    (zeile.ordinalitaet)::smallint,
    btrim(zeile.eintrag ->> 'code'),
    btrim(zeile.eintrag ->> 'label'),
    coalesce(zeile.eintrag ->> 'item_kind', 'treatment'),
    nullif(btrim(coalesce(zeile.eintrag ->> 'remedy', '')), ''),
    (zeile.eintrag ->> 'unit_price_cents')::integer,
    'EUR',
    coalesce(zeile.eintrag ->> 'tax_treatment', 'exempt_healthcare'),
    coalesce((zeile.eintrag ->> 'tax_rate_permille')::smallint, 0::smallint),
    coalesce(zeile.eintrag ->> 'service_area', 'therapy'),
    -- ANG-005: die Laufzeit eines Trainingspakets; sonst leer.
    (zeile.eintrag ->> 'package_months')::smallint,
    v_actor
  from jsonb_array_elements(p_items) with ordinality as zeile(eintrag, ordinalitaet);

  select count(*) into v_anzahl
  from public.service_catalog_items where catalog_version_id = p_version_id;


  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_service_catalog_version(p_label text, p_valid_from date, p_copy_from uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_label text;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_label := nullif(btrim(p_label), '');
  if v_label is null then
    raise exception 'label is required' using errcode = '22023';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  insert into public.service_catalog_versions (organization_id, label, valid_from, created_by)
  values (v_org, v_label, p_valid_from, v_actor)
  returning id into v_id;

  -- ABR-030: Die Kopie nimmt den Tarif des Terminhonorars mit.
  if p_copy_from is not null then
    update public.service_catalog_versions n
       set session_fee_cents = q.session_fee_cents
      from public.service_catalog_versions q
     where n.id = v_id
       and q.id = p_copy_from
       and q.organization_id = v_org;
  end if;

  if p_copy_from is not null then
    insert into public.service_catalog_items (
      organization_id, catalog_version_id, sort_order, code, label,
      item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille,
      service_area, package_months, created_by
    )
    select v_org, v_id, q.sort_order, q.code, q.label,
           q.item_kind, q.remedy, q.unit_price_cents, q.currency,
           q.tax_treatment, q.tax_rate_permille, q.service_area,
           -- ANG-005: die Laufzeit des Trainingspakets geht mit.
           q.package_months, v_actor
    from public.service_catalog_items q
    join public.service_catalog_versions qv on qv.id = q.catalog_version_id
    where q.catalog_version_id = p_copy_from
      and qv.organization_id = v_org;

    -- Eine Vorlage, die es nicht gibt, ist ein Tippfehler und kein leerer
    -- Entwurf: Sonst entstuende stillschweigend eine Preisliste ohne Preise.
    if not exists (
      select 1 from public.service_catalog_items where catalog_version_id = v_id
    ) then
      raise exception 'copy source has no items' using errcode = '22023';
    end if;
  end if;


  return v_id;
end;
$function$;
