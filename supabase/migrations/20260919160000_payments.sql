-- =============================================================================
-- ABR-004: Zahlungen sind eigene Transaktionen
--
-- ADR-009 Punkt 12 verlangt Zahlungen als eigene Transaktionen mit Teilzahlung
-- und spaeterer Rueckzahlung; die Konsequenz dazu sagt den entscheidenden
-- Satz: "Der Zahlungsstatus ist damit abgeleitet, nicht gesetzt."
--
-- Vier Festlegungen tragen diese Migration:
--
--   1. **Der Zahlungsstand ist eine Rechnung, kein Feld.** `invoices` bekommt
--      keine Spalte `paid_cents` und keinen neuen Wert in `status`. Was bezahlt
--      ist, ergibt sich aus den Transaktionen - und kann deshalb nie von ihnen
--      abweichen. Eine gepflegte Spalte koennte das (ADR-009, Konsequenz zu
--      Punkt 12; PROJECT_PRINCIPLES.md 13).
--   2. **Die Rueckzahlung ist eine eigene Richtung, kein negativer Betrag.**
--      Ein negativer Betrag gaebe derselben Spalte zwei Bedeutungen und liesse
--      "-0" und Tippfehler als gueltige Zahlungen durch. `direction` trennt
--      sie, `amount_cents > 0` gilt fuer beide.
--   3. **Gebucht ist gebucht.** Eine erfasste Zahlung laesst sich nicht
--      aendern und nicht loeschen - sie wird **storniert** und bleibt sichtbar
--      stehen. Das ist dieselbe Bauart wie bei der ausgestellten Rechnung
--      (ADR-009 Punkt 9) und der Grund, warum ein Zahlungsbeleg spaeter noch
--      erklaerbar ist. Ein Loeschknopf wuerde genau diese Spur austrocknen.
--   4. **Eine Zahlung haengt an einer ausgestellten Rechnung.** An einem
--      Entwurf gibt es nichts zu zahlen: Er traegt keine Nummer, keinen
--      Betrag im Snapshot und laesst sich folgenlos verwerfen (ANN-075).
--
-- **Ueberzahlung ist erlaubt**, weil sie vorkommt - ADR-009 nennt sie in der
-- Konsequenz zu Punkt 12 ausdruecklich neben Teilzahlung und Rueckzahlung. Sie
-- wird angezeigt, nicht abgewiesen. **Rueckgezahlt werden kann hoechstens, was
-- eingegangen ist**; alles andere waere eine Auszahlung ohne Grund.
--
-- Was NICHT hier entsteht: Mahnwesen und Mahnstufen (ADR-009 nennt sie
-- ausdruecklich als nicht entschieden), Kassenbuch, TSE und Kartenzahlung (in
-- der Roadmap ausdruecklich nicht Teil von Etappe 1; Jannes hat am 2026-09-19
-- bestaetigt, dass die Praxis kein Bargeld annimmt), Kontoauszugsabgleich und
-- jede Anbindung an einen Zahlungsanbieter.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Zahlung
--
-- Der Fremdschluessel auf die Rechnung steht bewusst auf RESTRICT und nicht auf
-- CASCADE - anders als bei der Rechnungszeile. Eine Rechnungszeile ist eine
-- Zuordnung, eine Zahlung ist ein Beleg: Faellt sie still mit der Rechnung,
-- fehlt ihre Zeile im Loeschjournal, und das Journal ist der Nachweis, dass
-- geloescht wurde, was geloescht werden durfte (ADR-008 Punkt 8). RESTRICT
-- erzwingt stattdessen die richtige Reihenfolge im Loeschlauf - und meldet
-- sich laut, wenn sie jemand vergisst.
-- -----------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  invoice_id      uuid not null references public.invoices (id) on delete restrict,
  direction       text not null check (direction in ('incoming', 'refund')),
  amount_cents    integer not null check (amount_cents > 0),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  paid_on         date not null,
  method          text not null check (method in ('bank_transfer', 'other')),
  note            text check (note is null or length(btrim(note)) between 1 and 200),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  -- Storno: drei Spalten, die nur gemeinsam gesetzt werden. Ein Storno ohne
  -- Grund waere eine Buchung ohne Beleg.
  voided_at       timestamptz,
  voided_by       uuid,
  void_reason     text check (void_reason is null
                              or length(btrim(void_reason)) between 3 and 200),
  constraint payments_void_is_complete check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

