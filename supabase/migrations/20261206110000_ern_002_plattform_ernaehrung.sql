-- =============================================================================
-- ERN-002 (ERN-EPIC-001): Ernährung auf der Plattform
--
-- ADR-027 Punkte 2, 3, 5, 21; ADR-023 Punkte 13, 19, 22 bis 24;
-- PROJECT_PRINCIPLES.md 4.6, 4.10, 4.11. Pfad A (ADR-013 Punkt 9).
--
--   app.platform_access_allows       + Recht 'nutrition' (Person, rechtliche
--                                      Vertretung; nie die Begleitung)
--   app.nutrition_platform_json      feste Schlüsselliste ohne Notizen
--   public.platform_nutrition        die eigene laufende Beratung
--   public.record_platform_nutrition_weight   Gewicht eintragen
--   public.set_platform_nutrition_target_weight  Zielgewicht wählen (≥ BMI 18,5)
--   public.set_platform_nutrition_diary     Tagebuch ein und aus
--   public.record_platform_nutrition_consent  Einwilligung erteilen, widerrufen
--   public.platform_export           + nutrition (Art. 20)
--   public.list_platform_consent_withdrawals  + Widerrufe der Ernährung, nur
--                                      für die Fähigkeit
--
-- WER (ADR-027 Punkt 3, ADR-023 Punkt 13): die Person und ihre rechtliche
-- Vertretung; die Begleitung sieht nichts - auch nicht lesend. Nur das
-- laufende Profil am Verhältnis DIESES Zugangs (ADR-023 Punkt 19, §4.8).
-- Nichts wird mehr eingetragen nach einem Widerruf und nicht in der Lesefrist.
--
-- PROTOKOLL (ADR-023 Punkt 24, ADR-010 Fassung 3): keine neue Aktion. Jeder
-- Aufruf über eine Vertretung steht als platform_representation.read; das
-- eigene Lesen nicht; Schreibvorgänge weist das Datenmodell nach.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Das Recht 'nutrition' (aus 20261105120000_trk_003_platform_checkins.sql)
-- -----------------------------------------------------------------------------
create or replace function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      -- Gesundheit: Lesen, Wuensche, Nachrichten. Jede Vertretung traegt
      -- diesen Bereich nachgewiesen (Constraint platform_accesses_kind_fields).
      when p_capability in ('read', 'request', 'message') then true
      -- Rechnungen und Zahlungen: der eigene Zugang, sonst nur mit
      -- nachgewiesener Vermoegenssorge bzw. Einwilligung (ABN-010).
      when p_capability = 'billing'
        then a.access_kind = 'self' or coalesce(a.finance_scope, false)
      -- ANG-003 (ANN-273): einen Vertrag kuendigen die Person selbst und eine
      -- rechtliche Vertretung mit Vermoegenssorge, nie eine Begleitung.
      when p_capability = 'contract'
        then a.access_kind = 'self'
             or (a.access_kind = 'legal_representative' and coalesce(a.finance_scope, false))
      -- POR-012 (ANN-248): den Befundbogen fuellt die Person selbst oder ihre
      -- rechtliche Vertretung aus - eine Angabe zur Gesundheit, die eine
      -- Begleitung nicht fuer sie macht.
      -- UEB-010 (ANN-306): ebenso die Einheit am Plan.
      -- KOM-005 (ADR-017 Punkte 59 und 67): ebenso Foto und Video an einer
      -- Rueckfrage - die Begleitung liest die Worte, nicht die Bilder.
      -- TRK-003 (ANN-352): ebenso der Check-in - Angaben zur Gesundheit, die
      -- eine Begleitung nicht fuer die Person macht.
      -- ERN-002 (ADR-027 Punkt 3): die Ernaehrungsberatung - die Begleitung
      -- sieht davon nichts, die rechtliche Vertretung handelt wie die Person.
      when p_capability in ('consent', 'export', 'manage_companions', 'questionnaire', 'exercise',
                            'attach', 'checkin', 'nutrition')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 2. Die feste Schlüsselliste der Plattform (ADR-023 Punkt 22)
