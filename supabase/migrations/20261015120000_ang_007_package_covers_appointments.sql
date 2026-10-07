-- =============================================================================
-- ANG-007 (ANG-EPIC-002, BEF-114): Termine im Paket tragen keine eigene Forderung
--
-- BEF-114 (Jannes, 2026-10-02): "Bei einem Paket entsteht die Forderung aus
-- der Paketvereinbarung; Termine im Paket erzeugen keine weitere Forderung."
-- Ausserhalb eines Pakets bleibt es bei ANN-181: Die Einzelstunde wird aus
-- dem durchgefuehrten Trainingstermin abgerechnet.
--
--   app.training_package_covering   welches Paket einen Tag abdeckt (ANN-279)
--   app.billable_service_matches_appointment_context
--                                   + keine Leistung am abgedeckten Termin
--   app.training_package_guard      kein Paket ueber schon erfasste Termine
--   public.list_open_billable_appointments
--                                   ohne abgedeckte Trainingstermine
--
-- Die Regel ist eine Invariante des Datenmodells, in beide Richtungen: Am
-- Termin entsteht keine Leistung, solange ein Paket den Tag deckt, und ein
-- Paket entsteht nicht ueber Tage, an denen schon eine Trainingsleistung
-- erfasst ist. Sonst waere dieselbe Zeit zweimal bezahlt (ADR-009 Punkt 4).
--
-- RUECKFALL IN DIE HEILBEHANDLUNG (ANN-280): Das Paket laeuft weiter. Eine
-- Behandlung waehrend des Pakets ist eine Leistung des Bereichs `therapy` an
-- einem Behandlungstermin und wird davon nicht beruehrt - die Bereiche teilen
-- keine Forderung (ADR-009 Punkt 16).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Welches Paket einen Tag deckt (ANN-279)
--
-- Jeder Tag zwischen Beginn und Ende eines Pakets desselben Verhaeltnisses.
-- Der Umfang ("eine Einheit je Woche") steht in der Bezeichnung und wird
-- nicht gezaehlt (ANN-275): Auch eine zusaetzliche Einheit im Zeitraum ist
-- abgegolten. Die eine Stelle fuer die Regel.
-- -----------------------------------------------------------------------------
create function app.training_package_covering(p_relationship_id uuid, p_day date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select k.id
  from public.training_packages k
  where k.training_relationship_id = p_relationship_id
    and p_day between k.starts_on and k.ends_on
  limit 1
$$;

revoke all on function app.training_package_covering(uuid, date) from public, anon, authenticated;

comment on function app.training_package_covering(uuid, date) is
  'ANG-007 (ANN-279): das Trainingspaket, das diesen Tag fuer das Verhaeltnis abdeckt, oder null. Ein Trainingstermin an einem abgedeckten Tag traegt keine eigene Forderung (BEF-114).';

-- -----------------------------------------------------------------------------
-- 2. Am Termin: keine Leistung im Paket
--
-- Aus 20261015110000_ang_006_training_packages.sql; neu ist nur die letzte
-- Pruefung.
-- -----------------------------------------------------------------------------
create or replace function app.billable_service_matches_appointment_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind     text;
  v_patient  uuid;
  v_training uuid;
  v_erwartet text;
  v_art      text;
begin
  select c.item_kind into v_art
  from public.service_catalog_items c where c.id = new.catalog_item_id;

  if new.appointment_id is null then
    -- ANG-006: das Trainingspaket - Position, Verhaeltnis und Beginn sind die
    -- des Pakets.
    if new.training_package_id is not null then
      if v_art is distinct from 'training_package' or not exists (
        select 1 from public.training_packages k
        where k.id = new.training_package_id
          and k.training_relationship_id = new.training_relationship_id
          and k.organization_id = new.organization_id
          and k.catalog_item_id = new.catalog_item_id
          and k.starts_on = new.performed_on
      ) then
        raise exception 'billable service does not match its training package'
          using errcode = '23514';
      end if;
      return new;
    end if;
    if v_art is distinct from 'aftercare_month' then
      raise exception 'only an aftercare month or a training package can be billed without an appointment'
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.aftercare_subscriptions s
      where s.id = new.aftercare_subscription_id
        and s.patient_id = new.patient_id
        and s.organization_id = new.organization_id
    ) then
      raise exception 'billable service does not belong to the patient of its aftercare subscription'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if v_art = 'aftercare_month' then
    raise exception 'an aftercare month is not billed at an appointment' using errcode = '23514';
  end if;
  -- ANG-006: ein Paket nie am Termin.
  if v_art = 'training_package' then
    raise exception 'a training package is not billed at an appointment' using errcode = '23514';
  end if;

  select a.kind, a.patient_id, a.training_relationship_id
    into v_kind, v_patient, v_training
  from public.appointments a
  where a.id = new.appointment_id;

  v_erwartet := app.service_area_of_appointment_kind(v_kind);

  if v_erwartet is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '23514';
  end if;

  if new.service_area is distinct from v_erwartet then
    raise exception 'service area % does not match the appointment context % (expected %)',
      new.service_area, v_kind, v_erwartet
      using errcode = '23514';
  end if;

  -- TRN-007: dasselbe Verhaeltnis wie der Termin, in beiden Spalten.
  if new.patient_id is distinct from v_patient
     or new.training_relationship_id is distinct from v_training then
    raise exception 'billable service does not belong to the relationship of its appointment'
      using errcode = '23514';
  end if;

  -- ANG-007 (ANN-279, BEF-114): Ein Trainingstermin im Zeitraum eines Pakets
  -- ist mit dem Paket bezahlt und traegt keine eigene Forderung.
  if v_kind = 'training' then
    -- Zweitreview: unter Sperre des Verhaeltnisses. create_training_package
    -- haelt es FOR UPDATE; FOR SHARE wartet darauf, und die Abfrage danach
    -- sieht das neue Paket (READ COMMITTED, neuer Snapshot je Anweisung).
    -- Umgekehrt wartet die Paketanlage, bis diese Erfassung feststeht, und
    -- ihr Guard sieht sie. Sonst liefen beide an der Pruefung vorbei.
    perform 1 from public.training_relationships t where t.id = v_training for share;
    if app.training_package_covering(v_training, app.appointment_performed_on(new.appointment_id)) is not null then
      raise exception 'training appointment is covered by a training package' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Am Paket: nicht ueber schon erfasste Trainingstermine
