-- =============================================================================
-- AZ-001 (Überholung 8): Arbeitszeitänderung mit der Antragsmechanik aus URL-001
--
--   * Fassungen des Wochenplans (ANN-589): `staff_working_hours` bekommt
--     `valid_from` und `valid_until` (leer heißt seit jeher bzw. offen). An
--     jedem Tag gilt je Person genau eine Fassung; alle Zeilen einer Fassung
--     tragen dieselben Grenzen, und die Ausschlussbedingung verbietet
--     Überschneidungen auch über Fassungen hinweg. Die Leser - Abdeckung
--     (Kalender, Termine, Training), Slotsuche, Statistik, Urlaubstage -
--     nehmen die Fassung des Tages. Die Pflege in der Planung ändert die heute
--     gültige Fassung; eine genehmigte dauerhafte Änderung beendet sie am
--     Vortag und beginnt die neue am Datum. Frühere Fassungen liest nur noch
--     der Server (RLS ab heute): kein Verlauf über die Kolleg:innen (§16).
--   * Anträge (ANN-590): einmalig (ein Tag, wirkt als Abweichung) oder
--     dauerhaft (Wochenplan ab einem Datum). beantragt → genehmigt oder
--     abgelehnt (mit Grund); zurückgezogen, solange beantragt. Entscheidet
--     owner (`app.can_decide_staff_requests`), nie den eigenen; den eigenen
--     trägt owner direkt ein. Der Grund ist an die Praxisleitung gerichtet -
--     ihn sehen die Person und owner, sonst niemand.
--   * Prüfungen am Server (ANN-588), beim Beantragen und beim Genehmigen:
--     keine Reduktion (einmalig die Arbeitszeit des Tages, dauerhaft die der
--     Woche - Stunden dürfen zwischen den Tagen wandern), höchstens zehn
--     Stunden am Tag (§ 3 ArbZG), Pausen (§ 4: 30 Minuten über sechs, 45 über
--     neun Stunden, Abschnitte ab 15 Minuten, höchstens sechs Stunden am
--     Stück), elf Stunden Ruhe zwischen zwei Arbeitstagen (§ 5). Nicht
--     rückwirkend: frühestens morgen.
--   * Termine außerhalb der neuen Zeiten werden je Tag genannt, nie still
--     verschoben oder abgesagt.
--   * Nachweis ist das Datenmodell (ADR-010 Punkt 15): beantragt von/am,
--     bisher und neu, entschieden von/am, Grund. Kein Auditeintrag.
--   * Fristen (ADR-008, ANN-591): genehmigte Anträge drei Jahre ab Ende des
--     Jahres ihrer Wirkung, abgelehnte und zurückgezogene ein Jahr nach ihrem
--     Ende; offene nie. Die Fassungen bleiben Wochenplan (ANN-030).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fassungen des Wochenplans (ANN-589)
-- -----------------------------------------------------------------------------
alter table public.staff_working_hours
  add column valid_from date,
  add column valid_until date;

alter table public.staff_working_hours
  add constraint staff_working_hours_validity
    check (valid_from is null or valid_until is null or valid_until >= valid_from);

-- Zwei Blöcke derselben Person am selben Wochentag überschneiden sich auch
-- über Fassungen nicht; dass es je Tag genau eine Fassung gibt, prüft der
-- Trigger unten.
alter table public.staff_working_hours drop constraint staff_working_hours_no_overlap;
alter table public.staff_working_hours
  add constraint staff_working_hours_no_overlap exclude using gist (
    staff_member_id with =,
    weekday with =,
    app.timerange(starts_at, ends_at, '[)') with &&,
    daterange(valid_from, valid_until, '[]') with &&
  );

-- Je Person und Tag genau eine Fassung (Zweitreview B5): Zeilen, deren
-- Gültigkeit sich überschneidet, tragen dieselben Grenzen. Die
-- Ausschlussbedingung oben verbietet nur überlappende Blöcke; diese Prüfung
-- läuft am Ende der Transaktion, weil Genehmigen und Pflege die alte Fassung
-- erst schließen und dann die neue schreiben.
create function app.check_working_plan_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.staff_working_hours h
    where h.staff_member_id = new.staff_member_id
      and h.id <> new.id
      and daterange(h.valid_from, h.valid_until, '[]') && daterange(new.valid_from, new.valid_until, '[]')
      and (h.valid_from is distinct from new.valid_from or h.valid_until is distinct from new.valid_until)
  ) then
    raise exception 'working plan versions overlap' using errcode = '23P01';
  end if;
  return null;
end;
$$;

revoke all on function app.check_working_plan_versions() from public, anon, authenticated;

create constraint trigger staff_working_hours_one_version
  after insert or update of valid_from, valid_until, staff_member_id on public.staff_working_hours
  deferrable initially deferred
  for each row execute function app.check_working_plan_versions();

comment on column public.staff_working_hours.valid_from is
  'AZ-001 (ANN-589): erster Tag der Fassung; leer = seit jeher. Alle Zeilen einer Fassung tragen dieselben Grenzen.';
comment on column public.staff_working_hours.valid_until is
  'AZ-001 (ANN-589): letzter Tag der Fassung; leer = offen. Eine genehmigte dauerhafte Aenderung setzt ihn auf den Vortag ihres Datums.';
comment on table public.staff_working_hours is
  'Wiederkehrender Wochenplan einer Person in Ortszeit der Praxis (CAL-005), in Fassungen mit Gueltigkeit (AZ-001, ANN-589). Datenklasse: organisatorische Personaldaten, keine Gesundheitsdaten. Fruehere Fassungen liest nur der Server.';

create index staff_working_hours_validity_idx
  on public.staff_working_hours (organization_id, staff_member_id, valid_from);

-- Heute in der Zeitzone der eigenen Praxis - fuer die Leseregel unten. Ohne
-- Organisation null; dann liest die Regel ohnehin nichts.
create function app.practice_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.time_zone)::date
  from public.organizations o
  where o.id = app.current_organization_id()
$$;

revoke all on function app.practice_today() from public, anon;
grant execute on function app.practice_today() to authenticated;

comment on function app.practice_today() is
  'AZ-001: heute in der Zeitzone der eigenen Praxis (Leseregel des Wochenplans).';

-- Gelesen wird weiter direkt (Kalender, Planung, scheduling/api.ts), aber nur
-- die Fassungen, die heute oder spaeter gelten. Eine beendete Fassung zeigte
-- sonst jeder Praxisrolle, wie jemand frueher gearbeitet hat (ANN-589).
drop policy staff_working_hours_select_staff_only on public.staff_working_hours;
create policy staff_working_hours_select_staff_only
  on public.staff_working_hours for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
    and (valid_until is null or valid_until >= app.practice_today())
  );

-- -----------------------------------------------------------------------------
-- 2. Die Leser nehmen die Fassung des Tages
-- -----------------------------------------------------------------------------
-- Stand CAL-005, dazu die Fassung (AZ-001): Abweichungen ersetzen den Plan
-- wie bisher; ohne Abweichung zaehlt der Wochenplan, der an p_date gilt.
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
        and daterange(h.valid_from, h.valid_until, '[]') @> p_date
    ) w;
  end if;

  if v_bereiche is null then
    return false;
  end if;

  return v_bereiche @> app.timerange(p_start, p_end, '[)');
end;
$$;

comment on function app.is_within_working_hours(uuid, uuid, date, time, time) is
  'Prueft, ob ein Zeitraum vollstaendig durch die Arbeitszeit der Person gedeckt ist. Datumsbezogene Abweichungen ersetzen den Wochenplan; sonst gilt die Fassung des Tages (AZ-001). Ohne hinterlegte Arbeitszeit false (CAL-005).';

revoke all on function app.is_within_working_hours(uuid, uuid, date, time, time)
  from public, anon, authenticated;

