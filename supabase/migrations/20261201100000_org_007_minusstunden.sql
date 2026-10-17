-- =============================================================================
-- ORG-007: Minusstunden ziehen nur ab (ANN-606)
--
-- In der Oberfläche heißt die Korrektur des Zeitkontos jetzt „Minusstunden“,
-- Mehrarbeit „Überstunden“; die Kennungen `correction` und `overtime` bleiben.
-- Minusstunden buchen nur noch Minuten unter null: Zeit, die dazukommt, steht
-- als Überstunden mit Datum, Beginn und Ende im Konto, weil die Aufzeichnung
-- die Lage braucht (ANN-593).
--
-- Ersetzt wird nur die Prüfung `app.time_account_check` - Vorschau und
-- Eintragen rufen beide sie, der Grund heißt weiter `correction_invalid`.
-- Signatur und Rechte bleiben. Bestehende Einträge bleiben, wie sie sind:
-- Eine frühere Korrektur mit Plus zählt weiter im Saldo, die Tabelle lässt
-- sie zu (Prüfregel unverändert).
-- =============================================================================

-- Was gegen einen Eintrag spricht und was er bewirkt (ANN-593, ANN-595,
-- ANN-606) - wie in `20261126100000_zk_001_zeitkonto.sql`, nur:
--   correction_invalid    Minusstunden mit Minuten unter null (höchstens 1000
--                         Stunden) und - beim Eintragen - mit Grund
create or replace function app.time_account_check(
  p_org uuid, p_staff_member_id uuid, p_kind text, p_on_date date,
  p_starts_at time, p_ends_at time, p_minutes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_heute    date;
  v_tag      jsonb;
  v_plan     app.timemultirange;
  v_bereich  app.timerange;
  v_innen    app.timemultirange;
  v_probleme text[] := '{}';
  v_minuten  integer;
  v_rest     jsonb := '[]'::jsonb;
  v_termine  integer := 0;
begin
  if p_kind is null or p_kind not in ('overtime', 'time_off', 'correction') then
    raise exception 'kind must be overtime, time_off or correction' using errcode = '22023';
  end if;
  if p_on_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = p_org;

  -- Außerhalb des Fensters gibt es keinen Tag (Zweitreview B1): Sonst ließe
  -- sich über die Vorschau jedes Datum einer Person abfragen.
  if (p_kind = 'overtime' and (p_on_date < v_heute - 31 or p_on_date > v_heute))
     or (p_kind = 'time_off' and (p_on_date < v_heute - 31 or p_on_date > v_heute + 365))
     or (p_kind = 'correction' and (p_on_date < v_heute - 366 or p_on_date > v_heute)) then
    return jsonb_build_object('day', null, 'minutes', null, 'problems', jsonb_build_array('date_out_of_range'),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  -- Minusstunden ohne Lage und ohne Tag; ihren Grund verlangt das Eintragen.
  if p_kind = 'correction' then
    if p_minutes is not null then
      -- Nur abziehen (ANN-606): Plus-Zeit geht als Überstunden mit Lage.
      if p_minutes not between -60000 and -1 then
        v_probleme := array_append(v_probleme, 'correction_invalid');
      else
        v_minuten := p_minutes;
      end if;
    end if;
    return jsonb_build_object('day', null, 'minutes', v_minuten, 'problems', to_jsonb(v_probleme),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  v_tag := app.effective_day(p_org, p_staff_member_id, p_on_date);

  select range_agg(app.timerange((b ->> 'von')::time, (b ->> 'bis')::time, '[)'))
    into v_plan
  from jsonb_array_elements(coalesce(v_tag -> 'blocks', '[]'::jsonb)) as b;

  if p_kind = 'time_off' then
    if v_tag ->> 'kind' = 'leave' then
      v_probleme := array_append(v_probleme, 'leave');
    elsif v_tag ->> 'kind' = 'unavailable' then
      v_probleme := array_append(v_probleme, 'absent');
    elsif v_tag ->> 'kind' = 'exception' then
      v_probleme := array_append(v_probleme, 'changed_day');
    elsif v_plan is null then
      v_probleme := array_append(v_probleme, 'no_working_time');
    end if;
  end if;

  -- Ohne Zeiten: nur der Tag.
  if p_starts_at is null and p_ends_at is null then
    return jsonb_build_object('day', v_tag, 'minutes', null, 'problems', to_jsonb(v_probleme),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at
     or date_trunc('minute', p_starts_at::interval) <> p_starts_at::interval
     or date_trunc('minute', p_ends_at::interval) <> p_ends_at::interval then
    v_probleme := array_append(v_probleme, 'times_invalid');
    return jsonb_build_object('day', v_tag, 'minutes', null, 'problems', to_jsonb(v_probleme),
                              'remaining', v_rest, 'appointments', v_termine);
  end if;

  v_bereich := app.timerange(p_starts_at, p_ends_at, '[)');

  if p_kind = 'overtime' then
    -- Mehrarbeit liegt außerhalb der Arbeitszeit des Tages, sonst zählte sie
    -- doppelt; an einem freien Tag zählt sie ganz.
    if v_plan is not null and v_plan && v_bereich then
      v_probleme := array_append(v_probleme, 'overlaps_working_hours');
    end if;
    v_minuten := (extract(epoch from (p_ends_at - p_starts_at)) / 60)::integer;
  elsif v_plan is not null and v_tag ->> 'kind' = 'plan' then
    -- Freizeitausgleich: innerhalb der Spanne des Tages, gezählt wird die
    -- Arbeitszeit darin (eine Pause zählt nicht). Es bleiben die übrigen Blöcke.
    v_innen := v_plan * app.timemultirange(v_bereich);
    if isempty(v_innen) or not (app.timerange(lower(v_plan), upper(v_plan), '[)') @> v_bereich) then
      v_probleme := array_append(v_probleme, 'outside_working_hours');
    else
      select -sum(extract(epoch from (upper(r) - lower(r))) / 60)::integer
        into v_minuten
      from unnest(v_innen) as r;
      select coalesce(jsonb_agg(jsonb_build_object('von', to_char(lower(r), 'HH24:MI'),
                                                   'bis', to_char(upper(r), 'HH24:MI'))
                                order by lower(r)), '[]'::jsonb)
        into v_rest
      from unnest(v_plan - app.timemultirange(v_bereich)) as r;
    end if;
    -- Die bestätigten Termine in der freien Zeit - genannt, nie verschoben.
    select count(*)::integer into v_termine
    from public.appointments a
    join public.organizations o on o.id = a.organization_id
    where a.organization_id = p_org
      and a.staff_member_id = p_staff_member_id
      and a.status = 'confirmed'
      and a.starts_at < ((p_on_date + p_ends_at)::timestamp at time zone o.time_zone)
      and a.ends_at > ((p_on_date + p_starts_at)::timestamp at time zone o.time_zone);
  end if;

  if exists (
    select 1 from public.staff_time_account_entries e
    where e.organization_id = p_org and e.staff_member_id = p_staff_member_id
      and e.on_date = p_on_date and e.status = 'valid' and e.kind in ('overtime', 'time_off')
      and app.timerange(e.starts_at, e.ends_at, '[)') && v_bereich
  ) then
    v_probleme := array_append(v_probleme, 'overlaps_entry');
  end if;

  return jsonb_build_object('day', v_tag, 'minutes', v_minuten, 'problems', to_jsonb(v_probleme),
                            'remaining', v_rest, 'appointments', v_termine);
end;
$$;

revoke all on function app.time_account_check(uuid, uuid, text, date, time, time, integer)
  from public, anon, authenticated;
