-- Planungskarte auf „Gebietstage“ (ANN-835): je Postleitzahl und gerundetem Punkt die Zahl der
-- laufenden Behandlungen. Kein Name, keine Kennung, keine Straße; die genaue Lage bleibt hier.

create function public.list_active_address_points()
  returns table (
    postal_code text,
    lat         numeric,
    lon         numeric,
    addresses   integer
  )
  language plpgsql volatile security definer
  set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_working_hours() then
    perform app.record_denied_read(auth.uid(), 'address_points.read', 'not allowed to read address points');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read address points' using errcode = '42501';
  end if;

  return query
  with anschriften as (
    select btrim(c.postal_code) as plz,
           -- ANN-835: drei Nachkommastellen, etwa 100 m. Ein Treffer nur auf den Ort stuende
           -- als Punkt in der Ortsmitte und gilt hier als nicht verortet.
           case when c.geocode_precision in ('address', 'street') then round(c.lat::numeric, 3) end as breite,
           case when c.geocode_precision in ('address', 'street') then round(c.lon::numeric, 3) end as laenge
    from public.patients p
    join public.patient_contact_details c
      on c.patient_id = p.id and c.organization_id = v_org
    where p.organization_id = v_org
      and p.care_concluded_on is null
      and nullif(btrim(c.postal_code), '') is not null
  )
  select a.plz, a.breite, a.laenge, count(*)::integer
  from anschriften a
  group by a.plz, a.breite, a.laenge
  order by a.plz, a.breite nulls last, a.laenge nulls last;
end;
$$;

comment on function public.list_active_address_points() is
  'PRX-045 (ANN-835): Planungskarte auf Gebietstage - je Postleitzahl und auf drei Nachkommastellen gerundetem Punkt die Zahl der laufenden Behandlungen (care_concluded_on leer). Ohne genaue Verortung (Ort statt Strasse oder Hausnummer, nicht verortet) bleiben Breite und Laenge leer, die Zeile zaehlt fuer die Liste. Kein Name, keine Kennung, keine Strasse. owner, team_lead und office (app.can_manage_working_hours, dieselben, die Gebiete pflegen); ein abgewiesener Aufruf liefert keine Zeile und wird als address_points.read protokolliert.';

revoke all on function public.list_active_address_points() from public, anon;
grant execute on function public.list_active_address_points() to authenticated;
