-- =============================================================================
-- TRN-008: Die Rechnung haengt am Trainingsverhaeltnis (TRN-EPIC-003)
--
-- ABR-009 hat den Leistungsbereich an Rechnung und Zeile gebracht, ABR-010 den
-- Nummernkreis je Bereich, ABR-006/007 Befreiungsgrund und Par. 14c-Riegel.
-- Eine Trainingsrechnung war trotzdem nicht baubar: `invoices.patient_id` ist
-- Pflicht, und eine Trainingskund:in ohne Akte hat keine Patient:in. Dasselbe
-- Muster wie TRN-007 an der Leistung: eine zweite, nullbare Verknuepfung und
-- eine Constraint, die je Bereich genau eine verlangt (ADR-021 Punkt 3).
--
--   invoices.training_relationship_id   zweite, nullbare Verknuepfung
--   invoices_party                      je Bereich genau ein Verhaeltnis
--   app.invoice_item_area_from_service  + Zeile und Rechnung am selben Verhaeltnis
--   list_invoice_candidates             + Trainingsverhaeltnis
--   create_training_invoice_draft       Entwurf je Kund:in, Monat (ANN-077)
--   create_correction_draft             + Trainingsrechnung
--   app.build_invoice_document          Empfaenger und Person aus dem Training (ANN-182)
--   list_invoices, list_open_items, list_payments
--                                       Name aus dem Verhaeltnis der Rechnung
--   Loeschlauf                          Belegfrist haelt das Verhaeltnis (ANN-183)
--
-- UNVERAENDERT und nur durch Tests belegt (Roadmap, TRN-008): der
-- Par. 14c-Riegel (app.assert_invoice_tax_lawful), der Befreiungsgrund
-- (app.tax_exemption_reason), der Nummernkreis je Bereich
-- (app.invoice_number_prefix, app.next_invoice_number - die Trainingsrechnung
-- zieht aus `TR`), Ausstellen, Storno, Zahlungen, Erinnerungen und die
-- Auswertung "Einnahmen je Leistungsart" (sie rechnet aus Snapshots und kennt
-- den Bereich seit ABR-011).
--
-- WER: owner und office wie bisher (app.can_read_invoicing,
-- app.can_manage_invoicing). Die Trainingsbetreuung sieht keine Rechnung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die zweite Verknuepfung an der Rechnung
-- -----------------------------------------------------------------------------
alter table public.invoices
  alter column patient_id drop not null;

alter table public.invoices
  add column training_relationship_id uuid
    references public.training_relationships (id) on delete restrict;

alter table public.invoices
  add constraint invoices_party check (
    (service_area = 'therapy'  and patient_id is not null and training_relationship_id is null)
    or
    (service_area = 'training' and training_relationship_id is not null and patient_id is null)
  );

comment on column public.invoices.training_relationship_id is
  'Das Trainingsverhaeltnis, dessen Leistungen diese Rechnung abrechnet (TRN-008, ADR-021 Punkt 5). Gesetzt genau im Bereich training; patient_id ist dann leer.';

comment on constraint invoices_party on public.invoices is
  'Eine Rechnung haengt an genau einem Verhaeltnis, und zwar an dem ihres Bereichs (ADR-021 Punkt 3, ADR-009 Punkt 16). Eine Trainingsrechnung mit Patientenbezug ist schemaseitig unmoeglich.';

create index invoices_training_idx
  on public.invoices (organization_id, training_relationship_id)
  where training_relationship_id is not null;

-- Der dritte Schluessel der Sammelrechnung (ANN-077) fuer das Training: je
-- Kund:in und Monat hoechstens ein Entwurf. Der vorhandene Index
-- invoices_draft_period_key greift hier nicht - patient_id ist leer, und
-- leere Werte sind in einem Unique-Index verschieden.
create unique index invoices_training_draft_period_key
  on public.invoices (training_relationship_id, period_month)
  where status = 'draft' and training_relationship_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Zeile und Rechnung haengen am selben Verhaeltnis
