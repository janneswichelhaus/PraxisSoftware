-- =============================================================================
-- FLT-007 bis FLT-009 (Auftrag Jannes, 2026-10-16): Werbeflaechen und
-- Seitenfotos im Check-Up, die Meldungen fuer den Arbeitgeber, der
-- Check-Up-Rhythmus
--
-- FLT-007 WERBEFLAECHEN UND SEITENFOTOS (ANN-568): Nach den zwoelf
-- Pruefpunkten wischt die pruefende Person jede Werbeflaeche mit einem
-- Desinfektions- oder Reinigungstuch ab und fotografiert das Rad von allen
-- vier Seiten. Das Abwischen steht an der Zeile des Check-Ups (ad_surfaces);
-- geht es nicht - kein Tuch im Depot -, steht der Grund dabei. Die Fotos
-- tragen ihre Seite (fleet_photos.side), je Seite eines, und zaehlen nicht
-- gegen die vier "weiteren Fotos" eines Check-Ups. Ein Check-Up vor dieser
-- Migration hat keinen Wert (null): nicht erfasst, nicht "nicht abgewischt".
--
-- FLT-008 MELDUNGEN FUER DEN ARBEITGEBER (ANN-569): owner und team_lead
-- lesen alle Check-Ups und Pannen der Flotte in einer Liste - mit
-- Pruefpunkten, Stellen und Fotos -, nicht nur je Rad im Verlauf. Dieselben
-- Angaben, die get_fleet_bike jeder Praxisrolle der Behandlung je Rad
-- zeigt; neu ist nur die Liste ueber alle Raeder. Keine Auswertung je Person
-- (PROJECT_PRINCIPLES.md 20): kein Filter, keine Zahl, keine Sortierung nach
-- Person; wer geprueft oder gemeldet hat, steht am Ereignis wie im Verlauf.
--
-- FLT-009 CHECK-UP-RHYTHMUS (ANN-570): owner legt fest, nach wie vielen
-- Tagen ein Rad wieder einen Check-Up braucht (Voreinstellung 14, "aus"
-- ist null). Gespeichert wird nur der Wert; wann ein Rad faellig ist und
-- welche Luecke im Kalender passt, rechnet die Oberflaeche an einer Stelle
-- (src/features/fleet/rhythmus.ts). Kein fester Termin, kein Eintrag im
-- Kalender - nur ein Hinweis.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer was getan hat, steht an
-- der Zeile; der Rhythmus ist ein Praxiswert wie der Fahrzeitfaktor
-- (20261009100000_ubk_010_travel_time_factor.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Werbeflaechen am Check-Up (FLT-007, ANN-568)
-- -----------------------------------------------------------------------------
alter table public.fleet_checkups
  add column ad_surfaces text check (ad_surfaces in ('wiped', 'not_possible')),
  add column ad_surfaces_note text
    check (ad_surfaces_note is null or length(btrim(ad_surfaces_note)) between 1 and 200),
  add constraint fleet_checkups_ad_surfaces_note check (
    (ad_surfaces is null and ad_surfaces_note is null)
    or (ad_surfaces = 'wiped' and ad_surfaces_note is null)
    or (ad_surfaces = 'not_possible' and ad_surfaces_note is not null)
  );

comment on column public.fleet_checkups.ad_surfaces is
  'FLT-007 (ANN-568): Werbeflaechen mit Desinfektions- oder Reinigungstuch abgewischt (wiped) oder nicht moeglich (not_possible, Grund in ad_surfaces_note). Null: Check-Up vor der Einfuehrung, nicht erfasst.';
comment on column public.fleet_checkups.ad_surfaces_note is
  'FLT-007 (ANN-568): warum die Werbeflaechen nicht abgewischt werden konnten. Keine Angaben zu Patient:innen.';

-- -----------------------------------------------------------------------------
-- 2. Check-Up erfassen - mit den Werbeflaechen (FLT-007)
--
-- Rumpf sonst unveraendert aus 20261119100000_flt_001_radflotte.sql
-- (Abschnitt 19). Die alte Fassung ohne Werbeflaechen faellt weg: Ein
-- Check-Up ohne diese Angabe nimmt der Server nicht mehr an.
-- -----------------------------------------------------------------------------
drop function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean);

