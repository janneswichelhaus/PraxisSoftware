-- Ohne 3D-Rad trägt eine Stelle nur noch Bauteil, Einstufung und Notiz (Jannes, 2026-10-26, M1;
-- ANN-555): Punkt in Modellkoordinaten und Fassung des Modells entfallen. Ein noch mitgesendeter
-- Punkt bleibt ohne Wirkung, damit ein offenes Gerät mit alter Fassung weiter melden kann.

create or replace function app.fleet_insert_spots(
  p_org uuid, p_bike public.fleet_bikes, p_checkup_id uuid, p_breakdown_id uuid, p_spots jsonb
)
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_spot     jsonb;
  v_severity text;
  v_ids      jsonb := '[]'::jsonb;
  v_id       uuid;
begin
  if p_spots is null or jsonb_typeof(p_spots) <> 'array' then
    raise exception 'spots must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_spots) > 20 then
    raise exception 'too many spots' using errcode = '22023';
  end if;

  for v_spot in select e from jsonb_array_elements(p_spots) e
  loop
    if jsonb_typeof(v_spot) <> 'object'
       or not (coalesce(v_spot ->> 'zone', '') = any (app.fleet_zones(p_bike.bike_type))) then
      raise exception 'unknown zone' using errcode = '22023';
    end if;
    v_severity := case when p_breakdown_id is not null then 'problem' else v_spot ->> 'severity' end;
    if v_severity is null or v_severity not in ('problem', 'beobachten') then
      raise exception 'unknown severity' using errcode = '22023';
    end if;

    insert into public.fleet_spots (
      organization_id, bike_id, checkup_id, breakdown_id, bike_type, zone, severity, note,
      created_by
    )
    values (
      p_org, p_bike.id, p_checkup_id, p_breakdown_id, p_bike.bike_type, v_spot ->> 'zone',
      v_severity, app.fleet_text(v_spot ->> 'note', 500, 'spot note'), auth.uid()
    )
    returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  return v_ids;
end;
$$;

create or replace function app.fleet_spot_json(p_spot public.fleet_spots, p_number integer)
returns jsonb
language sql stable security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'id', p_spot.id,
    'number', p_number,
    'zone', p_spot.zone,
    'severity', p_spot.severity,
    'note', p_spot.note,
    'source', case when p_spot.checkup_id is not null then 'checkup' else 'breakdown' end,
    'source_id', coalesce(p_spot.checkup_id, p_spot.breakdown_id),
    'created_at', p_spot.created_at,
    'resolved_at', p_spot.resolved_at
  )
$$;

create or replace function public.get_fleet_workshop_sheet(p_bike_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_org  uuid;
  v_bike public.fleet_bikes%rowtype;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to read the fleet');

  select b.* into v_bike
  from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null;
  if v_bike.id is null then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'name', v_bike.name,
    'bike_type', v_bike.bike_type,
    'blocked_since', (
      select b.blocked_at from public.fleet_blocks b
      where b.bike_id = v_bike.id and b.released_at is null
    ),
    'spots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'number', s.nummer,
          'zone', s.zone,
          'severity', s.severity,
          'note', s.note,
          'source', case when s.checkup_id is not null then 'checkup' else 'breakdown' end,
          'source_at', coalesce(c.checked_at, d.reported_at)
        )
        order by s.nummer
      )
      from (
        select s.*, (row_number() over (order by s.created_at, s.seq))::integer as nummer
        from public.fleet_spots s
        where s.bike_id = v_bike.id and s.resolved_at is null
      ) s
      left join public.fleet_checkups c on c.id = s.checkup_id
      left join public.fleet_breakdowns d on d.id = s.breakdown_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_fleet_workshop_sheet(p_bike_id uuid) is 'Die Unterlage fuer die Werkstatt - Rad, Bauart, gesperrt seit, offene Stellen mit Nummer, Bauteil, Einstufung, Notiz und Art und Tag des Ereignisses. Keine Namen, keine Termine, kein Pannenort. Lesen nach app.can_read_fleet().';

alter table public.fleet_spots
  drop constraint fleet_spots_point,
  drop constraint fleet_spots_model_version_check,
  drop column point_x,
  drop column point_y,
  drop column point_z,
  drop column model_version;

drop function app.fleet_model_version(text);

comment on table public.fleet_spots is 'Stelle am Rad aus einem Check-Up oder einer Panne - Bauteil aus der Liste der 27, Einstufung, Notiz (ANN-555). Mit "Freigeben" erledigt, bleibt im Verlauf. Datenklasse radflotte_ereignis, faellt mit Check-Up oder Panne (cascade). Kein Tabellenrecht.';

comment on function app.fleet_zones(p_bike_type text) is 'Die 27 Bauteile des Lastenrads, aus denen eine Stelle waehlt (ANN-555). Gegenstueck BIKE_ZONES in src/features/fleet/zones.ts.';
