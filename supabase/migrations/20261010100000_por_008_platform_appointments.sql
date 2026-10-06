-- =============================================================================
-- POR-008: Eigene Termine auf der Plattform (DSN-001 Abschnitt 4.1 "Termine",
-- ADR-023 Punkte 19, 22, 23, 24)
--
-- Die erste Projektion mit Inhalt aus dem Verhaeltnis. Sie liefert einer
-- Person ihre Termine im gewaehlten Bereich: Behandlungstermine ueber die
-- Akte, Trainingstermine ueber das Trainingsverhaeltnis (4.8, ADR-022). Ein
-- Termin ist "fuer die Plattform bestimmt", weil er der Person gehoert
-- (Punkt 22) - mit einer festen Spaltenliste:
--
--   Zeit, Art, Zustand, Name der behandelnden Person, Standort beim
--   Praxistermin, die eigene Anschrift beim Hausbesuch (der Snapshot am
--   Termin, ANN-003).
--
-- Nicht dabei: Zugangshinweis, Notizen, Grundlage, Gebuehrenanlass, die
-- Belegung anderer Personen. Die Praxiszustaende "dokumentiert" und
-- "abgerechnet" sind fuer die Person "durchgefuehrt"; eine abgerechnete
-- Absage oder ein abgerechnetes Nichtantreffen bleibt, was es war.
--
-- Zeitraum (ANN-248): alle kuenftigen Termine und die der letzten zwoelf
-- Monate. Eine Zahl an einer Stelle (app.platform_appointment_history).
--
-- Ueber eine Vertretung ist das Lesen protokolliert (Punkt 24, ANN-209), das
-- eigene Lesen nicht.
-- =============================================================================

create function app.platform_appointment_history()
returns interval
language sql
immutable
set search_path = ''
as $$
  -- ANN-248: wie weit die eigene Terminliste zurueckreicht.
  select interval '12 months'
$$;

revoke all on function app.platform_appointment_history() from public, anon, authenticated;

comment on function app.platform_appointment_history() is
  'POR-008 (ANN-248): Zeitraum der vergangenen Termine in der eigenen Terminliste der Plattform.';

create function public.platform_appointments(p_access_id uuid)
returns table (
  id                 uuid,
  starts_at          timestamptz,
  ends_at            timestamptz,
  appointment_type   text,
  status             text,
  staff_name         text,
  location_name      text,
  visit_street       text,
  visit_house_number text,
  visit_postal_code  text,
  visit_city         text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  -- Ohne lesbaren Zugang keine Zeile - fuer jeden Negativfall dieselbe
  -- Antwort (Punkt 23).
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'appointments')
  );

  return query
  select a.id,
         a.starts_at,
         a.ends_at,
         a.appointment_type,
         case a.status
           when 'documented' then 'completed'
           when 'invoiced' then
             case a.fee_basis
               when 'no_show' then 'no_show'
               when 'late_cancellation' then 'cancelled'
               else 'completed'
             end
           else a.status
         end,
         nullif(concat_ws(' ', pe.given_name, pe.family_name), ''),
         l.name,
         a.visit_street,
         a.visit_house_number,
         a.visit_postal_code,
         a.visit_city
  from public.appointments a
  left join public.staff_members s on s.id = a.staff_member_id
  left join public.persons pe on pe.id = s.person_id
  left join public.locations l on l.id = a.location_id
  where a.organization_id = v_zugang.organization_id
    and (
      (v_zugang.relationship_kind = 'treatment'
         and a.kind = 'therapy'
         and a.patient_id = v_zugang.relationship_id)
      or
      (v_zugang.relationship_kind = 'training'
         and a.kind = 'training'
         and a.training_relationship_id = v_zugang.relationship_id)
    )
    and a.starts_at >= now() - app.platform_appointment_history()
  order by a.starts_at, a.id;
end;
$$;

revoke all on function public.platform_appointments(uuid) from public, anon;
grant execute on function public.platform_appointments(uuid) to authenticated;

comment on function public.platform_appointments(uuid) is
  'POR-008: Plattformprojektion "Termine" (DSN-001 4.1): die eigenen Termine des Verhaeltnisses hinter einem lesbaren Zugang, kuenftige und die der letzten zwoelf Monate (ANN-248). Feste Spaltenliste ohne Notizen, Grundlage oder Gebuehrenanlass (ADR-023 Punkt 22). Ueber eine Vertretung protokolliert (Punkt 24).';