create function public.record_fleet_checkup(
  p_bike_id          uuid,
  p_items            jsonb,
  p_note             text,
  p_spots            jsonb,
  p_confirmed        boolean,
  p_ad_surfaces      text,
  p_ad_surfaces_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_bike     public.fleet_bikes%rowtype;
  v_keys     text[];
  v_item     jsonb;
  v_items    jsonb := '[]'::jsonb;
  v_i        integer := 0;
  v_rating   text;
  v_spot     jsonb;
  v_check    text;
  v_need     text;
  v_id       uuid;
  v_spots    jsonb;
  v_ad_note  text;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  if p_confirmed is distinct from true then
    raise exception 'checkup must be confirmed' using errcode = '22023';
  end if;

  select b.* into v_bike
  from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null;
  if v_bike.id is null then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;

  -- ANN-568: abgewischt - oder der Grund, warum nicht.
  if p_ad_surfaces is null or p_ad_surfaces not in ('wiped', 'not_possible') then
    raise exception 'ad surfaces must be wiped or explained' using errcode = '22023';
  end if;
  v_ad_note := app.fleet_text(p_ad_surfaces_note, 200, 'ad surfaces reason');
  if p_ad_surfaces = 'wiped' then
    v_ad_note := null;
  elsif v_ad_note is null then
    raise exception 'ad surfaces reason is required' using errcode = '22023';
  end if;

  v_keys := app.fleet_check_items(v_bike.bike_type);
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) <> cardinality(v_keys) then
    raise exception 'checkup needs every check item' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_items) e
  loop
    v_i := v_i + 1;
    if jsonb_typeof(v_item) <> 'object' or (v_item ->> 'key') is distinct from v_keys[v_i] then
      raise exception 'check items out of order' using errcode = '22023';
    end if;
    v_rating := v_item ->> 'rating';
    if v_rating is null or v_rating not in ('ok', 'beobachten', 'problem') then
      raise exception 'unknown rating' using errcode = '22023';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'key', v_keys[v_i],
      'rating', v_rating,
      'note', app.fleet_text(v_item ->> 'note', 300, 'item note')
    ));
  end loop;

  -- Anheben, nie absenken: Jede Stelle mit Pruefpunkt verlangt mindestens
  -- ihre Einstufung an diesem Pruefpunkt.
  if p_spots is not null and jsonb_typeof(p_spots) = 'array' then
    for v_spot in select e from jsonb_array_elements(p_spots) e
    loop
      v_check := app.fleet_zone_check_item(v_bike.bike_type, v_spot ->> 'zone');
      continue when v_check is null;
      v_need := v_spot ->> 'severity';
      select x ->> 'rating' into v_rating
      from jsonb_array_elements(v_items) x where x ->> 'key' = v_check;
      if (v_need = 'problem' and v_rating <> 'problem')
         or (v_need = 'beobachten' and v_rating = 'ok') then
        raise exception 'a spot raises its check item' using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.fleet_checkups (
    organization_id, bike_id, bike_type, items, note, checked_by, ad_surfaces, ad_surfaces_note
  )
  values (v_org, v_bike.id, v_bike.bike_type, v_items, app.fleet_text(p_note, 1000, 'note'),
          auth.uid(), p_ad_surfaces, v_ad_note)
  returning id into v_id;

  v_spots := app.fleet_insert_spots(v_org, v_bike, v_id, null, coalesce(p_spots, '[]'::jsonb));

  return jsonb_build_object('checkup_id', v_id, 'spot_ids', v_spots);
end;
$$;

revoke all on function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean, text, text)
  from public, anon;
grant execute on function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean, text, text)
  to authenticated;

