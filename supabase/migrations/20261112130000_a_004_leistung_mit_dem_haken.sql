-- =============================================================================
-- B7 (BEF-157, Auftrag Jannes 14.10.2026, ADR-009 Fassung 6): Mit dem Haken gilt
-- die Leistung als erbracht - die Therapeut:in bestaetigt keine Heilmittel mehr.
--
-- Bisher (ANN-475, ANN-140): Nach dem Festschreiben bestaetigte die
-- Therapeut:in die vorbelegten Heilmittel mit einem Tipp
-- (`record_billable_services`); erst dann entstanden Leistung, Terminhonorar
-- und genutzte Menge der Grundlage.
--
-- Neu (ANN-513): Sobald ein Behandlungstermin abgehakt UND seine Doku
-- festgeschrieben ist - gleich in welcher Reihenfolge -, entstehen die
-- Leistungen von selbst: je Heilmittel der Behandlungsgrundlage, das noch
-- Menge hat und in der am Leistungstag geltenden Preisliste steht, eine
-- Einheit (dieselbe Vorbelegung wie `get_billable_service_draft`), dazu genau
-- einmal das Terminhonorar (ADR-009 Punkt 22). Paragraf 19 bleibt gewahrt:
-- Ohne finalisierte Dokumentation entsteht nichts, abgerechnet wird weiter nur
-- aus 'documented'.
--
-- Was die Erfassung NICHT tut:
--   * Sie haelt den Haken und die Finalisierung nie auf. Fehlt das
--     Terminhonorar oder die Preisliste, ist die Menge erschoepft oder kommt
--     ein paralleler Vorgang dazwischen, entsteht nichts, und der Termin steht
--     wie bisher unter „Zu erfassen“ (Buero, `list_open_billable_appointments`).
--   * Termine ohne Grundlage erfasst sie nicht - dort gibt es kein
--     verordnetes Heilmittel; das Buero erfasst sie wie bisher.
--   * Ein Ausfallhonorar (fee_basis) bleibt beim Buero (ADR-018 Punkt 4).
--   * Ein Besuch ohne Behandlung (Pflichtvermerk, CAL-018) ist keine
--     Ausnahme: Er gilt als durchgefuehrt und wird normal abgerechnet
--     (PROJECT_PRINCIPLES.md §8, ADR-018 Punkt 9 Nr. 2); wie die Rechnung ihn
--     benennt, bleibt Teil von B4.
--
-- Dazu zaehlt `used` der Grundlage nur noch abgehakte Termine: Ein
-- dokumentierter Termin ohne Haken ist seit B4 nicht erbracht.
-- =============================================================================

-- ANN-513: Leistung entsteht aus Haken und Doku, vorbelegt aus der Grundlage.
create function app.record_default_services(p_appointment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a            record;
  v_actor        uuid;
  v_performed_on date;
  v_version      uuid;
  v_honorar      record;
  v_anzahl       integer;
begin
  select a.id, a.organization_id, a.patient_id, a.kind, a.status, a.completed_at,
         a.completed_by, a.treatment_basis_id, a.fee_basis
    into v_a
  from public.appointments a
  where a.id = p_appointment_id;

  if not found
     or v_a.kind <> 'therapy'
     or v_a.status <> 'documented'
     or v_a.completed_at is null
     or v_a.treatment_basis_id is null
     or v_a.fee_basis is not null
     or v_a.patient_id is null then
    return 0;
  end if;

  if exists (select 1 from public.billable_services b where b.appointment_id = p_appointment_id) then
    return 0;
  end if;

  -- Tuer geoeffnet, aber nicht behandelt (Hausbesuch-Szenario 1, CAL-018):
  -- Der Termin gilt als durchgefuehrt und wird normal abgerechnet
  -- (PROJECT_PRINCIPLES.md §8, ADR-018 Punkt 9 Nr. 2) - keine Ausnahme hier.
  -- Wie die Rechnung den Fall benennt, bleibt Teil von B4.

  -- Wer abgehakt oder festgeschrieben hat; im naechtlichen Lauf der
  -- automatischen Finalisierung die Person, die abgehakt hat.
  v_actor := coalesce(auth.uid(), v_a.completed_by);

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_a.organization_id, v_performed_on);
  if v_version is null then
    return 0;
  end if;

  select h.amount_cents, h.source, h.fee_agreement_id
    into v_honorar
  from app.session_fee_on(v_a.patient_id, v_performed_on) h;
  if v_honorar.amount_cents is null then
    return 0;
  end if;

  begin
    insert into public.billable_services (
      organization_id, patient_id, training_relationship_id, appointment_id, catalog_item_id,
      treatment_base_item_id, quantity, performed_on, created_by
    )
    select v_a.organization_id, v_a.patient_id, null, p_appointment_id, i.id,
           p.id, 1, v_performed_on, v_actor
    from public.treatment_base_items p
    join lateral (
      select c.id
      from public.service_catalog_items c
      where c.catalog_version_id = v_version
        and c.item_kind = 'treatment'
        and c.service_area = 'therapy'
        and c.remedy = p.remedy
      order by c.sort_order, c.id
      limit 1
    ) i on true
    where p.treatment_basis_id = v_a.treatment_basis_id
      and p.used_quantity < p.prescribed_quantity;

    get diagnostics v_anzahl = row_count;
    if v_anzahl = 0 then
      return 0;
    end if;

    insert into public.appointment_session_fees (
      organization_id, appointment_id, amount_cents, source, fee_agreement_id,
      catalog_version_id, performed_on, created_by
    )
    values (
      v_a.organization_id, p_appointment_id, v_honorar.amount_cents, v_honorar.source,
      v_honorar.fee_agreement_id, v_version, v_performed_on, v_actor
    );

    update public.treatment_base_items p
       set used_quantity = p.used_quantity + b.menge
    from (
      select treatment_base_item_id, sum(quantity)::smallint as menge
      from public.billable_services
      where appointment_id = p_appointment_id and treatment_base_item_id is not null
      group by treatment_base_item_id
    ) b
    where p.id = b.treatment_base_item_id;
  exception
    -- Ein paralleler Vorgang hat schon erfasst (unique) oder die Menge ist
    -- inzwischen erschoepft (check): Dann bleibt es beim Buero.
    when unique_violation or check_violation then
      return 0;
  end;

  return v_anzahl;
