-- =============================================================================
-- UBK-017: Ort auf der Terminkachel (ANN-242)
--
-- Die Kachel im Kalender nennt den Ort: am Hausbesuch Strasse und Hausnummer,
-- am Praxistermin den Standort. Den Standortnamen liefert list_appointments
-- schon; Strasse und Hausnummer nicht - der Zuschnitt war davon ausgegangen.
-- Diese Migration ergaenzt genau diese zwei Spalten, nur am Hausbesuch,
-- aus dem Snapshot am Termin (ANN-003). Postleitzahl und Ort nicht: Auf der
-- Kachel steht der Weg zur Tuer, nicht die Anschrift (Datenminimierung).
--
-- Rechte und Zeilen unveraendert: Wer eine Zeile sieht, sah schon den Namen
-- dazu (app.may_read_appointment_context, ADR-022 Punkt 11). Der Rest der
-- Funktion ist Wort fuer Wort die Fassung aus
-- 20261002124000_abn_005_documentation_read_right.sql.
-- =============================================================================

drop function public.list_appointments(date, date, uuid, uuid, text);

create function public.list_appointments(p_from date, p_to date, p_staff_member_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, location_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, staff_given_name text, staff_family_name text, location_name text, training_relationship_id uuid, training_given_name text, training_family_name text, documentation_status text, visit_street text, visit_house_number text)
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
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end,
      -- UBK-017, ANN-242: Strasse und Hausnummer am Hausbesuch - wer die
      -- Zeile sieht, sieht wohin; Postleitzahl und Ort bleiben am Termin.
      case when a.appointment_type = 'home_visit' then a.visit_street end,
      case when a.appointment_type = 'home_visit' then a.visit_house_number end
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

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten, Behandlungen wie Ereignisse (CAL-002, CAL-004, CAL-008a, CAL-015b), seit TRN-006 auch fuer die Trainingsbetreuung - je Zeile nach Kontext gefiltert (ADR-022 Punkt 11), am Trainingstermin mit Verhaeltnis und Namen. Seit dem UI-Redesign Zyklen 2-4 mit dem Bearbeitungsstand der Dokumentation (documentation_status) am Behandlungstermin, nur fuer Rollen mit app.can_read_treatment_note(). Seit UBK-017 am Hausbesuch mit Strasse und Hausnummer (ANN-242).';
revoke all on function public.list_appointments(date, date, uuid, uuid, text) from public, anon;
grant execute on function public.list_appointments(date, date, uuid, uuid, text) to authenticated;
