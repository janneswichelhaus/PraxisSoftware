-- =============================================================================
-- ERN-001 (ERN-EPIC-001): Ernährungsprofil, Einwilligung, Zielwerte, Gewicht
--
-- ADR-027 Abschnitte A und E, PROJECT_PRINCIPLES.md 4.11, ADR-021 Punkt 11,
-- ADR-008 Fassung 6, ADR-006 Punkt 14. Pfad A (ADR-013 Punkt 9).
--
--   app.can_counsel_nutrition     die Fähigkeit "Ernährungsberatung" (Punkt 4)
--   app.nutrition_calculation     Punkte 16 bis 21 an EINER Stelle (ANN-618)
--   public.nutrition_profiles     Profil an genau einem Verhältnis
--   public.nutrition_consent_records  eigene Einwilligung, nur anhängen
--   public.nutrition_weight_entries   Gewicht mit Verlauf, einer je Tag
--   get/create/update_nutrition_profile, set_nutrition_overrides,
--   set_nutrition_notes, record_nutrition_weight, record_nutrition_consent,
--   end_nutrition_profile          die Wege der Beratung
--
-- WER (ADR-027 Punkt 4): allein die Fähigkeit "Ernährungsberatung", zunächst
-- owner. Büro, Therapie, Teamleitung und Trainingsbetreuung lesen ein Profil
-- nicht, auch nicht an "ihrem" Verhältnis - Ausnahme zu ADR-021 Punkt 10 und
-- zum offenen Lesen der Akte. Kein Tabellenrecht zum Schreiben; die
-- Lese-Policy ist die zweite Linie (ADR-004 Punkt 5).
--
-- PROTOKOLL (ADR-010 Fassung 3, ADR-027 Punkt 4): keine neue Aktion. Lesen
-- steht als Öffnen von Akte bzw. Trainingsverhältnis (view: nutrition),
-- Schreiben weist das Datenmodell nach (created_by, updated_by, recorded_by,
-- ended_by).
--
-- WAS NICHT ENTSTEHT (ADR-006 Punkt 14): keine Diagnose, kein Befund und keine
-- Erkrankung als Eingabe; keine Aussage über den Gesundheitszustand, kein
-- Etikett zum BMI, keine Bewertung. Die Rechnung liefert Zahlen, Formel,
-- Eingaben und Rechenweg.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Fähigkeit (ADR-027 Punkt 4)
-- -----------------------------------------------------------------------------
-- Die Fähigkeit "Ernährungsberatung" trägt zunächst allein owner - die eine
-- Stelle, an der eine weitere Rolle (eine angestellte Fachkraft) dazukäme.
create function app.can_counsel_nutrition()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

revoke all on function app.can_counsel_nutrition() from public, anon;
-- Die Lese-Policies fragen sie im Namen des Kontos.
grant execute on function app.can_counsel_nutrition() to authenticated;

comment on function app.can_counsel_nutrition() is
  'ERN-001 (ADR-027 Punkt 4): wer ein Ernährungsprofil liest und schreibt - zunächst allein owner. Büro, Therapie, Teamleitung und Trainingsbetreuung nicht, auch nicht am eigenen Verhältnis. Die eine Stelle für die Regel.';

-- -----------------------------------------------------------------------------
-- 2. Die Rechnung (ADR-027 Punkte 16 bis 21, ADR-006 Punkt 14)
--
-- Die eine Stelle für Formeln, Stufen, Untergrenzen und Rundung. Rein: keine
-- Tabelle, keine Zeit. Getestet gegen veröffentlichte Rechenbeispiele in
-- supabase/tests/nutrition-calculation.test.ts. Die Oberfläche rechnet
-- nichts nach, sie zeigt die Terme, die hier entstehen.
--
-- Rundung: Grundumsatz auf ganze kcal, dann Gesamtumsatz = gerundeter
-- Grundumsatz × PAL, gerundet - so geht der angezeigte Rechenweg auf. Gramm
-- ganzzahlig, Wasser auf 10 ml, magere Masse und Zielgewicht auf 0,1 kg.
-- -----------------------------------------------------------------------------
create function app.nutrition_calculation(
  p_weight_kg        numeric,
  p_height_cm        numeric,
  p_age_years        integer,
  p_sex              text,
  p_body_fat_percent numeric,
  p_pal              numeric,
  p_goal             text,
  p_formula          text,
  p_in_training      boolean,
  p_overrides        jsonb default '{}'::jsonb,
  p_target_weight_kg numeric default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Punkt 17: die Stufen der DGE.
  c_pal_stufen      constant numeric[] := array[1.4, 1.6, 1.8, 2.0];
  -- Punkt 18: Energieziel.
  c_defizit         constant integer := 500;
  c_defizit_anteil  constant numeric := 0.20;
  c_ueberschuss     constant integer := 300;
  -- Punkt 19: Makronährstoffe (Atwater-Faktoren 4 / 4 / 9 kcal je g).
  c_eiweiss         constant numeric := 0.8;
  c_eiweiss_alter   constant numeric := 1.0;
  c_alter_ab        constant integer := 65;
  c_eiweiss_aufbau  constant numeric := 1.6;
  c_fett_anteil     constant numeric := 0.30;
  c_kcal_eiweiss    constant integer := 4;
  c_kcal_kh         constant integer := 4;
  c_kcal_fett       constant integer := 9;
  -- Punkt 20: Wasser.
  c_wasser_je_kg    constant integer := 35;
  c_wasser_mindest  constant integer := 1500;
  -- Punkt 21: Zielgewicht.
  c_bmi_unten       constant numeric := 18.5;
  -- ANN-618: Energie je kg Körpergewicht für "Zeit bis zum Ziel" - eine
  -- Näherung, kein Versprechen.
  c_kcal_je_kg      constant integer := 7000;

  v_fehlt        text[] := '{}';
  v_formel       text;
  v_mager        numeric;
  v_varianten    jsonb := '[]'::jsonb;
  v_m            numeric;
  v_w            numeric;
  v_grund        integer;
  v_gemittelt    boolean := false;
  v_gesamt       integer;
  v_regel        text;
  v_aenderung    integer;
  v_energie      integer;
  v_unten        boolean;
  v_energie_eff  integer;
  v_faktor       numeric;
  v_grundlage    text;
  v_eiweiss      integer;
  v_eiweiss_eff  integer;
  v_fett         integer;
  v_fett_eff     integer;
  v_kh           integer;
  v_kh_eff       integer;
  v_wasser       integer;
  v_wasser_eff   integer;
  v_ziel_unten   numeric;
  v_wochen       integer;
  v_tagesdiff    integer;
  v_ueber        jsonb := coalesce(p_overrides, '{}'::jsonb);
begin
  if p_sex is null or p_sex not in ('female', 'male', 'unspecified') then
    raise exception 'unknown sex for the formula' using errcode = '22023';
  end if;
  if p_pal is null or not (p_pal = any (c_pal_stufen)) then
    raise exception 'unknown activity level' using errcode = '22023';
  end if;
  if p_goal is null or p_goal not in ('lose', 'maintain', 'build_muscle', 'gain') then
    raise exception 'unknown goal' using errcode = '22023';
  end if;
  if p_formula is null or p_formula not in ('standard', 'katch_mcardle', 'harris_benedict_revised') then
    raise exception 'unknown formula' using errcode = '22023';
  end if;

  if p_weight_kg is null then v_fehlt := v_fehlt || 'weight'::text; end if;
  if p_height_cm is null then v_fehlt := v_fehlt || 'height'::text; end if;
  if p_age_years is null then v_fehlt := v_fehlt || 'birth_date'::text; end if;
  if p_formula = 'katch_mcardle' and p_body_fat_percent is null then
    v_fehlt := v_fehlt || 'body_fat'::text;
  end if;
  if cardinality(v_fehlt) > 0 then
    return jsonb_build_object('status', 'missing', 'missing', to_jsonb(v_fehlt));
  end if;

  -- Punkt 16: Grundumsatz. Standard Mifflin-St Jeor, mit Körperfettanteil
  -- Cunningham; die Beratung stellt auf Katch-McArdle oder Harris-Benedict
  -- (revidiert, Roza und Shizgal 1984) um.
  v_formel := case
    when p_formula = 'standard' and p_body_fat_percent is null then 'mifflin_st_jeor'
    when p_formula = 'standard' then 'cunningham'
    else p_formula
  end;

  if v_formel in ('cunningham', 'katch_mcardle') then
    v_mager := round(p_weight_kg * (1 - p_body_fat_percent / 100), 1);
    if v_formel = 'cunningham' then
      v_grund := round(500 + 22 * v_mager)::integer;
      v_varianten := jsonb_build_array(jsonb_build_object(
        'sex', null, 'constant', 500, 'kcal', v_grund,
        'terms', jsonb_build_array(jsonb_build_object('factor', 22, 'input', 'lean_mass_kg'))));
    else
      v_grund := round(370 + 21.6 * v_mager)::integer;
      v_varianten := jsonb_build_array(jsonb_build_object(
        'sex', null, 'constant', 370, 'kcal', v_grund,
        'terms', jsonb_build_array(jsonb_build_object('factor', 21.6, 'input', 'lean_mass_kg'))));
    end if;
  else
    if v_formel = 'mifflin_st_jeor' then
      v_m := 10 * p_weight_kg + 6.25 * p_height_cm - 5 * p_age_years + 5;
      v_w := 10 * p_weight_kg + 6.25 * p_height_cm - 5 * p_age_years - 161;
    else
      v_m := 88.362 + 13.397 * p_weight_kg + 4.799 * p_height_cm - 5.677 * p_age_years;
      v_w := 447.593 + 9.247 * p_weight_kg + 3.098 * p_height_cm - 4.330 * p_age_years;
    end if;
    if p_sex in ('male', 'unspecified') then
      v_varianten := v_varianten || jsonb_build_array(jsonb_build_object(
        'sex', 'male',
        'constant', case v_formel when 'mifflin_st_jeor' then 5 else 88.362 end,
        'kcal', round(v_m)::integer,
        'terms', case v_formel
          when 'mifflin_st_jeor' then jsonb_build_array(
            jsonb_build_object('factor', 10, 'input', 'weight_kg'),
            jsonb_build_object('factor', 6.25, 'input', 'height_cm'),
            jsonb_build_object('factor', -5, 'input', 'age_years'))
          else jsonb_build_array(
            jsonb_build_object('factor', 13.397, 'input', 'weight_kg'),
            jsonb_build_object('factor', 4.799, 'input', 'height_cm'),
            jsonb_build_object('factor', -5.677, 'input', 'age_years'))
        end));
    end if;
    if p_sex in ('female', 'unspecified') then
      v_varianten := v_varianten || jsonb_build_array(jsonb_build_object(
        'sex', 'female',
        'constant', case v_formel when 'mifflin_st_jeor' then -161 else 447.593 end,
        'kcal', round(v_w)::integer,
        'terms', case v_formel
          when 'mifflin_st_jeor' then jsonb_build_array(
            jsonb_build_object('factor', 10, 'input', 'weight_kg'),
            jsonb_build_object('factor', 6.25, 'input', 'height_cm'),
            jsonb_build_object('factor', -5, 'input', 'age_years'))
          else jsonb_build_array(
            jsonb_build_object('factor', 9.247, 'input', 'weight_kg'),
            jsonb_build_object('factor', 3.098, 'input', 'height_cm'),
            jsonb_build_object('factor', -4.330, 'input', 'age_years'))
        end));
    end if;
    -- Ohne Angabe "weiblich" oder "männlich": das Mittel beider Varianten,
    -- sichtbar vermerkt (Punkt 16).
    if p_sex = 'unspecified' then
      v_gemittelt := true;
      v_grund := round((round(v_m) + round(v_w)) / 2.0)::integer;
    elsif p_sex = 'male' then
      v_grund := round(v_m)::integer;
    else
      v_grund := round(v_w)::integer;
    end if;
  end if;

  -- Punkt 17: Gesamtumsatz.
  v_gesamt := round(v_grund * p_pal)::integer;

  -- Punkt 18: Energieziel, nie unter dem Grundumsatz.
  if p_goal = 'maintain' then
    v_regel := 'maintain';
    v_aenderung := 0;
  elsif p_goal = 'lose' then
    v_aenderung := -least(c_defizit, round(v_gesamt * c_defizit_anteil)::integer);
    v_regel := case when -v_aenderung < c_defizit then 'deficit_capped' else 'deficit' end;
  else
    v_regel := 'surplus';
    v_aenderung := c_ueberschuss;
  end if;
  v_energie := v_gesamt + v_aenderung;
  v_unten := v_energie < v_grund;
  if v_unten then
    v_energie := v_grund;
  end if;
  -- Punkt 22: Die Beratung überschreibt, auch unter die Untergrenze.
  v_energie_eff := coalesce((v_ueber ->> 'energy_kcal')::integer, v_energie);

  -- Punkt 19: Eiweiß je kg; ab 65 Jahren mehr, bei Muskelaufbau oder im
  -- Training mehr (ANN-618: "im Training" heißt: das Profil hängt an einem
  -- Trainingsverhältnis). Es gilt die höchste zutreffende Stufe.
  v_faktor := c_eiweiss;
  v_grundlage := 'standard';
  if p_age_years >= c_alter_ab then
    v_faktor := c_eiweiss_alter;
    v_grundlage := 'from_65';
  end if;
  if p_goal = 'build_muscle' or coalesce(p_in_training, false) then
    v_faktor := c_eiweiss_aufbau;
    v_grundlage := 'muscle_or_training';
  end if;
  v_eiweiss := round(v_faktor * p_weight_kg)::integer;
  v_eiweiss_eff := coalesce((v_ueber ->> 'protein_g')::integer, v_eiweiss);

  -- Fett mindestens 30 % der Energie (gerechnet mit genau 30 %),
  -- Kohlenhydrate der Rest - je aus dem berechneten und aus dem geltenden
  -- Energieziel.
  v_fett := round(v_energie * c_fett_anteil / c_kcal_fett)::integer;
  v_fett_eff := coalesce((v_ueber ->> 'fat_g')::integer,
                         round(v_energie_eff * c_fett_anteil / c_kcal_fett)::integer);
  v_kh := greatest(0, round((v_energie - c_kcal_eiweiss * v_eiweiss - c_kcal_fett * v_fett)
                            / c_kcal_kh::numeric)::integer);
  v_kh_eff := coalesce((v_ueber ->> 'carbohydrate_g')::integer,
                       greatest(0, round((v_energie_eff - c_kcal_eiweiss * v_eiweiss_eff
                                          - c_kcal_fett * v_fett_eff) / c_kcal_kh::numeric)::integer));

  -- Punkt 20: Wasser.
  v_wasser := greatest(c_wasser_mindest, (round(c_wasser_je_kg * p_weight_kg / 10) * 10)::integer);
  v_wasser_eff := coalesce((v_ueber ->> 'water_ml')::integer, v_wasser);

  -- Punkt 21: Zielgewicht nicht unter BMI 18,5 - aufgerundet, damit das
  -- angezeigte Gewicht selbst nicht darunter liegt.
  v_ziel_unten := round(ceil(c_bmi_unten * (p_height_cm / 100.0) ^ 2 * 10) / 10.0, 1);
  -- Zeit bis zum Ziel nur aus dem geltenden Energieziel und nur, wenn es in
  -- die Richtung des Ziels weist.
  v_tagesdiff := v_gesamt - v_energie_eff;
  if p_target_weight_kg is not null
     and ((p_weight_kg > p_target_weight_kg and v_tagesdiff > 0)
          or (p_weight_kg < p_target_weight_kg and v_tagesdiff < 0)) then
    v_wochen := ceil(abs(p_weight_kg - p_target_weight_kg) * c_kcal_je_kg
                     / abs(v_tagesdiff) / 7.0)::integer;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'inputs', jsonb_build_object(
      'weight_kg', p_weight_kg, 'height_cm', p_height_cm, 'age_years', p_age_years,
      'sex', p_sex, 'body_fat_percent', p_body_fat_percent, 'pal', p_pal, 'goal', p_goal,
      'formula', p_formula, 'in_training', coalesce(p_in_training, false)),
    'bmr', jsonb_build_object(
      'formula', v_formel, 'lean_mass_kg', v_mager, 'averaged', v_gemittelt,
      'variants', v_varianten, 'kcal', v_grund),
    'tee', jsonb_build_object('pal', p_pal, 'kcal', v_gesamt),
    'energy', jsonb_build_object(
      'rule', v_regel, 'change_kcal', v_aenderung, 'deficit_max_kcal', c_defizit,
      'deficit_max_share', c_defizit_anteil, 'floor_applied', v_unten,
      'computed_kcal', v_energie, 'kcal', v_energie_eff,
      'overridden', v_ueber ? 'energy_kcal', 'below_bmr', v_energie_eff < v_grund),
    'protein', jsonb_build_object(
      'g_per_kg', v_faktor, 'basis', v_grundlage, 'computed_g', v_eiweiss, 'g', v_eiweiss_eff,
      'overridden', v_ueber ? 'protein_g'),
    'fat', jsonb_build_object(
      'share', c_fett_anteil, 'computed_g', v_fett, 'g', v_fett_eff,
      'overridden', v_ueber ? 'fat_g'),
    'carbohydrate', jsonb_build_object(
      'computed_g', v_kh, 'g', v_kh_eff, 'overridden', v_ueber ? 'carbohydrate_g'),
    'water', jsonb_build_object(
      'ml_per_kg', c_wasser_je_kg, 'minimum_ml', c_wasser_mindest,
      'floor_applied', v_wasser = c_wasser_mindest, 'computed_ml', v_wasser, 'ml', v_wasser_eff,
      'overridden', v_ueber ? 'water_ml'),
    'target_weight', jsonb_build_object(
      'kg', p_target_weight_kg, 'floor_kg', v_ziel_unten, 'bmi_floor', c_bmi_unten,
      'below_floor', p_target_weight_kg is not null and p_target_weight_kg < v_ziel_unten,
      'weeks', v_wochen, 'kcal_per_kg', c_kcal_je_kg)
  );
