-- Verlauf für die Beratung (ADR-027 Punkte 4, 11, 13; ANN-846): keine neue Tabelle, kein neues
-- Feld - gelesen wird, was Tagebuch, Gewicht, Termine und Pläne schon tragen. Mittel ohne Wertung,
-- kein Trend und kein Vergleich zwischen Personen.

-- Mittel je Tag über einen Zeitraum: Energie und Nährstoffe über die Tage mit mindestens einem
-- Eintrag, Wasser über die Tage mit Wasser; ein Tag ohne Eintrag zählt nicht als null (ANN-846).
create function app.nutrition_course_span(p_profile_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with essen as (
    select e.eaten_on as tag,
           sum(e.energy_kcal * e.amount / 100) as kcal,
           sum(e.protein_g * e.amount / 100) as eiweiss,
           sum(e.fat_g * e.amount / 100) as fett,
           sum(e.carbohydrate_g * e.amount / 100) as kohlenhydrate
    from public.nutrition_diary_entries e
    where e.profile_id = p_profile_id and e.eaten_on between p_from and p_to
    group by e.eaten_on
  ), wasser as (
    select w.water_ml
    from public.nutrition_water_days w
    where w.profile_id = p_profile_id and w.drunk_on between p_from and p_to and w.water_ml > 0
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', greatest(p_to - p_from + 1, 0),
    'food_days', (select count(*) from essen),
    'water_days', (select count(*) from wasser),
    'energy_kcal', (select round(avg(kcal)) from essen),
    'protein_g', (select round(avg(eiweiss), 1) from essen),
    'fat_g', (select round(avg(fett), 1) from essen),
    'carbohydrate_g', (select round(avg(kohlenhydrate), 1) from essen),
    'water_ml', (select round(avg(water_ml)) from wasser))
$$;

revoke all on function app.nutrition_course_span(uuid, date, date) from public, anon, authenticated, service_role;

comment on function app.nutrition_course_span(uuid, date, date) is
  'ERN-021 (ANN-846): Mittel je Tag eines Ernährungstagebuchs zwischen p_from und p_to - Energie und Nährstoffe über die Tage mit Eintrag, Wasser über die Tage mit Wasser, dazu die Zahl der Tage. Ohne Rechteprüfung und ohne eigene Rechte (kein SECURITY DEFINER); nur aus public.get_nutrition_course.';

create function public.get_nutrition_course(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := auth.uid();
  v_org      uuid;
  v_profil   public.nutrition_profiles%rowtype;
  v_zone     text;
  v_heute    date;
  v_bis      date;
  v_letzte   date;
  v_naechste date;
  v_von      date;
  v_ziele    jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not app.can_counsel_nutrition() then
    perform app.record_denied_read(v_actor, 'nutrition.read', 'not allowed to read nutrition courses');
    return null;
  end if;
  v_org := app.current_organization_id();
  select * into v_profil from public.nutrition_profiles p
  where p.id = p_profile_id and p.organization_id = v_org;
  if v_profil.id is null then
    return null;
  end if;

  -- Lesen zählt als Öffnen des Verhältnisses (ADR-027 Punkt 4), wie der Reiter.
  perform app.log_record_access(
    v_org, v_actor,
    case v_profil.relationship_kind when 'treatment' then 'patient_record.viewed'
                                    else 'training_relationship.viewed' end,
    case v_profil.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_profil.relationship_id, 'user', jsonb_build_object('surface', 'web', 'view', 'nutrition'));

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  v_heute := app.training_today(v_org);
  v_bis := greatest(least(coalesce(v_profil.ended_on, v_heute), v_heute), v_profil.started_on);
  v_ziele := app.nutrition_profile_targets(v_profil.id);

  -- Die letzte stattgefundene Sitzung vor dem Endtag; der Zeitraum beginnt am Tag danach,
  -- ohne Sitzung mit der Beratung (ANN-846).
  select max((a.starts_at at time zone v_zone)::date) into v_letzte
  from public.appointments a
  where a.organization_id = v_org and a.occasion = 'nutrition_counselling'
    and a.status in ('completed', 'documented', 'invoiced')
    and (a.patient_id = v_profil.patient_id
         or a.training_relationship_id = v_profil.training_relationship_id)
    and (a.starts_at at time zone v_zone)::date between v_profil.started_on and v_bis - 1;
  v_von := coalesce(v_letzte + 1, v_profil.started_on);

  if v_profil.ended_on is null then
    select min((a.starts_at at time zone v_zone)::date) into v_naechste
    from public.appointments a
    where a.organization_id = v_org and a.occasion = 'nutrition_counselling'
      and a.status = 'confirmed' and a.starts_at > now()
      and (a.patient_id = v_profil.patient_id
           or a.training_relationship_id = v_profil.training_relationship_id);
  end if;

  return jsonb_build_object(
    'today', v_heute,
    'started_on', v_profil.started_on,
    'ended_on', v_profil.ended_on,
    'last_session_on', v_letzte,
    'next_session_on', v_naechste,
    'target_weight_kg', v_profil.target_weight_kg,
    'targets', case when v_ziele ->> 'status' = 'ok' then jsonb_build_object(
      'energy_kcal', v_ziele -> 'energy' -> 'kcal',
      'protein_g', v_ziele -> 'protein' -> 'g',
      'fat_g', v_ziele -> 'fat' -> 'g',
      'carbohydrate_g', v_ziele -> 'carbohydrate' -> 'g',
      'water_ml', v_ziele -> 'water' -> 'ml') end,
    'period', app.nutrition_course_span(v_profil.id, v_von, v_bis),
    -- Höchstens zwölf Kalenderwochen ab Montag, die jüngste zuerst, je auf die Beratung begrenzt.
    'weeks', (
      select jsonb_agg(
               jsonb_build_object('week_start', w.wk::date)
               || app.nutrition_course_span(v_profil.id, greatest(w.wk::date, v_profil.started_on),
                                            least(w.wk::date + 6, v_bis))
               order by w.wk desc)
      from generate_series(
             greatest(date_trunc('week', v_bis)::date - 77, date_trunc('week', v_profil.started_on)::date),
             date_trunc('week', v_bis)::date, interval '7 days') w(wk)
    ),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('measured_on', g.measured_on, 'weight_kg', g.weight_kg)
                       order by g.measured_on)
      from public.nutrition_weight_entries g
      where g.profile_id = v_profil.id
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(distinct (a.starts_at at time zone v_zone)::date
                       order by (a.starts_at at time zone v_zone)::date)
      from public.appointments a
      where a.organization_id = v_org and a.occasion = 'nutrition_counselling'
        and a.status in ('completed', 'documented', 'invoiced')
        and (a.patient_id = v_profil.patient_id
             or a.training_relationship_id = v_profil.training_relationship_id)
        and (a.starts_at at time zone v_zone)::date between v_profil.started_on and v_bis
    ), '[]'::jsonb),
    -- Planwechsel: begonnen und beendet; ein vor seinem Beginn abgelöster Plan galt nie (ANN-845).
    'plan_events', coalesce((
      select jsonb_agg(jsonb_build_object('occurred_on', x.tag, 'kind', x.art, 'title', x.titel)
                       order by x.tag, x.art)
      from (
        select p.starts_on as tag, 'plan_assigned' as art, p.title as titel
        from public.nutrition_plans p
        where p.profile_id = v_profil.id and p.starts_on <= v_bis
          and (p.ended_on is null or p.ended_on >= p.starts_on)
        union all
        select p.ended_on, 'plan_ended', p.title
        from public.nutrition_plans p
        where p.profile_id = v_profil.id and p.ended_on is not null
          and p.ended_on >= p.starts_on and p.ended_on <= v_bis
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_nutrition_course(uuid) from public, anon;
grant execute on function public.get_nutrition_course(uuid) to authenticated;

comment on function public.get_nutrition_course(uuid) is
  'ERN-021 bis ERN-023 (ADR-027 Punkte 4, 11, 13; ANN-846): der Verlauf einer Ernährungsberatung - Mittel je Tag seit der letzten stattgefundenen Sitzung und je Kalenderwoche (höchstens zwölf) neben den geltenden Zielwerten, Gewicht, Tage der Beratungstermine, nächster bestätigter Termin und Planwechsel. Allein app.can_counsel_nutrition im eigenen Mandanten; protokolliert wie das Öffnen von Akte bzw. Trainingsverhältnis (view nutrition). Ohne Recht null und eine Abweisung.';