-- Stand PRX-003, dazu die Fassung des Tages.
create or replace function app.working_ranges(
  p_staff_member_id uuid,
  p_organization_id uuid,
  p_date            date
)
returns app.timemultirange
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
    if v_abwesend then
      return null;
    end if;
    select range_agg(app.timerange(a.starts_at, a.ends_at, '[)'))
      into v_bereiche
    from public.staff_working_hour_exceptions a
    where a.staff_member_id = p_staff_member_id
      and a.organization_id = p_organization_id
      and a.on_date = p_date
      and a.kind = 'block';
  else
    select range_agg(app.timerange(h.starts_at, h.ends_at, '[)'))
      into v_bereiche
    from public.staff_working_hours h
    where h.staff_member_id = p_staff_member_id
      and h.organization_id = p_organization_id
      and h.weekday = extract(isodow from p_date)
      and daterange(h.valid_from, h.valid_until, '[]') @> p_date;
  end if;

  return v_bereiche;
end;
$$;

comment on function app.working_ranges(uuid, uuid, date) is
  'Arbeitszeit einer Person an einem Tag als Zeitraeume (PRX-003); dieselbe Regel wie app.is_within_working_hours, mit der Fassung des Tages (AZ-001). Null ohne Arbeitszeit oder bei Abwesenheit.';
revoke all on function app.working_ranges(uuid, uuid, date) from public, anon, authenticated;

