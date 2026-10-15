-- =============================================================================
-- Monatsabrechnung in einem Lauf (Bereichsueberholung 4, K13; ADR-009 Fassung 6)
--
-- 1. list_invoice_candidates nennt zu einer Verordnung, ob und wann sie zur
--    Abrechnung freigegeben ist (`basis_released_at`, ADR-009 Punkt 24,
--    ADR-020 Punkt 9). Der Lauf auf /abrechnung nimmt eine Verordnung erst mit
--    dieser Freigabe auf (ANN-544); welche Zeile in den Lauf kommt, entscheidet
--    die Oberflaeche an genau einer Stelle (`imLauf`). Ausgestellt wird weiter
--    nur ueber `issue_invoice` - jede Regel der Ausstellung bleibt am Server.
--    Neu ist allein die Spalte; die Abfrage ist sonst die aus
--    20261023100000_ux_008b_correction_path.sql.
--
-- 2. BEF-165: Der Hinweis nach Paragraf 19 UStG steht im Schnappschuss. Bisher
--    entschied `issuer.small_business` im Dokument, ob er erscheint, den
--    Wortlaut setzte der Client - eine neue Formulierung haette das Bild schon
--    ausgestellter Rechnungen geaendert. Jetzt schreibt app.build_invoice_document
--    den Text beim Ausstellen ins Dokument (`issuer.small_business_notice`, wie
--    `exemption_reason` an der Steuergruppe, ANN-082), `schema_version` 6.
--    Der Wortlaut ist der aus ANN-541; die eine Stelle dafuer ist
--    app.small_business_notice().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Abzurechnen: mit der Freigabe der Verordnung
-- -----------------------------------------------------------------------------
drop function public.list_invoice_candidates(integer);

CREATE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid, treatment_basis_id uuid, basis_kind text, basis_issued_on date, first_performed_on date, last_performed_on date, cancelled_invoice_id uuid, cancelled_invoice_number text, draft_replaces_invoice_number text, basis_released_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  -- Erst buendeln, dann den Entwurf dazusuchen (BEF-018). Der Bereich steht
  -- seit ABR-009 in beiden Schritten: Er ist der dritte Schluessel der
  -- Klammer und nicht eine Spalte, die nebenher mitlaeuft.
  return query
  select k.patient_id,
         k.training_relationship_id,
         k.patient_name,
         k.period_month,
         k.service_area,
         k.service_count,
         k.total_cents,
         k.currency,
         (entwurf.id is not null),
         entwurf.id,
         k.treatment_basis_id,
         tb.treatment_basis_kind,
         tb.issued_on,
         k.erste,
         k.letzte,
         -- UX-008b: die stornierte Rechnung, aus der die Leistungen stammen.
         storno.id,
         storno.invoice_number,
         -- Ist der stehende Entwurf selbst eine Korrektur, welche?
         ersetzt.invoice_number,
         -- K13 (ANN-544): in die Abrechnung gestellt am - erst dann nimmt der
         -- Monatslauf die Verordnung auf. Ohne Grundlage leer.
         tb.billing_released_at
  from (
    select b.patient_id,
           b.training_relationship_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           -- ABR-032: Mit Grundlage ist sie die Klammer und der Monat nennt
           -- nur den Beginn; ohne Grundlage ist es der Kalendermonat der
           -- Gruppe - in beiden Faellen der Monat der ersten Leistung.
           date_trunc('month', min(b.performed_on))::date as period_month,
           a.treatment_basis_id,
           min(b.performed_on) as erste,
           max(b.performed_on) as letzte,
           b.service_area,
           count(*)::integer as service_count,
           -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
           sum(app.billable_service_amount(b.id))::integer as total_cents,
           max(c.currency) as currency,
           -- UX-008b: Welche Leistungen die Gruppe traegt - fuer die Frage,
           -- ob sie aus einer stornierten Rechnung stammen.
           array_agg(b.id) as leistungen
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und buendelt nach dem Monat.
    left join public.appointments a on a.id = b.appointment_id
    left join public.patients p on p.id = b.patient_id
    left join public.training_relationships t on t.id = b.training_relationship_id
    join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
    where b.organization_id = v_org
      and b.status = 'billable'
      -- Seit ABR-003c zaehlt nur eine Zeile, die nicht freigegeben ist: Nach
      -- einem Storno ist die Leistung wieder abzurechnen.
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, b.training_relationship_id, a.treatment_basis_id,
             case when a.treatment_basis_id is null
                  then date_trunc('month', b.performed_on)::date end,
             b.service_area
  ) k
  left join public.treatment_bases tb on tb.id = k.treatment_basis_id
  left join lateral (
    select i.id
    from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from k.patient_id
      and i.training_relationship_id is not distinct from k.training_relationship_id
      and i.service_area = k.service_area
      and i.status = 'draft'
      and i.treatment_basis_id is not distinct from k.treatment_basis_id
      and (k.treatment_basis_id is not null or i.period_month = k.period_month)
    limit 1
  ) entwurf on true
  -- UX-008b (BEF-062): Stammen Leistungen der Gruppe aus einer stornierten
  -- Rechnung derselben Klammer, die noch keine Korrektur hat, fuehrt nur
  -- deren Korrekturrechnung weiter - bei zweien die zuletzt ausgestellte.
  left join lateral (
    select s.id, s.invoice_number
    from unnest(k.leistungen) l(id)
    join public.invoices s on s.id = app.open_cancellation_holding_service(
      l.id, k.patient_id, k.training_relationship_id, k.service_area,
      k.treatment_basis_id, k.period_month)
    order by s.issued_at desc
    limit 1
  ) storno on true
  left join public.invoices entwurf_zeile on entwurf_zeile.id = entwurf.id
  left join public.invoices ersetzt on ersetzt.id = entwurf_zeile.replaces_invoice_id
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