--
-- Ohne Notizen der Beratung, ohne Kennungen von Konten und Zugängen, ohne
-- rohe Überschreibungen (die Zielwerte tragen ihr Kennzeichen selbst).
-- -----------------------------------------------------------------------------
create function app.nutrition_platform_json(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'started_on', j -> 'started_on',
    'ended_on', j -> 'ended_on',
    'height_cm', j -> 'height_cm',
    'formula_sex', j -> 'formula_sex',
    'body_fat_percent', j -> 'body_fat_percent',
    'activity_pal', j -> 'activity_pal',
    'goal', j -> 'goal',
    'target_weight_kg', j -> 'target_weight_kg',
    'target_weight_source', j -> 'target_weight_source',
    'diary_enabled', j -> 'diary_enabled',
    'diary_changed_at', j -> 'diary_changed_at',
    'consent', case when j -> 'consent' = 'null'::jsonb then null else
      (j -> 'consent') - 'representative_name' - 'platform_access_kind' end,
    'weights', (
      select coalesce(jsonb_agg(w - 'recorded_by_kind'), '[]'::jsonb)
      from jsonb_array_elements(j -> 'weights') w),
    'targets', j -> 'targets'
  )
  from (select app.nutrition_profile_json(p_profile_id) as j) x
  where j is not null
$$;

revoke all on function app.nutrition_platform_json(uuid) from public, anon, authenticated;

comment on function app.nutrition_platform_json(uuid) is
  'ERN-002 (ADR-023 Punkt 22): ein Ernährungsprofil für die Plattform mit fester Schlüsselliste - Körperdaten, Ziel, Zielgewicht, Tagebuchschalter, Stand der Einwilligung, Gewichtsverlauf, Zielwerte mit Rechenweg; ohne Notizen der Beratung und ohne Kennungen. Ohne Rechteprüfung.';

-- Das laufende Profil am Verhältnis eines Zugangs - oder keines.
create function app.platform_nutrition_profile(p_access_id uuid)
returns public.nutrition_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.nutrition_profiles p
  join public.platform_accesses a
    on a.id = p_access_id
   and a.organization_id = p.organization_id
   and a.relationship_kind = p.relationship_kind
   and a.relationship_id = p.relationship_id
  where p.ended_on is null
$$;

revoke all on function app.platform_nutrition_profile(uuid) from public, anon, authenticated;

-- Das Profil dieses Zugangs zum Schreiben - oder ein Fehler ohne Unterschied.
create function app.platform_nutrition_for_writing(p_access_id uuid, p_needs_consent boolean)
returns public.nutrition_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'nutrition')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select p.* into v_profil
  from public.nutrition_profiles p
  where p.id = (app.platform_nutrition_profile(p_access_id)).id
  for update;
  if v_profil.id is null then
    raise exception 'nutrition profile not found' using errcode = 'P0002';
  end if;
  if p_needs_consent and not app.nutrition_consent_granted(v_profil.id) then
    raise exception 'nutrition consent missing' using errcode = '42501';
  end if;
  return v_profil;
end;
$$;

revoke all on function app.platform_nutrition_for_writing(uuid, boolean) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Lesen
-- -----------------------------------------------------------------------------
create function public.platform_nutrition(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_profil public.nutrition_profiles%rowtype;
  v_einwilligung boolean;
  v_schreibbar boolean;
begin
  if not app.platform_access_allows(p_access_id, 'nutrition') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_profil := app.platform_nutrition_profile(p_access_id);

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition')
  );

  if v_profil.id is null then
    return jsonb_build_object('profile', null);
  end if;
  v_einwilligung := app.nutrition_consent_granted(v_profil.id);
  v_schreibbar := app.platform_access_writable(p_access_id);

  return jsonb_build_object(
    'today', app.training_today(v_zugang.organization_id),
    -- Darf dieser Zugang eintragen? Recht, Lesefrist, Einwilligung.
    'can_write', v_schreibbar and v_einwilligung,
    -- Einwilligen nur in der Lesezeit; widerrufen geht immer (wie POR-016).
    'can_grant', v_schreibbar and not v_einwilligung,
    'wording_version', app.platform_consent_wording_version(),
    'target_weight_floor_kg', app.nutrition_target_weight_floor(v_profil.height_cm),
    'profile', app.nutrition_platform_json(v_profil.id)
  );
