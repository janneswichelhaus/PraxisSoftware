-- =============================================================================
-- MAP-006b: Tagesstopps aus den Terminen des Tages (ADR-019, TOUR-001)
--
-- list_day_route liefert zu einem Tag und einer Person die Stopps der
-- Tagesroute: Kennung, Zeit, Zustand und Koordinate - keinen Namen, keine
-- Adresse, keinen Zugangshinweis. Die Namen stehen in list_day_plan und
-- bleiben dort; die Karte bekommt von hier nur Punkte (ADR-019 Punkt 2 und 12,
-- Datenminimierung nach ADR-004 "Projektionen").
--
-- Ein Stopp ist ein Behandlungs- oder Trainingstermin, der nicht abgesagt
-- ist:
--   * Hausbesuch: die Koordinate aus dem Snapshot (MAP-006a, ANN-016);
--   * Praxistermin: die Koordinate des Standorts;
--   * Videotermin und internes Ereignis: kein Ort, deshalb kein Stopp.
-- Ohne Koordinate kommt die Zeile trotzdem - mit leerer Position, damit die
-- Oberflaeche "ohne Kartenposition" sagen kann, statt den Termin still
-- wegzulassen.
--
-- Rechte wie list_day_plan: dieselben Termine, eine andere Darstellung.
-- Abgewiesen wird mit null Zeilen und einem denied-Eintrag (G6b).
-- Gespeichert wird nichts; eine Route oder Fahrzeit entsteht hier nicht.
-- =============================================================================

create function public.list_day_route(p_date date, p_staff_member_id uuid)
returns table (
  id                uuid,
  kind              text,
  appointment_type  text,
  status            text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  lat               double precision,
  lon               double precision,
  geocode_precision text,
  position_source   text
)
language plpgsql
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

  if not app.can_read_appointments() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  return query
    select
      a.id,
      a.kind,
      a.appointment_type,
      a.status,
      a.starts_at,
      a.ends_at,
      case a.appointment_type when 'home_visit' then a.visit_lat else l.lat end,
      case a.appointment_type when 'home_visit' then a.visit_lon else l.lon end,
      case a.appointment_type when 'home_visit' then a.visit_geocode_precision else l.geocode_precision end,
      case a.appointment_type when 'home_visit' then 'visit' else 'location' end
    from public.appointments a
    left join public.locations l on l.id = a.location_id and l.organization_id = v_org
    where a.organization_id = v_org
      and app.may_read_appointment_context(a.kind)
      and a.kind in ('therapy', 'training')
      and a.appointment_type in ('home_visit', 'practice')
      and a.status <> 'cancelled'
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_day_route(date, uuid) is
  'MAP-006b: Stopps der Tagesroute einer Person - Kennung, Zeit, Zustand und Koordinate, ohne Namen und ohne Adresse. Rechte wie list_day_plan; abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.list_day_route(date, uuid) from public;
grant execute on function public.list_day_route(date, uuid) to authenticated;