end;
$$;

revoke all on function app.nutrition_calculation(
  numeric, numeric, integer, text, numeric, numeric, text, text, boolean, jsonb, numeric
) from public, anon, authenticated;

comment on function app.nutrition_calculation(
  numeric, numeric, integer, text, numeric, numeric, text, text, boolean, jsonb, numeric
) is
  'ERN-001 (ADR-027 Punkte 16 bis 22, ADR-006 Punkt 14, ANN-618): Grundumsatz, Gesamtumsatz und Zielwerte mit Rechenweg - die eine Stelle für Formeln, Stufen, Untergrenzen und Rundung. Eingaben: Gewicht, Größe, Alter, Geschlecht für die Formel, Körperfett, PAL, Ziel, Formel, Trainingsverhältnis, Überschreibungen der Beratung, Zielgewicht. Keine Diagnose als Eingabe. Fehlt eine Eingabe: status missing.';

-- Die Untergrenze des Zielgewichts allein - für die Wahl der Person auf der
-- Plattform (Punkt 21), aus derselben Rechnung.
create function app.nutrition_target_weight_floor(p_height_cm numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (app.nutrition_calculation(
    70, p_height_cm, 40, 'unspecified', null, 1.4, 'maintain', 'standard', false
  ) -> 'target_weight' ->> 'floor_kg')::numeric
$$;

revoke all on function app.nutrition_target_weight_floor(numeric) from public, anon, authenticated;

comment on function app.nutrition_target_weight_floor(numeric) is
  'ERN-001 (ADR-027 Punkt 21): das niedrigste Zielgewicht, das die Person selbst wählen darf (BMI 18,5), aus app.nutrition_calculation - keine zweite Stelle für die Zahl.';

-- -----------------------------------------------------------------------------
-- 3. Tabellen
-- -----------------------------------------------------------------------------
create table public.nutrition_profiles (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  -- ADR-027 Punkt 1: an genau einem Verhältnis, nie an persons, nie an
  -- beiden; kein Fremdschlüssel zwischen den Verhältnissen (ADR-021 Punkt 3).
  relationship_kind        text not null check (relationship_kind in ('treatment', 'training')),
  relationship_id          uuid not null,
  patient_id               uuid references public.patients (id) on delete cascade,
  training_relationship_id uuid references public.training_relationships (id) on delete cascade,

  -- Beginn und Ende der Beratung; das Ende ist der Fristanker (Punkt 6).
  started_on               date not null,
  ended_on                 date,
  ended_by                 uuid,

  -- Punkt 5: Körperdaten. Das Alter kommt aus dem Geburtsdatum der
  -- Stammdaten des Verhältnisses, nicht von hier.
  height_cm                smallint not null check (height_cm between 100 and 250),
  formula_sex              text not null check (formula_sex in ('female', 'male', 'unspecified')),
  body_fat_percent         numeric(3, 1) check (body_fat_percent is null
                                                or body_fat_percent between 3 and 70),
  activity_pal             numeric(2, 1) not null check (activity_pal in (1.4, 1.6, 1.8, 2.0)),
  goal                     text not null check (goal in ('lose', 'maintain', 'build_muscle', 'gain')),
  bmr_formula              text not null default 'standard'
                             check (bmr_formula in ('standard', 'katch_mcardle',
                                                    'harris_benedict_revised')),
  -- Punkt 21: von der Person oder der Beratung gewählt; wer, steht daneben.
  target_weight_kg         numeric(4, 1) check (target_weight_kg is null
                                                or target_weight_kg between 30 and 300),
  target_weight_source     text check (target_weight_source in ('counsellor', 'person')),

  -- Punkt 22: Überschreibungen der Beratung; leer heißt berechnet.
  energy_kcal_override     smallint check (energy_kcal_override between 500 and 6000),
  protein_g_override       smallint check (protein_g_override between 10 and 400),
  fat_g_override           smallint check (fat_g_override between 10 and 400),
  carbohydrate_g_override  smallint check (carbohydrate_g_override between 0 and 900),
  water_ml_override        smallint check (water_ml_override between 500 and 8000),

  -- Notizen der Beratung: intern, in keiner Plattformprojektion (ADR-023
  -- Punkt 22). Keine Diagnose, kein Befund (Punkt 5).
  notes                    text check (notes is null or length(notes) between 1 and 4000),

  -- Punkt 2: Das Tagebuch schaltet die Person selbst ein und aus; von
  -- Anfang an aus. Wer zuletzt geschaltet hat, ohne Kennung des Zugangs.
  diary_enabled            boolean not null default false,
  diary_changed_at         timestamptz,
  diary_changed_by_kind    text check (diary_changed_by_kind in ('self', 'legal_representative')),

  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  updated_at               timestamptz not null default now(),
  updated_by               uuid,

  constraint nutrition_profiles_id_organization unique (id, organization_id),
  constraint nutrition_profiles_relationship_matches check (
    (relationship_kind = 'treatment' and training_relationship_id is null
       and patient_id = relationship_id)
    or (relationship_kind = 'training' and patient_id is null
       and training_relationship_id = relationship_id)
  ),
  constraint nutrition_profiles_ended_pair check ((ended_on is null) = (ended_by is null)),
  constraint nutrition_profiles_end_after_start check (ended_on is null or ended_on >= started_on),
  constraint nutrition_profiles_target_weight_pair check (
    (target_weight_kg is null) = (target_weight_source is null)
  ),
  constraint nutrition_profiles_katch_needs_body_fat check (
    bmr_formula <> 'katch_mcardle' or body_fat_percent is not null
  ),
  constraint nutrition_profiles_diary_pair check (
    (diary_changed_at is null) = (diary_changed_by_kind is null)
  )
);

comment on table public.nutrition_profiles is
  'ERN-001 (ADR-027 Abschnitt A): Ernährungsprofil an genau einem Verhältnis - Körperdaten, Aktivität (PAL), Ziel, Zielgewicht, Überschreibungen und Notizen der Beratung, Schalter des Tagebuchs. Keine Diagnose, kein Befund. Lesen allein mit app.can_counsel_nutrition (ADR-021 Punkt 11). Datenklasse: Ernährungsberatung, drei Jahre nach ended_on; fällt das Verhältnis früher, mit ihm (ADR-008 Fassung 6). Kein Tabellenrecht zum Schreiben (ADR-004).';
comment on column public.nutrition_profiles.ended_on is
  'Ende der Beratung - Anker der Frist (ADR-027 Punkt 6). Ohne Ende läuft keine Frist.';
comment on column public.nutrition_profiles.formula_sex is
  'Geschlecht allein für die Formel des Grundumsatzes (ADR-027 Punkt 16); unspecified rechnet mit dem Mittel beider Varianten.';

-- Höchstens ein laufendes Profil je Verhältnis; je Person sichert es
-- create_nutrition_profile über beide Verhältnisse (ADR-027 Punkt 1).
create unique index nutrition_profiles_running_treatment
  on public.nutrition_profiles (patient_id) where ended_on is null and patient_id is not null;
create unique index nutrition_profiles_running_training
  on public.nutrition_profiles (training_relationship_id)
  where ended_on is null and training_relationship_id is not null;
create index nutrition_profiles_relationship_idx
  on public.nutrition_profiles (relationship_kind, relationship_id, started_on desc);
create index nutrition_profiles_organization_idx on public.nutrition_profiles (organization_id);

create table public.nutrition_consent_records (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  profile_id           uuid not null,
  record_kind          text not null check (record_kind in ('consent_granted', 'consent_withdrawn')),
  -- Der Tag auf dem Papier bzw. der Tag auf der Plattform.
  occurred_on          date not null,
  recorded_at          timestamptz not null default now(),
  recorded_by          uuid not null,
  -- Herkunft wie an patient_privacy_records (POR-016): der Nachweis nach
  -- Art. 7 Abs. 1 DSGVO steht am Datensatz (ADR-010 Fassung 3).
  source               text not null default 'practice' check (source in ('practice', 'platform')),
  platform_access_id   uuid,
  platform_access_kind text check (platform_access_kind in ('self', 'legal_representative')),
  representative_name  text check (representative_name is null
                                   or length(btrim(representative_name)) between 1 and 200),
  wording_version      text check (wording_version ~ '^[0-9]{4}-[0-9]{2}$'),

  constraint nutrition_consent_records_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade,
  constraint nutrition_consent_records_source_shape check (
    (source = 'platform'
       and platform_access_id is not null
       and platform_access_kind is not null
       and wording_version is not null)
    or (source = 'practice'
       and platform_access_id is null
       and platform_access_kind is null
       and wording_version is null)
  ),
  constraint nutrition_consent_records_representative_shape check (
    (platform_access_kind is not distinct from 'legal_representative') = (representative_name is not null)
  )
);

comment on table public.nutrition_consent_records is
  'ERN-001 (ADR-027 Punkt 3): ausdrückliche Einwilligung "Ernährungsberatung" nach Art. 9 Abs. 2 lit. a DSGVO am Profil, auch an einer Akte. Nur anhängen, nie ändern: der Stand ist die jüngste Zeile. Ohne erteilte Einwilligung kein Eintrag; ein Widerruf hält Tagebuch und Gewicht an. Datenklasse: Ernährungsberatung, fällt mit dem Profil.';

create index nutrition_consent_records_profile_idx
  on public.nutrition_consent_records (profile_id, recorded_at desc);
create index nutrition_consent_records_organization_idx
  on public.nutrition_consent_records (organization_id);

create table public.nutrition_weight_entries (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  profile_id           uuid not null,
  measured_on          date not null,
  weight_kg            numeric(4, 1) not null check (weight_kg between 20 and 350),
  -- Punkt 5: die Person selbst oder die Beratung.
  source               text not null check (source in ('practice', 'platform')),
  platform_access_id   uuid,
  platform_access_kind text check (platform_access_kind in ('self', 'legal_representative')),
  recorded_at          timestamptz not null default now(),
  recorded_by          uuid not null,

  -- Ein Gewicht je Tag; ein zweiter Eintrag am selben Tag ersetzt den ersten.
  constraint nutrition_weight_entries_one_per_day unique (profile_id, measured_on),
  constraint nutrition_weight_entries_profile_fk
    foreign key (profile_id, organization_id)
    references public.nutrition_profiles (id, organization_id) on delete cascade,
  constraint nutrition_weight_entries_source_shape check (
    (source = 'platform') = (platform_access_id is not null)
    and (source = 'platform') = (platform_access_kind is not null)
  )
);

comment on table public.nutrition_weight_entries is
  'ERN-001 (ADR-027 Punkt 5): Körpergewicht mit Verlauf, eingetragen von der Person auf der Plattform oder von der Beratung; eines je Tag. Datenklasse: Ernährungsberatung, fällt mit dem Profil.';

create index nutrition_weight_entries_profile_idx
  on public.nutrition_weight_entries (profile_id, measured_on desc);
create index nutrition_weight_entries_organization_idx
  on public.nutrition_weight_entries (organization_id);

-- Lesen nur mit der Fähigkeit; geschrieben wird allein über die Funktionen.
revoke all on public.nutrition_profiles from public, anon, authenticated;
revoke all on public.nutrition_consent_records from public, anon, authenticated;
revoke all on public.nutrition_weight_entries from public, anon, authenticated;
alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_consent_records enable row level security;
alter table public.nutrition_weight_entries enable row level security;
grant select on public.nutrition_profiles to authenticated;
grant select on public.nutrition_consent_records to authenticated;
grant select on public.nutrition_weight_entries to authenticated;

create policy nutrition_profiles_select_counsel
  on public.nutrition_profiles for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());
