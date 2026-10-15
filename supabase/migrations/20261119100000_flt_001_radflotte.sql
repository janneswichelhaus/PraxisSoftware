-- =============================================================================
-- FLT-001 (FLT-EPIC-001): Radflotte - Depots, Raeder, Schluessel, Check-Up,
-- Panne, Sperre und Stellen am 3D-Rad
--
-- Ersetzt die Vorschau der Radflotte (docs/development/ARBEITSBEREICHE.md,
-- Regel 3): Was dort nur im Arbeitsspeicher lag, steht ab hier in der
-- Datenbank. Entwurf, Entscheidungen und Akzeptanzkriterien aus dem Handoff
-- Lastenrad 3D (docs/design/handoff-2026-10-08-lastenrad-3d.md, Abschnitte 0
-- und 8), Rollen aus BEF-066 (Jannes, 2026-10-09).
--
--   public.fleet_depots          Abstellorte der Raeder (Betriebsdaten)
--   public.fleet_bikes           die Raeder mit Bauart, Depot, Stammnutzer:in
--                                und Wochenplan
--   public.fleet_key_handovers   wer den Schluessel eines Rads hat (ANN-551)
--   public.fleet_checkups        Fahrrad-Check-Up mit zwoelf Pruefpunkten
--   public.fleet_breakdowns      Pannenmeldung mit dem Abschluss des Assistenten
--   public.fleet_blocks          Sperre eines Rads bis zur Freigabe
--   public.fleet_spots           Stellen am 3D-Rad aus Check-Up und Panne
--
-- ROLLEN (BEF-066, ANN-550): Lesen und Schluessel, Panne, Check-Up alle
-- Praxisrollen der Behandlung (owner, therapist, team_lead, office) -
-- dieselben, die heute die Route sehen. Raeder und Depots anlegen, aendern,
-- entfernen nur owner. Freigeben und von Hand sperren owner und team_lead
-- (PROJECT_PRINCIPLES.md 4.5 "Rad-/Ressourcenzuteilung"; die Standortvorlage
-- sagt "bis die Teamleitung das Rad wieder freigibt"). Trainingsbetreuung und
-- Plattformkonten sehen nichts.
--
-- STATUS OHNE ZWEITE WAHRHEIT (ANN-557): "In Reparatur" ist eine offene
-- Sperre, "im Einsatz" ein entnommener Schluessel, sonst "verfuegbar". Kein
-- Statusfeld am Rad, das neben Sperre und Schluessel etwas anderes sagen
-- koennte.
--
-- BESCHAEFTIGTENDATEN (PROJECT_PRINCIPLES.md 20): Wer prueft, meldet,
-- sperrt, freigibt oder einen Schluessel nimmt, steht am Ereignis - als Konto
-- (*_by) beziehungsweise als Mitarbeiter:in beim Schluessel. Keine Funktion
-- wertet das je Person aus, und die Unterlage fuer die Werkstatt nennt keine
-- Namen (get_fleet_workshop_sheet).
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Wer was wann getan hat, steht
-- an der Zeile. Abgewiesene Zugriffe enden mit 42501 ohne Eintrag - wie bei
-- Bibliothek, Gebieten und Garage, die ebenfalls Betriebsdaten tragen.
--
-- KEIN ORT AN EINEN DIENST (ADR-019): Der Standort eines zurueckgelassenen
-- Rads ist Freitext fuer das Team, geht an keinen Kartendienst und nicht in
-- die Unterlage fuer die Werkstatt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bauart, Pruefpunkte, Bauteile, Abschluesse - je eine Stelle
--
-- Gegenstueck in src/features/fleet/bike3d/zones.ts und
-- src/features/fleet/pannenablauf.ts; supabase/tests/fleet.test.ts haelt
-- beide Seiten gleich.
-- -----------------------------------------------------------------------------
create function app.fleet_bike_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['load60_riemen']::text[]
$$;

