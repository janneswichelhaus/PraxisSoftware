-- =============================================================================
-- BEF-143: Eine stornierte Rechnung nennt so viele Positionen, wie sie
-- ausweist, und wartet nur auf eine Korrektur, die eine Zeile haette
-- (ADR-009 Punkte 9 und 10; Zweitreview BEF-128, H2)
--
-- Seit ABR-003c, ANG-006 und BEF-128 faellt mit einer zurueckgenommenen
-- Leistung auch ihre freigegebene Zeile auf der stornierten Rechnung.
-- `list_invoices` zaehlte die Positionen live ueber `invoice_items`: Die
-- stornierte Rechnung zeigte dann weniger oder null Positionen, der Betrag
-- kam weiter aus dem Snapshot. War es die einzige Leistung, bot die Rechnung
-- weiter "Korrekturrechnung erstellen" an, und `create_correction_draft`
-- meldete "no billable services".
--
-- Jetzt gilt:
--
--   * `list_invoices` zaehlt an ausgestellten Rechnungen (storniert
--     eingeschlossen) die Positionen des Snapshots - wie den Empfaenger seit
--     BEF-141. Der Entwurf zaehlt weiter live.
--   * Was eine Korrektur aufnimmt, steht an einer Stelle:
--     `app.correction_draft_services`, aus `create_correction_draft`
--     herausgezogen, ohne die Auswahl zu aendern (ANN-077, ABR-032, ANN-321).
--   * `get_invoice` liefert `correction_pending`: wahr nur, wenn die
--     stornierte Rechnung keine Korrektur hat und die Korrektur eine Zeile
--     haette. Die Oberflaeche bietet die Korrektur nur dann an. Kommt spaeter
--     eine Leistung derselben Klammer dazu, wartet das Storno wieder - wie
--     bisher (ANN-077).
--
-- Keine Spalte, keine Tabelle, kein Auditeintrag (ADR-010). Signaturen und
-- Rechte unveraendert; create or replace genuegt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Was die Korrektur einer stornierten Rechnung aufnimmt
--
-- Die Auswahl aus create_correction_draft (20261023100000_ux_008b_correction_path.sql)
-- unveraendert: die abrechenbaren Leistungen der Klammer der stornierten
-- Rechnung, die auf keiner nicht freigegebenen Zeile stehen und die keine
-- andere offene Stornierung haelt. Die Organisation kommt von der Rechnung;
-- die Aufrufer pruefen Recht und Zugehoerigkeit vorher.
-- -----------------------------------------------------------------------------
create function app.correction_draft_services(p_invoice_id uuid)
returns table (billable_service_id uuid, sort_order smallint)
language sql
stable
set search_path = ''
as $$
  select z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.invoices v_alt
    join public.billable_services b     on b.organization_id = v_alt.organization_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und damit keine Grundlage.
    left join public.appointments a     on a.id = b.appointment_id
    where v_alt.id = p_invoice_id
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      -- ABR-032: dieselbe Klammer wie die stornierte Rechnung - die Grundlage,
      -- ohne sie der Monat, und dann nur Leistungen ohne Grundlage (die
      -- gehoeren auf die Rechnung ihrer Verordnung).
      and (
        (v_alt.treatment_basis_id is not null and a.treatment_basis_id = v_alt.treatment_basis_id)
        or (v_alt.treatment_basis_id is null
            and a.treatment_basis_id is null
            and date_trunc('month', b.performed_on)::date = v_alt.period_month)
      )
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
      -- UX-008b: Leistungen, die eine andere offene Stornierung derselben
      -- Klammer haelt, gehoeren auf deren eigene Korrektur (ANN-321).
      and app.open_cancellation_holding_service(
            b.id, v_alt.patient_id, v_alt.training_relationship_id, v_alt.service_area,
            v_alt.treatment_basis_id, v_alt.period_month, p_invoice_id) is null
  ) z
$$;

comment on function app.correction_draft_services(uuid) is
  'BEF-143: die Leistungen, die die Korrektur dieser stornierten Rechnung aufnimmt, mit ihrer Reihenfolge (ANN-077, ABR-032, ANN-321). Die eine Stelle fuer create_correction_draft und correction_pending in get_invoice.';