comment on function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean, text, text) is
  'FLT-001, FLT-007: Check-Up erfassen - alle Pruefpunkte der Bauart in ihrer Reihenfolge, Notiz, Stellen am Rad, Werbeflaechen abgewischt oder der Grund (ANN-568), Bestaetigung der angemeldeten Person (ANN-553). Eine Stelle hebt ihren Pruefpunkt an, nie ab (ANN-555). Sperrt das Rad nicht. Alle Praxisrollen der Behandlung (BEF-066).';

-- -----------------------------------------------------------------------------
-- 3. Seitenfotos (FLT-007, ANN-568)
--
-- Je Check-Up und Seite hoechstens ein Foto. Sie zaehlen nicht gegen die
-- vier weiteren Fotos (app.fleet_photo_limit). Die Seite ist Teil dessen,
-- was ein Foto ist, und aendert sich nicht (app.fleet_photos_guard nimmt
-- jede neue Spalte mit).
-- -----------------------------------------------------------------------------
create function app.fleet_photo_sides()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['left', 'front', 'right', 'back']::text[]
$$;

revoke all on function app.fleet_photo_sides() from public, anon, authenticated;

comment on function app.fleet_photo_sides() is
  'FLT-007 (ANN-568): die vier Seiten des Rads fuer die Fotos im Check-Up. Gegenstueck SEITEN in src/features/fleet/checkupablauf.ts.';

alter table public.fleet_photos
  add column side text check (side = any (app.fleet_photo_sides())),
  add constraint fleet_photos_side_on_checkup check (side is null or checkup_id is not null);

comment on column public.fleet_photos.side is
  'FLT-007 (ANN-568): die Seite des Rads bei einem Seitenfoto im Check-Up (left, right, front, back); null bei einem weiteren Foto oder einem Foto an einer Stelle.';

create unique index fleet_photos_checkup_side_idx on public.fleet_photos (checkup_id, side)
  where side is not null;

-- Rumpf sonst unveraendert aus 20261119110000_flt_002_fotos_am_rad.sql
-- (Abschnitt 5); neu ist p_side.
drop function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text);

create function public.prepare_fleet_photo_upload(
  p_spot_id         uuid,
  p_checkup_id      uuid,
  p_byte_size       bigint,
  p_checksum_sha256 text,
  p_side            text default null
)
returns table (photo_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_bike    uuid;
  v_von     uuid;
  v_am      timestamptz;
  v_offen   boolean := true;
  v_id      uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  if (p_spot_id is null) = (p_checkup_id is null) then
    raise exception 'photo needs exactly one reference' using errcode = '22023';
  end if;
  if p_side is not null and (p_checkup_id is null or not (p_side = any (app.fleet_photo_sides()))) then
    raise exception 'unknown side' using errcode = '22023';
  end if;

  -- Der Bezug ist gesperrt, damit die Zahl auch gleichzeitig stimmt.
  if p_spot_id is not null then
    select s.bike_id, s.created_by, s.created_at, s.resolved_at is null
      into v_bike, v_von, v_am, v_offen
    from public.fleet_spots s
    where s.id = p_spot_id and s.organization_id = v_org
    for update;
  else
    select c.bike_id, c.checked_by, c.checked_at
      into v_bike, v_von, v_am
    from public.fleet_checkups c
    where c.id = p_checkup_id and c.organization_id = v_org
    for update;
  end if;
  -- Fremd, alt, erledigt, an einem ausgemusterten Rad oder nicht vorhanden
  -- sehen gleich aus.
  if v_bike is null or v_von <> auth.uid() or v_am <= now() - interval '24 hours'
     or not v_offen
     or not exists (
       select 1 from public.fleet_bikes b where b.id = v_bike and b.archived_at is null
     ) then
    raise exception 'reference not found' using errcode = 'P0002';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;
  if p_side is not null then
    if exists (
      select 1 from public.fleet_photos f
      where f.checkup_id = p_checkup_id and f.side = p_side
    ) then
      raise exception 'side already has a photo' using errcode = '23505';
    end if;
  elsif (select count(*) from public.fleet_photos f
          where f.spot_id is not distinct from p_spot_id
            and f.checkup_id is not distinct from p_checkup_id
            and f.side is null)
        >= app.fleet_photo_limit() then
    raise exception 'too many photos' using errcode = '23514';
  end if;

  insert into public.fleet_photos (
    organization_id, bike_id, spot_id, checkup_id, side, mime_type, byte_size, checksum_sha256,
    created_by
  )
  values (
    v_org, v_bike, p_spot_id, p_checkup_id, p_side, 'image/jpeg', p_byte_size, p_checksum_sha256,
    auth.uid()
  )
  returning id into v_id;

  return query
    select f.id, app.fleet_photo_bucket(), f.object_key
    from public.fleet_photos f where f.id = v_id;
end;
$$;

revoke all on function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text, text)
  from public, anon;
