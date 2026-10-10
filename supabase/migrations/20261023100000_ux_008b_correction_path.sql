-- =============================================================================
-- UX-008b (UX-EPIC-008, BEF-062 Teil 1): Nach einem Storno fuehrt genau ein
-- Weg zur neuen Rechnung - die Korrekturrechnung mit ihrem Bezug
--
-- Entscheidung Jannes 2026-10-09 (BEF-062 (1) b): Nach dem Storno standen die
-- Leistungen unter "Abzurechnen" mit dem gewohnten "Entwurf anlegen" - ohne
-- Bezug zur stornierten Rechnung. Wer diesen Weg nahm, bekam eine Rechnung
-- ohne den Satz "Korrekturrechnung zur stornierten Rechnung ..."; beim
-- Empfaenger lagen dann zwei Rechnungen ueber dieselben Leistungen ohne
-- Bezug (ADR-009 Punkt 9). Jetzt
--
--   * nennt die Zeile unter "Abzurechnen" die stornierte Rechnung, aus der
--     ihre Leistungen stammen (list_invoice_candidates, drei Spalten), und
--     die Oberflaeche bietet dort nur "Korrekturrechnung erstellen";
--   * bekommt jede stornierte Rechnung ihre eigene Korrektur: Die Korrektur
--     nimmt keine Leistung, die eine andere offene Stornierung haelt;
--   * weist das Datenmodell jeden anderen Weg ab: Eine Zeile, deren Leistung
--     aus einer stornierten Rechnung **derselben Klammer** ohne Korrektur
--     stammt, kommt nur auf deren Korrekturrechnung (Trigger auf
--     invoice_items, gilt fuer jeden Entwurfsweg - Monat, Grundlage,
--     Training - und jeden kuenftigen).
--
-- "Derselben Klammer" (ANN-321): Person bzw. Trainingsverhaeltnis, Bereich und
-- Grundlage, ohne Grundlage der Monat - dieselbe Klammer, nach der
-- create_correction_draft die Leistungen einsammelt. Liegt ein Termin
-- inzwischen auf einer anderen Grundlage (CAL-022), gehoert seine Leistung
-- nicht mehr zur Korrektur und bleibt auf dem gewohnten Weg abrechenbar;
-- sonst saesse sie fest.
--
-- "Ohne Korrektur": Keine Rechnung verweist mit replaces_invoice_id auf sie.
-- Ein verworfener Korrekturentwurf ist geloescht; danach ist die stornierte
-- Rechnung wieder offen.
--
-- Keine Spalte, keine Tabelle, kein Auditeintrag (ADR-010: das Datenmodell
-- weist nach - replaces_invoice_id an der Korrektur).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die eine Bedingung: Haelt eine offene Stornierung diese Leistung?
--
-- Offen ist eine stornierte Rechnung, solange keine Rechnung (Entwurf oder
-- ausgestellt) mit replaces_invoice_id auf sie verweist. Sie haelt eine
-- Leistung, die sie freigegeben hat, wenn die Leistung in ihrer Klammer liegt
-- (ANN-321). Trigger, Korrekturentwurf und Arbeitsliste fragen nur hier.
-- -----------------------------------------------------------------------------
create function app.open_cancellation_holding_service(
  p_billable_service_id      uuid,
  p_patient_id               uuid,
  p_training_relationship_id uuid,
  p_service_area             text,
  p_treatment_basis_id       uuid,
  p_period_month             date,
  p_except_invoice_id        uuid default null
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id
  from public.invoice_items alt
  join public.invoices s on s.id = alt.invoice_id
  where alt.billable_service_id = p_billable_service_id
    and alt.released_at is not null
    and s.status = 'issued'
    and s.id is distinct from p_except_invoice_id
    and exists (select 1 from public.invoice_cancellations x where x.invoice_id = s.id)
    and not exists (select 1 from public.invoices r where r.replaces_invoice_id = s.id)
    and s.patient_id is not distinct from p_patient_id
    and s.training_relationship_id is not distinct from p_training_relationship_id
    and s.service_area = p_service_area
    and s.treatment_basis_id is not distinct from p_treatment_basis_id
    and (p_treatment_basis_id is not null or s.period_month = p_period_month)
  order by s.issued_at desc
  limit 1
$$;

comment on function app.open_cancellation_holding_service(uuid, uuid, uuid, text, uuid, date, uuid) is
  'UX-008b (BEF-062, ANN-321): die stornierte Rechnung ohne Korrektur, die diese Leistung freigegeben hat und in derselben Klammer liegt - sonst null. Die eine Stelle fuer Trigger, Korrekturentwurf und Arbeitsliste.';

revoke all on function app.open_cancellation_holding_service(uuid, uuid, uuid, text, uuid, date, uuid)
  from public, anon, authenticated;

-- Die Frage oben sucht freigegebene Zeilen je Leistung; der vorhandene
-- Index invoice_items_service_key traegt nur die nicht freigegebenen.
create index invoice_items_released_service_idx
  on public.invoice_items (billable_service_id)
  where released_at is not null;

-- -----------------------------------------------------------------------------
-- 2. Die Sperre im Datenmodell
--
-- Gehalten ist eine Leistung nur fuer die Korrektur genau dieser stornierten
-- Rechnung. Auch die Korrektur einer anderen Stornierung derselben Klammer
-- nimmt sie nicht: Jede stornierte Rechnung bekommt ihre eigene Korrektur,
-- damit die Kette und die Verrechnung (ANN-215) eindeutig bleiben.
-- -----------------------------------------------------------------------------
create function app.invoice_item_not_from_open_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_neu    record;
  v_storno uuid;
begin
  select i.* into v_neu from public.invoices i where i.id = new.invoice_id;

  -- Ausgestellte Rechnungen haelt invoice_items_frozen fest.
  if not found or v_neu.status <> 'draft' then
    return new;
  end if;

  v_storno := app.open_cancellation_holding_service(
    new.billable_service_id, v_neu.patient_id, v_neu.training_relationship_id,
    v_neu.service_area, v_neu.treatment_basis_id, v_neu.period_month,
    v_neu.replaces_invoice_id
  );

  if v_storno is not null then
    raise exception 'services of a cancelled invoice are billed on its correction (create_correction_draft)'
      using errcode = '23514', detail = v_storno::text;
  end if;

  return new;
end;
$$;

comment on function app.invoice_item_not_from_open_cancellation() is
  'UX-008b (BEF-062): Eine Leistung aus einer stornierten Rechnung derselben Klammer ohne Korrektur kommt nur auf deren Korrekturrechnung (ADR-009 Punkt 9, ANN-079, ANN-321). Die Kennung der stornierten Rechnung steht im DETAIL der Meldung.';

revoke all on function app.invoice_item_not_from_open_cancellation() from public, anon, authenticated;

-- "b_": nach a_invoice_items_area_from_service, das den Bereich der Zeile
-- setzt; der Name bestimmt die Reihenfolge gleichartiger Trigger. Auch beim
-- Umhaengen einer Zeile, wie a_invoice_items_area_from_service - heute aendert
-- kein Weg diese Spalten, ein kuenftiger soll nicht vorbeifuehren.
create trigger b_invoice_items_not_from_open_cancellation
  before insert or update of invoice_id, billable_service_id on public.invoice_items
  for each row execute function app.invoice_item_not_from_open_cancellation();

-- -----------------------------------------------------------------------------
-- 3. Die Korrektur nimmt nur, was ihr gehoert
--
-- Aus der geltenden Fassung (20261014110000_ang_002_aftercare_months.sql)
-- uebernommen; neu ist nur die mit UX-008b markierte Bedingung. Liegen zwei
-- stornierte Rechnungen ohne Korrektur in einer Klammer, sammelte die erste
-- Korrektur sonst die Leistungen der zweiten ein, und beide Korrekturen
-- scheiterten aneinander (Zweitreview B1).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_correction_draft(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where i.organization_id = v_org
      and i.patient_id is not distinct from v_alt.patient_id
      and i.training_relationship_id is not distinct from v_alt.training_relationship_id
      and i.service_area = v_alt.service_area
      and i.status = 'draft'
      -- ABR-032: dieselbe Klammer - die Grundlage, ohne sie der Monat.
      and i.treatment_basis_id is not distinct from v_alt.treatment_basis_id
      and (v_alt.treatment_basis_id is not null or i.period_month = v_alt.period_month)
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, training_relationship_id, recipient_id, period_month,
    service_area, replaces_invoice_id, treatment_basis_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.training_relationship_id, v_alt.recipient_id,
          v_alt.period_month, v_alt.service_area, p_invoice_id, v_alt.treatment_basis_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und damit keine Grundlage.
    left join public.appointments a     on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      -- ABR-032: dieselbe Klammer wie die stornierte Rechnung - die Grundlage,
      -- ohne sie der Monat, und dann nur Leistungen ohne Grundlage (die
      -- gehoeren auf die Rechnung ihrer Verordnung).
      and (
        (v_alt.treatment_basis_id is not null and a.treatment_basis_id = v_alt.treatment_basis_id)
        or (v_alt.treatment_basis_id is null
            and a.treatment_basis_id is null
            and date_trunc('month', b.performed_on)::date = v_alt.period_month)
      )
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
      -- UX-008b: Leistungen, die eine andere offene Stornierung derselben
      -- Klammer haelt, gehoeren auf deren eigene Korrektur (ANN-321).
      and app.open_cancellation_holding_service(
            b.id, v_alt.patient_id, v_alt.training_relationship_id, v_alt.service_area,
            v_alt.treatment_basis_id, v_alt.period_month, p_invoice_id) is null
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;


  return v_id;
end;
$function$;

comment on function public.create_correction_draft(uuid) is
  'Legt zu einer stornierten Rechnung den Entwurf der Korrekturrechnung an und verweist von ihm auf die ersetzte Rechnung (ABR-003c, ADR-009 Punkt 9, R3-009). Nimmt alle wieder freien Leistungen der Klammer der stornierten Rechnung auf (ANN-077, ABR-009, TRN-008, ABR-032) - seit UX-008b ohne die, die eine andere offene Stornierung haelt (ANN-321); sperrt die Rechnung, damit zwei gleichzeitige Aufrufe nicht im Unique-Index enden.';

-- -----------------------------------------------------------------------------
-- 4. Die Zeile unter "Abzurechnen" nennt die Herkunft
--
-- Aus der geltenden Fassung (20261014110000_ang_002_aftercare_months.sql)
-- uebernommen; neu sind nur die mit UX-008b markierten Stellen. Die
-- Rueckgabe waechst um zwei Spalten, deshalb drop und create.
-- -----------------------------------------------------------------------------
drop function public.list_invoice_candidates(integer);

CREATE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid, treatment_basis_id uuid, basis_kind text, basis_issued_on date, first_performed_on date, last_performed_on date, cancelled_invoice_id uuid, cancelled_invoice_number text, draft_replaces_invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
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

  -- Erst buendeln, dann den Entwurf dazusuchen (BEF-018). Der Bereich steht
  -- seit ABR-009 in beiden Schritten: Er ist der dritte Schluessel der
  -- Klammer und nicht eine Spalte, die nebenher mitlaeuft.
  return query
  select k.patient_id,
         k.training_relationship_id,
         k.patient_name,
         k.period_month,
         k.service_area,
         k.service_count,
         k.total_cents,
         k.currency,
         (entwurf.id is not null),
         entwurf.id,
         k.treatment_basis_id,
         tb.treatment_basis_kind,
         tb.issued_on,
         k.erste,
         k.letzte,
         -- UX-008b: die stornierte Rechnung, aus der die Leistungen stammen.
         storno.id,
         storno.invoice_number,
         -- Ist der stehende Entwurf selbst eine Korrektur, welche?
         ersetzt.invoice_number
  from (
    select b.patient_id,
           b.training_relationship_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           -- ABR-032: Mit Grundlage ist sie die Klammer und der Monat nennt
           -- nur den Beginn; ohne Grundlage ist es der Kalendermonat der
           -- Gruppe - in beiden Faellen der Monat der ersten Leistung.
           date_trunc('month', min(b.performed_on))::date as period_month,
           a.treatment_basis_id,
           min(b.performed_on) as erste,
           max(b.performed_on) as letzte,
           b.service_area,
           count(*)::integer as service_count,
           -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
           sum(app.billable_service_amount(b.id))::integer as total_cents,
           max(c.currency) as currency,
           -- UX-008b: Welche Leistungen die Gruppe traegt - fuer die Frage,
           -- ob sie aus einer stornierten Rechnung stammen.
           array_agg(b.id) as leistungen
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und buendelt nach dem Monat.
    left join public.appointments a on a.id = b.appointment_id
    left join public.patients p on p.id = b.patient_id
    left join public.training_relationships t on t.id = b.training_relationship_id
    join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
    where b.organization_id = v_org
      and b.status = 'billable'
      -- Seit ABR-003c zaehlt nur eine Zeile, die nicht freigegeben ist: Nach
      -- einem Storno ist die Leistung wieder abzurechnen.
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, b.training_relationship_id, a.treatment_basis_id,
             case when a.treatment_basis_id is null
                  then date_trunc('month', b.performed_on)::date end,
             b.service_area
  ) k
  left join public.treatment_bases tb on tb.id = k.treatment_basis_id
  left join lateral (
    select i.id
    from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from k.patient_id
      and i.training_relationship_id is not distinct from k.training_relationship_id
      and i.service_area = k.service_area
      and i.status = 'draft'
      and i.treatment_basis_id is not distinct from k.treatment_basis_id
      and (k.treatment_basis_id is not null or i.period_month = k.period_month)
    limit 1
  ) entwurf on true
  -- UX-008b (BEF-062): Stammen Leistungen der Gruppe aus einer stornierten
  -- Rechnung derselben Klammer, die noch keine Korrektur hat, fuehrt nur
  -- deren Korrekturrechnung weiter - bei zweien die zuletzt ausgestellte.
  left join lateral (
    select s.id, s.invoice_number
    from unnest(k.leistungen) l(id)
    join public.invoices s on s.id = app.open_cancellation_holding_service(
      l.id, k.patient_id, k.training_relationship_id, k.service_area,
      k.treatment_basis_id, k.period_month)
    order by s.issued_at desc
    limit 1
  ) storno on true
  left join public.invoices entwurf_zeile on entwurf_zeile.id = entwurf.id
  left join public.invoices ersetzt on ersetzt.id = entwurf_zeile.replaces_invoice_id
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

comment on function public.list_invoice_candidates(integer) is
  'Was abzurechnen ist (ABR-003, ABR-032): je Person und Behandlungsgrundlage, ohne Grundlage je Person, Monat und Bereich, mit Anzahl, Betrag, Zeitraum und einem schon stehenden Entwurf. Seit UX-008b mit der stornierten Rechnung derselben Klammer, aus der Leistungen stammen und die noch keine Korrektur hat, und der Nummer, die ein stehender Korrekturentwurf ersetzt (BEF-062, ANN-321). owner und office.';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;