create function app.fleet_check_items(p_bike_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_bike_type
    when 'load60_riemen' then array[
      'reifen', 'speichen', 'bremsen', 'antrieb', 'licht_vorne', 'licht_hinten',
      'akku', 'schrauben_sattel', 'klingel', 'schutzbleche', 'staender', 'transportbox'
    ]::text[]
  end
$$;

-- Bauteil -> Pruefpunkt (oder null: eine Stelle ohne eigenen Pruefpunkt).
create function app.fleet_zone_check_item(p_bike_type text, p_zone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_bike_type = 'load60_riemen' then
    case p_zone
      when 'reifen-vorne' then 'reifen'
      when 'reifen-hinten' then 'reifen'
      when 'laufrad-vorne' then 'speichen'
      when 'laufrad-hinten' then 'speichen'
      when 'bremse-vorne' then 'bremsen'
      when 'bremse-hinten' then 'bremsen'
      when 'bremsgriffe' then 'bremsen'
      when 'riemen' then 'antrieb'
      when 'nabenschaltung' then 'antrieb'
      when 'kurbeln' then 'antrieb'
      when 'motor' then 'antrieb'
      when 'akku' then 'akku'
      when 'licht-vorne' then 'licht_vorne'
      when 'licht-hinten' then 'licht_hinten'
      when 'sattel' then 'schrauben_sattel'
      when 'klingel' then 'klingel'
      when 'schutzblech-vorne' then 'schutzbleche'
      when 'schutzblech-hinten' then 'schutzbleche'
      when 'staender' then 'staender'
      when 'transportbox' then 'transportbox'
    end
  end
$$;

create function app.fleet_zones(p_bike_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_bike_type
    when 'load60_riemen' then array[
      'reifen-vorne', 'reifen-hinten', 'laufrad-vorne', 'laufrad-hinten',
      'bremse-vorne', 'bremse-hinten', 'bremsgriffe', 'riemen', 'nabenschaltung',
      'kurbeln', 'motor', 'akku', 'licht-vorne', 'licht-hinten', 'sattel', 'klingel',
      'schutzblech-vorne', 'schutzblech-hinten', 'staender', 'transportbox',
      'rahmen', 'lenker', 'display', 'lenkung', 'gabel', 'daempfer', 'gepaecktraeger'
    ]::text[]
  end
$$;

-- ANN-555: die Fassung der Geometrie, an der eine Stelle gesetzt wurde.
create function app.fleet_model_version(p_bike_type text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_bike_type when 'load60_riemen' then 1::smallint end
$$;

-- Die Abschluesse des Pannenassistenten (pannenablauf.ts, Abschlussart).
-- Nur "Weiterfahrt moeglich" sperrt das Rad nicht.
create function app.fleet_breakdown_outcomes()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'meldungOhneSperre', 'lokalNichtMoeglich', 'lokalRepariert', 'depotAbgestellt',
    'vertragswerkstattRepariert', 'transportFortsetzung'
  ]::text[]
$$;

create function app.fleet_outcome_blocks(p_outcome text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_outcome <> 'meldungOhneSperre'
$$;

revoke all on function app.fleet_bike_types() from public, anon, authenticated;
revoke all on function app.fleet_check_items(text) from public, anon, authenticated;
revoke all on function app.fleet_zone_check_item(text, text) from public, anon, authenticated;
revoke all on function app.fleet_zones(text) from public, anon, authenticated;
revoke all on function app.fleet_model_version(text) from public, anon, authenticated;
revoke all on function app.fleet_breakdown_outcomes() from public, anon, authenticated;
revoke all on function app.fleet_outcome_blocks(text) from public, anon, authenticated;

comment on function app.fleet_check_items(text) is
  'FLT-001: die zwoelf Pruefpunkte der Bauart Load 60 mit Riemen (Handoff Lastenrad 3D, AC 3). Gegenstueck CHECK_ITEMS in src/features/fleet/bike3d/zones.ts.';
comment on function app.fleet_zones(text) is
  'FLT-001: die 27 Bauteile des 3D-Rads (Handoff Lastenrad 3D, Abschnitt 5). Gegenstueck BIKE_ZONES in src/features/fleet/bike3d/zones.ts.';
comment on function app.fleet_outcome_blocks(text) is
  'FLT-001: ob ein Abschluss des Pannenassistenten das Rad sperrt - alle ausser "Weiterfahrt moeglich" (pannenablauf.ts, abschluss().sperrt).';

-- -----------------------------------------------------------------------------
-- 2. Wer liest, wer pflegt, wer gibt frei (BEF-066, ANN-550)
-- -----------------------------------------------------------------------------
create function app.can_read_fleet()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

create function app.can_manage_fleet()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

-- ANN-550: freigeben und von Hand sperren - owner und team_lead.
create function app.can_release_fleet_bike()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead')
$$;

revoke all on function app.can_read_fleet() from public, anon;
revoke all on function app.can_manage_fleet() from public, anon;
revoke all on function app.can_release_fleet_bike() from public, anon;
grant execute on function app.can_read_fleet() to authenticated;
grant execute on function app.can_manage_fleet() to authenticated;
grant execute on function app.can_release_fleet_bike() to authenticated;

comment on function app.can_read_fleet() is
  'FLT-001 (BEF-066): wer die Radflotte liest und Schluessel, Panne und Check-Up erfasst - owner, therapist, team_lead, office. Die eine Stelle fuer die Regel.';
comment on function app.can_manage_fleet() is
  'FLT-001 (BEF-066): wer Raeder und Depots anlegt, aendert und entfernt - owner. Die eine Stelle fuer die Regel.';
comment on function app.can_release_fleet_bike() is
  'FLT-001 (ANN-550): wer ein Rad freigibt oder von Hand sperrt - owner und team_lead. Die eine Stelle fuer die Regel.';

-- Gemeinsamer Einstieg: angemeldet, darf, hat eine Organisation. Liefert die
-- Organisation. Erst Konto und Recht, dann die Eingaben - ein Plattformkonto
-- bekommt immer 42501 (plattform-abschottung.test.ts).
create function app.fleet_org(p_allowed boolean, p_message text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not coalesce(p_allowed, false) then
    raise exception '%', p_message using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception '%', p_message using errcode = '42501';
  end if;
  return v_org;
end;
$$;

revoke all on function app.fleet_org(boolean, text) from public, anon, authenticated;

-- Die Mitarbeiterzeile des angemeldeten Kontos in der Organisation, oder null.
create function app.fleet_current_staff_member(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.id
  from public.user_profiles up
  join public.staff_members sm
    on sm.person_id = up.person_id and sm.organization_id = up.organization_id
  where up.id = auth.uid() and up.organization_id = p_org
  limit 1
$$;

revoke all on function app.fleet_current_staff_member(uuid) from public, anon, authenticated;

-- Anzeigename eines Kontos: Vor- und Nachname der Person dahinter. Null, wenn
-- das Konto nicht mehr besteht.
create function app.fleet_account_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pe.given_name || ' ' || pe.family_name
  from public.user_profiles up
  join public.persons pe on pe.id = up.person_id
  where up.id = p_user_id
$$;

revoke all on function app.fleet_account_name(uuid) from public, anon, authenticated;

create function app.fleet_staff_name(p_staff_member_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pe.given_name || ' ' || pe.family_name
  from public.staff_members sm
  join public.persons pe on pe.id = sm.person_id
  where sm.id = p_staff_member_id
$$;

revoke all on function app.fleet_staff_name(uuid) from public, anon, authenticated;

-- Freitext: getrimmt, leer wird null, zu lang ist ein Eingabefehler.
create function app.fleet_text(p_text text, p_max integer, p_field text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := nullif(btrim(coalesce(p_text, ''), E' \t\r\n'), '');
begin
  if v_text is not null and length(v_text) > p_max then
    raise exception '% is too long', p_field using errcode = '22023';
  end if;
  return v_text;
end;
$$;

revoke all on function app.fleet_text(text, integer, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Depots
-- -----------------------------------------------------------------------------
create table public.fleet_depots (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (length(btrim(name)) between 1 and 80),
  -- "Betrieblicher Abstellort, Keller" - nie ein Zugangscode (ANN-554).
  note            text check (note is null or length(btrim(note)) between 1 and 200),
  created_at      timestamptz not null default now(),
  created_by      uuid not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid not null,
  constraint fleet_depots_id_organization unique (id, organization_id)
);

comment on table public.fleet_depots is
  'FLT-001: Abstellort der Raeder (Raddepot). Ein betrieblicher Ort, kein Behandlungsraum; keine Zugangscodes (ANN-554). Datenklasse: Betriebsdaten der Praxis OHNE Personenbezug. Frist: bis zur Loeschung durch die Praxis. Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';

create unique index fleet_depots_name_unique
  on public.fleet_depots (organization_id, lower(btrim(name)));

revoke all on public.fleet_depots from anon, authenticated;
alter table public.fleet_depots enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Raeder
-- -----------------------------------------------------------------------------
create table public.fleet_bikes (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  name              text not null check (length(btrim(name)) between 1 and 60),
  bike_type         text not null default 'load60_riemen'
                      check (bike_type = any (app.fleet_bike_types())),
  home_depot_id     uuid not null,
  -- Wo das Rad gerade steht: ein Depot oder ein benannter anderer Ort.
  current_depot_id  uuid,
  special_location  text check (special_location is null
                                or length(btrim(special_location)) between 1 and 120),
  is_spare          boolean not null default false,
  regular_rider_id  uuid references public.staff_members (id) on delete set null,
  -- Wochentage der Stammnutzer:in, 1 = Montag bis 7 = Sonntag. An den
  -- uebrigen Tagen ist das Rad fuer andere planbar.
  planned_weekdays  smallint[] not null default '{}'::smallint[]
                      check (planned_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  battery           text check (battery is null or length(btrim(battery)) between 1 and 80),
  note              text check (note is null or length(btrim(note)) between 1 and 500),
  -- Ausgemustert (ANN-557): nicht mehr in der Flotte, der Verlauf bleibt bis
  -- zum Ende seiner Frist.
  archived_at       timestamptz,
  archived_by       uuid,
  created_at        timestamptz not null default now(),
  created_by        uuid not null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid not null,
  constraint fleet_bikes_id_organization unique (id, organization_id),
  constraint fleet_bikes_home_depot_fk
    foreign key (home_depot_id, organization_id)
    references public.fleet_depots (id, organization_id) on delete restrict,
  constraint fleet_bikes_current_depot_fk
    foreign key (current_depot_id, organization_id)
    references public.fleet_depots (id, organization_id) on delete restrict,
  constraint fleet_bikes_location check (
    (current_depot_id is null) <> (special_location is null)
  ),
  constraint fleet_bikes_spare_without_rider check (
    not is_spare or (regular_rider_id is null and cardinality(planned_weekdays) = 0)
  ),
  constraint fleet_bikes_archived_stamp check ((archived_at is null) = (archived_by is null))
);

comment on table public.fleet_bikes is
  'FLT-001: ein Rad der Flotte mit Bauart, Stammdepot, Standort, Stammnutzer:in und Wochenplan. Kein Statusfeld: "In Reparatur" ist eine offene Sperre, "im Einsatz" ein entnommener Schluessel (ANN-557). Kein Schluesselcode (ANN-554). Datenklasse: Betriebsdaten der Praxis; Personenbezug nur ueber die Stammnutzer:in, die beim Ausmustern faellt. Frist: bis zur Loeschung durch die Praxis. Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.fleet_bikes.planned_weekdays is
  'Wochenplan der Stammnutzer:in: 1 = Montag bis 7 = Sonntag. An den uebrigen Tagen fuer andere planbar.';

create unique index fleet_bikes_name_unique
  on public.fleet_bikes (organization_id, lower(btrim(name))) where archived_at is null;
create index fleet_bikes_org_idx on public.fleet_bikes (organization_id);
create index fleet_bikes_rider_idx on public.fleet_bikes (regular_rider_id)
  where regular_rider_id is not null;

revoke all on public.fleet_bikes from anon, authenticated;
alter table public.fleet_bikes enable row level security;

-- -----------------------------------------------------------------------------
-- 5. Schluessel (ANN-551: Verlauf 30 Tage nach der Rueckgabe)
-- -----------------------------------------------------------------------------
create table public.fleet_key_handovers (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bike_id         uuid not null,
  -- Wer den Schluessel hat. Aus dem Mitarbeiterstamm, nie Freitext - keine
  -- zweite Personenverwaltung (ARBEITSBEREICHE, Archiv Abschnitt 4).
  holder_staff_id uuid not null references public.staff_members (id) on delete restrict,
  taken_at        timestamptz not null default now(),
  taken_by        uuid not null,
  returned_at     timestamptz,
  returned_by     uuid,
  constraint fleet_key_handovers_bike_fk
    foreign key (bike_id, organization_id)
    references public.fleet_bikes (id, organization_id) on delete cascade,
  constraint fleet_key_handovers_returned_stamp check (
    (returned_at is null) = (returned_by is null)
  ),
  constraint fleet_key_handovers_order check (returned_at is null or returned_at >= taken_at)
);

comment on table public.fleet_key_handovers is
  'FLT-001: Schluesselstand eines Rads - wer ihn wann genommen und zurueckgelegt hat. Hoechstens ein offener Vorgang je Rad. Beschaeftigtendaten ohne Auswertung je Person (PROJECT_PRINCIPLES.md 20). Datenklasse schluesselverlauf: 30 Tage nach der Rueckgabe (ANN-551); offene nie. Kein Tabellenrecht.';

create unique index fleet_key_handovers_one_open
  on public.fleet_key_handovers (bike_id) where returned_at is null;
create index fleet_key_handovers_returned_idx
  on public.fleet_key_handovers (organization_id, returned_at) where returned_at is not null;
create index fleet_key_handovers_holder_idx on public.fleet_key_handovers (holder_staff_id);

revoke all on public.fleet_key_handovers from anon, authenticated;
alter table public.fleet_key_handovers enable row level security;

-- -----------------------------------------------------------------------------
-- 6. Check-Up
--
-- Die Pruefpunkte stehen als jsonb an der Zeile: eine Liste in fester
-- Reihenfolge, die die Funktion gegen app.fleet_check_items prueft. Die
-- Bauart steht dabei, damit ein alter Check-Up lesbar bleibt, wenn eine
-- Bauart ihre Liste aendert.
-- -----------------------------------------------------------------------------
create table public.fleet_checkups (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bike_id         uuid not null,
  bike_type       text not null check (bike_type = any (app.fleet_bike_types())),
  -- [{key, rating, note}] in der Reihenfolge von app.fleet_check_items.
  items           jsonb not null check (jsonb_typeof(items) = 'array'),
  note            text check (note is null or length(btrim(note)) between 1 and 1000),
  -- ANN-553: Die angemeldete Person bestaetigt die Pruefung; die Zeile
  -- entsteht nur mit dieser Bestaetigung. Keine gezeichnete Unterschrift.
  checked_at      timestamptz not null default now(),
  checked_by      uuid not null,
  constraint fleet_checkups_id_organization unique (id, organization_id),
  constraint fleet_checkups_bike_fk
    foreign key (bike_id, organization_id)
    references public.fleet_bikes (id, organization_id) on delete cascade
);

comment on table public.fleet_checkups is
  'FLT-001: Fahrrad-Check-Up - zwoelf Pruefpunkte mit In Ordnung, Beobachten oder Problem, Notiz, Stellen am Rad (fleet_spots) und Fotos. Bestaetigt durch die angemeldete Person (ANN-553). Datenklasse radflotte_ereignis: drei Jahre ab Ende des Kalenderjahres, nie solange eine Stelle offen ist (ANN-551). Kein Tabellenrecht.';

create index fleet_checkups_bike_idx on public.fleet_checkups (bike_id, checked_at desc);

revoke all on public.fleet_checkups from anon, authenticated;
alter table public.fleet_checkups enable row level security;

-- -----------------------------------------------------------------------------
-- 7. Pannenmeldung
-- -----------------------------------------------------------------------------
create table public.fleet_breakdowns (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bike_id         uuid not null,
  outcome         text not null check (outcome = any (app.fleet_breakdown_outcomes())),
  -- Der Abschluss des Assistenten, wie er angezeigt wurde.
  summary         text not null check (length(btrim(summary)) between 1 and 1000),
  -- "Was ist auffaellig?" im Zweig "Weiterfahrt moeglich".
  remark          text check (remark is null or length(btrim(remark)) between 1 and 1000),
  -- Wo das zurueckgelassene Rad steht (ANN-558): Freitext fuer das Team,
  -- ohne Kartendienst, nie in der Unterlage fuer die Werkstatt.
  location_note   text check (location_note is null or length(btrim(location_note)) between 1 and 200),
  transport       text check (transport is null or transport in ('carsharing', 'fahrdienst')),
  reported_at     timestamptz not null default now(),
  reported_by     uuid not null,
  constraint fleet_breakdowns_id_organization unique (id, organization_id),
  constraint fleet_breakdowns_bike_fk
    foreign key (bike_id, organization_id)
    references public.fleet_bikes (id, organization_id) on delete cascade
);

comment on table public.fleet_breakdowns is
  'FLT-001: Pannenmeldung aus dem Pannenassistenten mit Abschluss, auffaelliger Stelle, Standort des zurueckgelassenen Rads (ANN-558) und Stellen am Rad. Ein sperrender Abschluss legt eine Sperre an (fleet_blocks). Datenklasse radflotte_ereignis: drei Jahre ab Ende des Kalenderjahres, nie solange eine Stelle oder ihre Sperre offen ist (ANN-551). Kein Tabellenrecht.';
comment on column public.fleet_breakdowns.location_note is
  'Standort des zurueckgelassenen Rads als Freitext (ANN-558). Kann nebenbei einen Patientenbezug tragen; geht deshalb an keinen Dienst und nicht in die Unterlage fuer die Werkstatt und wird mit der Freigabe oder dem Ausmustern des Rads geleert.';

create index fleet_breakdowns_bike_idx on public.fleet_breakdowns (bike_id, reported_at desc);

revoke all on public.fleet_breakdowns from anon, authenticated;
alter table public.fleet_breakdowns enable row level security;

-- -----------------------------------------------------------------------------
-- 8. Sperre
--
-- Hoechstens eine offene Sperre je Rad. Eine sperrende Panne legt sie an; ist
-- das Rad schon gesperrt, bleibt es bei der einen Sperre. "Freigeben" schliesst
-- sie und erledigt die offenen Stellen (release_fleet_bike).
-- -----------------------------------------------------------------------------
create table public.fleet_blocks (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bike_id         uuid not null,
  breakdown_id    uuid references public.fleet_breakdowns (id) on delete set null,
  -- Grund einer Sperre von Hand ("Inspektion in der Werkstatt").
  reason          text check (reason is null or length(btrim(reason)) between 1 and 200),
  blocked_at      timestamptz not null default now(),
  blocked_by      uuid not null,
  released_at     timestamptz,
  released_by     uuid,
  constraint fleet_blocks_bike_fk
    foreign key (bike_id, organization_id)
    references public.fleet_bikes (id, organization_id) on delete cascade,
  constraint fleet_blocks_released_stamp check ((released_at is null) = (released_by is null)),
  constraint fleet_blocks_order check (released_at is null or released_at >= blocked_at)
);

comment on table public.fleet_blocks is
  'FLT-001: Sperre eines Rads ("In Reparatur") aus einer Panne oder von Hand, bis zur Freigabe (owner, team_lead; ANN-550). Datenklasse radflotte_ereignis: drei Jahre ab Ende des Kalenderjahres der Freigabe; offene nie (ANN-551). Kein Tabellenrecht.';

create unique index fleet_blocks_one_open on public.fleet_blocks (bike_id) where released_at is null;
create index fleet_blocks_breakdown_idx on public.fleet_blocks (breakdown_id)
  where breakdown_id is not null;

revoke all on public.fleet_blocks from anon, authenticated;
alter table public.fleet_blocks enable row level security;

-- -----------------------------------------------------------------------------
-- 9. Stellen am Rad (ANN-555)
--
-- Der Punkt steht in Modellkoordinaten, nicht als Bildschirmposition: So
-- zeigen jede Ansicht, "Am Rad zeigen" und die Unterlage fuer die Werkstatt
-- dieselbe Stelle (Handoff, Abschnitt 5). Ohne Punkt (Weg ueber die Liste)
-- sitzt die Nadel in der Mitte des Bauteils. Die Nummer ergibt sich beim
-- Lesen aus der Reihenfolge der offenen Stellen und wird nicht gespeichert.
-- -----------------------------------------------------------------------------
create table public.fleet_spots (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bike_id         uuid not null,
  checkup_id      uuid,
  breakdown_id    uuid,
  bike_type       text not null check (bike_type = any (app.fleet_bike_types())),
  model_version   smallint not null check (model_version >= 1),
  zone            text not null,
  point_x         numeric(5, 3),
  point_y         numeric(5, 3),
  point_z         numeric(5, 3),
  severity        text not null check (severity in ('problem', 'beobachten')),
  note            text check (note is null or length(btrim(note)) between 1 and 500),
  created_at      timestamptz not null default now(),
  -- Reihenfolge des Anlegens: Die Stellen einer Meldung tragen denselben
  -- Zeitpunkt (eine Transaktion); ihre Nummern folgen der Reihenfolge, in der
  -- sie gesetzt wurden, nicht dem Zufall der Kennung (ANN-555).
  seq             bigint generated always as identity,
  created_by      uuid not null,
  -- Mit "Freigeben" erledigt (ANN-555); bleibt im Verlauf.
  resolved_at     timestamptz,
  resolved_by     uuid,
  constraint fleet_spots_id_organization unique (id, organization_id),
  constraint fleet_spots_bike_fk
    foreign key (bike_id, organization_id)
    references public.fleet_bikes (id, organization_id) on delete cascade,
  constraint fleet_spots_checkup_fk
    foreign key (checkup_id, organization_id)
    references public.fleet_checkups (id, organization_id) on delete cascade,
  constraint fleet_spots_breakdown_fk
    foreign key (breakdown_id, organization_id)
    references public.fleet_breakdowns (id, organization_id) on delete cascade,
  constraint fleet_spots_one_source check ((checkup_id is null) <> (breakdown_id is null)),
  constraint fleet_spots_zone check (zone = any (app.fleet_zones(bike_type))),
  constraint fleet_spots_point check (
    (point_x is null and point_y is null and point_z is null)
    or (point_x is not null and point_y is not null and point_z is not null
        and point_x between -2 and 2 and point_y between -1 and 2 and point_z between -1 and 1)
  ),
  -- In der Pannenmeldung ist jede Stelle ein Schaden (Handoff, Vorschlag 4).
  constraint fleet_spots_breakdown_problem check (breakdown_id is null or severity = 'problem'),
  constraint fleet_spots_resolved_stamp check ((resolved_at is null) = (resolved_by is null))
);

comment on table public.fleet_spots is
  'FLT-001: Stelle am 3D-Rad aus einem Check-Up oder einer Panne - Bauteil, Punkt in Modellkoordinaten mit Fassung des Modells, Einstufung, Notiz (ANN-555). Mit "Freigeben" erledigt, bleibt im Verlauf. Datenklasse radflotte_ereignis, faellt mit Check-Up oder Panne (cascade). Kein Tabellenrecht.';
comment on column public.fleet_spots.note is
  'Notiz zur Stelle. Kann nebenbei einen Patientenbezug tragen (Handoff Abschnitt 6); der Hinweis steht am Feld, und die Unterlage fuer die Werkstatt bittet um Pruefung vor dem Weitergeben.';

create index fleet_spots_bike_idx on public.fleet_spots (bike_id, created_at);
create index fleet_spots_checkup_idx on public.fleet_spots (checkup_id) where checkup_id is not null;
create index fleet_spots_breakdown_idx on public.fleet_spots (breakdown_id)
  where breakdown_id is not null;
create index fleet_spots_open_idx on public.fleet_spots (bike_id) where resolved_at is null;

revoke all on public.fleet_spots from anon, authenticated;
alter table public.fleet_spots enable row level security;

-- -----------------------------------------------------------------------------
-- 10. Datenklassen und Fristen (ADR-008, ANN-551)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('radflotte_ereignis', 'intern', 'Par. 195, 199 BGB', 'calendar_year_end', interval '3 years',
   'ANN-551',
   'Check-Ups, Pannenmeldungen, Sperren und Stellen am Rad mit ihren Fotos: drei Jahre ab Ende des Kalenderjahres des Ereignisses (bei der Sperre: der Freigabe). Nie, solange eine Stelle oder Sperre offen ist. Nachweis der Pflege des Arbeitsmittels fuer die Verjaehrungsfrist; Kontrollen vor der Fahrt kennen keine gesetzliche Frist (BetrSichV Par. 4 Abs. 5).',
   91),
  ('schluesselverlauf', 'intern', null, 'case_closed', interval '30 days', 'ANN-551',
   'Wer den Schluessel eines Rads genommen und zurueckgelegt hat: 30 Tage nach der Rueckgabe; ein offener Vorgang nie. Genug, um bei einem Schaden nach der letzten Fahrt zu fragen; keine Auswertung je Person (PROJECT_PRINCIPLES.md 20).',
   92);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('fleet_depots', 'betriebsdaten', 'keine',
   'Raddepots (FLT-001). Betriebliche Orte ohne Personenbezug; bleiben, bis die Praxis das Depot entfernt. Ein Depot mit Raedern laesst sich nicht entfernen (FK restrict).',
   214),
  ('fleet_bikes', 'betriebsdaten', 'keine',
   'Raeder der Flotte (FLT-001). Bleiben, bis die Praxis sie entfernt; mit Verlauf wird ein Rad ausgemustert, die Stammnutzer:in faellt dabei (ANN-557). Der Verlauf faellt nach seiner eigenen Frist.',
   215),
  ('fleet_key_handovers', 'schluesselverlauf', 'automatisch',
   'Schluesselstand (FLT-001): 30 Tage nach der Rueckgabe; offen nie (ANN-551). Faellt frueher mit dem Rad (cascade).',
   216),
  ('fleet_checkups', 'radflotte_ereignis', 'automatisch',
   'Check-Ups (FLT-001): drei Jahre ab Ende des Kalenderjahres der Pruefung, nicht solange eine ihrer Stellen offen ist (ANN-551). Stellen und Fotos fallen mit (cascade).',
   217),
  ('fleet_breakdowns', 'radflotte_ereignis', 'automatisch',
   'Pannenmeldungen (FLT-001): drei Jahre ab Ende des Kalenderjahres der Meldung, nicht solange eine Stelle oder eine Sperre aus ihr offen ist (ANN-551). Stellen und Fotos fallen mit (cascade).',
   218),
  ('fleet_blocks', 'radflotte_ereignis', 'automatisch',
   'Sperren (FLT-001): drei Jahre ab Ende des Kalenderjahres der Freigabe; offene nie (ANN-551).',
   219),
  ('fleet_spots', 'radflotte_ereignis', 'ueber_elterndatensatz',
   'Stellen am Rad (FLT-001): fallen mit ihrem Check-Up oder ihrer Pannenmeldung (cascade, ANN-551).',
   220);

-- -----------------------------------------------------------------------------
-- 11. Lesen: die Flotte in einem Aufruf
--
-- Eine Praxis hat eine Handvoll Raeder; Suche und Filter laufen in der
-- Oberflaeche ueber dieser einen Antwort. Ausgemusterte Raeder fehlen.
-- p_week_start (ein Montag) liefert dazu die ganztaegigen Abwesenheiten der
-- Stammnutzer:innen in dieser Woche aus den Arbeitszeiten (CAL-005), damit
-- die Wochenuebersicht "frei, weil abwesend" zeigen kann - nur das Datum, nie
-- ein Grund, und nur fuer Stammnutzer:innen eines Rads.
-- -----------------------------------------------------------------------------
create function app.fleet_bike_json(p_bike public.fleet_bikes)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_bike.id,
    'name', p_bike.name,
    'bike_type', p_bike.bike_type,
    'home_depot_id', p_bike.home_depot_id,
    'current_depot_id', p_bike.current_depot_id,
    'special_location', p_bike.special_location,
    'is_spare', p_bike.is_spare,
    'regular_rider', case when p_bike.regular_rider_id is null then null else
      jsonb_build_object('id', p_bike.regular_rider_id,
                         'name', app.fleet_staff_name(p_bike.regular_rider_id)) end,
    'planned_weekdays', to_jsonb(p_bike.planned_weekdays),
    'battery', p_bike.battery,
    'note', p_bike.note,
    'updated_at', p_bike.updated_at,
    'key', (
      select jsonb_build_object(
        'holder_staff_id', k.holder_staff_id,
        'holder_name', app.fleet_staff_name(k.holder_staff_id),
        'taken_at', k.taken_at
      )
      from public.fleet_key_handovers k
      where k.bike_id = p_bike.id and k.returned_at is null
    ),
    'block', (
      select jsonb_build_object(
        'id', b.id,
        'blocked_at', b.blocked_at,
        'reason', b.reason,
        'breakdown_id', b.breakdown_id
      )
      from public.fleet_blocks b
      where b.bike_id = p_bike.id and b.released_at is null
    ),
    'open_spots', (
      select count(*) from public.fleet_spots s
      where s.bike_id = p_bike.id and s.resolved_at is null
    ),
    'open_problems', (
      select count(*) from public.fleet_spots s
      where s.bike_id = p_bike.id and s.resolved_at is null and s.severity = 'problem'
    ),
    'last_checkup_at', (
      select max(c.checked_at) from public.fleet_checkups c where c.bike_id = p_bike.id
    )
  )
$$;

revoke all on function app.fleet_bike_json(public.fleet_bikes) from public, anon, authenticated;

create function public.list_fleet(p_week_start date default null)
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
    'my_staff_member_id', app.fleet_current_staff_member(v_org),
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

revoke all on function public.list_fleet(date) from public, anon;
grant execute on function public.list_fleet(date) to authenticated;

comment on function public.list_fleet(date) is
  'FLT-001: die Radflotte in einem Aufruf - Depots, Raeder mit Schluessel, Sperre und offenen Stellen, aktive Mitarbeitende fuer die Auswahl und die ganztaegigen Abwesenheiten der Stammnutzer:innen in der Woche ab p_week_start. Dazu die Rechte der anfragenden Person. Lesen nach app.can_read_fleet() (BEF-066).';

-- -----------------------------------------------------------------------------
-- 12. Lesen: ein Rad mit Stellen und Verlauf
--
-- Stellen: offene zuerst und nummeriert in der Reihenfolge ihres Entstehens
-- (eine Nummerierung ueber alle offenen Stellen des Rads, Handoff Abschnitt
-- 4), danach die erledigten ohne Nummer. Verlauf: Check-Ups, Pannen, Sperren
-- und Schluessel innerhalb ihrer Frist, neueste zuerst.
-- -----------------------------------------------------------------------------
create function app.fleet_spot_json(p_spot public.fleet_spots, p_number integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_spot.id,
    'number', p_number,
    'zone', p_spot.zone,
    'point', case when p_spot.point_x is null then null
                  else jsonb_build_array(p_spot.point_x, p_spot.point_y, p_spot.point_z) end,
    'model_version', p_spot.model_version,
    'severity', p_spot.severity,
    'note', p_spot.note,
    'source', case when p_spot.checkup_id is not null then 'checkup' else 'breakdown' end,
    'source_id', coalesce(p_spot.checkup_id, p_spot.breakdown_id),
    'created_at', p_spot.created_at,
    'resolved_at', p_spot.resolved_at
  )
$$;

revoke all on function app.fleet_spot_json(public.fleet_spots, integer) from public, anon, authenticated;

create function public.get_fleet_bike(p_bike_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
    'bike', app.fleet_bike_json(v_bike),
    'spots', coalesce((
      select jsonb_agg(
        app.fleet_spot_json(x.stelle, x.nummer)
        order by x.offen desc,
                 x.nummer asc nulls last,
                 x.erledigt desc nulls last,
                 x.angelegt desc,
                 x.folge desc
      )
      from (
        select s as stelle,
               s.resolved_at is null as offen,
               s.created_at as angelegt,
               s.seq as folge,
               s.resolved_at as erledigt,
               case when s.resolved_at is null
                    then (row_number() over (partition by s.resolved_at is null
                                             order by s.created_at, s.seq))::integer
               end as nummer
        from public.fleet_spots s
        where s.bike_id = v_bike.id
      ) x
    ), '[]'::jsonb),
    'checkups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'checked_at', c.checked_at,
          'checked_by_name', app.fleet_account_name(c.checked_by),
          'items', c.items,
          'note', c.note
        )
        order by c.checked_at desc, c.id
      )
      from public.fleet_checkups c
      where c.bike_id = v_bike.id
    ), '[]'::jsonb),
    'breakdowns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'reported_at', d.reported_at,
          'reported_by_name', app.fleet_account_name(d.reported_by),
          'outcome', d.outcome,
          'blocks', app.fleet_outcome_blocks(d.outcome),
          'summary', d.summary,
          'remark', d.remark,
          'location_note', d.location_note,
          'transport', d.transport
        )
        order by d.reported_at desc, d.id
      )
      from public.fleet_breakdowns d
      where d.bike_id = v_bike.id
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'breakdown_id', b.breakdown_id,
          'reason', b.reason,
          'blocked_at', b.blocked_at,
          'blocked_by_name', app.fleet_account_name(b.blocked_by),
          'released_at', b.released_at,
          'released_by_name', app.fleet_account_name(b.released_by)
        )
        order by b.blocked_at desc, b.id
      )
      from public.fleet_blocks b
      where b.bike_id = v_bike.id
    ), '[]'::jsonb),
    'keys', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'holder_name', app.fleet_staff_name(k.holder_staff_id),
          'taken_at', k.taken_at,
          'returned_at', k.returned_at
        )
        order by k.taken_at desc, k.id
      )
      from public.fleet_key_handovers k
      where k.bike_id = v_bike.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_fleet_bike(uuid) from public, anon;
