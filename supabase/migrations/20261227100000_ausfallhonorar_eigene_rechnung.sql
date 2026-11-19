-- Das Ausfallhonorar steht auf einer eigenen Rechnung (ADR-009 Punkt 25): Die Rechnung zur
-- Verordnung geht an die Kasse, das Ausfallhonorar erstattet sie nicht. Je Person und Monat eine
-- Ausfallrechnung, ohne Verordnung und Diagnose; das Datenmodell weist jede Mischung ab.
alter table public.invoices add column absence_fee boolean not null default false;

comment on column public.invoices.absence_fee is 'true: Ausfallrechnung, führt nur Ausfallhonorare eines Kalendermonats, ohne Behandlungsgrundlage (ADR-009 Punkt 25). false: führt nie eines.';

alter table public.invoices add constraint invoices_absence_fee_without_basis
  check (not absence_fee or (treatment_basis_id is null and service_area = 'therapy'));

drop index public.invoices_draft_period_key;
create unique index invoices_draft_period_key on public.invoices
  using btree (patient_id, period_month, service_area, absence_fee)
  where ((status = 'draft'::text) and (treatment_basis_id is null));

create function app.invoice_item_matches_absence_invoice() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ausfall  boolean;
  v_rechnung boolean;
begin
  select c.item_kind = 'absence_fee' into v_ausfall
  from public.billable_services b
  join public.service_catalog_items c on c.id = b.catalog_item_id
  where b.id = new.billable_service_id;

  select i.absence_fee into v_rechnung from public.invoices i where i.id = new.invoice_id;

  if v_ausfall is distinct from v_rechnung then
    raise exception 'an absence fee is billed on its own invoice, and only there'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.invoice_item_matches_absence_invoice() is 'Hält Ausfallhonorar und Behandlung auf getrennten Rechnungen (ADR-009 Punkt 25): Eine Zeile mit Ausfallhonorar steht nur auf einer Ausfallrechnung, jede andere nie dort.';

revoke all on function app.invoice_item_matches_absence_invoice() from public, anon, authenticated;

create trigger c_invoice_items_absence_fee_apart
  before insert or update of invoice_id, billable_service_id on public.invoice_items
  for each row execute function app.invoice_item_matches_absence_invoice();

