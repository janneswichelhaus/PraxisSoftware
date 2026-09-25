-- =============================================================================
-- MAP-006a: Koordinaten bei der Adresse (ANN-016, ADR-019 Punkt 13 und 14)
--
-- Zu jeder Hausbesuchsadresse wird die geocodierte Koordinate bei der Adresse
-- gespeichert - als abgeleitetes Stammdatum mit Datenklasse und Frist der
-- Adresse (ANN-016). Geocodiert wird nur beim Anlegen oder Aendern einer
-- Adresse, nie beim Oeffnen einer Karte; danach arbeiten Karte, Route und
-- Fahrzeit nur noch mit Koordinaten.
--
-- Drei Orte:
--   * patient_contact_details: die Koordinate der Patientenadresse. Aendert
--     sich die Adresse, verfaellt sie im selben Schreibvorgang (Trigger).
--   * appointments.visit_*: der Adress-Snapshot des Hausbesuchs (ANN-003)
--     bekommt die Koordinate dazu. Ein Trigger uebernimmt sie beim Setzen der
--     Snapshot-Adresse, wenn sie mit der geocodierten Patientenadresse
--     uebereinstimmt - fuer alle Schreibpfade gleich, ohne jeden einzeln
--     anzufassen.
--   * locations: der Startort einer Tour (Depot des Standorts, TOUR-001).
--     Keine Personenadresse.
--
-- Einziger Schreiber der Koordinate: set_patient_address_coordinate und
-- set_location_tour_start. Unterhalb der Hausnummerngenauigkeit verlangen
-- beide eine ausdrueckliche Bestaetigung (ANN-016). RLS bleibt unveraendert:
-- neue Spalten folgen den Policies ihrer Tabelle.
--
-- Audit (ADR-010): patient.address_geocoded und
-- organization.tour_start_changed - im Kontext nur die Genauigkeit, nie eine
-- Koordinate oder Adresse (ADR-011, ADR-019 Punkt 18).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Spalten
-- -----------------------------------------------------------------------------
alter table public.patient_contact_details
  add column lat double precision,
  add column lon double precision,
  add column geocode_precision text,
  add constraint patient_contact_details_coordinate_check check (
    (lat is null and lon is null and geocode_precision is null)
    or (lat between -90 and 90
        and lon between -180 and 180
        and geocode_precision in ('address', 'street', 'locality', 'unknown')
        and street is not null and postal_code is not null and city is not null)
  );

comment on column public.patient_contact_details.lat is
  'Breitengrad der geocodierten Adresse (ANN-016). Abgeleitetes Stammdatum mit Datenklasse und Frist der Adresse. Geschrieben nur von set_patient_address_coordinate; verfaellt bei jeder Adressaenderung. Nie in Logs (ADR-011).';
comment on column public.patient_contact_details.lon is
  'Laengengrad der geocodierten Adresse (ANN-016). Siehe lat.';
comment on column public.patient_contact_details.geocode_precision is
  'Genauigkeit des Geocoding-Treffers: address, street, locality, unknown. Unterhalb address hat die erfassende Person den Treffer bestaetigt (ANN-016).';

alter table public.appointments
  add column visit_lat double precision,
  add column visit_lon double precision,
  add column visit_geocode_precision text,
  add constraint appointments_visit_coordinate_check check (
    (visit_lat is null and visit_lon is null and visit_geocode_precision is null)
    or (visit_lat between -90 and 90
        and visit_lon between -180 and 180
        and visit_geocode_precision in ('address', 'street', 'locality', 'unknown')
        and visit_street is not null)
  );

comment on column public.appointments.visit_lat is
  'Breitengrad des Hausbesuchs-Snapshots (ANN-016, ANN-003). Uebernommen aus der geocodierten Patientenadresse, wenn sie mit visit_* uebereinstimmt; Frist wie der Termin.';
comment on column public.appointments.visit_lon is
  'Laengengrad des Hausbesuchs-Snapshots. Siehe visit_lat.';
comment on column public.appointments.visit_geocode_precision is
  'Genauigkeit der uebernommenen Koordinate. Siehe patient_contact_details.geocode_precision.';

alter table public.locations
  add column street text check (street is null or length(btrim(street)) between 1 and 200),
  add column house_number text check (house_number is null or length(btrim(house_number)) between 1 and 20),
  add column postal_code text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  add column city text check (city is null or length(btrim(city)) between 1 and 200),
  add column lat double precision,
  add column lon double precision,
  add column geocode_precision text,
  add constraint locations_coordinate_check check (
    (lat is null and lon is null and geocode_precision is null)
    or (lat between -90 and 90
        and lon between -180 and 180
        and geocode_precision in ('address', 'street', 'locality', 'unknown')
        and street is not null and postal_code is not null and city is not null)
  );

comment on column public.locations.lat is
  'Startort der Tagesroute (Depot des Standorts, TOUR-001, MAP-006a). Adresse der Praxis, keine Personenadresse. Geschrieben nur von set_location_tour_start.';

