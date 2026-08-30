-- =============================================================================
-- Kalenderlesepfad (CAL-002)
--
-- Der Kalender liest bewusst NICHT frei ueber appointment_directory, sondern
-- ueber eine Funktion mit festem Zeitfenster:
--
--   * Der Zeitbereich wird serverseitig begrenzt. Eine freie Abfrage koennte
--     den gesamten Terminbestand der Praxis in einem Zug ziehen; das ist weder
--     fuer die Anzeige noetig noch datensparsam (PROJECT_PRINCIPLES.md 16).
--   * Von und Bis sind Kalendertage in der Zeitzone der Praxis, keine
--     Zeitstempel. Die Umrechnung passiert hier - dieselbe Festlegung wie bei
--     create_appointment, damit Tagesgrenzen und Sommer-/Winterzeit an genau
--     einer Stelle entschieden werden.
--   * Die optionalen Filter werden geprueft. Ein fremder Filterwert liefert
--     eine leere Liste statt einer Meldung und taugt damit nicht als
--     Existenz-Orakel.
--   * Geliefert wird ausschliesslich, was der Kalender anzeigt. Klinische
--     Inhalte gibt es am Termin ohnehin nicht (PROJECT_PRINCIPLES.md 4.6).
--
-- Patientenkonten erhalten in diesem Stand keinen Zugriff.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Wer darf den Kalender lesen
--
-- Eigene Funktion statt Wiederverwendung der Anlagepruefung: Lesen und Planen
-- sind fachlich verschiedene Rechte und duerfen sich spaeter auseinander
-- entwickeln.
-- -----------------------------------------------------------------------------
create or replace function app.can_read_appointments()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_read_appointments() to authenticated;

-- -----------------------------------------------------------------------------
-- Obergrenze des Zeitfensters
--
-- Tag und Woche brauchen 1 beziehungsweise 7 Tage. 31 laesst Luft fuer eine
-- spaetere Monatsansicht, ohne die Abfrage unbegrenzt zu machen.
-- -----------------------------------------------------------------------------
create or replace function public.list_appointments(
  p_from            date,
  p_to              date,
  p_staff_member_id uuid default null,
  p_location_id     uuid default null,
  p_status          text default 'scheduled'
)
returns table (
  id                  uuid,
  patient_id          uuid,
  staff_member_id     uuid,
  location_id         uuid,
  appointment_type    text,
  status              text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  patient_given_name  text,
  patient_family_name text,
  staff_given_name    text,
  staff_family_name   text,
  location_name       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_from is null or p_to is null then
    raise exception 'from and to are required' using errcode = '22023';
  end if;

  if p_to <= p_from then
    raise exception 'to must be after from' using errcode = '22023';
  end if;

  if p_to - p_from > 31 then
    raise exception 'requested range is too large' using errcode = '22023';
  end if;

  if p_status is null or p_status not in ('scheduled', 'cancelled', 'all') then
    raise exception 'unknown status filter' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [von 00:00, bis 00:00) in der Zeitzone der Praxis.
  -- Ueber eine Zeitumstellung hinweg ist es damit 23 beziehungsweise 25
  -- Stunden lang - genau das ist gewollt, weil der Kalendertag zaehlt.
  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.location_id,
      a.appointment_type,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name
    from public.appointments a
    join public.patients p       on p.id  = a.patient_id
    join public.persons pp       on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      -- Ein fremder oder unbekannter Filterwert grenzt schlicht alles weg.
      and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
      and (p_location_id     is null or a.location_id     = p_location_id)
      and (p_status = 'all' or a.status = p_status)
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$$;

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten (CAL-002).';

revoke all on function public.list_appointments(date, date, uuid, uuid, text)
  from public, anon;
grant execute on function public.list_appointments(date, date, uuid, uuid, text)
  to authenticated;
