-- =============================================================================
-- MAP-006c: Fahrpuffer nach PROJECT_PRINCIPLES.md §8.1 (E12 Punkt 3 und 4)
--
-- §8.1: Ist zwischen zwei aufeinanderfolgenden Terminen eine Fahrzeit
-- zurueckzulegen, kommt sie zusaetzlich zum Terminfenster. Der frueheste
-- zulaessige Beginn des Folgetermins ist der erste Rasterpunkt AUF ODER NACH
-- Ende plus Fahrzeit; aufgerundet, nie abgerundet. Beispiel: 09:05-10:05 plus
-- 12 Minuten ist 10:17, fruehester Folgetermin 10:20. Die Rundungsregel MUSS
-- serverseitig gelten, sobald eine Fahrzeit vorliegt.
--
-- ANN-097 (E12 Punkt 3a und 4, vorlaeufig):
--   * Die Fahrzeit wird im Moment der Pruefung beim Kartendienst abgerufen und
--     NICHT gespeichert (ADR-019 Punkt 16). Die Datenbank kann den Dienst nicht
--     selbst fragen (ANN-017: keine pg_net-Aufrufe); der Browser holt sie ueber
--     die eigene Edge Function und reicht sie hier zur Pruefung herein.
--   * Die Rundung steht allein hier: app.earliest_follow_up_start. Die
--     Oberflaeche rechnet nicht selbst.
--   * Ergebnis ist eine WARNUNG, keine Sperre. Weil nichts gesperrt wird, gibt
--     die hereingereichte Fahrzeit keinem Aufrufer ein Recht, das er ohne sie
--     nicht haette; sie aendert nur, was er selbst angezeigt bekommt.
--
-- Datenschutz: Fahrzeiten sind keine Leistungsdaten ueber Mitarbeitende und
-- werden nicht protokolliert, nicht gespeichert, nicht ausgewertet (§20,
-- ADR-019 Punkt 17). Die Funktion schreibt nichts ausser im Abweisungsfall.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Die Rundungsregel - eine reine Rechnung
--
-- Gerundet wird in Ortszeit der Praxis auf Minuten seit Mitternacht, dieselbe
-- Auslegung wie app.is_on_appointment_grid. Sekunden zaehlen: 10:17:30 ist
-- nach 10:17 und rundet damit auf den naechsten Punkt nach 10:17.
-- -----------------------------------------------------------------------------
create function app.earliest_follow_up_start(
  p_previous_end   timestamptz,
  p_travel_seconds integer,
  p_grid_minutes   integer,
  p_time_zone      text
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ankunft  timestamp;
  v_tag      timestamp;
  v_sekunden numeric;
  v_raster   numeric;
begin
  if p_previous_end is null or p_travel_seconds is null or p_grid_minutes is null
     or p_time_zone is null then
    return null;
  end if;
  if p_travel_seconds < 0 or p_grid_minutes <= 0 then
    raise exception 'travel time and grid must not be negative' using errcode = '22023';
  end if;

  v_ankunft  := (p_previous_end + make_interval(secs => p_travel_seconds)) at time zone p_time_zone;
  v_tag      := date_trunc('day', v_ankunft);
  v_sekunden := extract(epoch from (v_ankunft - v_tag));
  v_raster   := p_grid_minutes * 60;

  -- Aufrunden auf den ersten Rasterpunkt auf oder nach der Ankunft (§8.1).
  return (v_tag + make_interval(secs => ceil(v_sekunden / v_raster) * v_raster)) at time zone p_time_zone;
end;
$$;

comment on function app.earliest_follow_up_start(timestamptz, integer, integer, text) is
  'PROJECT_PRINCIPLES.md 8.1: fruehester Beginn des Folgetermins - erster Rasterpunkt auf oder nach Ende plus Fahrzeit, in Ortszeit der Praxis, aufgerundet. Einzige Stelle der Rundungsregel (ANN-097).';

grant execute on function app.earliest_follow_up_start(timestamptz, integer, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- check_travel_buffers - Fahrpuffer zwischen Terminpaaren pruefen
--
-- Eingabe: [{"from": <termin>, "to": <termin>, "travel_seconds": <int>}, ...]
-- mit hoechstens 25 Paaren (so viele Wegpunkte traegt eine Route). Beide
-- Termine muessen in der eigenen Organisation liegen, lesbar sein und derselben
-- Person gehoeren, und "to" beginnt nach "from"; andere Paare fallen still
-- heraus - eine fremde Kennung ist von einer unbekannten nicht zu
-- unterscheiden.
-- -----------------------------------------------------------------------------
create function public.check_travel_buffers(p_legs jsonb)
returns table (
  from_appointment_id uuid,
  to_appointment_id   uuid,
  travel_seconds      integer,
  earliest_start      timestamptz,
  shortfall_minutes   integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_tz   text;
  v_grid integer;
  v_leg  jsonb;
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

  if p_legs is null or jsonb_typeof(p_legs) <> 'array' or jsonb_array_length(p_legs) > 25 then
    raise exception 'legs must be an array of at most 25 pairs' using errcode = '22023';
  end if;

  for v_leg in select * from jsonb_array_elements(p_legs) loop
    if jsonb_typeof(v_leg) <> 'object'
       or jsonb_typeof(v_leg -> 'travel_seconds') <> 'number'
       or (v_leg ->> 'travel_seconds')::numeric <> floor((v_leg ->> 'travel_seconds')::numeric)
       or (v_leg ->> 'travel_seconds')::numeric not between 0 and 86400
       or (v_leg ->> 'from') !~ '^[0-9a-f-]{36}$'
       or (v_leg ->> 'to') !~ '^[0-9a-f-]{36}$' then
      raise exception 'invalid leg' using errcode = '22023';
    end if;
  end loop;

  select o.time_zone, o.appointment_grid_minutes into v_tz, v_grid
  from public.organizations o where o.id = v_org;

  return query
    select
      a.id,
      b.id,
      (l.leg ->> 'travel_seconds')::integer,
      app.earliest_follow_up_start(a.ends_at, (l.leg ->> 'travel_seconds')::integer, v_grid, v_tz),
      greatest(
        0,
        ceil(extract(epoch from (
          app.earliest_follow_up_start(a.ends_at, (l.leg ->> 'travel_seconds')::integer, v_grid, v_tz)
          - b.starts_at
        )) / 60)
      )::integer
    from jsonb_array_elements(p_legs) as l(leg)
    join public.appointments a
      on a.id = (l.leg ->> 'from')::uuid
     and a.organization_id = v_org
     and app.may_read_appointment_context(a.kind)
    join public.appointments b
      on b.id = (l.leg ->> 'to')::uuid
     and b.organization_id = v_org
     and app.may_read_appointment_context(b.kind)
     and b.staff_member_id = a.staff_member_id
     and b.starts_at >= a.ends_at;
end;
$$;

comment on function public.check_travel_buffers(jsonb) is
  'MAP-006c, PROJECT_PRINCIPLES.md 8.1, ANN-097: frueheste Beginne und Unterschreitung je Terminpaar aus einer live abgerufenen Fahrzeit. Warnung, keine Sperre; nichts wird gespeichert.';

revoke all on function public.check_travel_buffers(jsonb) from public;
grant execute on function public.check_travel_buffers(jsonb) to authenticated;