grant execute on function public.get_fleet_bike(uuid) to authenticated;

comment on function public.get_fleet_bike(uuid) is
  'FLT-001: ein Rad mit seinen Stellen (offene nummeriert, Handoff Abschnitt 4) und dem Verlauf aus Check-Ups, Pannen, Sperren und Schluessel. Lesen nach app.can_read_fleet() (BEF-066).';

-- -----------------------------------------------------------------------------
-- 13. Lesen: die Unterlage fuer die Werkstatt (Handoff, Vorschlag 5)
--
-- Nur Angaben zum Rad: keine Namen aus dem Team, keine Termine, kein Ort der
-- Panne. Die Projektion liefert, was die Unterlage zeigen darf - nicht alles
-- mit der Bitte, es auszublenden (ADR-004, PROJECT_PRINCIPLES.md 4.7).
-- -----------------------------------------------------------------------------
create function public.get_fleet_workshop_sheet(p_bike_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
          'point', case when s.point_x is null then null
                        else jsonb_build_array(s.point_x, s.point_y, s.point_z) end,
          'model_version', s.model_version,
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

revoke all on function public.get_fleet_workshop_sheet(uuid) from public, anon;
grant execute on function public.get_fleet_workshop_sheet(uuid) to authenticated;

comment on function public.get_fleet_workshop_sheet(uuid) is
  'FLT-001 (Handoff Lastenrad 3D, Vorschlag 5): die Unterlage fuer die Werkstatt - Rad, Bauart, gesperrt seit, offene Stellen mit Nummer, Punkt, Einstufung, Notiz und Art und Tag des Ereignisses. Keine Namen, keine Termine, kein Pannenort. Lesen nach app.can_read_fleet().';

-- -----------------------------------------------------------------------------
-- 14. Depot anlegen, aendern, entfernen (owner)
-- -----------------------------------------------------------------------------
create function public.save_fleet_depot(p_depot_id uuid, p_name text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_name text;
  v_note text;
  v_id   uuid;
begin
  v_org := app.fleet_org(app.can_manage_fleet(), 'not allowed to manage the fleet');
  v_name := btrim(coalesce(p_name, ''), E' \t\r\n');
  if v_name = '' or length(v_name) > 80 then
    raise exception 'depot name is required and at most 80 characters' using errcode = '22023';
  end if;
  v_note := app.fleet_text(p_note, 200, 'depot note');

  if p_depot_id is null then
    insert into public.fleet_depots (organization_id, name, note, created_by, updated_by)
    values (v_org, v_name, v_note, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.fleet_depots d
       set name = v_name, note = v_note, updated_at = now(), updated_by = auth.uid()
     where d.id = p_depot_id and d.organization_id = v_org
    returning d.id into v_id;
    if v_id is null then
      raise exception 'depot not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'depot name already in use' using errcode = '23505';
end;
$$;

revoke all on function public.save_fleet_depot(uuid, text, text) from public, anon;
grant execute on function public.save_fleet_depot(uuid, text, text) to authenticated;

comment on function public.save_fleet_depot(uuid, text, text) is
  'FLT-001: Depot anlegen (p_depot_id null) oder umbenennen. Nur owner (BEF-066).';

create function public.delete_fleet_depot(p_depot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_manage_fleet(), 'not allowed to manage the fleet');
  if not exists (
    select 1 from public.fleet_depots d where d.id = p_depot_id and d.organization_id = v_org
  ) then
    raise exception 'depot not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.fleet_bikes b
    where b.organization_id = v_org
      and (b.home_depot_id = p_depot_id or b.current_depot_id = p_depot_id)
  ) then
    raise exception 'depot still has bikes' using errcode = '55000';
  end if;
  delete from public.fleet_depots d where d.id = p_depot_id and d.organization_id = v_org;
end;
$$;

revoke all on function public.delete_fleet_depot(uuid) from public, anon;
grant execute on function public.delete_fleet_depot(uuid) to authenticated;

comment on function public.delete_fleet_depot(uuid) is
  'FLT-001: Depot entfernen, solange kein Rad dort steht oder hingehoert. Nur owner (BEF-066).';

-- -----------------------------------------------------------------------------
-- 15. Rad anlegen oder aendern (owner)
--
-- Gleichzeitiges Aendern: p_expected_updated_at ist der Stand, den die
-- Oberflaeche gelesen hat; ein anderer heisst 40001 (wie bei den Gebieten).
-- -----------------------------------------------------------------------------
create function public.save_fleet_bike(
  p_bike_id             uuid,
  p_name                text,
  p_bike_type           text,
  p_home_depot_id       uuid,
  p_current_depot_id    uuid,
  p_special_location    text,
  p_is_spare            boolean,
  p_regular_rider_id    uuid,
  p_planned_weekdays    smallint[],
  p_battery             text,
  p_note                text,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_name      text;
  v_type      text := coalesce(p_bike_type, 'load60_riemen');
  v_special   text;
  v_spare     boolean := coalesce(p_is_spare, false);
  v_rider     uuid := p_regular_rider_id;
  v_days      smallint[] := coalesce(p_planned_weekdays, '{}'::smallint[]);
  v_id        uuid;
  v_stand     timestamptz;
begin
  v_org := app.fleet_org(app.can_manage_fleet(), 'not allowed to manage the fleet');

  v_name := btrim(coalesce(p_name, ''), E' \t\r\n');
  if v_name = '' or length(v_name) > 60 then
    raise exception 'bike name is required and at most 60 characters' using errcode = '22023';
  end if;
  if not (v_type = any (app.fleet_bike_types())) then
    raise exception 'unknown bike type' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.fleet_depots d where d.id = p_home_depot_id and d.organization_id = v_org
  ) then
    raise exception 'depot not found' using errcode = 'P0002';
  end if;
  v_special := app.fleet_text(p_special_location, 120, 'special location');
  if (p_current_depot_id is null) = (v_special is null) then
    raise exception 'bike needs either a current depot or a named location' using errcode = '22023';
  end if;
  if p_current_depot_id is not null and not exists (
    select 1 from public.fleet_depots d where d.id = p_current_depot_id and d.organization_id = v_org
  ) then
    raise exception 'depot not found' using errcode = 'P0002';
  end if;
  if v_spare then
    -- Ein Ersatzrad hat keine Stammnutzer:in und keinen Wochenplan.
    v_rider := null;
    v_days := '{}'::smallint[];
  end if;
  if v_rider is not null then
    perform app.assert_staff_member_in_org(v_rider, v_org);
  end if;
  if not (v_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]) then
    raise exception 'weekday out of range' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct d order by d), '{}'::smallint[]) into v_days
  from unnest(v_days) d;

  if p_bike_id is null then
    insert into public.fleet_bikes (
      organization_id, name, bike_type, home_depot_id, current_depot_id, special_location,
      is_spare, regular_rider_id, planned_weekdays, battery, note, created_by, updated_by
    )
    values (
      v_org, v_name, v_type, p_home_depot_id, p_current_depot_id, v_special,
      v_spare, v_rider, v_days, app.fleet_text(p_battery, 80, 'battery'),
      app.fleet_text(p_note, 500, 'note'), auth.uid(), auth.uid()
    )
    returning id into v_id;
  else
    select b.updated_at into v_stand
    from public.fleet_bikes b
    where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
    for update;
    if not found then
      raise exception 'bike not found' using errcode = 'P0002';
    end if;
    if p_expected_updated_at is not null and v_stand <> p_expected_updated_at then
      raise exception 'bike was changed meanwhile' using errcode = '40001';
    end if;
    update public.fleet_bikes b
       set name = v_name,
           bike_type = v_type,
           home_depot_id = p_home_depot_id,
           current_depot_id = p_current_depot_id,
           special_location = v_special,
           is_spare = v_spare,
           regular_rider_id = v_rider,
           planned_weekdays = v_days,
           battery = app.fleet_text(p_battery, 80, 'battery'),
           note = app.fleet_text(p_note, 500, 'note'),
           updated_at = now(),
           updated_by = auth.uid()
     where b.id = p_bike_id
    returning b.id into v_id;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'bike name already in use' using errcode = '23505';
