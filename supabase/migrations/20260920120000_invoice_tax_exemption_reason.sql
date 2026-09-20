-- =============================================================================
-- ABR-006: Die Rechnung nennt den Grund der Steuerbefreiung (BEF-019)
--
-- Das Rechnungsdokument weist steuerfreie Posten als eigene Steuergruppe aus
-- und rechnet an ihnen richtig keine Umsatzsteuer heraus - warum keine
-- anfaellt, sagt es nicht. Par. 14 Abs. 4 Nr. 8 UStG macht daraus eine
-- **Pflichtangabe**: Sie fehlt damit auf jeder Rechnung, die eine
-- Heilbehandlung enthaelt, also auf praktisch jeder. Weil eine ausgestellte
-- Rechnung unveraenderlich ist (ADR-009 Punkt 9), waere sie spaeter nur noch
-- ueber Storno und Neuausstellung zu heilen; produktiv ist noch keine
-- Rechnung ausgestellt (B12) - deshalb jetzt.
--
-- Der Grund gehoert in den **Snapshot** nach Punkt 10 und nicht nur in die
-- Darstellung (ADR-009 Fassung 2 Punkt 18). Er entsteht deshalb hier, in der
-- einen Funktion, die Entwurfsansicht und Snapshot baut.
--
-- **ANN-082:** Der Grund entsteht als **fester Text je Steuerkennzeichen**
-- (`app.tax_exemption_reason`) und nicht als Feld an der Katalogposition -
-- die offene Folgefrage aus ADR-009 Fassung 2. Ein Feld erlaubte
-- verschiedene Befreiungstatbestaende, ein fester Text verhindert einen
-- falschen; die Praxis fuehrt genau einen (Par. 4 Nr. 14 Buchstabe a UStG),
-- und ein Freitextfeld an der Position waere eine zweite Wahrheit neben
-- `tax_treatment`. Der Wortlaut ist die eine Stelle, an der die Annahme
-- umkehrbar haengt; die Antwort aus B4/G13 aendert ihn dort und sonst
-- nirgends.
--
-- Der Snapshot steigt damit auf `schema_version` 2. Aeltere Snapshots bleiben
-- lesbar: Das Feld ist neu, keins faellt weg.
--
-- Erzwungen wird die Angabe mit ABR-007 (Par. 14c-Riegel) in
-- 20260920121000_invoice_tax_lock.sql - erzeugen und erzwingen sind zwei
-- Schritte, und der zweite prueft auch den ersten.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Wortlaut (ANN-082)
--
-- **ANN-082:** Fester Text je Steuerkennzeichen statt Feld an der
-- Katalogposition. Diese Funktion ist der Anker der Annahme - wird sie
-- umgekehrt, wandert der Grund an `service_catalog_items` und diese Funktion
-- faellt weg.
--
-- `exempt_healthcare` traegt die Pflichtangabe nach Par. 14 Abs. 4 Nr. 8
-- UStG. `not_taxable` traegt sie nicht als Pflicht - ein nicht steuerbarer
-- Umsatz ist nicht steuerbefreit -, aber aus demselben Grund denselben Satz:
-- Ein Posten ohne Steuer und ohne Erklaerung sieht auf dem Papier wie ein
-- Fehler aus. `taxable` traegt keinen: Dort steht die Steuer selbst.
-- -----------------------------------------------------------------------------
create or replace function app.tax_exemption_reason(p_tax_treatment text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_tax_treatment
           when 'exempt_healthcare'
             then 'Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG'
           when 'not_taxable'
             then 'Nicht steuerbar, kein Leistungsaustausch (§ 1 Abs. 1 Nr. 1 UStG)'
           else null
         end;
$$;

comment on function app.tax_exemption_reason(text) is
  'Der Grund der Steuerbefreiung als fester Text je Steuerkennzeichen (ABR-006, ADR-009 Punkt 18, Par. 14 Abs. 4 Nr. 8 UStG). ANN-082: fester Text statt Feld an der Katalogposition - er verhindert einen falschen Befreiungstatbestand, wo ein Feld verschiedene erlaubte. Liefert null fuer steuerpflichtige Posten.';

revoke all on function app.tax_exemption_reason(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Das Dokument nennt den Grund (ABR-006, BEF-019)
--
-- Uebernommen aus 20260919150000_invoices.sql, Abschnitt 7, mit zwei
-- Aenderungen: Die Steuergruppe traegt `exemption_reason`, und die
-- `schema_version` steht auf 2. Alles andere ist unveraendert - PostgreSQL
-- kennt kein teilweises Ersetzen einer Funktion.
--
-- Der Grund steht an der **Gruppe** und nicht an der Zeile: Die Pflichtangabe
-- gehoert zum steuerfreien Umsatz, und die Gruppe ist die Stelle, an der das
-- Dokument ihn ohnehin zusammenfasst. Eine Wiederholung je Zeile waere
-- dieselbe Angabe ein zweites Mal.
-- -----------------------------------------------------------------------------
create or replace function app.build_invoice_document(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
           (b.quantity * c.unit_price_cents) as brutto,
           jsonb_build_object(
             'performed_on',      b.performed_on,
             'code',              c.code,
             'label',             c.label,
             'item_kind',         c.item_kind,
             'quantity',          b.quantity,
             'unit_price_cents',  c.unit_price_cents,
             'line_total_cents',  b.quantity * c.unit_price_cents,
             'currency',          c.currency,
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille
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
  -- Position (Par. 19 UStG). Neu mit ABR-006: der Grund der Steuerbefreiung
  -- als Pflichtangabe im Dokument, nicht erst in der Darstellung (Punkt 18).
  select jsonb_agg(g.gruppe order by g.tax_treatment, g.tax_rate_permille),
         sum(g.steuer)::integer
    into v_gruppen, v_steuer
  from (
    select c.tax_treatment,
           c.tax_rate_permille,
           sum(b.quantity * c.unit_price_cents)::integer as brutto,
           case
             when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
             else round(sum(b.quantity * c.unit_price_cents)::numeric
                        * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
           end as steuer,
           jsonb_build_object(
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             'exemption_reason',  app.tax_exemption_reason(c.tax_treatment),
             'gross_cents',       sum(b.quantity * c.unit_price_cents)::integer,
             'tax_cents',
               case
                 when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                 else round(sum(b.quantity * c.unit_price_cents)::numeric
                            * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
               end,
             'net_cents',
               sum(b.quantity * c.unit_price_cents)::integer
               - case
                   when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                   else round(sum(b.quantity * c.unit_price_cents)::numeric
                              * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
                 end
           ) as gruppe
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
    group by c.tax_treatment, c.tax_rate_permille
  ) g;

  -- Verordnungsbezug: Bauart, Ausstellungsdatum, Verordner:in. Ausdruecklich
  -- ohne Diagnose, Therapieziel und Verordnerhinweis - die Rechnung geht an
  -- Dritte (ADR-004 Fassung 2, Datensparsamkeit).
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
               end
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
  if v_invoice.recipient_id is null then
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
  select jsonb_build_object(
           'name',          pe.given_name || ' ' || pe.family_name,
           'date_of_birth', pc.date_of_birth
         )
    into v_patient
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details pc on pc.patient_id = p.id
  where p.id = v_invoice.patient_id;

  return jsonb_build_object(
    'schema_version', 2,
    'period_month', v_invoice.period_month,
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
$$;

comment on function app.build_invoice_document(uuid) is
  'Baut das Rechnungsdokument aus Stammdaten, Empfaenger, Leistungen und Steuergruppen (ABR-003, ADR-009 Punkt 10). Dieselbe Funktion liefert die Entwurfsansicht und den Snapshot beim Ausstellen - ein Dokument, eine Implementierung. Seit ABR-006 traegt jede Steuergruppe den Grund der Steuerbefreiung (schema_version 2, ANN-082). Ohne klinische Inhalte.';

revoke all on function app.build_invoice_document(uuid) from public, anon, authenticated;

