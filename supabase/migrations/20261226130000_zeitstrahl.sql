-- Eine Person auf einen Blick, ohne neue Tabelle: Jede Gruppe läuft durch dieselbe Rollenprüfung
-- wie ihre eigene Sicht (ADR-004 Punkt 6); keine Wertung, kein Trend, kein Hinweis aus
-- Gesundheitsangaben (ADR-006 Punkte 4, 11).

-- Der Zeitstrahl (ANN-847): ein Fenster von p_days Tagen bis p_before, ohne p_before nach vorn
-- offen. Office sieht denselben Zeitstrahl mit dem Inhalt seiner Rollen, nicht denselben Inhalt
-- mit ausgeblendeten Zeilen.
create function public.get_patient_timeline(p_patient_id uuid, p_before date default null,
                                            p_days integer default 92)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_org       uuid;
  v_zone      text;
  v_heute     date;
  v_von       date;
  v_bis       date;
  v_termine   boolean;
  v_klinisch  boolean;
  v_plaene    boolean;
  v_nachricht boolean;
  v_grundlage boolean;
  v_rechnung  boolean;
  v_alle      jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not app.can_read_patient_directory() then
    perform app.record_denied_read(v_actor, 'patient_timeline.read', 'not allowed to read timelines');
    return null;
  end if;
  v_org := app.current_organization_id();
  if not exists (select 1 from public.patients p
                 where p.id = p_patient_id and p.organization_id = v_org) then
    return null;
  end if;
  if p_days is null or p_days < 7 or p_days > 366 then
    raise exception 'days must be between 7 and 366' using errcode = '22023';
  end if;

  perform app.log_record_access(
    v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id,
    'user', jsonb_build_object('surface', 'web', 'view', 'timeline'));

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  v_heute := app.training_today(v_org);
  v_bis := p_before;
  v_von := coalesce(p_before, v_heute) - p_days;

  v_termine := app.can_read_appointments();
  v_klinisch := app.can_read_treatment_note();
  v_plaene := app.can_read_exercise_plans('therapy');
  v_nachricht := app.may_read_platform_messages('treatment');
  v_grundlage := app.can_read_treatment_bases();
  v_rechnung := app.can_read_invoicing();

  with eintrag as (
    -- Termine der Behandlung samt Stand der Doku (Haupteintrag, ADR-016).
    select (a.starts_at at time zone v_zone)::date as tag, a.starts_at as zeit,
           'appointment' as art, a.status as stand,
           case when a.occasion = 'nutrition_counselling' then 'nutrition_counselling'
                else a.appointment_type end as bezeichnung,
           case when v_klinisch then coalesce((
             select n.status from public.treatment_notes n
             where n.appointment_id = a.id and n.addendum_to_note_id is null
             order by n.created_at desc limit 1), 'none') end as zusatz,
           a.id as bezug
    from public.appointments a
    where v_termine and a.organization_id = v_org and a.patient_id = p_patient_id
      and a.kind = 'therapy'
    union all
    -- Nachträge zu einem Eintrag: Tag und Stand, nie der Wortlaut.
    select (n.created_at at time zone v_zone)::date, n.created_at, 'addendum', n.status,
           null, null, n.appointment_id
    from public.treatment_notes n
    join public.appointments a on a.id = n.appointment_id
    where v_klinisch and a.organization_id = v_org and a.patient_id = p_patient_id
      and n.addendum_to_note_id is not null
    union all
    -- Abgeschlossene Erhebungen (Befund, Bögen, Tests): Instrument, keine Antworten.
    select r.recorded_on, r.completed_at, 'questionnaire', r.source, r.instrument_id,
           case when r.supersedes_response_id is not null then 'correction' end, r.id
    from public.patient_questionnaire_responses r
    where v_klinisch and r.organization_id = v_org and r.patient_id = p_patient_id
      and r.status = 'abgeschlossen'
    union all
    -- Vermerkte Ereignisse: Art und Vermerk wie im Befund.
    select e.occurred_on, e.created_at, 'course_event', null, e.kind, e.note, e.id
    from public.patient_course_events e
    where v_klinisch and e.organization_id = v_org and e.patient_id = p_patient_id
      and e.removed_at is null
    union all
    select (r.completed_at at time zone v_zone)::date, r.completed_at, 'therapy_report', null, null,
           case when r.supersedes_report_id is not null then 'correction' end, r.id
    from public.therapy_reports r
    where v_klinisch and r.organization_id = v_org and r.patient_id = p_patient_id
      and r.status = 'abgeschlossen'
    union all
    -- Planwechsel aus derselben Quelle wie das Verlaufsbild.
    select (x ->> 'occurred_on')::date, null, x ->> 'kind', null, x ->> 'title', null, null
    from jsonb_array_elements(
           case when v_plaene then app.progress_plan_events_json('treatment', p_patient_id, v_org)
                else '[]'::jsonb end) x
    union all
    -- Einheiten und Check-ins: dass es sie gab, die Angaben stehen im Verlauf.
    select s.performed_on, s.finished_at, 'session', s.finished_access_kind, p.title, null, p.id
    from public.exercise_plan_sessions s
    join public.exercise_plans p on p.id = s.plan_id
    where v_plaene and p.organization_id = v_org and p.service_area = 'therapy'
      and p.patient_id = p_patient_id and s.finished_at is not null
    union all
    select c.answered_on, c.recorded_at, 'checkin', c.platform_access_kind, null, null, null
    from public.checkins c
    where v_plaene and c.relationship_kind = 'treatment' and c.relationship_id = p_patient_id
    union all
    -- Rückfragen: Thema und Zustand, nie der Wortlaut.
    select (m.created_at at time zone v_zone)::date, m.created_at, 'message', m.status, m.topic,
           null, m.id
    from public.platform_messages m
    where v_nachricht and m.organization_id = v_org and m.relationship_kind = 'treatment'
      and m.patient_id = p_patient_id and app.can_read_platform_message('treatment', m.topic)
    union all
    select (m.closed_at at time zone v_zone)::date, m.closed_at, 'message_closed', m.closed_by_side,
           m.topic, null, m.id
    from public.platform_messages m
    where v_nachricht and m.organization_id = v_org and m.relationship_kind = 'treatment'
      and m.patient_id = p_patient_id and m.closed_at is not null
      and app.can_read_platform_message('treatment', m.topic)
    union all
    -- Behandlungsgrundlagen: Bauart und Ausstellungstag, keine Diagnose.
    select b.issued_on, b.created_at, 'treatment_basis', null, b.treatment_basis_kind, null, b.id
    from public.treatment_bases b
    where v_grundlage and b.organization_id = v_org and b.patient_id = p_patient_id
    union all
    -- Rechnungen allein für die Abrechnung (owner, office): Nummer und Storno, kein Betrag.
    select i.issued_on, null, 'invoice',
           case when exists (select 1 from public.invoice_cancellations k where k.invoice_id = i.id)
                then 'cancelled' else 'issued' end,
           i.invoice_number, null, i.id
    from public.invoices i
    where v_rechnung and i.organization_id = v_org and i.patient_id = p_patient_id
      and i.status = 'issued' and i.issued_on is not null
  )
  select jsonb_build_object(
    'today', v_heute,
    'time_zone', v_zone,
    'from', v_von + 1,
    'to', v_bis,
    'has_more', exists (select 1 from eintrag e where e.tag <= v_von),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'on', e.tag, 'at', e.zeit, 'kind', e.art, 'state', e.stand,
               'label', e.bezeichnung, 'detail', e.zusatz, 'ref', e.bezug)
             order by e.tag desc, e.zeit desc nulls last, e.art)
      from eintrag e
      where e.tag > v_von and (v_bis is null or e.tag <= v_bis)
    ), '[]'::jsonb))
    into v_alle;

  return v_alle;