--
-- Aus 20260921140000_invoice_service_area.sql, Abschnitt 4, ergaenzt. Die
-- zusammengesetzten Fremdschluessel halten den **Bereich** der Zeile an
-- Rechnung und Leistung; sie halten nicht, dass die Leistung derselben Person
-- gehoert wie die Rechnung. In der Behandlung war das bisher Sache des
-- Schreibwegs. Mit zwei Verhaeltnissen steht es hier, an jedem Weg: Tinas
-- Trainingsstunde auf Erikas Trainingsrechnung waere eine Forderung gegen die
-- falsche Person (Paragraf 13).
-- -----------------------------------------------------------------------------
create or replace function app.invoice_item_area_from_service()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_area     text;
  v_patient  uuid;
  v_training uuid;
begin
  select b.service_area, b.patient_id, b.training_relationship_id
    into v_area, v_patient, v_training
  from public.billable_services b
  where b.id = new.billable_service_id;

  if v_area is null then
    return new;
  end if;

  if new.service_area is not null and new.service_area is distinct from v_area then
    raise exception 'service area % does not match the billable service (%)', new.service_area, v_area
      using errcode = '23514';
  end if;

  new.service_area := v_area;

  -- TRN-008: dieselbe Person in beiden Spalten.
  if exists (
    select 1 from public.invoices i
    where i.id = new.invoice_id
      and (i.patient_id is distinct from v_patient
           or i.training_relationship_id is distinct from v_training)
  ) then
    raise exception 'billable service does not belong to the relationship of its invoice'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.invoice_item_area_from_service() is
  'Setzt den Leistungsbereich einer Rechnungszeile aus ihrer Leistung (ABR-009) und weist eine Leistung ab, die an einem anderen Verhaeltnis haengt als ihre Rechnung (TRN-008). Am Trigger, damit jeder Schreibweg ihn traegt; ob der Bereich zur Rechnung passt, entscheidet danach der Fremdschluessel.';

-- -----------------------------------------------------------------------------
-- 3. Die Buendelung kennt das Trainingsverhaeltnis
--
-- Aus 20260923120000_abgewiesene_lesezugriffe_rest.sql. Die Rueckgabe waechst
-- um das Verhaeltnis, deshalb drop und create. Gebuendelt wird je Person,
-- Monat und Bereich (ANN-077) - die Person ist die Patient:in oder das
-- Trainingsverhaeltnis, nie beides (TRN-007).
-- -----------------------------------------------------------------------------
drop function public.list_invoice_candidates(integer);

create function public.list_invoice_candidates(p_limit integer default 100)
returns table (
  patient_id               uuid,
  training_relationship_id uuid,
  patient_name             text,
  period_month             date,
  service_area             text,
  service_count            integer,
  total_cents              integer,
  currency                 text,
  has_draft                boolean,
  draft_id                 uuid
)
language plpgsql
security definer
set search_path = ''
as $$
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
         entwurf.id
  from (
    select b.patient_id,
           b.training_relationship_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           date_trunc('month', b.performed_on)::date as period_month,
           b.service_area,
           count(*)::integer as service_count,
           sum(b.quantity * c.unit_price_cents)::integer as total_cents,
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
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
    group by b.patient_id, b.training_relationship_id,
             date_trunc('month', b.performed_on)::date, b.service_area
  ) k
  left join lateral (
    select i.id
    from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from k.patient_id
      and i.training_relationship_id is not distinct from k.training_relationship_id
      and i.period_month = k.period_month
      and i.service_area = k.service_area
      and i.status = 'draft'
    limit 1
  ) entwurf on true
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_invoice_candidates(integer) is
  'Erfasste Leistungen ohne Rechnung, gebuendelt nach Person, Kalendermonat und Leistungsbereich (ABR-003, ABR-009, ANN-077); die Person ist die Patient:in oder das Trainingsverhaeltnis (TRN-008). Die Arbeitsliste des Rechnungsbereichs, mit der Kennung des vorhandenen Entwurfs (BEF-018).';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Der Entwurf einer Trainingsrechnung