-- Stand URL-001 (ANN-577), dazu die Fassung je Tag: Ein Tag zaehlt, wenn die
-- an ihm geltende Fassung an seinem Wochentag einen Block hat; gilt an ihm
-- keine, Montag bis Freitag.
create or replace function app.leave_days(p_org uuid, p_staff_member_id uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with tage as (
    select d::date as tag
    from generate_series(p_from, p_to, interval '1 day') as d
  )
  select count(*)::integer
  from tage t
  cross join (select o.federal_state from public.organizations o where o.id = p_org) as o
  where not app.is_public_holiday(t.tag, o.federal_state)
    and (
      exists (
        select 1 from public.staff_working_hours w
        where w.organization_id = p_org and w.staff_member_id = p_staff_member_id
          and w.weekday = extract(isodow from t.tag)
          and daterange(w.valid_from, w.valid_until, '[]') @> t.tag
      )
      or (
        not exists (
          select 1 from public.staff_working_hours w
          where w.organization_id = p_org and w.staff_member_id = p_staff_member_id
            and daterange(w.valid_from, w.valid_until, '[]') @> t.tag
        )
        and extract(isodow from t.tag) <= 5
      )
    )
$$;

revoke all on function app.leave_days(uuid, uuid, date, date) from public, anon, authenticated;

comment on function app.leave_days(uuid, uuid, date, date) is
  'URL-001 (ANN-577), AZ-001: Urlaubstage eines Zeitraums - Arbeitstage nach der an jedem Tag geltenden Fassung des Wochenplans (ohne Plan Mo-Fr), ohne gesetzliche Feiertage des Bundeslands der Praxis.';

-- -----------------------------------------------------------------------------
-- 3. Ein Tag und eine Woche: Blöcke, Fassung, Prüfungen (ANN-588)
-- -----------------------------------------------------------------------------
-- Die Blöcke eines Tages aus [{von, bis}] - sortiert, ganze Minuten, ohne
-- Überschneidung; sonst 22023 bzw. 23P01 wie set_staff_working_hours.
create function app.working_day_blocks(p_blocks jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_von time[];
  v_bis time[];
  i     integer;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'blocks must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_blocks) > 6 then
    raise exception 'working hour block is invalid' using errcode = '22023';
  end if;
  begin
    select array_agg(w.von order by w.von), array_agg(w.bis order by w.von)
      into v_von, v_bis
    from (
      select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
      from jsonb_array_elements(p_blocks) as b
    ) w;
  exception
    when invalid_datetime_format or datetime_field_overflow or invalid_text_representation
         or invalid_parameter_value then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;
  if v_von is null then
    return '[]'::jsonb;
  end if;
  for i in 1 .. array_length(v_von, 1) loop
    if v_von[i] is null or v_bis[i] is null or v_bis[i] <= v_von[i]
       or date_part('second', v_von[i]) <> 0 or date_part('second', v_bis[i]) <> 0 then
      raise exception 'working hour block is invalid' using errcode = '22023';
    end if;
    if i > 1 and v_von[i] < v_bis[i - 1] then
      raise exception 'working hours overlap' using errcode = '23P01';
    end if;
  end loop;
  return (
    select jsonb_agg(jsonb_build_object('von', to_char(v_von[g.n], 'HH24:MI'),
                                        'bis', to_char(v_bis[g.n], 'HH24:MI')) order by g.n)
    from generate_series(1, array_length(v_von, 1)) as g (n)
  );
end;
$$;

revoke all on function app.working_day_blocks(jsonb) from public, anon, authenticated;

-- Arbeitsminuten geordneter Blöcke (Ergebnis von app.working_day_blocks).
create function app.working_day_minutes(p_blocks jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(extract(epoch from ((b ->> 'bis')::time - (b ->> 'von')::time)) / 60), 0)::integer
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b
$$;

revoke all on function app.working_day_minutes(jsonb) from public, anon, authenticated;

-- Was an einem Tag gegen das Arbeitszeitgesetz verstößt (ANN-588) - dieselben
-- Regeln wie src/features/working-time/arbeitszeit.ts. Erwartet geordnete
-- Blöcke ohne Überschneidung.
create function app.working_day_problems(p_blocks jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_probleme text[] := '{}';
  v_arbeit   integer := app.working_day_minutes(p_blocks);
  v_pause    integer := 0;
  v_stueck   integer := 0;
  v_laengste integer := 0;
  v_noetig   integer;
  v_luecke   integer;
  v_block    integer;
  v_vorher   time;
  b          jsonb;
begin
  if p_blocks is null or jsonb_array_length(p_blocks) = 0 then
    return v_probleme;
  end if;
  for b in select x from jsonb_array_elements(p_blocks) as x loop
    v_block := (extract(epoch from ((b ->> 'bis')::time - (b ->> 'von')::time)) / 60)::integer;
    if v_vorher is null then
      v_stueck := v_block;
    else
      v_luecke := (extract(epoch from ((b ->> 'von')::time - v_vorher)) / 60)::integer;
      -- Eine Pause zaehlt ab 15 Minuten; eine kuerzere Unterbrechung
      -- unterbricht das Arbeiten am Stueck nicht (Par. 4 ArbZG).
      if v_luecke >= 15 then
        v_pause := v_pause + v_luecke;
        v_stueck := v_block;
      else
        v_stueck := v_stueck + v_luecke + v_block;
      end if;
    end if;
    v_laengste := greatest(v_laengste, v_stueck);
    v_vorher := (b ->> 'bis')::time;
  end loop;

  if v_arbeit > 600 then
    v_probleme := array_append(v_probleme, 'more_than_ten_hours');
  end if;
  v_noetig := case when v_arbeit > 540 then 45 when v_arbeit > 360 then 30 else 0 end;
  if v_pause < v_noetig then
    v_probleme := array_append(v_probleme, 'break_too_short');
  end if;
  if v_laengste > 360 then
    v_probleme := array_append(v_probleme, 'more_than_six_hours_in_a_row');
  end if;
  return v_probleme;
end;
$$;

revoke all on function app.working_day_problems(jsonb) from public, anon, authenticated;

-- Ruhe zwischen zwei Tagen in Minuten (Par. 5 ArbZG): vom Ende des einen bis
-- zum Beginn des naechsten; null, wenn einer frei ist.
create function app.rest_minutes(p_day jsonb, p_next jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(jsonb_array_length(p_day), 0) = 0 or coalesce(jsonb_array_length(p_next), 0) = 0
      then null
    else (24 * 60
          - extract(epoch from (p_day -> (jsonb_array_length(p_day) - 1) ->> 'bis')::time) / 60
          + extract(epoch from (p_next -> 0 ->> 'von')::time) / 60)::integer
  end
$$;

revoke all on function app.rest_minutes(jsonb, jsonb) from public, anon, authenticated;

-- Die Fassung, die an einem Tag gilt, als Woche {"1": [...], ..., "7": [...]}.
create function app.plan_week(p_org uuid, p_staff_member_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(t.tag::text, coalesce((
           select jsonb_agg(jsonb_build_object('von', to_char(h.starts_at, 'HH24:MI'),
                                               'bis', to_char(h.ends_at, 'HH24:MI'))
                            order by h.starts_at)
           from public.staff_working_hours h
           where h.organization_id = p_org and h.staff_member_id = p_staff_member_id
             and h.weekday = t.tag
             and daterange(h.valid_from, h.valid_until, '[]') @> p_date
         ), '[]'::jsonb))
  from generate_series(1, 7) as t (tag)
$$;

revoke all on function app.plan_week(uuid, uuid, date) from public, anon, authenticated;

-- Ein Tag, wie er gilt: genehmigter Urlaub, Abwesenheit, Abweichung oder die
-- Fassung des Tages. {"kind": ..., "blocks": [...]}
create function app.effective_day(p_org uuid, p_staff_member_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_abweichungen integer;
  v_abwesend     boolean;
begin
  if exists (
    select 1 from public.staff_leave_requests r
    where r.organization_id = p_org and r.staff_member_id = p_staff_member_id
      and r.kind = 'leave' and r.status = 'approved'
      and p_date between r.starts_on and r.ends_on
  ) then
    return jsonb_build_object('kind', 'leave', 'blocks', '[]'::jsonb);
  end if;

  select count(*), bool_or(a.kind = 'unavailable')
    into v_abweichungen, v_abwesend
  from public.staff_working_hour_exceptions a
  where a.organization_id = p_org and a.staff_member_id = p_staff_member_id
    and a.on_date = p_date;

  if v_abweichungen > 0 then
    if v_abwesend then
      return jsonb_build_object('kind', 'unavailable', 'blocks', '[]'::jsonb);
    end if;
    return jsonb_build_object('kind', 'exception', 'blocks', (
      select jsonb_agg(jsonb_build_object('von', to_char(a.starts_at, 'HH24:MI'),
                                          'bis', to_char(a.ends_at, 'HH24:MI'))
                       order by a.starts_at)
      from public.staff_working_hour_exceptions a
      where a.organization_id = p_org and a.staff_member_id = p_staff_member_id
        and a.on_date = p_date and a.kind = 'block'
    ));
  end if;

  return jsonb_build_object(
    'kind', 'plan',
    'blocks', app.plan_week(p_org, p_staff_member_id, p_date) -> extract(isodow from p_date)::text
  );
end;
$$;

revoke all on function app.effective_day(uuid, uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Wer beantragt
-- -----------------------------------------------------------------------------
-- Jede Praxisrolle mit Mitarbeiterdatensatz - wie beim Urlaub. Wer keinen
-- Wochenplan hat, hat nichts zu aendern (22023 am Antrag).
create function app.can_request_working_time()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead', 'office', 'therapist', 'trainer')
$$;

revoke all on function app.can_request_working_time() from public, anon;
grant execute on function app.can_request_working_time() to authenticated;

comment on function app.can_request_working_time() is
  'AZ-001: Wer eine Aenderung der eigenen Arbeitszeit beantragt - jede Praxisrolle mit Mitarbeiterdatensatz, nie ein Patienten- oder Plattformkonto.';

-- -----------------------------------------------------------------------------
-- 5. Die Tabelle
-- -----------------------------------------------------------------------------
create table public.staff_working_time_requests (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  staff_member_id  uuid not null references public.staff_members (id) on delete restrict,
  -- 'once': ein Tag (wirkt als Abweichung); 'permanent': Wochenplan ab dem Datum.
  kind             text not null check (kind in ('once', 'permanent')),
  on_date          date not null,
  -- Die neuen Zeiten: einmalig [{von, bis}], dauerhaft {"1": [...], ..., "7": [...]}.
  blocks           jsonb not null,
  -- Was bisher galt, beim Beantragen am Server festgehalten (bisher → neu).
  previous_blocks  jsonb not null,
  previous_minutes integer not null check (previous_minutes between 0 and 10080),
  new_minutes      integer not null check (new_minutes between 0 and 10080),
  -- Der Grund, an die Praxisleitung gerichtet (ANN-590).
  message          text check (message is null or length(message) between 1 and 500),
  status           text not null default 'requested'
                     check (status in ('requested', 'approved', 'rejected', 'withdrawn')),
  requested_by     uuid not null,
  requested_at     timestamptz not null default now(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_note    text check (decision_note is null or length(decision_note) between 1 and 500),
  withdrawn_at     timestamptz,
  -- Selbst eingetragen (owner): genehmigt ohne zweite Person.
  self_entered     boolean not null default false,
  constraint staff_working_time_requests_shape check (
    (kind = 'once' and jsonb_typeof(blocks) = 'array' and jsonb_typeof(previous_blocks) = 'array')
    or (kind = 'permanent' and jsonb_typeof(blocks) = 'object' and jsonb_typeof(previous_blocks) = 'object')
  ),
  -- Weniger Arbeitszeit geht ueber diesen Antrag nicht (ANN-588).
  constraint staff_working_time_requests_no_reduction check (new_minutes >= previous_minutes),
  constraint staff_working_time_requests_decided check (
    (status in ('approved', 'rejected')) = (decided_at is not null and decided_by is not null)
  ),
  constraint staff_working_time_requests_reject_reason check (status <> 'rejected' or decision_note is not null),
  constraint staff_working_time_requests_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null))
);

comment on table public.staff_working_time_requests is
  'AZ-001 (ANN-590): Antraege auf Aenderung der eigenen Arbeitszeit - einmalig fuer einen Tag oder dauerhaft ab einem Datum, nie mit weniger Stunden. Beantragt von/am, bisher und neu, entschieden von/am, Grund - der Nachweis (ADR-010 Punkt 15). Den Grund (message) sehen die Person und owner. Datenklasse arbeitszeit (genehmigt: drei Jahre ab Ende des Jahres der Wirkung) bzw. arbeitszeit_kurz (abgelehnt, zurueckgezogen: ein Jahr), ANN-591. Kein Tabellenrecht.';

create index staff_working_time_requests_staff_idx
  on public.staff_working_time_requests (organization_id, staff_member_id, on_date);
create index staff_working_time_requests_open_idx
  on public.staff_working_time_requests (organization_id) where status = 'requested';
-- Hoechstens ein offener dauerhafter Antrag je Person und ein offener je Tag.
create unique index staff_working_time_requests_one_open_permanent
  on public.staff_working_time_requests (staff_member_id)
  where kind = 'permanent' and status = 'requested';
create unique index staff_working_time_requests_one_open_day
  on public.staff_working_time_requests (staff_member_id, on_date)
  where kind = 'once' and status = 'requested';

revoke all on public.staff_working_time_requests from anon, authenticated;
alter table public.staff_working_time_requests enable row level security;

-- Die Abweichung, die eine genehmigte einmalige Änderung schreibt, kennt
-- ihren Antrag: Fällt er nach seiner Frist, fällt der Tag mit (cascade,
-- ANN-591) - er stünde sonst unbefristet für alle Praxisrollen da
-- (Zweitreview B2). Gelesen wird die Spalte nicht: Das Spaltenrecht der
-- Abweichungen (URL-001) nennt sie nicht.
alter table public.staff_working_hour_exceptions
  add column working_time_request_id uuid
    references public.staff_working_time_requests (id) on delete cascade;

comment on column public.staff_working_hour_exceptions.working_time_request_id is
  'AZ-001 (ANN-591): Abweichung aus einer genehmigten einmaligen Arbeitszeitänderung; die Frist des Antrags löscht sie mit (cascade). Von Hand eingetragene tragen null.';

create index staff_working_hour_exceptions_working_time_idx
  on public.staff_working_hour_exceptions (working_time_request_id)
  where working_time_request_id is not null;

-- -----------------------------------------------------------------------------
-- 6. Datenklassen und Fristen (ADR-008, ANN-591)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('arbeitszeit', 'intern', 'Par. 195, 199 BGB', 'calendar_year_end', interval '3 years', 'ANN-591',
   'Genehmigte Antraege auf Aenderung der Arbeitszeit: drei Jahre ab Ende des Kalenderjahres, in dem die Aenderung wirkt - die Verjaehrung von Anspruechen aus der vereinbarten Arbeitszeit. Keine gesetzliche Aufbewahrungspflicht; offene nie. Der Wochenplan selbst bleibt (ANN-030).',
   95),
  ('arbeitszeit_kurz', 'intern', null, 'case_closed', interval '1 year', 'ANN-591',
   'Abgelehnte und zurueckgezogene Antraege auf Aenderung der Arbeitszeit: ein Jahr nach ihrem Ende. Genug fuer Rueckfragen, ohne Verlauf ueber die Person (PROJECT_PRINCIPLES.md 20).',
   96);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_working_time_requests', 'arbeitszeit', 'automatisch',
   'Genehmigte Arbeitszeitaenderungen (AZ-001): drei Jahre ab Ende des Jahres ihres Datums (ANN-591).',
   225),
  ('staff_working_time_requests', 'arbeitszeit_kurz', 'automatisch',
   'Abgelehnte und zurueckgezogene Arbeitszeitaenderungen (AZ-001): ein Jahr nach ihrem Ende; offene nie (ANN-591).',
   226),
  ('staff_working_hour_exceptions', 'arbeitszeit', 'ueber_elterndatensatz',
   'Abweichungen aus genehmigten einmaligen Arbeitszeitaenderungen (AZ-001, working_time_request_id): fallen mit ihrem Antrag (cascade, ANN-591).',
   227);

update public.retention_assignments
   set scope_note = 'Wochenplan samt frueheren und kuenftigen Fassungen (AZ-001, ANN-589). Frist offen (ANN-030).'
 where table_name = 'staff_working_hours' and class_key = 'beschaeftigtendaten';

-- -----------------------------------------------------------------------------
-- 7. Was bisher gilt, was neu gelten soll, was dagegen spricht
-- -----------------------------------------------------------------------------
-- Was bisher gilt: einmalig der Tag, wie er gilt; dauerhaft die Fassung am
-- Datum. Ein Urlaubstag und ein Tag mit Abwesenheit lassen sich nicht aendern
-- (55000), ebenso wenig ein Wochenplan, nach dem schon ein spaeterer kommt.
-- Ohne Wochenplan gibt es nichts zu aendern (22023).
create function app.working_time_baseline(p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag   jsonb;
  v_woche jsonb;
begin
  if not exists (
    select 1 from public.staff_working_hours h
    where h.organization_id = p_org and h.staff_member_id = p_staff_member_id
      and (h.valid_until is null or h.valid_until >= p_on_date)
  ) then
    raise exception 'no working plan' using errcode = '22023';
  end if;

  if p_kind = 'once' then
    v_tag := app.effective_day(p_org, p_staff_member_id, p_on_date);
    if v_tag ->> 'kind' = 'leave' then
      raise exception 'day is part of approved leave' using errcode = '55000';
    end if;
    if v_tag ->> 'kind' = 'unavailable' then
      raise exception 'day is marked absent' using errcode = '55000';
    end if;
    return jsonb_build_object(
      'blocks', coalesce(v_tag -> 'blocks', '[]'::jsonb),
      'minutes', app.working_day_minutes(v_tag -> 'blocks')
    );
  end if;

  if exists (
    select 1 from public.staff_working_hours h
    where h.organization_id = p_org and h.staff_member_id = p_staff_member_id
      and h.valid_from > p_on_date
  ) then
    raise exception 'later working plan exists' using errcode = '55000';
  end if;
  v_woche := app.plan_week(p_org, p_staff_member_id, p_on_date);
  return jsonb_build_object(
    'blocks', v_woche,
    'minutes', (select sum(app.working_day_minutes(v_woche -> t.tag::text))::integer
                from generate_series(1, 7) as t (tag))
  );
end;
$$;

revoke all on function app.working_time_baseline(uuid, uuid, text, date) from public, anon, authenticated;

-- Die neuen Zeiten in ihrer Form (geordnet, ganze Minuten) - einmalig ein
-- Tag, dauerhaft genau die Wochentage 1 bis 7.
create function app.working_time_normalize(p_kind text, p_blocks jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_woche jsonb := '{}'::jsonb;
  v_tag   integer;
begin
  if p_kind = 'once' then
    return app.working_day_blocks(p_blocks);
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_blocks) as k
                where k not in ('1', '2', '3', '4', '5', '6', '7')) then
    raise exception 'blocks must be a week' using errcode = '22023';
  end if;
  for v_tag in 1 .. 7 loop
    v_woche := v_woche || jsonb_build_object(
      v_tag::text, app.working_day_blocks(coalesce(p_blocks -> v_tag::text, '[]'::jsonb)));
  end loop;
  return v_woche;
end;
$$;

revoke all on function app.working_time_normalize(text, jsonb) from public, anon, authenticated;

-- Arbeitsminuten der neuen Zeiten: einmalig der Tag, dauerhaft die Woche.
create function app.working_time_minutes(p_kind text, p_blocks jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'once' then app.working_day_minutes(p_blocks)
         else (select sum(app.working_day_minutes(p_blocks -> t.tag::text))::integer
               from generate_series(1, 7) as t (tag)) end
$$;

revoke all on function app.working_time_minutes(text, jsonb) from public, anon, authenticated;

-- Ein Tag, wie er mit einem neuen Wochenplan ab `p_on_date` gälte:
-- Urlaub und Abwesenheit frei, eine Abweichung mit ihren Blöcken, sonst ab
-- dem Datum der neue Plan und davor der bisherige.
create function app.day_with_plan(
  p_org uuid, p_staff_member_id uuid, p_date date, p_on_date date, p_week jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tag jsonb := app.effective_day(p_org, p_staff_member_id, p_date);
begin
  if v_tag ->> 'kind' = 'plan' and p_date >= p_on_date then
    return coalesce(p_week -> extract(isodow from p_date)::text, '[]'::jsonb);
  end if;
  return coalesce(v_tag -> 'blocks', '[]'::jsonb);
end;
$$;

revoke all on function app.day_with_plan(uuid, uuid, date, date, jsonb) from public, anon, authenticated;

-- Was gegen die neuen Zeiten spricht (ANN-588): die Tage selbst, und die Ruhe
-- zu den Nachbartagen - einmalig zum Vortag und zum Folgetag, wie sie
-- gelten; dauerhaft zwischen den Wochentagen, am Wechsel vom bisherigen
-- Plan (Vortag des Datums) in den neuen und um jede Abweichung im ersten
-- Jahr, die stehen bleibt (Zweitreview B3). Erwartet normalisierte Zeiten.
create function app.working_time_problems(
  p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date, p_blocks jsonb
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_probleme text[] := '{}';
  v_tag      integer;
  v_ruhe     integer;
begin
  if p_kind = 'once' then
    v_probleme := app.working_day_problems(p_blocks);
    v_ruhe := least(
      app.rest_minutes(app.effective_day(p_org, p_staff_member_id, p_on_date - 1) -> 'blocks', p_blocks),
      app.rest_minutes(p_blocks, app.effective_day(p_org, p_staff_member_id, p_on_date + 1) -> 'blocks')
    );
  else
    for v_tag in 1 .. 7 loop
      v_probleme := v_probleme || app.working_day_problems(p_blocks -> v_tag::text);
      v_ruhe := least(v_ruhe, app.rest_minutes(p_blocks -> v_tag::text,
                                               p_blocks -> ((v_tag % 7) + 1)::text));
    end loop;
    v_ruhe := least(v_ruhe, app.rest_minutes(
      app.effective_day(p_org, p_staff_member_id, p_on_date - 1) -> 'blocks',
      p_blocks -> extract(isodow from p_on_date)::text));
    select least(v_ruhe, min(least(
             app.rest_minutes(
               app.day_with_plan(p_org, p_staff_member_id, e.tag - 1, p_on_date, p_blocks),
               app.day_with_plan(p_org, p_staff_member_id, e.tag, p_on_date, p_blocks)),
             app.rest_minutes(
               app.day_with_plan(p_org, p_staff_member_id, e.tag, p_on_date, p_blocks),
               app.day_with_plan(p_org, p_staff_member_id, e.tag + 1, p_on_date, p_blocks)))))
      into v_ruhe
    from (
      select distinct a.on_date as tag
      from public.staff_working_hour_exceptions a
      where a.organization_id = p_org and a.staff_member_id = p_staff_member_id
        and a.kind = 'block' and a.on_date between p_on_date and p_on_date + 366
    ) e;
  end if;
  if v_ruhe is not null and v_ruhe < 660 then
    v_probleme := array_append(v_probleme, 'rest_shorter_than_eleven_hours');
  end if;
  return array(select distinct p from unnest(v_probleme) as p order by p);
end;
$$;

revoke all on function app.working_time_problems(uuid, uuid, text, date, jsonb) from public, anon, authenticated;

-- Die bestaetigten Termine ausserhalb der neuen Zeiten, je Tag (Ortszeit der
-- Praxis) - einmalig am Tag, dauerhaft ab dem Datum ein Jahr lang an Tagen
-- ohne Abweichung (die behalten ihre Zeiten). Sie werden genannt, nie still
-- verschoben.
create function app.appointments_outside_working_time(
  p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date, p_blocks jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with termine as (
    select (a.starts_at at time zone o.time_zone)::date as tag,
           (a.starts_at at time zone o.time_zone)::time as von,
           case when (a.ends_at at time zone o.time_zone)::date > (a.starts_at at time zone o.time_zone)::date
                then time '24:00' else (a.ends_at at time zone o.time_zone)::time end as bis
    from public.appointments a
    join public.organizations o on o.id = a.organization_id
    where a.organization_id = p_org
      and a.staff_member_id = p_staff_member_id
      and a.status = 'confirmed'
      and a.starts_at >= (p_on_date::timestamp at time zone o.time_zone)
      and a.starts_at < ((case when p_kind = 'once' then p_on_date + 1 else p_on_date + 366 end)::timestamp
                         at time zone o.time_zone)
  ),
  betroffen as (
    select t.tag
    from termine t
    where t.bis > t.von
      and (p_kind = 'once' or not exists (
        select 1 from public.staff_working_hour_exceptions e
        where e.organization_id = p_org and e.staff_member_id = p_staff_member_id and e.on_date = t.tag))
      and not coalesce((
        select range_agg(app.timerange((b ->> 'von')::time, (b ->> 'bis')::time, '[)'))
        from jsonb_array_elements(
          case when p_kind = 'once' then p_blocks else p_blocks -> extract(isodow from t.tag)::text end
        ) as b
      ) @> app.timerange(t.von, t.bis, '[)'), false)
  )
  select coalesce(jsonb_agg(jsonb_build_object('on_date', x.tag, 'appointments', x.anzahl) order by x.tag),
                  '[]'::jsonb)
  from (select b.tag, count(*)::integer as anzahl from betroffen b group by b.tag) x
$$;

revoke all on function app.appointments_outside_working_time(uuid, uuid, text, date, jsonb)
  from public, anon, authenticated;

-- Das Datum eines Antrags: frueher als morgen geht nicht (nicht rueckwirkend,
-- ANN-588), spaeter als ein Jahr auch nicht.
create function app.assert_working_time_date(p_org uuid, p_kind text, p_on_date date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_heute date;
begin
  if p_kind is null or p_kind not in ('once', 'permanent') then
    raise exception 'kind must be once or permanent' using errcode = '22023';
  end if;
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = p_org;
  if p_on_date is null or p_on_date <= v_heute or p_on_date > v_heute + 400 then
    raise exception 'working time change date is invalid' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_working_time_date(uuid, text, date) from public, anon, authenticated;

-- Die Wirkung einer genehmigten Aenderung. Gesperrt wird die Person wie in
-- set_staff_working_hours und set_staff_working_hour_exception (NO KEY).
--   einmalig:  die Abweichung fuer den Tag ersetzt, was dort stand.
--   dauerhaft: die am Datum geltende Fassung endet am Vortag (eine, die erst
--              am Datum beginnen sollte, faellt weg), die neue beginnt am
--              Datum. Kommt danach schon eine spaetere, haelt es an (55000).
create function app.apply_working_time_change(p_org uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antrag record;
  v_tag    integer;
begin
  select r.staff_member_id, r.kind, r.on_date, r.blocks into v_antrag
  from public.staff_working_time_requests r
  where r.id = p_request_id and r.organization_id = p_org;

  perform 1 from public.staff_members sm where sm.id = v_antrag.staff_member_id for no key update;

  if v_antrag.kind = 'once' then
    if exists (
      select 1 from public.staff_leave_requests l
      where l.organization_id = p_org and l.staff_member_id = v_antrag.staff_member_id
        and l.kind = 'leave' and l.status = 'approved'
        and v_antrag.on_date between l.starts_on and l.ends_on
    ) then
      raise exception 'day is part of approved leave' using errcode = '55000';
    end if;
    delete from public.staff_working_hour_exceptions e
     where e.organization_id = p_org and e.staff_member_id = v_antrag.staff_member_id
       and e.on_date = v_antrag.on_date;
    insert into public.staff_working_hour_exceptions
      (organization_id, staff_member_id, on_date, kind, starts_at, ends_at, created_by,
       working_time_request_id)
    select p_org, v_antrag.staff_member_id, v_antrag.on_date, 'block',
           (b ->> 'von')::time, (b ->> 'bis')::time, auth.uid(), p_request_id
    from jsonb_array_elements(v_antrag.blocks) as b;
    return;
  end if;

  if exists (
    select 1 from public.staff_working_hours h
    where h.organization_id = p_org and h.staff_member_id = v_antrag.staff_member_id
      and h.valid_from > v_antrag.on_date
  ) then
    raise exception 'later working plan exists' using errcode = '55000';
  end if;
  delete from public.staff_working_hours h
   where h.organization_id = p_org and h.staff_member_id = v_antrag.staff_member_id
     and h.valid_from = v_antrag.on_date;
  update public.staff_working_hours h
     set valid_until = v_antrag.on_date - 1
   where h.organization_id = p_org and h.staff_member_id = v_antrag.staff_member_id
     and daterange(h.valid_from, h.valid_until, '[]') @> v_antrag.on_date;
  for v_tag in 1 .. 7 loop
    insert into public.staff_working_hours
      (organization_id, staff_member_id, weekday, starts_at, ends_at, created_by, valid_from)
    select p_org, v_antrag.staff_member_id, v_tag, (b ->> 'von')::time, (b ->> 'bis')::time,
           auth.uid(), v_antrag.on_date
    from jsonb_array_elements(v_antrag.blocks -> v_tag::text) as b;
  end loop;
end;
$$;

revoke all on function app.apply_working_time_change(uuid, uuid) from public, anon, authenticated;

-- Prueft eine Aenderung gegen das, was jetzt gilt: Reduktion, Gesetz. Beim
-- Beantragen ein Eingabefehler (22023), beim Genehmigen ein Zustand (55000),
-- denn der Plan kann sich inzwischen geaendert haben.
create function app.assert_working_time_change(
  p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date, p_blocks jsonb, p_errcode text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bisher   jsonb;
  v_minuten  integer;
  v_probleme text[];
begin
  v_bisher := app.working_time_baseline(p_org, p_staff_member_id, p_kind, p_on_date);
  if p_blocks = v_bisher -> 'blocks' then
    raise exception 'working time unchanged' using errcode = p_errcode;
  end if;
  v_minuten := app.working_time_minutes(p_kind, p_blocks);
  if v_minuten < (v_bisher ->> 'minutes')::integer then
    raise exception 'working time would be reduced' using errcode = p_errcode;
  end if;
  v_probleme := app.working_time_problems(p_org, p_staff_member_id, p_kind, p_on_date, p_blocks);
  if cardinality(v_probleme) > 0 then
    raise exception 'working time rule: %', array_to_string(v_probleme, ', ') using errcode = p_errcode;
  end if;
  return v_bisher || jsonb_build_object('new_minutes', v_minuten);
end;
$$;

revoke all on function app.assert_working_time_change(uuid, uuid, text, date, jsonb, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Vorschau, beantragen, zurueckziehen, entscheiden
-- -----------------------------------------------------------------------------
-- Was gilt und was eine Aenderung ergaebe - ohne zu schreiben. Ohne Zeiten
-- nur das Bisherige (zum Vorbelegen), mit Zeiten dazu Minuten, Gegengruende
-- und Termine ausserhalb.
create function public.preview_working_time_change(p_kind text, p_on_date date, p_blocks jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_bisher  jsonb;
  v_neu     jsonb;
  v_minuten integer;
begin
  v_org := app.staff_request_org(app.can_request_working_time(), 'not allowed to request working time');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = '22023';
  end if;
  perform app.assert_working_time_date(v_org, p_kind, p_on_date);
  v_bisher := app.working_time_baseline(v_org, v_staff, p_kind, p_on_date);
  if p_blocks is null then
    return jsonb_build_object(
      'previous', v_bisher -> 'blocks',
      'previous_minutes', (v_bisher ->> 'minutes')::integer,
      'self_entered', app.has_any_role('owner')
    );
  end if;
  v_neu := app.working_time_normalize(p_kind, p_blocks);
  v_minuten := app.working_time_minutes(p_kind, v_neu);
  return jsonb_build_object(
    'previous', v_bisher -> 'blocks',
    'previous_minutes', (v_bisher ->> 'minutes')::integer,
    'new_minutes', v_minuten,
    'unchanged', v_neu = v_bisher -> 'blocks',
    'reduced', v_minuten < (v_bisher ->> 'minutes')::integer,
    'problems', to_jsonb(app.working_time_problems(v_org, v_staff, p_kind, p_on_date, v_neu)),
    'appointment_days', app.appointments_outside_working_time(v_org, v_staff, p_kind, p_on_date, v_neu),
    'self_entered', app.has_any_role('owner')
  );
end;
$$;

revoke all on function public.preview_working_time_change(text, date, jsonb) from public, anon;
grant execute on function public.preview_working_time_change(text, date, jsonb) to authenticated;

comment on function public.preview_working_time_change(text, date, jsonb) is
  'AZ-001: was fuer die eigene Person bisher gilt (einmalig der Tag, dauerhaft der Wochenplan am Datum) und, mit neuen Zeiten, Arbeitszeit bisher und neu, was nach ArbZG dagegen spricht und welche Termine ausserhalb laegen. Schreibt nichts.';

create function public.request_working_time_change(
  p_kind text, p_on_date date, p_blocks jsonb, p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_neu     jsonb;
  v_pruef   jsonb;
  v_text    text := nullif(btrim(coalesce(p_message, '')), '');
  v_selbst  boolean;
  v_id      uuid;
begin
  v_org := app.staff_request_org(app.can_request_working_time(), 'not allowed to request working time');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = '22023';
  end if;
  perform app.assert_working_time_date(v_org, p_kind, p_on_date);
  if v_text is not null and length(v_text) > 500 then
    raise exception 'message is too long' using errcode = '22023';
  end if;
  v_neu := app.working_time_normalize(p_kind, p_blocks);

  -- Gesperrt wird die Person, damit zwei gleichzeitige Antraege und eine
  -- gleichzeitige Pflege nicht gegeneinander laufen.
  perform 1 from public.staff_members sm where sm.id = v_staff for no key update;
  if exists (
    select 1 from public.staff_working_time_requests r
    where r.organization_id = v_org and r.staff_member_id = v_staff and r.status = 'requested'
      and r.kind = p_kind and (p_kind = 'permanent' or r.on_date = p_on_date)
  ) then
    raise exception 'working time request already open' using errcode = '55000';
  end if;
  v_pruef := app.assert_working_time_change(v_org, v_staff, p_kind, p_on_date, v_neu, '22023');

  -- Die eigene Aenderung traegt owner selbst ein (ANN-590).
  v_selbst := app.has_any_role('owner');

  insert into public.staff_working_time_requests (
    organization_id, staff_member_id, kind, on_date, blocks, previous_blocks, previous_minutes,
    new_minutes, message, status, requested_by, decided_by, decided_at, self_entered
  )
  values (
    v_org, v_staff, p_kind, p_on_date, v_neu, v_pruef -> 'blocks', (v_pruef ->> 'minutes')::integer,
    (v_pruef ->> 'new_minutes')::integer, v_text,
    case when v_selbst then 'approved' else 'requested' end, auth.uid(),
    case when v_selbst then auth.uid() end, case when v_selbst then now() end, v_selbst
  )
  returning id into v_id;

  if v_selbst then
    perform app.apply_working_time_change(v_org, v_id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.request_working_time_change(text, date, jsonb, text) from public, anon;
grant execute on function public.request_working_time_change(text, date, jsonb, text) to authenticated;

comment on function public.request_working_time_change(text, date, jsonb, text) is
  'AZ-001 (ANN-588, ANN-590): Aenderung der eigenen Arbeitszeit beantragen - einmalig ein Tag oder dauerhaft der Wochenplan ab einem Datum, frühestens morgen; nie weniger Stunden, nach ArbZG zulaessig. owner traegt die eigene direkt ein. Kein Auditeintrag (ADR-010 Punkt 15).';

create function public.withdraw_working_time_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  v_org := app.staff_request_org(app.can_request_working_time(), 'not allowed to request working time');
  v_staff := app.own_staff_member(v_org);
  update public.staff_working_time_requests r
     set status = 'withdrawn', withdrawn_at = now()
   where r.id = p_request_id
     and r.organization_id = v_org
     and r.staff_member_id = v_staff
     and r.status = 'requested';
  if not found then
    raise exception 'working time request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.withdraw_working_time_request(uuid) from public, anon;
grant execute on function public.withdraw_working_time_request(uuid) to authenticated;

comment on function public.withdraw_working_time_request(uuid) is
  'AZ-001: den eigenen offenen Antrag zurueckziehen. Fremde, entschiedene und unbekannte Antraege sind nicht zu unterscheiden.';

create function public.decide_working_time_request(p_request_id uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_antrag record;
  v_text   text := nullif(btrim(coalesce(p_note, '')), '');
  v_heute  date;
begin
  v_org := app.staff_request_org(app.can_decide_staff_requests(), 'not allowed to decide requests');
  if p_approve is null then
    raise exception 'decision is required' using errcode = '22023';
  end if;
  if v_text is not null and length(v_text) > 500 then
    raise exception 'note is too long' using errcode = '22023';
  end if;
  if not p_approve and v_text is null then
    raise exception 'rejection needs a reason' using errcode = '22023';
  end if;

  select r.* into v_antrag
  from public.staff_working_time_requests r
  where r.id = p_request_id and r.organization_id = v_org and r.status = 'requested'
  for update;
  if not found then
    raise exception 'working time request not found' using errcode = 'P0002';
  end if;
  -- Wer selbst beantragt, entscheidet nicht ueber den eigenen Antrag.
  if v_antrag.staff_member_id = app.own_staff_member(v_org) or v_antrag.requested_by = auth.uid() then
    raise exception 'not allowed to decide own request' using errcode = '42501';
  end if;

  if not p_approve then
    update public.staff_working_time_requests
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = v_text
     where id = v_antrag.id;
    return jsonb_build_object('status', 'rejected', 'appointment_days', '[]'::jsonb);
  end if;

  -- Rueckwirkend wird nichts: Ist das Datum erreicht, bleibt nur Ablehnen.
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;
  if v_antrag.on_date <= v_heute then
    raise exception 'working time change date passed' using errcode = '55000';
  end if;
  -- Gegen das, was jetzt gilt - der Plan kann sich seit dem Antrag geaendert
  -- haben (Pflege, ein anderer Antrag, Urlaub).
  perform 1 from public.staff_members sm where sm.id = v_antrag.staff_member_id for no key update;
  -- Der Antrag trägt den ganzen Tag bzw. die ganze Woche. Hat sich das
  -- Bisherige seither geändert - Pflege, ein anderer Antrag, eine
  -- Abweichung -, schriebe Genehmigen das still zurück (Zweitreview B1).
  if (app.working_time_baseline(v_org, v_antrag.staff_member_id, v_antrag.kind, v_antrag.on_date)
        -> 'blocks') is distinct from v_antrag.previous_blocks then
    raise exception 'working plan changed since request' using errcode = '55000';
  end if;
  perform app.assert_working_time_change(
    v_org, v_antrag.staff_member_id, v_antrag.kind, v_antrag.on_date, v_antrag.blocks, '55000');

  update public.staff_working_time_requests
     set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = v_text
   where id = v_antrag.id;
  perform app.apply_working_time_change(v_org, v_antrag.id);
  return jsonb_build_object(
    'status', 'approved',
    'appointment_days', app.appointments_outside_working_time(
      v_org, v_antrag.staff_member_id, v_antrag.kind, v_antrag.on_date, v_antrag.blocks)
  );
end;
$$;

revoke all on function public.decide_working_time_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_working_time_request(uuid, boolean, text) to authenticated;

comment on function public.decide_working_time_request(uuid, boolean, text) is
  'AZ-001 (ANN-590): owner entscheidet einen offenen Antrag, nie den eigenen. Ablehnen nur mit Grund; genehmigt nur vor dem Datum und nur, wenn die Aenderung gegen den jetzigen Plan weiter zulaessig ist. Antwort: Zustand und die Tage mit Terminen ausserhalb der neuen Zeiten (zum Umplanen).';

-- -----------------------------------------------------------------------------
-- 9. Lesen: Arbeitszeit in einem Aufruf
-- -----------------------------------------------------------------------------
create function public.list_working_time()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_entsch  boolean;
  v_heute   date;
  v_naechst date;
begin
  v_org := app.staff_request_org(app.can_request_working_time(), 'not allowed to read working time');
  v_staff := app.own_staff_member(v_org);
  v_entsch := app.can_decide_staff_requests();
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;
  select min(h.valid_from) into v_naechst
  from public.staff_working_hours h
  where h.organization_id = v_org and h.staff_member_id = v_staff and h.valid_from > v_heute;

  return jsonb_build_object(
    'my_staff_member_id', v_staff,
    'can_decide', v_entsch,
    'self_entered', app.has_any_role('owner'),
    'today', v_heute,
    -- Der eigene Plan: was heute gilt und, wenn schon genehmigt, ab wann ein
    -- neuer gilt. Auch fuer die Trainingsbetreuung, die die Tabelle nicht liest.
    'plan', case when v_staff is null then null else jsonb_build_object(
      'has_plan', exists (
        select 1 from public.staff_working_hours h
        where h.organization_id = v_org and h.staff_member_id = v_staff
          and (h.valid_until is null or h.valid_until >= v_heute)),
      'current', app.plan_week(v_org, v_staff, v_heute),
      'next_from', v_naechst,
      'next', case when v_naechst is null then null else app.plan_week(v_org, v_staff, v_naechst) end
    ) end,
    -- Eigene Antraege mit allem, auch dem Grund und der Entscheidung.
    'own', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'on_date', r.on_date,
               'blocks', r.blocks, 'previous_blocks', r.previous_blocks,
               'previous_minutes', r.previous_minutes, 'new_minutes', r.new_minutes,
               'message', r.message, 'status', r.status, 'requested_at', r.requested_at,
               'decided_at', r.decided_at, 'decided_by_name', app.account_display_name(r.decided_by),
               'decision_note', r.decision_note, 'self_entered', r.self_entered
             ) order by r.requested_at desc)
      from public.staff_working_time_requests r
      where r.organization_id = v_org and r.staff_member_id = v_staff
        and (r.status = 'requested' or r.on_date >= v_heute or r.decided_at >= now() - interval '30 days'
             or r.withdrawn_at >= now() - interval '30 days')
    ), '[]'::jsonb),
    -- Fuer owner: offene Antraege anderer mit bisher und neu, Grund und den
    -- Tagen mit Terminen ausserhalb der neuen Zeiten.
    'to_decide', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'on_date', r.on_date,
               'staff_member_id', r.staff_member_id,
               'name', app.staff_display_name(r.staff_member_id),
               'blocks', r.blocks, 'previous_blocks', r.previous_blocks,
               'previous_minutes', r.previous_minutes, 'new_minutes', r.new_minutes,
               'message', r.message, 'requested_at', r.requested_at,
               'appointment_days', app.appointments_outside_working_time(
                 v_org, r.staff_member_id, r.kind, r.on_date, r.blocks)
             ) order by r.requested_at)
      from public.staff_working_time_requests r
      where r.organization_id = v_org and r.status = 'requested'
        and r.staff_member_id is distinct from v_staff
    ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.list_working_time() from public, anon;
grant execute on function public.list_working_time() to authenticated;

comment on function public.list_working_time() is
  'AZ-001: Arbeitszeit in einem Aufruf - der eigene Plan (heute und ein schon genehmigter kuenftiger), eigene Antraege ganz; fuer owner die offenen Antraege anderer mit bisher, neu, Grund und Terminen ausserhalb. Keine Auswertung ueber Personen (PROJECT_PRINCIPLES.md 20).';

-- -----------------------------------------------------------------------------
-- 10. Pflege in der Planung: die heute gueltige Fassung (ANN-589)
-- -----------------------------------------------------------------------------
-- Stand LOG-001b, dazu zwei Dinge: Geaendert wird der Wochentag der Fassung,
-- die heute gilt - eine kuenftige aus einem genehmigten Antrag bleibt, wie sie
-- ist. Gilt heute keine, fuellt der neue Tag die Luecke zwischen der letzten
-- frueheren und der naechsten spaeteren. Und die Person wird gesperrt wie
-- beim Genehmigen, damit Pflege und Genehmigung nicht gegeneinander laufen.
CREATE OR REPLACE FUNCTION public.set_staff_working_hours(p_staff_member_id uuid, p_weekday smallint, p_blocks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_tz       text;
  v_heute    date;
  v_ab       date;
  v_bis      date;
  v_alt      jsonb;
  v_neu      jsonb;
  v_alt_ids  uuid[];
  v_neu_ids  uuid[];
  v_aktion   text;
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

  -- Arbeitszeiten sind Ortszeiten. Ohne hinterlegte Praxiszeitzone waeren sie
  -- nicht auswertbar; dieselbe Vorbedingung gilt an allen Schreibpfaden mit
  -- Zeitbezug (CAL-001).
  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
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

  -- AZ-001: dieselbe Sperre wie app.apply_working_time_change.
  perform 1 from public.staff_members sm where sm.id = p_staff_member_id for no key update;

  -- Die heute gueltige Fassung und ihre Grenzen (ANN-589).
  v_heute := (now() at time zone v_tz)::date;
  select h.valid_from, h.valid_until into v_ab, v_bis
  from public.staff_working_hours h
  where h.staff_member_id = p_staff_member_id
    and h.organization_id = v_org
    and daterange(h.valid_from, h.valid_until, '[]') @> v_heute
  limit 1;
  if not found then
    select max(h.valid_until) + 1 into v_ab
    from public.staff_working_hours h
    where h.staff_member_id = p_staff_member_id and h.organization_id = v_org
      and h.valid_until < v_heute;
    select min(h.valid_from) - 1 into v_bis
    from public.staff_working_hours h
    where h.staff_member_id = p_staff_member_id and h.organization_id = v_org
      and h.valid_from > v_heute;
  end if;

  -- Bestehender Stand, normalisiert und sortiert - Grundlage fuer die
  -- No-op-Erkennung und fuer die Art des Vorgangs.
  select coalesce(
           jsonb_agg(jsonb_build_array(h.starts_at::text, h.ends_at::text) order by h.starts_at),
           '[]'::jsonb
         ),
         coalesce(array_agg(h.id order by h.starts_at), '{}'::uuid[])
    into v_alt, v_alt_ids
  from public.staff_working_hours h
  where h.staff_member_id = p_staff_member_id
    and h.organization_id = v_org
    and h.weekday = p_weekday
    and daterange(h.valid_from, h.valid_until, '[]') @> v_heute;

  begin
    select coalesce(
             jsonb_agg(jsonb_build_array(w.von::text, w.bis::text) order by w.von),
             '[]'::jsonb
           )
      into v_neu
    from (
      select (b ->> 'von')::time as von, (b ->> 'bis')::time as bis
      from jsonb_array_elements(p_blocks) as b
    ) w;
  exception
    -- Unbrauchbare Zeitangaben im Array sind ein Eingabefehler, kein interner
    -- Fehler. Bewusst nur diese Faelle - ein `when others` wuerde echte
    -- Stoerungen verschlucken.
    when invalid_datetime_format or datetime_field_overflow
         or invalid_text_representation then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang: weder
  -- Schreibzugriff noch Auditeintrag.
  if v_alt = v_neu then
    return jsonb_array_length(v_alt);
  end if;

  delete from public.staff_working_hours
   where staff_member_id = p_staff_member_id
     and organization_id = v_org
     and weekday = p_weekday
     and daterange(valid_from, valid_until, '[]') @> v_heute;

  begin
    with eingefuegt as (
      insert into public.staff_working_hours (
        organization_id, staff_member_id, weekday, starts_at, ends_at, created_by,
        valid_from, valid_until
      )
      select v_org, p_staff_member_id, p_weekday,
             (b ->> 'von')::time, (b ->> 'bis')::time, v_actor, v_ab, v_bis
      from jsonb_array_elements(p_blocks) as b
      returning id
    )
    select coalesce(array_agg(id), '{}'::uuid[]) into v_neu_ids from eingefuegt;
  exception
    when exclusion_violation then
      raise exception 'working hours overlap' using errcode = '23P01';
    when check_violation or not_null_violation
         or invalid_datetime_format or datetime_field_overflow then
      raise exception 'working hour block is invalid' using errcode = '22023';
  end;

  v_aktion := app.working_hour_action(
    jsonb_array_length(v_alt), jsonb_array_length(v_neu)
  );


  return jsonb_array_length(v_neu);
end;
$function$;

comment on function public.set_staff_working_hours(uuid, smallint, jsonb) is
  'Ersetzt einen Wochentag der heute gueltigen Fassung des Wochenplans (CAL-005, AZ-001 ANN-589). Eine kuenftige Fassung aus einem genehmigten Antrag bleibt unberuehrt. Ein leeres Array loescht den Tag.';

-- -----------------------------------------------------------------------------
-- 11. Loeschlauf (ADR-008, ANN-591)
-- -----------------------------------------------------------------------------
create function app.delete_due_working_time_requests(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Genehmigt: drei Jahre ab Ende des Kalenderjahres, in dem die Aenderung wirkt.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             make_date(extract(year from r.on_date)::integer, 12, 31),
             app.retention_interval('arbeitszeit'),
             p_time_zone
           ) as due_at
    from public.staff_working_time_requests r
    where r.organization_id = p_org and r.status = 'approved'
  ),
  geloescht as (
    delete from public.staff_working_time_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_working_time_requests', g.id, 'arbeitszeit', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Abgelehnt und zurueckgezogen: ein Jahr nach ihrem Ende.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             (coalesce(r.decided_at, r.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('arbeitszeit_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_working_time_requests r
    where r.organization_id = p_org and r.status in ('rejected', 'withdrawn')
  ),
  geloescht as (
    delete from public.staff_working_time_requests r
    using faellig f
    where r.id = f.id and f.due_at <= now()
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_working_time_requests', g.id, 'arbeitszeit_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_working_time_requests(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_working_time_requests(uuid, text, uuid) is
  'AZ-001 (ANN-591): loescht faellige Antraege auf Aenderung der Arbeitszeit mit Eintrag im Loeschjournal. Aufgerufen aus public.apply_retention().';

-- Der Lauf ruft die Arbeitszeitaenderungen mit auf - sonst unveraendert (Stand URL-001).
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
  v_urlaub integer;
  v_arbeitszeit integer;
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
    -- URL-001 (ANN-579): Urlaub - genehmigte und stornierte Antraege und
    -- Ansprueche drei Jahre ab Ende des Urlaubsjahres, abgelehnte und
    -- zurueckgezogene ein Jahr nach ihrem Ende; offene nie. Ohne
    -- Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_urlaub := app.delete_due_staff_leave(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- AZ-001 (ANN-591): Arbeitszeitaenderungen - genehmigte drei Jahre ab
    -- Ende des Jahres ihrer Wirkung, abgelehnte und zurueckgezogene ein Jahr
    -- nach ihrem Ende; offene nie. Ohne Patientenbezug, ohne Legal Hold.
    -- -------------------------------------------------------------------
    v_arbeitszeit := app.delete_due_working_time_requests(v_org.id, v_org.time_zone, v_run);

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
                + v_radflotte + v_urlaub + v_arbeitszeit;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub + v_arbeitszeit > 0
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
          'urlaub', v_urlaub,
          'arbeitszeit', v_arbeitszeit,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore werden Arbeitszeitaenderungen wie alle anderen erneut
-- geloescht.
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
    -- vor den Pannen (eine Sperre zeigt auf ihre Panne, set null); einzeln
    -- geloeschte Fotos vor Check-Up und Panne, deren Stellen und uebrige
    -- Fotos mit ihnen fallen (cascade); das ausgemusterte Rad zuletzt.
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_photos',
    'fleet_checkups',
    'fleet_breakdowns',
    'fleet_bikes',
    -- URL-001: Storno und Abwesenheiten in den Arbeitszeiten fallen mit ihrem
    -- Urlaub (cascade).
    'staff_leave_requests',
    'staff_leave_entitlements',
    -- AZ-001: Arbeitszeitaenderungen haengen an keiner anderen Zeile.
    'staff_working_time_requests',
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