end;
$$;

revoke all on function public.platform_nutrition(uuid) from public, anon;
grant execute on function public.platform_nutrition(uuid) to authenticated;

comment on function public.platform_nutrition(uuid) is
  'ERN-002: Plattformprojektion Ernährung - die laufende Beratung am Verhältnis dieses Zugangs mit Zielwerten samt Rechenweg, Gewicht, Zielgewicht und seiner Untergrenze, Tagebuchschalter und Einwilligung. Recht nutrition (Person, rechtliche Vertretung; nie die Begleitung), feste Schlüsselliste ohne Notizen (ADR-023 Punkt 22), über eine Vertretung protokolliert (Punkt 24). Ohne Recht null; ohne laufendes Profil profile null.';

-- -----------------------------------------------------------------------------
-- 4. Gewicht, Zielgewicht, Tagebuch
-- -----------------------------------------------------------------------------
create function public.record_platform_nutrition_weight(
  p_access_id   uuid,
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
  v_zugang public.platform_accesses%rowtype;
begin
  v_profil := app.platform_nutrition_for_writing(p_access_id, true);
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if p_measured_on is null or p_weight_kg is null then
    raise exception 'date and weight are required' using errcode = '22023';
  end if;
  if p_measured_on > app.training_today(v_profil.organization_id) then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;
  if p_measured_on < v_profil.started_on then
    raise exception 'date before the profile' using errcode = '22023';
  end if;

  -- ANN-621: eines je Tag; der jüngste Eintrag des Tages gilt, gleich ob von
  -- der Person oder der Beratung - wer, steht am Eintrag.
  insert into public.nutrition_weight_entries (
    organization_id, profile_id, measured_on, weight_kg, source, platform_access_id,
    platform_access_kind, recorded_by
  )
  values (
    v_profil.organization_id, v_profil.id, p_measured_on, p_weight_kg, 'platform', v_zugang.id,
    v_zugang.access_kind, auth.uid()
  )
  on conflict (profile_id, measured_on) do update
     set weight_kg = excluded.weight_kg,
         source = 'platform',
         platform_access_id = excluded.platform_access_id,
         platform_access_kind = excluded.platform_access_kind,
         recorded_at = now(),
         recorded_by = excluded.recorded_by;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_weight')
  );
end;
$$;

revoke all on function public.record_platform_nutrition_weight(uuid, date, numeric) from public, anon;
grant execute on function public.record_platform_nutrition_weight(uuid, date, numeric) to authenticated;

comment on function public.record_platform_nutrition_weight(uuid, date, numeric) is
  'ERN-002 (ADR-027 Punkt 5, ANN-621): die Person oder ihre rechtliche Vertretung trägt ihr Gewicht ein, eines je Tag; nicht in der Zukunft, nicht vor der Beratung. Laufendes Profil mit Einwilligung, nicht in der Lesefrist (42501).';

create function public.set_platform_nutrition_target_weight(p_access_id uuid, p_target_weight_kg numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  v_profil := app.platform_nutrition_for_writing(p_access_id, true);
  -- ADR-027 Punkt 21: frei wählbar, aber nicht unter BMI 18,5 - die Zahl aus
  -- der einen Rechnung. Leer nimmt das Zielgewicht zurück.
  if p_target_weight_kg is not null
     and p_target_weight_kg < app.nutrition_target_weight_floor(v_profil.height_cm) then
    raise exception 'target weight below floor' using errcode = '22023';
  end if;
  update public.nutrition_profiles
     set target_weight_kg = p_target_weight_kg,
         target_weight_source = case when p_target_weight_kg is null then null else 'person' end,
         updated_at = clock_timestamp(),
         updated_by = auth.uid()
   where id = v_profil.id;
  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_target')
  );
end;
$$;

revoke all on function public.set_platform_nutrition_target_weight(uuid, numeric) from public, anon;
grant execute on function public.set_platform_nutrition_target_weight(uuid, numeric) to authenticated;

comment on function public.set_platform_nutrition_target_weight(uuid, numeric) is
  'ERN-002 (ADR-027 Punkt 21, ADR-006 Punkt 14 c): die Person wählt ihr Zielgewicht, nicht unter BMI 18,5 (22023); leer nimmt es zurück. Laufendes Profil mit Einwilligung, nicht in der Lesefrist.';

