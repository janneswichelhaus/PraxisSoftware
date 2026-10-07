-- =============================================================================
-- ANG-008 (ANG-EPIC-002): Preise sichtbar, bevor jemand fragt - und das
-- eigene Paket in der Plattform
--
-- IDEA-ANG-004: "Wenn die Weiterbetreuung im Portal angeboten wird, steht der
-- Preis dort - vollstaendig, mit Laufzeit, Umfang und Kuendigungsbedingungen,
-- ohne Beratungsgespraech als Zwischenschritt." PROJECT_PRINCIPLES.md 4.10:
-- Die Plattform ist im Paketpreis enthalten.
--
--   public.platform_training_offers    die Pakete der heute geltenden
--                                      Preisliste (Recht read)
--   public.platform_training_packages  die eigenen Pakete (Recht billing)
--   public.platform_export             + die eigenen Pakete
--
-- WER (ANN-281): Zugaenge zu einem Trainingsverhaeltnis. Die Angebote sind
-- keine Daten der Person, aber die Plattform zeigt nichts ohne lesbaren
-- Zugang (ADR-023 Punkt 19); eine Behandlung sieht keine Trainingspreise
-- (4.8). Das eigene Paket ist ein Vertrag ueber Geld: Recht `billing` wie
-- Rechnungen und Abo (ANN-273).
--
-- Abgeschlossen wird in der Praxis (ANN-281). Der Abschluss ueber die
-- Plattform mit Widerrufsbelehrung kommt mit KND-EPIC-001.
--
-- PROTOKOLL (ADR-023 Punkt 24, W5): Das Lesen durch die Person selbst nicht,
-- jedes Lesen ueber eine Vertretung schon (app.log_platform_representation).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Angebote
--
-- Feste Feldliste (ADR-023 Punkt 22): Bezeichnung mit Umfang, Laufzeit,
-- Gesamtpreis und Steuersatz. `vat_included` sagt, ob der Preis Umsatzsteuer
-- enthaelt - unter der Kleinunternehmerregelung nicht (Par. 19 UStG); die
-- Seite nennt es, wie die Preisangabenverordnung den Gesamtpreis verlangt.
-- -----------------------------------------------------------------------------
create function public.platform_training_offers(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_heute  date;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'training' then
    return null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'training_offers')
  );

  v_heute := app.training_today(v_zugang.organization_id);

  return jsonb_build_object(
    'vat_included', not coalesce((
      select b.small_business from public.practice_billing_profiles b
      where b.organization_id = v_zugang.organization_id
    ), false),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', c.code,
               'label', c.label,
               'package_months', c.package_months,
               'price_cents', c.unit_price_cents,
               'currency', c.currency,
               'tax_rate_permille', c.tax_rate_permille
             ) order by c.sort_order)
      from public.service_catalog_items c
      where c.catalog_version_id = app.active_service_catalog_version(v_zugang.organization_id, v_heute)
        and c.item_kind = 'training_package'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_training_offers(uuid) from public, anon;
grant execute on function public.platform_training_offers(uuid) to authenticated;

comment on function public.platform_training_offers(uuid) is
  'ANG-008 (IDEA-ANG-004, ANN-281): Plattformprojektion "Angebote" - die Trainingspakete der heute geltenden Preisliste mit Laufzeit, Gesamtpreis und Steuersatz. Nur Zugaenge zum Training mit Recht read; Vertretung protokolliert.';

-- -----------------------------------------------------------------------------
-- 2. Die eigenen Pakete
-- -----------------------------------------------------------------------------
create function public.platform_training_packages(p_access_id uuid)
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

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'training_packages')
  );

  v_heute := app.training_today(v_zugang.organization_id);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'label', c.label,
             'package_months', c.package_months,
             'price_cents', c.unit_price_cents,
             'currency', c.currency,
             'starts_on', k.starts_on,
             'ends_on', k.ends_on,
             'state', case
               when v_heute < k.starts_on then 'planned'
               when v_heute <= k.ends_on then 'running'
               else 'ended'
             end
           ) order by k.starts_on desc)
    from public.training_packages k
    join public.service_catalog_items c on c.id = k.catalog_item_id
    where k.training_relationship_id = v_zugang.relationship_id
      and k.organization_id = v_zugang.organization_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.platform_training_packages(uuid) from public, anon;
grant execute on function public.platform_training_packages(uuid) to authenticated;

comment on function public.platform_training_packages(uuid) is
  'ANG-008: Plattformprojektion "Mein Paket" - die Trainingspakete des Verhaeltnisses hinter dem Zugang mit Zeitraum, Preis und Stand. Recht billing; Vertretung protokolliert.';

-- -----------------------------------------------------------------------------
-- 3. Der Export nimmt die eigenen Pakete mit
--
-- Aus 20261013120000_por_018_platform_export.sql; neu ist nur der letzte
-- Schluessel. Der Export setzt die Projektionen zusammen (POR-018).
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
    'training_packages', coalesce(public.platform_training_packages(p_access_id), '[]'::jsonb)
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