grant execute on function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text, text)
  to authenticated;

comment on function public.prepare_fleet_photo_upload(uuid, uuid, bigint, text, text) is
  'FLT-002, FLT-007 (ANN-552, ANN-568, ADR-017 Punkt 7a): Phase (a) - Foto zur eigenen Stelle oder zum eigenen Check-Up, binnen 24 Stunden, hoechstens vier weitere je Bezug und je Seite eines (p_side, nur am Check-Up), nur JPEG; liefert den Objektschluessel, bevor Bytes fliessen.';

-- Rumpf sonst unveraendert aus 20261119110000_flt_002_fotos_am_rad.sql
-- (Abschnitt 6); neu ist die Seite.
drop function public.list_fleet_photos(uuid);

create function public.list_fleet_photos(p_bike_id uuid)
returns table (
  id          uuid,
  spot_id     uuid,
  checkup_id  uuid,
  side        text,
  created_at  timestamptz,
  verified    boolean,
  may_delete  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to read the fleet');
  if not exists (
    select 1 from public.fleet_bikes b where b.id = p_bike_id and b.organization_id = v_org
  ) then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  return query
    select f.id, f.spot_id, f.checkup_id, f.side, f.created_at, f.verified_at is not null,
           app.can_delete_fleet_photo(f)
    from public.fleet_photos f
    where f.bike_id = p_bike_id and f.organization_id = v_org and f.status = 'ready'
    order by f.created_at, f.id;
end;
$$;

revoke all on function public.list_fleet_photos(uuid) from public, anon;
grant execute on function public.list_fleet_photos(uuid) to authenticated;

comment on function public.list_fleet_photos(uuid) is
  'FLT-002, FLT-007: die fertigen Fotos eines Rads mit Bezug (Stelle oder Check-Up), Seite, Zeitpunkt, Pruefstand und ob die anfragende Person loeschen darf. Kein Objektschluessel, kein Verweis. Lesen nach app.can_read_fleet().';

-- -----------------------------------------------------------------------------
-- 4. Check-Up-Rhythmus (FLT-009, ANN-570)
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column fleet_checkup_interval_days smallint default 14
    check (fleet_checkup_interval_days between 1 and 90);

comment on column public.organizations.fleet_checkup_interval_days is
  'FLT-009 (ANN-570): nach wie vielen Tagen ein Rad wieder einen Check-Up braucht (1 bis 90, Voreinstellung 14); null heisst keine Hinweise. Nur ein Praxiswert - wann ein Rad faellig ist, rechnet die Oberflaeche (src/features/fleet/rhythmus.ts).';

create function public.set_fleet_checkup_interval(p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_manage_fleet(), 'not allowed to change the checkup interval');
  if p_days is not null and (p_days < 1 or p_days > 90) then
    raise exception 'checkup interval must be between 1 and 90 days' using errcode = '22023';
  end if;
  update public.organizations o
     set fleet_checkup_interval_days = p_days
   where o.id = v_org;
end;
$$;

revoke all on function public.set_fleet_checkup_interval(integer) from public, anon;
grant execute on function public.set_fleet_checkup_interval(integer) to authenticated;

comment on function public.set_fleet_checkup_interval(integer) is
  'FLT-009 (ANN-570): setzt den Check-Up-Rhythmus der Praxis in Tagen (1 bis 90, null = aus). Nur owner (app.can_manage_fleet). Ohne Auditeintrag (ADR-010 Fassung 3).';

-- list_fleet liefert den Rhythmus mit. Rumpf sonst unveraendert aus
-- 20261119100000_flt_001_radflotte.sql (Abschnitt 11).
create or replace function public.list_fleet(p_week_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to read the fleet');

  return jsonb_build_object(
    'can_manage', app.can_manage_fleet(),
    'can_release', app.can_release_fleet_bike(),
    'can_read_reports', app.can_read_fleet_reports(),
    'my_staff_member_id', app.fleet_current_staff_member(v_org),
    'checkup_interval_days', (
      select o.fleet_checkup_interval_days from public.organizations o where o.id = v_org
    ),
    'depots', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', d.id, 'name', d.name, 'note', d.note)
        order by lower(d.name), d.id
      )
      from public.fleet_depots d
      where d.organization_id = v_org
    ), '[]'::jsonb),
    'bikes', coalesce((
      select jsonb_agg(app.fleet_bike_json(b) order by lower(b.name), b.id)
      from public.fleet_bikes b
      where b.organization_id = v_org and b.archived_at is null
    ), '[]'::jsonb),
    -- Aktive Mitarbeitende fuer die Auswahl von Stammnutzer:in und
    -- Schluessel: Name und Kennung, sonst nichts.
    'staff', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', sm.id, 'name', pe.given_name || ' ' || pe.family_name)
        order by lower(pe.family_name), lower(pe.given_name), sm.id
      )
      from public.staff_members sm
      join public.persons pe on pe.id = sm.person_id
      where sm.organization_id = v_org and sm.employment_status = 'active'
    ), '[]'::jsonb),
    'unavailable', case when p_week_start is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object('staff_member_id', e.staff_member_id, 'on_date', e.on_date)
        order by e.on_date, e.staff_member_id
      )
      from public.staff_working_hour_exceptions e
      where e.organization_id = v_org
        and e.kind = 'unavailable'
        and e.on_date between p_week_start and p_week_start + 6
        and exists (
          select 1 from public.fleet_bikes b
          where b.organization_id = v_org and b.archived_at is null
            and b.regular_rider_id = e.staff_member_id
        )
    ), '[]'::jsonb) end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Meldungen fuer den Arbeitgeber (FLT-008, ANN-569)