create function public.set_platform_nutrition_diary(p_access_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
begin
  -- Erst der Zugang, dann die Eingabe. Einschalten braucht die Einwilligung;
  -- Abschalten nimmt nichts weg und geht immer (ADR-027 Punkt 2).
  v_profil := app.platform_nutrition_for_writing(p_access_id, coalesce(p_enabled, false));
  if p_enabled is null then
    raise exception 'enabled is required' using errcode = '22023';
  end if;
  if v_profil.diary_enabled is distinct from p_enabled then
    update public.nutrition_profiles
       set diary_enabled = p_enabled,
           diary_changed_at = now(),
           diary_changed_by_kind = (select a.access_kind from public.platform_accesses a
                                    where a.id = p_access_id)
     where id = v_profil.id;
  end if;
  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'nutrition_diary')
  );
end;
$$;

revoke all on function public.set_platform_nutrition_diary(uuid, boolean) from public, anon;
grant execute on function public.set_platform_nutrition_diary(uuid, boolean) to authenticated;

comment on function public.set_platform_nutrition_diary(uuid, boolean) is
  'ERN-002 (ADR-027 Punkt 2): die Person schaltet ihr Ernährungstagebuch ein (mit Einwilligung) und aus (immer); von Anfang an aus. Nicht in der Lesefrist. Wiederholt ohne Wirkung.';

-- -----------------------------------------------------------------------------
-- 5. Einwilligung erteilen und widerrufen (wie POR-016)
-- -----------------------------------------------------------------------------
create function public.record_platform_nutrition_consent(
  p_access_id       uuid,
  p_grant           boolean,
  p_wording_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_profil public.nutrition_profiles%rowtype;
  v_letzte public.nutrition_consent_records%rowtype;
  v_zeit   timestamptz;
  v_id     uuid;
begin
  -- Erst der Zugang, dann die Eingabe. Erteilen mit dem Recht nutrition in
  -- der Lesezeit; widerrufen zusätzlich die Person selbst nach der Lesefrist
  -- (ANN-261). Ohne Angabe gilt die schwächste Bedingung, die des Widerrufs.
  if not ((app.platform_access_allows(p_access_id, 'nutrition')
           and (not coalesce(p_grant, false) or app.platform_access_writable(p_access_id)))
          or (not coalesce(p_grant, false)
              and app.platform_own_access_after_reading(p_access_id))) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  if p_grant is null then
    raise exception 'grant or withdraw' using errcode = '22023';
  end if;
  if p_wording_version is distinct from app.platform_consent_wording_version() then
    raise exception 'wording outdated' using errcode = '22023';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  select p.* into v_profil
  from public.nutrition_profiles p
  where p.id = (app.platform_nutrition_profile(p_access_id)).id
  for update;
  if v_profil.id is null then
    raise exception 'nutrition profile not found' using errcode = 'P0002';
  end if;

  v_letzte := app.nutrition_consent(v_profil.id);
  if p_grant and v_letzte.record_kind is not distinct from 'consent_granted' then
    raise exception 'consent already granted' using errcode = '23514';
  end if;
  if not p_grant and v_letzte.record_kind is distinct from 'consent_granted' then
    raise exception 'no consent to withdraw' using errcode = '23514';
  end if;

  select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
  from public.nutrition_consent_records r where r.profile_id = v_profil.id;

  insert into public.nutrition_consent_records (
    organization_id, profile_id, record_kind, occurred_on, recorded_at, recorded_by,
    source, platform_access_id, platform_access_kind, representative_name, wording_version
  )
  values (
    v_profil.organization_id, v_profil.id,
    case when p_grant then 'consent_granted' else 'consent_withdrawn' end,
    app.training_today(v_profil.organization_id), coalesce(v_zeit, now()), auth.uid(),
    'platform', v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind = 'legal_representative' then v_zugang.representative_name end,
    p_wording_version
  )
  returning id into v_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', case when p_grant then 'consent_granted' else 'consent_withdrawn' end)
  );
  return v_id;
end;
$$;

revoke all on function public.record_platform_nutrition_consent(uuid, boolean, text) from public, anon;
grant execute on function public.record_platform_nutrition_consent(uuid, boolean, text) to authenticated;

