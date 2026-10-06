-- =============================================================================
-- ABR-033: Rechnungsliste mit Suche, Filter, Blaettern und Gesamtzahl
-- (BEF-061 Option 1 und 3, Entscheidung Jannes 2026-10-05; ADR-009)
--
-- Bis hierher lieferten `list_invoices`, `list_open_items` und `list_payments`
-- hoechstens 100 Zeilen, ohne zu sagen, dass gekuerzt war. Ab der 101.
-- Rechnung verschwanden die aeltesten still - Nachdruck, Storno oder das
-- Zuordnen eines Zahlungseingangs ueber die Nummer wurden zur Suche von Hand.
--
--   * `list_invoices(p_limit, p_offset, p_search, p_status, p_month)`:
--     Suche nach Nummer, Name der Person oder der Empfaenger:in (Teilstring,
--     ohne Platzhalter - `%` und `_` sind gewoehnliche Zeichen), Filter nach
--     Zustand (`draft`, `open`, `overdue`, `paid`, `cancelled`) und Monat,
--     Blaettern ueber `p_offset`. Jede Zeile traegt `total_count`: wie viele
--     Rechnungen auf Suche und Filter passen, vor dem Kuerzen.
--   * `list_open_items` und `list_payments`: `total_count` ebenso; die
--     Zahlungen dazu `p_offset`.
--
-- Rechte und Abweisung bleiben wie bisher: `app.can_read_invoicing()`, sonst
-- null Zeilen und ein denied-Eintrag (G6b). Die neuen Signaturen ersetzen die
-- alten (drop/create): PostgREST soll keine zwei Fassungen zur Auswahl haben.
-- Reihenfolge, Spalten und Rechenwege sind die der letzten Fassung
-- (ABR-032, TRN-008); neu ist nur die Auswahl davor.
-- =============================================================================

drop function public.list_invoices(integer);

