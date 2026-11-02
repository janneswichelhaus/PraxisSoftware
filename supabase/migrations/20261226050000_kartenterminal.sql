-- Kartenzahlung beim Hausbesuch hinter einem Adapter (ANN-837): die Kennung des Terminals an der
-- Zahlung, eine Vorprüfung vor dem Terminal und das Buchen danach, beides mit dem Token der Person.

alter table public.payments add column terminal_transaction text;

alter table public.payments add constraint payments_terminal_transaction_check
  check (terminal_transaction is null
         or (method = 'card' and terminal_transaction ~ '^[A-Za-z0-9._:-]{1,100}$'));

create unique index payments_terminal_transaction_key
  on public.payments (organization_id, terminal_transaction)
  where terminal_transaction is not null;

comment on column public.payments.terminal_transaction is
  'Kennung der Zahlung beim Zahlungsdienst des Terminals (PRX-047, ANN-837): fuer den Abgleich mit dessen Auszahlung und damit eine zweimal gesendete Zahlung einmal gebucht wird. Nur bei method = card; eine von Hand gebuchte Karte traegt keine. Abrechnungsdaten wie die Zahlung (ADR-008).';

create or replace function app.payments_frozen()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.voided_at is not null then
    raise exception 'a voided payment cannot be changed again' using errcode = '23514';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.invoice_id   is distinct from old.invoice_id
     or new.direction    is distinct from old.direction
     or new.amount_cents is distinct from old.amount_cents
     or new.currency     is distinct from old.currency
     or new.paid_on      is distinct from old.paid_on
     or new.method       is distinct from old.method
     or new.note         is distinct from old.note
     or new.created_at   is distinct from old.created_at
     or new.created_by   is distinct from old.created_by
     or new.terminal_transaction is distinct from old.terminal_transaction then
    raise exception 'a recorded payment can only be voided, not changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Was vor dem Terminal und beim Buchen gleich geprüft wird; nur aus den beiden Funktionen darunter.
create function app.card_payment_invoice(p_invoice_id uuid, p_amount_cents integer)
  returns public.invoices
  language plpgsql
  set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = app.current_organization_id()
  for update;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'a payment belongs to an issued invoice' using errcode = '23514';
  end if;
  if exists (select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id) then
    raise exception 'a cancelled invoice takes no payment' using errcode = '23514';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs a positive amount' using errcode = '22023';
  end if;
  return v_invoice;
end;
$$;

comment on function app.card_payment_invoice(p_invoice_id uuid, p_amount_cents integer) is
  'PRX-047 (ANN-837): Rolle (owner, office), Organisation, ausgestellte und nicht stornierte Rechnung, positiver Betrag - dieselbe Pruefung vor dem Terminal und beim Buchen. Sperrt die Rechnung bis zum Ende der Transaktion. Ohne SECURITY DEFINER und fuer keine Anwendungsrolle aufrufbar.';

revoke all on function app.card_payment_invoice(uuid, integer) from public, anon, authenticated;

create function public.card_payment_preflight(p_invoice_id uuid, p_amount_cents integer)
  returns text
  language plpgsql volatile security definer
  set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  v_invoice := app.card_payment_invoice(p_invoice_id, p_amount_cents);
  -- Am Terminal nie mehr als offen: Zu viel abgebuchtes Geld müsste an der Tür zurück.
  if p_amount_cents > v_invoice.total_cents - app.invoice_paid_cents(p_invoice_id) then
    raise exception 'a card payment cannot exceed the open amount' using errcode = '23514';
  end if;
  return v_invoice.currency;
end;
$$;

comment on function public.card_payment_preflight(p_invoice_id uuid, p_amount_cents integer) is
  'PRX-047 (ANN-837): Darf diese Rechnung jetzt mit diesem Betrag am Terminal bezahlt werden? owner und office, ausgestellt, nicht storniert, Betrag groesser null und hoechstens offen. Liefert die Waehrung fuer das Terminal und bucht nichts. Ruft die Edge Function card-terminal mit dem Token der Person, bevor das Terminal belastet.';

revoke all on function public.card_payment_preflight(uuid, integer) from public, anon;
grant execute on function public.card_payment_preflight(uuid, integer) to authenticated;

create function public.record_card_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_terminal_transaction text
)
  returns uuid
  language plpgsql volatile security definer
  set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_org     uuid;
  v_zone    text;
  v_da      public.payments;
  v_id      uuid;
begin
  v_invoice := app.card_payment_invoice(p_invoice_id, p_amount_cents);
  v_org := v_invoice.organization_id;
  if p_terminal_transaction is null or p_terminal_transaction !~ '^[A-Za-z0-9._:-]{1,100}$' then
    raise exception 'a card payment needs its terminal transaction' using errcode = '22023';
  end if;

  -- Zweimal gesendet, einmal gebucht; dieselbe Kennung an anderer Stelle ist ein Fehler.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'card_payment', v_org, p_terminal_transaction), 0));
  select p.* into v_da
  from public.payments p
  where p.organization_id = v_org and p.terminal_transaction = p_terminal_transaction;
  if found then
    if v_da.invoice_id = p_invoice_id and v_da.amount_cents = p_amount_cents
       and v_da.voided_at is null then
      return v_da.id;
    end if;
    raise exception 'terminal transaction already booked' using errcode = '23505';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  -- Kein Höchstbetrag mehr: Das Geld ist abgebucht; eine Überzahlung bleibt ein Sachverhalt.
  insert into public.payments (
    organization_id, invoice_id, direction, amount_cents, currency, paid_on, method,
    terminal_transaction, created_by
  )
  values (
    v_org, p_invoice_id, 'incoming', p_amount_cents, v_invoice.currency,
    (now() at time zone v_zone)::date, 'card', p_terminal_transaction, auth.uid()
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.record_card_payment(p_invoice_id uuid, p_amount_cents integer, p_terminal_transaction text) is
  'PRX-047 (ANN-837): bucht eine am Terminal angenommene Kartenzahlung - Eingang, heute in der Zeitzone der Praxis, Weg card, mit der Kennung des Terminals. Dieselbe Kennung zweimal ergibt eine Zahlung; an anderer Rechnung oder mit anderem Betrag wird sie abgewiesen. owner und office; ruft die Edge Function card-terminal mit dem Token der Person, nachdem das Terminal angenommen hat.';

revoke all on function public.record_card_payment(uuid, integer, text) from public, anon;
grant execute on function public.record_card_payment(uuid, integer, text) to authenticated;