create policy nutrition_consent_records_select_counsel
  on public.nutrition_consent_records for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());
create policy nutrition_weight_entries_select_counsel
  on public.nutrition_weight_entries for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_counsel_nutrition());

-- -----------------------------------------------------------------------------
-- 4. Datenklasse und Frist (ADR-008 Fassung 6, ANN-619)
-- -----------------------------------------------------------------------------
alter table public.retention_classes drop constraint retention_classes_anchor_check;
alter table public.retention_classes add constraint retention_classes_anchor_check
  check (anchor in ('care_concluded', 'contract_ended', 'counselling_ended', 'calendar_year_end',
                    'event_time', 'case_closed', 'none'));

insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('ernaehrungsberatung', 'intern', null, 'counselling_ended', interval '3 years', 'ANN-619',
   'Ernährungsberatung (ADR-027 Punkt 6): Profil, Einwilligung, Gewicht - drei Jahre nach dem Ende des Profils, unabhängig von der Frist des Verhältnisses; fällt das Verhältnis früher, fallen sie mit ihm. Ein Legal Hold an der Akte hält.',
   104);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('nutrition_profiles', 'ernaehrungsberatung', 'automatisch',
   'Ernährungsprofil (ERN-001): drei Jahre nach seinem Ende endgültig gelöscht, mit Eintrag im Löschjournal; mit dem Verhältnis früher (cascade). Ein Legal Hold an der Akte hält (ANN-619).',
   241),
  ('nutrition_consent_records', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Einwilligung "Ernährungsberatung" (ERN-001): fällt mit ihrem Profil; der Nachweis wird so lange gebraucht wie die Angaben, die auf ihr beruhen.',
   242),
  ('nutrition_weight_entries', 'ernaehrungsberatung', 'ueber_elterndatensatz',
   'Gewicht mit Verlauf (ERN-001): fällt mit seinem Profil.',
   243);

-- -----------------------------------------------------------------------------
-- 5. Hilfen ohne Rechteprüfung (nur aus den Funktionen unten)
-- -----------------------------------------------------------------------------

-- Person, Geburtsdatum und ob das Verhältnis offen ist - je Art des
-- Verhältnisses aus dessen eigenen Stammdaten (ADR-021 Punkt 3).
create function app.nutrition_relationship(p_kind text, p_relationship_id uuid, p_organization_id uuid)
returns table (person_id uuid, date_of_birth date, is_open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.person_id, c.date_of_birth, true
  from public.patients p
  left join public.patient_contact_details c on c.patient_id = p.id
  where p_kind = 'treatment' and p.id = p_relationship_id and p.organization_id = p_organization_id
  union all
  select t.person_id, c.date_of_birth, t.contract_ended_on is null
  from public.training_relationships t
  left join public.training_contact_details c on c.training_relationship_id = t.id
  where p_kind = 'training' and t.id = p_relationship_id and t.organization_id = p_organization_id
$$;

revoke all on function app.nutrition_relationship(text, uuid, uuid) from public, anon, authenticated;

comment on function app.nutrition_relationship(text, uuid, uuid) is
  'ERN-001: Person, Geburtsdatum aus den Stammdaten des Verhältnisses und ob es offen ist. Die Akte zählt als offen: Seit B1 ist jede Akte planbar (ANN-510). Ohne Rechteprüfung.';

-- Der Stand der Einwilligung: die jüngste Zeile.
create function app.nutrition_consent(p_profile_id uuid)
returns public.nutrition_consent_records
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.nutrition_consent_records r
  where r.profile_id = p_profile_id
  order by r.recorded_at desc, r.id desc
  limit 1
$$;

revoke all on function app.nutrition_consent(uuid) from public, anon, authenticated;

create function app.nutrition_consent_granted(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((app.nutrition_consent(p_profile_id)).record_kind = 'consent_granted', false)
$$;

revoke all on function app.nutrition_consent_granted(uuid) from public, anon, authenticated;

comment on function app.nutrition_consent_granted(uuid) is
  'ERN-001 (ADR-027 Punkt 3): ist die Einwilligung "Ernährungsberatung" am Profil erteilt? Die jüngste Zeile entscheidet. Ohne sie kein Eintrag.';

-- Zielwerte eines Profils mit Rechenweg: jüngstes Gewicht, Alter am Tag der
-- Praxis, Überschreibungen.
create function app.nutrition_profile_targets(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profil  public.nutrition_profiles%rowtype;
  v_gewicht numeric;
  v_geboren date;
  v_heute   date;
begin
  select * into v_profil from public.nutrition_profiles p where p.id = p_profile_id;
  if v_profil.id is null then
    return null;
  end if;
  select w.weight_kg into v_gewicht
  from public.nutrition_weight_entries w
  where w.profile_id = p_profile_id
  order by w.measured_on desc, w.recorded_at desc
  limit 1;
  select r.date_of_birth into v_geboren
  from app.nutrition_relationship(v_profil.relationship_kind, v_profil.relationship_id,
                                  v_profil.organization_id) r;
  v_heute := app.training_today(v_profil.organization_id);

  return app.nutrition_calculation(
    v_gewicht,
    v_profil.height_cm,
    case when v_geboren is not null and v_geboren <= v_heute
         then extract(year from age(v_heute, v_geboren))::integer end,
    v_profil.formula_sex,
    v_profil.body_fat_percent,
    v_profil.activity_pal,
    v_profil.goal,
    v_profil.bmr_formula,
    v_profil.relationship_kind = 'training',
    jsonb_strip_nulls(jsonb_build_object(
      'energy_kcal', v_profil.energy_kcal_override,
      'protein_g', v_profil.protein_g_override,
      'fat_g', v_profil.fat_g_override,
      'carbohydrate_g', v_profil.carbohydrate_g_override,
      'water_ml', v_profil.water_ml_override)),
    v_profil.target_weight_kg
  );
end;
$$;

revoke all on function app.nutrition_profile_targets(uuid) from public, anon, authenticated;

comment on function app.nutrition_profile_targets(uuid) is
  'ERN-001: Zielwerte eines Profils aus app.nutrition_calculation - mit jüngstem Gewicht, Alter aus dem Geburtsdatum der Stammdaten am Tag der Praxis und den Überschreibungen. Ohne Rechteprüfung.';

-- Das Profil mit Einwilligung, Gewichtsverlauf und Zielwerten. Für die Praxis
-- mit Notizen und Verlauf der Einwilligung; für Plattform und Auskunft legen
-- die Aufrufer ihre feste Schlüsselliste darüber.
create function app.nutrition_profile_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'relationship_kind', p.relationship_kind,
    'started_on', p.started_on,
    'ended_on', p.ended_on,
    'height_cm', p.height_cm,
    'formula_sex', p.formula_sex,
    'body_fat_percent', p.body_fat_percent,
    'activity_pal', p.activity_pal,
    'goal', p.goal,
    'bmr_formula', p.bmr_formula,
    'target_weight_kg', p.target_weight_kg,
    'target_weight_source', p.target_weight_source,
    'overrides', jsonb_build_object(
      'energy_kcal', p.energy_kcal_override,
      'protein_g', p.protein_g_override,
      'fat_g', p.fat_g_override,
      'carbohydrate_g', p.carbohydrate_g_override,
      'water_ml', p.water_ml_override),
    'notes', p.notes,
    'diary_enabled', p.diary_enabled,
    'diary_changed_at', p.diary_changed_at,
    'diary_changed_by_kind', p.diary_changed_by_kind,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'consent', (
      select jsonb_build_object(
        'state', case c.record_kind when 'consent_granted' then 'granted' else 'withdrawn' end,
        'occurred_on', c.occurred_on,
        'source', c.source,
        'platform_access_kind', c.platform_access_kind,
        'representative_name', c.representative_name)
      from app.nutrition_consent(p.id) c
      where c.id is not null),
    'consent_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_kind', r.record_kind, 'occurred_on', r.occurred_on, 'source', r.source,
        'platform_access_kind', r.platform_access_kind,
        'representative_name', r.representative_name,
        'wording_version', r.wording_version, 'recorded_at', r.recorded_at)
        order by r.recorded_at desc, r.id desc)
      from public.nutrition_consent_records r where r.profile_id = p.id), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'measured_on', w.measured_on, 'weight_kg', w.weight_kg, 'source', w.source,
        'recorded_by_kind', w.platform_access_kind)
        order by w.measured_on desc)
      from public.nutrition_weight_entries w where w.profile_id = p.id), '[]'::jsonb),
    'targets', app.nutrition_profile_targets(p.id)
  )
  from public.nutrition_profiles p
  where p.id = p_profile_id