-- -----------------------------------------------------------------------------
create function app.can_read_fleet_reports()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead')
$$;

grant execute on function app.can_read_fleet_reports() to authenticated;

comment on function app.can_read_fleet_reports() is
  'FLT-008 (ANN-569): wer die Check-Ups und Pannen aller Raeder in einer Liste liest - owner und team_lead. Die eine Stelle fuer die Regel.';

-- Die fertigen Fotos einer Meldung: am Check-Up (mit Seite) und an seinen
-- oder ihren Stellen. Kennung und Bezug, nie der Objektschluessel.
create function app.fleet_report_photos(p_checkup_id uuid, p_breakdown_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', f.id, 'spot_id', f.spot_id, 'side', f.side)
    order by f.created_at, f.id
  ), '[]'::jsonb)
  from public.fleet_photos f
  where f.status = 'ready'
    and (
      (p_checkup_id is not null and f.checkup_id = p_checkup_id)
      or f.spot_id in (
        select s.id from public.fleet_spots s
        where (p_checkup_id is not null and s.checkup_id = p_checkup_id)
           or (p_breakdown_id is not null and s.breakdown_id = p_breakdown_id)
      )
    )
$$;

revoke all on function app.fleet_report_photos(uuid, uuid) from public, anon, authenticated;

