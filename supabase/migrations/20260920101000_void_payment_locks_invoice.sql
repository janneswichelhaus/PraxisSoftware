-- =============================================================================
-- R3-015: Zahlungsstorno und Buchung laufen an derselben Rechnung nacheinander
--
-- `record_payment` sperrt die Rechnung (`select i.* ... for update`), bevor es
-- rechnet, wie viel eingegangen ist. `void_payment` sperrte nur die
-- Zahlungszeile. Damit pruefte jeder der beiden Vorgaenge eine Summe, die der
-- andere gerade aenderte: Storno des Eingangs und gleichzeitige Rueckzahlung
-- in voller Hoehe gingen beide durch, und `app.invoice_paid_cents` stand
-- anschliessend bei -4500 - mehr ausgezahlt als je eingegangen.
--
-- Die Rechnung ist die Klammer um alle Zahlungen einer Forderung, also ist
-- sie auch die Stelle, an der sich die Vorgaenge treffen. `void_payment`
-- nimmt dieselbe Sperre auf.
--
-- Reihenfolge der Sperren: `void_payment` sperrt zuerst die Zahlungszeile,
-- dann die Rechnung. Ein Verklemmen setzt einen Kreis voraus - jemanden, der
-- die Rechnung haelt und auf eine Zahlungszeile wartet. Den gibt es nicht:
-- `record_payment` fuegt eine neue Zeile ein und liest die vorhandenen ohne
-- Sperre, `cancel_invoice` ebenso.
-- =============================================================================

-- Uebernommen aus 20260919160000_payments.sql, Abschnitt 7, ergaenzt um die
-- Rechnungssperre vor der Summenpruefung.
create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_payment record;
  v_eingang integer;
  v_rueck   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select p.* into v_payment
  from public.payments p
  where p.id = p_payment_id and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'payment not found' using errcode = '42501';
  end if;

  if v_payment.voided_at is not null then
    raise exception 'payment is already voided' using errcode = '23514';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a void needs a reason' using errcode = '22023';
  end if;

  -- Dieselbe Sperre wie in record_payment: Beide Vorgaenge aendern die
  -- Zahlungssumme derselben Rechnung und muessen deshalb hintereinander
  -- laufen, nicht nebeneinander.
  perform 1 from public.invoices i where i.id = v_payment.invoice_id for update;

  -- Wird ein Eingang storniert, koennten bereits gebuchte Rueckzahlungen
  -- ueber der verbliebenen Summe liegen. Dann zuerst die Rueckzahlung
  -- stornieren - sonst stuende am Ende mehr ausgezahlt als eingegangen.
  if v_payment.direction = 'incoming' then
    select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents else 0 end), 0),
           coalesce(sum(case when p.direction = 'refund'   then p.amount_cents else 0 end), 0)
      into v_eingang, v_rueck
    from public.payments p
    where p.invoice_id = v_payment.invoice_id
      and p.voided_at is null
      and p.id <> p_payment_id;

    if v_rueck > v_eingang then
      raise exception 'voiding this payment would leave refunds without payments received'
        using errcode = '23514';
    end if;
  end if;

  update public.payments
     set voided_at   = now(),
         voided_by   = v_actor,
         void_reason = btrim(p_reason)
   where id = p_payment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'payment.voided', 'payment', p_payment_id, 'success',
    jsonb_build_object('surface', 'web', 'invoice_id', v_payment.invoice_id,
                       'direction', v_payment.direction,
                       'amount_cents', v_payment.amount_cents)
  );
end;
$$;

comment on function public.void_payment(uuid, text) is
  'Storniert eine erfasste Zahlung mit Grund (ABR-004, R3-015). Die Zeile bleibt sichtbar stehen und faellt aus jeder Summe; geaendert oder geloescht wird eine Zahlung nie. Sperrt die Rechnung wie record_payment, damit Storno und Buchung nicht aneinander vorbeilaufen.';

revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;
