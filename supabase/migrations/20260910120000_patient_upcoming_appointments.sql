-- =============================================================================
-- Kuenftige Termine in der Akte (UX-006)
--
-- Die Akte zeigt bisher ausschliesslich Vergangenes: den Behandlungsverlauf
-- und die Verordnungen. Die naheliegendste Frage am Telefon - "wann bin ich
-- das naechste Mal dran?" - liess sich damit nur ueber den Kalender
-- beantworten, und dort muss man wissen, in welcher Woche man suchen soll.
--
-- Eigene Funktion statt eines weiteren Filters an list_appointments: dort ist
-- der Zeitraum die Grenze (hoechstens 31 Tage), hier die Anzahl. Ein
-- Folgetermin kann drei Monate entfernt liegen; ein Zeitfenster, das ihn
-- sicher einschliesst, waere fuer die Akte zu weit.
--
-- Geliefert wird ausschliesslich, was die Akte anzeigt: Zeitraum, Terminart,
-- Status und die behandelnde Person. Keine Adresse - fuer den Blick in die
-- Akte ist sie nicht erforderlich (ADR-004, Datenminimierung); die Anfahrt
-- steht in der Tagesliste und am Termin.
--
-- Kein eigener Auditeintrag: Das Oeffnen der Akte wird als
-- patient_record.viewed protokolliert (ADR-010), und der Termin selbst
-- enthaelt keine klinischen Inhalte (PROJECT_PRINCIPLES.md 4.6).
-- =============================================================================

create or replace function public.list_patient_upcoming_appointments(
  p_patient_id uuid,
  p_limit      integer default 5
)
returns table (
  id                     uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  status                 text,
  staff_given_name       text,
  staff_family_name      text,
  organization_time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Termine lesen darf, wer den Kalender lesen darf - die Akte
  -- oeffnet dafuer kein zweites Recht.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 5), 1), 20);

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      -- Kuenftig heisst: hat noch nicht begonnen. Ein laufender Termin gehoert
      -- in die Tagesliste, nicht in die Vorschau der Akte.
      and a.starts_at > now()
      -- Ein abgesagter Termin ist kein bevorstehender. Er bleibt im Kalender
      -- und im Auditlog nachvollziehbar (CAL-003).
      and a.status <> 'cancelled'
    order by a.starts_at, a.id
    limit v_limit;
end;
$$;

comment on function public.list_patient_upcoming_appointments(uuid, integer) is
  'Die naechsten Termine einer Patientin fuer die Akte (UX-006). Begrenzt ueber die Anzahl statt ueber den Zeitraum; ohne Adresse und ohne klinische Inhalte.';

revoke all on function public.list_patient_upcoming_appointments(uuid, integer)
  from public, anon;
grant execute on function public.list_patient_upcoming_appointments(uuid, integer)
  to authenticated;