comment on table public.payments is
  'Zahlungseingang oder Rueckzahlung zu einer ausgestellten Rechnung (ABR-004, ADR-009 Punkt 12). Eigene Transaktion: Der Zahlungsstand der Rechnung wird daraus gerechnet und nirgends gepflegt. Enthaelt ueber die Rechnung einen Patientenbezug, aber keine klinischen Angaben. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen dieser Migration (ADR-004).';
comment on column public.payments.direction is
  'incoming = Eingang, refund = Rueckzahlung. Eigene Richtung statt negativem Betrag: ein negativer Betrag gaebe derselben Spalte zwei Bedeutungen.';
comment on column public.payments.amount_cents is
  'Betrag in ganzen Cent, immer positiv (ADR-014). Die Richtung steht in direction.';
comment on column public.payments.paid_on is
  'Tag des Zahlungseingangs beziehungsweise der Rueckzahlung in der Zeitzone der Praxis - nicht der Tag der Erfassung. Der steht in created_at.';
comment on column public.payments.voided_at is
  'Gesetzt heisst: storniert und aus jeder Summe heraus. Die Zeile bleibt sichtbar stehen (ADR-009 Punkt 9 sinngemaess); geaendert oder geloescht wird eine Zahlung nie.';

create index payments_invoice_idx on public.payments (invoice_id);
create index payments_org_idx on public.payments (organization_id, paid_on desc, id desc);

revoke all on public.payments from anon, authenticated;
alter table public.payments enable row level security;

-- Aufbewahrung (ADR-008): Abrechnungsdaten, steuerliche Frist. Die Zahlung
-- faellt mit ihrer Rechnung - und die haelt die Akte zurueck, solange ihre
-- eigene Frist laeuft (ADR-008 Punkt 2, ABR-003).
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('payments', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Zahlungen und Rueckzahlungen. Fallen mit ihrer Rechnung und vor ihr, weil sie mit RESTRICT auf sie zeigen.', 23);

-- -----------------------------------------------------------------------------
-- 2. Eine Zahlung gehoert an eine ausgestellte Rechnung
--
-- Am Trigger und nicht im Schreibpfad, damit die Zusage fuer JEDEN Weg in die
-- Tabelle gilt - dieselbe Bauart wie bei der eingefrorenen Rechnung.
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

  return new;
end;
$$;

comment on function app.payments_need_issued_invoice() is
  'Haelt Zahlungen an ausgestellten Rechnungen fest (ABR-004). An einem Entwurf gibt es nichts zu zahlen: Er traegt keine Nummer und laesst sich folgenlos verwerfen (ANN-075).';

create trigger payments_need_issued_invoice
  before insert on public.payments
  for each row execute function app.payments_need_issued_invoice();

-- -----------------------------------------------------------------------------
-- 3. Gebucht ist gebucht (ADR-009 Punkt 9 sinngemaess)
--
-- Die einzige erlaubte Aenderung an einer erfassten Zahlung ist ihr Storno,
-- und auch das nur einmal. Das Loeschen bleibt moeglich - der Loeschlauf muss
-- die Zeile nach Ablauf der steuerlichen Frist abraeumen koennen (ADR-008),
-- und ein Trigger, der das verhindert, liesse den ganzen Lauf scheitern. Wer
-- loeschen darf, entscheiden die Funktionen: Die Tabelle traegt kein einziges
-- Tabellenrecht, und keine der Funktionen hier loescht eine Zahlung.
-- -----------------------------------------------------------------------------
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
     or new.created_by   is distinct from old.created_by then
    raise exception 'a recorded payment can only be voided, not changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.payments_frozen() is
  'Laesst an einer erfassten Zahlung nur das Storno zu, und das nur einmal (ABR-004). Eine falsch erfasste Zahlung wird storniert und neu gebucht, nicht ueberschrieben - sonst bliebe vom Vorgang nichts erklaerbar.';

create trigger payments_frozen
  before update on public.payments
  for each row execute function app.payments_frozen();

-- -----------------------------------------------------------------------------
-- 4. Auditkatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'treatment_basis',
    'text_snippet',
    'user_account',
    'patient_file',
    'storage_deletion_order',
    'service_catalog_version',
    'invoice_recipient',
    'invoice',
    'payment'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'organization.billing_profile_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted',
    'service_catalog.version_created',
    'service_catalog.version_updated',
    'service_catalog.version_published',
    'service_catalog.version_deleted',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice_recipient.created',
    'invoice_recipient.updated',
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued',
    'payment.recorded',
    'payment.voided'
  ));

