-- =============================================================================
-- Verordnungszaehler und Abrechnungslage am Termin (PRX-EPIC-002, PRX-008)
--
-- Am Termin soll stehen, der wievielte er in seiner Grundlage ist ("Termin 8
-- von 10", IDEA-PRX-009), an wen die Rechnung geht und ob fuer die Person
-- eine Rechnung offen ist (IDEA-PRX-037). Beides entscheidet, was vor Ort zu
-- tun ist - heute steht es in der Akte und in der Abrechnung.
--
--   * EINE REGEL FUER DIE POSITION. Der Rang eines Termins in seiner Grundlage
--     war bisher in app.appointment_is_covered versteckt. Er steht jetzt in
--     app.appointment_basis_position, und die Deckung fragt diese Funktion:
--     gedeckt ist, wessen Position hoechstens die Terminzahl ist. Kalender,
--     Akte und Termin nennen damit dieselbe Zahl (CAL-022, ANN-067).
--   * EINE REGEL FUER "OFFEN". Eine Rechnung ist offen, wenn sie ausgestellt,
--     nicht storniert und nicht voll bezahlt ist - wie in der Liste der
--     offenen Posten (ABR-003c). Die Regel steht jetzt in app.open_invoices;
--     list_open_items und die neue Funktion lesen beide daraus.
--   * WER WAS SIEHT (ANN-139). Position und Bauart der Grundlage sind
--     Planungsangaben und fuer alle Rollen der Terminverwaltung sichtbar.
--     Rechnungsempfaenger und offene Rechnungen sind Zahlungsinformationen:
--     Sie kommen nur fuer owner und office (app.can_read_invoicing), fuer
--     alle anderen bleiben die Spalten leer - entschieden in der Datenbank,
--     nicht in der Oberflaeche (ADR-004).
--   * KEIN PROTOKOLL IM ERFOLGSFALL. Die Angaben sind organisatorisch wie der
--     Kalender; ein abgewiesener Aufruf wird protokolliert (G6b).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Position eines Termins in seiner Grundlage
-- -----------------------------------------------------------------------------
create function app.appointment_basis_position(p_appointment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Ein abgesagter Termin verbraucht nichts und hat keine Position.
    when a.status = 'cancelled' then null
    else (
      select count(*)::integer
      from public.appointments frueher
      where frueher.treatment_basis_id  = a.treatment_basis_id
        and frueher.organization_id     = a.organization_id
        and frueher.status             <> 'cancelled'
        and (frueher.starts_at, frueher.id) <= (a.starts_at, a.id)
    )
  end
  from public.appointments a
  where a.id = p_appointment_id
    and a.treatment_basis_id is not null
$$;

comment on function app.appointment_basis_position(uuid) is
  'PRX-008: der wievielte nicht abgesagte Termin seiner Grundlage dieser ist, geordnet nach Beginn und Kennung. null ohne Grundlage und bei einer Absage. Einzige Stelle der Reihenfolge; app.appointment_is_covered fragt sie.';

revoke all on function app.appointment_basis_position(uuid) from public, anon;
-- Ausgefuehrt wird sie auch dort, wo der Aufrufer selbst steht: Die Deckung
-- ruft sie aus der security_invoker-Sicht appointment_directory. Geliefert
-- wird eine Zahl ohne Inhalt - dieselbe Abwaegung wie bei der Deckung.
grant execute on function app.appointment_basis_position(uuid) to authenticated;

create or replace function app.appointment_is_covered(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.appointment_basis_position(a.id) <= b.appointment_count
  from public.appointments a
  -- Ohne Grundlage keine Deckung: kein Join-Treffer, Ergebnis null. Eine
  -- Absage hat keine Position und damit ebenfalls null.
  join public.treatment_bases b on b.id = a.treatment_basis_id
  where a.id = p_appointment_id
$$;

comment on function app.appointment_is_covered(uuid) is
  'Deckt die Behandlungsgrundlage diesen Termin? (CAL-022, ANN-067) Gedeckt ist, wessen Position in der Grundlage (app.appointment_basis_position, seit PRX-008) hoechstens die Terminzahl ist. null heisst: keine Grundlage oder abgesagt - dann gibt es keine Aussage.';

-- -----------------------------------------------------------------------------
-- 2. Offene Rechnungen - die eine Regel
-- -----------------------------------------------------------------------------
create function app.open_invoices(p_organization_id uuid)
returns table (invoice_id uuid, patient_id uuid, due_on date, paid_cents integer, outstanding_cents integer)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         i.patient_id,
         i.due_on,
         coalesce(zahlung.bezahlt, 0),
         i.total_cents - coalesce(zahlung.bezahlt, 0)
  from public.invoices i
  -- Die Zahlungssumme einmal je Rechnung (R3-016), dieselbe Rechnung wie
  -- app.invoice_paid_cents.
  left join (
    select p.invoice_id,
           sum(case when p.direction = 'incoming' then p.amount_cents
                    else -p.amount_cents end)::integer as bezahlt
    from public.payments p
    where p.voided_at is null
    group by p.invoice_id
  ) zahlung on zahlung.invoice_id = i.id
  where i.organization_id = p_organization_id
    and i.status = 'issued'
    -- Eine stornierte Rechnung ist keine Forderung mehr (ABR-003c).
    and not exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
    and i.total_cents - coalesce(zahlung.bezahlt, 0) > 0
$$;

comment on function app.open_invoices(uuid) is
  'PRX-008: offene Rechnungen einer Organisation - ausgestellt, nicht storniert, nicht voll bezahlt (ABR-003c). Einzige Stelle der Regel; list_open_items und get_appointment_billing_context lesen daraus. Ohne Rollenpruefung: nur aus Funktionen mit eigener Pruefung aufrufen.';

revoke all on function app.open_invoices(uuid) from public, anon, authenticated;

-- list_open_items liest jetzt aus der Regel; Rueckgabe und Rollen unveraendert
-- (Rumpf aus 20260923120000_abgewiesene_lesezugriffe_rest.sql).
create or replace function public.list_open_items(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, invoice_number text, patient_id uuid, patient_name text, recipient_name text, period_month date, issued_on date, due_on date, total_cents integer, paid_cents integer, outstanding_cents integer, currency text, overdue boolean, open_total_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select i.id, i.invoice_number, i.patient_id,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         i.period_month, i.issued_on, i.due_on,
         i.total_cents,
         offen.paid_cents,
         offen.outstanding_cents,
         i.currency,
         (i.due_on < v_heute),
         sum(offen.outstanding_cents) over ()::integer
  from app.open_invoices(v_org) offen
  join public.invoices i  on i.id = offen.invoice_id
  join public.patients pa on pa.id = i.patient_id
  join public.persons  pe on pe.id = pa.person_id
  left join public.invoice_recipients r on r.id = i.recipient_id
  order by i.due_on, i.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- -----------------------------------------------------------------------------
-- 3. get_appointment_billing_context
-- -----------------------------------------------------------------------------
create function public.get_appointment_billing_context(p_appointment_id uuid)
returns table (
  appointment_id            uuid,
  treatment_basis_id        uuid,
  treatment_basis_kind      text,
  treatment_basis_issued_on date,
  basis_position            integer,
  basis_appointment_count   integer,
  billing_visible           boolean,
  recipient_kind            text,
  open_invoice_count        integer,
  open_outstanding_cents    integer,
  open_overdue              boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_basis   uuid;
  v_darf    boolean;
  v_heute   date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.treatment_basis_id
    into v_patient, v_kind, v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  -- Die Abrechnungslage gibt es am Behandlungstermin. Training rechnet ueber
  -- ein eigenes Verhaeltnis ab (ADR-021), eine Fehlzeit gar nicht.
  if v_kind <> 'therapy' or v_patient is null then
    raise exception 'a billing context exists only for treatment appointments'
      using errcode = '22023';
  end if;

  -- ANN-139: Zahlungsinformationen nur fuer die Rollen der Abrechnung.
  v_darf := app.can_read_invoicing();
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return query
    select
      p_appointment_id,
      b.id,
      b.treatment_basis_kind,
      b.issued_on,
      app.appointment_basis_position(p_appointment_id),
      b.appointment_count,
      v_darf,
      case when v_darf then coalesce((
        select r.recipient_kind
        from public.invoice_recipients r
        where r.patient_id = v_patient
          and r.organization_id = v_org
          and r.is_default
      ), 'self') end,
      case when v_darf then offen.anzahl end,
      case when v_darf then offen.betrag end,
      case when v_darf then offen.ueberfaellig end
    from (select 1) eins
    left join public.treatment_bases b on b.id = v_basis and b.organization_id = v_org
    left join lateral (
      select count(*)::integer as anzahl,
             coalesce(sum(o.outstanding_cents), 0)::integer as betrag,
             coalesce(bool_or(o.due_on < v_heute), false) as ueberfaellig
      from app.open_invoices(v_org) o
      where o.patient_id = v_patient
    ) offen on v_darf;
end;
$$;

comment on function public.get_appointment_billing_context(uuid) is
  'PRX-008: Position des Termins in seiner Grundlage ("8 von 10", app.appointment_basis_position) und - nur fuer owner und office (ANN-139) - Standard-Rechnungsempfaenger und offene Rechnungen der Person nach der Regel der offenen Posten (app.open_invoices). Nur am Behandlungstermin; abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.get_appointment_billing_context(uuid) from public, anon;
grant execute on function public.get_appointment_billing_context(uuid) to authenticated;