comment on function public.list_invoice_candidates(integer) is
  'Was abzurechnen ist (ABR-003, ABR-032): je Person und Behandlungsgrundlage, ohne Grundlage je Person, Monat und Bereich, mit Anzahl, Betrag, Zeitraum und einem schon stehenden Entwurf. Seit UX-008b mit der stornierten Rechnung derselben Klammer, aus der Leistungen stammen und die noch keine Korrektur hat, und der Nummer, die ein stehender Korrekturentwurf ersetzt (BEF-062, ANN-321). Seit K13 mit dem Zeitpunkt der Freigabe der Verordnung zur Abrechnung (basis_released_at, ANN-544). owner und office.';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. BEF-165: der Hinweis nach Paragraf 19 UStG im Schnappschuss
-- -----------------------------------------------------------------------------

-- Die eine Stelle fuer den Wortlaut (ANN-541): Seit 2025 sind die Umsaetze
-- eines Kleinunternehmers steuerfrei, und Paragraf 34a Satz 1 Nr. 5 UStDV
-- verlangt die Angabe, dass die Steuerbefreiung nach Paragraf 19 Abs. 1 UStG
-- gilt. Eine neue Formulierung gilt fuer kuenftige Rechnungen; ausgestellte
-- behalten ihren Text im Dokument.
create function app.small_business_notice()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Steuerbefreiung für Kleinunternehmer gemäß § 19 Abs. 1 UStG – es wird keine Umsatzsteuer berechnet.'::text
$$;

comment on function app.small_business_notice() is
  'BEF-165, ANN-541: Wortlaut des Hinweises nach Par. 19 Abs. 1 UStG, den app.build_invoice_document beim Ausstellen in den Schnappschuss schreibt (issuer.small_business_notice). Fester Text wie app.tax_exemption_reason (ANN-082).';

revoke all on function app.small_business_notice() from public, anon, authenticated;

