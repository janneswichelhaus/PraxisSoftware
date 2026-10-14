-- =============================================================================
-- Zweitreview zu B4/B7 (BEF-154, BEF-157; ADR-009 Fassung 6 Punkt 24,
-- ADR-018 Fassung 5 Punkt 10):
--
--   1. Eine Leistung am Behandlungstermin entsteht nur mit dem Haken - auch im
--      Buero. Bisher reichte "documented" (app.appointment_is_billable); seit
--      B4 steht ein dokumentierter Termin auch ohne Haken (ANN-512), und nach
--      der Ruecknahme des Hakens stand er wieder unter "Zu erfassen" und liess
--      sich neu erfassen. Der Haken heisst "Leistung erbracht" - ohne ihn
--      entsteht keine.
--        a) list_open_billable_appointments fuehrt einen Behandlungstermin ohne
--           Gebuehrenanlass nur mit Haken.
--        b) Ein Trigger an billable_services haelt die Regel fuer jeden Weg
--           fest (record_billable_services, kuenftige Wege) - beim Anlegen
--           und beim Umhaengen auf einen anderen Termin.
--      Ein Gebuehrenanlass (Ausfallhonorar) braucht keinen Haken; das Training
--      bleibt, wie es ist (ANN-036, ADR-022 Punkt 6).
--   2. delete_treatment_basis loescht keine Grundlage, die in der Abrechnung
--      steht (ANN-515): Sonst fiele mit der Zuordnung der Termine die Sperre,
--      ohne dass jemand zurueckgeholt haette. Die Zeile wird vor der Pruefung
--      gesperrt, damit eine gleichzeitige Freigabe nicht dazwischenkommt.
--      Der Aufbewahrungslauf loescht ueber die Akte und ist davon nicht
--      beruehrt.
-- =============================================================================

-- 1. Der Haken als Bedingung ----------------------------------------------------

create function app.appointment_is_checked(p_kind text, p_status text, p_completed_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Training: wie bisher setzt das Protokoll den Abschluss mit (ANN-036).
  select p_kind <> 'therapy' or p_status = 'invoiced' or p_completed_at is not null
$$;

revoke all on function app.appointment_is_checked(text, text, timestamptz) from public, anon;
grant execute on function app.appointment_is_checked(text, text, timestamptz) to authenticated;

comment on function app.appointment_is_checked(text, text, timestamptz) is
  'B4/B7 (ANN-512, ANN-513): Ist ein Behandlungstermin abgehakt? Der Haken (completed_at) steht neben dem Zustand; ein abgerechneter Termin gilt als abgehakt. Fuer andere Terminarten immer wahr.';

-- Juengste Fassung aus 20261015120000_ang_007_package_covers_appointments.sql;
-- neu ist nur die Bedingung zum Haken.
CREATE OR REPLACE FUNCTION public.list_open_billable_appointments(p_limit integer DEFAULT 100)
 RETURNS TABLE(appointment_id uuid, patient_id uuid, training_relationship_id uuid, service_area text, patient_name text, performed_on date, starts_at timestamp with time zone, status text, fee_basis text, appointment_type text, suggestion_count integer)
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

  if not app.can_read_billable_services() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select a.id,
         a.patient_id,
         a.training_relationship_id,
         app.service_area_of_appointment_kind(a.kind),
         pe.given_name || ' ' || pe.family_name,
         (a.starts_at at time zone o.time_zone)::date,
         a.starts_at,
         a.status,
         a.fee_basis,
         a.appointment_type,
         (
           select count(*)::integer
           from public.treatment_base_items q
           join public.service_catalog_items ci
             on ci.remedy = q.remedy
            and ci.catalog_version_id = app.active_service_catalog_version(
                  v_org, (a.starts_at at time zone o.time_zone)::date)
           where q.treatment_basis_id = a.treatment_basis_id
         )
  from public.appointments a
  join public.organizations o on o.id = a.organization_id
  left join public.patients p on p.id = a.patient_id
  left join public.training_relationships t on t.id = a.training_relationship_id
  join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
  where a.organization_id = v_org
    and a.kind in ('therapy', 'training')
    -- ABN-006: Nach einem Verzicht ist der Anlass keine offene Leistung mehr.
    and app.appointment_is_billable(a.kind, a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at))
    -- B4/B7 (ANN-513): Ohne Haken ist am Behandlungstermin nichts erbracht -
    -- ausser einem Gebuehrenanlass.
    and (app.billable_fee_basis(a.fee_basis, a.fee_waived_at) is not null
         or app.appointment_is_checked(a.kind, a.status, a.completed_at))
    and not exists (
      select 1 from public.billable_services b where b.appointment_id = a.id
    )
    -- ANG-007 (ANN-279): Ein Trainingstermin im Paket ist bezahlt.
    and (a.kind <> 'training'
         or app.training_package_covering(
              a.training_relationship_id, (a.starts_at at time zone o.time_zone)::date) is null)
  order by a.starts_at desc, a.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