end;
$$;

revoke all on function public.get_patient_timeline(uuid, date, integer) from public, anon;
grant execute on function public.get_patient_timeline(uuid, date, integer) to authenticated;

comment on function public.get_patient_timeline(uuid, date, integer) is
  'ORG-001 (IDEA-QSN-001, ANN-847): der Zeitstrahl einer Person - Termine mit Stand der Doku, Nachträge, Erhebungen, Ereignisse, Berichte, Planwechsel, Einheiten, Check-ins, Rückfragen, Grundlagen und Rechnungen - je Gruppe nach der Rolle ihrer eigenen Sicht (can_read_appointments, can_read_treatment_note, can_read_exercise_plans, may_read_platform_messages, can_read_treatment_bases, can_read_invoicing). Ohne Wortlaut der Doku, ohne Antworten, Nachrichten und Beträge. Protokolliert als Öffnen der Akte (view timeline). Ohne can_read_patient_directory null und eine Abweisung.';

-- Die Sitzungsvorbereitung (ANN-848): nur Fälligkeiten und Fristen, nie eine Aufforderung aus
-- Gesundheitsangaben (ADR-006 Punkt 11); die Angaben zwischen den Terminen liest die Seite aus
-- get_checkins.
create function public.get_session_preparation(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_org     uuid;
  v_zone    text;
  v_heute   date;
  v_offen   boolean;
  v_takt    public.checkin_schedules%rowtype;
  v_letzte  date;
  v_naechst jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_patient_directory() then
    perform app.record_denied_read(v_actor, 'session_preparation.read',
                                   'not allowed to read session preparations');
    return null;
  end if;
  v_org := app.current_organization_id();
  select p.care_concluded_on is null into v_offen
  from public.patients p where p.id = p_patient_id and p.organization_id = v_org;
  if v_offen is null then
    return null;
  end if;

  perform app.log_record_access(
    v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id,
    'user', jsonb_build_object('surface', 'web', 'view', 'preparation'));

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  v_heute := app.training_today(v_org);

  if app.can_read_appointments() then
    -- Die letzte durchgeführte Behandlung vor heute; der Zeitraum beginnt am Tag danach (ANN-848).
    select max((a.starts_at at time zone v_zone)::date) into v_letzte
    from public.appointments a
    where a.organization_id = v_org and a.patient_id = p_patient_id and a.kind = 'therapy'
      and a.occasion = 'regular' and a.status in ('completed', 'documented', 'invoiced')
      and (a.starts_at at time zone v_zone)::date < v_heute;
    select jsonb_build_object('id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
                              'appointment_type', a.appointment_type)
      into v_naechst
    from public.appointments a
    where a.organization_id = v_org and a.patient_id = p_patient_id and a.kind = 'therapy'
      and a.occasion = 'regular' and a.status = 'confirmed' and a.ends_at > now()
    order by a.starts_at limit 1;
  end if;

  if app.can_read_exercise_plans('therapy') then
    select * into v_takt from public.checkin_schedules s
    where s.relationship_kind = 'treatment' and s.relationship_id = p_patient_id;
  end if;

  return jsonb_build_object(
    'today', v_heute,
    'time_zone', v_zone,
    'last_session_on', v_letzte,
    'next_appointment', v_naechst,
    -- Offene Rückfragen: Die Praxis ist am Zug (status open), mit Frist.
    'open_messages', case when app.may_read_platform_messages('treatment') then coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'topic', m.topic, 'due_on', m.due_on,
                                          'overdue', m.due_on < v_heute)
                       order by m.due_on, m.created_at)
      from public.platform_messages m
      where m.organization_id = v_org and m.relationship_kind = 'treatment'
        and m.patient_id = p_patient_id and m.status = 'open'
        and app.can_read_platform_message('treatment', m.topic)
    ), '[]'::jsonb) end,
    -- Check-in fällig: der Tag aus dem Takt, nur solange die Versorgung läuft (ANN-350).
    'checkin_due_on', case when v_takt.id is not null and v_offen
                            and app.checkin_due_on(v_takt) <= v_heute
                           then app.checkin_due_on(v_takt) end,
    -- Pläne mit Wiedervorlage (ANN-302): endet bald oder ist abgelaufen.
    'plans_review', case when app.can_read_exercise_plans('therapy') then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'runs_until', p.runs_until)
                       order by p.runs_until)
      from public.exercise_plans p
      where p.organization_id = v_org and p.service_area = 'therapy'
        and p.patient_id = p_patient_id and app.exercise_plan_review_due(p)
    ), '[]'::jsonb) end,
    -- Begonnene Behandlungstermine ohne festgeschriebene Doku (Haupteintrag fehlt oder Entwurf).
    'documentation_open', case when app.can_read_appointments() and app.can_read_treatment_note()
    then coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'starts_at', a.starts_at,
                                          'note_status', coalesce(h.status, 'none'))
                       order by a.starts_at)
      from public.appointments a
      left join lateral (
        select n.status from public.treatment_notes n
        where n.appointment_id = a.id and n.addendum_to_note_id is null
        order by n.created_at desc limit 1
      ) h on true
      where a.organization_id = v_org and a.patient_id = p_patient_id and a.kind = 'therapy'
        and a.occasion = 'regular' and a.status in ('confirmed', 'completed')
        and a.starts_at <= now() and coalesce(h.status, 'none') <> 'final'
    ), '[]'::jsonb) end,
    -- Zuletzt festgehaltene Ziele: das Therapieziel der jüngsten Grundlagen, im Wortlaut.
    'goals', case when app.can_read_treatment_basis_clinical() then coalesce((
      select jsonb_agg(jsonb_build_object('treatment_basis_id', g.id, 'issued_on', g.issued_on,
                                          'kind', g.treatment_basis_kind, 'text', g.therapy_goal)
                       order by g.issued_on desc)
      from (
        select b.* from public.treatment_bases b
        where b.organization_id = v_org and b.patient_id = p_patient_id
          and nullif(btrim(b.therapy_goal), '') is not null
        order by b.issued_on desc limit 2
      ) g
    ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.get_session_preparation(uuid) from public, anon;
grant execute on function public.get_session_preparation(uuid) to authenticated;

comment on function public.get_session_preparation(uuid) is
  'ORG-003 (IDEA-ORG-001, IDEA-ORG-005, ANN-848): Sitzungsvorbereitung einer Person - letzte durchgeführte Behandlung, nächster Termin, offene Rückfragen, fälliger Check-in, Pläne mit Wiedervorlage, Termine ohne festgeschriebene Doku und das Therapieziel der zwei jüngsten Grundlagen; je Teil nach der Rolle seiner eigenen Sicht. Nur organisatorische Fälligkeiten, keine Wertung. Protokolliert als Öffnen der Akte (view preparation). Ohne can_read_patient_directory null und eine Abweisung.';