-- Die Stellen einer Meldung, ohne Nummer (die Nummer gilt nur fuer die
-- offenen Stellen eines Rads, get_fleet_bike).
create function app.fleet_report_spots(p_checkup_id uuid, p_breakdown_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.fleet_spot_json(s, null) order by s.created_at, s.seq), '[]'::jsonb)
  from public.fleet_spots s
  where (p_checkup_id is not null and s.checkup_id = p_checkup_id)
     or (p_breakdown_id is not null and s.breakdown_id = p_breakdown_id)
$$;

revoke all on function app.fleet_report_spots(uuid, uuid) from public, anon, authenticated;

-- p_since: der erste Tag (in der Zeitzone der Praxis); ohne Angabe die
-- letzten 90 Tage. Hoechstens ein Jahr zurueck und hoechstens 500
-- Meldungen, neueste zuerst. Nur Raeder, die noch nicht ausgemustert sind -
-- wie get_fleet_bike.
create function public.list_fleet_reports(p_since date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_zone  text;
  v_heute date;
  v_ab    date;
begin
  v_org := app.fleet_org(app.can_read_fleet_reports(), 'not allowed to read the fleet reports');

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zone)::date;
  v_ab := coalesce(p_since, v_heute - 90);
  if v_ab < v_heute - 366 or v_ab > v_heute then
    raise exception 'since must lie within the last year' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(m.eintrag order by m.zeit desc, m.id)
    from (
      select x.eintrag, x.zeit, x.id
      from (
        select c.checked_at as zeit, c.id,
          jsonb_build_object(
            'kind', 'checkup',
            'id', c.id,
            'bike_id', b.id,
            'bike_name', b.name,
            'bike_type', c.bike_type,
            'at', c.checked_at,
            'by_name', app.fleet_account_name(c.checked_by),
            'items', c.items,
            'note', c.note,
            'ad_surfaces', c.ad_surfaces,
            'ad_surfaces_note', c.ad_surfaces_note,
            'spots', app.fleet_report_spots(c.id, null),
            'photos', app.fleet_report_photos(c.id, null)
          ) as eintrag
        from public.fleet_checkups c
        join public.fleet_bikes b on b.id = c.bike_id and b.organization_id = c.organization_id
        where c.organization_id = v_org and b.archived_at is null
          and c.checked_at >= (v_ab::timestamp at time zone v_zone)
        union all
        select d.reported_at as zeit, d.id,
          jsonb_build_object(
            'kind', 'breakdown',
            'id', d.id,
            'bike_id', b.id,
            'bike_name', b.name,
            'bike_type', b.bike_type,
            'at', d.reported_at,
            'by_name', app.fleet_account_name(d.reported_by),
            'outcome', d.outcome,
            'blocks', app.fleet_outcome_blocks(d.outcome),
            'summary', d.summary,
            'remark', d.remark,
            'location_note', d.location_note,
            'transport', d.transport,
            'spots', app.fleet_report_spots(null, d.id),
            'photos', app.fleet_report_photos(null, d.id)
          ) as eintrag
        from public.fleet_breakdowns d
        join public.fleet_bikes b on b.id = d.bike_id and b.organization_id = d.organization_id
        where d.organization_id = v_org and b.archived_at is null
          and d.reported_at >= (v_ab::timestamp at time zone v_zone)
      ) x
      order by x.zeit desc, x.id
      limit 500
    ) m
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_fleet_reports(date) from public, anon;
grant execute on function public.list_fleet_reports(date) to authenticated;

comment on function public.list_fleet_reports(date) is
  'FLT-008 (ANN-569): alle Check-Ups und Pannen der Flotte ab p_since (ohne Angabe 90 Tage, hoechstens ein Jahr, hoechstens 500), neueste zuerst, mit Pruefpunkten, Werbeflaechen, Stellen und Kennungen der Fotos. Lesen nach app.can_read_fleet_reports() (owner, team_lead). Keine Auswertung je Person (PROJECT_PRINCIPLES.md 20).';
