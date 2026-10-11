-- =============================================================================
-- BEF-128: Ein Abo-Monat laesst sich nach einem Storno zuruecknehmen
-- (Zweitreview ANG-EPIC-002, derselbe Fehler am Trainingspaket dort behoben)
--
-- Nach einem Storno ist die Rechnungszeile freigegeben (`released_at`), zeigt
-- aber weiter mit RESTRICT auf die Leistung. `delete_aftercare_month` loeschte
-- die Leistung, ohne diese Zeilen vorher zu entfernen, und scheiterte an
-- `invoice_items_billable_service_id_fkey`.
--
-- Jetzt wie in `delete_billable_services` und `delete_training_package`:
-- Freigegebene Zeilen fallen mit ihrer Leistung. Was die stornierte Rechnung
-- ausgewiesen hat, steht in ihrem Snapshot (ADR-009 Punkt 10). Eine nicht
-- freigegebene Zeile - Entwurf, ausgestellte oder Korrekturrechnung - weist
-- die Funktion wie bisher ab. Rechte und Rueckgabe unveraendert.
-- =============================================================================

create or replace function public.delete_aftercare_month(p_billable_service_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    raise exception 'not allowed to manage aftercare subscriptions' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  -- Zweitreview: erst die eigene Praxis, dann der Zustand - eine fremde
  -- Kennung erfaehrt nichts ueber ihren Datensatz.
  perform 1 from public.billable_services b
  where b.id = p_billable_service_id
    and b.organization_id = v_org
    and b.aftercare_subscription_id is not null
  for update;
  if not found then
    raise exception 'aftercare month not found' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.invoice_items it
    where it.billable_service_id = p_billable_service_id and it.released_at is null
  ) then
    raise exception 'aftercare month is on an invoice' using errcode = '23514';
  end if;

  -- BEF-128: Freigegebene Rechnungszeilen fallen mit ihrer Leistung, wie in
  -- delete_billable_services und delete_training_package. Eine nicht
  -- freigegebene Zeile hat der Block darueber abgewiesen.
  delete from public.invoice_items it
   where it.billable_service_id = p_billable_service_id
     and it.released_at is not null;

  delete from public.billable_services b
  where b.id = p_billable_service_id and b.status = 'billable';
  if not found then
    raise exception 'aftercare month is on an invoice' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.delete_aftercare_month(uuid) from public, anon;
grant execute on function public.delete_aftercare_month(uuid) to authenticated;

comment on function public.delete_aftercare_month(uuid) is
  'ANG-002: die Erfassung eines Abo-Monats zuruecknehmen (owner, office), solange er auf keiner Rechnung steht. Seit BEF-128 auch nach einem Storno: Die freigegebene Rechnungszeile faellt mit der Leistung.';