end;
$$;

revoke all on function public.save_fleet_bike(
  uuid, text, text, uuid, uuid, text, boolean, uuid, smallint[], text, text, timestamptz
) from public, anon;
grant execute on function public.save_fleet_bike(
  uuid, text, text, uuid, uuid, text, boolean, uuid, smallint[], text, text, timestamptz
) to authenticated;

comment on function public.save_fleet_bike(
  uuid, text, text, uuid, uuid, text, boolean, uuid, smallint[], text, text, timestamptz
) is
  'FLT-001: Rad anlegen (p_bike_id null) oder aendern - Name, Bauart, Stammdepot, Standort (Depot oder benannter Ort), Ersatzrad, Stammnutzer:in, Wochenplan, Akku, Notiz. Nur owner (BEF-066). Gleichzeitige Aenderung: 40001.';

-- -----------------------------------------------------------------------------
-- 16. Rad entfernen (owner; ANN-557)
--
-- Ohne Verlauf wird das Rad geloescht. Mit Verlauf wird es ausgemustert: Es
-- verschwindet aus der Flotte, der Verlauf bleibt bis zum Ende seiner Frist
-- (Nachweis der Pflege, ANN-551), und die Stammnutzer:in faellt sofort.
-- Ein entnommener Schluessel muss vorher zurueck.
-- -----------------------------------------------------------------------------
create function public.remove_fleet_bike(p_bike_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_manage_fleet(), 'not allowed to manage the fleet');
  perform 1 from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
  for update;
  if not found then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.fleet_key_handovers k where k.bike_id = p_bike_id and k.returned_at is null
  ) then
    raise exception 'key is taken' using errcode = '55000';
  end if;

  if exists (select 1 from public.fleet_checkups c where c.bike_id = p_bike_id)
     or exists (select 1 from public.fleet_breakdowns d where d.bike_id = p_bike_id)
     or exists (select 1 from public.fleet_blocks b where b.bike_id = p_bike_id)
     or exists (select 1 from public.fleet_key_handovers k where k.bike_id = p_bike_id) then
    update public.fleet_blocks b
       set released_at = now(), released_by = auth.uid()
     where b.bike_id = p_bike_id and b.released_at is null;
    update public.fleet_spots s
       set resolved_at = now(), resolved_by = auth.uid()
     where s.bike_id = p_bike_id and s.resolved_at is null;
    -- Wie bei der Freigabe: kein Pannenort ueber das Rad hinaus (ANN-558).
    update public.fleet_breakdowns d
       set location_note = null
     where d.bike_id = p_bike_id and d.location_note is not null;
    update public.fleet_bikes b
       set archived_at = now(),
           archived_by = auth.uid(),
           regular_rider_id = null,
           planned_weekdays = '{}'::smallint[],
           note = null,
           updated_at = now(),
           updated_by = auth.uid()
     where b.id = p_bike_id;
    return 'archived';
  end if;

  delete from public.fleet_bikes b where b.id = p_bike_id;
  return 'deleted';