$$;

revoke all on function app.nutrition_profile_json(uuid) from public, anon, authenticated;

comment on function app.nutrition_profile_json(uuid) is
  'ERN-001: ein Ernährungsprofil vollständig - Körperdaten, Ziel, Überschreibungen, Notizen, Tagebuchschalter, Einwilligung mit Verlauf, Gewichtsverlauf, Zielwerte mit Rechenweg. Ohne Rechteprüfung: nur aus get_nutrition_profile, der Auskunft und (mit fester Schlüsselliste) der Plattform.';

-- Ein Profil der eigenen Organisation zum Schreiben - nach Fähigkeit,
-- Organisation und Stand; sonst ein Fehler ohne Unterschied.
create function app.nutrition_profile_for_writing(p_profile_id uuid, p_needs_consent boolean)
returns public.nutrition_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  if auth.uid() is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed to counsel nutrition' using errcode = '42501';
  end if;
  select * into v_profil
  from public.nutrition_profiles p
  where p.id = p_profile_id and p.organization_id = app.current_organization_id()
  for update;
  if v_profil.id is null then
    raise exception 'nutrition profile not found' using errcode = 'P0002';
  end if;
  if v_profil.ended_on is not null then
    raise exception 'nutrition profile has ended' using errcode = '22023';
  end if;
  -- Ohne Einwilligung kein Eintrag (ADR-027 Punkt 3).
  if p_needs_consent and not app.nutrition_consent_granted(v_profil.id) then
    raise exception 'nutrition consent missing' using errcode = '42501';
  end if;
  return v_profil;
end;
$$;