--
-- Eine eigene Funktion und kein vierter Parameter an create_invoice_draft:
-- Dort ist die Patient:in Pflicht und der Bereich waehlbar; hier steht der
-- Bereich fest, und die Kennung ist ein Trainingsverhaeltnis. Ein Aufruf, der
-- beides mischt, soll nicht formulierbar sein.
--
-- Der Empfaenger bleibt leer: Die Rechnung geht an die Kund:in selbst
-- (ANN-182). Die Empfaengerstammdaten (invoice_recipients) haengen an der
-- Akte und werden im Training nicht gelesen (ADR-021 Punkt 3).
-- -----------------------------------------------------------------------------
create function public.create_training_invoice_draft(
  p_training_relationship_id uuid,
  p_period_month             date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_monat  date;
  v_id     uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  v_monat := date_trunc('month', p_period_month)::date;

  if v_monat is null then
    raise exception 'period month is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_training_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = '42501';
  end if;

  -- ANN-182: kein Empfaenger - die Rechnung geht an die Kund:in selbst.
  insert into public.invoices (
    organization_id, training_relationship_id, recipient_id, period_month, service_area,
    created_by
  )
  values (v_org, p_training_relationship_id, null, v_monat, 'training', v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.training_relationship_id = p_training_relationship_id
      and b.status = 'billable'
      and b.service_area = 'training'
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this training client and month'
      using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_build_object('surface', 'web', 'training_relationship_id', p_training_relationship_id,
                       'period_month', v_monat, 'service_area', 'training',
                       'item_count', v_anzahl)
  );

  return v_id;
end;
$$;

comment on function public.create_training_invoice_draft(uuid, date) is
  'Legt den Rechnungsentwurf einer Trainingskund:in fuer einen Kalendermonat an und nimmt alle noch nicht abgerechneten Trainingsleistungen auf (TRN-008, ANN-077). Je Kund:in und Monat hoechstens ein Entwurf; ohne abweichenden Empfaenger (ANN-182). Die Nummer kommt erst beim Ausstellen, aus dem Kreis des Trainings (ABR-010).';

revoke all on function public.create_training_invoice_draft(uuid, date) from public, anon;
grant execute on function public.create_training_invoice_draft(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Die Korrekturrechnung kennt beide Verhaeltnisse
--
-- Aus 20260921140000_invoice_service_area.sql, Abschnitt 9. Sie nimmt das
-- Verhaeltnis der stornierten Rechnung mit - welches es ist, steht fest.
-- -----------------------------------------------------------------------------
create or replace function public.create_correction_draft(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    record;
  v_id     uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_alt
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'only a cancelled invoice can be corrected' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from v_alt.patient_id
      and i.training_relationship_id is not distinct from v_alt.training_relationship_id
      and i.period_month = v_alt.period_month
      and i.service_area = v_alt.service_area
      and i.status = 'draft'
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, training_relationship_id, recipient_id, period_month,
    service_area, replaces_invoice_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.training_relationship_id, v_alt.recipient_id,
          v_alt.period_month, v_alt.service_area, p_invoice_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      and date_trunc('month', b.performed_on)::date = v_alt.period_month
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_strip_nulls(jsonb_build_object(
      'surface', 'web', 'patient_id', v_alt.patient_id,
      'training_relationship_id', v_alt.training_relationship_id,
      'period_month', v_alt.period_month, 'service_area', v_alt.service_area,
      'item_count', v_anzahl, 'replaces_invoice_id', p_invoice_id))
  );

  return v_id;
end;
$$;

comment on function public.create_correction_draft(uuid) is
  'Legt zu einer stornierten Rechnung den Entwurf der Korrekturrechnung an und verweist von ihm auf die ersetzte Rechnung (ABR-003c, ADR-009 Punkt 9, R3-009). Nimmt alle wieder freien Leistungen des Monats **im Bereich und am Verhaeltnis der stornierten Rechnung** auf (ANN-077, ABR-009, TRN-008); sperrt die Rechnung, damit zwei gleichzeitige Aufrufe nicht im Unique-Index enden.';
-- -----------------------------------------------------------------------------
-- 6. Das Dokument der Trainingsrechnung (ANN-182)
--
-- Aus 20260921150000_invoice_number_series_per_area.sql, Abschnitt 5,
-- geaendert nur an Empfaenger und Person. Alles andere - Zeilen,
-- Steuergruppen mit Befreiungsgrund, Bereich im Snapshot (`schema_version`
-- 3) - bleibt, wie es ist. Einen Verordnungsbezug hat eine Trainingsrechnung
-- nicht: Ihre Termine tragen keine Behandlungsgrundlage (ADR-022 Punkt 4),
-- die Liste `treatment_bases` bleibt leer.
-- -----------------------------------------------------------------------------
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
  -- Position (Par. 19 UStG). Der Grund der Befreiung steht an der Gruppe
  -- (ABR-006, ANN-082).
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
                 end,
             'exemption_reason', app.tax_exemption_reason(c.tax_treatment)
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
  --
  -- TRN-008 (ANN-182): Eine Trainingsrechnung geht an die Kund:in selbst, mit
  -- der Anschrift aus dem Trainingskontakt - nie aus der Akte, auch wenn
  -- dieselbe Person eine hat (ADR-021 Punkt 3). Die Zeile "Strasse und
  -- Hausnummer" steht dort in einem Feld und kommt ungeteilt auf die
  -- Rechnung; getrennt werden muss sie nur fuer den Hausbesuch (ANN-177).
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       tc.street,
             'house_number', null,
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
    'schema_version', 3,
    'period_month', v_invoice.period_month,
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

comment on function app.build_invoice_document(uuid) is
  'Baut das Rechnungsdokument aus Stammdaten, Empfaenger, Leistungen und Steuergruppen (ABR-003, ADR-009 Punkt 10). Dieselbe Funktion liefert die Entwurfsansicht und den Snapshot beim Ausstellen. Seit ABR-006 mit dem Grund der Steuerbefreiung je Gruppe, seit ABR-010 mit dem Leistungsbereich (schema_version 3), seit TRN-008 mit Empfaenger und Person aus dem Trainingsverhaeltnis (ANN-182). Ohne klinische Inhalte.';

-- -----------------------------------------------------------------------------
-- 7. Die Listen nennen die Person aus dem Verhaeltnis der Rechnung
--
-- Aus 20260923120000_abgewiesene_lesezugriffe_rest.sql. Bisher holte jede
-- Liste den Namen per inner join ueber `patients` - eine Trainingsrechnung
-- waere darin still verschwunden, genau der Fehler aus Paragraf 13. Die
-- Rueckgabe von list_invoices und list_open_items waechst um das
-- Verhaeltnis (und den Bereich), deshalb drop und create.
-- -----------------------------------------------------------------------------
drop function public.list_invoices(integer);

CREATE FUNCTION public.list_invoices(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, status text, invoice_number text, period_month date, service_area text, issued_on date, due_on date, patient_id uuid, training_relationship_id uuid, patient_name text, recipient_name text, recipient_kind text, total_cents integer, currency text, item_count integer, paid_cents integer, outstanding_cents integer, payment_state text, overdue boolean, cancelled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
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

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  with auswahl as (
    -- Erst begrenzen, dann anreichern: Reihenfolge und Auswahl haengen allein
    -- an Spalten der Rechnung. Alles Weitere - Name, Empfaenger, Zeilensumme,
    -- Zahlungsstand - wird nur noch fuer die gelieferten Zeilen geholt.
    select i.*
    from public.invoices i
    where i.organization_id = v_org
    order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id
    limit greatest(least(coalesce(p_limit, 100), 200), 1)
  )
  select i.id, i.status, i.invoice_number, i.period_month, i.service_area, i.issued_on, i.due_on,
         i.patient_id,
         i.training_relationship_id,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         coalesce(r.recipient_kind, 'self'),
         -- Der Entwurf rechnet live, die ausgestellte Rechnung zeigt ihren
         -- festgeschriebenen Betrag (ADR-009 Punkt 10).
         coalesce(i.total_cents, summe.brutto)::integer,
         coalesce(i.currency, summe.currency),
         summe.anzahl::integer,
         -- Neu mit ABR-004: Der Zahlungsstand wird gerechnet, nicht gelesen.
         -- Am Entwurf gibt es keinen - an ihm kann niemand zahlen.
         case when i.status = 'issued' then coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then i.total_cents - coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, coalesce(zahlung.bezahlt, 0))
              else 'unpaid' end,
         -- Seit ABR-003c: Eine stornierte Rechnung wird nicht ueberfaellig.
         (i.status = 'issued' and i.due_on < v_heute
          and coalesce(zahlung.bezahlt, 0) < i.total_cents
          and not exists (
            select 1 from public.invoice_cancellations c where c.invoice_id = i.id
          )),
         exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
  from auswahl i
  -- TRN-008: der Name aus dem Verhaeltnis der Rechnung, nie aus der Akte
  -- einer Trainingsrechnung.
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  left join lateral (
    select sum(b.quantity * c.unit_price_cents) as brutto,
           max(c.currency) as currency,
           count(*) as anzahl
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = i.id
  ) summe on true
  -- Die Zahlungssumme einmal je Rechnung statt viermal je Zeile - und nur
  -- noch fuer die begrenzte Auswahl (R3-016).
  left join lateral (
    select sum(case when p.direction = 'incoming' then p.amount_cents
                    else -p.amount_cents end)::integer as bezahlt
    from public.payments p
    where p.invoice_id = i.id
      and p.voided_at is null
  ) zahlung on true
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id;
end;
$function$;

comment on function public.list_invoices(integer) is
  'Rechnungen der Organisation mit Zahlungsstand, Empfaenger und Name aus dem Verhaeltnis der Rechnung (ABR-003, ABR-004, TRN-008).';

revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;

drop function public.list_open_items(integer);

CREATE FUNCTION public.list_open_items(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, invoice_number text, patient_id uuid, training_relationship_id uuid, service_area text, patient_name text, recipient_name text, period_month date, issued_on date, due_on date, total_cents integer, paid_cents integer, outstanding_cents integer, currency text, overdue boolean, open_total_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
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

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  select i.id, i.invoice_number, i.patient_id, i.training_relationship_id, i.service_area,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         i.period_month, i.issued_on, i.due_on,
         i.total_cents,
         offen.paid_cents,
         offen.outstanding_cents,
         i.currency,
         (i.due_on < v_heute),
         sum(offen.outstanding_cents) over ()::integer
  from app.open_invoices(v_org) offen
  join public.invoices i  on i.id = offen.invoice_id
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  order by i.due_on, i.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

comment on function public.list_open_items(integer) is
  'Offene Posten: ausgestellte, nicht stornierte Rechnungen mit ausstehendem Betrag, mit Bereich und Name aus dem Verhaeltnis der Rechnung (ABR-004, TRN-008).';

revoke all on function public.list_open_items(integer) from public, anon;
grant execute on function public.list_open_items(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.list_payments(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, invoice_id uuid, invoice_number text, patient_name text, recipient_name text, direction text, amount_cents integer, currency text, paid_on date, method text, note text, voided_at timestamp with time zone, void_reason text)
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

  return query
  select p.id, p.invoice_id, i.invoice_number,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         p.direction, p.amount_cents, p.currency, p.paid_on, p.method,
         p.note, p.voided_at, p.void_reason
  from public.payments p
  join public.invoices  i  on i.id = p.invoice_id
  -- TRN-008: der Name aus dem Verhaeltnis der Rechnung.
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  where p.organization_id = v_org
  order by p.paid_on desc, p.created_at desc, p.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- 8. Der Loeschlauf: Die Belegfrist haelt das Trainingsverhaeltnis (ANN-183)
--
-- Seit TRN-007 zeigen Leistungen, seit hier Rechnungen mit RESTRICT auf das
-- Trainingsverhaeltnis und seine Termine. Ohne diesen Abschnitt braeche der
-- Lauf nach drei Jahren am Fremdschluessel ab - oder, schlimmer, ein
-- kuenftiger Weg loeschte Belege vor Ablauf ihrer steuerlichen Frist.
--
-- Dieselbe Regel wie an der Akte seit ABR-003: Gesetzliche Aufbewahrung hat
-- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2). Laeuft die Frist
-- der Belege noch (acht Jahre ab Ende des Kalenderjahres, Par. 147 Abs. 3 AO),
-- bleibt das Verhaeltnis stehen und zaehlt im Bericht als
-- `steuerfrist_gehalten`. Danach fallen Belege und Verhaeltnis zusammen.
-- -----------------------------------------------------------------------------
create function app.training_billing_retention_due_at(p_relationship_id uuid, p_time_zone text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(app.retention_due_at(
           (date_trunc('year', t.beleg_am) + interval '1 year' - interval '1 day')::date,
           app.retention_interval('abrechnungsdaten'),
           p_time_zone
         ))
  from (
    select i.issued_on as beleg_am
    from public.invoices i
    where i.training_relationship_id = p_relationship_id
      and i.status = 'issued'

    union all

    select c.cancelled_on
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where i.training_relationship_id = p_relationship_id

    union all

    select r.reminder_on
    from public.invoice_payment_reminders r
    join public.invoices i on i.id = r.invoice_id
    where i.training_relationship_id = p_relationship_id

    union all

    select p.paid_on
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where i.training_relationship_id = p_relationship_id
  ) t
$$;

comment on function app.training_billing_retention_due_at(uuid, text) is
  'Ende der steuerlichen Frist der Belege eines Trainingsverhaeltnisses (TRN-008, ANN-183): Rechnung, Storno, Erinnerung, Zahlung - acht Jahre ab Ende des Kalenderjahres (Par. 147 Abs. 3 AO). Gegenstueck zu app.billing_retention_due_at an der Akte. null, wenn es keinen Beleg gibt.';

revoke all on function app.training_billing_retention_due_at(uuid, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app.delete_training_relationship(p_relationship_id uuid, p_run_id uuid, p_due_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select t.person_id
    into v_person
  from public.training_relationships t
  where t.id = p_relationship_id;

  if not found then
    return 0;
  end if;

  -- TRN-008: die Belege zuerst. Sie zeigen mit RESTRICT auf Rechnung,
  -- Leistung und Termin; dieselbe Reihenfolge wie an der Akte
  -- (app.delete_patient_record), dieselbe Datenklasse.
  with geloescht as (
    delete from public.invoice_payment_reminders r
     where r.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_payment_reminders', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoice_cancellations c
     where c.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning c.id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_cancellations', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.payments z
     where z.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning z.id, z.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'payments', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoice_items it
     where it.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning it.id, it.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_items', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoices i
     where i.training_relationship_id = p_relationship_id
    returning i.id, i.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoices', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.billable_services b
     where b.training_relationship_id = p_relationship_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'billable_services', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Die Termine des Verhaeltnisses. Sie tragen keinen Behandlungsnachweis und
  -- koennen keinen tragen (ADR-022 Punkt 6); `appointment_notifications`
  -- faellt per Kaskade mit.
  with geloescht as (
    delete from public.appointments a
     where a.training_relationship_id = p_relationship_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.training_bases b
     where b.training_relationship_id = p_relationship_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_bases', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.training_relationships t
     where t.id = p_relationship_id
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_relationships', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Dieselben vier Verweise wie in der Akte, und aus demselben Grund: Die
  -- Person gehoert keinem der beiden Bereiche, sie wird von beiden benutzt.
  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x               where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x          where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x          where x.person_id = pe.id)
       and not exists (select 1 from public.training_relationships x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;


-- -----------------------------------------------------------------------------
-- 9. Der Entwurf an der Akte kennt kein Training mehr
--
-- Aus 20260921140000_invoice_service_area.sql, Abschnitt 8. Der Bereich
-- bleibt ein Argument (die Signatur aendert sich nicht), aber `training`
-- fuehrt hier ins Leere: Die Leistungen haengen am Trainingsverhaeltnis
-- (TRN-007), und ein Entwurf mit Patientin im Bereich training verstiesse
-- gegen invoices_party. Die Meldung nennt den richtigen Weg.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_draft(p_patient_id uuid, p_period_month date, p_service_area text DEFAULT 'therapy'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_monat   date;
  v_bereich text;
  v_id      uuid;
  v_empf    uuid;
  v_anzahl  integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  v_monat := date_trunc('month', p_period_month)::date;
  v_bereich := coalesce(nullif(btrim(p_service_area), ''), 'therapy');

  if v_bereich not in ('therapy', 'training') then
    raise exception 'unknown service area %', p_service_area using errcode = '22023';
  end if;

  -- TRN-008: Trainingsleistungen haengen am Trainingsverhaeltnis, nie an der
  -- Akte (ADR-021 Punkt 3). Ihr Entwurf entsteht ueber
  -- create_training_invoice_draft; hier gibt es fuer `training` nichts zu
  -- finden, und die Meldung sagt, wo es steht.
  if v_bereich = 'training' then
    raise exception 'training invoices are drafted for the training relationship (create_training_invoice_draft)'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Die Vorgabe aus den Stammdaten; ohne sie geht die Rechnung an die
  -- Patientin selbst (ANN-076).
  select r.id into v_empf
  from public.invoice_recipients r
  where r.patient_id = p_patient_id and r.is_default;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area, created_by
  )
  values (v_org, p_patient_id, v_empf, v_monat, v_bereich, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id,
                       'period_month', v_monat, 'service_area', v_bereich,
                       'item_count', v_anzahl)
  );

  return v_id;
end;
$function$;