end;
$$;

revoke all on function public.remove_fleet_bike(uuid) from public, anon;
grant execute on function public.remove_fleet_bike(uuid) to authenticated;

comment on function public.remove_fleet_bike(uuid) is
  'FLT-001 (ANN-557): Rad entfernen. Ohne Verlauf geloescht, mit Verlauf ausgemustert - aus der Flotte, offene Sperre und Stellen erledigt, Stammnutzer:in entfernt, Verlauf bis zum Ende seiner Frist. Nur owner (BEF-066).';

-- -----------------------------------------------------------------------------
-- 17. Schluessel nehmen und zuruecklegen (alle Praxisrollen der Behandlung)
--
-- Ohne Angabe nimmt die angemeldete Person den Schluessel selbst; wer ihn
-- fuer eine Kollegin mitnimmt, waehlt sie aus dem Mitarbeiterstamm.
-- -----------------------------------------------------------------------------
create function public.take_fleet_key(p_bike_id uuid, p_holder_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_holder uuid;
  v_id     uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  perform 1 from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
  for update;
  if not found then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.fleet_blocks b where b.bike_id = p_bike_id and b.released_at is null
  ) then
    raise exception 'bike is blocked' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.fleet_key_handovers k where k.bike_id = p_bike_id and k.returned_at is null
  ) then
    raise exception 'key already taken' using errcode = '55000';
  end if;

  v_holder := coalesce(p_holder_staff_id, app.fleet_current_staff_member(v_org));
  if v_holder is null then
    raise exception 'no staff member for this account' using errcode = '22023';
  end if;
  perform app.assert_staff_member_in_org(v_holder, v_org);

  insert into public.fleet_key_handovers (organization_id, bike_id, holder_staff_id, taken_by)
  values (v_org, p_bike_id, v_holder, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.take_fleet_key(uuid, uuid) from public, anon;
grant execute on function public.take_fleet_key(uuid, uuid) to authenticated;

comment on function public.take_fleet_key(uuid, uuid) is
  'FLT-001: Schluessel eines Rads nehmen - fuer sich selbst (p_holder_staff_id null) oder fuer eine Mitarbeiterin aus dem Stamm. Nicht bei gesperrtem Rad, nicht doppelt. Alle Praxisrollen der Behandlung (BEF-066).';

create function public.return_fleet_key(p_bike_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  if not exists (
    select 1 from public.fleet_bikes b where b.id = p_bike_id and b.organization_id = v_org
  ) then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  update public.fleet_key_handovers k
     set returned_at = now(), returned_by = auth.uid()
   where k.bike_id = p_bike_id and k.organization_id = v_org and k.returned_at is null;
  if not found then
    raise exception 'key is not taken' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.return_fleet_key(uuid) from public, anon;
grant execute on function public.return_fleet_key(uuid) to authenticated;

comment on function public.return_fleet_key(uuid) is
  'FLT-001: Schluessel eines Rads zuruecklegen - wer ihn hat oder eine Kollegin fuer sie. Alle Praxisrollen der Behandlung (BEF-066).';

-- -----------------------------------------------------------------------------
-- 18. Stellen pruefen und anlegen (ANN-555)
--
-- p_spots: [{zone, severity, point: [x, y, z] | null, note}], hoechstens 20.
-- Liefert die Kennungen in der Reihenfolge der Eingabe, damit die Fotos zu
-- ihrer Stelle finden.
-- -----------------------------------------------------------------------------
create function app.fleet_insert_spots(
  p_org          uuid,
  p_bike         public.fleet_bikes,
  p_checkup_id   uuid,
  p_breakdown_id uuid,
  p_spots        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spot     jsonb;
  v_point    jsonb;
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
    v_point := v_spot -> 'point';
    if v_point is not null and jsonb_typeof(v_point) <> 'null' then
      if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 3
         or jsonb_typeof(v_point -> 0) <> 'number'
         or jsonb_typeof(v_point -> 1) <> 'number'
         or jsonb_typeof(v_point -> 2) <> 'number' then
        raise exception 'point must be three numbers' using errcode = '22023';
      end if;
    else
      v_point := null;
    end if;

    insert into public.fleet_spots (
      organization_id, bike_id, checkup_id, breakdown_id, bike_type, model_version, zone,
      point_x, point_y, point_z, severity, note, created_by
    )
    values (
      p_org, p_bike.id, p_checkup_id, p_breakdown_id, p_bike.bike_type,
      app.fleet_model_version(p_bike.bike_type), v_spot ->> 'zone',
      round((v_point ->> 0)::numeric, 3), round((v_point ->> 1)::numeric, 3),
      round((v_point ->> 2)::numeric, 3), v_severity,
      app.fleet_text(v_spot ->> 'note', 500, 'spot note'), auth.uid()
    )
    returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  return v_ids;
exception
  when check_violation then
    raise exception 'point outside the model' using errcode = '22023';
end;
$$;

revoke all on function app.fleet_insert_spots(uuid, public.fleet_bikes, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 19. Check-Up erfassen (alle Praxisrollen der Behandlung)
--
-- p_items: [{key, rating, note}] - genau die Pruefpunkte der Bauart, in ihrer
-- Reihenfolge. Eine Stelle hebt die Bewertung ihres Pruefpunkts an, nie ab
-- (Handoff, Vorschlag 3): Steht an der Bremse eine Stelle "Problem", muss
-- "Bremsen" auf "Problem" stehen - der Server prueft das, die Oberflaeche
-- setzt es.
-- -----------------------------------------------------------------------------
create function public.record_fleet_checkup(
  p_bike_id   uuid,
  p_items     jsonb,
  p_note      text,
  p_spots     jsonb,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_bike    public.fleet_bikes%rowtype;
  v_keys    text[];
  v_item    jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_i       integer := 0;
  v_rating  text;
  v_spot    jsonb;
  v_check   text;
  v_need    text;
  v_id      uuid;
  v_spots   jsonb;
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

  insert into public.fleet_checkups (organization_id, bike_id, bike_type, items, note, checked_by)
  values (v_org, v_bike.id, v_bike.bike_type, v_items, app.fleet_text(p_note, 1000, 'note'),
          auth.uid())
  returning id into v_id;

  v_spots := app.fleet_insert_spots(v_org, v_bike, v_id, null, coalesce(p_spots, '[]'::jsonb));

  return jsonb_build_object('checkup_id', v_id, 'spot_ids', v_spots);
end;
$$;

revoke all on function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean) from public, anon;
grant execute on function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean) to authenticated;

comment on function public.record_fleet_checkup(uuid, jsonb, text, jsonb, boolean) is
  'FLT-001: Check-Up erfassen - alle Pruefpunkte der Bauart in ihrer Reihenfolge, Notiz, Stellen am Rad, Bestaetigung der angemeldeten Person (ANN-553). Eine Stelle hebt ihren Pruefpunkt an, nie ab (ANN-555). Sperrt das Rad nicht (dafuer der Pannenassistent). Alle Praxisrollen der Behandlung (BEF-066).';

-- -----------------------------------------------------------------------------
-- 20. Panne melden (alle Praxisrollen der Behandlung)
--
-- Der Abschluss kommt aus dem Assistenten; ob er sperrt, entscheidet die eine
-- Stelle app.fleet_outcome_blocks. Ist das Rad schon gesperrt, bleibt es bei
-- der einen Sperre.
-- -----------------------------------------------------------------------------
create function public.record_fleet_breakdown(
  p_bike_id       uuid,
  p_outcome       text,
  p_summary       text,
  p_remark        text,
  p_location_note text,
  p_transport     text,
  p_spots         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_bike    public.fleet_bikes%rowtype;
  v_summary text;
  v_id      uuid;
  v_spots   jsonb;
  v_blocked boolean := false;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');

  select b.* into v_bike
  from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
  for update;
  if v_bike.id is null then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  if p_outcome is null or not (p_outcome = any (app.fleet_breakdown_outcomes())) then
    raise exception 'unknown outcome' using errcode = '22023';
  end if;
  v_summary := app.fleet_text(p_summary, 1000, 'summary');
  if v_summary is null then
    raise exception 'summary is required' using errcode = '22023';
  end if;
  if p_transport is not null and p_transport not in ('carsharing', 'fahrdienst') then
    raise exception 'unknown transport' using errcode = '22023';
  end if;

  insert into public.fleet_breakdowns (
    organization_id, bike_id, outcome, summary, remark, location_note, transport, reported_by
  )
  values (
    v_org, v_bike.id, p_outcome, v_summary, app.fleet_text(p_remark, 1000, 'remark'),
    app.fleet_text(p_location_note, 200, 'location note'), p_transport, auth.uid()
  )
  returning id into v_id;

  v_spots := app.fleet_insert_spots(v_org, v_bike, null, v_id, coalesce(p_spots, '[]'::jsonb));

  if app.fleet_outcome_blocks(p_outcome) then
    v_blocked := true;
    if not exists (
      select 1 from public.fleet_blocks b where b.bike_id = v_bike.id and b.released_at is null
    ) then
      insert into public.fleet_blocks (organization_id, bike_id, breakdown_id, blocked_by)
      values (v_org, v_bike.id, v_id, auth.uid());
    end if;
  end if;

  return jsonb_build_object('breakdown_id', v_id, 'spot_ids', v_spots, 'blocked', v_blocked);
end;
$$;

revoke all on function public.record_fleet_breakdown(uuid, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.record_fleet_breakdown(uuid, text, text, text, text, text, jsonb)
  to authenticated;

comment on function public.record_fleet_breakdown(uuid, text, text, text, text, text, jsonb) is
  'FLT-001: Panne melden - Abschluss des Assistenten, Text, auffaellige Stelle, Standort des zurueckgelassenen Rads (ANN-558), Weiterfahrt und Stellen am Rad (jede ein Schaden). Sperrt nach app.fleet_outcome_blocks. Versendet nichts. Alle Praxisrollen der Behandlung (BEF-066).';

-- -----------------------------------------------------------------------------
-- 21. Von Hand sperren und freigeben (owner, team_lead; ANN-550)
--
-- Freigeben schliesst die offene Sperre und erledigt alle offenen Stellen des
-- Rads; sie bleiben im Verlauf (Handoff, Vorschlag 2). Auch ein Rad ohne
-- Sperre kann offene Stellen haben ("Beobachten" aus dem Check-Up) - dann
-- erledigt derselbe Vorgang nur die Stellen.
-- -----------------------------------------------------------------------------
create function public.block_fleet_bike(p_bike_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_reason text;
  v_id     uuid;
begin
  v_org := app.fleet_org(app.can_release_fleet_bike(), 'not allowed to block or release bikes');
  perform 1 from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
  for update;
  if not found then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;
  v_reason := app.fleet_text(p_reason, 200, 'reason');
  if v_reason is null then
    raise exception 'reason is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.fleet_blocks b where b.bike_id = p_bike_id and b.released_at is null
  ) then
    raise exception 'bike is already blocked' using errcode = '55000';
  end if;
  insert into public.fleet_blocks (organization_id, bike_id, reason, blocked_by)
  values (v_org, p_bike_id, v_reason, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.block_fleet_bike(uuid, text) from public, anon;
grant execute on function public.block_fleet_bike(uuid, text) to authenticated;

comment on function public.block_fleet_bike(uuid, text) is
  'FLT-001 (ANN-550): Rad von Hand sperren, mit Grund ("Inspektion in der Werkstatt"). owner und team_lead.';

create function public.release_fleet_bike(p_bike_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_blocks  integer;
  v_spots   integer;
begin
  v_org := app.fleet_org(app.can_release_fleet_bike(), 'not allowed to block or release bikes');
  perform 1 from public.fleet_bikes b
  where b.id = p_bike_id and b.organization_id = v_org and b.archived_at is null
  for update;
  if not found then
    raise exception 'bike not found' using errcode = 'P0002';
  end if;

  update public.fleet_blocks b
     set released_at = now(), released_by = auth.uid()
   where b.bike_id = p_bike_id and b.released_at is null;
  get diagnostics v_blocks = row_count;
  update public.fleet_spots s
     set resolved_at = now(), resolved_by = auth.uid()
   where s.bike_id = p_bike_id and s.resolved_at is null;
  get diagnostics v_spots = row_count;

  if v_blocks + v_spots = 0 then
    raise exception 'nothing to release' using errcode = '55000';
  end if;
  -- Der Ort, an dem das Rad zurueckgelassen wurde, hat seinen Zweck mit der
  -- Freigabe erfuellt: Das Rad ist wieder da. Er kann ein Hausbesuch sein und
  -- bleibt deshalb nicht die drei Jahre der Meldung stehen (ANN-558).
  update public.fleet_breakdowns d
     set location_note = null
   where d.bike_id = p_bike_id and d.location_note is not null;
  return jsonb_build_object('released', v_blocks > 0, 'resolved_spots', v_spots);
end;
$$;

revoke all on function public.release_fleet_bike(uuid) from public, anon;
grant execute on function public.release_fleet_bike(uuid) to authenticated;

comment on function public.release_fleet_bike(uuid) is
  'FLT-001 (ANN-550, ANN-555, ANN-558): Rad freigeben - schliesst die offene Sperre und erledigt alle offenen Stellen; beides bleibt im Verlauf. Der Pannenort des Rads wird geleert. owner und team_lead. Versendet nichts.';

-- -----------------------------------------------------------------------------
-- 22. Loeschlauf (ADR-008, ANN-551)
--
-- Eine Funktion fuer die ganze Radflotte, aufgerufen aus apply_retention -
-- wie die Fotos der Akte (app.delete_due_patient_photos). Reihenfolge:
-- Schluessel, Sperren, dann Check-Ups und Pannen (deren Stellen und Fotos
-- fallen per cascade). Kein Legal Hold: Loeschsperren stehen heute an der
-- Akte (ANN-033); ein Rad kennt keine. Wer eine Loeschung anhalten muss,
-- sichert vorher die Unterlage fuer die Werkstatt (ANN-551, BEF-166).
-- -----------------------------------------------------------------------------
create function app.delete_due_fleet_records(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Schluessel: 30 Tage nach der Rueckgabe; offene nie.
  with faellig as (
    select k.id, k.organization_id,
           app.retention_due_at(
             (k.returned_at at time zone p_time_zone)::date,
             app.retention_interval('schluesselverlauf'),
             p_time_zone
           ) as due_at
    from public.fleet_key_handovers k
    where k.organization_id = p_org and k.returned_at is not null
  ),
  geloescht as (
    delete from public.fleet_key_handovers k
    using faellig f
    where k.id = f.id and f.due_at <= now()
    returning k.id, k.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'fleet_key_handovers', g.id, 'schluesselverlauf', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Sperren: drei Jahre ab Ende des Kalenderjahres der Freigabe; offene nie.
  with faellig as (
    select b.id, b.organization_id,
           app.retention_due_at(
             (date_trunc('year', b.released_at at time zone p_time_zone)
               + interval '1 year' - interval '1 day')::date,
             app.retention_interval('radflotte_ereignis'),
             p_time_zone
           ) as due_at
    from public.fleet_blocks b
    where b.organization_id = p_org and b.released_at is not null
  ),
  geloescht as (
    delete from public.fleet_blocks b
    using faellig f
    where b.id = f.id and f.due_at <= now()
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'fleet_blocks', g.id, 'radflotte_ereignis', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Check-Ups: drei Jahre ab Ende des Kalenderjahres der Pruefung, nicht
  -- solange eine ihrer Stellen offen ist.
  with faellig as (
    select c.id, c.organization_id,
           app.retention_due_at(
             (date_trunc('year', c.checked_at at time zone p_time_zone)
               + interval '1 year' - interval '1 day')::date,
             app.retention_interval('radflotte_ereignis'),
             p_time_zone
           ) as due_at
    from public.fleet_checkups c
    where c.organization_id = p_org
      and not exists (
        select 1 from public.fleet_spots s where s.checkup_id = c.id and s.resolved_at is null
      )
  ),
  geloescht as (
    delete from public.fleet_checkups c
    using faellig f
    where c.id = f.id and f.due_at <= now()
    returning c.id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'fleet_checkups', g.id, 'radflotte_ereignis', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Pannen: drei Jahre ab Ende des Kalenderjahres der Meldung, nicht solange
  -- eine Stelle oder eine Sperre aus ihr offen ist.
  with faellig as (
    select d.id, d.organization_id,
           app.retention_due_at(
             (date_trunc('year', d.reported_at at time zone p_time_zone)
               + interval '1 year' - interval '1 day')::date,
             app.retention_interval('radflotte_ereignis'),
             p_time_zone
           ) as due_at
    from public.fleet_breakdowns d
    where d.organization_id = p_org
      and not exists (
        select 1 from public.fleet_spots s where s.breakdown_id = d.id and s.resolved_at is null
      )
      and not exists (
        select 1 from public.fleet_blocks b where b.breakdown_id = d.id and b.released_at is null
      )
  ),
  geloescht as (
    delete from public.fleet_breakdowns d
    using faellig f
    where d.id = f.id and f.due_at <= now()
    returning d.id, d.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'fleet_breakdowns', g.id, 'radflotte_ereignis', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_fleet_records(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_fleet_records(uuid, text, uuid) is
  'FLT-001 (ANN-551): Loeschlauf der Radflotte - Schluessel 30 Tage nach der Rueckgabe, Sperren, Check-Ups und Pannen drei Jahre ab Ende des Kalenderjahres; offene nie. Schreibt das Loeschjournal. Aufgerufen aus public.apply_retention().';

-- -----------------------------------------------------------------------------
-- 23. Der Loeschlauf ruft die Radflotte auf (ADR-008, ANN-551)
--
-- Rumpf sonst unveraendert aus 20261112110000_a_002_fristanker_aus_letzter_behandlung.sql:
-- ein Zaehler mehr, ein Aufruf mehr, ein Schluessel mehr im Kontext von
-- retention.applied (keine neue Aktion, ADR-010).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_auftraege integer;
  v_journal   integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_wuensche  integer;
  v_nachrichten integer;
  v_anhaenge  integer;
  v_radflotte integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Behandlung.
    --
    -- B1 (BEF-151, ADR-008 Fassung 3): Der Anker ist nicht mehr allein der
    -- ausdrueckliche Abschluss, sondern app.patient_retention_anchor - das
    -- spaeteste Datum aus letzter Behandlung, erfasster Leistung und einem
    -- etwaigen ausdruecklichen Abschluss. Eine Akte mit kuenftigem Termin
    -- faellt nie, und ohne jede Behandlung laeuft weiter keine Frist.
    -- -------------------------------------------------------------------
    for v_akte in
      select k.id, k.due_at
      from (
        select p.id,
               app.retention_due_at(
                 app.patient_retention_anchor(p.id),
                 app.retention_interval('patientenakte'),
                 v_org.time_zone
               ) as due_at
        from public.patients p
        where p.organization_id = v_org.id
      ) k
      join public.patients p on p.id = k.id
      where k.due_at is not null
        and k.due_at <= now()
        and not app.patient_has_upcoming_care(k.id)
      order by k.due_at
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    -- LOG-EPIC-001: zwei Klassen (app.audit_retention_class), und ein Legal
    -- Hold haelt jede Zeile seiner Akte - ueber den Gegenstand oder
    -- context.patient_id, auch fuer zusammengefuehrte Doppelanlagen.
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval(app.audit_retention_class(a.action))
        and not app.audit_entry_held(v_org.id, a.subject_type, a.subject_id, a.context)
      returning a.id, a.organization_id, a.occurred_at, app.audit_retention_class(a.action) as klasse
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, g.klasse,
           g.occurred_at + app.retention_interval(g.klasse)
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung
    -- (LOG-EPIC-001). Offene Auftraege bleiben. Nicht im Journal: Ein
    -- Auftrag ist selbst der Nachweis einer Loeschung, kein Fachdatensatz.
    -- -------------------------------------------------------------------
    delete from public.storage_deletion_orders o
    where o.organization_id = v_org.id
      and o.receipted_at is not null
      and o.receipted_at < now() - app.retention_interval('loeschauftrag');
    get diagnostics v_auftraege = row_count;

    -- -------------------------------------------------------------------
    -- Loeschjournal: 60 Tage ab der Loeschung (ADR-012: Backups 30 Tage,
    -- dazu 30 Tage Puffer). Zuletzt, damit die Eintraege dieses Laufs nicht
    -- mitfallen.
    -- -------------------------------------------------------------------
    delete from public.deletion_journal j
    where j.organization_id = v_org.id
      and j.deleted_at < now() - app.retention_interval('loeschjournal');
    get diagnostics v_journal = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Terminwuensche der Plattform (POR-009, ANN-246): zwoelf Monate nach
    -- der Antwort der Praxis bzw. dem Zurueckziehen. Offene Wuensche
    -- bleiben; mit dem Verhaeltnis fallen sie ohnehin (cascade). Ein Legal
    -- Hold an der Akte haelt auch den beantworteten Wunsch.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.resolved_at + app.retention_interval('terminwunsch') as due_at
      from public.platform_appointment_requests w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.resolved_at is not null
        and (w.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', w.patient_id))
    ),
    geloescht as (
      delete from public.platform_appointment_requests w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_appointment_requests', g.id, 'terminwunsch', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_wuensche = row_count;

    -- -------------------------------------------------------------------
    -- KOM-005 (ADR-017 Punkt 65): Anhaenge an Rueckfragen, 30 Tage ab der
    -- Aufnahme oder ab ihrer Sperre. Vor den Vorgaengen: ein Anhang, der mit
    -- seinem Vorgang faellt, steht nicht doppelt im Journal. Ein Legal Hold
    -- an der Akte haelt (gesperrt, ANN-335).
    -- -------------------------------------------------------------------
    v_anhaenge := app.remove_message_attachments(v_org.id, 'due', null, v_run);

    -- -------------------------------------------------------------------
    -- FLT-001 (ANN-551): Radflotte - Schluessel 30 Tage nach der Rueckgabe,
    -- Sperren, Check-Ups und Pannen drei Jahre ab Ende des Kalenderjahres;
    -- offene nie. Ohne Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_radflotte := app.delete_due_fleet_records(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- Nachrichten der Behandlung (KOM-001, ADR-008 "Organisatorische
    -- Patientenkommunikation", ANN-001): drei Jahre ab Ende des
    -- Kalenderjahres, in dem der Vorgang abgeschlossen wurde: erledigt, oder
    -- beantwortet und danach nichts mehr von der Person (Anker: die letzte
    -- Antwort; Zweitreview S1, ANN-308). Offene bleiben; der Akte
    -- zugeordnete (KOM-004, ANN-312) fallen erst mit ihr; im Training fallen
    -- sie mit dem Verhaeltnis (cascade). Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select m.id,
             m.organization_id,
             app.retention_due_at(
               (date_trunc('year', coalesce(m.closed_at, m.last_entry_at)
                                     at time zone v_org.time_zone)
                 + interval '1 year' - interval '1 day')::date,
               app.retention_interval('patientenkommunikation'),
               v_org.time_zone
             ) as due_at
      from public.platform_messages m
      where m.organization_id = v_org.id
        and m.relationship_kind = 'treatment'
        and m.status in ('closed', 'answered')
        and m.record_assigned_at is null
        and not app.under_legal_hold(v_org.id, 'patient', m.patient_id)
    ),
    geloescht as (
      delete from public.platform_messages m
      using faellig f
      where m.id = f.id
        and f.due_at <= now()
      returning m.id, m.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_messages', g.id, 'patientenkommunikation', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_nachrichten = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche + v_nachrichten + v_anhaenge
                + v_radflotte;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'loeschauftrag', v_auftraege,
          'loeschjournal', v_journal,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'terminwunsch', v_wuensche,
          'patientenkommunikation', v_nachrichten,
          'rueckfrageanhang', v_anhaenge,
          'radflotte', v_radflotte,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 24. Nach einem Restore: die Radflotte in der Reihenfolge der Wiederanwendung
--
-- Rumpf sonst unveraendert aus 20261026110000_kom_005b_attachment_projections.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- POR-009: ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- KOM-005: ein Anhang haengt am Vorgang (cascade) und faellt vor ihm.
    'platform_message_attachments',
    -- KOM-001: ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    -- FLT-001: die Radflotte haengt an keiner Akte. Schluessel und Sperren
    -- vor den Pannen (eine Sperre zeigt auf ihre Panne, set null); Stellen
    -- und Fotos fallen mit Check-Up und Panne (cascade).
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_checkups',
    'fleet_breakdowns',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;