-- -----------------------------------------------------------------------------
-- 5. Was bezahlt ist
--
-- Eine Funktion, eine Wahrheit. Jede Liste, jede Anzeige und jede Pruefung im
-- Schreibpfad rechnet mit derselben Summe; zwei Implementierungen wuerden
-- frueher oder spaeter auseinanderlaufen, und die Abweichung faende niemand.
--
-- Stornierte Zahlungen zaehlen nicht mit. Sie bleiben in der Tabelle und in
-- der Anzeige, aber nicht in der Summe - genau dafuer gibt es das Storno.
-- -----------------------------------------------------------------------------
create or replace function app.invoice_paid_cents(p_invoice_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
           case when p.direction = 'incoming' then p.amount_cents else -p.amount_cents end
         ), 0)::integer
  from public.payments p
  where p.invoice_id = p_invoice_id
    and p.voided_at is null
$$;

comment on function app.invoice_paid_cents(uuid) is
  'Bezahlter Betrag einer Rechnung in Cent: Eingaenge minus Rueckzahlungen, stornierte Zahlungen ausgenommen (ABR-004). Die eine Stelle, an der diese Summe entsteht.';

revoke all on function app.invoice_paid_cents(uuid) from public, anon, authenticated;

-- Der Zahlungsstand als Wort. ADR-009 Punkt 7 nennt "teilweise bezahlt" und
-- "bezahlt" als Rechnungszustaende; gefuehrt werden sie hier als **abgeleitete**
-- Werte und nicht in `invoices.status` - die Konsequenz zu Punkt 12 verlangt
-- genau das. "ueberfaellig" steht bewusst daneben und nicht darin: Eine
-- teilweise bezahlte Rechnung kann zugleich ueberfaellig sein, und ein Wert,
-- der beides zusammenfasst, beantwortet keine von beiden Fragen.
create or replace function app.invoice_payment_state(
  p_total_cents integer,
  p_paid_cents  integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_paid_cents > p_total_cents  then 'overpaid'
           when p_paid_cents >= p_total_cents then 'paid'
           when p_paid_cents <= 0             then 'unpaid'
           else 'partially_paid'
         end
$$;

comment on function app.invoice_payment_state(integer, integer) is
  'Zahlungsstand einer Rechnung aus Betrag und bezahlter Summe: unpaid, partially_paid, paid, overpaid (ABR-004, ADR-009 Punkt 7 als abgeleiteter Wert). "ueberfaellig" steht daneben und haengt am Faelligkeitsdatum.';

revoke all on function app.invoice_payment_state(integer, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Eine Zahlung erfassen
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
  'Erfasst einen Zahlungseingang oder eine Rueckzahlung zu einer ausgestellten Rechnung (ABR-004, ADR-009 Punkt 12). Teilzahlung und Ueberzahlung sind erlaubt; eine Rueckzahlung darf die eingegangene Summe nicht uebersteigen.';

revoke all on function public.record_payment(uuid, integer, date, text, text, text) from public, anon;
grant execute on function public.record_payment(uuid, integer, date, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Eine Zahlung stornieren
--
-- Der Weg fuer die falsch erfasste Zahlung. Sie verschwindet nicht, sie
-- bekommt einen Grund und faellt aus der Summe - und der Vorgang bleibt
-- erklaerbar, auch Jahre spaeter.
-- -----------------------------------------------------------------------------
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
  'Storniert eine erfasste Zahlung mit Grund (ABR-004). Die Zeile bleibt sichtbar stehen und faellt aus jeder Summe; geaendert oder geloescht wird eine Zahlung nie.';

revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Zahlungen lesen
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_payments(p_invoice_id uuid)
returns table (
  id           uuid,
  direction    text,
  amount_cents integer,
  currency     text,
  paid_on      date,
  method       text,
  note         text,
  voided_at    timestamptz,
  void_reason  text
)
language plpgsql
stable
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
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select p.id, p.direction, p.amount_cents, p.currency, p.paid_on, p.method,
         p.note, p.voided_at, p.void_reason
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  where p.invoice_id = p_invoice_id
    and i.organization_id = v_org
  order by p.paid_on, p.created_at, p.id;
end;
$$;

comment on function public.list_invoice_payments(uuid) is
  'Zahlungen einer Rechnung, stornierte eingeschlossen und als solche erkennbar (ABR-004).';

revoke all on function public.list_invoice_payments(uuid) from public, anon;
grant execute on function public.list_invoice_payments(uuid) to authenticated;

create or replace function public.list_payments(p_limit integer default 100)
returns table (
  id             uuid,
  invoice_id     uuid,
  invoice_number text,
  patient_name   text,
  recipient_name text,
  direction      text,
  amount_cents   integer,
  currency       text,
  paid_on        date,
  method         text,
  note           text,
  voided_at      timestamptz,
  void_reason    text
)
language plpgsql
stable
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
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select p.id, p.invoice_id, i.invoice_number,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         p.direction, p.amount_cents, p.currency, p.paid_on, p.method,
         p.note, p.voided_at, p.void_reason
  from public.payments p
  join public.invoices  i  on i.id = p.invoice_id
  join public.patients  pa on pa.id = i.patient_id
  join public.persons   pe on pe.id = pa.person_id
  left join public.invoice_recipients r on r.id = i.recipient_id
  where p.organization_id = v_org
  order by p.paid_on desc, p.created_at desc, p.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_payments(integer) is
  'Zahlungen der Praxis mit Rechnungsbezug (ABR-004). Stornierte sind enthalten und als solche erkennbar - eine Liste, aus der eine Buchung verschwindet, erklaert nichts mehr.';

revoke all on function public.list_payments(integer) from public, anon;
grant execute on function public.list_payments(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Offene Posten
--
-- Die Frage der Einstiegsseite: Wer schuldet noch was, und seit wann ist es
-- faellig (OPTIMIERUNG.md, "Offene Posten sehen: 0 Taps").
--
-- `sum(...) over ()` steht mit Absicht da: Ein Fensterausdruck wird **vor**
-- dem LIMIT ausgewertet und traegt deshalb die Summe ueber alle offenen
-- Posten, auch wenn die Liste gekuerzt ist. Die Oberflaeche wuerde sonst eine
-- Summe der ersten hundert Zeilen anzeigen und sie "offene Posten" nennen.
-- -----------------------------------------------------------------------------
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
           app.invoice_paid_cents(i.id) as paid_cents,
           (i.total_cents - app.invoice_paid_cents(i.id)) as outstanding_cents,
           i.currency
    from public.invoices i
    join public.patients pa on pa.id = i.patient_id
    join public.persons  pe on pe.id = pa.person_id
    left join public.invoice_recipients r on r.id = i.recipient_id
    where i.organization_id = v_org
      and i.status = 'issued'
  ) offen
  where offen.outstanding_cents > 0
  order by offen.due_on, offen.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_open_items(integer) is
  'Ausgestellte Rechnungen mit offenem Betrag, aelteste Faelligkeit zuerst (ABR-004). open_total_cents traegt die Summe ueber ALLE offenen Posten, nicht nur ueber die gelieferten Zeilen.';

revoke all on function public.list_open_items(integer) from public, anon;
grant execute on function public.list_open_items(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Die Rechnungsliste zeigt den Zahlungsstand
--
-- Der Rueckgabetyp waechst um vier Spalten; PostgreSQL kennt dafuer kein
-- `create or replace`, also erst loeschen, dann neu anlegen. Der Rumpf ist bis
-- auf die vier Spalten und den Zeitzonenblock unveraendert aus
-- 20260919150000_invoices.sql uebernommen.
-- -----------------------------------------------------------------------------
drop function public.list_invoices(integer);

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
  overdue           boolean
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
         case when i.status = 'issued' then app.invoice_paid_cents(i.id) else 0 end,
         case when i.status = 'issued'
              then i.total_cents - app.invoice_paid_cents(i.id) else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, app.invoice_paid_cents(i.id))
              else 'unpaid' end,
         (i.status = 'issued' and i.due_on < v_heute
          and app.invoice_paid_cents(i.id) < i.total_cents)
  from public.invoices i
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
  where i.organization_id = v_org
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_invoices(integer) is
  'Rechnungen der Praxis mit Zustand, Nummer, Empfaenger, Betrag und Zahlungsstand (ABR-003, ABR-004). Ein Entwurf rechnet live, eine ausgestellte Rechnung zeigt ihren festgeschriebenen Betrag; der Zahlungsstand ist abgeleitet und nirgends gepflegt (ADR-009 Punkt 12).';

revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Auch die einzelne Rechnung kennt ihren Zahlungsstand
--
-- Der Rueckgabetyp ist `jsonb` und aendert sich nicht; die Ansicht bekommt
-- vier zusaetzliche Felder. Sie stehen hier und nicht im Browser, weil eine
-- im Browser nachgerechnete Summe eine zweite Wahrheit waere - und die
-- weicht irgendwann ab.
-- -----------------------------------------------------------------------------
create or replace function public.get_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_bezahlt  integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
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
                and v_bezahlt < v_invoice.total_cents),
    'document', coalesce(v_invoice.snapshot, app.build_invoice_document(p_invoice_id))
  );
end;
$$;

comment on function public.get_invoice(uuid) is
  'Eine Rechnung als Dokument, mit ihrem abgeleiteten Zahlungsstand (ABR-003, ABR-004). Ein Entwurf wird aus den heutigen Stammdaten gebaut, eine ausgestellte Rechnung kommt aus ihrem Snapshot (ADR-009 Punkt 10).';

revoke all on function public.get_invoice(uuid) from public, anon;
grant execute on function public.get_invoice(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Der Loeschlauf der Akte nimmt Zahlungen mit
--
-- Unveraendert aus 20260919150000_invoices.sql uebernommen bis auf den einen
-- neuen Block ganz vorn: Zahlungen fallen vor Rechnungszeilen und Rechnungen,
-- weil sie mit RESTRICT auf die Rechnung zeigen. PostgreSQL kennt kein
-- teilweises Ersetzen einer Funktion.
-- -----------------------------------------------------------------------------
create or replace function app.delete_patient_record(
  p_patient_id uuid,
  p_run_id uuid,
  p_due_at timestamp with time zone
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select p.organization_id, p.person_id
    into v_org, v_person
  from public.patients p
  where p.id = p_patient_id;

  if not found then
    return 0;
  end if;

  -- Neu mit ABR-004: Zahlungen zuerst. Sie zeigen mit RESTRICT auf die
  -- Rechnung, und ihre steuerliche Frist ist dieselbe - der Lauf haette die
  -- Akte sonst zurueckgehalten (ADR-008 Punkt 2).
  with geloescht as (
    delete from public.payments z
     where z.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning z.id, z.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'payments', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Rechnungszeilen: Sie zeigen mit RESTRICT auf die Leistung.
  with geloescht as (
    delete from public.invoice_items it
     where it.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning it.id, it.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_items', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoices i
     where i.patient_id = p_patient_id
    returning i.id, i.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoices', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoice_recipients r
     where r.patient_id = p_patient_id
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_recipients', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Leistungen fallen vor Termin und Patientenzeile, weil sie mit RESTRICT
  -- auf beide zeigen, und ihre steuerliche Frist ist nie laenger als die zehn
  -- Jahre der Akte (ADR-008, ABR-002).
  with geloescht as (
    delete from public.billable_services b
     where b.patient_id = p_patient_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'billable_services', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_notes t
     where t.appointment_id in (
       select a.id from public.appointments a where a.patient_id = p_patient_id
     )
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_notes', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_bases pr
     where pr.patient_id = p_patient_id
    returning pr.id, pr.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_bases', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.appointments a
     where a.patient_id = p_patient_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.legal_holds h
     where h.subject_type = 'patient'
       and h.subject_id = p_patient_id
    returning h.id, h.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'legal_holds', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.patients p
     where p.id = p_patient_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'patients', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x      where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_patient_record(uuid, uuid, timestamp with time zone) is
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-004 einschliesslich Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger. Prueft KEINEN Legal Hold und KEINE steuerliche Frist - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 13. Die Wiederanwendung kennt die Zahlung
--
-- Unveraendert bis auf einen Eintrag in der Reihenfolge: Was zuerst geloescht
-- wurde, wird nach einer Wiederherstellung zuerst wieder geloescht (ADR-008
-- Punkt 8).
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$$;

comment on function public.reapply_deletion_journal() is
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-004 einschliesslich Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger.';
