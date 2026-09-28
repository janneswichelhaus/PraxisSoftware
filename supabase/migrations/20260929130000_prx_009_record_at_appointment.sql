-- =============================================================================
-- Termin abhaken: Heilmittel bestaetigen am eigenen Termin (PRX-EPIC-002, PRX-009)
--
-- Nach der Behandlung bestaetigt die behandelnde Person, welche Heilmittel
-- der Grundlage sie tatsaechlich geleistet hat - vorbelegt aus der Verordnung
-- (IDEA-PRX-039). Das ist die Oberflaeche der Leistungserfassung aus ABR-002,
-- kein zweiter Weg: Geschrieben wird ueber record_billable_services, mit
-- allen seinen Regeln.
--
--   * WER (ANN-140, loest ANN-071 ab). owner und office erfassen weiter an
--     jedem Termin. therapist und team_lead erfassen an ihrem EIGENEN Termin
--     (appointments.staff_member_id ist ihre Beschaeftigtenkennung) - wer den
--     Termin gemacht hat, weiss, was geleistet wurde. Zuruecknehmen bleibt
--     bei owner und office (delete_billable_services unveraendert): Abhaken
--     laesst sich nicht durch erneutes Antippen rueckgaengig machen.
--   * DIE KOPPLUNG BLEIBT. Erfasst wird nur aus "dokumentiert" oder aus einem
--     Gebuehrenanlass, ohne Override (PROJECT_PRINCIPLES.md 19, ANN-072);
--     das Kontingent bleibt durch used_quantity <= prescribed_quantity
--     geschuetzt (ADR-020 Punkt 5), die Mehrfachabrechnung durch das Modell.
--   * KEINE RECHNUNG. Ist das Kontingent erreicht, sagt die Oberflaeche es;
--     die Rechnung entsteht weiter im Buero (ABR-003, ANN-077).
--   * LESEN AM TERMIN. get_appointment_services zeigt, was am Termin erfasst
--     ist, und die Mengen der Grundlage - fuer dieselben Rollen wie das
--     Erfassen, dazu alle, die Leistungen lesen duerfen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer an diesem Termin erfassen darf
-- -----------------------------------------------------------------------------
create function app.can_record_services_for_appointment(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_record_billable_services()
      or (
        app.has_any_role('therapist', 'team_lead')
        and exists (
          select 1
          from public.appointments a
          join public.staff_members sm on sm.id = a.staff_member_id
          where a.id = p_appointment_id
            and a.organization_id = app.current_organization_id()
            and sm.person_id = app.current_person_id()
        )
      )
$$;

comment on function app.can_record_services_for_appointment(uuid) is
  'PRX-009 (ANN-140): Darf der Aufrufer an diesem Termin Leistungen erfassen? owner und office an jedem Termin der Organisation, therapist und team_lead an ihrem eigenen (Beschaeftigtenkennung des Termins). Zuruecknehmen regelt weiter app.can_record_billable_services.';

revoke all on function app.can_record_services_for_appointment(uuid) from public, anon;
grant execute on function app.can_record_services_for_appointment(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Vorschlag am Termin (Rumpf aus
-- 20260923120000_abgewiesene_lesezugriffe_rest.sql, nur die Rollenpruefung neu)
-- -----------------------------------------------------------------------------
create or replace function public.get_billable_service_draft(p_appointment_id uuid)
 RETURNS TABLE(catalog_item_id uuid, code text, label text, item_kind text, unit_price_cents integer, currency text, tax_treatment text, tax_rate_permille smallint, service_area text, suggested boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_kind         text;
  v_bereich      text;
  v_performed_on date;
  v_version      uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen. Die Pruefung braucht den Termin und steht deshalb in
  -- app.can_record_services_for_appointment.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to record billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  select a.status, a.fee_basis, a.treatment_basis_id, a.kind
    into v_status, v_fee_basis, v_basis, v_kind
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  v_bereich := app.service_area_of_appointment_kind(v_kind);
  if v_bereich is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  -- Die Reihenfolge der Preisliste bleibt die Reihenfolge des Vorschlags.
  return query
  select i.id, i.code, i.label, i.item_kind, i.unit_price_cents, i.currency,
         i.tax_treatment, i.tax_rate_permille, i.service_area,
         case
           when v_fee_basis is not null then i.item_kind = 'absence_fee'
           else i.remedy is not null
                and exists (
                  select 1 from public.treatment_base_items p
                  where p.treatment_basis_id = v_basis and p.remedy = i.remedy
                )
         end as suggested
  from public.service_catalog_items i
  where i.catalog_version_id = v_version
    and i.item_kind = case when v_fee_basis is not null then 'absence_fee' else 'treatment' end
    and i.service_area = v_bereich
  order by i.sort_order;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 3. Erfassen (Rumpf aus 20260919110000_billable_services.sql; neu sind die
-- Rollenpruefung und ein Merkmal im Auditkontext)
-- -----------------------------------------------------------------------------
create or replace function public.record_billable_services(
  p_appointment_id uuid,
  p_items          jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_patient      uuid;
  v_performed_on date;
  v_version      uuid;
  v_erwartet     text;
  v_anzahl       integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen. Ein fremder Termin ist von einem unbekannten nicht zu
  -- unterscheiden - beide scheitern hier gleich.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select a.status, a.fee_basis, a.treatment_basis_id, a.patient_id
    into v_status, v_fee_basis, v_basis, v_patient
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  -- Paragraf 19, abschliessend: dokumentiert oder Gebuehrenanlass. Kein
  -- Override in V1 (ANN-072).
  if v_fee_basis is null and v_status <> 'documented' then
    raise exception 'appointment is neither documented nor a fee occasion'
      using errcode = '22023';
  end if;

  -- Ein Ereignis ohne Patient:in kann keine Leistung erzeugen (Paragraf 19).
  if v_patient is null then
    raise exception 'appointment has no patient' using errcode = '22023';
  end if;

  if exists (select 1 from public.billable_services where appointment_id = p_appointment_id) then
    raise exception 'appointment already has billable services' using errcode = '23505';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  v_erwartet := case when v_fee_basis is not null then 'absence_fee' else 'treatment' end;

  insert into public.billable_services (
    organization_id, patient_id, appointment_id, catalog_item_id,
    treatment_base_item_id, quantity, performed_on, created_by
  )
  select
    v_org,
    v_patient,
    p_appointment_id,
    i.id,
    -- Die Position der Grundlage, deren Menge diese Leistung verbraucht.
    (select p.id
       from public.treatment_base_items p
      where p.treatment_basis_id = v_basis
        and p.remedy = i.remedy
      limit 1),
    coalesce((zeile.eintrag ->> 'quantity')::smallint, 1::smallint),
    v_performed_on,
    v_actor
  from jsonb_array_elements(p_items) as zeile(eintrag)
  join public.service_catalog_items i
    on i.id = (zeile.eintrag ->> 'catalog_item_id')::uuid
   and i.catalog_version_id = v_version
   and i.item_kind = v_erwartet;

  get diagnostics v_anzahl = row_count;

  -- Eine Position, die es in der geltenden Preisliste nicht gibt oder die
  -- nicht zum Anlass passt, faellt aus dem Join heraus. Stillschweigend
  -- weniger zu schreiben, als verlangt wurde, waere genau der Fehler aus
  -- Paragraf 13 - also scheitert der ganze Vorgang.
  if v_anzahl <> jsonb_array_length(p_items) then
    raise exception 'item does not belong to the catalog version valid on % or does not match %',
      v_performed_on, v_erwartet using errcode = '22023';
  end if;

  -- Die genutzte Menge der Grundlage wird jetzt fortgeschrieben (ANN-073).
  -- Die Constraint used_quantity <= prescribed_quantity bleibt bestehen und
  -- schuetzt die Abrechnung (ADR-020 Punkt 5); sie bekommt hier nur eine
  -- verstaendliche Meldung.
  begin
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
    when check_violation then
      raise exception 'treatment basis quantity exhausted' using errcode = '23514';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'billable_service.recorded', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      -- PRX-009: ob am Termin von der behandelnden Person abgehakt oder im
      -- Buero erfasst - fuer den Nachweis, nicht fuer eine Auswertung (§20).
      'recorded_by_role', case when app.can_record_billable_services() then 'billing' else 'treating' end,
      'patient_id', v_patient,
      'item_count', v_anzahl,
      'performed_on', v_performed_on
    )
  );

  return v_anzahl;
end;
$$;

comment on function public.record_billable_services(uuid, jsonb) is
  'Erfasst die Leistungen eines Termins, alles oder nichts (ABR-002). owner und office an jedem Termin, Behandelnde an ihrem eigenen (PRX-009, ANN-140). Nur aus "dokumentiert" oder aus einem Gebuehrenanlass, ohne Override (PROJECT_PRINCIPLES.md 19, ANN-072). Schreibt die genutzte Menge der Grundlage fort (ANN-073) und protokolliert billable_service.recorded.';

-- -----------------------------------------------------------------------------
-- 4. Was am Termin erfasst ist - eine Zeile
--
-- services: die erfassten Positionen (Bezeichnung, Kuerzel, Menge, Stand);
-- basis_items: die Positionen der Grundlage mit verordneter und genutzter
-- Menge. Ohne Preise: Am Termin zaehlt, was geleistet wurde, nicht was es
-- kostet.
-- -----------------------------------------------------------------------------
create function public.get_appointment_services(p_appointment_id uuid)
returns table (
  appointment_id     uuid,
  can_record         boolean,
  services           jsonb,
  recorded_at        timestamptz,
  recorded_by_name   text,
  basis_items        jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_basis uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not (app.can_read_billable_services()
          or app.can_record_services_for_appointment(p_appointment_id)) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  select a.treatment_basis_id into v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  return query
    select
      p_appointment_id,
      app.can_record_services_for_appointment(p_appointment_id),
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'code', i.code,
                   'label', i.label,
                   'quantity', s.quantity,
                   'status', s.status
                 )
                 order by i.sort_order, i.id
               )
        from public.billable_services s
        join public.service_catalog_items i on i.id = s.catalog_item_id
        where s.appointment_id = p_appointment_id
      ), '[]'::jsonb),
      (select min(s.created_at) from public.billable_services s
        where s.appointment_id = p_appointment_id),
      (select up.display_name
         from public.billable_services s
         join public.user_profiles up on up.id = s.created_by
        where s.appointment_id = p_appointment_id
        order by s.created_at
        limit 1),
      case when v_basis is null then null else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'remedy', p.remedy,
                   'prescribed_quantity', p.prescribed_quantity,
                   'used_quantity', p.used_quantity
                 )
                 order by p.sort_order, p.id
               )
        from public.treatment_base_items p
        where p.treatment_basis_id = v_basis
      ), '[]'::jsonb) end;
end;
$$;

comment on function public.get_appointment_services(uuid) is
  'PRX-009: was am Termin an Leistungen erfasst ist (ohne Preise) und die Mengen der Grundlage. Rollen: wer Leistungen liest oder an diesem Termin erfassen darf (ANN-140); abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.get_appointment_services(uuid) from public, anon;
grant execute on function public.get_appointment_services(uuid) to authenticated;
