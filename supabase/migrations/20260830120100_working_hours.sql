-- =============================================================================
-- Arbeitszeiten (CAL-005)
--
-- Zwei Ebenen, die sich klar abloesen:
--
--   * Ein wiederkehrender Wochenplan je Person und Wochentag, aus beliebig
--     vielen Bloecken. Er beschreibt den Normalfall.
--   * Datumsbezogene Abweichungen. Sie ERSETZEN den Wochenplan fuer genau
--     dieses Datum - entweder als vollstaendige Nichtverfuegbarkeit oder als
--     abweichende Bloecke. Es wird nichts zusammengefuehrt: sobald fuer einen
--     Tag eine Abweichung hinterlegt ist, gilt ausschliesslich sie.
--
-- Gespeichert wird ausdruecklich in ORTSZEIT (`time`), nicht in UTC. "Montags
-- ab 8 Uhr" ist eine Aussage ueber die Ortszeit der Praxis und bleibt ueber
-- eine Zeitumstellung hinweg dieselbe Aussage. Ein UTC-Zeitstempel waere hier
-- schlicht falsch.
--
-- Dies ist ausdruecklich KEINE Arbeitszeiterfassung, keine Urlaubsverwaltung
-- und kein Ressourcenplaner (Auftrag Abschnitt 4). Es beschreibt nur, wann
-- eine Person planmaessig behandelt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bereichstyp ueber Ortszeiten
--
-- Damit lassen sich Ueberschneidungen als Datenbank-Constraint ausdruecken -
-- gleichzeitig und nebenlaeufigkeitssicher, statt per Abfrage vor dem Schreiben.
-- PostgreSQL kennt keinen eingebauten Bereichstyp ueber `time`.
-- -----------------------------------------------------------------------------
create type app.timerange as range (
  subtype = time,
  multirange_type_name = app.timemultirange
);

comment on type app.timerange is
  'Bereich ueber Ortszeiten. Grundlage der Ueberschneidungs- und Abdeckungspruefung von Arbeitszeiten (CAL-005).';

-- -----------------------------------------------------------------------------
-- Wochenplan
-- -----------------------------------------------------------------------------
create table public.staff_working_hours (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete restrict,
  -- ISO-8601: 1 = Montag ... 7 = Sonntag, passend zu extract(isodow from date).
  weekday         smallint not null check (weekday between 1 and 7),
  starts_at       time not null,
  ends_at         time not null,
  created_at      timestamptz not null default now(),
  created_by      uuid,

  constraint staff_working_hours_time_order check (ends_at > starts_at),
  -- Sekundengenaue Arbeitszeiten gibt es fachlich nicht und sie waeren gegen
  -- das Praxisraster nicht sinnvoll auswertbar.
  constraint staff_working_hours_whole_minutes check (
    date_part('second', starts_at) = 0 and date_part('second', ends_at) = 0
  ),
  -- Zwei Bloecke derselben Person am selben Wochentag duerfen sich nicht
  -- ueberschneiden. Halboffen: 08:00-12:00 und 12:00-16:00 sind zulaessig.
  constraint staff_working_hours_no_overlap exclude using gist (
    staff_member_id with =,
    weekday with =,
    app.timerange(starts_at, ends_at, '[)') with &&
  )
);

comment on table public.staff_working_hours is
  'Wiederkehrender Wochenplan einer behandelnden Person in Ortszeit der Praxis (CAL-005). Datenklasse: organisatorische Personaldaten, keine Gesundheitsdaten.';
comment on column public.staff_working_hours.weekday is
  'ISO-8601-Wochentag: 1 = Montag ... 7 = Sonntag.';
comment on column public.staff_working_hours.created_by is
  'auth.users.id des handelnden Accounts. Bewusst ohne FK, wie an den uebrigen Fachtabellen.';

create index staff_working_hours_lookup_idx
  on public.staff_working_hours (organization_id, staff_member_id, weekday);

