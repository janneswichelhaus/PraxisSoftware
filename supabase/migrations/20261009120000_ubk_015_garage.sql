-- =============================================================================
-- UBK-015: Garage (Abstellort der Raeder) je Standort (ANN-240)
--
-- Die Tour beginnt und endet am Abstellort der Raeder, nicht zwingend an der
-- Praxis. Der Startort (locations.street ... lat/lon, set_location_tour_start)
-- ist zugleich die Koordinate der Praxistermine und darf deshalb nicht auf
-- die Garage gesetzt werden. Die Garage bekommt eigene Spalten am Standort.
--
-- Eine Praxisadresse, keine persoenliche (§20): Eine Wohnadresse von
-- Mitarbeitenden waere ein Beschaeftigtendatum beim Kartendienst. Die
-- Oberflaeche sagt das; erzwingen laesst es sich nicht.
--
-- Wie der Startort: Adresse und Koordinate werden zusammen gesetzt, nur von
-- owner, ohne Auditeintrag (ADR-010 Fassung 3). Die Koordinate verfaellt mit
-- jeder Aenderung der Adresse (ANN-016). Datenklasse und Frist des Standorts
-- (stammdaten_praxis).
-- =============================================================================

alter table public.locations
  add column garage_street text
    check (garage_street is null or length(btrim(garage_street)) between 1 and 200),
  add column garage_house_number text
    check (garage_house_number is null or length(btrim(garage_house_number)) between 1 and 20),
  add column garage_postal_code text
    check (garage_postal_code is null or length(btrim(garage_postal_code)) between 2 and 12),
  add column garage_city text
    check (garage_city is null or length(btrim(garage_city)) between 1 and 200),
  add column garage_lat double precision,
  add column garage_lon double precision,
  add column garage_geocode_precision text,
  add constraint locations_garage_coordinate_check check (
    (garage_lat is null and garage_lon is null and garage_geocode_precision is null)
    or (garage_lat between -90 and 90
        and garage_lon between -180 and 180
        and garage_geocode_precision in ('address', 'street', 'locality', 'unknown')
        and garage_street is not null and garage_postal_code is not null and garage_city is not null)
  );

comment on column public.locations.garage_street is
  'UBK-015, ANN-240: Garage (Abstellort der Raeder) - Beginn und Ende der Tour, wenn gesetzt. Adresse der Praxis, keine Personenadresse (§20). Geschrieben nur von set_location_garage/clear_location_garage.';
comment on column public.locations.garage_lat is
  'UBK-015, ANN-240: Koordinate der Garage. Verfaellt mit jeder Aenderung ihrer Adresse (ANN-016). Nie in Logs (ADR-011).';
comment on column public.locations.garage_lon is
  'UBK-015, ANN-240: siehe garage_lat.';

-- -----------------------------------------------------------------------------
-- Die Koordinate der Garage verfaellt mit ihrer Adresse - gleich, wer schreibt
-- -----------------------------------------------------------------------------
create function app.drop_garage_coordinate_on_address_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.garage_street       is distinct from old.garage_street
     or new.garage_house_number is distinct from old.garage_house_number
     or new.garage_postal_code  is distinct from old.garage_postal_code
     or new.garage_city         is distinct from old.garage_city then
    new.garage_lat := null;
    new.garage_lon := null;
    new.garage_geocode_precision := null;
  end if;
  return new;
end;
$$;

comment on function app.drop_garage_coordinate_on_address_change() is
  'UBK-015, ANN-016: Eine Aenderung der Garagenadresse verwirft ihre Koordinate im selben Schreibvorgang.';

create trigger locations_drop_garage_coordinate
  before update on public.locations
  for each row execute function app.drop_garage_coordinate_on_address_change();

-- -----------------------------------------------------------------------------
-- set_location_garage - Adresse und Koordinate der Garage, nur owner
-- -----------------------------------------------------------------------------
create function public.set_location_garage(
  p_location_id  uuid,
  p_street       text,
  p_house_number text,
  p_postal_code  text,
  p_city         text,
  p_lat          double precision,
  p_lon          double precision,
  p_precision    text,
  p_confirmed    boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the garage' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the garage' using errcode = '42501';
  end if;

  if nullif(btrim(p_street), '') is null
     or nullif(btrim(p_postal_code), '') is null
     or nullif(btrim(p_city), '') is null then
    raise exception 'street, postal code and city are required' using errcode = '22023';
  end if;

  perform app.assert_geocode_result(p_lat, p_lon, p_precision, p_confirmed);

  -- Adresse zuerst, dann die Koordinate: Der Trigger verwirft sie sonst im
  -- selben Schreibvorgang als "zur alten Adresse gehoerig".
  update public.locations l
     set garage_street       = btrim(p_street),
         garage_house_number = nullif(btrim(p_house_number), ''),
         garage_postal_code  = btrim(p_postal_code),
         garage_city         = btrim(p_city)
   where l.id = p_location_id
     and l.organization_id = v_org;

  if not found then
    raise exception 'location not found' using errcode = 'P0002';
  end if;

  update public.locations l
     set garage_lat = p_lat,
         garage_lon = p_lon,
         garage_geocode_precision = p_precision
   where l.id = p_location_id;
end;
$$;

comment on function public.set_location_garage(uuid, text, text, text, text, double precision, double precision, text, boolean) is
  'UBK-015, ANN-240: setzt Adresse und Koordinate der Garage eines Standorts (Beginn und Ende der Tour). Nur owner, ohne Auditeintrag.';

revoke all on function public.set_location_garage(uuid, text, text, text, text, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.set_location_garage(uuid, text, text, text, text, double precision, double precision, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- clear_location_garage - ohne Garage beginnt die Tour wieder an der Praxis
-- -----------------------------------------------------------------------------
create function public.clear_location_garage(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the garage' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the garage' using errcode = '42501';
  end if;

  update public.locations l
     set garage_street = null,
         garage_house_number = null,
         garage_postal_code = null,
         garage_city = null,
         garage_lat = null,
         garage_lon = null,
         garage_geocode_precision = null
   where l.id = p_location_id
     and l.organization_id = v_org;

  if not found then
    raise exception 'location not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.clear_location_garage(uuid) is
  'UBK-015, ANN-240: entfernt die Garage eines Standorts; die Tour beginnt und endet dann an der Praxis. Nur owner.';

revoke all on function public.clear_location_garage(uuid) from public, anon;
grant execute on function public.clear_location_garage(uuid) to authenticated;
