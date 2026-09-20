-- =============================================================================
-- R3-016: Die Zahlungssumme entsteht einmal je Rechnung, nicht je Zeile
--
-- `app.invoice_paid_cents` ist eine SQL-Funktion mit `security definer` und
-- laesst sich deshalb nicht in die umgebende Abfrage hineinziehen. In
-- `list_open_items` stand sie zweimal je Zeile, in `list_invoices` viermal -
-- und beide rufen sie **vor** dem `limit` ueber den ganzen Bestand auf. Die
-- Laufzeit waechst damit linear mit der Zahl der Rechnungen, obwohl hoechstens
-- 200 Zeilen herauskommen.
--
-- Beide Listen bekommen deshalb die Summe einmal je Rechnung - aber auf
-- verschiedenen Wegen, weil sie Verschiedenes brauchen:
--
--   * `list_open_items` braucht sie fuer **jede** ausgestellte Rechnung: Es
--     filtert danach (offener Betrag > 0) und liefert mit
--     `open_total_cents` die Summe ueber alle offenen Posten. Dort steht sie
--     als ein gruppierter Left Join ueber die Zahlungen.
--   * `list_invoices` braucht sie nur fuer die gelieferten Zeilen: Auswahl
--     und Reihenfolge haengen allein an Spalten der Rechnung. Dort wird
--     zuerst begrenzt und danach angereichert; die Summe kommt per Lateral
--     fuer hoechstens 200 Rechnungen.
--
-- Gemessen im Testcluster (PostgreSQL 16, 20 002 Rechnungen, 60 003
-- Zahlungen, Rolle office, je drei Laeufe):
--
--   list_open_items(200)  vorher 391 / 370 / 376 ms   nachher 64 / 54 / 56 ms
--   list_invoices(200)    vorher 696 / 468 / 457 ms   nachher 46 / 44 / 43 ms
--
-- Die Rechnung selbst bleibt Wort fuer Wort dieselbe: Eingaenge minus
-- Rueckzahlungen, stornierte Zahlungen ausgenommen.
-- `app.invoice_paid_cents` bleibt unveraendert - fuer den Einzelaufruf an
-- einer Rechnung (get_invoice, create_payment_reminder) ist sie die richtige
-- Form und die eine Stelle, an der die Summe definiert ist.
--
-- Uebernommen aus 20260919170000_invoice_cancellations.sql, Abschnitte 9d und
-- 9e.
-- =============================================================================

create or replace function public.list_open_items(p_limit integer default 100)
returns table (
  id                uuid,
  invoice_number    text,
  patient_id        uuid,
  patient_name      text,
  recipient_name    text,
  period_month      date,
  issued_on         date,
  due_on            date,
  total_cents       integer,
  paid_cents        integer,
  outstanding_cents integer,
  currency          text,
  overdue           boolean,
  open_total_cents  integer
)
language plpgsql
stable
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
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  select offen.id, offen.invoice_number, offen.patient_id, offen.patient_name,
         offen.recipient_name, offen.period_month, offen.issued_on, offen.due_on,
         offen.total_cents, offen.paid_cents, offen.outstanding_cents,
         offen.currency,
         (offen.due_on < v_heute),
         sum(offen.outstanding_cents) over ()::integer
  from (
    select i.id, i.invoice_number, i.patient_id,
           pe.given_name || ' ' || pe.family_name as patient_name,
           coalesce(r.name, pe.given_name || ' ' || pe.family_name) as recipient_name,
           i.period_month, i.issued_on, i.due_on,
           i.total_cents,
           coalesce(zahlung.bezahlt, 0) as paid_cents,
           (i.total_cents - coalesce(zahlung.bezahlt, 0)) as outstanding_cents,
           i.currency
    from public.invoices i
    join public.patients pa on pa.id = i.patient_id
    join public.persons  pe on pe.id = pa.person_id
    left join public.invoice_recipients r on r.id = i.recipient_id
    -- Die Zahlungssumme einmal je Rechnung statt zweimal je Zeile ueber den
    -- ganzen Bestand (R3-016). Dieselbe Rechnung wie app.invoice_paid_cents,
    -- nur einmal gruppiert statt Zeile fuer Zeile aufgerufen.
    left join (
      select p.invoice_id,
             sum(case when p.direction = 'incoming' then p.amount_cents
                      else -p.amount_cents end)::integer as bezahlt
      from public.payments p
      where p.voided_at is null
      group by p.invoice_id
    ) zahlung on zahlung.invoice_id = i.id
    where i.organization_id = v_org
      and i.status = 'issued'
      -- Eine stornierte Rechnung ist keine Forderung mehr (ABR-003c).
      and not exists (
        select 1 from public.invoice_cancellations c where c.invoice_id = i.id
      )
  ) offen
  where offen.outstanding_cents > 0
  order by offen.due_on, offen.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_open_items(integer) is
  'Ausgestellte Rechnungen mit offenem Betrag, aelteste Faelligkeit zuerst (ABR-004), stornierte ausgenommen (ABR-003c). open_total_cents traegt die Summe ueber ALLE offenen Posten, nicht nur ueber die gelieferten Zeilen. Die Zahlungssumme entsteht einmal je Rechnung (R3-016).';

revoke all on function public.list_open_items(integer) from public, anon;
grant execute on function public.list_open_items(integer) to authenticated;

create or replace function public.list_invoices(p_limit integer default 100)
returns table (
  id                uuid,
  status            text,
  invoice_number    text,
  period_month      date,
  issued_on         date,
  due_on            date,
  patient_id        uuid,
  patient_name      text,
  recipient_name    text,
  recipient_kind    text,
  total_cents       integer,
  currency          text,
  item_count        integer,
  paid_cents        integer,
  outstanding_cents integer,
  payment_state     text,
  overdue           boolean,
  cancelled         boolean
)
language plpgsql
stable
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
    raise exception 'not allowed to read invoices' using errcode = '42501';
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
  select i.id, i.status, i.invoice_number, i.period_month, i.issued_on, i.due_on,
         i.patient_id,
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
  join public.patients p  on p.id = i.patient_id
  join public.persons  pe on pe.id = p.person_id
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
$$;

comment on function public.list_invoices(integer) is
  'Rechnungen der Praxis mit Zustand, Nummer, Empfaenger, Betrag, Zahlungsstand und Storno (ABR-003, ABR-004, ABR-003c). Ein Entwurf rechnet live, eine ausgestellte Rechnung zeigt ihren festgeschriebenen Betrag; Zahlungsstand und Storno sind abgeleitet und nirgends gepflegt (ADR-009 Punkt 12, ANN-079). Die Zahlungssumme entsteht einmal je Rechnung (R3-016).';

revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;