-- -----------------------------------------------------------------------------
-- Datumsbezogene Abweichungen
--
-- Ein Eintrag mit kind = 'unavailable' belegt den ganzen Tag. Dadurch schliesst
-- die Ueberschneidungs-Constraint drei Faelle mit einer einzigen Regel aus:
-- ueberlappende Bloecke, doppelte Nichtverfuegbarkeit und - wichtiger - die
-- Mischung aus "gar nicht da" und "aber von 10 bis 12 doch".
-- -----------------------------------------------------------------------------
create table public.staff_working_hour_exceptions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete restrict,
  on_date         date not null,
  kind            text not null check (kind in ('unavailable', 'block')),
  starts_at       time,
  ends_at         time,
  created_at      timestamptz not null default now(),
  created_by      uuid,

  constraint staff_working_hour_exceptions_kind_fields check (
    (kind = 'unavailable' and starts_at is null and ends_at is null)
    or (kind = 'block' and starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  constraint staff_working_hour_exceptions_whole_minutes check (
    (starts_at is null or date_part('second', starts_at) = 0)
    and (ends_at is null or date_part('second', ends_at) = 0)
  ),
  constraint staff_working_hour_exceptions_no_overlap exclude using gist (
    staff_member_id with =,
    on_date with =,
    app.timerange(
      coalesce(starts_at, time '00:00'),
      coalesce(ends_at,   time '24:00'),
      '[)'
    ) with &&
  )
);

comment on table public.staff_working_hour_exceptions is
  'Datumsbezogene Abweichung vom Wochenplan (CAL-005). Ersetzt den Wochenplan fuer dieses Datum vollstaendig. Ausdruecklich keine Urlaubsverwaltung und keine Arbeitszeiterfassung.';
comment on column public.staff_working_hour_exceptions.kind is
  '"unavailable" = an diesem Tag keine Termine; "block" = abweichender Zeitblock. Beides schliesst sich am selben Tag gegenseitig aus.';

create index staff_working_hour_exceptions_lookup_idx
  on public.staff_working_hour_exceptions (organization_id, staff_member_id, on_date);

-- -----------------------------------------------------------------------------
-- Rechte und RLS
--
-- Arbeitszeiten sind organisatorische Personaldaten. Praxisrollen duerfen sie
-- lesen, Patientenkonten nicht. Geschrieben wird ausschliesslich ueber die
-- RPCs weiter unten - authenticated behaelt nur SELECT (ADR-004).
-- -----------------------------------------------------------------------------
alter table public.staff_working_hours enable row level security;
alter table public.staff_working_hour_exceptions enable row level security;

revoke all on public.staff_working_hours from anon, authenticated;
revoke all on public.staff_working_hour_exceptions from anon, authenticated;
grant select on public.staff_working_hours to authenticated;
grant select on public.staff_working_hour_exceptions to authenticated;

create policy staff_working_hours_select_staff_only
  on public.staff_working_hours for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
  );

create policy staff_working_hour_exceptions_select_staff_only
  on public.staff_working_hour_exceptions for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
  );

-- -----------------------------------------------------------------------------
-- Rechte auf die Pflege
--
-- Wer den Dienstplan aendert, aendert die Planung anderer Menschen. therapist
-- darf ihn deshalb lesen, aber nicht setzen.
-- -----------------------------------------------------------------------------
create or replace function app.can_manage_working_hours()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead', 'office')
$$;

grant execute on function app.can_manage_working_hours() to authenticated;

