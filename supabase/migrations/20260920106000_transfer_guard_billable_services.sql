-- =============================================================================
-- R3-001: Der Transfer-Guard prueft den Zustand, den es wirklich gibt
--
-- `transfer_appointments_to_treatment_basis` schliesst abgerechnete Termine
-- ueber `a.status not in ('cancelled', 'invoiced')` aus - die Grenze aus
-- ANN-068. Den Zustand 'invoiced' setzt aber niemand: `issue_invoice` hebt
-- `billable_services.status` auf 'invoiced' und laesst den Termin, wo er ist
-- (ADR-018 Punkt 2 sieht den Uebergang vor, die Abrechnung aus ABR-003 setzt
-- ihn nicht um). Die Grenze war damit wirkungslos: Ein abgerechneter Termin
-- liess sich auf eine andere Behandlungsgrundlage schieben, und die Rechnung
-- verwies anschliessend auf eine Grundlage, unter der die Leistung nie
-- erbracht wurde.
--
-- Hier steht der kleinste Fix: Der Guard prueft zusaetzlich die Leistung. Der
-- Terminzustand 'invoiced' bleibt damit vorerst unbenutzt - festgehalten als
-- **ANN-081** samt dem Weg, ihn spaeter nachzuziehen.
-- =============================================================================

-- Uebernommen aus 20260918140000_appointment_coverage.sql, Abschnitt 6,
-- ergaenzt um die Pruefung der erfassten Leistungen.
--
-- **ANN-081:** Abgerechnet ist die Leistung, nicht der Termin. Der Zustand
-- 'invoiced' an `appointments` bleibt unbesetzt; wer wissen will, ob ein
-- Termin abgerechnet ist, fragt `billable_services.status`. Diese Bedingung
-- ist die eine Stelle, an der die Annahme haengt - wird ADR-018 Punkt 2
-- spaeter vollstaendig umgesetzt, faellt sie ersatzlos weg.
create or replace function public.transfer_appointments_to_treatment_basis(
  p_treatment_basis_id uuid,
  p_appointment_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_actor     uuid := auth.uid();
  v_patient   uuid;
  v_anzahl    integer;
  v_geschickt integer;
  v_quellen   uuid[];
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Uebertragen aendert einen Termin, nicht die Grundlage: Es ist dasselbe
  -- Recht wie das Umplanen (ADR-004). Wer eine Verordnung schreiben darf, hat
  -- es ohnehin; das Office plant Termine und darf deshalb auch uebertragen.
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_treatment_basis_id is null then
    raise exception 'treatment basis is required' using errcode = '22023';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  -- Die Zielgrundlage bestimmt die Patient:in. Sie wird hier gelesen und nicht
  -- vom Aufrufer entgegengenommen: Eine mitgeschickte Patientenkennung waere
  -- eine zweite Wahrheit, die auseinanderlaufen kann.
  select p.patient_id
    into v_patient
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  -- Alles oder nichts: Erst wird gezaehlt, was die Bedingungen erfuellt, dann
  -- geschrieben. Eine Kennung, die durchfaellt - fremde Organisation, andere
  -- Patient:in, abgesagt, abgerechnet oder ein Ereignis ohne Patient:in -,
  -- laesst den ganzen Vorgang scheitern.
  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  select count(*), array_agg(distinct a.treatment_basis_id)
    into v_anzahl, v_quellen
  from public.appointments a
  where a.id = any(p_appointment_ids)
    and a.organization_id = v_org
    and a.patient_id      = v_patient
    and a.status not in ('cancelled', 'invoiced')
    -- Abgerechnet ist die Leistung, nicht der Termin (ANN-081): Der Zustand
    -- 'invoiced' an appointments entsteht im Betrieb nicht, issue_invoice
    -- setzt ihn nicht. Geprueft wird deshalb der Zustand, den es wirklich
    -- gibt. Die Bedingung oben bleibt daneben stehen - sie kostet nichts und
    -- traegt weiter, falls ADR-018 spaeter vollstaendig umgesetzt wird.
    and not exists (
      select 1 from public.billable_services b
      where b.appointment_id = a.id
        and b.status = 'invoiced'
    );

  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not transferable' using errcode = '22023';
  end if;

  -- Der Termin behaelt Tag, Zeit, Person und Ort. `updated_at` bleibt deshalb
  -- unberuehrt: Der Mitteilungsvermerk haengt daran (CAL-012) und gilt weiter -
  -- mitgeteilt wurde ein Zeitpunkt, keine Grundlage.
  update public.appointments a
     set treatment_basis_id = p_treatment_basis_id
   where a.id = any(p_appointment_ids)
     and a.organization_id = v_org;

  -- Ein Ereignis je Uebertragung (CAL-022), ohne klinischen Inhalt: wer, wann,
  -- welche Termine, von welcher Grundlage auf welche.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.appointments_transferred', 'treatment_basis',
    p_treatment_basis_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      'appointment_ids', to_jsonb(p_appointment_ids),
      'from_treatment_basis_ids', to_jsonb(coalesce(v_quellen, array[]::uuid[])),
      'appointment_count', v_anzahl
    )
  );

  return v_anzahl;
end;
$$;

comment on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) is
  'Uebertraegt Termine auf eine andere Behandlungsgrundlage derselben Patient:in (CAL-022, ANN-068, ANN-081, R3-001): alles oder nichts, die Patient:in kommt aus der Zielgrundlage, abgesagte Termine und solche mit abgerechneter Leistung sind ausgeschlossen. Kein Kontingentabbruch - ueber das Kontingent hinaus zu planen ist zulaessig und wird als ungedeckt angezeigt. Protokolliert ein Ereignis je Vorgang (ADR-010).';

revoke all on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) from public, anon;
grant execute on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) to authenticated;
