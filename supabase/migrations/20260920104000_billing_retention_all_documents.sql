-- =============================================================================
-- R3-003: Die Abrechnungsfrist der Akte kennt alle Belege, nicht nur die
-- Rechnung
--
-- `app.billing_retention_due_at` bildete den spaetesten Ablauf allein aus
-- `invoices.issued_on`. Stornodokument, Zahlungserinnerung und Zahlung sind
-- aber eigene Belege mit eigenem Datum - und sie entstehen **nach** der
-- Rechnung, oft im naechsten Kalenderjahr. Eine Rechnung vom 15.12.2026 und
-- ihr Storno vom 10.01.2027 liefen damit bis 01.01.2035 beziehungsweise
-- 01.01.2036; der Loeschlauf nahm den Beleg ein volles Jahr zu frueh mit der
-- Akte mit.
--
-- Das widerspricht ADR-008 Punkt 2 (gesetzliche Aufbewahrung hat Vorrang) und
-- Par. 147 AO, der jeden dieser Belege einzeln fuer acht Jahre ab Ende seines
-- Kalenderjahres festhaelt. Die Frist der Akte ist deshalb das Maximum ueber
-- alle vier Datumsquellen.
--
-- Stornierte Zahlungen zaehlen mit: Die Zeile bleibt stehen, faellt nur aus
-- der Summe (ABR-004) - als Beleg ist sie so aufbewahrungspflichtig wie jede
-- andere. Ein Entwurf zaehlt weiterhin nicht; er ist kein Beleg, und an ihm
-- haengt keines der drei Dokumente.
-- =============================================================================

create or replace function app.billing_retention_due_at(
  p_patient_id uuid,
  p_time_zone  text
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(app.retention_due_at(
           (date_trunc('year', t.beleg_am) + interval '1 year' - interval '1 day')::date,
           app.retention_interval('abrechnungsdaten'),
           p_time_zone
         ))
  from (
    select i.issued_on as beleg_am
    from public.invoices i
    where i.patient_id = p_patient_id
      and i.status = 'issued'

    union all

    -- Die drei folgenden Belege haengen ausschliesslich an ausgestellten
    -- Rechnungen; ihr Datum wird trotzdem ohne Umweg ueber den
    -- Rechnungszustand gelesen. Was als Beleg in der Tabelle steht, zaehlt.
    select c.cancelled_on
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where i.patient_id = p_patient_id

    union all

    select r.reminder_on
    from public.invoice_payment_reminders r
    join public.invoices i on i.id = r.invoice_id
    where i.patient_id = p_patient_id

    union all

    select p.paid_on
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where i.patient_id = p_patient_id
  ) t
$$;

comment on function app.billing_retention_due_at(uuid, text) is
  'Ablauf der steuerlichen Aufbewahrung ueber alle Abrechnungsbelege einer Patientin: ausgestellte Rechnungen, Stornodokumente, Zahlungserinnerungen und Zahlungen (ADR-008, Par. 147 AO, R3-003). null heisst: kein Beleg. Haelt die Akte im Loeschlauf zurueck, solange die laengste Frist laeuft.';

revoke all on function app.billing_retention_due_at(uuid, text) from public, anon, authenticated;
