-- =============================================================================
-- ERN-010 (ERN-EPIC-003): Die Beratung liest das Tagebuch mit
--
-- ADR-027 Punkte 4 und 10 ("die Beratung liest mit"). Pfad A (Lesepfad auf
-- Gesundheitsdaten nach Art. 9 DSGVO).
--
--   public.get_nutrition_diary   sieben Tage bis zu einem Tag, je Tag mit
--                                Mahlzeiten, Einträgen, Summen und Wasser
--
-- WER (ADR-027 Punkt 4): allein die Fähigkeit "Ernährungsberatung", im
-- eigenen Mandanten. Büro, Therapie, Teamleitung und Trainingsbetreuung
-- nicht. Die Beratung schreibt nicht ins Tagebuch (Punkt 10).
-- PROTOKOLL (ADR-010 Fassung 3, ADR-027 Punkt 4): keine neue Aktion; gelesen
-- wird als Öffnen von Akte bzw. Trainingsverhältnis (view nutrition_diary).
-- Ohne Fähigkeit null und eine Abweisung im Protokoll, wie get_nutrition_profile.
-- =============================================================================

create function public.get_nutrition_diary(p_profile_id uuid, p_to date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_org    uuid;
  v_profil public.nutrition_profiles%rowtype;
  v_heute  date;
  v_bis    date;
  v_von    date;
  v_ziele  jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not app.can_counsel_nutrition() then
    perform app.record_denied_read(v_actor, 'nutrition.read', 'not allowed to read nutrition diaries');
    return null;
  end if;
  v_org := app.current_organization_id();
  select * into v_profil from public.nutrition_profiles p
  where p.id = p_profile_id and p.organization_id = v_org;
  if v_profil.id is null then
    return null;
  end if;

  perform app.log_record_access(
    v_org, v_actor,
    case v_profil.relationship_kind when 'treatment' then 'patient_record.viewed'
                                    else 'training_relationship.viewed' end,
    case v_profil.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_profil.relationship_id, 'user', jsonb_build_object('surface', 'web', 'view', 'nutrition_diary'));

  v_heute := app.training_today(v_org);
  -- Sieben Tage bis p_to, nicht über das Ende der Beratung, nicht vor ihren Beginn.
  v_bis := least(coalesce(p_to, v_heute), coalesce(v_profil.ended_on, v_heute), v_heute);
  v_bis := greatest(v_bis, v_profil.started_on);
  v_von := greatest(v_bis - 6, v_profil.started_on);
  v_ziele := app.nutrition_profile_targets(v_profil.id);

  return jsonb_build_object(
    'today', v_heute,
    'started_on', v_profil.started_on,
    'from', v_von,
    'to', v_bis,
    'targets', case when v_ziele ->> 'status' = 'ok' then jsonb_build_object(
      'energy_kcal', v_ziele -> 'energy' -> 'kcal',
      'protein_g', v_ziele -> 'protein' -> 'g',
      'fat_g', v_ziele -> 'fat' -> 'g',
      'carbohydrate_g', v_ziele -> 'carbohydrate' -> 'g',
      'water_ml', v_ziele -> 'water' -> 'ml') end,
    -- Der jüngste Tag zuerst.
    'days', (
      select jsonb_agg(app.nutrition_diary_day_json(v_profil.id, d::date, true) order by d desc)
      from generate_series(v_von, v_bis, interval '1 day') d
    )
  );
end;
$$;

revoke all on function public.get_nutrition_diary(uuid, date) from public, anon;
grant execute on function public.get_nutrition_diary(uuid, date) to authenticated;

comment on function public.get_nutrition_diary(uuid, date) is
  'ERN-010 (ADR-027 Punkte 4 und 10): das Ernährungstagebuch eines Profils für die Beratung - sieben Tage bis p_to (ohne Angabe heute), je Tag Mahlzeiten mit Einträgen, wer eingetragen hat, Summen und Wasser, dazu die geltenden Zielwerte. Allein app.can_counsel_nutrition im eigenen Mandanten; protokolliert wie das Öffnen von Akte bzw. Trainingsverhältnis (view nutrition_diary). Ohne Recht null und eine Abweisung.';