revoke all on function app.nutrition_profile_for_writing(uuid, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Lesen für die Beratung
--
-- Das jüngste Profil des Verhältnisses (das laufende, sonst das zuletzt
-- beendete) und wie viele frühere es gibt. Lesen steht als Öffnen des
-- Verhältnisses (ADR-027 Punkt 4). Ohne Fähigkeit null und eine Abweisung im
-- Protokoll.
-- -----------------------------------------------------------------------------
create function public.get_nutrition_profile(p_kind text, p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_org     uuid;
  v_rel     record;
  v_profil  uuid;
  v_frueher integer;
  v_anderes text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not app.can_counsel_nutrition() then
    perform app.record_denied_read(v_actor, 'nutrition.read', 'not allowed to read nutrition profiles');
    return null;
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.nutrition_relationship(p_kind, p_relationship_id, v_org);
  if v_rel.person_id is null then
    return null;
  end if;

  perform app.log_record_access(
    v_org, v_actor,
    case p_kind when 'treatment' then 'patient_record.viewed' else 'training_relationship.viewed' end,
    case p_kind when 'treatment' then 'patient' else 'training_relationship' end,
    p_relationship_id, 'user', jsonb_build_object('surface', 'web', 'view', 'nutrition'));

  select p.id into v_profil
  from public.nutrition_profiles p
  where p.organization_id = v_org and p.relationship_kind = p_kind
    and p.relationship_id = p_relationship_id
  order by p.ended_on is null desc, p.started_on desc, p.created_at desc
  limit 1;

  select count(*) - 1 into v_frueher
  from public.nutrition_profiles p
  where p.organization_id = v_org and p.relationship_kind = p_kind
    and p.relationship_id = p_relationship_id;

  -- Läuft für dieselbe Person schon ein Profil am anderen Verhältnis? Dann
  -- entsteht hier keines (Punkt 1); die Beratung sieht beide Bereiche.
  select p.relationship_kind into v_anderes
  from public.nutrition_profiles p
  left join public.patients pa on pa.id = p.patient_id
  left join public.training_relationships t on t.id = p.training_relationship_id
  where p.organization_id = v_org and p.ended_on is null
    and coalesce(pa.person_id, t.person_id) = v_rel.person_id
    and not (p.relationship_kind = p_kind and p.relationship_id = p_relationship_id)
  limit 1;

  return jsonb_build_object(
    'today', app.training_today(v_org),
    'relationship_open', v_rel.is_open,
    'birth_date_known', v_rel.date_of_birth is not null,
    'running_elsewhere', v_anderes,
    'earlier_count', greatest(coalesce(v_frueher, 0), 0),
    'profile', case when v_profil is null then null else app.nutrition_profile_json(v_profil) end
  );
end;
$$;

revoke all on function public.get_nutrition_profile(text, uuid) from public, anon;
grant execute on function public.get_nutrition_profile(text, uuid) to authenticated;

comment on function public.get_nutrition_profile(text, uuid) is
  'ERN-001 (ADR-027): das jüngste Ernährungsprofil eines Verhältnisses mit Einwilligung, Gewicht und Zielwerten samt Rechenweg; dazu, ob am anderen Verhältnis derselben Person eines läuft. Allein app.can_counsel_nutrition; protokolliert wie das Öffnen von Akte bzw. Trainingsverhältnis (view nutrition). Ohne Recht null und eine Abweisung.';

-- -----------------------------------------------------------------------------
-- 7. Anlegen - mit Einwilligung und erstem Gewicht in einem Aufruf
-- -----------------------------------------------------------------------------
create function public.create_nutrition_profile(
  p_kind             text,
  p_relationship_id  uuid,
  p_consent_on       date,
  p_height_cm        smallint,
  p_weight_kg        numeric,
  p_formula_sex      text,
  p_activity_pal     numeric,
  p_goal             text,
  p_body_fat_percent numeric default null,
  p_target_weight_kg numeric default null,
  p_notes            text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_rel   record;
  v_heute date;
  v_id    uuid;
begin
  if v_actor is null or not app.can_counsel_nutrition() then
    raise exception 'not allowed to counsel nutrition' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if p_kind is null or p_kind not in ('treatment', 'training') then
    raise exception 'unknown relationship kind' using errcode = '22023';
  end if;

  -- Das Verhältnis sperren: zwei gleichzeitige Anlagen werden nicht zwei Profile.
  if p_kind = 'treatment' then
    perform 1 from public.patients p
    where p.id = p_relationship_id and p.organization_id = v_org for update;
  else
    perform 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org for update;
  end if;
  select * into v_rel from app.nutrition_relationship(p_kind, p_relationship_id, v_org);
  if v_rel.person_id is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;
  if not v_rel.is_open then
    raise exception 'relationship has ended' using errcode = '22023';
  end if;

  -- Punkt 3: ohne Einwilligung kein Profil.
  v_heute := app.training_today(v_org);
  if p_consent_on is null then
    raise exception 'nutrition consent missing' using errcode = '22023';
  end if;
  if p_consent_on > v_heute then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;
  if p_weight_kg is null then
    raise exception 'weight is required' using errcode = '22023';
  end if;

  -- Punkt 1: höchstens ein laufendes Profil je Person, über beide
  -- Verhältnisse. Die Sperre gilt der Person, nicht dem Verhältnis.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition:' || v_rel.person_id::text, 0));
  if exists (
    select 1
    from public.nutrition_profiles p
    left join public.patients pa on pa.id = p.patient_id
    left join public.training_relationships t on t.id = p.training_relationship_id
    where p.organization_id = v_org and p.ended_on is null
      and coalesce(pa.person_id, t.person_id) = v_rel.person_id
  ) then
    raise exception 'nutrition profile already running' using errcode = '23505';
  end if;

  -- Längen, Bereiche und Formeln prüfen die Constraints der Tabelle.
  insert into public.nutrition_profiles (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    started_on, height_cm, formula_sex, body_fat_percent, activity_pal, goal,
    target_weight_kg, target_weight_source, notes, created_by, updated_by
  )
  values (
    v_org, p_kind, p_relationship_id,
    case when p_kind = 'treatment' then p_relationship_id end,
    case when p_kind = 'training' then p_relationship_id end,
    v_heute, p_height_cm, p_formula_sex, p_body_fat_percent, p_activity_pal, p_goal,
    p_target_weight_kg, case when p_target_weight_kg is not null then 'counsellor' end,
    nullif(btrim(p_notes), ''), v_actor, v_actor
  )
  returning id into v_id;

  insert into public.nutrition_consent_records (
    organization_id, profile_id, record_kind, occurred_on, recorded_by
  )
  values (v_org, v_id, 'consent_granted', p_consent_on, v_actor);

  insert into public.nutrition_weight_entries (
    organization_id, profile_id, measured_on, weight_kg, source, recorded_by
  )
  values (v_org, v_id, v_heute, p_weight_kg, 'practice', v_actor);

  return v_id;
end;
$$;

revoke all on function public.create_nutrition_profile(
  text, uuid, date, smallint, numeric, text, numeric, text, numeric, numeric, text
) from public, anon;
grant execute on function public.create_nutrition_profile(
  text, uuid, date, smallint, numeric, text, numeric, text, numeric, numeric, text
) to authenticated;

comment on function public.create_nutrition_profile(
  text, uuid, date, smallint, numeric, text, numeric, text, numeric, numeric, text
) is
  'ERN-001 (ADR-027 Punkte 1 bis 3, 5): legt das Ernährungsprofil am offenen Verhältnis an - mit dem Tag der Einwilligung vom Papier und dem ersten Gewicht, in einem Vorgang. Höchstens ein laufendes Profil je Person über beide Verhältnisse (23505). Allein app.can_counsel_nutrition (42501). Ein Zielgewicht der Beratung darf unter BMI 18,5 liegen und ist dann gekennzeichnet (Punkt 22).';

-- -----------------------------------------------------------------------------
-- 8. Ändern, überschreiben, Notizen
-- -----------------------------------------------------------------------------
create function public.update_nutrition_profile(
  p_profile_id       uuid,
  p_expected         timestamptz,
  p_height_cm        smallint,
  p_formula_sex      text,
  p_body_fat_percent numeric,
  p_activity_pal     numeric,
  p_goal             text,
  p_bmr_formula      text,
  p_target_weight_kg numeric
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_jetzt  timestamptz := clock_timestamp();
begin
  v_profil := app.nutrition_profile_for_writing(p_profile_id, true);
  if p_expected is distinct from v_profil.updated_at then
    raise exception 'nutrition profile changed meanwhile' using errcode = '40001';
  end if;

  update public.nutrition_profiles
     set height_cm = p_height_cm,
         formula_sex = p_formula_sex,
         body_fat_percent = p_body_fat_percent,
         activity_pal = p_activity_pal,
         goal = p_goal,
         bmr_formula = coalesce(p_bmr_formula, 'standard'),
         -- Ein unverändertes Zielgewicht behält, wer es gewählt hat.
         target_weight_source = case
           when p_target_weight_kg is null then null
           when p_target_weight_kg = v_profil.target_weight_kg then v_profil.target_weight_source
           else 'counsellor'
         end,
         target_weight_kg = p_target_weight_kg,
         updated_at = v_jetzt,
         updated_by = auth.uid()
   where id = v_profil.id;
  return v_jetzt;
end;
$$;

revoke all on function public.update_nutrition_profile(
  uuid, timestamptz, smallint, text, numeric, numeric, text, text, numeric
) from public, anon;
grant execute on function public.update_nutrition_profile(
  uuid, timestamptz, smallint, text, numeric, numeric, text, text, numeric
) to authenticated;

comment on function public.update_nutrition_profile(
  uuid, timestamptz, smallint, text, numeric, numeric, text, text, numeric
) is
  'ERN-001 (ADR-027 Punkte 5, 16 bis 21): ändert Körperdaten, Aktivität, Ziel, Formel und Zielgewicht eines laufenden Profils mit Einwilligung. p_expected ist updated_at beim Laden (40001, wenn inzwischen geändert). Allein app.can_counsel_nutrition.';

create function public.set_nutrition_overrides(
  p_profile_id     uuid,
  p_energy_kcal    smallint,
  p_protein_g      smallint,
  p_fat_g          smallint,
  p_carbohydrate_g smallint,
  p_water_ml       smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  v_profil := app.nutrition_profile_for_writing(p_profile_id, true);
  -- Punkt 22: jeder Wert überschreibbar, auch unter die Untergrenzen; leer
  -- heißt wieder berechnet. Die Bereiche prüfen die Constraints.
  update public.nutrition_profiles
     set energy_kcal_override = p_energy_kcal,
         protein_g_override = p_protein_g,
         fat_g_override = p_fat_g,
         carbohydrate_g_override = p_carbohydrate_g,
         water_ml_override = p_water_ml,
         updated_at = clock_timestamp(),
         updated_by = auth.uid()
   where id = v_profil.id;
end;
$$;

revoke all on function public.set_nutrition_overrides(uuid, smallint, smallint, smallint, smallint, smallint)
  from public, anon;
grant execute on function public.set_nutrition_overrides(uuid, smallint, smallint, smallint, smallint, smallint)
  to authenticated;

comment on function public.set_nutrition_overrides(uuid, smallint, smallint, smallint, smallint, smallint) is
  'ERN-001 (ADR-027 Punkt 22): Überschreibungen der Beratung für Energie, Eiweiß, Fett, Kohlenhydrate und Wasser; leer heißt berechnet. Auch unter Grundumsatz - dann gekennzeichnet. Allein app.can_counsel_nutrition, laufendes Profil mit Einwilligung.';

create function public.set_nutrition_notes(p_profile_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  v_profil := app.nutrition_profile_for_writing(p_profile_id, true);
  update public.nutrition_profiles
     set notes = nullif(btrim(p_notes), ''),
         updated_at = clock_timestamp(),
         updated_by = auth.uid()
   where id = v_profil.id;
end;
$$;

revoke all on function public.set_nutrition_notes(uuid, text) from public, anon;
grant execute on function public.set_nutrition_notes(uuid, text) to authenticated;

comment on function public.set_nutrition_notes(uuid, text) is
  'ERN-001 (ADR-027 Punkt 5): Notizen der Beratung (bis 4000 Zeichen), intern - in keiner Plattformprojektion. Allein app.can_counsel_nutrition.';

-- -----------------------------------------------------------------------------
-- 9. Gewicht, Einwilligung, Ende
-- -----------------------------------------------------------------------------
create function public.record_nutrition_weight(
  p_profile_id  uuid,
  p_measured_on date,
  p_weight_kg   numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  v_profil := app.nutrition_profile_for_writing(p_profile_id, true);
  if p_measured_on is null or p_weight_kg is null then
    raise exception 'date and weight are required' using errcode = '22023';
  end if;
  if p_measured_on > app.training_today(v_profil.organization_id) then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;
  if p_measured_on < v_profil.started_on then
    raise exception 'date before the profile' using errcode = '22023';
  end if;

  insert into public.nutrition_weight_entries (
    organization_id, profile_id, measured_on, weight_kg, source, recorded_by
  )
  values (v_profil.organization_id, v_profil.id, p_measured_on, p_weight_kg, 'practice', auth.uid())
  on conflict (profile_id, measured_on) do update
     set weight_kg = excluded.weight_kg,
         source = 'practice',
         platform_access_id = null,
         platform_access_kind = null,
         recorded_at = now(),
         recorded_by = excluded.recorded_by;
end;
$$;

revoke all on function public.record_nutrition_weight(uuid, date, numeric) from public, anon;
grant execute on function public.record_nutrition_weight(uuid, date, numeric) to authenticated;

comment on function public.record_nutrition_weight(uuid, date, numeric) is
  'ERN-001 (ADR-027 Punkt 5): Gewicht durch die Beratung, eines je Tag - ein zweiter Eintrag am selben Tag ersetzt den ersten. Nicht in der Zukunft, nicht vor dem Profil. Laufendes Profil mit Einwilligung, allein app.can_counsel_nutrition.';

create function public.record_nutrition_consent(
  p_profile_id  uuid,
  p_record_kind text,
  p_occurred_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_letzte public.nutrition_consent_records%rowtype;
  v_zeit   timestamptz;
  v_id     uuid;
begin
  -- Erteilen und Widerrufen gehen ohne bestehende Einwilligung.
  v_profil := app.nutrition_profile_for_writing(p_profile_id, false);
  if p_record_kind is null or p_record_kind not in ('consent_granted', 'consent_withdrawn') then
    raise exception 'unknown record kind' using errcode = '22023';
  end if;
  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  if p_occurred_on > app.training_today(v_profil.organization_id) then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  v_letzte := app.nutrition_consent(v_profil.id);
  if p_record_kind = 'consent_granted' and v_letzte.record_kind is not distinct from 'consent_granted' then
    raise exception 'consent already granted' using errcode = '23514';
  end if;
  if p_record_kind = 'consent_withdrawn' then
    if v_letzte.record_kind is distinct from 'consent_granted' then
      raise exception 'no consent to withdraw' using errcode = '23514';
    end if;
    if p_occurred_on < v_letzte.occurred_on then
      raise exception 'withdrawal before consent' using errcode = '22023';
    end if;
  end if;

  -- Der jüngste Vermerk, auch neben einem gleichzeitigen (wie POR-016).
  select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
  from public.nutrition_consent_records r where r.profile_id = v_profil.id;

  insert into public.nutrition_consent_records (
    organization_id, profile_id, record_kind, occurred_on, recorded_at, recorded_by
  )
  values (v_profil.organization_id, v_profil.id, p_record_kind, p_occurred_on,
          coalesce(v_zeit, now()), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_nutrition_consent(uuid, text, date) from public, anon;
grant execute on function public.record_nutrition_consent(uuid, text, date) to authenticated;

comment on function public.record_nutrition_consent(uuid, text, date) is
  'ERN-001 (ADR-027 Punkt 3): Einwilligung "Ernährungsberatung" vom Papier erneut vermerken oder ihren Widerruf - an einem laufenden Profil. Der Nachweis steht am Datensatz, kein Auditeintrag (ADR-010 Fassung 3). Allein app.can_counsel_nutrition.';

create function public.end_nutrition_profile(p_profile_id uuid, p_ended_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  -- Beenden geht auch ohne Einwilligung - damit nichts gegen den Willen
  -- weiterläuft.
  v_profil := app.nutrition_profile_for_writing(p_profile_id, false);
  if p_ended_on is null or p_ended_on > app.training_today(v_profil.organization_id) then
    raise exception 'end date not allowed' using errcode = '22023';
  end if;
  if p_ended_on < v_profil.started_on then
    raise exception 'end before start' using errcode = '22023';
  end if;
  update public.nutrition_profiles
     set ended_on = p_ended_on,
         ended_by = auth.uid(),
         updated_at = clock_timestamp(),
         updated_by = auth.uid()
   where id = v_profil.id;
end;
$$;

revoke all on function public.end_nutrition_profile(uuid, date) from public, anon;
grant execute on function public.end_nutrition_profile(uuid, date) to authenticated;

comment on function public.end_nutrition_profile(uuid, date) is
  'ERN-001 (ADR-027 Punkt 2): beendet die Beratung - das Ende ist der Fristanker (Punkt 6). Danach ist das Profil unveränderlich und die Plattform zeigt es nicht mehr. Auch ohne Einwilligung. Allein app.can_counsel_nutrition.';
-- -----------------------------------------------------------------------------
-- 10. Löschlauf (ADR-008 Fassung 6, ANN-619)
--
-- Drei Jahre nach dem Ende des Profils, endgültig, mit Eintrag im
-- Löschjournal; Einwilligung und Gewicht fallen mit (cascade). Fällt das
-- Verhältnis früher, fällt das Profil mit ihm (cascade). Ein Legal Hold an
-- der Akte hält; am Trainingsverhältnis gibt es keinen (wie dort).
-- -----------------------------------------------------------------------------
create function app.delete_due_nutrition_profiles(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  with faellig as (
    select p.id, p.organization_id,
           app.retention_due_at(
             p.ended_on, app.retention_interval('ernaehrungsberatung'), p_time_zone
           ) as due_at
    from public.nutrition_profiles p
    where p.organization_id = p_org
      and p.ended_on is not null
      -- ANN-619: ein Legal Hold an der Akte hält auch die Beratung.
      and (p.patient_id is null or not app.under_legal_hold(p_org, 'patient', p.patient_id))
  ),
  geloescht as (
    delete from public.nutrition_profiles p
    using faellig f
    where p.id = f.id and f.due_at <= now()
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'nutrition_profiles', g.id, 'ernaehrungsberatung', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_nutrition_profiles(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_nutrition_profiles(uuid, text, uuid) is
  'ERN-001 (ADR-008 Fassung 6, ANN-619): löscht Ernährungsprofile drei Jahre nach ihrem Ende endgültig, mit Einwilligung und Gewicht und mit Eintrag im Löschjournal. Ein Legal Hold an der Akte hält. Aufgerufen aus public.apply_retention().';

-- Der Lauf ruft die Ernährungsberatung mit auf - sonst unverändert (Stand TEAM-001).

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
  v_zeitkonto integer;
  v_erstattung integer;
  v_rueckmeldung integer;
  v_teamchat     integer;
  v_ernaehrung   integer;
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
    -- ZK-001 (ANN-597): Zeitkonto - gültige Einträge drei Jahre ab Ende
    -- ihres Jahres, ihr Saldo bleibt als Übertrag; zurückgewiesene und
    -- zurückgenommene ein Jahr nach ihrem Ende. Ohne Patientenbezug.
    -- -------------------------------------------------------------------
    v_zeitkonto := app.delete_due_time_account_entries(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ERS-001 (ANN-602): Erstattungen - ausgezahlte acht Jahre ab Ende des
    -- Jahres der Auszahlung (Par. 147 AO), abgelehnte und zurückgezogene ein
    -- Jahr; die Belege fallen mit, ihre Objekte über den Löschauftrag.
    -- -------------------------------------------------------------------
    v_erstattung := app.delete_due_reimbursements(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ORG-006 (ANN-607): Rückmeldungen von Beschäftigten - zwölf Monate ab
    -- Ende des Monats der Abgabe, endgültig; Teilnahmemarken nach ihrem
    -- Monat. Bewusst NICHT in der Zusammenfassung unten (ADR-010 Punkt 17,
    -- §20.2): Der Nachweis ist das Löschjournal.
    -- -------------------------------------------------------------------
    v_rueckmeldung := app.delete_due_staff_feedback(v_org.id, v_org.time_zone, v_run);
    -- TEAM-001: der Teamchat (ANN-610).
    v_teamchat := app.delete_due_team_messages(v_org.id, v_org.time_zone, v_run);
    -- ERN-001 (ANN-619): Ernährungsberatung - drei Jahre nach dem Ende des
    -- Profils; ein Legal Hold an der Akte hält.
    v_ernaehrung := app.delete_due_nutrition_profiles(v_org.id, v_org.time_zone, v_run);

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
                + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung + v_rueckmeldung + v_teamchat
                + v_ernaehrung;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung + v_teamchat + v_ernaehrung > 0
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
          'zeitkonto', v_zeitkonto,
          'erstattung', v_erstattung,
          'teamchat', v_teamchat,
          'ernaehrungsberatung', v_ernaehrung,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore fallen Ernährungsprofile wie alle anderen erneut.

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
    -- ZK-001: ein Eintrag im Zeitkonto; seine Abweichung faellt mit ihm
    -- (cascade).
    'staff_time_account_entries',
    -- ERS-001: einzeln verworfene Belege vor ihrem Antrag; eine Erstattung
    -- nimmt ihre übrigen Belege mit (cascade), deren Objekte über den
    -- Löschauftrag.
    'staff_reimbursement_receipts',
    'staff_reimbursements',
    -- ORG-006: Rückmeldungen von Beschäftigten hängen an keiner anderen Zeile.
    'staff_feedback',
    -- TEAM-001: erst geleerte Inhalte (die Zeile bleibt als Anker), dann
    -- Nachrichten vor ihren Gesprächen; Antworten, Erwähnungen und Lesestand
    -- fallen mit (cascade).
    'team_message_contents',
    'team_messages',
    'team_channels',
    -- ERN-001: das Ernährungsprofil vor seinem Verhältnis; Einwilligung und
    -- Gewicht fallen mit ihm (cascade).
    'nutrition_profiles',
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
    -- TEAM-001: Nur der Inhalt fiel (Anker mit Antworten) - leeren, nicht
    -- löschen, sonst nähme cascade die Antworten mit. Wer entfernt hat, steht
    -- nach einem Restore nicht mehr fest; der Anker heißt dann „gelöscht“.
    elsif v_tabelle = 'team_message_contents' then
      delete from public.team_message_mentions where message_id = any (v_ids);
      with g as (
        update public.team_messages
           set body = null, edited_at = null, author_staff_member_id = null,
               removed_at = coalesce(removed_at, now()),
               removed_kind = coalesce(removed_kind, 'author')
         where id = any (v_ids) and body is not null
        returning id
      )
      select array_agg(id) into v_geloescht from g;
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

  -- ORG-006 (Nachprüfung N2): Anonyme Rückmeldungen schreibt der Lauf mit
  -- neuer Kennung neu - ein älteres Backup trägt andere Kennungen als das
  -- Journal. Was nach dem Restore über der Frist liegt, fällt hier nach der
  -- Regel selbst, nicht erst im nächsten Lauf.
  delete from public.staff_feedback f
  using public.organizations o
  where o.id = f.organization_id
    and app.retention_due_at(
          (f.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          o.time_zone
        ) <= now();

  -- TEAM-001: Fällige Ausgangsnachrichten mit laufenden Antworten verlieren
  -- ihren Inhalt nach der Regel, nicht über das Journal (ANN-610).
  perform app.strip_due_team_anchors(o.id, o.time_zone) from public.organizations o;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 11. Auskunft (Art. 15): + nutrition_profiles
--
-- Aus 20261121100000_bef_124_verordnung_mit_verlauf.sql (jüngste Fassung);
-- neu ist nur 'nutrition_profiles'. Profile am Trainingsverhältnis stehen in
-- dessen Auskunft (heute: der Export der Plattform), nicht hier (ADR-021).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'take_along_items', v.take_along_items,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'fee_waived_at', t.fee_waived_at,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- BEF-124: fruehere Staende der Grundlagen gehoeren zur Auskunft wie die
    -- Versionen der Dokumentation (Art. 15 DSGVO).
    'treatment_basis_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'treatment_basis_id', gv.treatment_basis_id,
        'version_no', gv.version_no,
        'content', gv.content,
        'replaced_at', gv.replaced_at,
        'replaced_by', (
          select up.display_name from public.user_profiles up where up.id = gv.replaced_by
        )
      ) order by gv.replaced_at, gv.version_no)
      from public.treatment_basis_versions gv
      join public.treatment_bases g on g.id = gv.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        -- OFF-002: Uhr des Geraets bei einem ohne Verbindung geschriebenen Entwurf.
        'reported_written_at', d.reported_written_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at,
        'photo_locked_at', da.photo_locked_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Die Fotos gehoeren zur vollstaendigen Kopie, auch
    -- gesperrte, solange sie vorhanden sind. Die Datei selbst gibt owner je
    -- Foto heraus (hand_out_patient_photo, protokolliert); dieser Abschnitt
    -- ist die Liste dazu.
    'patient_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fo.id,
        'display_name', fo.display_name,
        'art', fo.document_type,
        'aufgenommen_am', fo.created_at,
        'gesperrt', not app.patient_photo_usable(fo.document_type, fo.patient_id, fo.created_at, fo.photo_locked_at),
        'datei_vorhanden', exists (
          select 1 from storage.objects o
          where o.bucket_id = app.patient_file_bucket_for(fo.document_type) and o.name = fo.object_key)
      ) order by fo.created_at)
      from public.patient_files fo
      where fo.patient_id = p_patient_id
        and app.is_patient_photo_type(fo.document_type)
        and fo.status = 'ready'
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Datum und Zweck der Zugriffe aus dem Auditlog -
    -- ohne Namen und ohne Kennung der Beschaeftigten (Art. 15 Abs. 4 DSGVO);
    -- eine begruendete Ausnahme prueft owner im Einzelfall (ANN-092).
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zeitpunkt', al.occurred_at,
        'aktion', al.action,
        'gegenstand', al.subject_type,
        'ergebnis', al.outcome,
        'durch', case al.actor_kind
                   when 'user' then 'praxis'
                   when 'system' then 'system'
                   when 'platform' then 'person_selbst'
                   when 'representative' then 'vertretung'
                 end
      ) order by al.occurred_at)
      from public.audit_log al
      where al.organization_id = v_org
        -- LOG-EPIC-001: Zugriffe, keine Abweisungen. Die Aktionen sind seit
        -- ADR-010 Fassung 3 ohnehin nur noch, was die Daten nicht zeigen.
        and al.outcome = 'success'
        -- Auch die Zugriffe auf zusammengefuehrte Doppelanlagen gehoeren
        -- zu dieser Person (ABN-018, BEF-108).
        and ((al.subject_type = 'patient' and al.subject_id = any(array(
                select p_patient_id
                union all
                select mr2.source_patient_id from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
             or al.context ->> 'patient_id' = any(array(
                select p_patient_id::text
                union all
                select mr2.source_patient_id::text from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
    ), '[]'::jsonb),

    -- ABN-018 (BEF-108): Nachweise des Zusammenfuehrens an dieser Akte.
    'patient_merge_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'merged_at', mr.merged_at,
        'source_patient_id', mr.source_patient_id,
        'counts', mr.counts
      ) order by mr.merged_at)
      from public.patient_merge_records mr
      where mr.target_patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ANG-001: das Nachsorge-Abo mit Beginn, Ende und Kuendigung (Art. 15).
    'aftercare_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_on', s.starts_on,
        'ends_on', s.ends_on,
        'created_at', s.created_at,
        'cancelled_on', s.cancelled_on,
        'cancelled_via', s.cancelled_via,
        'cancelled_access_kind', s.cancelled_access_kind,
        'cancelled_representative_name', s.cancelled_representative_name
      ) order by s.starts_on)
      from public.aftercare_subscriptions s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KND-002: die Trainingsangebote aus der Akte mit Uebergabeangaben (Art. 15).
    'training_offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.label,
        'starts_on', o.starts_on,
        'valid_until', o.valid_until,
        'handover_items', o.handover_items,
        'offers_contact', o.offers_contact,
        'created_at', o.created_at,
        'withdrawn_at', o.withdrawn_at
      ) order by o.created_at)
      from public.training_offers o
      join public.service_catalog_items c on c.id = o.catalog_item_id
      where o.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- UEB-005: die Uebungsplaene der Behandlung mit Positionen (Art. 15).
    'exercise_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', x.title,
        'status', x.status,
        'sessions_per_week', x.sessions_per_week,
        'created_at', x.created_at,
        'assigned_at', x.assigned_at,
        'runs_from', x.runs_from,
        'runs_until', x.runs_until,
        'ended_at', x.ended_at,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(xi) - 'id' - 'variant_id'
                           - 'previous_item_id' - 'variant_archived' order by xi.position)
          from public.exercise_plan_items xi where xi.plan_id = x.id
        ), '[]'::jsonb),
        -- UEB-011: die Uebungstage, die die Person an diesem Plan gewaehlt hat.
        'weekdays', (select to_jsonb(d.weekdays) from public.exercise_plan_days d
                     where d.plan_id = x.id),
        -- UEB-010: die durchgefuehrten Einheiten, ohne interne Kennung.
        'sessions', (
          select coalesce(jsonb_agg(z - 'id'), '[]'::jsonb)
          from jsonb_array_elements(app.exercise_plan_sessions_json(x.id)) z
        )
      ) order by x.created_at)
      from public.exercise_plans x
      where x.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KOM-004: die Rueckfragen ueber die Plattform mit allen Eintraegen
    -- (Art. 15), zugeordnete und nicht zugeordnete.
    'platform_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'topic', m.topic,
        'reference_label', m.reference_label,
        'status', m.status,
        'created_at', m.created_at,
        'closed_at', m.closed_at,
        'record_assigned_at', m.record_assigned_at,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'side', e.side,
            'author_kind', e.author_kind,
            'author_label', e.author_label,
            'body', e.body,
            'created_at', e.created_at
          ) order by e.created_at, e.id)
          from public.platform_message_entries e where e.message_id = m.id
        ), '[]'::jsonb)
      ) order by m.created_at)
      from public.platform_messages m
      where m.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- BEF-144: die Terminwuensche ueber die Plattform (POR-009) mit Tagen,
    -- Tageszeiten, Notiz, Zustand und Antwort der Praxis (Art. 15), offene wie
    -- beantwortete. Wer gewuenscht hat, steht wie in der Praxisliste (POR-011):
    -- die Person selbst oder die Vertretung mit Namen.
    'platform_appointment_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', w.kind,
        'appointment_id', w.appointment_id,
        'preferred_days', to_jsonb(w.preferred_days),
        'preferred_times', to_jsonb(w.preferred_times),
        'note', w.note,
        'status', w.status,
        'requested_by', z.access_kind,
        'representative_name', case when z.access_kind <> 'self' then z.representative_name end,
        'created_at', w.created_at,
        'resolved_at', w.resolved_at,
        'answer', w.answer,
        'resulting_appointment_id', w.resulting_appointment_id
      ) order by w.created_at, w.id)
      from public.platform_appointment_requests w
      join public.platform_accesses z on z.id = w.created_by_access_id
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- TRK-002: Takt und Fragen des Check-ins (Art. 15), ohne bearbeitendes
    -- Praxiskonto.
    'checkin_schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'interval_days', s.interval_days,
        'parameter_keys', to_jsonb(s.parameter_keys),
        'starts_on', s.starts_on,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ))
      from public.checkin_schedules s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- TRK-002: die beantworteten Check-ins mit ihren Angaben, unveraendert.
    'checkins', app.checkins_json('treatment', p_patient_id),

    -- ALT-003: Gewohnheiten mit den vermerkten Tagen (Art. 15), ohne
    -- Praxiskonto und Zugang.
    'habits', app.habits_json('treatment', p_patient_id),

    -- ERN-001 (ADR-027 Punkt 6): die Ernaehrungsberatung an dieser Akte -
    -- Profil, Einwilligung mit Verlauf, Gewicht, Zielwerte mit Rechenweg und
    -- Notizen, auch beendete Profile. Die Auskunft erteilt owner, der die
    -- Faehigkeit traegt (ADR-027 Punkt 4).
    'nutrition_profiles', coalesce((
      select jsonb_agg(app.nutrition_profile_json(n.id) order by n.started_on, n.created_at)
      from public.nutrition_profiles n
      where n.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- BEF-145: die Zugaenge zur Plattform an dieser Akte (Art. 15) - der
    -- eigene und die einer Vertretung oder Begleitung, mit Zustand und
    -- Zeitpunkten, Grundlage, Umfang und Art der angesehenen Nachweise
    -- (ANN-342). Keine Kennung von Zugang, Konto, Verhaeltnis oder
    -- bearbeitendem Praxiskonto.
    'platform_accesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'access_kind', z.access_kind,
        'representative_name', z.representative_name,
        'legal_basis', z.legal_basis,
        'proof_documents', to_jsonb(z.proof_documents),
        'proof_recorded_at', z.proof_recorded_at,
        'health_scope', z.health_scope,
        'finance_scope', z.finance_scope,
        'consent_text_version', z.consent_text_version,
        'consent_recorded_at', z.consent_recorded_at,
        'consent_earlier_messages', z.consent_earlier_messages,
        'companion_declined_at', z.companion_declined_at,
        'companion_declined_reason', z.companion_declined_reason,
        'status', z.status,
        'created_at', z.created_at,
        'activated_at', z.activated_at,
        'locked_at', z.locked_at,
        'revoked_at', z.revoked_at,
        'revoked_reason', z.revoked_reason,
        'onboarding_finished_at', z.onboarding_finished_at,
        'onboarding_skipped_at', z.onboarding_skipped_at
      ) order by z.created_at, z.id)
      from public.platform_accesses z
      where z.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABR-030: Honorarvereinbarungen sind Daten zur Person (Art. 15 DSGVO).
    -- ABR-031: das festgeschriebene Terminhonorar je Termin (Art. 15 DSGVO).
    'session_fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', f.appointment_id,
        'performed_on', f.performed_on,
        'amount_cents', f.amount_cents,
        'source', f.source,
        'created_at', f.created_at
      ) order by f.performed_on)
      from public.appointment_session_fees f
      join public.appointments a on a.id = f.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    'fee_agreements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'valid_from', f.valid_from,
        'session_fee_cents', f.session_fee_cents,
        'created_at', f.created_at
      ) order by f.valid_from)
      from public.patient_fee_agreements f
      where f.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at,
        -- POR-016: Herkunft, Vertretung und Textfassung (Zweitreview).
        'source', pr.source,
        'platform_access_kind', pr.platform_access_kind,
        'representative_name', pr.representative_name,
        'wording_version', pr.wording_version
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at,
        -- ABN-013 (BEF-102): Ein entferntes Ereignis bleibt Teil der Akte.
        'removed_at', ce.removed_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-015: gesicherte, noch nicht uebernommene Befundangaben.
    'treatment_draft_findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', df.appointment_id,
        'findings', df.findings,
        'updated_at', df.updated_at
      ) order by df.updated_at)
      from public.treatment_draft_findings df
      join public.appointments a on a.id = df.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien und Fotos',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme und jedes Foto, auch gesperrte; die Datei selbst wird je Datei herausgegeben (ADR-017, ANN-128).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- 12. Zusammenführen: Ernährungsprofile ziehen mit, zwei laufende sperren
