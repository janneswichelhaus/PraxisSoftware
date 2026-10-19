-- =============================================================================
-- BEF-147: Benachrichtigungen im eigenen Datenexport der Plattform (Art. 15,
-- Art. 20; Zweitreview KOM-EPIC-003, Hinweis H4)
--
-- Die Wahl zu Benachrichtigungen, die Push-Registrierungen und die
-- Zustellaufträge hängen am Zugang (`access_id`), nicht an `patient_id`.
-- Weder der eigene Export noch die Auskunft der Praxis enthielten sie. Jetzt
-- trägt der eigene Export der Person sie unter `notifications`:
--
--   settings    die Wahl (Arten je Weg, Ruhezeit, Zeitpunkt der Wahl) oder null
--   diary_reminders  die Erinnerungen an das Ernährungstagebuch (ERN-009) -
--               auch sie je Zugang gewählt und für die Praxis unsichtbar
--   devices     je Gerät nur „seit wann" - ohne Endpunkt und Schlüssel: die
--               sind Zugangsdaten zum Push-Dienst, keine Angabe über die Person
--   deliveries  Art, Weg, Zeitpunkte, Zustand, Grund - kein Text, keine
--               Adresse, keine Kennung des Termins
--
-- Die Auskunft der Praxis bleibt ohne sie: Die Praxis sieht die Wahl bewusst
-- nicht (ANN-344).
--
-- Aus 20261206110000_ern_002_plattform_ernaehrung.sql (jüngste Fassung); neu
-- ist nur 'notifications'. Kein neues Recht, kein neuer Auditeintrag: der
-- Export protokolliert wie bisher einmal (ANN-265).
-- =============================================================================

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
    ),
    -- BEF-147: die Benachrichtigungen dieses Zugangs - die eigene Wahl, die
    -- eingetragenen Geräte nur als „ein Gerät seit …" (ohne Endpunkt und
    -- Schlüssel) und die Zustellaufträge, die der Löschlauf noch nicht
    -- genommen hat (30 Tage nach dem Abschluss). Je Zugang: eine Vertretung
    -- exportiert ihre eigene Wahl. Die Praxis sieht die Wahl bewusst nicht
    -- (ANN-344); hier geht sie an die Person selbst.
    'notifications', jsonb_build_object(
      'settings', (
        select jsonb_build_object(
                 'email_kinds', s.email_kinds,
                 'push_kinds', s.push_kinds,
                 'quiet_from', s.quiet_from,
                 'quiet_until', s.quiet_until,
                 'chosen_at', s.chosen_at)
        from public.platform_notification_settings s
        where s.access_id = p_access_id
      ),
      'devices', (
        select coalesce(jsonb_agg(jsonb_build_object('registered_at', p.created_at)
                                  order by p.created_at), '[]'::jsonb)
        from public.platform_push_subscriptions p
        where p.access_id = p_access_id
      ),
      -- ERN-009: die Erinnerungen an das Ernährungstagebuch, je Mahlzeit die
      -- gewählte Uhrzeit (Ortszeit der Praxis).
      'diary_reminders', (
        select coalesce(jsonb_agg(jsonb_build_object(
                          'meal', r.meal,
                          'remind_at', r.remind_at,
                          'chosen_at', r.chosen_at)
                        order by r.remind_at, r.meal), '[]'::jsonb)
        from public.nutrition_diary_reminders r
        where r.access_id = p_access_id
      ),
      'deliveries', (
        select coalesce(jsonb_agg(jsonb_build_object(
                          'kind', d.kind,
                          'channel', d.channel,
                          'created_at', d.created_at,
                          'due_at', d.due_at,
                          'subject_at', d.subject_at,
                          'state', d.state,
                          'finished_at', d.finished_at,
                          'drop_reason', d.drop_reason)
                        order by d.created_at, d.channel), '[]'::jsonb)
        from public.notification_deliveries d
        where d.access_id = p_access_id
      )
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