end;
$$;

revoke all on function app.record_default_services(uuid) from public, anon, authenticated;

comment on function app.record_default_services(uuid) is
  'B7 (BEF-157, ANN-513, ADR-009 Fassung 6): erfasst die Leistungen eines abgehakten und dokumentierten Behandlungstermins mit Grundlage von selbst - je Heilmittel der Grundlage mit Restmenge eine Einheit, dazu das Terminhonorar. Haelt Haken und Finalisierung nie auf; ohne Grundlage, Preisliste oder Honorar entsteht nichts (Buero: Zu erfassen).';

create function app.appointments_record_default_services()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.record_default_services(new.id);
  return null;
end;
$$;

revoke all on function app.appointments_record_default_services() from public, anon, authenticated;

create trigger appointments_record_default_services
  after update of status, completed_at, treatment_basis_id on public.appointments
  for each row
  when (new.kind = 'therapy' and new.status = 'documented' and new.completed_at is not null)
  execute function app.appointments_record_default_services();

comment on trigger appointments_record_default_services on public.appointments is
  'B7 (ANN-513): Haken und festgeschriebene Doku zusammen - in beliebiger Reihenfolge, auch nach einer spaeteren Zuordnung zur Grundlage - erfassen die Leistungen.';

-- -----------------------------------------------------------------------------
-- Genutzt heisst seit B4/B7: abgehakt. Rumpf aus 20261002120000_abn_001,
-- geaendert ist nur die Zaehlbedingung fuer `used`.
-- -----------------------------------------------------------------------------
create or replace function app.treatment_basis_slot_counts(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  OUT prescribed integer,
  OUT used integer,
  OUT planned integer,
  OUT remaining integer,
  OUT covered integer,
  OUT uncovered integer
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Die Terminzahl kommt aus der Grundlage selbst (ANN-064).
  select b.appointment_count
    into prescribed
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = p_organization_id;

  -- Genutzt ist eine Terminzahl: die erbrachten Termine der Grundlage
  -- (ABN-001, ANN-210). Seit B4/B7 (ANN-513) heisst erbracht: abgehakt - ein
  -- dokumentierter Termin ohne Haken zaehlt noch nicht.
  select count(*)
    into used
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status in ('completed', 'documented', 'invoiced')
    and (a.completed_at is not null or a.status = 'invoiced');

  -- Verplant ist jeder Termin, der stattfindet oder stattgefunden hat.
  -- Abgesagt und nicht angetroffen geben den Platz zurueck.
  select count(*)
    into planned
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status not in ('cancelled', 'no_show');

  remaining := greatest(coalesce(prescribed, 0) - greatest(coalesce(used, 0), planned), 0);

  -- CAL-022: Gedeckt sind hoechstens so viele Termine, wie die Grundlage
  -- moeglich macht; alles darueber ist geplant, aber ungedeckt.
  covered   := least(coalesce(prescribed, 0), planned);
  uncovered := greatest(planned - coalesce(prescribed, 0), 0);
end;
$$;

comment on function app.treatment_basis_slot_counts(uuid, uuid) is
  'Kontingent einer Behandlungsgrundlage, gezaehlt in Terminen (VER-EPIC-002, ANN-064): moegliche Termine aus appointment_count, genutzte aus den abgehakten Terminen (seit B4/B7, ANN-513), verplante aus den Terminen ohne cancelled und no_show (ANN-038, ANN-067), offen ist die Differenz zum groesseren der beiden. Seit CAL-022 dazu gedeckt und ungedeckt. Nur fuer die serverseitigen Lese- und Schreibpfade.';