--
-- Aus 20261110120000_alt_003_habits.sql (jüngste Fassung).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_plan        jsonb;
  v_quelle      public.patients%rowtype;
  v_ziel        public.patients%rowtype;
  v_person      uuid;
  v_status      text;
  v_ende_on     date;
  v_ende_at     timestamptz;
  v_ende_by     uuid;
  v_beginn      date;
  v_anschrift   boolean;
  v_fotos       integer := 0;
  v_sperre      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  -- Beide Akten sperren, in fester Reihenfolge - zwei gleichzeitige Vorgaenge
  -- ueber dasselbe Paar warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source_patient_id, p_target_patient_id)
    and p.organization_id = v_org
  order by p.id
  for update;

  select * into v_quelle from public.patients p
  where p.id = p_source_patient_id and p.organization_id = v_org;
  select * into v_ziel from public.patients p
  where p.id = p_target_patient_id and p.organization_id = v_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Was vor dem Zusammenfuehren schon faellig war, faellt unter dem Stand, der
  -- es faellig gemacht hat (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_quelle.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben geloeschtes Foto ist
  -- nicht mitgewandert und steht schon in photos_deleted.
  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147) --------------------------------------------------
  if exists (select 1 from public.patient_contact_details c where c.patient_id = v_ziel.id) then
    select coalesce(z.street, z.house_number, z.postal_code, z.city) is null
       and coalesce(q.street, q.house_number, q.postal_code, q.city) is not null
      into v_anschrift
    from public.patient_contact_details z
    left join public.patient_contact_details q on q.patient_id = v_quelle.id
    where z.patient_id = v_ziel.id;

    update public.patient_contact_details z
       set date_of_birth = coalesce(z.date_of_birth, q.date_of_birth),
           email         = coalesce(z.email, q.email),
           phone         = coalesce(z.phone, q.phone),
           phone_mobile  = coalesce(z.phone_mobile, q.phone_mobile),
           phone_work    = coalesce(z.phone_work, q.phone_work),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Trigger die Koordinate bei jeder
    -- Adressaenderung leert: Die Anschrift kommt mit ihrer Verortung.
    if v_anschrift then
      update public.patient_contact_details z
         set lat = q.lat, lon = q.lon, geocode_precision = q.geocode_precision
        from public.patient_contact_details q
       where z.patient_id = v_ziel.id
         and q.patient_id = v_quelle.id;
    end if;
  else
    update public.patient_contact_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  if exists (select 1 from public.patient_care_details d where d.patient_id = v_ziel.id) then
    update public.patient_care_details z
       set primary_therapist_staff_member_id =
             coalesce(z.primary_therapist_staff_member_id, q.primary_therapist_staff_member_id),
           treatment_table_required = coalesce(z.treatment_table_required, q.treatment_table_required),
           home_visit_access_note = app.merge_note(z.home_visit_access_note, q.home_visit_access_note),
           special_note           = app.merge_note(z.special_note, q.special_note),
           remark                 = app.merge_note(z.remark, q.remark),
           take_along_items       = app.merge_take_along(z.take_along_items, q.take_along_items)
      from public.patient_care_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;
  else
    update public.patient_care_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  -- Der Bezug wechselt ----------------------------------------------------
  -- Zwei Standardempfaenger kann es nicht geben; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ABR-030: Die Honorarvereinbarungen ziehen mit; gleiche Tage sperrt der Plan.
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ANG-001: Das Nachsorge-Abo zieht mit; sich ueberschneidende sperrt der Plan.
  update public.aftercare_subscriptions      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.training_offers              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- UEB-004: Die Behandlungsplaene ziehen mit; der Riegel laesst nur patient_id wechseln.
  update public.exercise_plans               set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- KOM-004: Rueckfragen ueber die Plattform ziehen mit, zugeordnete wie
  -- nicht zugeordnete - sonst fielen sie mit der Dublette (cascade). Der
  -- Riegel an der Zuordnung laesst das Verhaeltnis nur hier wechseln.
  update public.platform_messages
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- BEF-131: Terminwuensche ueber die Plattform ziehen mit, offene wie
  -- beantwortete - sonst fielen sie mit der Dublette (cascade). Der
  -- Plattformzugang der Dublette bleibt als Nachweis (set null, BEF-132).
  update public.platform_appointment_requests
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- TRK-002: Check-ins ziehen mit, sonst fielen sie mit der Dublette
  -- (cascade). Den Takt behaelt die bleibende Akte; hat sie keinen, zieht
  -- der der Dublette mit (ANN-350).
  update public.checkins
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  if exists (select 1 from public.checkin_schedules s where s.patient_id = v_ziel.id) then
    delete from public.checkin_schedules where patient_id = v_quelle.id;
  else
    update public.checkin_schedules
       set patient_id = v_ziel.id, relationship_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;
  -- ALT-003: Gewohnheiten ziehen mit ihren Tagen mit, sonst fielen sie mit
  -- der Dublette (cascade). Mehr als drei laufende sind danach moeglich; die
  -- Grenze gilt beim Eintragen (ANN-370).
  update public.habits
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- ERN-001: Ernaehrungsprofile ziehen mit Einwilligung und Gewicht mit, sonst
  -- fielen sie mit der Dublette (cascade). Zwei laufende sperrt der Plan. Bewusst
  -- ohne Zaehler im Vermerk: Den lesen auch Rollen ohne die Faehigkeit (ADR-027
  -- Punkt 4).
  update public.nutrition_profiles
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Seit ABN-018
  -- (BEF-108) bleiben alle Gruende wirksam: Eine Akte kann mehrere aktive
  -- Sperren tragen, keine wird beim Zusammenfuehren aufgehoben.
  v_sperre := null;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Fruehere Nachweise der Dublette ziehen mit (ABN-018).
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148) --------------------------------------------
  v_status := case
    when v_quelle.status = 'active' or v_ziel.status = 'active' then 'active'
    else 'inactive'
  end;
  v_beginn := least(v_quelle.care_started_on, v_ziel.care_started_on);

  if v_quelle.care_concluded_on is null or v_ziel.care_concluded_on is null then
    null;
  elsif (v_quelle.care_concluded_on, v_quelle.care_concluded_at)
        > (v_ziel.care_concluded_on, v_ziel.care_concluded_at) then
    v_ende_on := v_quelle.care_concluded_on;
    v_ende_at := v_quelle.care_concluded_at;
    v_ende_by := v_quelle.care_concluded_by;
  else
    v_ende_on := v_ziel.care_concluded_on;
    v_ende_at := v_ziel.care_concluded_at;
    v_ende_by := v_ziel.care_concluded_by;
  end if;

  update public.patients
     set status            = v_status,
         care_started_on   = v_beginn,
         care_concluded_on = v_ende_on,
         care_concluded_at = v_ende_at,
         care_concluded_by = v_ende_by
   where id = v_ziel.id;

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein
  -- Widerruf in der einen trifft die aelteren Fotos der anderen - sofort,
  -- wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die leere Akte faellt (ANN-150) -----------------------------------------
  -- Was noch an ihr haengt, faellt mit ihr (Kontakt und Versorgungsangaben der
  -- Dublette, soweit sie in die bleibende Akte eingeflossen sind).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  -- Die Person nur, wenn nichts anderes an ihr haengt: Mitarbeiter:in, Konto,
  -- Trainingsverhaeltnis (ADR-021) bleiben, wie sie sind.
  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  -- Nachweis an der bleibenden Akte, so lange wie sie (ABN-018, BEF-108):
  -- nicht allein im dreijaehrigen Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted
  )
  values (v_org, v_ziel.id, v_quelle.id, v_actor, v_plan -> 'counts', v_fotos);


  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$function$;

