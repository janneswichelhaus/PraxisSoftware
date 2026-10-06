-- =============================================================================
-- POR-013: Eigene Rechnungen auf der Plattform (PROJECT_PRINCIPLES.md 4.6,
-- 4.10; DSN-001 D3; ADR-023 Punkte 16, 19, 22, 24; ADR-009 Punkt 10)
--
-- Eigene Rechnungen erscheinen ohne eigenen Schritt, sobald sie gestellt sind
-- (D3) - auch wenn sie an eine andere Person adressiert sind (ADR-023 Punkt
-- 16): Die behandelte Person sieht, was ueber ihre Behandlung in Rechnung
-- gestellt wurde. Der Adressat selbst hat deshalb noch keinen Zugang.
--
-- Was die Person sieht, ist der SNAPSHOT der ausgestellten Rechnung (ADR-009
-- Punkt 10) - dasselbe Dokument, das die Praxis druckt -, dazu der
-- Zahlungsstand, den der Server rechnet (ABR-004), und der Storno-Vermerk.
-- Entwuerfe nie (ANN-250).
--
-- Recht `billing` (ABN-010): die Person selbst, eine Vertretung nur mit
-- nachgewiesener Vermoegenssorge bzw. Einwilligung. Das eigene Lesen bleibt
-- unprotokolliert, ueber eine Vertretung ist es protokolliert (Punkt 24).
-- =============================================================================

create function public.platform_invoices(p_access_id uuid)
returns table (
  id                uuid,
  invoice_number    text,
  issued_on         date,
  due_on            date,
  total_cents       integer,
  currency          text,
  paid_cents        integer,
  outstanding_cents integer,
  payment_state     text,
  overdue           boolean,
  cancelled         boolean,
  cancelled_on      date,
  -- An wen die Rechnung adressiert ist (Snapshot) - die Person sieht, ob sie
  -- selbst oder jemand anderes sie bekommen hat.
  recipient_kind    text,
  recipient_name    text,
  service_from      date,
  service_to        date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
  v_heute  date;
begin
  if not app.platform_access_allows(p_access_id, 'billing') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'invoices')
  );

  return query
  select i.id,
         i.invoice_number,
         i.issued_on,
         i.due_on,
         i.total_cents,
         i.currency,
         bezahlt.cents,
         i.total_cents - bezahlt.cents,
         app.invoice_payment_state(i.total_cents, bezahlt.cents),
         (i.due_on < v_heute and bezahlt.cents < i.total_cents and c.id is null),
         c.id is not null,
         c.cancelled_on,
         i.snapshot -> 'recipient' ->> 'kind',
         i.snapshot -> 'recipient' ->> 'name',
         (i.snapshot -> 'service_period' ->> 'from')::date,
         (i.snapshot -> 'service_period' ->> 'to')::date
  from public.invoices i
  left join public.invoice_cancellations c on c.invoice_id = i.id
  cross join lateral (select app.invoice_paid_cents(i.id) as cents) bezahlt
  where i.organization_id = v_zugang.organization_id
    and i.status = 'issued'
    and (
      (v_zugang.relationship_kind = 'treatment' and i.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and i.training_relationship_id = v_zugang.relationship_id)
    )
  order by i.issued_on desc, i.invoice_number desc;
end;
$$;

revoke all on function public.platform_invoices(uuid) from public, anon;
grant execute on function public.platform_invoices(uuid) to authenticated;

comment on function public.platform_invoices(uuid) is
  'POR-013: Plattformprojektion "Rechnungen" (DSN-001 D3, ANN-250): die ausgestellten Rechnungen des Verhaeltnisses mit Zahlungsstand, Storno-Vermerk und Adressat aus dem Snapshot; nie Entwuerfe. Recht billing (ABN-010); Vertretung protokolliert (ADR-023 Punkt 24).';

create function public.platform_invoice(p_access_id uuid, p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_invoice record;
  v_storno  record;
  v_ersetzt text;
  v_korrektur text;
  v_bezahlt integer;
begin
  if not app.platform_access_allows(p_access_id, 'billing') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.organization_id = v_zugang.organization_id
    and i.status = 'issued'
    and (
      (v_zugang.relationship_kind = 'treatment' and i.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and i.training_relationship_id = v_zugang.relationship_id)
    );
  if not found then
    return null;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', 'invoice', 'invoice_id', p_invoice_id)
  );

  v_bezahlt := app.invoice_paid_cents(p_invoice_id);
  select c.cancellation_number, c.reason, c.cancelled_on into v_storno
  from public.invoice_cancellations c where c.invoice_id = p_invoice_id;
  select i.invoice_number into v_ersetzt
  from public.invoices i where i.id = v_invoice.replaces_invoice_id;
  select i.invoice_number into v_korrektur
  from public.invoices i
  where i.replaces_invoice_id = p_invoice_id and i.status = 'issued'
  order by i.created_at limit 1;

  -- Der Snapshot, wie die Praxis ihn druckt (ADR-009 Punkt 10) - die Person
  -- bekommt dasselbe Blatt. Steuernummer und Bankverbindung der Praxis
  -- gehoeren auf eine Rechnung und stehen deshalb mit drin.
  return jsonb_build_object(
    'id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'due_on', v_invoice.due_on,
    'paid_cents', v_bezahlt,
    'outstanding_cents', v_invoice.total_cents - v_bezahlt,
    'payment_state', app.invoice_payment_state(v_invoice.total_cents, v_bezahlt),
    'cancellation', case when v_storno is null then null else
      jsonb_build_object('cancellation_number', v_storno.cancellation_number,
                         'cancelled_on', v_storno.cancelled_on)
    end,
    'replaces_invoice_number', v_ersetzt,
    'correction_invoice_number', v_korrektur,
    'document', v_invoice.snapshot
  );
end;
$$;

revoke all on function public.platform_invoice(uuid, uuid) from public, anon;
grant execute on function public.platform_invoice(uuid, uuid) to authenticated;

comment on function public.platform_invoice(uuid, uuid) is
  'POR-013: eine eigene ausgestellte Rechnung als Blatt - der Snapshot der Praxis (ADR-009 Punkt 10) mit Zahlungsstand und Storno-Kette. Nur ueber einen Zugang mit Recht billing; fremde und Entwuerfe: null.';