create function public.list_invoices(
  p_limit  integer default 100,
  p_offset integer default 0,
  p_search text    default null,
  p_status text    default null,
  p_month  date    default null
)
returns table (
  id uuid, status text, invoice_number text, period_month date, service_area text,
  issued_on date, due_on date, patient_id uuid, training_relationship_id uuid,
  patient_name text, recipient_name text, recipient_kind text, total_cents integer,
  currency text, item_count integer, paid_cents integer, outstanding_cents integer,
  payment_state text, overdue boolean, cancelled boolean, treatment_basis_id uuid,
  basis_kind text, basis_issued_on date, total_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
  v_suche    text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  if p_status is not null and p_status not in ('draft', 'open', 'overdue', 'paid', 'cancelled') then
    raise exception 'unknown invoice filter' using errcode = '22023';
  end if;
  if v_suche is not null and length(v_suche) > 100 then
    raise exception 'search too long' using errcode = '22023';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  with basis as (
    -- Was Suche und Filter brauchen: Name, Empfaenger, Zahlungsstand, Storno.
    select i.*,
           pe.given_name || ' ' || pe.family_name as person_name,
           r.name as empfaenger_name,
           r.recipient_kind as empfaenger_art,
           coalesce(zahlung.bezahlt, 0) as bezahlt,
           exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
             as storniert
    from public.invoices i
    left join public.patients pa on pa.id = i.patient_id
    left join public.training_relationships t on t.id = i.training_relationship_id
    join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
    left join public.invoice_recipients r on r.id = i.recipient_id
    left join lateral (
      select sum(case when p.direction = 'incoming' then p.amount_cents
                      else -p.amount_cents end)::integer as bezahlt
      from public.payments p
      where p.invoice_id = i.id
        and p.voided_at is null
    ) zahlung on true
    where i.organization_id = v_org
      and (p_month is null or i.period_month = date_trunc('month', p_month)::date)
  ),
  gefiltert as (
    select b.*,
           (b.status = 'issued' and b.due_on < v_heute
            and b.bezahlt < b.total_cents and not b.storniert) as ueberfaellig
    from basis b
    where (v_suche is null
           or strpos(lower(coalesce(b.invoice_number, '')), v_suche) > 0
           or strpos(lower(b.person_name), v_suche) > 0
           or strpos(lower(coalesce(b.empfaenger_name, '')), v_suche) > 0)
  ),
  auswahl as (
    select g.*, count(*) over ()::integer as gesamt
    from gefiltert g
    where case p_status
            when 'draft'     then g.status = 'draft'
            when 'open'      then g.status = 'issued' and not g.storniert
                                  and g.bezahlt < g.total_cents
            when 'overdue'   then g.ueberfaellig
            when 'paid'      then g.status = 'issued' and not g.storniert
                                  and g.bezahlt >= g.total_cents
            when 'cancelled' then g.storniert
            else true
          end
    order by g.status, g.period_month desc, g.invoice_number desc nulls first, g.id
    limit greatest(least(coalesce(p_limit, 100), 200), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select i.id, i.status, i.invoice_number, i.period_month, i.service_area, i.issued_on, i.due_on,
         i.patient_id,
         i.training_relationship_id,
         i.person_name,
         coalesce(i.empfaenger_name, i.person_name),
         coalesce(i.empfaenger_art, 'self'),
         -- Der Entwurf rechnet live, die ausgestellte Rechnung zeigt ihren
         -- festgeschriebenen Betrag (ADR-009 Punkt 10).
         coalesce(i.total_cents, summe.brutto)::integer,
         coalesce(i.currency, summe.currency),
         summe.anzahl::integer,
         case when i.status = 'issued' then i.bezahlt else 0 end,
         case when i.status = 'issued' then i.total_cents - i.bezahlt else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, i.bezahlt)
              else 'unpaid' end,
         i.ueberfaellig,
         i.storniert,
         -- ABR-032: die Verordnung als Klammer der Rechnung.
         i.treatment_basis_id,
         tb.treatment_basis_kind,
         tb.issued_on,
         i.gesamt
  from auswahl i
  left join public.treatment_bases tb on tb.id = i.treatment_basis_id
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
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id;
end;
$$;

comment on function public.list_invoices(integer, integer, text, text, date) is
  'Rechnungen der Praxis mit Suche (Nummer, Name, Empfaenger), Filter (draft, open, overdue, paid, cancelled; Monat) und Blaettern; total_count nennt die Treffer vor dem Kuerzen (ABR-033, BEF-061). Nur fuer can_read_invoicing.';

revoke all on function public.list_invoices(integer, integer, text, text, date) from public, anon;
grant execute on function public.list_invoices(integer, integer, text, text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Offene Posten: dieselbe Liste, dazu die Gesamtzahl
-- -----------------------------------------------------------------------------
drop function public.list_open_items(integer);

create function public.list_open_items(p_limit integer default 100)
returns table (
  id uuid, invoice_number text, patient_id uuid, training_relationship_id uuid,
  service_area text, patient_name text, recipient_name text, period_month date,
  issued_on date, due_on date, total_cents integer, paid_cents integer,
  outstanding_cents integer, currency text, overdue boolean, open_total_cents integer,
  total_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
         sum(offen.outstanding_cents) over ()::integer,
         count(*) over ()::integer
  from app.open_invoices(v_org) offen
  join public.invoices i  on i.id = offen.invoice_id
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  order by i.due_on, i.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_open_items(integer) is
  'Offene Posten der Praxis, faellig zuerst; open_total_cents und total_count ueber alle offenen Posten vor dem Kuerzen (ABR-033, BEF-061).';

revoke all on function public.list_open_items(integer) from public, anon;
grant execute on function public.list_open_items(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Zahlungen: Gesamtzahl und Blaettern
-- -----------------------------------------------------------------------------
drop function public.list_payments(integer);

create function public.list_payments(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, invoice_id uuid, invoice_number text, patient_name text, recipient_name text,
  direction text, amount_cents integer, currency text, paid_on date, method text,
  note text, voided_at timestamptz, void_reason text, total_count integer
)
language plpgsql
volatile
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

  return query
  select p.id, p.invoice_id, i.invoice_number,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         p.direction, p.amount_cents, p.currency, p.paid_on, p.method,
         p.note, p.voided_at, p.void_reason,
         count(*) over ()::integer
  from public.payments p
  join public.invoices  i  on i.id = p.invoice_id
  -- TRN-008: der Name aus dem Verhaeltnis der Rechnung.
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  where p.organization_id = v_org
  order by p.paid_on desc, p.created_at desc, p.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.list_payments(integer, integer) is
  'Zahlungen der Praxis, neueste zuerst, mit Blaettern; total_count vor dem Kuerzen (ABR-033, BEF-061).';

revoke all on function public.list_payments(integer, integer) from public, anon;
grant execute on function public.list_payments(integer, integer) to authenticated;
