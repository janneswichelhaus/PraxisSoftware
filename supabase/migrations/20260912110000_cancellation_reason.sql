-- =============================================================================
-- Absagegrund als Pflichtangabe (CAL-008b, ADR-018 Punkt 6)
--
-- Jede NEUE Absage nennt ihren Grund. Bestandszeilen behalten `null`: ein
-- rueckwirkend erfundener Grund waere eine Erfindung, keine Migration -
-- dieselbe Abgrenzung wie beim Raster (CAL-005) und beim Terminfenster
-- (CAL-010a).
--
-- Der Grund ist eine CODIERTE AUSWAHL, kein Freitext (ANN-034):
--
--   patient_request   Patient:in hat abgesagt
--   practice_request  Praxis hat abgesagt
--   moved             Termin verlegt
--   other             Sonstiger Grund
--
-- Ein Freitextfeld an einem Termin waere die wahrscheinlichste Stelle, an der
-- eine Gesundheitsangabe in einen organisatorischen Datensatz rutscht
-- ("Rueckenschmerzen schlimmer geworden"). Der Termin enthaelt ausdruecklich
-- keine klinischen Inhalte (PROJECT_PRINCIPLES.md 4.6, 5); die vier Werte
-- tragen genau das, wofuer ADR-018 den Grund verlangt - die Absagequote
-- spaeter lesbar zu machen.
--
-- Der Grund steht NICHT im Auditkontext. Er steht an der Zeile, faellt also
-- mit ihr; das Auditlog laeuft nach eigener, laengerer Frist (ANN-029). Eine
-- Kopie dort wuerde die Angabe ueberleben lassen, ohne dass jemand sie braucht
-- (ADR-010, ADR-011).
-- =============================================================================

alter table public.appointments
  add column cancellation_reason text;

comment on column public.appointments.cancellation_reason is
  'Codierter Absagegrund (CAL-008b, ANN-034). Pflicht fuer jede neue Absage; Bestandszeilen tragen null. Kein Freitext - der Termin enthaelt keine klinischen Inhalte.';

alter table public.appointments
  add constraint appointments_cancellation_reason_values check (
    cancellation_reason is null
    or cancellation_reason in ('patient_request', 'practice_request', 'moved', 'other')
  );

-- Ein Grund ohne Absage waere ein Rest aus einem frueheren Zustand. Es gibt
-- keinen Weg aus 'cancelled' heraus, die Bedingung kann also nie stoeren.
alter table public.appointments
  add constraint appointments_cancellation_reason_needs_cancellation check (
    cancellation_reason is null or status = 'cancelled'
  );

-- -----------------------------------------------------------------------------
-- cancel_appointment bekommt einen dritten Parameter
--
-- Ohne Vorbelegung: PostgreSQL kann eine Signatur nicht erweitern, und ein
-- Standardwert waere hier das Gegenteil einer Pflichtangabe - jeder bestehende
-- Aufruf bliebe stillschweigend ohne Grund. Die alte Signatur wird deshalb
-- entfernt.
-- -----------------------------------------------------------------------------
drop function public.cancel_appointment(uuid, timestamptz);

create function public.cancel_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_reason              text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status              = 'cancelled',
         cancellation_reason = p_reason,
         cancelled_at        = now(),
         cancelled_by        = v_actor,
         updated_at          = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Ohne den Grund: er steht an der Zeile und laeuft mit ihrer Frist.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.cancelled', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.cancel_appointment(uuid, timestamptz, text) is
  'Sagt einen bestaetigten Termin mit Pflichtgrund ab und protokolliert appointment.cancelled (CAL-003, CAL-008b, ADR-018). Der Grund ist eine codierte Auswahl und steht nicht im Auditkontext (ANN-034).';

revoke all on function public.cancel_appointment(uuid, timestamptz, text) from public, anon;
grant execute on function public.cancel_appointment(uuid, timestamptz, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Der Grund gehoert in die Terminsicht
--
-- Rueckgabespalte kommt hinzu, deshalb abraeumen und neu anlegen.
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.appointment_type,
  a.status,
  a.starts_at,
  a.ends_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.updated_at,
  a.cancelled_at,
  a.cancellation_reason,
  a.completed_at,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone
from public.appointments a
join public.patients p      on p.id  = a.patient_id
join public.persons pp      on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp      on sp.id = sm.person_id
join public.organizations o on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben.';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;