revoke all on function app.correction_draft_services(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Korrektur nimmt, was die Hilfsfunktion nennt
--
-- Aus der geltenden Fassung (20261023100000_ux_008b_correction_path.sql)
-- uebernommen; neu ist nur die mit BEF-143 markierte Stelle.
-- -----------------------------------------------------------------------------
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

  -- BEF-143: Was die Korrektur aufnimmt, steht einmal in
  -- app.correction_draft_services - get_invoice fragt dort, ob es etwas gibt.
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
$function$;

comment on function public.create_correction_draft(uuid) is
  'Legt zu einer stornierten Rechnung den Entwurf der Korrekturrechnung an und verweist von ihm auf die ersetzte Rechnung (ABR-003c, ADR-009 Punkt 9, R3-009). Nimmt alle wieder freien Leistungen der Klammer der stornierten Rechnung auf (ANN-077, ABR-009, TRN-008, ABR-032) - seit UX-008b ohne die, die eine andere offene Stornierung haelt (ANN-321); die Auswahl steht seit BEF-143 in app.correction_draft_services. Sperrt die Rechnung, damit zwei gleichzeitige Aufrufe nicht im Unique-Index enden.';

-- -----------------------------------------------------------------------------
-- 3. Die Rechnung sagt, ob sie auf ihre Korrektur wartet
--
-- Aus der geltenden Fassung (20260923120000_abgewiesene_lesezugriffe_rest.sql)
-- uebernommen; neu ist nur der Schluessel correction_pending.
-- -----------------------------------------------------------------------------
create or replace function public.get_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_bezahlt  integer;
  v_storno   record;
  v_ersetzt  text;
  v_korrektur record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return null;
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Am Entwurf gibt es keinen Zahlungsstand: An ihm kann niemand zahlen.
  v_bezahlt := case when v_invoice.status = 'issued'
                    then app.invoice_paid_cents(p_invoice_id) else 0 end;

  -- Die Kette aus ABR-003c, in beide Richtungen lesbar: das Stornodokument
  -- zu dieser Rechnung, die Rechnung, die sie ersetzt, und die Korrektur, die
  -- sie ersetzt hat.
  select c.cancellation_number, c.reason, c.cancelled_on into v_storno
  from public.invoice_cancellations c
  where c.invoice_id = p_invoice_id;

  select i.invoice_number into v_ersetzt
  from public.invoices i
  where i.id = v_invoice.replaces_invoice_id;

  select i.id, i.invoice_number into v_korrektur
  from public.invoices i
  where i.replaces_invoice_id = p_invoice_id
  order by i.created_at
  limit 1;

  -- Die ausgestellte Rechnung zeigt ihren Snapshot und nicht die heutigen
  -- Stammdaten: Genau dafuer gibt es ihn (ADR-009 Punkt 10).
  return jsonb_build_object(
    'id', v_invoice.id,
    'status', v_invoice.status,
    'patient_id', v_invoice.patient_id,
    'recipient_id', v_invoice.recipient_id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'due_on', v_invoice.due_on,
    'paid_cents', v_bezahlt,
    'outstanding_cents', coalesce(v_invoice.total_cents, 0) - v_bezahlt,
    'payment_state', case when v_invoice.status = 'issued'
                          then app.invoice_payment_state(v_invoice.total_cents, v_bezahlt)
                          else 'unpaid' end,
    'overdue', (v_invoice.status = 'issued' and v_invoice.due_on < v_heute
                and v_bezahlt < v_invoice.total_cents
                and v_storno is null),
    'cancellation', case when v_storno is null then null else
      jsonb_build_object('cancellation_number', v_storno.cancellation_number,
                         'reason', v_storno.reason,
                         'cancelled_on', v_storno.cancelled_on)
    end,
    'replaces_invoice_id', v_invoice.replaces_invoice_id,
    'replaces_invoice_number', v_ersetzt,
    'correction_invoice_id', v_korrektur.id,
    'correction_invoice_number', v_korrektur.invoice_number,
    -- BEF-143: Wartet die stornierte Rechnung auf ihre Korrektur? Nur, wenn
    -- noch keine besteht und die Korrektur eine Zeile haette. Fiel die
    -- einzige Leistung nach dem Storno weg, ist das Storno abgeschlossen
    -- (ADR-009 Punkt 9: "gegebenenfalls eine neue Rechnung").
    'correction_pending', (v_storno.cancellation_number is not null and v_korrektur.id is null
                           and exists (select 1 from app.correction_draft_services(p_invoice_id))),
    'document', coalesce(v_invoice.snapshot, app.build_invoice_document(p_invoice_id))
  );
end;
$function$;

comment on function public.get_invoice(uuid) is
  'Eine Rechnung der Praxis mit Zahlungsstand, Storno- und Korrekturkette (ABR-003c) und ihrem Dokument - ausgestellt aus dem Snapshot (ADR-009 Punkt 10). correction_pending: Die stornierte Rechnung hat keine Korrektur, und die Korrektur haette eine Zeile (BEF-143). Nur fuer can_read_invoicing.';

-- -----------------------------------------------------------------------------
-- 4. Die Rechnungsliste zaehlt die Positionen ausgestellter Rechnungen aus
--    dem Snapshot
--
-- Aus der geltenden Fassung (20261027100000_bef_141_empfaenger_aus_snapshot.sql)
-- uebernommen; neu ist nur die mit BEF-143 markierte Spalte.
-- -----------------------------------------------------------------------------
create or replace function public.list_invoices(
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
           -- BEF-141: Ausgestellt (auch storniert) heisst der Empfaenger,
           -- wie er auf dem Blatt steht; nur der Entwurf liest live.
           app.invoice_recipient_name(i.status, i.snapshot, r.name) as empfaenger_name,
           case when i.status = 'issued'
                then coalesce(i.snapshot -> 'recipient' ->> 'kind', r.recipient_kind)
                else r.recipient_kind end as empfaenger_art,
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
            -- Offen heisst, was `app.open_invoices` offen nennt - die Regel
            -- steht dort einmal (Zweitreview ABR-033).
            when 'open'      then g.id in (select o.invoice_id from app.open_invoices(v_org) o)
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
         -- BEF-143: Ausgestellt (auch storniert) zaehlt der Snapshot - faellt
         -- nach einem Storno eine Leistung mit ihrer Zeile, steht sie dort
         -- weiter, wie auf dem Blatt. Nur der Entwurf zaehlt live.
         case when i.status = 'issued'
              then jsonb_array_length(coalesce(i.snapshot -> 'items', '[]'::jsonb))
              else summe.anzahl::integer end,
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
  'Rechnungen der Praxis mit Suche (Nummer, Name, Empfaenger), Filter (draft, open, overdue, paid, cancelled; Monat) und Blaettern; total_count nennt die Treffer vor dem Kuerzen (ABR-033, BEF-061); bei ausgestellten Rechnungen Empfaenger (BEF-141) und Zahl der Positionen (BEF-143) aus dem Snapshot. Nur fuer can_read_invoicing.';

revoke all on function public.list_invoices(integer, integer, text, text, date) from public, anon;
grant execute on function public.list_invoices(integer, integer, text, text, date) to authenticated;
