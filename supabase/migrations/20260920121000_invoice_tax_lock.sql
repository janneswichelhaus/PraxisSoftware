-- =============================================================================
-- ABR-007: Der Par. 14c-Riegel wirkt vor der Ausstellung
--
-- Wer an einem steuerfreien Posten Umsatzsteuer ausweist, **schuldet sie nach
-- Par. 14c UStG** - unabhaengig davon, ob sie je gezahlt wurde und ob der
-- Ausweis ein Versehen war. Das ist kein Bedienfehler, den Sorgfalt abfaengt,
-- sondern eine Rechenoperation, die unterbleiben muss (ADR-009 Fassung 2
-- Punkt 18).
--
-- Die **Rechenseite steht** seit ABR-003: `app.build_invoice_document` rechnet
-- die enthaltene Steuer nur an steuerpflichtigen Gruppen und unter Par. 19
-- UStG gar nicht. Was fehlte, ist die Pruefung davor - eine Sperre, die nicht
-- davon abhaengt, dass genau diese Rechnung richtig bleibt.
--
-- **Wo sie sitzt:** in `public.issue_invoice`, vor der Nummernvergabe und vor
-- dem Snapshot - also **vor der Ausstellung** und **serverseitig** (Punkt 18;
-- die Oberflaeche ist nicht die Stelle, ADR-004). Nicht in
-- `app.build_invoice_document`: Ein Entwurf mit falscher Rechnung muss
-- **ansehbar** bleiben, sonst zeigt die Seite statt des Fehlers nichts.
-- Gesperrt wird der eine Vorgang, nach dem nichts mehr zu aendern ist - eine
-- ausgestellte Rechnung mit falschem Ausweis wird nicht repariert, sondern
-- storniert und neu ausgestellt (Punkt 9).
--
-- Der Riegel prueft zugleich die Pflichtangabe aus ABR-006: Ein steuerfreier
-- Posten ohne Grund der Befreiung ist eine unvollstaendige Rechnung
-- (Par. 14 Abs. 4 Nr. 8 UStG, BEF-019). Der Testfall in `pnpm test:db` ist
-- nach Punkt 18 **verbindlich**.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Riegel (ABR-007)
--
-- Prueft das fertige Dokument gegen ADR-009 Punkt 18. Fuenf Aussagen, jede
-- mit eigener Meldung, damit der Fehler benannt ist und nicht geraten werden
-- muss:
--
--   * **Nicht an der Zeile.** Ein steuerfreier oder nicht steuerbarer Posten
--     traegt weder einen Steuersatz noch einen Steuerbetrag. Zeilen fuehren
--     heute keinen Betrag mit; die Pruefung haelt das fest, statt sich darauf
--     zu verlassen.
--   * **Nicht an der Steuergruppe.** Dasselbe eine Ebene hoeher.
--   * **Nicht in der Summe.** Die ausgewiesene Gesamtsteuer ist die Summe der
--     Gruppen - eine Summe, die davon abweicht, ist ein Ausweis ohne Grundlage.
--   * **Unter Par. 19 UStG gar nicht.** Kleinunternehmerregelung heisst: kein
--     Steuerbetrag auf der ganzen Rechnung, auch an einer steuerpflichtigen
--     Position.
--   * **Der Grund steht da.** Ein steuerfreier Posten ohne Befreiungsgrund
--     ist eine unvollstaendige Rechnung (Par. 14 Abs. 4 Nr. 8 UStG) - und der
--     Mangel, den BEF-019 beschreibt. Die Pflichtangabe wird damit erzwungen
--     und nicht nur erzeugt.
--
-- Reine Funktion ueber ihr Argument: kein Tabellenzugriff, keine Rolle, keine
-- Zeit. Sie laesst sich deshalb mit einem gebauten Dokument pruefen, ohne
-- eine Rechnung dafuer zu brauchen (`pnpm test:db`, verbindlich nach Punkt 18).
-- -----------------------------------------------------------------------------
create or replace function app.assert_invoice_tax_lawful(p_document jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_klein    boolean := coalesce((p_document -> 'issuer' ->> 'small_business')::boolean, false);
  v_zeile    jsonb;
  v_gruppe   jsonb;
  v_kennung  text;
  v_steuer   integer;
  v_summe    integer := 0;
  v_gesamt   integer := coalesce((p_document -> 'totals' ->> 'tax_total_cents')::integer, 0);
begin
  -- Nicht an der Zeile.
  for v_zeile in
    select jsonb_array_elements(coalesce(p_document -> 'items', '[]'::jsonb))
  loop
    v_kennung := coalesce(v_zeile ->> 'tax_treatment', '');
    v_steuer  := coalesce((v_zeile ->> 'tax_cents')::integer, 0);

    if v_kennung <> 'taxable'
       and coalesce((v_zeile ->> 'tax_rate_permille')::integer, 0) <> 0 then
      raise exception 'tax rate on an exempt or non-taxable line (Par. 14c UStG)'
        using errcode = '23514';
    end if;

    if v_steuer <> 0 and (v_klein or v_kennung <> 'taxable') then
      raise exception 'tax shown on an exempt or non-taxable line (Par. 14c UStG)'
        using errcode = '23514';
    end if;
  end loop;

  -- Nicht an der Steuergruppe - und der Grund steht da.
  for v_gruppe in
    select jsonb_array_elements(coalesce(p_document -> 'tax_groups', '[]'::jsonb))
  loop
    v_kennung := coalesce(v_gruppe ->> 'tax_treatment', '');
    v_steuer  := coalesce((v_gruppe ->> 'tax_cents')::integer, 0);
    v_summe   := v_summe + v_steuer;

    if v_steuer <> 0 and v_kennung <> 'taxable' then
      raise exception 'tax shown on an exempt or non-taxable tax group (Par. 14c UStG)'
        using errcode = '23514';
    end if;

    if v_steuer <> 0 and v_klein then
      raise exception 'tax shown under the small business scheme (Par. 19 UStG)'
        using errcode = '23514';
    end if;

    if v_kennung in ('exempt_healthcare', 'not_taxable')
       and coalesce(btrim(v_gruppe ->> 'exemption_reason'), '') = '' then
      raise exception 'exemption reason missing (Par. 14 Abs. 4 Nr. 8 UStG)'
        using errcode = '23514';
    end if;
  end loop;

  -- Nicht in der Summe.
  if v_gesamt <> v_summe then
    raise exception 'tax total does not match the tax groups (Par. 14c UStG)'
      using errcode = '23514';
  end if;

  if v_klein and v_gesamt <> 0 then
    raise exception 'tax shown under the small business scheme (Par. 19 UStG)'
      using errcode = '23514';
  end if;
end;
$$;

comment on function app.assert_invoice_tax_lawful(jsonb) is
  'Der Par. 14c-Riegel (ABR-007, ADR-009 Punkt 18): kein Steuerbetrag an einem steuerfreien oder nicht steuerbaren Posten - nicht an der Zeile, nicht an der Steuergruppe, nicht in der Summe; unter Par. 19 UStG an der ganzen Rechnung. Verlangt zugleich den Grund der Steuerbefreiung als Pflichtangabe (Par. 14 Abs. 4 Nr. 8 UStG). Bricht mit 23514 ab; wird vor dem Ausstellen aufgerufen, nicht danach.';

revoke all on function app.assert_invoice_tax_lawful(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Ausstellen mit Riegel (ABR-007)
--
-- Uebernommen aus 20260919150000_invoices.sql, Abschnitt 12, ergaenzt um den
-- einen Aufruf. Er steht **vor** der Nummernvergabe: Eine abgewiesene
-- Ausstellung soll keine Nummer verbrauchen, auch nicht in einer
-- zurueckgerollten Transaktion.
-- -----------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_nummer   text;
  v_prefix   text;
  v_frist    smallint;
  v_dokument jsonb;
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

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is already issued' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.invoice_number_prefix, b.payment_term_days
    into v_prefix, v_frist
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  -- Ohne Absender keine Rechnung. Der Hinweis nennt die Luecke, damit die
  -- Oberflaeche nicht raten muss, was fehlt (ADR-009 Punkt 10).
  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  v_dokument := app.build_invoice_document(p_invoice_id);

  -- Der Par. 14c-Riegel (ABR-007, ADR-009 Punkt 18). Er steht hier und nicht
  -- in der Oberflaeche, weil die Steuerschuld mit dem **Ausweis** entsteht -
  -- nicht mit der Zahlung und nicht mit der Absicht. Was einmal falsch
  -- draufsteht, kostet ein Storno (Punkt 9).
  perform app.assert_invoice_tax_lawful(v_dokument);

  v_nummer := app.next_invoice_number(v_org, extract(year from v_heute)::smallint, v_prefix);

  -- Der Snapshot traegt Nummer und Daten mit: Er ist das Dokument, nicht ein
  -- Teil davon (ADR-009 Punkt 11).
  v_dokument := v_dokument || jsonb_build_object(
    'invoice_number', v_nummer,
    'issued_on', v_heute,
    'due_on', v_heute + v_frist::integer
  );

  update public.invoices
     set status          = 'issued',
         invoice_number  = v_nummer,
         issued_on       = v_heute,
         issued_at       = now(),
         issued_by       = v_actor,
         due_on          = v_heute + v_frist::integer,
         total_cents     = (v_dokument -> 'totals' ->> 'total_cents')::integer,
         tax_total_cents = (v_dokument -> 'totals' ->> 'tax_total_cents')::integer,
         currency        = v_dokument ->> 'currency',
         snapshot        = v_dokument
   where id = p_invoice_id;

  -- Die Leistung ist ab jetzt abgerechnet; ihr Entfernen laeuft nur noch ueber
  -- Storno (ADR-009 Punkt 9). Denselben Schreiber hat ABR-002 angekuendigt.
  update public.billable_services b
     set status = 'invoiced'
   where b.id in (select it.billable_service_id
                  from public.invoice_items it
                  where it.invoice_id = p_invoice_id);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.issued', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_nummer,
                       'total_cents', (v_dokument -> 'totals' ->> 'total_cents')::integer)
  );

  return v_nummer;
end;
$$;

comment on function public.issue_invoice(uuid) is
  'Stellt einen Rechnungsentwurf aus: Par. 14c-Riegel pruefen, Nummer vergeben, Snapshot schreiben, Leistungen auf "invoiced" setzen - in einer Transaktion (ADR-009 Punkte 8 bis 10 und 18). Danach ist die Rechnung unveraenderlich.';

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;