comment on function public.record_platform_nutrition_consent(uuid, boolean, text) is
  'ERN-002 (ADR-027 Punkt 3, ADR-023 Punkt 13): die Person oder ihre rechtliche Vertretung erteilt oder widerruft die Einwilligung "Ernährungsberatung" am laufenden Profil; widerrufen auch die Person selbst nach der Lesefrist (ANN-261). Zeile mit Herkunft und Textfassung (ANN-262); nie die Begleitung. Ein Widerruf hält Tagebuch und Gewicht an.';
-- -----------------------------------------------------------------------------
-- 6. Export der Plattform (Art. 20): + nutrition
--
-- Aus 20261110120000_alt_003_habits.sql (jüngste Fassung); neu ist nur
-- 'nutrition'.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.platform_export(p_access_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_person  jsonb;
  v_ergebnis jsonb;
begin
  if not app.platform_access_allows(p_access_id, 'export') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  -- Die Stammdaten, die die Person der Praxis gegeben hat. Keine
  -- Einrichtung, keine Koordinaten (abgeleitet, nicht von ihr).
  if v_zugang.relationship_kind = 'treatment' then
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'phone_mobile', c.phone_mobile,
             'phone_work', c.phone_work,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details c on c.patient_id = p.id
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id;
  else
    select jsonb_build_object(
             'given_name', pe.given_name,
             'family_name', pe.family_name,
             'date_of_birth', c.date_of_birth,
             'email', c.email,
             'phone', c.phone,
             'street', c.street,
             'house_number', c.house_number,
             'postal_code', c.postal_code,
             'city', c.city
           )
      into v_person
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details c on c.training_relationship_id = t.id
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id;
  end if;

  v_ergebnis := jsonb_build_object(
    'format', 'plattform-export',
    'format_version', 1,
    'exported_at', now(),
    'organization', (select o.name from public.organizations o where o.id = v_zugang.organization_id),
    'relationship', v_zugang.relationship_kind,
    'exported_by', v_zugang.access_kind,
    'person', coalesce(v_person, '{}'::jsonb),
    'appointments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                     from public.platform_appointments(p_access_id) x),
    'appointment_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                             from public.platform_appointment_requests(p_access_id) x),
    'questionnaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                       from public.platform_questionnaire(p_access_id) x),
    -- Rechnungen nur mit dem Recht billing - die Projektion prueft selbst.
    'invoices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                 from public.platform_invoices(p_access_id) x),
    -- Nur die Liste; jedes Dokument holt die Person einzeln (protokolliert).
    'documents', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                  from public.platform_files(p_access_id) x),
    'consents', (select coalesce(jsonb_agg(to_jsonb(x) - 'can_grant'), '[]'::jsonb)
                 from public.platform_consents(p_access_id) x),
    -- ANG-008: die eigenen Trainingspakete, wie die Plattform sie zeigt
    -- (Recht billing; ohne Recht oder in der Behandlung leer).
    'training_packages', coalesce(public.platform_training_packages(p_access_id), '[]'::jsonb),
    -- KND-003: der im Konto geschlossene Trainingsvertrag (Recht billing;
    -- ohne Recht, in der Behandlung oder ohne Vertrag null).
    'training_contract', public.platform_training_contract(p_access_id),
    -- UEB-009 bis UEB-011: die eigenen Plaene mit Uebungstagen und den Tagen,
    -- an denen geuebt wurde - wie die Plattform sie zeigt (Zweitreview).
    'exercise_plans', coalesce(public.platform_exercise_plans(p_access_id) -> 'plans', '[]'::jsonb),
    -- KOM-004: die Nachrichten, wie die Plattform sie zeigt.
    'messages', coalesce(public.platform_messages(p_access_id) -> 'messages', '[]'::jsonb),
    -- TRK-003: die eigenen Check-ins mit Takt und Angaben, wie die Plattform
    -- sie zeigt.
    'checkins', (
      select jsonb_build_object('schedule', c -> 'schedule', 'history', c -> 'history')
      from (select public.platform_checkins(p_access_id) as c) x
    ),
    -- ALT-003: die eigenen Gewohnheiten mit Tagen, wie die Plattform sie zeigt.
    'habits', coalesce(public.platform_habits(p_access_id) -> 'habits', '[]'::jsonb),
    -- ERN-002 (ADR-027 Punkt 6): die eigene Ernaehrungsberatung an diesem
    -- Verhaeltnis, auch beendete, mit der Schluesselliste der Plattform -
    -- ohne Notizen der Beratung. Das Recht export traegt dieselben Zugaenge
    -- wie nutrition.
    'nutrition', (
      select coalesce(jsonb_agg(app.nutrition_platform_json(n.id) order by n.started_on), '[]'::jsonb)
      from public.nutrition_profiles n
      where n.organization_id = v_zugang.organization_id
        and n.relationship_kind = v_zugang.relationship_kind
        and n.relationship_id = v_zugang.relationship_id
    )
  );

  -- ANN-265: ein Eintrag je Export, wie die Auskunft in der Praxis.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_zugang.organization_id, auth.uid(),
    case when v_zugang.access_kind = 'self' then 'platform' else 'representative' end,
    'patient_record.exported',
    case v_zugang.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'success',
    jsonb_build_object('surface', 'platform', 'purpose', 'platform_export',
                       'platform_access_id', v_zugang.id, 'access_kind', v_zugang.access_kind)
  );

  return v_ergebnis;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Widerrufe über die Plattform in Offene Punkte: + Ernährungsberatung