--
-- Eine Trainingsleistung an einem Termin im Zeitraum ist schon eine
-- Forderung - abgerechnet oder nicht. Das Buero nimmt eine offene Erfassung
-- zurueck, bevor das Paket entsteht; eine abgerechnete bleibt, und das Paket
-- beginnt danach.
-- -----------------------------------------------------------------------------
create function app.training_package_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.billable_services b
    where b.training_relationship_id = new.training_relationship_id
      and b.appointment_id is not null
      and b.performed_on between new.starts_on and new.ends_on
  ) then
    raise exception 'training appointments in this period already carry billable services'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app.training_package_guard() from public, anon, authenticated;

create trigger training_packages_guard
  before insert or update of training_relationship_id, starts_on, ends_on
  on public.training_packages
  for each row execute function app.training_package_guard();

comment on function app.training_package_guard() is
  'ANG-007 (ANN-279): Ein Trainingspaket entsteht nicht ueber Tage, an denen schon eine Trainingsleistung am Termin erfasst ist - dieselbe Zeit wird nicht zweimal bezahlt.';

-- -----------------------------------------------------------------------------
-- 4. Offene Leistungen: ohne abgedeckte Trainingstermine
--
-- Aus 20261002130000_abn_006_patient_moved_and_fee_waiver.sql; neu ist nur
-- die letzte Bedingung.
-- -----------------------------------------------------------------------------
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
