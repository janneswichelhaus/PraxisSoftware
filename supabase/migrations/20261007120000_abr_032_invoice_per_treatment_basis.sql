-- =============================================================================
-- ABR-032 (ABR-EPIC-007, BEF-099): Eine Rechnung je Behandlungsgrundlage,
-- Einzelpositionen je Heilmittel mit ihren Behandlungstagen
--
-- ADR-009 Fassung 5 Punkt 23 (B17, Entscheidung Jannes 2026-10-05):
-- Beihilfe und private Krankenversicherung erstatten Heilmittel je Leistung
-- und nur mit Verordnung. Deshalb
--
--   * fasst eine Rechnung die Leistungen **einer Behandlungsgrundlage**
--     zusammen (je Verordnung) statt eines Kalendermonats (ANN-077
--     Fassung 2). Leistungen an Terminen ohne Grundlage bleiben beim Monat;
--   * traegt das Dokument (schema_version 5) den Leistungszeitraum und je
--     Zeile, ob sie ein Anteil am Terminhonorar ist. Die Darstellung fasst
--     gleiche Positionen mit ihren Behandlungstagen zusammen; die Betraege
--     kommen unveraendert aus app.billable_service_amount (ABR-031).
--
-- Verordnung, verordnende Aerzt:in und Diagnose stehen seit schema_version 4
-- im Dokument (ANN-229). Ausgestellte Rechnungen behalten ihren Snapshot.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Grundlage an der Rechnung
-- -----------------------------------------------------------------------------
alter table public.invoices
  add column treatment_basis_id uuid references public.treatment_bases (id) on delete restrict;

alter table public.invoices
  add constraint invoices_basis_only_therapy check (
    treatment_basis_id is null or service_area = 'therapy'
  );

comment on column public.invoices.treatment_basis_id is
  'Die Behandlungsgrundlage, deren Leistungen diese Rechnung zusammenfasst (ABR-032, ADR-009 Punkt 23, ANN-077 Fassung 2). null: Leistungen an Terminen ohne Grundlage, gebuendelt nach Kalendermonat, oder Training. period_month nennt bei einer Grundlage den Monat der ersten Leistung.';

create index invoices_treatment_basis_idx
  on public.invoices (treatment_basis_id) where treatment_basis_id is not null;

-- Je Grundlage hoechstens ein Entwurf; je Person, Monat und Bereich hoechstens
-- einer fuer Leistungen ohne Grundlage.
drop index public.invoices_draft_period_key;
create unique index invoices_draft_period_key
  on public.invoices (patient_id, period_month, service_area)
  where status = 'draft' and treatment_basis_id is null;
create unique index invoices_draft_basis_key
  on public.invoices (treatment_basis_id)
  where status = 'draft' and treatment_basis_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Passen die Zeilen zur Klammer der Rechnung?
--
-- Ein Termin kann nach dem Anlegen des Entwurfs auf eine andere Grundlage
-- uebertragen werden (CAL-022). Ausgestellt wird dann nicht: Die Rechnung
-- naennte eine Verordnung, zu der eine Zeile nicht gehoert. Der Entwurf ist
-- zu verwerfen und neu anzulegen.
-- -----------------------------------------------------------------------------
create or replace function app.assert_invoice_items_match_basis(p_invoice_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_basis   uuid;
  v_bereich text;
begin
  select i.treatment_basis_id, i.service_area into v_basis, v_bereich
  from public.invoices i where i.id = p_invoice_id;

  if v_bereich <> 'therapy' then
    return;
  end if;

  if exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    join public.appointments a      on a.id = b.appointment_id
    where it.invoice_id = p_invoice_id
      and a.treatment_basis_id is distinct from v_basis
  ) then
    raise exception 'invoice items do not belong to the treatment basis of the invoice'
      using errcode = '23514';
  end if;
end;
$$;

comment on function app.assert_invoice_items_match_basis(uuid) is
  'Weist das Ausstellen ab, wenn eine Zeile nicht (mehr) zur Behandlungsgrundlage der Rechnung gehoert (ABR-032). Aufgerufen aus issue_invoice.';

