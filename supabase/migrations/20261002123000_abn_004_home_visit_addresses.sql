-- ABN-004 (BEF-092): Nach einer Adressaenderung bleiben kuenftige Hausbesuche
-- nicht stumm bei der alten Adresse.
--
-- Ein Hausbesuch kopiert die Anschrift beim Anlegen (ANN-003). Aendert die
-- Praxis danach die Stammdaten, behalten auch die kuenftigen Hausbesuche die
-- alte Adresse - und nichts wies darauf hin. Abnahme Jannes, 2026-10-02:
--
--   * Vergangene Termine behalten ihre damalige Adresse (so war es, so ist es).
--   * Die Akte nennt die kuenftigen Hausbesuche mit abweichender Adresse und
--     bietet an, sie gezielt zu aktualisieren - einzeln oder alle.
--   * Nichts aendert sich ohne Bestaetigung: kein Trigger auf die Stammdaten,
--     ein ausdruecklicher Schreibpfad.
--   * Jede Aenderung steht im Protokoll wie eine Terminaenderung
--     (`appointment.updated`, changed_fields `visit_address`).
--
-- Die Koordinate zieht der vorhandene Trigger
-- `appointments_copy_visit_coordinate` (MAP-006a) nach, sobald sich die
-- Adressspalten aendern; der Mitteilungsvermerk verfaellt ueber ABN-003.

-- -----------------------------------------------------------------------------
-- 1. Lesen: welche kuenftigen Hausbesuche nennen noch eine andere Adresse?
--
-- Verglichen wird mit der gekuerzten Stammdatenadresse, so wie
-- update_appointment sie beim Wechsel zum Hausbesuch kopiert. VOLATILE, weil
-- der abgewiesene Aufruf einen denied-Eintrag schreibt (BEF-082).
-- -----------------------------------------------------------------------------
create function public.list_home_visits_with_outdated_address(p_patient_id uuid)
returns table (
  id                      uuid,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  staff_given_name        text,
  staff_family_name       text,
  visit_street            text,
  visit_house_number      text,
  visit_postal_code       text,
  visit_city              text,
  organization_time_zone  text
)
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

  if not app.can_read_appointments() or not app.may_read_appointment_context('therapy') then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      sp.given_name,
      sp.family_name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    join public.patient_contact_details c on c.patient_id = a.patient_id
    where a.organization_id  = v_org
      and a.patient_id       = p_patient_id
      and a.kind             = 'therapy'
      and a.appointment_type = 'home_visit'
      and a.status           = 'confirmed'
      and a.starts_at        > now()
      -- Nur vergleichen, wenn die Stammdaten eine vollstaendige Anschrift
      -- tragen - sonst gibt es nichts, womit der Termin zu aktualisieren waere.
      and nullif(btrim(c.street), '')       is not null
      and nullif(btrim(c.house_number), '') is not null
      and nullif(btrim(c.postal_code), '')  is not null
      and nullif(btrim(c.city), '')         is not null
      and (a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city)
          is distinct from
          (nullif(btrim(c.street), ''), nullif(btrim(c.house_number), ''),
           nullif(btrim(c.postal_code), ''), nullif(btrim(c.city), ''))
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_home_visits_with_outdated_address(uuid) is
  'Kuenftige bestaetigte Hausbesuche einer Patient:in, deren kopierte Anschrift von der aktuellen Stammdatenadresse abweicht (ABN-004, BEF-092, ANN-003). Rein organisatorisch; Rollen der Terminverwaltung, abgewiesen mit appointments.read.';

revoke all on function public.list_home_visits_with_outdated_address(uuid) from public, anon;
grant execute on function public.list_home_visits_with_outdated_address(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Schreiben: die gewaehlten Hausbesuche auf die aktuelle Anschrift setzen
--
-- Alles oder nichts: Jede Kennung muss ein kuenftiger, bestaetigter Hausbesuch
-- dieser Organisation sein, und die Stammdaten der jeweiligen Patient:in muessen
-- eine vollstaendige Anschrift tragen. Ein Auditeintrag je Termin, wie bei
-- jeder Terminaenderung - ohne Adresse im Kontext (ADR-011).
-- -----------------------------------------------------------------------------
create function public.update_home_visit_addresses(p_appointment_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_actor     uuid := auth.uid();
  v_geschickt integer;
  v_anzahl    integer;
  v_zeile     record;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_appointment() or not app.may_write_appointment_context('therapy') then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  create temp table abn_adressen on commit drop as
    select a.id,
           a.patient_id,
           nullif(btrim(c.street), '')       as street,
           nullif(btrim(c.house_number), '') as house_number,
           nullif(btrim(c.postal_code), '')  as postal_code,
           nullif(btrim(c.city), '')         as city
    from public.appointments a
    join public.patient_contact_details c on c.patient_id = a.patient_id
    where a.id = any(p_appointment_ids)
      and a.organization_id  = v_org
      and a.kind             = 'therapy'
      and a.appointment_type = 'home_visit'
      and a.status           = 'confirmed'
      and a.starts_at        > now();

  select count(*) into v_anzahl from abn_adressen;
  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not updatable' using errcode = '22023';
  end if;

  if exists (
    select 1 from abn_adressen
    where street is null or house_number is null or postal_code is null or city is null
  ) then
    raise exception 'home visit requires a complete patient address' using errcode = '22023';
  end if;

  for v_zeile in select * from abn_adressen loop
    update public.appointments a
       set visit_street       = v_zeile.street,
           visit_house_number = v_zeile.house_number,
           visit_postal_code  = v_zeile.postal_code,
           visit_city         = v_zeile.city,
           updated_at         = now()
     where a.id = v_zeile.id;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'appointment.updated', 'appointment', v_zeile.id, 'success',
      jsonb_build_object(
        'surface', 'web',
        'patient_id', v_zeile.patient_id,
        'changed_fields', to_jsonb(array['visit_address']),
        'reason', 'patient_address_changed'
      )
    );
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.update_home_visit_addresses(uuid[]) is
  'Setzt kuenftige bestaetigte Hausbesuche auf die aktuelle Stammdatenadresse ihrer Patient:in (ABN-004, BEF-092): alles oder nichts, nur auf ausdrueckliche Bestaetigung, ein Auditeintrag appointment.updated je Termin mit changed_fields visit_address. Vergangene Termine behalten ihre damalige Adresse (ANN-003).';

revoke all on function public.update_home_visit_addresses(uuid[]) from public, anon;
grant execute on function public.update_home_visit_addresses(uuid[]) to authenticated;
