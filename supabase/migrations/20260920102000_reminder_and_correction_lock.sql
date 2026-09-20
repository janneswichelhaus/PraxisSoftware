-- =============================================================================
-- R3-009: Erinnerung und Korrekturentwurf sperren die Rechnung
--
-- `record_payment` und `cancel_invoice` lesen die Rechnung mit `for update`,
-- bevor sie an ihr rechnen. `create_payment_reminder` und
-- `create_correction_draft` lasen sie ohne Sperre - und entschieden damit auf
-- einem Stand, den ein gleichzeitiger Vorgang gerade aenderte:
--
--   * Die Erinnerung schreibt den offenen Betrag fest, weil er auf ein Blatt
--     geht (ANN-080). Ohne Sperre entstand ein Beleg ueber eine Forderung,
--     die im selben Moment beglichen wurde.
--   * Zwei gleichzeitige Erinnerungen und zwei gleichzeitige
--     Korrekturentwuerfe liefen an ihrer Pruefung vorbei und endeten erst im
--     Unique-Index - mit einer technischen Meldung statt mit dem Satz, der
--     sagt, was los ist.
--
-- Die Rechnung ist die Klammer um Zahlungen, Erinnerungen und Korrektur; also
-- ist sie die Stelle, an der sich diese Vorgaenge treffen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Zahlungserinnerung
--
-- Uebernommen aus 20260919180000_payment_reminders.sql, Abschnitt 4, ergaenzt
-- um `for update`.
-- -----------------------------------------------------------------------------
create or replace function public.create_payment_reminder(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Die Frist der Erinnerung, an genau einer Stelle (**ANN-080**). Vierzehn
  -- Tage sind die Frist, die auf dem Blatt steht - keine Rechtsfolge und kein
  -- Verzugsbeginn. Wer sie aendert, aendert sie hier.
  c_frist_tage constant integer := 14;
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_offen    integer;
  v_id       uuid;
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

  -- An einem Entwurf gibt es nichts zu erinnern: Er traegt keine Nummer und
  -- keine Forderung (ANN-075).
  if v_invoice.status <> 'issued' then
    raise exception 'a payment reminder belongs to an issued invoice' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice is not reminded' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Vor der Faelligkeit gibt es nichts zu erinnern.
  if v_invoice.due_on >= v_heute then
    raise exception 'this invoice is not overdue yet' using errcode = '23514';
  end if;

  -- Der offene Betrag kommt aus derselben Funktion wie jede andere Anzeige
  -- (ANN-078) - und wird hier festgeschrieben, weil er auf ein Blatt geht.
  v_offen := v_invoice.total_cents - app.invoice_paid_cents(p_invoice_id);

  if v_offen <= 0 then
    raise exception 'this invoice has nothing outstanding' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_payment_reminders r
    where r.invoice_id = p_invoice_id and r.reminder_on = v_heute
  ) then
    raise exception 'a payment reminder for this invoice was already written today'
      using errcode = '23505';
  end if;

  insert into public.invoice_payment_reminders (
    organization_id, invoice_id, reminder_on, due_on, outstanding_cents, currency, created_by
  )
  values (v_org, p_invoice_id, v_heute, v_heute + c_frist_tage, v_offen,
          v_invoice.currency, v_actor)
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.reminder_created', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_invoice.invoice_number,
                       'outstanding_cents', v_offen)
  );

  return v_id;
end;
$$;

comment on function public.create_payment_reminder(uuid) is
  'Stellt zu einer ueberfaelligen Rechnung eine Zahlungserinnerung aus und schreibt den offenen Betrag darin fest (ABR-003d, IDEA-PRX-012, ANN-080, R3-009). Ohne Stufe, ohne Gebuehr, ohne eigene Nummer; sperrt die Rechnung, damit der festgeschriebene Betrag der Stand im selben Moment ist.';

revoke all on function public.create_payment_reminder(uuid) from public, anon;
grant execute on function public.create_payment_reminder(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Der Korrekturentwurf
--
-- Uebernommen aus 20260919170000_invoice_cancellations.sql, Abschnitt 8,
-- ergaenzt um `for update`.
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
    where i.patient_id = v_alt.patient_id
      and i.period_month = v_alt.period_month
      and i.status = 'draft'
  ) then
    raise exception 'a draft for this patient and month already exists' using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, replaces_invoice_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.recipient_id, v_alt.period_month, p_invoice_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = v_alt.patient_id
      and b.status = 'billable'
      and date_trunc('month', b.performed_on)::date = v_alt.period_month
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient and month' using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_alt.patient_id,
                       'period_month', v_alt.period_month, 'item_count', v_anzahl,
                       'replaces_invoice_id', p_invoice_id)
  );

  return v_id;
end;
$$;

comment on function public.create_correction_draft(uuid) is
  'Legt zu einer stornierten Rechnung den Entwurf der Korrekturrechnung an und verweist von ihm auf die ersetzte Rechnung (ABR-003c, ADR-009 Punkt 9, R3-009). Nimmt alle wieder freien Leistungen des Monats auf (ANN-077); sperrt die Rechnung, damit zwei gleichzeitige Aufrufe nicht im Unique-Index enden.';

revoke all on function public.create_correction_draft(uuid) from public, anon;
grant execute on function public.create_correction_draft(uuid) to authenticated;