-- -----------------------------------------------------------------------------
-- Die Koordinate verfaellt mit der Adresse
--
-- Jede Aenderung an Strasse, Hausnummer, Postleitzahl oder Ort macht die
-- Koordinate ungueltig - gleich, welcher Schreibpfad sie aendert. Eine
-- Koordinate, die zu einer anderen Adresse gehoert, waere schlimmer als keine.
-- -----------------------------------------------------------------------------
create function app.drop_coordinate_on_address_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.street       is distinct from old.street
     or new.house_number is distinct from old.house_number
     or new.postal_code  is distinct from old.postal_code
     or new.city         is distinct from old.city then
    new.lat := null;
    new.lon := null;
    new.geocode_precision := null;
  end if;
  return new;
end;
$$;

comment on function app.drop_coordinate_on_address_change() is
  'MAP-006a, ANN-016: Eine Adressaenderung verwirft die Koordinate im selben Schreibvorgang.';

create trigger patient_contact_details_drop_coordinate
  before update on public.patient_contact_details
  for each row execute function app.drop_coordinate_on_address_change();

create trigger locations_drop_coordinate
  before update on public.locations
  for each row execute function app.drop_coordinate_on_address_change();

-- -----------------------------------------------------------------------------
-- Die Koordinate im Termin-Snapshot
--
-- Beim Anlegen eines Hausbesuchs und bei jeder Aenderung seiner Adresse wird
-- die Koordinate aus der Patientenadresse uebernommen - aber nur, wenn die
-- Snapshot-Adresse Feld fuer Feld mit ihr uebereinstimmt. Sonst bleibt der
-- Snapshot ohne Koordinate (ANN-003: der Termin behaelt seinen Ort).
-- SECURITY DEFINER, weil der Trigger in jedem Schreibpfad lesen koennen muss;
-- er liest nur die eine Zeile des Termins.
-- -----------------------------------------------------------------------------
create function app.copy_visit_coordinate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat       double precision;
  v_lon       double precision;
  v_precision text;
begin
  if tg_op = 'UPDATE'
     and new.visit_street       is not distinct from old.visit_street
     and new.visit_house_number is not distinct from old.visit_house_number
     and new.visit_postal_code  is not distinct from old.visit_postal_code
     and new.visit_city         is not distinct from old.visit_city
     and new.patient_id         is not distinct from old.patient_id then
    return new;
  end if;

  new.visit_lat := null;
  new.visit_lon := null;
  new.visit_geocode_precision := null;

  if new.visit_street is null or new.patient_id is null then
    return new;
  end if;

  select c.lat, c.lon, c.geocode_precision
    into v_lat, v_lon, v_precision
  from public.patient_contact_details c
  where c.patient_id = new.patient_id
    and c.organization_id = new.organization_id
    and c.street       is not distinct from new.visit_street
    and c.house_number is not distinct from new.visit_house_number
    and c.postal_code  is not distinct from new.visit_postal_code
    and c.city         is not distinct from new.visit_city
    and c.lat is not null;

  if found then
    new.visit_lat := v_lat;
    new.visit_lon := v_lon;
    new.visit_geocode_precision := v_precision;
  end if;
  return new;
end;
$$;

comment on function app.copy_visit_coordinate() is
  'MAP-006a, ANN-016: uebernimmt die Koordinate der Patientenadresse in den Hausbesuchs-Snapshot, wenn die Adressen uebereinstimmen.';

revoke all on function app.copy_visit_coordinate() from public;

create trigger appointments_copy_visit_coordinate
  before insert or update of visit_street, visit_house_number, visit_postal_code, visit_city, patient_id
  on public.appointments
  for each row execute function app.copy_visit_coordinate();

-- -----------------------------------------------------------------------------
-- Pruefung einer Koordinate aus dem Geocoding
-- -----------------------------------------------------------------------------
create function app.assert_geocode_result(
  p_lat       double precision,
  p_lon       double precision,
  p_precision text,
  p_confirmed boolean
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_lat is null or p_lon is null
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'coordinate out of range' using errcode = '22023';
  end if;
  if p_precision is null or p_precision not in ('address', 'street', 'locality', 'unknown') then
    raise exception 'unknown geocode precision' using errcode = '22023';
  end if;
  -- ANN-016: unterhalb der Hausnummer bestaetigt die erfassende Person den
  -- Treffer, sonst bleibt die Adresse ohne Koordinate.
  if p_precision <> 'address' and coalesce(p_confirmed, false) is false then
    raise exception 'geocode result below address precision must be confirmed' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- set_patient_address_coordinate
--
-- Schreibt die Koordinate zur Patientenadresse - nur, wenn die Adresse seit
-- dem Geocoding unveraendert ist (die Anfrage traegt die geocodierte Adresse
-- mit). Uebertraegt sie in kuenftige Hausbesuche derselben Adresse, die vor
-- dem Geocoding angelegt wurden (ANN-095). Vergangene Termine bleiben, wie sie
-- sind.
-- -----------------------------------------------------------------------------
create function public.set_patient_address_coordinate(
  p_patient_id   uuid,
  p_street       text,
  p_house_number text,
  p_postal_code  text,
  p_city         text,
  p_lat          double precision,
  p_lon          double precision,
  p_precision    text,
  p_confirmed    boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
      'confirmed', p_precision <> 'address',
      'appointments_updated', v_termine
    )
  );

  return v_termine;