CREATE OR REPLACE FUNCTION app.assert_invoice_items_match_basis(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_basis   uuid;
  v_bereich text;
  v_ausfall boolean;
begin
  select i.treatment_basis_id, i.service_area, i.absence_fee into v_basis, v_bereich, v_ausfall
  from public.invoices i where i.id = p_invoice_id;

  if v_bereich <> 'therapy' or v_ausfall then
    return;
  end if;

  if exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    left join public.appointments a on a.id = b.appointment_id
    where it.invoice_id = p_invoice_id
      and a.treatment_basis_id is distinct from v_basis
  ) then
    raise exception 'invoice items do not belong to the treatment basis of the invoice'
      using errcode = '23514';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION app.build_invoice_document(p_invoice_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  select jsonb_agg(z.zeile order by z.sort_order),
         sum(z.brutto)::integer,
         count(*)::integer,
         max(z.currency)
    into v_items, v_summe, v_anzahl, v_waehrung
  from (
    select it.sort_order,
           c.currency,
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
             'session_fee',       exists (
                                    select 1 from public.appointment_session_fees f
                                    where f.appointment_id = b.appointment_id
                                  ) and c.remedy is not null,
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
      and not v_invoice.absence_fee
  ) v;

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
    'schema_version', 6,
    'period_month', v_invoice.period_month,
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
$$;

CREATE OR REPLACE FUNCTION app.correction_draft_services(p_invoice_id uuid) RETURNS TABLE(billable_service_id uuid, sort_order smallint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.invoices v_alt
    join public.billable_services b     on b.organization_id = v_alt.organization_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    left join public.appointments a     on a.id = b.appointment_id
    where v_alt.id = p_invoice_id
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      and (c.item_kind = 'absence_fee') = v_alt.absence_fee
      and (
        (v_alt.treatment_basis_id is not null and a.treatment_basis_id = v_alt.treatment_basis_id)
        or (v_alt.treatment_basis_id is null
            and (a.treatment_basis_id is null or v_alt.absence_fee)
            and date_trunc('month', b.performed_on)::date = v_alt.period_month)
      )
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
      and app.open_cancellation_holding_service(
            b.id, v_alt.patient_id, v_alt.training_relationship_id, v_alt.service_area,
            v_alt.treatment_basis_id, v_alt.period_month, p_invoice_id) is null
  ) z
$$;

CREATE OR REPLACE FUNCTION public.create_correction_draft(p_invoice_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      and i.service_area = v_alt.service_area
      and i.status = 'draft'
      and i.treatment_basis_id is not distinct from v_alt.treatment_basis_id
      and i.absence_fee = v_alt.absence_fee
      and (v_alt.treatment_basis_id is not null or i.period_month = v_alt.period_month)
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, training_relationship_id, recipient_id, period_month,
    service_area, replaces_invoice_id, treatment_basis_id, absence_fee, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.training_relationship_id, v_alt.recipient_id,
          v_alt.period_month, v_alt.service_area, p_invoice_id, v_alt.treatment_basis_id,
          v_alt.absence_fee, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.billable_service_id, z.sort_order
  from app.correction_draft_services(p_invoice_id) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;

  return v_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice_draft(p_patient_id uuid, p_period_month date, p_service_area text DEFAULT 'therapy'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
    left join public.appointments a     on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and a.treatment_basis_id is null
      and c.item_kind <> 'absence_fee'
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

  return v_id;
end;
$$;

CREATE FUNCTION public.create_absence_fee_invoice_draft(p_patient_id uuid, p_period_month date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  v_bereich := 'therapy';

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  select r.id into v_empf
  from public.invoice_recipients r
  where r.patient_id = p_patient_id and r.is_default;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area, absence_fee, created_by
  )
  values (v_org, p_patient_id, v_empf, v_monat, v_bereich, true, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    left join public.appointments a     on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and c.item_kind = 'absence_fee'
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable absence fees for this patient and month'
      using errcode = '22023';
  end if;

  return v_id;
end;
$$;

comment on function public.create_absence_fee_invoice_draft(p_patient_id uuid, p_period_month date) is 'Legt den Entwurf der Ausfallrechnung einer Patientin für einen Kalendermonat an: alle abrechenbaren Ausfallhonorare des Monats, mit oder ohne Verordnung am Termin (ADR-009 Punkt 25). owner und office.';

revoke all on function public.create_absence_fee_invoice_draft(uuid, date) from public, anon;
grant all on function public.create_absence_fee_invoice_draft(uuid, date) to authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_draft_for_basis(p_treatment_basis_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_monat   date;
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

  select tb.patient_id into v_patient
  from public.treatment_bases tb
  where tb.id = p_treatment_basis_id and tb.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.treatment_basis_id = p_treatment_basis_id and i.status = 'draft'
  ) then
    raise exception 'a draft for this treatment basis already exists' using errcode = '23505';
  end if;

  select date_trunc('month', min(b.performed_on))::date into v_monat
  from public.billable_services b
  join public.service_catalog_items c on c.id = b.catalog_item_id
  join public.appointments a on a.id = b.appointment_id
  where b.organization_id = v_org
    and c.item_kind <> 'absence_fee'
    and b.patient_id = v_patient
    and a.treatment_basis_id = p_treatment_basis_id
    and b.status = 'billable'
    and b.service_area = 'therapy'
    and not exists (
      select 1 from public.invoice_items it
      where it.billable_service_id = b.id and it.released_at is null
    );

  if v_monat is null then
    raise exception 'no billable services for this treatment basis' using errcode = '22023';
  end if;

  select r.id into v_empf
  from public.invoice_recipients r
  where r.patient_id = v_patient and r.is_default;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area,
    treatment_basis_id, created_by
  )
  values (v_org, v_patient, v_empf, v_monat, 'therapy', p_treatment_basis_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.sort_order, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    join public.appointments a          on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id = v_patient
      and a.treatment_basis_id = p_treatment_basis_id
      and c.item_kind <> 'absence_fee'
      and b.status = 'billable'
      and b.service_area = 'therapy'
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this treatment basis' using errcode = '22023';
  end if;

  return v_id;
end;
$$;

drop function public.list_invoice_candidates(integer);

CREATE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100) RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid, treatment_basis_id uuid, basis_kind text, basis_issued_on date, first_performed_on date, last_performed_on date, cancelled_invoice_id uuid, cancelled_invoice_number text, draft_replaces_invoice_number text, basis_released_at timestamp with time zone, absence_fee boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

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
         storno.id,
         storno.invoice_number,
         ersetzt.invoice_number,
         tb.billing_released_at,
         k.absence_fee
  from (
    select b.patient_id,
           b.training_relationship_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           date_trunc('month', min(b.performed_on))::date as period_month,
           case when c.item_kind = 'absence_fee' then null else a.treatment_basis_id end
             as treatment_basis_id,
           (c.item_kind = 'absence_fee') as absence_fee,
           min(b.performed_on) as erste,
           max(b.performed_on) as letzte,
           b.service_area,
           count(*)::integer as service_count,
           sum(app.billable_service_amount(b.id))::integer as total_cents,
           max(c.currency) as currency,
           array_agg(b.id) as leistungen
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    left join public.appointments a on a.id = b.appointment_id
    left join public.patients p on p.id = b.patient_id
    left join public.training_relationships t on t.id = b.training_relationship_id
    join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
    where b.organization_id = v_org
      and b.status = 'billable'
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, b.training_relationship_id,
             case when c.item_kind = 'absence_fee' then null else a.treatment_basis_id end,
             (c.item_kind = 'absence_fee'),
             case when a.treatment_basis_id is null or c.item_kind = 'absence_fee'
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
      and i.absence_fee = k.absence_fee
      and (k.treatment_basis_id is not null or i.period_month = k.period_month)
    limit 1
  ) entwurf on true
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
$$;

comment on function public.list_invoice_candidates(p_limit integer) is 'Was abzurechnen ist: je Person und Behandlungsgrundlage, ohne Grundlage je Person, Monat und Bereich, Ausfallhonorare je Person und Monat für sich (absence_fee, ADR-009 Punkt 25); mit Anzahl, Betrag, Zeitraum, stehendem Entwurf, offener Stornierung (ANN-321) und Freigabe der Verordnung (ANN-544). owner und office.';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant all on function public.list_invoice_candidates(integer) to authenticated;
