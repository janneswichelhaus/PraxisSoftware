-- ABN-005 (BEF-095): Ein Leserecht fuer den Stand der Dokumentation
--
-- Der Bearbeitungsstand der Dokumentation (`documentation_status`) in
-- Tagesliste und Kalender hing an app.can_read_treatment_evidence() - dem
-- Recht auf den Behandlungsnachweis fuer die Abrechnung (ADR-004 Punkt 4.4).
-- Die Oberflaeche blendete ihn fuer alle aus, die nicht schreiben duerfen
-- (ANN-201). Beides traf dieselben vier Rollen, aber zwei Namen fuer eine
-- Regel laufen frueher oder spaeter auseinander.
--
-- Abnahme Jannes, 2026-10-02: Sichtbarkeit von Stand, „Doku offen" und
-- Lese-Links folgt dem **einen** Leserecht fuer Dokumentation -
-- app.can_read_treatment_note() in der Datenbank, canReadTreatmentNote im
-- Client (ADR-004 Fassung 2: das Buero liest klinische Inhalte). Schreiben und
-- Finalisieren bleiben bei den behandelnden Rollen (ADR-016). Hier wechseln
-- die beiden Projektionen die Funktion; die Ruempfe stammen unveraendert aus
-- 20260930112000_trn_006_calendar_by_context.sql (list_day_plan) und
-- 20261001200000_cal_doku_stand_im_kalender.sql (list_appointments).

CREATE OR REPLACE FUNCTION public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text, visit_lat double precision, visit_lon double precision, treatment_table_required boolean, take_along_items text[], training_relationship_id uuid, training_given_name text, training_family_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  -- TRN-006: Der Kalender ist auch der Trainingsbetreuung offen; welche
  -- Zeilen sie sieht, entscheidet weiter der Kontext (ADR-022 Punkt 11).
  if not app.can_read_calendar() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
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

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_note();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016). Am
      -- Trainingstermin gilt dasselbe, und zwar dauerhaft (ADR-022 Punkt 6).
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end,
      v_tz,
      -- MAP-006d: die Kartenposition des Hausbesuchs fuer den Handoff (ANN-018).
      a.visit_lat,
      a.visit_lon,
      -- UX-003b: Behandlungsliege nur am Behandlungstermin (ANN-116).
      case when a.kind = 'therapy' then coalesce(care.treatment_table_required, false) end,
      -- PRX-007: Mitnehmen nur am Behandlungstermin (ANN-138).
      case when a.kind = 'therapy' then coalesce(care.take_along_items, '{}'::text[]) end,
      a.training_relationship_id,
      tp.given_name,
      tp.family_name
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    -- TRN-006: der Name am Trainingstermin kommt ueber das Verhaeltnis, nie
    -- ueber die Akte (ADR-021 Punkt 3).
    left join public.training_relationships tr on tr.id = a.training_relationship_id
    left join public.persons tp                on tp.id = tr.person_id
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_appointments(p_from date, p_to date, p_staff_member_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, location_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, staff_given_name text, staff_family_name text, location_name text, training_relationship_id uuid, training_given_name text, training_family_name text, documentation_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
  -- Zyklen 2-4: wer den Bearbeitungsstand sehen darf (wie list_day_plan).
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-006: Der Kalender ist auch der Trainingsbetreuung offen; welche
  -- Zeilen sie sieht, entscheidet weiter der Kontext (ADR-022 Punkt 11).
  if not app.can_read_calendar() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
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

  if p_status is null
     or p_status not in (
       'confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced',
       'active', 'done', 'all'
     ) then
    raise exception 'unknown status filter' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_darf_nachweis := app.can_read_treatment_note();

  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.location_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name,
      a.training_relationship_id,
      tp.given_name,
      tp.family_name,
      -- Zyklen 2-4: der Stand des Haupteintrags, nur am Behandlungstermin.
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    -- TRN-006: der Name am Trainingstermin kommt ueber das Verhaeltnis, nie
    -- ueber die Akte (ADR-021 Punkt 3).
    left join public.training_relationships tr on tr.id = a.training_relationship_id
    left join public.persons tp                on tp.id = tr.person_id
    -- Zyklen 2-4: nur der Haupteintrag (ADR-016 Punkt 6).
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id = v_org
      and app.may_read_appointment_context(a.kind)
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
      and (p_location_id     is null or a.location_id     = p_location_id)
      and (
        p_status = 'all'
        or (p_status = 'active' and a.status <> 'cancelled')
        or (p_status = 'done'   and a.status in ('completed', 'documented', 'invoiced'))
        or a.status = p_status
      )
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$function$;