CREATE OR REPLACE FUNCTION app.patient_merge_plan(p_organization_id uuid, p_source uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quelle     record;
  v_ziel       record;
  v_konflikte  text[] := '{}';
  v_angehaengt text[] := '{}';
  v_sperren    text[] := '{}';
  v_zaehler    jsonb;
  v_text       text;
  v_feld       text;
begin
  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_quelle
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_source and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_ziel
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_target and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Felder, in denen beide Akten etwas anderes tragen: Die bleibende gewinnt,
  -- die Vorschau zeigt beide (ANN-147). Die Anschrift zaehlt als ein Feld.
  foreach v_feld in array array[
    'given_name', 'family_name', 'date_of_birth', 'email', 'phone', 'phone_mobile',
    'phone_work', 'institution', 'primary_therapist_staff_member_id',
    'treatment_table_required'
  ] loop
    if (to_jsonb(v_quelle) ->> v_feld) is not null
       and (to_jsonb(v_ziel) ->> v_feld) is not null
       and lower(btrim(to_jsonb(v_quelle) ->> v_feld)) <> lower(btrim(to_jsonb(v_ziel) ->> v_feld)) then
      v_konflikte := v_konflikte || v_feld;
    end if;
  end loop;

  if coalesce(v_quelle.street, v_quelle.house_number, v_quelle.postal_code, v_quelle.city) is not null
     and coalesce(v_ziel.street, v_ziel.house_number, v_ziel.postal_code, v_ziel.city) is not null
     and row(lower(v_quelle.street), lower(v_quelle.house_number), v_quelle.postal_code, lower(v_quelle.city))
         is distinct from
         row(lower(v_ziel.street), lower(v_ziel.house_number), v_ziel.postal_code, lower(v_ziel.city)) then
    v_konflikte := v_konflikte || 'address'::text;
  end if;

  -- Freitexte: angehaengt, nie verworfen - aber nie ueber die Grenze der
  -- Spalte hinaus gekuerzt. Dann sperrt der Vorgang (ANN-149).
  v_text := app.merge_note(v_ziel.home_visit_access_note, v_quelle.home_visit_access_note);
  if v_text is distinct from v_ziel.home_visit_access_note and v_ziel.home_visit_access_note is not null then
    v_angehaengt := v_angehaengt || 'home_visit_access_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.special_note, v_quelle.special_note);
  if v_text is distinct from v_ziel.special_note and v_ziel.special_note is not null then
    v_angehaengt := v_angehaengt || 'special_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.remark, v_quelle.remark);
  if v_text is distinct from v_ziel.remark and v_ziel.remark is not null then
    v_angehaengt := v_angehaengt || 'remark'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 2000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  if not app.take_along_items_valid(
    app.merge_take_along(v_ziel.take_along_items, v_quelle.take_along_items)
  ) then
    v_sperren := v_sperren || 'take_along_too_many'::text;
  end if;

  -- Ein Konto an der Dublette: Es verloere seine Akte. Das klaert die Praxis
  -- vorher, nicht der Vorgang (ANN-149).
  if exists (
    select 1 from public.user_profiles up where up.person_id = v_quelle.person_id
  ) then
    v_sperren := v_sperren || 'source_has_account'::text;
  end if;

  -- BEF-132: Ein Plattformzugang an der Dublette endete mit ihr, und die
  -- Person saehe die Antworten auf ihre Rueckfragen nicht mehr, die zur
  -- bleibenden Akte ziehen. Jeder Zugang, der nicht entzogen ist - auch eine
  -- offene Einladung oder ein gesperrter Zugang -, sperrt; die Praxis
  -- entzieht ihn vorher und laedt an der bleibenden Akte ein (ANN-149,
  -- ADR-023 Punkt 5: der Vorgang aendert keinen Zugang).
  if exists (
    select 1 from public.platform_accesses z
    where z.patient_id = p_source and z.status <> 'revoked'
  ) then
    v_sperren := v_sperren || 'source_has_platform_access'::text;
  end if;

  -- Zwei Entwuerfe fuer denselben Monat und Bereich: Einer muss vorher weg.
  if exists (
    select 1
    from public.invoices q
    join public.invoices z
      on z.patient_id = p_target
     and z.status = 'draft'
     and z.period_month = q.period_month
     and z.service_area = q.service_area
     -- ABR-032: Entwuerfe je Grundlage stossen nicht zusammen - die
     -- Grundlagen bleiben verschieden.
     and z.treatment_basis_id is null
    where q.patient_id = p_source
      and q.status = 'draft'
      and q.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'draft_invoice_overlap'::text;
  end if;

  -- Zwei offene Eintraege ohne Grundlage auf der Warteliste. Mit Grundlage
  -- koennen sie nicht zusammenstossen: Die Grundlagen wandern mit.
  if exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_source and w.status = 'open' and w.treatment_basis_id is null
  ) and exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_target and w.status = 'open' and w.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'open_waitlist_overlap'::text;
  end if;

  -- ABR-030: Zwei Honorarvereinbarungen ab demselben Tag haetten keine
  -- Antwort auf die Frage, welche gilt.
  if exists (
    select 1
    from public.patient_fee_agreements q
    join public.patient_fee_agreements z on z.valid_from = q.valid_from
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'fee_agreement_overlap'::text;
  end if;

  -- ANG-001: Zwei Abos, deren Zeitraeume sich ueberschneiden, waeren zwei
  -- Vertraege ueber dieselbe Nachsorge; eines muss vorher entfernt sein.
  if exists (
    select 1
    from public.aftercare_subscriptions q
    join public.aftercare_subscriptions z
      on z.starts_on <= coalesce(q.ends_on, 'infinity'::date)
     and q.starts_on <= coalesce(z.ends_on, 'infinity'::date)
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'aftercare_overlap'::text;
  end if;

  -- KND-002: Je Akte hoechstens ein offenes Trainingsangebot (ANN-284).
  if exists (
    select 1
    from public.training_offers q
    join public.training_offers z
      on z.patient_id = p_target
     and app.training_offer_practice_state(z, app.training_today(p_organization_id)) = 'open'
    where q.patient_id = p_source
      and app.training_offer_practice_state(q, app.training_today(p_organization_id)) = 'open'
  ) then
    v_sperren := v_sperren || 'training_offer_overlap'::text;
  end if;

  -- ERN-001: Zwei laufende Ernaehrungsprofile waeren zwei Beratungen derselben
  -- Person (ADR-027 Punkt 1); eines muss vorher beendet sein. Zusammenfuehren
  -- darf allein owner, der die Faehigkeit traegt.
  if exists (
    select 1
    from public.nutrition_profiles q
    join public.nutrition_profiles z on z.patient_id = p_target and z.ended_on is null
    where q.patient_id = p_source and q.ended_on is null
  ) then
    v_sperren := v_sperren || 'nutrition_profile_overlap'::text;
  end if;

  v_zaehler := jsonb_build_object(
    'appointments',
      (select count(*) from public.appointments a where a.patient_id = p_source),
    'treatment_notes',
      (select count(*) from public.treatment_notes n
         join public.appointments a on a.id = n.appointment_id
        where a.patient_id = p_source),
    'treatment_bases',
      (select count(*) from public.treatment_bases b where b.patient_id = p_source),
    'billable_services',
      (select count(*) from public.billable_services s where s.patient_id = p_source),
    'invoices',
      (select count(*) from public.invoices i where i.patient_id = p_source),
    'invoices_issued',
      (select count(*) from public.invoices i where i.patient_id = p_source and i.status = 'issued'),
    'invoice_recipients',
      (select count(*) from public.invoice_recipients r where r.patient_id = p_source),
    'fee_agreements',
      (select count(*) from public.patient_fee_agreements f where f.patient_id = p_source),
    'aftercare_subscriptions',
      (select count(*) from public.aftercare_subscriptions s where s.patient_id = p_source),
    'training_offers',
      (select count(*) from public.training_offers o where o.patient_id = p_source),
    'exercise_plans',
      (select count(*) from public.exercise_plans x where x.patient_id = p_source),
    'patient_files',
      (select count(*) from public.patient_files f where f.patient_id = p_source),
    'privacy_records',
      (select count(*) from public.patient_privacy_records r where r.patient_id = p_source),
    'questionnaire_responses',
      (select count(*) from public.patient_questionnaire_responses r where r.patient_id = p_source),
    'course_events',
      (select count(*) from public.patient_course_events e where e.patient_id = p_source),
    'therapy_reports',
      (select count(*) from public.therapy_reports r where r.patient_id = p_source),
    'tasks',
      (select count(*) from public.tasks t where t.patient_id = p_source),
    -- BEF-132: ziehen seit KOM-004 und BEF-131 mit.
    'platform_messages',
      (select count(*) from public.platform_messages m where m.patient_id = p_source),
    'platform_appointment_requests',
      (select count(*) from public.platform_appointment_requests w where w.patient_id = p_source),
    -- TRK-002: Check-ins ziehen mit; den Takt der Dublette zaehlt der Plan,
    -- ob er mitzieht oder vor dem der bleibenden Akte weicht (ANN-350).
    'checkins',
      (select count(*) from public.checkins c where c.patient_id = p_source),
    'checkin_schedules',
      (select count(*) from public.checkin_schedules s where s.patient_id = p_source),
    -- ALT-003: Gewohnheiten ziehen mit.
    'habits',
      (select count(*) from public.habits h where h.patient_id = p_source),
    'waitlist_entries',
      (select count(*) from public.waitlist_entries w where w.patient_id = p_source),
    'legal_holds',
      (select count(*) from public.legal_holds h
        where h.subject_type = 'patient' and h.subject_id = p_source)
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_quelle.id, 'given_name', v_quelle.given_name, 'family_name', v_quelle.family_name,
      'date_of_birth', v_quelle.date_of_birth, 'status', v_quelle.status,
      'care_concluded_on', v_quelle.care_concluded_on
    ),
    'target', jsonb_build_object(
      'id', v_ziel.id, 'given_name', v_ziel.given_name, 'family_name', v_ziel.family_name,
      'date_of_birth', v_ziel.date_of_birth, 'status', v_ziel.status,
      'care_concluded_on', v_ziel.care_concluded_on
    ),
    'counts', v_zaehler,
    'conflicts', to_jsonb(v_konflikte),
    'appended', to_jsonb(v_angehaengt),
    'blockers', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_sperren) x)
  );
end;
$function$;
