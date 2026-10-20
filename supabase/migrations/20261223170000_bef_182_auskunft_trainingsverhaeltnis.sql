-- =============================================================================
-- BEF-182: Auskunft nach Art. 15 je Trainingsverhältnis (Entscheidung Jannes
-- 2026-10-18: kleiner Pfad-A-Auftrag vor M3)
--
-- Die Auskunft der Praxis ging nur von der Akte aus (`export_patient_record`),
-- und die nennt Trainingsdaten ausdrücklich nicht: „Training ist ein eigenes
-- Rechtsverhältnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft
-- dazu wird getrennt erteilt.“ Diese getrennte Auskunft fehlte. Für eine
-- Person, die nur trainiert, gab es keine vollständige Kopie; der Export der
-- Plattform trägt nur ihre Schlüsselliste und fehlt ohne Zugang ganz. Seit
-- ERN-EPIC-001 betrifft das auch Gesundheitsdaten nach Art. 9 (ADR-027
-- Punkt 6: „Auskunft und Export enthalten alles“).
--
--   app.auskunft_organisation_training   Anmeldung, owner, Mandantengrenze
--   public.export_training_record        die Kopie, wie export_patient_record
--
-- Wie bei der Akte: nur `owner`, auf Knopfdruck, ein Protokolleintrag je
-- Kopie mit derselben Aktion `patient_record.exported` - Gegenstand das
-- Trainingsverhältnis, wie beim Export der Plattform (ANN-265). Keine neue
-- Aktion im Katalog (ADR-010 Punkt 16 nennt die Auskunft unter „Exporte“).
-- Der Inhalt hochgeladener Dateien kommt nicht mit, nur ihre Liste; Namen der
-- Beschäftigten im Zugriffsprotokoll nur auf begründetes Verlangen
-- (ANN-092). Die je Zugang gewählten Benachrichtigungen bleiben wie an der
-- Akte draußen (ANN-344, ANN-669).
-- =============================================================================

create function app.auskunft_organisation_training(p_training_relationship_id uuid)
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

  if not app.has_any_role('owner') then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  -- Ob es das Verhältnis gibt, ist selbst eine Auskunft (ADR-003): dieselbe
  -- Abweisung wie ohne Recht.
  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_training_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  return v_org;
end;
$$;

comment on function app.auskunft_organisation_training(uuid) is
  'BEF-182: Prueft Anmeldung, owner-Rolle und Mandantengrenze fuer die Auskunft zu einem Trainingsverhaeltnis und liefert die Organisation (wie app.auskunft_organisation, ADR-004).';

revoke all on function app.auskunft_organisation_training(uuid) from public, anon, authenticated;

create function public.export_training_record(p_training_relationship_id uuid)
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
  -- Was an einer Zeile nichts über die Person sagt: Mandant, Verweis auf das
  -- Verhältnis selbst und die Kennungen bearbeitender Konten und Zugänge.
  v_intern text[] := array[
    'organization_id', 'training_relationship_id', 'created_by', 'updated_by',
    'removed_by', 'recorded_by', 'finalized_by', 'platform_access_id',
    'released_platform_access_id', 'withdrawn_platform_access_id'];
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
      select jsonb_agg(to_jsonb(t) - v_intern - 'person_id')
      from public.training_relationships t
      where t.id = v_id
    ), '[]'::jsonb),

    -- Die Tabellen des Verhältnisses (KND, TRN): jede Zeile, wie sie
    -- gespeichert ist, ohne interne Kennungen - auch entfernte Einträge,
    -- solange sie da sind.
    'training_contact_details', coalesce((
      select jsonb_agg(to_jsonb(x) - v_intern)
      from public.training_contact_details x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_profiles', coalesce((
      select jsonb_agg(to_jsonb(x) - v_intern)
      from public.training_profiles x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_assessments', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern) order by x.performed_on, x.created_at)
      from public.training_assessments x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_bases', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern) order by x.started_on, x.created_at)
      from public.training_bases x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_consent_records', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern) order by x.occurred_on, x.recorded_at)
      from public.training_consent_records x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_contracts', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern - 'training_package_id') order by x.offered_on)
      from public.training_contracts x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_course_events', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern) order by x.occurred_on, x.created_at)
      from public.training_course_events x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_protocols', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern) order by x.created_at)
      from public.training_protocols x where x.training_relationship_id = v_id
    ), '[]'::jsonb),
    'training_takeovers', coalesce((
      select jsonb_agg((to_jsonb(x) - v_intern) order by x.position)
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
        'onboarding_skipped_at', z.onboarding_skipped_at
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
        'was', 'Inhalt hochgeladener Dateien',
        'grund', 'Die Kopie nennt jeden Anhang mit Art, Groesse und Zeitpunkt; die Datei selbst wird je Datei herausgegeben (ADR-017).'
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
        'grund', 'Wahl, Geraete, Zustellungen und Tagebuch-Erinnerungen waehlt die Person je Zugang; die Praxis sieht sie nicht (ANN-344). Sie stehen im eigenen Export der Plattform (ANN-669).'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$$;

comment on function public.export_training_record(uuid) is
  'BEF-182: Auskunft nach Art. 15 zu einem Trainingsverhaeltnis - Kopie aller Daten des Verhaeltnisses, nur owner, ein Protokolleintrag patient_record.exported je Kopie (wie export_patient_record).';

revoke all on function public.export_training_record(uuid) from public, anon;
grant execute on function public.export_training_record(uuid) to authenticated;
