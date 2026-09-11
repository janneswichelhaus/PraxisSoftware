-- =============================================================================
-- Tag umplanen (CAL-009, IDEA-PRX-004)
--
-- Ein Platten um 8:10 Uhr trifft sechs Haushalte ohne Wartezimmer. Heute
-- heisst das: sechsmal den Termin oeffnen, absagen, bestaetigen - und die
-- Nummern einzeln zusammensuchen.
--
-- Diese Funktion sagt alle noch bestaetigten Termine EINER Person an EINEM
-- Kalendertag in EINER Transaktion ab. Drei Festlegungen dahinter:
--
--   * KEINE eigene Fachlogik. Sie ruft je Termin public.cancel_appointment
--     auf. Damit gelten unveraendert dessen Rollenpruefung, Zustandspruefung,
--     Pflichtgrund und Auditeintrag - es entsteht kein zweiter Schreibpfad mit
--     eigenen Regeln (dasselbe Muster wie complete_treatment, UX-007).
--     ADR-018 Punkt 5 sagt es fuer die Serie und es gilt hier genauso: eine
--     Sammelabsage ist eine Bedienhilfe, die n Einzelabsagen ausloest, und
--     keine eigene Zustandsaenderung.
--   * ALLES ODER NICHTS. Scheitert eine Absage - etwa weil jemand denselben
--     Termin gerade geaendert hat -, faellt die ganze Transaktion zurueck. Ein
--     halb umgeplanter Tag waere schlimmer als ein gescheiterter Versuch
--     (PROJECT_PRINCIPLES.md 13).
--   * NUR bestaetigte Termine. Abgeschlossene, dokumentierte und bereits
--     abgesagte bleiben unberuehrt; sie sind kein Teil des Ausfalls. Ein
--     Termin am Morgen, der schon stattgefunden hat, wird nicht rueckwirkend
--     abgesagt.
--
-- Die Anrufliste ist KEIN neuer Lesepfad: die Oberflaeche liest sie mit dem
-- bestehenden public.list_day_plan (UX-001). Eine zweite Projektion mit
-- denselben Rufnummern waere eine zweite Stelle, an der Zweckbindung
-- nachgezogen werden muesste (ADR-004).
-- =============================================================================

create function public.cancel_staff_day(
  p_staff_member_id uuid,
  p_date            date,
  p_reason          text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_tz      text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_termin  record;
  v_anzahl  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_cancel_appointment() then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_staff_member_id is null or p_date is null then
    raise exception 'staff member and date are required' using errcode = '22023';
  end if;

  -- Zielsatz ausschliesslich in der eigenen Organisation suchen; sonst waere
  -- die Funktion ein Orakel fuer fremde Mitarbeiter-IDs
  -- (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = v_org
  ) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_day_plan und list_appointments.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  -- FOR UPDATE ohne SKIP LOCKED: ein Termin, an dem gerade jemand arbeitet,
  -- soll die Umplanung aufhalten und nicht stillschweigend stehen bleiben.
  for v_termin in
    select a.id, a.updated_at
    from public.appointments a
    where a.organization_id = v_org
      and a.staff_member_id = p_staff_member_id
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and a.status = 'confirmed'
    order by a.starts_at, a.id
    for update
  loop
    perform public.cancel_appointment(v_termin.id, v_termin.updated_at, p_reason);
    v_anzahl := v_anzahl + 1;
  end loop;

  -- Kein eigenes Sammelereignis: je Absage steht ein appointment.cancelled im
  -- Auditlog, und das ist der auditpflichtige Vorgang (ADR-010, ADR-018
  -- Punkt 5). Ein zusaetzlicher Eintrag "Tag umgeplant" wuerde dieselbe
  -- Tatsache ein zweites Mal festhalten.
  return v_anzahl;
end;
$$;

comment on function public.cancel_staff_day(uuid, date, text) is
  'Sagt alle bestaetigten Termine einer Person an einem Kalendertag in einer Transaktion ab und liefert ihre Anzahl (CAL-009). Ruft je Termin cancel_appointment auf; deren Rechte-, Zustands- und Auditregeln gelten unveraendert.';

revoke all on function public.cancel_staff_day(uuid, date, text) from public, anon;
grant execute on function public.cancel_staff_day(uuid, date, text) to authenticated;
