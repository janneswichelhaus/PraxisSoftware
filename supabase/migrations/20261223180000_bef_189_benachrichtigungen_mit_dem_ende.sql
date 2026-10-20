-- =============================================================================
-- BEF-189: Benachrichtigungsdaten fallen mit dem Ende der Lesezeit; eine
-- Begleitung exportiert ihre eigene Wahl (Entscheidung Jannes 2026-10-20,
-- wie empfohlen; ADR-023 Fassung 6, ANN-669)
--
-- Wahl zu Benachrichtigungen, Tagebuch-Erinnerungen, Push-Registrierungen und
-- Zustellaufträge stehen je Zugang und sind für die Praxis unsichtbar
-- (ANN-344). Den eigenen Export gab es nur für die Person und ihre rechtliche
-- Vertretung in der Lesezeit; danach blieben Wahl und Erinnerungen bis zum
-- Ende des Zugangs stehen, ohne dass jemand Auskunft über sie geben konnte,
-- und eine Begleitung kam nie an ihre eigene Wahl.
--
--   app.platform_notifications_json      die Liste aus BEF-147 an einer Stelle
--   public.platform_export               nutzt sie (sonst unverändert)
--   public.platform_export_notifications der Export einer Begleitung: nur ihre
--                                        eigene Wahl, nichts von der Person
--   public.purge_notification_deliveries räumt auch Wahl und Erinnerungen
--                                        eines Zugangs, der geendet hat
--   app.drop_push_subscriptions_on_access_end  ebenso beim Widerruf sofort
--
-- Eine Sperre ist kein Ende: Sie lässt sich aufheben, die Wahl bleibt stehen
-- (wie die Push-Registrierung, BEF-148). Ohne Zeile ist alles aus; wird ein
-- Verhältnis wieder aufgenommen, beginnt der Zugang ohne Benachrichtigungen,
-- bis die Person neu wählt. Zustellaufträge fallen weiter 30 Tage nach dem
-- Versand. Der Export der Begleitung protokolliert wie jeder Export
-- (ADR-023 Punkt 24): patient_record.exported, keine neue Aktion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Benachrichtigungen eines Zugangs (Liste aus BEF-147, Zweitreview
--    BEF-146: Erinnerungen mit ihrer Beratung). Ohne Rechteprüfung - nur aus
--    platform_export und platform_export_notifications.
-- -----------------------------------------------------------------------------
create function app.platform_notifications_json(p_access_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  -- Die eigene Wahl, die Geräte nur als „ein Gerät seit …" (ohne Endpunkt und
  -- Schlüssel: Zugangsdaten zum Push-Dienst), die Tagebuch-Erinnerungen und
  -- die Zustellaufträge, die der Löschlauf noch nicht genommen hat.
  select jsonb_build_object(
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
    -- gewählte Uhrzeit (Ortszeit der Praxis). Mit Beginn und Ende der
    -- Beratung, zu der sie gehören: Erinnerungen einer beendeten Beratung
    -- bleiben stehen, bis das Profil fällt, und sähen sonst aus wie die
    -- der laufenden (Zweitreview).
    'diary_reminders', (
      select coalesce(jsonb_agg(jsonb_build_object(
                        'meal', r.meal,
                        'remind_at', r.remind_at,
                        'chosen_at', r.chosen_at,
                        'profile_started_on', n.started_on,
                        'profile_ended_on', n.ended_on)
                      order by n.started_on, r.remind_at, r.meal), '[]'::jsonb)
      from public.nutrition_diary_reminders r
      join public.nutrition_profiles n on n.id = r.profile_id
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
$$;

comment on function app.platform_notifications_json(uuid) is
  'BEF-147/BEF-189: Wahl, Geraete (nur seit wann), Tagebuch-Erinnerungen und Zustellauftraege eines Zugangs fuer den eigenen Export. Ohne Rechtepruefung.';

revoke all on function app.platform_notifications_json(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Der eigene Export (aus 20261223140000_bef_147_export_benachrichtigungen.sql);
--    neu ist nur, dass 'notifications' aus dem Helfer kommt.
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
    ),
    -- BEF-147: die Benachrichtigungen dieses Zugangs (ANN-669). Seit BEF-189 aus
    -- app.platform_notifications_json - dieselbe Liste wie im Export einer
    -- Begleitung.
    'notifications', app.platform_notifications_json(p_access_id)
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
-- 3. Der Export einer Begleitung: nur ihre eigene Wahl (ADR-023 Punkt 13,
--    Fassung 6). Die Person selbst und die rechtliche Vertretung haben den
--    ganzen Export; für sie ist dieser Weg geschlossen.
-- -----------------------------------------------------------------------------
create function public.platform_export_notifications(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang   public.platform_accesses%rowtype;
  v_ergebnis jsonb;
begin
  -- Nur der eigene, lesbare Zugang einer Begleitung - nicht über die Einsicht
  -- der Praxis (das Konto muss das der Begleitung sein), nicht nach der
  -- Lesefrist, nicht gesperrt oder entzogen.
  select a.* into v_zugang
  from public.platform_accesses a
  where a.id = p_access_id
    and a.access_kind = 'companion'
    and a.account_user_id = auth.uid()
    and exists (select 1 from app.platform_readable_access(a.id));
  if not found then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  -- Dasselbe Format wie der eigene Export, nur mit den Benachrichtigungen:
  -- keine Angaben zur Person, keine Termine, keine Nachrichten.
  v_ergebnis := jsonb_build_object(
    'format', 'plattform-export',
    'format_version', 1,
    'exported_at', now(),
    'organization', (select o.name from public.organizations o where o.id = v_zugang.organization_id),
    'relationship', v_zugang.relationship_kind,
    'exported_by', v_zugang.access_kind,
    'notifications', app.platform_notifications_json(p_access_id)
  );

  -- Wie jeder Export (ADR-023 Punkt 24, ANN-265): ein Eintrag, keine neue
  -- Aktion; `part` sagt, dass nur die Benachrichtigungen gingen.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_zugang.organization_id, auth.uid(), 'representative', 'patient_record.exported',
    case v_zugang.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
    v_zugang.relationship_id, 'success',
    jsonb_build_object('surface', 'platform', 'purpose', 'platform_export',
                       'platform_access_id', v_zugang.id, 'access_kind', v_zugang.access_kind,
                       'part', 'notifications')
  );

  return v_ergebnis;
end;
$$;

comment on function public.platform_export_notifications(uuid) is
  'BEF-189 (ADR-023 Punkt 13, Fassung 6): Export einer Begleitung - nur ihre eigene Wahl zu Benachrichtigungen, nur am eigenen lesbaren Zugang, protokolliert als patient_record.exported.';

revoke all on function public.platform_export_notifications(uuid) from public, anon;
grant execute on function public.platform_export_notifications(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Mit dem Ende fällt die Wahl (aus 20261223150000_bef_148_zustellung_mit_
--    anspruch.sql und 20261104100000_kom_009_benachrichtigungen.sql)
-- -----------------------------------------------------------------------------
create or replace function public.purge_notification_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.notification_deliveries d
   where d.state <> 'pending'
     and d.finished_at < now() - app.retention_interval('benachrichtigung');
  get diagnostics v_anzahl = row_count;
  -- BEF-148: Push-Registrierungen eines Zugangs, der geendet hat - zeitlich
  -- (Lesefrist, Volljährigkeit) oder durch Widerruf. Beim Widerruf fallen sie
  -- schon sofort (Trigger). Eine Sperre ist kein Ende: Sie lässt sich
  -- aufheben, und die Registrierung des Geräts bleibt dafür stehen
  -- (Zweitreview); geschickt wird während der Sperre ohnehin nichts.
  delete from public.platform_push_subscriptions p
   using public.platform_accesses a
   where a.id = p.access_id
     and (a.status = 'revoked' or coalesce(app.platform_access_ended_at(a.id) <= now(), false));
  -- BEF-189 (ANN-669): ebenso die Wahl und die Tagebuch-Erinnerungen. Danach
  -- gibt es über sie nichts mehr, worüber Auskunft zu geben wäre.
  delete from public.platform_notification_settings s
   using public.platform_accesses a
   where a.id = s.access_id
     and (a.status = 'revoked' or coalesce(app.platform_access_ended_at(a.id) <= now(), false));
  delete from public.nutrition_diary_reminders r
   using public.platform_accesses a
   where a.id = r.access_id
     and (a.status = 'revoked' or coalesce(app.platform_access_ended_at(a.id) <= now(), false));
  return v_anzahl;
end;
$$;

-- Der Widerruf ist endgültig (ADR-023 Punkt 3): Geräte, Wahl und
-- Erinnerungen fallen sofort. Der Name bleibt aus KOM-009.
create or replace function app.drop_push_subscriptions_on_access_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'revoked' and old.status <> 'revoked' then
    delete from public.platform_push_subscriptions p where p.access_id = new.id;
    -- BEF-189
    delete from public.platform_notification_settings s where s.access_id = new.id;
    delete from public.nutrition_diary_reminders r where r.access_id = new.id;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Aufbewahrungsplan
-- -----------------------------------------------------------------------------
update public.retention_assignments
   set scope_note = 'Die Wahl der Person zu Benachrichtigungen (ADR-024 Punkt 15) steht am Zugang: faellt beim Widerruf (Trigger), mit dem Ende der Lesezeit im taeglichen Lauf purge_notification_deliveries (BEF-189, ANN-669) und spaetestens mit dem Zugang (cascade). Eine Sperre laesst sie stehen.'
 where table_name = 'platform_notification_settings';

update public.retention_assignments
   set scope_note = 'Erinnerungen an das Ernährungstagebuch (ERN-009): fallen mit dem Ernährungsprofil (ADR-027 Punkt 6), beim Widerruf des Zugangs (Trigger), mit dem Ende seiner Lesezeit im täglichen Lauf (BEF-189, ANN-669) und spätestens mit dem Zugang. Eine Sperre lässt sie stehen.'
 where table_name = 'nutrition_diary_reminders';

-- -----------------------------------------------------------------------------
-- 6. Die Auskunft der Praxis sagt, wo die Benachrichtigungen stehen
--    (aus 20261223160000 und 20261223170000; neu ist nur der Text des
--    Eintrags 'Benachrichtigungen je Zugang' in nicht_enthalten).
-- -----------------------------------------------------------------------------

create or replace function public.export_patient_record(p_patient_id uuid)
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
        ), '[]'::jsonb),
        -- BEF-146: die Fotos und Videos an der Rueckfrage (KOM-005) als
        -- Liste, wie `patient_files` - ohne Inhalt, ohne Objektschluessel und
        -- ohne Kennung des Zugangs; wer angehaengt hat, wie an den Eintraegen.
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'media_kind', a.media_kind,
            'mime_type', a.mime_type,
            'byte_size', a.byte_size,
            'duration_seconds', a.duration_seconds,
            'status', a.status,
            'author_kind', a.author_kind,
            'author_label', a.author_label,
            'created_at', a.created_at,
            'locked_at', a.locked_at
          ) order by a.created_at, a.id)
          from public.platform_message_attachments a where a.message_id = m.id
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
        'onboarding_skipped_at', z.onboarding_skipped_at,
        -- Zweitreview BEF-146: die Einladungen zum Zugang - ohne Code
        -- (Zugangsdaten) und ohne Kennung des ausstellenden Kontos. Die
        -- Adresse nur am eigenen Zugang: die einer Vertretung oder Begleitung
        -- ist deren Datum, ihr Name steht schon am Zugang (Art. 15 Abs. 4).
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'purpose', i.purpose,
            'channel', i.channel,
            'email', case when z.access_kind = 'self' then i.email end,
            'address_confirmed_at', i.address_confirmed_at,
            'status', i.status,
            'created_at', i.created_at,
            'sent_at', i.sent_at,
            'expires_at', i.expires_at,
            'failed_attempts', i.failed_attempts,
            'redeemed_at', i.redeemed_at,
            'revoked_at', i.revoked_at
          ) order by i.created_at, i.id)
          from public.platform_access_invitations i where i.platform_access_id = z.id
        ), '[]'::jsonb)
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
        'was', 'Inhalt der Fotos und Videos an Rueckfragen',
        'grund', 'Die Kopie nennt jeden Anhang mit Art, Groesse und Zeitpunkt, auch unbestaetigte und gesperrte. Die Datei oeffnet die Praxis an der Rueckfrage, solange sie bestaetigt, nicht gesperrt und juenger als 30 Tage ist (ADR-017 Punkt 61); einen gesperrten Anhang kann sie noch nicht herausgeben (BEF-188).'
      ),
      jsonb_build_object(
        'was', 'Benachrichtigungen je Zugang',
        'grund', 'Wahl, Geraete, Zustellungen und Tagebuch-Erinnerungen waehlt jede Person fuer ihren Zugang; die Praxis sieht sie nicht (ANN-344). Jede Person findet ihre eigene Wahl im Export der Plattform, solange der Zugang lesen kann, auch eine Begleitung (ADR-023 Punkt 13). Danach fallen Wahl, Erinnerungen und Geraete im taeglichen Lauf, Zustellungen 30 Tage nach dem Versand (ANN-669, BEF-189).'
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

create or replace function public.export_training_record(p_training_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_actor  uuid;
  v_id     uuid := p_training_relationship_id;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation_training(v_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ))
      from public.persons pe
      join public.training_relationships t on t.person_id = pe.id
      where t.id = v_id
    ), '[]'::jsonb),

    'training_relationships', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(t)))
      from public.training_relationships t
      where t.id = v_id
    ), '[]'::jsonb),

    -- Die Tabellen des Verhältnisses (KND, TRN): jede Zeile, wie sie
    -- gespeichert ist, ohne interne Kennungen - auch entfernte Einträge,
    -- solange sie da sind.
    'training_contact_details', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)))
      from public.training_contact_details x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_profiles', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)))
      from public.training_profiles x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    -- Mit den Messwerten (OUT-002) - Gesundheitsangaben nach Art. 9.
    'training_assessments', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)) || jsonb_build_object(
        'author', (select up.display_name from public.user_profiles up where up.id = x.created_by),
        'results', coalesce((
          select jsonb_agg(jsonb_build_object(
            'position', w.position,
            'label', w.label,
            'unit', w.unit,
            'value', w.value,
            'value_left', w.value_left,
            'value_right', w.value_right
          ) order by w.position)
          from public.training_assessment_results w where w.assessment_id = x.id
        ), '[]'::jsonb)
      ) order by x.performed_on, x.created_at)
      from public.training_assessments x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_bases', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)) order by x.started_on, x.created_at)
      from public.training_bases x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_consent_records', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)) order by x.occurred_on, x.recorded_at)
      from public.training_consent_records x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_contracts', coalesce((
      select jsonb_agg((app.auskunft_ohne_kennungen(to_jsonb(x)) - 'training_package_id')
                       order by x.offered_on)
      from public.training_contracts x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_course_events', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)) || jsonb_build_object(
        'author', (select up.display_name from public.user_profiles up where up.id = x.created_by)
      ) order by x.occurred_on, x.created_at)
      from public.training_course_events x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    -- Mit den Nachträgen (ABN-022) am Protokoll.
    'training_protocols', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)) || jsonb_build_object(
        'author', (select up.display_name from public.user_profiles up where up.id = x.created_by),
        'addenda', coalesce((
          select jsonb_agg(jsonb_build_object(
            'content', n.content,
            'reason', n.reason,
            'author', (select up.display_name from public.user_profiles up where up.id = n.created_by),
            'created_at', n.created_at
          ) order by n.created_at, n.id)
          from public.training_protocol_addenda n where n.protocol_id = x.id
        ), '[]'::jsonb)
      ) order by x.created_at)
      from public.training_protocols x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_takeovers', coalesce((
      select jsonb_agg(app.auskunft_ohne_kennungen(to_jsonb(x)) order by x.position)
      from public.training_takeovers x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.label,
        'starts_on', x.starts_on,
        'ends_on', x.ends_on,
        'created_at', x.created_at
      ) order by x.starts_on)
      from public.training_packages x
      join public.service_catalog_items c on c.id = x.catalog_item_id
      where x.training_relationship_id = v_id
    ), '[]'::jsonb),

    -- Wie an der Akte: Termine mit Betreuung beim Namen, nicht als Kennung.
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
      where t.training_relationship_id = v_id
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
      where t.training_relationship_id = v_id
    ), '[]'::jsonb),

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
      where a.training_relationship_id = v_id
    ), '[]'::jsonb),

    -- Zugriffe auf das Verhältnis: Zeitpunkt und Zweck, ohne Namen und
    -- Kennung der Beschäftigten (Art. 15 Abs. 4 DSGVO, ANN-092).
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
        and al.outcome = 'success'
        and ((al.subject_type = 'training_relationship' and al.subject_id = v_id)
             or al.context ->> 'training_relationship_id' = v_id::text)
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
      where l.training_relationship_id = v_id
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
      where r.training_relationship_id = v_id
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
      where r.training_relationship_id = v_id
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
      where r.training_relationship_id = v_id
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
      where r.training_relationship_id = v_id
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
      where r.training_relationship_id = v_id
    ), '[]'::jsonb),

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
        'weekdays', (select to_jsonb(d.weekdays) from public.exercise_plan_days d
                     where d.plan_id = x.id),
        'sessions', (
          select coalesce(jsonb_agg(z - 'id'), '[]'::jsonb)
          from jsonb_array_elements(app.exercise_plan_sessions_json(x.id)) z
        )
      ) order by x.created_at)
      from public.exercise_plans x
      where x.training_relationship_id = v_id
    ), '[]'::jsonb),

    -- Die Rückfragen über die Plattform mit Einträgen und Anhängen (wie an
    -- der Akte seit BEF-146).
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
        ), '[]'::jsonb),
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'media_kind', a.media_kind,
            'mime_type', a.mime_type,
            'byte_size', a.byte_size,
            'duration_seconds', a.duration_seconds,
            'status', a.status,
            'author_kind', a.author_kind,
            'author_label', a.author_label,
            'created_at', a.created_at,
            'locked_at', a.locked_at
          ) order by a.created_at, a.id)
          from public.platform_message_attachments a where a.message_id = m.id
        ), '[]'::jsonb)
      ) order by m.created_at)
      from public.platform_messages m
      where m.training_relationship_id = v_id
    ), '[]'::jsonb),

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
      where w.training_relationship_id = v_id
    ), '[]'::jsonb),

    'checkin_schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'interval_days', s.interval_days,
        'parameter_keys', to_jsonb(s.parameter_keys),
        'starts_on', s.starts_on,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ))
      from public.checkin_schedules s
      where s.training_relationship_id = v_id
    ), '[]'::jsonb),

    'checkins', app.checkins_json('training', v_id),

    'habits', app.habits_json('training', v_id),

    -- ERN-EPIC-001 (ADR-027 Punkt 6): die Ernährungsberatung am Verhältnis,
    -- mit Notizen der Beratung - die Schlüsselliste der Plattform hat sie nicht.
    'nutrition_profiles', coalesce((
      select jsonb_agg(app.nutrition_profile_json(n.id) order by n.started_on, n.created_at)
      from public.nutrition_profiles n
      where n.training_relationship_id = v_id
    ), '[]'::jsonb),

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
        'onboarding_skipped_at', z.onboarding_skipped_at,
        -- Wie an der Akte (Zweitreview BEF-146): ohne Code, die Adresse nur am
        -- eigenen Zugang (Art. 15 Abs. 4).
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'purpose', i.purpose,
            'channel', i.channel,
            'email', case when z.access_kind = 'self' then i.email end,
            'address_confirmed_at', i.address_confirmed_at,
            'status', i.status,
            'created_at', i.created_at,
            'sent_at', i.sent_at,
            'expires_at', i.expires_at,
            'failed_attempts', i.failed_attempts,
            'redeemed_at', i.redeemed_at,
            'revoked_at', i.revoked_at
          ) order by i.created_at, i.id)
          from public.platform_access_invitations i where i.platform_access_id = z.id
        ), '[]'::jsonb)
      ) order by z.created_at, z.id)
      from public.platform_accesses z
      where z.training_relationship_id = v_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag trägt nur Metadaten: wer, wann, welches Verhältnis
  -- (ADR-010 Punkt 3); dieselbe Aktion wie die Auskunft zur Akte.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'training_relationship', v_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'training_relationship_id', v_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt der Fotos und Videos an Rueckfragen',
        'grund', 'Die Kopie nennt jeden Anhang mit Art, Groesse und Zeitpunkt, auch unbestaetigte und gesperrte. Die Datei oeffnet die Praxis an der Rueckfrage, solange sie bestaetigt, nicht gesperrt und juenger als 30 Tage ist (ADR-017 Punkt 61); einen gesperrten Anhang kann sie noch nicht herausgeben (BEF-188).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten einer Behandlung',
        'grund', 'Die Behandlung ist ein eigenes Rechtsverhaeltnis mit eigener Akte (ADR-021); die Auskunft dazu erteilt die Praxis an der Akte.'
      ),
      jsonb_build_object(
        'was', 'Benachrichtigungen je Zugang',
        'grund', 'Wahl, Geraete, Zustellungen und Tagebuch-Erinnerungen waehlt jede Person fuer ihren Zugang; die Praxis sieht sie nicht (ANN-344). Jede Person findet ihre eigene Wahl im Export der Plattform, solange der Zugang lesen kann, auch eine Begleitung (ADR-023 Punkt 13). Danach fallen Wahl, Erinnerungen und Geraete im taeglichen Lauf, Zustellungen 30 Tage nach dem Versand (ANN-669, BEF-189).'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'An Protokollen, Nachtraegen, Assessments und Ereignissen steht der Name der verfassenden Person; die technische Kennung eines Kontos sagt nichts aus.'
      )
    )
  );
end;
$$;