-- Juengste Fassung aus 20261014110000_ang_002_aftercare_months.sql; neu sind
-- nur `schema_version` 6 und `issuer.small_business_notice`.
CREATE OR REPLACE FUNCTION app.build_invoice_document(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invoice   record;
  v_profile   record;
  v_items     jsonb;
  v_gruppen   jsonb;
  v_basen     jsonb;
  v_empfaenger jsonb;
  v_patient   jsonb;
  v_summe     integer;
  v_steuer    integer;
  v_waehrung  text;
  v_anzahl    integer;
begin
  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select b.* into v_profile
  from public.practice_billing_profiles b
  where b.organization_id = v_invoice.organization_id;

  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Die Zeilen. Preis, Bezeichnung und Steuerkennzeichen kommen aus der
  -- Katalogposition - sie ist unveraenderlich, solange ihre Preisliste in
  -- Kraft ist (ABR-001).
  select jsonb_agg(z.zeile order by z.sort_order),
         sum(z.brutto)::integer,
         count(*)::integer,
         max(z.currency)
    into v_items, v_summe, v_anzahl, v_waehrung
  from (
    select it.sort_order,
           c.currency,
           -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
           app.billable_service_amount(b.id) as brutto,
           jsonb_build_object(
             'performed_on',      b.performed_on,
             'code',              c.code,
             'label',             c.label,
             'item_kind',         c.item_kind,
             'quantity',          b.quantity,
             'unit_price_cents',  app.billable_service_amount(b.id) / b.quantity,
             'line_total_cents',  app.billable_service_amount(b.id),
             'currency',          c.currency,
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             -- ABR-032 (schema_version 5): Anteil am Terminhonorar? Die
             -- Darstellung fasst gleiche Positionen mit ihren Tagen zusammen.
             'session_fee',       exists (
                                    select 1 from public.appointment_session_fees f
                                    where f.appointment_id = b.appointment_id
                                  ) and c.remedy is not null,
             -- ANG-002: Ein Abo-Monat nennt seinen Zeitraum, nicht nur den
             -- ersten Tag (Par. 14 Abs. 4 Nr. 6 UStG). Sonst null.
             'period_until',      app.billable_service_period_until(b.id)
           ) as zeile
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
  ) z;

  if v_anzahl is null or v_anzahl = 0 then
    raise exception 'invoice has no items' using errcode = '22023';
  end if;

  if (select count(distinct c.currency)
        from public.invoice_items it
        join public.billable_services b     on b.id = it.billable_service_id
        join public.service_catalog_items c on c.id = b.catalog_item_id
       where it.invoice_id = p_invoice_id) > 1 then
    raise exception 'an invoice cannot mix currencies' using errcode = '22023';
  end if;

  -- Steuergruppen: je Kennzeichen und Satz der Bruttobetrag, die darin
  -- enthaltene Steuer und der Nettobetrag. Unter der Kleinunternehmerregelung
  -- ist die enthaltene Steuer null - auch bei einer steuerpflichtigen
  -- Position (Par. 19 UStG). Der Grund der Befreiung steht an der Gruppe
  -- (ABR-006, ANN-082).
  select jsonb_agg(g.gruppe order by g.tax_treatment, g.tax_rate_permille),
         sum(g.steuer)::integer
    into v_gruppen, v_steuer
  from (
    select c.tax_treatment,
           c.tax_rate_permille,
           sum(app.billable_service_amount(b.id))::integer as brutto,
           case
             when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
             else round(sum(app.billable_service_amount(b.id))::numeric
                        * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
           end as steuer,
           jsonb_build_object(
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             'gross_cents',       sum(app.billable_service_amount(b.id))::integer,
             'tax_cents',
               case
                 when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                 else round(sum(app.billable_service_amount(b.id))::numeric
                            * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
               end,
             'net_cents',
               sum(app.billable_service_amount(b.id))::integer
               - case
                   when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                   else round(sum(app.billable_service_amount(b.id))::numeric
                              * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
                 end,
             'exemption_reason', app.tax_exemption_reason(c.tax_treatment)
           ) as gruppe
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
    group by c.tax_treatment, c.tax_rate_permille
  ) g;

  -- Verordnungsbezug: Bauart, Ausstellungsdatum, Verordner:in - und seit
  -- schema_version 4 die Diagnose der Verordnung, ICD-10 und Text (ANN-229).
  -- Private Kassen und Beihilfe erwarten sie auf der Rechnung. Ob sie
  -- draufsteht, entscheidet allein app.invoice_shows_diagnosis(). Therapieziel
  -- und Verordnerhinweis bleiben weg (Datensparsamkeit), am Selbstzahler gibt
  -- es keine Diagnose.
  select jsonb_agg(v.eintrag order by v.issued_on)
    into v_basen
  from (
    select distinct tb.issued_on,
           jsonb_build_object(
             'kind',       tb.treatment_basis_kind,
             'issued_on',  tb.issued_on,
             'prescriber',
               case when pr.id is null then null
                    else btrim(coalesce(pr.title || ' ', '') || pr.given_name || ' ' || pr.family_name)
               end,
             'diagnosis_icd10',
               case when app.invoice_shows_diagnosis() then tb.diagnosis_icd10 end,
             'diagnosis',
               case when app.invoice_shows_diagnosis() then nullif(btrim(tb.diagnosis), '') end
           ) as eintrag
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    join public.appointments a      on a.id = b.appointment_id
    join public.treatment_bases tb  on tb.id = a.treatment_basis_id
    left join public.prescribers pr on pr.id = tb.prescriber_id
    where it.invoice_id = p_invoice_id
  ) v;

  -- Empfaenger: die hinterlegte Zeile oder, wenn keine gewaehlt ist, die
  -- Patientin selbst (ANN-076).
  --
  -- TRN-008 (ANN-182): Eine Trainingsrechnung geht an die Kund:in selbst, mit
  -- der Anschrift aus dem Trainingskontakt - nie aus der Akte, auch wenn
  -- dieselbe Person eine hat (ADR-021 Punkt 3). Seit ABN-020 (BEF-111) mit
  -- Strasse und Hausnummer in getrennten Feldern wie in der Akte.
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       tc.street,
             'house_number', tc.house_number,
             'postal_code',  tc.postal_code,
             'city',         tc.city,
             'reference',    null
           )
      into v_empfaenger
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details tc on tc.training_relationship_id = t.id
    where t.id = v_invoice.training_relationship_id;
  elsif v_invoice.recipient_id is null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       pc.street,
             'house_number', pc.house_number,
             'postal_code',  pc.postal_code,
             'city',         pc.city,
             'reference',    null
           )
      into v_empfaenger
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.id = v_invoice.patient_id;
  else
    select jsonb_build_object(
             'kind',         r.recipient_kind,
             'name',         r.name,
             'street',       r.street,
             'house_number', r.house_number,
             'postal_code',  r.postal_code,
             'city',         r.city,
             'reference',    r.reference
           )
      into v_empfaenger
    from public.invoice_recipients r
    where r.id = v_invoice.recipient_id;
  end if;

  -- Die behandelte Person steht auch dann auf der Rechnung, wenn jemand
  -- anderes sie bezahlt - sonst liesse sich die Leistung nicht zuordnen.
  --
  -- TRN-008 (ANN-182): Im Training ist sie zugleich die Empfaengerin; das
  -- Geburtsdatum dient in der Behandlung der Zuordnung bei Beihilfe und
  -- Versicherung und bleibt im Training weg (Datenminimierung, Art. 5 Abs. 1
  -- lit. c DSGVO). Der Schluessel heisst im Snapshot weiter `patient`: Er
  -- nennt die Person, fuer die geleistet wurde; die Beschriftung waehlt die
  -- Darstellung am Bereich.
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'name',          pe.given_name || ' ' || pe.family_name,
             'date_of_birth', null
           )
      into v_patient
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    where t.id = v_invoice.training_relationship_id;
  else
    select jsonb_build_object(
             'name',          pe.given_name || ' ' || pe.family_name,
             'date_of_birth', pc.date_of_birth
           )
      into v_patient
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.id = v_invoice.patient_id;
  end if;

  return jsonb_build_object(
    -- BEF-165 (schema_version 6): der Hinweis nach Par. 19 UStG im Dokument.
    'schema_version', 6,
    'period_month', v_invoice.period_month,
    -- ABR-032: der erste und der letzte Leistungstag der Rechnung.
    'service_period', (
      select jsonb_build_object(
               'from', min(b.performed_on),
               'to', max(coalesce(app.billable_service_period_until(b.id), b.performed_on)))
      from public.invoice_items it
      join public.billable_services b on b.id = it.billable_service_id
      where it.invoice_id = p_invoice_id
    ),
    'service_area', v_invoice.service_area,
    'currency', v_waehrung,
    'issuer', jsonb_build_object(
      'legal_name',        v_profile.legal_name,
      'street',            v_profile.street,
      'house_number',      v_profile.house_number,
      'postal_code',       v_profile.postal_code,
      'city',              v_profile.city,
      'phone',             v_profile.phone,
      'email',             v_profile.email,
      'tax_number',        v_profile.tax_number,
      'vat_id',            v_profile.vat_id,
      'small_business',    v_profile.small_business,
      -- BEF-165: der Wortlaut zum Zeitpunkt der Ausstellung, sonst null.
      'small_business_notice',
        case when v_profile.small_business then app.small_business_notice() end,
      'bank_name',         v_profile.bank_name,
      'account_holder',    v_profile.account_holder,
      'iban',              v_profile.iban,
      'bic',               v_profile.bic,
      'payment_term_days', v_profile.payment_term_days
    ),
    'recipient', v_empfaenger,
    'patient', v_patient,
    'treatment_bases', coalesce(v_basen, '[]'::jsonb),
    'items', v_items,
    'tax_groups', coalesce(v_gruppen, '[]'::jsonb),
    'totals', jsonb_build_object(
      'total_cents', v_summe,
      'tax_total_cents', coalesce(v_steuer, 0)
    )
  );
end;
$function$;
