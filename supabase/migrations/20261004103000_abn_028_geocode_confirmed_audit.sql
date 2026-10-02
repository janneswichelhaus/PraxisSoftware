-- =============================================================================
-- Verorten: das Protokoll nennt jede bestaetigte Uebernahme (ABN-028, BEF-109;
-- ADR-019 Fassung 5, Punkt 37, ANN-095 Fassung 2)
--
-- Ohne Rueckfrage uebernimmt die Anwendung nur einen eindeutigen,
-- hausnummergenauen Treffer zur vollstaendigen Anschrift. Ein
-- hausnummergenauer Treffer unter mehreren wird seitdem bestaetigt
-- (p_confirmed = true). Das Protokoll leitete "confirmed" bisher allein aus
-- der Genauigkeit ab und haette diese Bestaetigung verschwiegen.
--
-- Ob ein Treffer eindeutig war, kann die Datenbank nicht pruefen: Sie sieht
-- die Antwort des Kartendienstes nie (ADR-019 Punkt 15). Die Regel steht in
-- der Function (unique) und in der Anwendung (brauchtBestaetigung).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_patient_address_coordinate(p_patient_id uuid, p_street text, p_house_number text, p_postal_code text, p_city text, p_lat double precision, p_lon double precision, p_precision text, p_confirmed boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_termine  integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dasselbe Recht wie das Aendern der Adresse: Die Koordinate ist ein Teil
  -- von ihr (ANN-016).
  if not app.can_update_patient() then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update patients' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.assert_geocode_result(p_lat, p_lon, p_precision, p_confirmed);

  update public.patient_contact_details c
     set lat = p_lat,
         lon = p_lon,
         geocode_precision = p_precision
   where c.patient_id = p_patient_id
     and c.organization_id = v_org
     and c.street is not null and c.postal_code is not null and c.city is not null
     and c.street       is not distinct from nullif(btrim(p_street), '')
     and c.house_number is not distinct from nullif(btrim(p_house_number), '')
     and c.postal_code  is not distinct from nullif(btrim(p_postal_code), '')
     and c.city         is not distinct from nullif(btrim(p_city), '');

  if not found then
    -- Die Adresse wurde zwischen Geocoding und Speichern geaendert (oder ist
    -- unvollstaendig): Eine Koordinate zu einer anderen Adresse wird nicht
    -- geschrieben.
    raise exception 'address changed since geocoding' using errcode = '40001';
  end if;

  update public.appointments a
     set visit_lat = p_lat,
         visit_lon = p_lon,
         visit_geocode_precision = p_precision
   where a.patient_id = p_patient_id
     and a.organization_id = v_org
     and a.appointment_type = 'home_visit'
     and a.starts_at >= now()
     and a.visit_street       is not distinct from nullif(btrim(p_street), '')
     and a.visit_house_number is not distinct from nullif(btrim(p_house_number), '')
     and a.visit_postal_code  is not distinct from nullif(btrim(p_postal_code), '')
     and a.visit_city         is not distinct from nullif(btrim(p_city), '');
  get diagnostics v_termine = row_count;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.address_geocoded', 'patient', p_patient_id, 'success',
    -- Nur die Genauigkeit und ob bestaetigt wurde - keine Koordinate, keine
    -- Adresse (ADR-010 Punkt 3, ADR-019 Punkt 18).
    jsonb_build_object(
      'surface', 'web',
      'precision', p_precision,
      -- ABN-028 (ADR-019 Punkt 37): Bestaetigt ist auch ein hausnummergenauer,
      -- aber nicht eindeutiger Treffer - das sagt die Anwendung mit p_confirmed.
      'confirmed', coalesce(p_confirmed, false) or p_precision <> 'address',
      'appointments_updated', v_termine
    )
  );

  return v_termine;
end;
$function$
;