revoke all on function app.assert_invoice_items_match_basis(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Der Entwurf je Grundlage
-- -----------------------------------------------------------------------------
create or replace function public.create_invoice_draft_for_basis(p_treatment_basis_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Der Monat der ersten offenen Leistung: period_month bleibt Pflicht und
  -- nennt in Listen den Beginn.
  select date_trunc('month', min(b.performed_on))::date into v_monat
  from public.billable_services b
  join public.appointments a on a.id = b.appointment_id
  where b.organization_id = v_org
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

  -- Die Vorgabe aus den Stammdaten; ohne sie geht die Rechnung an die
  -- Patientin selbst (ANN-076).
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

comment on function public.create_invoice_draft_for_basis(uuid) is
  'Legt den Rechnungsentwurf ueber alle offenen Leistungen der Termine einer Behandlungsgrundlage an (ABR-032, ADR-009 Punkt 23, ANN-077 Fassung 2). owner und office; je Grundlage hoechstens ein Entwurf.';

revoke all on function public.create_invoice_draft_for_basis(uuid) from public, anon;
grant execute on function public.create_invoice_draft_for_basis(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Bestandsfunktionen
--
-- Wortgleich aus dem geltenden Stand uebernommen; geaendert sind nur die mit
-- ABR-032 markierten Stellen.
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

  -- ABR-032: Leistungen an Terminen mit Grundlage gehoeren auf die Rechnung
  -- ihrer Grundlage (create_invoice_draft_for_basis); der Monat buendelt nur
  -- noch, was keine hat.
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
    join public.appointments a          on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and a.treatment_basis_id is null
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
$function$;

drop function public.list_invoice_candidates(integer);

CREATE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid, treatment_basis_id uuid, basis_kind text, basis_issued_on date, first_performed_on date, last_performed_on date)
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
         k.letzte
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
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    join public.appointments a on a.id = b.appointment_id
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
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

comment on function public.list_invoice_candidates(integer) is
  'Was abzurechnen ist (ABR-003, ABR-032): je Person und Behandlungsgrundlage, ohne Grundlage je Person, Monat und Bereich, mit Anzahl, Betrag, Zeitraum und einem schon stehenden Entwurf. owner und office.';
revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.create_correction_draft(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- ABR-032: dieselbe Klammer - die Grundlage, ohne sie der Monat.
      and i.treatment_basis_id is not distinct from v_alt.treatment_basis_id
      and (v_alt.treatment_basis_id is not null or i.period_month = v_alt.period_month)
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, training_relationship_id, recipient_id, period_month,
    service_area, replaces_invoice_id, treatment_basis_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.training_relationship_id, v_alt.recipient_id,
          v_alt.period_month, v_alt.service_area, p_invoice_id, v_alt.treatment_basis_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    join public.appointments a          on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      -- ABR-032: dieselbe Klammer wie die stornierte Rechnung. Eine Rechnung
      -- aus der Zeit vor ABR-032 hat keine Grundlage und bleibt beim Monat.
      and (
        (v_alt.treatment_basis_id is not null and a.treatment_basis_id = v_alt.treatment_basis_id)
        or (v_alt.treatment_basis_id is null
            and date_trunc('month', b.performed_on)::date = v_alt.period_month)
      )
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
$function$;

drop function public.list_invoices(integer);

CREATE FUNCTION public.list_invoices(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, status text, invoice_number text, period_month date, service_area text, issued_on date, due_on date, patient_id uuid, training_relationship_id uuid, patient_name text, recipient_name text, recipient_kind text, total_cents integer, currency text, item_count integer, paid_cents integer, outstanding_cents integer, payment_state text, overdue boolean, cancelled boolean, treatment_basis_id uuid, basis_kind text, basis_issued_on date)
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
         exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id),
         -- ABR-032: die Verordnung als Klammer der Rechnung.
         i.treatment_basis_id,
         tb.treatment_basis_kind,
         tb.issued_on
  from auswahl i
  left join public.treatment_bases tb on tb.id = i.treatment_basis_id
  -- TRN-008: der Name aus dem Verhaeltnis der Rechnung, nie aus der Akte
  -- einer Trainingsrechnung.
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  left join lateral (
    -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
    select sum(app.billable_service_amount(b.id)) as brutto,
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
  'Rechnungen mit Empfaenger, Betrag, Zahlungsstand und seit ABR-032 ihrer Behandlungsgrundlage (ABR-003, ABR-004). owner und office.';
revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;

CREATE OR REPLACE FUNCTION app.patient_merge_plan(p_organization_id uuid, p_source uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quelle     record;
  v_ziel       record;
  v_konflikte  text[] := '{}';
  v_angehaengt text[] := '{}';
  v_sperren    text[] := '{}';
  v_zaehler    jsonb;
  v_text       text;
  v_feld       text;
begin
  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work, c.fax,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_quelle
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_source and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work, c.fax,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_ziel
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_target and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Felder, in denen beide Akten etwas anderes tragen: Die bleibende gewinnt,
  -- die Vorschau zeigt beide (ANN-147). Die Anschrift zaehlt als ein Feld.
  foreach v_feld in array array[
    'given_name', 'family_name', 'date_of_birth', 'email', 'phone', 'phone_mobile',
    'phone_work', 'fax', 'institution', 'primary_therapist_staff_member_id',
    'treatment_table_required'
  ] loop
    if (to_jsonb(v_quelle) ->> v_feld) is not null
       and (to_jsonb(v_ziel) ->> v_feld) is not null
       and lower(btrim(to_jsonb(v_quelle) ->> v_feld)) <> lower(btrim(to_jsonb(v_ziel) ->> v_feld)) then
      v_konflikte := v_konflikte || v_feld;
    end if;
  end loop;

  if coalesce(v_quelle.street, v_quelle.house_number, v_quelle.postal_code, v_quelle.city) is not null
     and coalesce(v_ziel.street, v_ziel.house_number, v_ziel.postal_code, v_ziel.city) is not null
     and row(lower(v_quelle.street), lower(v_quelle.house_number), v_quelle.postal_code, lower(v_quelle.city))
         is distinct from
         row(lower(v_ziel.street), lower(v_ziel.house_number), v_ziel.postal_code, lower(v_ziel.city)) then
    v_konflikte := v_konflikte || 'address'::text;
  end if;

  -- Freitexte: angehaengt, nie verworfen - aber nie ueber die Grenze der
  -- Spalte hinaus gekuerzt. Dann sperrt der Vorgang (ANN-149).
  v_text := app.merge_note(v_ziel.home_visit_access_note, v_quelle.home_visit_access_note);
  if v_text is distinct from v_ziel.home_visit_access_note and v_ziel.home_visit_access_note is not null then
    v_angehaengt := v_angehaengt || 'home_visit_access_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.special_note, v_quelle.special_note);
  if v_text is distinct from v_ziel.special_note and v_ziel.special_note is not null then
    v_angehaengt := v_angehaengt || 'special_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.remark, v_quelle.remark);
  if v_text is distinct from v_ziel.remark and v_ziel.remark is not null then
    v_angehaengt := v_angehaengt || 'remark'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 2000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  if not app.take_along_items_valid(
    app.merge_take_along(v_ziel.take_along_items, v_quelle.take_along_items)
  ) then
    v_sperren := v_sperren || 'take_along_too_many'::text;
  end if;

  -- Ein Konto an der Dublette: Es verloere seine Akte. Das klaert die Praxis
  -- vorher, nicht der Vorgang (ANN-149).
  if exists (
    select 1 from public.user_profiles up where up.person_id = v_quelle.person_id
  ) then
    v_sperren := v_sperren || 'source_has_account'::text;
  end if;

  -- Zwei Entwuerfe fuer denselben Monat und Bereich: Einer muss vorher weg.
  if exists (
    select 1
    from public.invoices q
    join public.invoices z
      on z.patient_id = p_target
     and z.status = 'draft'
     and z.period_month = q.period_month
     and z.service_area = q.service_area
     -- ABR-032: Entwuerfe je Grundlage stossen nicht zusammen - die
     -- Grundlagen bleiben verschieden.
     and z.treatment_basis_id is null
    where q.patient_id = p_source
      and q.status = 'draft'
      and q.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'draft_invoice_overlap'::text;
  end if;

  -- Zwei offene Eintraege ohne Grundlage auf der Warteliste. Mit Grundlage
  -- koennen sie nicht zusammenstossen: Die Grundlagen wandern mit.
  if exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_source and w.status = 'open' and w.treatment_basis_id is null
  ) and exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_target and w.status = 'open' and w.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'open_waitlist_overlap'::text;
  end if;

  -- ABR-030: Zwei Honorarvereinbarungen ab demselben Tag haetten keine
  -- Antwort auf die Frage, welche gilt.
  if exists (
    select 1
    from public.patient_fee_agreements q
    join public.patient_fee_agreements z on z.valid_from = q.valid_from
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'fee_agreement_overlap'::text;
  end if;

  v_zaehler := jsonb_build_object(
    'appointments',
      (select count(*) from public.appointments a where a.patient_id = p_source),
    'treatment_notes',
      (select count(*) from public.treatment_notes n
         join public.appointments a on a.id = n.appointment_id
        where a.patient_id = p_source),
    'treatment_bases',
      (select count(*) from public.treatment_bases b where b.patient_id = p_source),
    'billable_services',
      (select count(*) from public.billable_services s where s.patient_id = p_source),
    'invoices',
      (select count(*) from public.invoices i where i.patient_id = p_source),
    'invoices_issued',
      (select count(*) from public.invoices i where i.patient_id = p_source and i.status = 'issued'),
    'invoice_recipients',
      (select count(*) from public.invoice_recipients r where r.patient_id = p_source),
    'fee_agreements',
      (select count(*) from public.patient_fee_agreements f where f.patient_id = p_source),
    'patient_files',
      (select count(*) from public.patient_files f where f.patient_id = p_source),
    'privacy_records',
      (select count(*) from public.patient_privacy_records r where r.patient_id = p_source),
    'questionnaire_responses',
      (select count(*) from public.patient_questionnaire_responses r where r.patient_id = p_source),
    'course_events',
      (select count(*) from public.patient_course_events e where e.patient_id = p_source),
    'therapy_reports',
      (select count(*) from public.therapy_reports r where r.patient_id = p_source),
    'tasks',
      (select count(*) from public.tasks t where t.patient_id = p_source),
    'waitlist_entries',
      (select count(*) from public.waitlist_entries w where w.patient_id = p_source),
    'legal_holds',
      (select count(*) from public.legal_holds h
        where h.subject_type = 'patient' and h.subject_id = p_source)
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_quelle.id, 'given_name', v_quelle.given_name, 'family_name', v_quelle.family_name,
      'date_of_birth', v_quelle.date_of_birth, 'status', v_quelle.status,
      'care_concluded_on', v_quelle.care_concluded_on
    ),
    'target', jsonb_build_object(
      'id', v_ziel.id, 'given_name', v_ziel.given_name, 'family_name', v_ziel.family_name,
      'date_of_birth', v_ziel.date_of_birth, 'status', v_ziel.status,
      'care_concluded_on', v_ziel.care_concluded_on
    ),
    'counts', v_zaehler,
    'conflicts', to_jsonb(v_konflikte),
    'appended', to_jsonb(v_angehaengt),
    'blockers', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_sperren) x)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_nummer   text;
  v_prefix   text;
  v_frist    smallint;
  v_dokument jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is already issued' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.payment_term_days into v_frist
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  -- Ohne Absender keine Rechnung. Der Hinweis nennt die Luecke, damit die
  -- Oberflaeche nicht raten muss, was fehlt (ADR-009 Punkt 10).
  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Das Kuerzel des Kreises, in den diese Rechnung gehoert (ABR-010).
  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  -- ABR-032: Jede Zeile gehoert zur Grundlage der Rechnung.
  perform app.assert_invoice_items_match_basis(p_invoice_id);

  v_dokument := app.build_invoice_document(p_invoice_id);

  -- Der Par. 14c-Riegel (ABR-007, ADR-009 Punkt 18). Er steht hier und nicht
  -- in der Oberflaeche, weil die Steuerschuld mit dem **Ausweis** entsteht -
  -- nicht mit der Zahlung und nicht mit der Absicht. Was einmal falsch
  -- draufsteht, kostet ein Storno (Punkt 9).
  perform app.assert_invoice_tax_lawful(v_dokument);
  -- ABN-020 (BEF-111): keine Rechnung ohne vollstaendige Empfaengeranschrift.
  perform app.assert_invoice_recipient_address(v_dokument -> 'recipient');

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  -- Der Snapshot traegt Nummer und Daten mit: Er ist das Dokument, nicht ein
  -- Teil davon (ADR-009 Punkt 11).
  v_dokument := v_dokument || jsonb_build_object(
    'invoice_number', v_nummer,
    'issued_on', v_heute,
    'due_on', v_heute + v_frist::integer
  );

  update public.invoices
     set status          = 'issued',
         invoice_number  = v_nummer,
         issued_on       = v_heute,
         issued_at       = now(),
         issued_by       = v_actor,
         due_on          = v_heute + v_frist::integer,
         total_cents     = (v_dokument -> 'totals' ->> 'total_cents')::integer,
         tax_total_cents = (v_dokument -> 'totals' ->> 'tax_total_cents')::integer,
         currency        = v_dokument ->> 'currency',
         snapshot        = v_dokument
   where id = p_invoice_id;

  -- Die Leistung ist ab jetzt abgerechnet; ihr Entfernen laeuft nur noch ueber
  -- Storno (ADR-009 Punkt 9).
  update public.billable_services b
     set status = 'invoiced'
   where b.id in (select it.billable_service_id
                  from public.invoice_items it
                  where it.invoice_id = p_invoice_id);


  return v_nummer;
end;
$function$;

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
                                  ) and c.remedy is not null
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
    'schema_version', 5,
    'period_month', v_invoice.period_month,
    -- ABR-032: der erste und der letzte Leistungstag der Rechnung.
    'service_period', (
      select jsonb_build_object('from', min(b.performed_on), 'to', max(b.performed_on))
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