--
-- Aus 20261013110000_por_017_training_consent.sql (jüngste Fassung); neu ist
-- nur der dritte Teil, allein für die Fähigkeit.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_platform_consent_withdrawals()
 RETURNS TABLE(id uuid, relationship_kind text, patient_id uuid, training_relationship_id uuid, given_name text, family_name text, purpose text, occurred_on date, recorded_at timestamp with time zone, platform_access_kind text, representative_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return;
  end if;

  return query
  select x.id, x.relationship_kind, x.patient_id, x.training_relationship_id, x.given_name,
         x.family_name, x.purpose, x.occurred_on, x.recorded_at, x.platform_access_kind,
         x.representative_name
  from (
    select r.id, 'treatment'::text as relationship_kind, r.patient_id,
           null::uuid as training_relationship_id, pe.given_name, pe.family_name,
           r.purpose, r.occurred_on, r.recorded_at, r.platform_access_kind, r.representative_name
    from public.patient_privacy_records r
    join public.patients p on p.id = r.patient_id
    join public.persons pe on pe.id = p.person_id
    where app.can_read_patient_directory()
      and r.organization_id = v_org
      and r.source = 'platform'
      and r.record_kind = 'consent_withdrawn'
      and r.recorded_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
    union all
    select r.id, 'training'::text, null::uuid, r.training_relationship_id, pe.given_name,
           pe.family_name, r.purpose, r.occurred_on, r.recorded_at, r.platform_access_kind,
           r.representative_name
    from public.training_consent_records r
    join public.training_relationships t on t.id = r.training_relationship_id
    join public.persons pe on pe.id = t.person_id
    where app.can_read_training_relationships()
      and r.organization_id = v_org
      and r.source = 'platform'
      and r.record_kind = 'consent_withdrawn'
      and r.recorded_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
    union all
    -- ERN-002: Widerrufe der Ernaehrungsberatung nur fuer die Faehigkeit
    -- (ADR-027 Punkt 4) - die Rollen der Kartei sehen sie nicht.
    select r.id, n.relationship_kind, n.patient_id, n.training_relationship_id, pe.given_name,
           pe.family_name, 'nutrition_counselling'::text, r.occurred_on, r.recorded_at,
           r.platform_access_kind, r.representative_name
    from public.nutrition_consent_records r
    join public.nutrition_profiles n on n.id = r.profile_id
    left join public.patients p on p.id = n.patient_id
    left join public.training_relationships t on t.id = n.training_relationship_id
    join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
    where app.can_counsel_nutrition()
      and r.organization_id = v_org
      and r.source = 'platform'
      and r.record_kind = 'consent_withdrawn'
      and r.recorded_at > now() - make_interval(days => app.platform_withdrawal_notice_days())
  ) x
  order by x.recorded_at desc, x.id;
end;
$function$;