-- Die Regel fuer jeden Weg: eine Leistung am Termin nur mit Haken oder Anlass.
create function app.billable_services_require_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_termin record;
begin
  if new.appointment_id is null then
    return new;
  end if;
  -- Beim Aendern nur, wenn die Leistung an einen anderen Termin wandert.
  if tg_op = 'UPDATE' and new.appointment_id is not distinct from old.appointment_id then
    return new;
  end if;

  select a.kind, a.status, a.completed_at,
         app.billable_fee_basis(a.fee_basis, a.fee_waived_at) as anlass
    into v_termin
  from public.appointments a
  where a.id = new.appointment_id;

  if found
     and v_termin.anlass is null
     and not app.appointment_is_checked(v_termin.kind, v_termin.status, v_termin.completed_at) then
    raise exception 'appointment is not checked off' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.billable_services_require_check() from public, anon, authenticated;

create trigger billable_services_require_check
  before insert or update of appointment_id on public.billable_services
  for each row execute function app.billable_services_require_check();

comment on function app.billable_services_require_check() is
  'B4/B7 (ANN-513): Eine Leistung an einem Behandlungstermin entsteht nur mit dem Haken (oder aus einem Gebuehrenanlass) - auf jedem Weg, auch im Buero, und auch beim Umhaengen auf einen anderen Termin.';

-- 2. Keine Loeschung einer Grundlage in der Abrechnung ---------------------------

-- Juengste Fassung aus 20261006110100_log_001b_schreibpfade.sql; neu ist nur die
-- Pruefung auf die Freigabe unter Zeilensperre.
CREATE OR REPLACE FUNCTION public.delete_treatment_basis(p_treatment_basis_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor        uuid;
  v_org          uuid;
  v_patient_id   uuid;
  v_freigegeben  timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  -- B7 (ANN-515): In der Abrechnung erst zurueckholen. Die Zeile wird vor
  -- der Pruefung gesperrt: Eine gleichzeitige Freigabe wartet dann, statt
  -- dass das Loeschen die eben freigegebene Grundlage mitnimmt.
  select b.billing_released_at into v_freigegeben
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = v_org
  for update;

  if v_freigegeben is not null then
    raise exception 'treatment basis is in billing' using errcode = '55000';
  end if;

  -- PRX-010 (Zweitreview): Mit der Grundlage fielen ihre klinischen Texte;
  -- das bleibt den therapeutischen Rollen vorbehalten.
  if not app.can_clear_treatment_basis_clinical_texts()
     and app.treatment_basis_has_clinical_texts(p_treatment_basis_id, v_org) then
    raise exception 'clinical texts on this treatment basis can only be cleared by treating roles'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.therapy_reports r
    where r.treatment_basis_id = p_treatment_basis_id and r.organization_id = v_org
  ) then
    raise exception 'treatment basis has therapy reports' using errcode = '23503';
  end if;

  delete from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

end;
$function$;
