-- =============================================================================
-- R3-004: Eine stornierte Rechnung nimmt keine Zahlung mehr an
--
-- `record_payment` prueft `invoices.status = 'issued'` - und genau das bleibt
-- eine stornierte Rechnung. Der Zustand "storniert" steht nach ADR-009
-- Punkt 9 am Stornodokument und nicht in einer Spalte der Rechnung
-- (20260919170000_invoice_cancellations.sql: "Seine Existenz ist der Zustand
-- storniert"). Damit ging ein Zahlungseingang auf eine aufgehobene Forderung
-- durch, und die stornierte Rechnung stand anschliessend als bezahlt in der
-- Ansicht.
--
-- Die Zusage steht an zwei Stellen, weil sie an zwei Stellen gebraucht wird:
-- im Schreibpfad mit einer verstaendlichen Meldung und am Trigger fuer jeden
-- anderen Weg in die Tabelle - dieselbe Bauart wie
-- 'a payment belongs to an issued invoice' (ABR-004) und dieselbe Aussage,
-- die `create_payment_reminder` schon fuer die Erinnerung trifft
-- ('a cancelled invoice is not reminded').
--
-- Gegenrichtung unveraendert: `cancel_invoice` verlangt weiterhin, dass die
-- Zahlungen einer Rechnung vorher storniert sind. Beides zusammen schliesst
-- den Kreis - vor dem Storno kein stehendes Geld, nach dem Storno kein neues.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Trigger
--
-- Uebernommen aus 20260919160000_payments.sql, Abschnitt 2, ergaenzt um die
-- Pruefung auf das Stornodokument.
-- -----------------------------------------------------------------------------
create or replace function app.payments_need_issued_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select i.status into v_status
  from public.invoices i
  where i.id = new.invoice_id;

  if v_status is distinct from 'issued' then
    raise exception 'a payment belongs to an issued invoice' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = new.invoice_id
  ) then
    raise exception 'a cancelled invoice takes no payment' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.payments_need_issued_invoice() is
  'Haelt Zahlungen an ausgestellten, nicht stornierten Rechnungen fest (ABR-004, R3-004). An einem Entwurf gibt es nichts zu zahlen (ANN-075), an einer stornierten Rechnung nichts mehr (ADR-009 Punkt 9).';

-- -----------------------------------------------------------------------------
-- 2. Der Schreibpfad
--
-- Uebernommen aus 20260919160000_payments.sql, Abschnitt 6, ergaenzt um
-- dieselbe Pruefung direkt hinter der Zustandspruefung.
-- -----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_invoice_id   uuid,
  p_amount_cents integer,
  p_paid_on      date,
  p_method       text,
  p_direction    text default 'incoming',
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_invoice   record;
  v_zeitzone  text;
  v_heute     date;
  v_eingang   integer;
  v_rueck     integer;
  v_id        uuid;
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

  if v_invoice.status <> 'issued' then
    raise exception 'a payment belongs to an issued invoice' using errcode = '23514';
  end if;

  -- Eine stornierte Rechnung ist keine Forderung mehr. Wer trotzdem Geld
  -- bekommen hat, storniert das Storno nicht - die Rueckzahlung laeuft ueber
  -- die Korrekturrechnung, die `create_correction_draft` anlegt.
  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice takes no payment' using errcode = '23514';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs a positive amount' using errcode = '22023';
  end if;

  if p_direction is null or p_direction not in ('incoming', 'refund') then
    raise exception 'unknown payment direction' using errcode = '22023';
  end if;

  if p_method is null or p_method not in ('bank_transfer', 'other') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Kein Datum in der Zukunft: Eine Zahlung wird erfasst, wenn sie da ist,
  -- nicht wenn sie erwartet wird. Ein erwarteter Eingang ist ein offener
  -- Posten, und den fuehrt die Rechnung selbst.
  if p_paid_on is null or p_paid_on > v_heute then
    raise exception 'a payment cannot be dated in the future' using errcode = '22023';
  end if;

  -- Rueckgezahlt werden kann hoechstens, was eingegangen ist. Ueberzahlung
  -- dagegen bleibt erlaubt: ADR-009 nennt sie ausdruecklich (Konsequenz zu
  -- Punkt 12), und eine Rechnung, die zu viel Geld bekommen hat, ist ein
  -- Sachverhalt und kein Eingabefehler.
  if p_direction = 'refund' then
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = p_invoice_id and p.voided_at is null;

    if v_rueck + p_amount_cents > v_eingang then
      raise exception 'a refund cannot exceed the payments received'
        using errcode = '23514';
    end if;
  end if;

  insert into public.payments (
    organization_id, invoice_id, direction, amount_cents, currency,
    paid_on, method, note, created_by
  )
  values (
    v_org, p_invoice_id, p_direction, p_amount_cents, v_invoice.currency,
    p_paid_on, p_method, nullif(btrim(coalesce(p_note, '')), ''), v_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'payment.recorded', 'payment', v_id, 'success',
    jsonb_build_object('surface', 'web', 'invoice_id', p_invoice_id,
                       'invoice_number', v_invoice.invoice_number,
                       'direction', p_direction, 'amount_cents', p_amount_cents)
  );

  return v_id;
end;
$$;

comment on function public.record_payment(uuid, integer, date, text, text, text) is
  'Erfasst einen Zahlungseingang oder eine Rueckzahlung zu einer ausgestellten, nicht stornierten Rechnung (ABR-004, ADR-009 Punkt 12, R3-004). Teilzahlung und Ueberzahlung sind erlaubt; eine Rueckzahlung darf die eingegangene Summe nicht uebersteigen.';

revoke all on function public.record_payment(uuid, integer, date, text, text, text) from public, anon;
grant execute on function public.record_payment(uuid, integer, date, text, text, text) to authenticated;
