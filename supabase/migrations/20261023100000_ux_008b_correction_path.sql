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
--     ihre Leistungen stammen (list_invoice_candidates, zwei Spalten), und
--     die Oberflaeche bietet dort nur "Korrekturrechnung erstellen";
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
-- 1. Die Sperre im Datenmodell
-- -----------------------------------------------------------------------------
create function app.invoice_item_not_from_open_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_neu    record;
  v_storno record;
begin
  select i.* into v_neu from public.invoices i where i.id = new.invoice_id;

  -- Ausgestellte Rechnungen haelt invoice_items_frozen fest.
  if not found or v_neu.status <> 'draft' then
    return new;
  end if;

  select s.id, s.invoice_number into v_storno
  from public.invoice_items alt
  join public.invoices s on s.id = alt.invoice_id
  where alt.billable_service_id = new.billable_service_id
    and alt.released_at is not null
    and s.id is distinct from v_neu.replaces_invoice_id
    and exists (select 1 from public.invoice_cancellations x where x.invoice_id = s.id)
    and not exists (select 1 from public.invoices r where r.replaces_invoice_id = s.id)
    and s.patient_id is not distinct from v_neu.patient_id
    and s.training_relationship_id is not distinct from v_neu.training_relationship_id
    and s.service_area = v_neu.service_area
    and s.treatment_basis_id is not distinct from v_neu.treatment_basis_id
    and (v_neu.treatment_basis_id is not null or s.period_month = v_neu.period_month)
  limit 1;

  if found then
    raise exception 'services of a cancelled invoice are billed on its correction (create_correction_draft)'
      using errcode = '23514', detail = v_storno.id::text;
  end if;

  return new;
end;
$$;

comment on function app.invoice_item_not_from_open_cancellation() is
  'UX-008b (BEF-062): Eine Leistung aus einer stornierten Rechnung derselben Klammer ohne Korrektur kommt nur auf deren Korrekturrechnung (ADR-009 Punkt 9, ANN-079). Die Kennung der stornierten Rechnung steht im DETAIL der Meldung.';

revoke all on function app.invoice_item_not_from_open_cancellation() from public, anon, authenticated;

-- "b_": nach a_invoice_items_area_from_service, das den Bereich der Zeile
-- setzt; der Name bestimmt die Reihenfolge gleichartiger Trigger.
create trigger b_invoice_items_not_from_open_cancellation
  before insert on public.invoice_items
  for each row execute function app.invoice_item_not_from_open_cancellation();

-- -----------------------------------------------------------------------------
-- 2. Die Zeile unter "Abzurechnen" nennt die Herkunft
--
-- Aus der geltenden Fassung (20261014110000_ang_002_aftercare_months.sql)
-- uebernommen; neu sind nur die mit UX-008b markierten Stellen. Die
-- Rueckgabe waechst um zwei Spalten, deshalb drop und create.
-- -----------------------------------------------------------------------------
drop function public.list_invoice_candidates(integer);

CREATE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid, treatment_basis_id uuid, basis_kind text, basis_issued_on date, first_performed_on date, last_performed_on date, cancelled_invoice_id uuid, cancelled_invoice_number text)
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
         storno.invoice_number
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
  -- deren Korrekturrechnung weiter. Dieselbe Bedingung wie
  -- app.invoice_item_not_from_open_cancellation.
  left join lateral (
    select s.id, s.invoice_number
    from public.invoices s
    where s.organization_id = v_org
      and s.status = 'issued'
      and exists (select 1 from public.invoice_cancellations x where x.invoice_id = s.id)
      and not exists (select 1 from public.invoices r where r.replaces_invoice_id = s.id)
      and s.patient_id is not distinct from k.patient_id
      and s.training_relationship_id is not distinct from k.training_relationship_id
      and s.service_area = k.service_area
      and s.treatment_basis_id is not distinct from k.treatment_basis_id
      and (k.treatment_basis_id is not null or s.period_month = k.period_month)
      and exists (
        select 1 from public.invoice_items alt
        where alt.invoice_id = s.id
          and alt.released_at is not null
          and alt.billable_service_id = any (k.leistungen)
      )
    order by s.issued_at desc
    limit 1
  ) storno on true
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

comment on function public.list_invoice_candidates(integer) is
  'Was abzurechnen ist (ABR-003, ABR-032): je Person und Behandlungsgrundlage, ohne Grundlage je Person, Monat und Bereich, mit Anzahl, Betrag, Zeitraum und einem schon stehenden Entwurf. Seit UX-008b mit der stornierten Rechnung derselben Klammer, aus der Leistungen stammen und die noch keine Korrektur hat (BEF-062). owner und office.';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;