-- -----------------------------------------------------------------------------
-- Abdeckungspruefung
--
-- Liefert true, wenn [p_start, p_end) vollstaendig durch Arbeitszeit gedeckt
-- ist. Ueber range_agg werden angrenzende Bloecke zu einem Bereich vereinigt:
-- ein Termin von 11:30 bis 12:30 ueber die Bloecke 08:00-12:00 und 12:00-16:00
-- hinweg gilt damit als abgedeckt.
--
-- OHNE hinterlegte Arbeitszeit ist das Ergebnis false. Das ist ausdruecklich
-- gewollt: eine fehlende Angabe ist keine Zusage, dass die Person Zeit hat.
-- Die Nachfrage bleibt der sichere Standard.
--
-- Die Funktion nimmt Organisation und Person entgegen und wuerde damit zum
-- Orakel ueber fremde Praxen. Deshalb kein EXECUTE fuer authenticated - sie
-- wird ausschliesslich aus SECURITY-DEFINER-Funktionen heraus aufgerufen.
-- -----------------------------------------------------------------------------
create or replace function app.is_within_working_hours(
  p_staff_member_id uuid,
  p_organization_id uuid,
  p_date            date,
  p_start           time,
  p_end             time
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_abweichungen integer;
  v_abwesend     boolean;
  v_bereiche     app.timemultirange;
begin
  select count(*), bool_or(a.kind = 'unavailable')
    into v_abweichungen, v_abwesend
  from public.staff_working_hour_exceptions a
  where a.staff_member_id = p_staff_member_id
    and a.organization_id = p_organization_id
    and a.on_date = p_date;

  if v_abweichungen > 0 then
    -- Der Tag ist abweichend geregelt; der Wochenplan gilt fuer ihn nicht.
    if v_abwesend then
      return false;
    end if;

    select range_agg(app.timerange(a.starts_at, a.ends_at, '[)'))
      into v_bereiche
    from public.staff_working_hour_exceptions a
    where a.staff_member_id = p_staff_member_id
      and a.organization_id = p_organization_id
      and a.on_date = p_date
      and a.kind = 'block';
  else
    select range_agg(w.zeitraum)
      into v_bereiche
    from (
      select app.timerange(h.starts_at, h.ends_at, '[)') as zeitraum
      from public.staff_working_hours h
      where h.staff_member_id = p_staff_member_id
        and h.organization_id = p_organization_id
        and h.weekday = extract(isodow from p_date)
    ) w;
  end if;

  if v_bereiche is null then
    return false;
  end if;

  return v_bereiche @> app.timerange(p_start, p_end, '[)');
end;
$$;

comment on function app.is_within_working_hours(uuid, uuid, date, time, time) is
  'Prueft, ob ein Zeitraum vollstaendig durch die Arbeitszeit der Person gedeckt ist. Datumsbezogene Abweichungen ersetzen den Wochenplan; ohne hinterlegte Arbeitszeit ist das Ergebnis false (CAL-005).';

-- Kein Orakel ueber fremde Praxen: nur intern aufrufbar.
revoke all on function app.is_within_working_hours(uuid, uuid, date, time, time)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- set_staff_working_hours
--
-- Ersetzt den Wochentag einer Person vollstaendig. Ein leeres Array loescht
-- ihn - "an diesem Wochentag gar nicht" ist eine gueltige Aussage und braucht
-- keinen eigenen Sonderwert.
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_working_hours(
  p_staff_member_id uuid,
  p_weekday         smallint,
  p_blocks          jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  if p_weekday is null or p_weekday not between 1 and 7 then
    raise exception 'weekday must be between 1 and 7' using errcode = '22023';
  end if;

  -- Fremde und unbekannte Personen sind ununterscheidbar.
  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  delete from public.staff_working_hours
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and weekday = p_weekday;

  begin
    insert into public.staff_working_hours (
      organization_id, staff_member_id, weekday, starts_at, ends_at, created_by
    )
    select v_org, p_staff_member_id, p_weekday,
           (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
    from jsonb_array_elements(p_blocks) as b;
  exception
    when exclusion_violation then
      raise exception 'working hours overlap' using errcode = '23P01';
    -- Unbrauchbare oder fehlende Zeitangaben im Array werden als
    -- Eingabefehler gemeldet, nicht als interner Fehler. Bewusst nur diese
    -- Faelle - ein `when others` wuerde echte Stoerungen verschlucken.
    when check_violation or not_null_violation
         or invalid_datetime_format or datetime_field_overflow then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.set_staff_working_hours(uuid, smallint, jsonb) is
  'Ersetzt den Wochenplan einer Person fuer einen Wochentag vollstaendig (CAL-005). Zeiten sind Ortszeiten der Praxis.';

revoke all on function public.set_staff_working_hours(uuid, smallint, jsonb) from public, anon;
grant execute on function public.set_staff_working_hours(uuid, smallint, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- set_staff_working_hour_exception
--
-- Ersetzt einen einzelnen Kalendertag vollstaendig. Ohne Abwesenheit und ohne
-- Bloecke wird die Abweichung entfernt; damit gilt fuer diesen Tag wieder der
-- Wochenplan.
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_working_hour_exception(
  p_staff_member_id uuid,
  p_date            date,
  p_unavailable     boolean,
  p_blocks          jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_working_hours() then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage working hours' using errcode = '42501';
  end if;

  if p_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;

  if coalesce(p_unavailable, false) and jsonb_array_length(p_blocks) > 0 then
    raise exception 'an unavailable day cannot have blocks' using errcode = '22023';
  end if;

  delete from public.staff_working_hour_exceptions
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and on_date = p_date;

  if coalesce(p_unavailable, false) then
    insert into public.staff_working_hour_exceptions (
      organization_id, staff_member_id, on_date, kind, created_by
    )
    values (v_org, p_staff_member_id, p_date, 'unavailable', v_actor);
    return 1;
  end if;

  begin
    insert into public.staff_working_hour_exceptions (
      organization_id, staff_member_id, on_date, kind, starts_at, ends_at, created_by
    )
    select v_org, p_staff_member_id, p_date, 'block',
           (b ->> 'von')::time, (b ->> 'bis')::time, v_actor
    from jsonb_array_elements(p_blocks) as b;
  exception
    when exclusion_violation then
      raise exception 'working hours overlap' using errcode = '23P01';
    when check_violation or not_null_violation
         or invalid_datetime_format or datetime_field_overflow then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.set_staff_working_hour_exception(uuid, date, boolean, jsonb) is
  'Ersetzt die datumsbezogene Abweichung einer Person fuer einen Kalendertag vollstaendig (CAL-005). Ohne Abwesenheit und ohne Bloecke gilt wieder der Wochenplan.';

revoke all on function public.set_staff_working_hour_exception(uuid, date, boolean, jsonb)
  from public, anon;
grant execute on function public.set_staff_working_hour_exception(uuid, date, boolean, jsonb)
  to authenticated;