end;
$$;

comment on function public.set_patient_address_coordinate(uuid, text, text, text, text, double precision, double precision, text, boolean) is
  'MAP-006a, ANN-016: einziger Schreiber der Koordinate einer Patientenadresse; uebertraegt sie in kuenftige Hausbesuche derselben Adresse (ANN-095).';

revoke all on function public.set_patient_address_coordinate(uuid, text, text, text, text, double precision, double precision, text, boolean) from public;
grant execute on function public.set_patient_address_coordinate(uuid, text, text, text, text, double precision, double precision, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- set_location_tour_start - Startort der Tagesroute (Depot des Standorts)
--
-- Eine Grundeinstellung der Praxis wie das Raster: nur owner. Adresse und
-- Koordinate werden zusammen gesetzt; ohne Koordinate gibt es keinen Start.
-- -----------------------------------------------------------------------------
create function public.set_location_tour_start(
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
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the tour start' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the tour start' using errcode = '42501';
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
     set street       = btrim(p_street),
         house_number = nullif(btrim(p_house_number), ''),
         postal_code  = btrim(p_postal_code),
         city         = btrim(p_city)
   where l.id = p_location_id
     and l.organization_id = v_org;

  if not found then
    raise exception 'location not found' using errcode = 'P0002';
  end if;

  update public.locations l
     set lat = p_lat,
         lon = p_lon,
         geocode_precision = p_precision
   where l.id = p_location_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.tour_start_changed', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web', 'location_id', p_location_id, 'precision', p_precision)
  );
end;
$$;

comment on function public.set_location_tour_start(uuid, text, text, text, text, double precision, double precision, text, boolean) is
  'MAP-006a: setzt Adresse und Koordinate des Startorts einer Tagesroute (Depot des Standorts). Nur owner.';

revoke all on function public.set_location_tour_start(uuid, text, text, text, text, double precision, double precision, text, boolean) from public;
grant execute on function public.set_location_tour_start(uuid, text, text, text, text, double precision, double precision, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Patientenkartei: Stand der Verortung (ohne Koordinate)
-- -----------------------------------------------------------------------------
create or replace view public.patient_directory
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.status,
  p.care_started_on,
  p.care_concluded_on,
  p.care_concluded_at,
  pe.given_name,
  pe.family_name,
  c.date_of_birth,
  c.email,
  c.phone,
  c.phone_work,
  c.phone_mobile,
  c.fax,
  c.institution,
  c.street,
  c.house_number,
  c.postal_code,
  c.city,
  cd.primary_therapist_staff_member_id,
  case
    when tp.id is null then null
    else tp.given_name || ' ' || tp.family_name
  end as primary_therapist_name,
  cd.home_visit_access_note,
  cd.special_note,
  cd.remark,
  -- MAP-006a: nur ob und wie genau die Adresse verortet ist, nicht die
  -- Koordinate selbst - die braucht die Kartei nicht (Datenminimierung).
  c.geocode_precision
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id
left join public.patient_care_details cd on cd.patient_id = p.id
left join public.staff_members tsm on tsm.id = cd.primary_therapist_staff_member_id
left join public.persons tp on tp.id = tsm.person_id;

-- -----------------------------------------------------------------------------
-- Auskunft nach Art. 15 DSGVO (OPS-006): Die Koordinate ist so personenbezogen
-- wie die Adresse und gehoert deshalb in den Export. Rumpf sonst unveraendert
-- aus 20260922130000_datenschutzvermerke.sql.
-- -----------------------------------------------------------------------------
create or replace function public.export_patient_record(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'fax', k.fax,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme; die Datei selbst wird getrennt herausgegeben (ADR-017).'
      ),
      jsonb_build_object(
        'was', 'Protokoll der Zugriffe auf die Akte',
        'grund', 'Jede Zeile ist zugleich ein Datensatz ueber eine beschaeftigte Person (Art. 15 Abs. 4 DSGVO); sie wird auf gesondertes Verlangen erteilt (ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; supabase/tests/audit.test.ts prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'patient_record.exported',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'organization.billing_profile_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted',
    'service_catalog.version_created',
    'service_catalog.version_updated',
    'service_catalog.version_published',
    'service_catalog.version_deleted',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice_recipient.created',
    'invoice_recipient.updated',
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued',
    'invoice.cancelled',
    'invoice.reminder_created',
    'payment.recorded',
    'payment.voided',
    'organization.bootstrapped',
    'deletion_runs.read',
    'patient_privacy.recorded',
    'appointments.read',
    'patient_directory.read',
    'treatment_bases.read',
    'treatment_evidence.read',
    'patient_files.read',
    'text_snippets.read',
    'invoicing.read',
    'billable_services.read',
    'legal_holds.read',
    'storage_deletion.read',
    'patient.address_geocoded',
    'organization.tour_start_changed'
  ));

-- -----------------------------------------------------------------------------

