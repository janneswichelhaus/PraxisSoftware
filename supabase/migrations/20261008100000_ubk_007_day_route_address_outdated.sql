-- =============================================================================
-- UBK-007: Tagesstopps mit veralteter Adresse am Termin (ANN-236)
--
-- Ein Hausbesuch kopiert beim Anlegen die Anschrift samt Koordinate (ANN-003,
-- MAP-006a). Aendert sich danach die Anschrift in der Akte und wird der Termin
-- nicht umgestellt (ABN-004), rechnete die Route weiter mit der alten
-- Koordinate - eine falsche Fahrzeit, die aussieht wie eine richtige
-- (Sichtung Jannes, 2026-10-05).
--
-- list_day_route meldet das jetzt je Stopp in address_outdated - dieselbe
-- Regel wie list_home_visits_with_outdated_address: kuenftiger bestaetigter
-- Behandlungs-Hausbesuch, Anschrift der Akte vollstaendig und vom Snapshot
-- verschieden. Fuer einen solchen Stopp kommt keine Koordinate: Ungeprueft
-- ist nicht "kurz" (MAP-004b), und eine veraltete Position ist ungeprueft.
--
-- Hinaus geht weiter weder Name noch Adresse; der neue Wert ist ein Ja/Nein.
-- Rechte und Abweisung unveraendert (Rechte wie list_day_plan, G6b).
-- =============================================================================

drop function public.list_day_route(date, uuid);

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
  position_source   text,
  address_outdated  boolean
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
    with stopps as (
      select
        a.*,
        l.lat as ort_lat,
        l.lon as ort_lon,
        l.geocode_precision as ort_precision,
        -- ANN-236: dieselbe Regel wie list_home_visits_with_outdated_address.
        coalesce(
          a.kind = 'therapy'
          and a.appointment_type = 'home_visit'
          and a.status = 'confirmed'
          and a.starts_at > now()
          and nullif(btrim(c.street), '')       is not null
          and nullif(btrim(c.house_number), '') is not null
          and nullif(btrim(c.postal_code), '')  is not null
          and nullif(btrim(c.city), '')         is not null
          and (a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city)
              is distinct from
              (nullif(btrim(c.street), ''), nullif(btrim(c.house_number), ''),
               nullif(btrim(c.postal_code), ''), nullif(btrim(c.city), '')),
          false
        ) as veraltet
      from public.appointments a
      left join public.locations l on l.id = a.location_id and l.organization_id = v_org
      left join public.patient_contact_details c
        on c.patient_id = a.patient_id and c.organization_id = v_org
      where a.organization_id = v_org
        and app.may_read_appointment_context(a.kind)
        and a.kind in ('therapy', 'training')
        and a.appointment_type in ('home_visit', 'practice')
        and a.status <> 'cancelled'
        and a.staff_member_id = p_staff_member_id
        and a.starts_at >= v_start
        and a.starts_at <  v_end
    )
    select
      s.id,
      s.kind,
      s.appointment_type,
      s.status,
      s.starts_at,
      s.ends_at,
      case when s.veraltet then null
           when s.appointment_type = 'home_visit' then s.visit_lat else s.ort_lat end,
      case when s.veraltet then null
           when s.appointment_type = 'home_visit' then s.visit_lon else s.ort_lon end,
      case when s.veraltet then null
           when s.appointment_type = 'home_visit' then s.visit_geocode_precision
           else s.ort_precision end,
      case s.appointment_type when 'home_visit' then 'visit' else 'location' end,
      s.veraltet
    from stopps s
    order by s.starts_at, s.id;
end;
$$;

comment on function public.list_day_route(date, uuid) is
  'MAP-006b, UBK-007: Stopps der Tagesroute einer Person - Kennung, Zeit, Zustand und Koordinate, ohne Namen und ohne Adresse; address_outdated, wenn ein kuenftiger Hausbesuch noch eine andere Anschrift traegt als die Akte, dann ohne Koordinate (ANN-236). Rechte wie list_day_plan; abgewiesen mit denied-Eintrag (G6b).';

revoke all on function public.list_day_route(date, uuid) from public;
grant execute on function public.list_day_route(date, uuid) to authenticated;
