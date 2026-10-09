-- =============================================================================
-- KOM-002 (KOM-EPIC-001): Die Frage kommt in der Praxis an und wird beantwortet
--
-- PROJECT_PRINCIPLES.md 10 (ein gemeinsamer Kanal, Office liest mit, 4.3),
-- DSN-001 Abschnitt 6 ("Was ankommt"), D1; ADR-004 Fassung 2 Punkt 3;
-- ADR-021 Punkte 6 und 10.
--
--   app.can_read_platform_message      wer einen Vorgang liest (ANN-310, ANN-311)
--   app.can_answer_platform_message    wer antwortet und erledigt (ANN-310, ANN-311)
--   public.list_platform_messages      Liste ohne Inhalt, mit Frist
--   public.get_platform_message        ein Vorgang mit Eintraegen - "Akte geoeffnet"
--   public.answer_platform_message     Antwort der Praxis
--   public.close_platform_message_by_practice
--   public.set_message_response_workdays  die Frist der Praxis, nur owner (ANN-309)
--
-- Die Liste traegt keinen Text: Sie ist eine Trefferliste, kein Lesen
-- (ADR-010 Konsequenzen). Wer einen Vorgang oeffnet, liest Inhalt aus dem
-- Verhaeltnis und steht dafuer einmal am Tag als "Akte geoeffnet" im
-- Protokoll (ADR-010 Fassung 3 Punkt 16) - keine neue Aktion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer liest, wer antwortet - je eine Stelle
--
-- Behandlung: die vier Praxisrollen lesen alles (E15, ADR-004 Punkt 3).
-- Antworten auf Uebung und Beschwerden ist klinische Kommunikation und bleibt
-- bei owner, Therapeut:innen und Teamleitung; das Buero antwortet auf Termin,
-- Rechnung und Sonstiges (ANN-310).
-- Training: owner und Trainingsbetreuung alles; das Buero nur Termin oder
-- Rechnung (DSN-001 D1, ANN-311). Kein Durchgriff zwischen den Bereichen
-- (ADR-021 Punkt 6): Therapeut:innen lesen im Training nichts.
-- -----------------------------------------------------------------------------
create function app.can_read_platform_message(p_kind text, p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.has_any_role('owner', 'therapist', 'team_lead', 'office')
    when 'training' then app.has_any_role('owner', 'trainer')
                         or (p_topic = 'organisational' and app.has_any_role('office'))
    else false
  end
$$;

revoke all on function app.can_read_platform_message(text, text) from public, anon, authenticated;

comment on function app.can_read_platform_message(text, text) is
  'KOM-002 (ANN-310, ANN-311): wer einen Vorgang der Plattform liest. Behandlung: owner, Therapeut:innen, Teamleitung, Buero. Training: owner, Trainingsbetreuung; das Buero nur "Termin oder Rechnung".';

create function app.can_answer_platform_message(p_kind text, p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.has_any_role('owner', 'therapist', 'team_lead')
                          or (p_topic in ('organisational', 'other') and app.has_any_role('office'))
    when 'training' then app.has_any_role('owner', 'trainer')
                         or (p_topic = 'organisational' and app.has_any_role('office'))
    else false
  end
$$;

revoke all on function app.can_answer_platform_message(text, text) from public, anon, authenticated;

comment on function app.can_answer_platform_message(text, text) is
  'KOM-002 (ANN-310, ANN-311): wer auf einen Vorgang antwortet und ihn erledigt. Behandlung: owner, Therapeut:innen, Teamleitung; das Buero bei Termin, Rechnung und Sonstiges. Training: owner, Trainingsbetreuung; das Buero bei Termin oder Rechnung.';

-- Darf die Person ueberhaupt in einem der Bereiche lesen?
create function app.may_read_platform_messages(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.has_any_role('owner', 'therapist', 'team_lead', 'office')
    when 'training' then app.has_any_role('owner', 'trainer', 'office')
    when 'any' then app.has_any_role('owner', 'therapist', 'team_lead', 'office', 'trainer')
    else false
  end
$$;

revoke all on function app.may_read_platform_messages(text) from public, anon, authenticated;

-- Der Name, unter dem eine Antwort steht (ANN-308): Anzeigename des Kontos.
create function app.current_display_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select left(btrim(u.display_name), 160) from public.user_profiles u
      where u.id = auth.uid() and length(btrim(u.display_name)) > 0),
    'Praxis'
  )
$$;

revoke all on function app.current_display_name() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Liste - ohne Text
-- -----------------------------------------------------------------------------
create function public.list_platform_messages(
  p_kind            text default null,
  p_relationship_id uuid default null,
  p_with_closed     boolean default false
)
returns table (
  id                       uuid,
  relationship_kind        text,
  relationship_id          uuid,
  patient_id               uuid,
  training_relationship_id uuid,
  given_name               text,
  family_name              text,
  topic                    text,
  reference_label          text,
  status                   text,
  due_on                   date,
  overdue                  boolean,
  created_at               timestamptz,
  last_entry_at            timestamptz,
  closed_at                timestamptz,
  closed_by_side           text,
  entry_count              integer,
  asked_by                 text,
  representative_name      text,
  can_answer               boolean,
  record_assigned_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_heute date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind is not null and p_kind not in ('treatment', 'training') then
    raise exception 'unknown relationship kind' using errcode = '22023';
  end if;
  if not app.may_read_platform_messages(coalesce(p_kind, 'any')) then
    perform app.record_denied_read(auth.uid(), 'platform_messages.read',
                                   'not allowed to read platform messages');
    return;
  end if;
  v_org := app.current_organization_id();
  v_heute := app.training_today(v_org);

  return query
  select m.id, m.relationship_kind, m.relationship_id, m.patient_id, m.training_relationship_id,
         pe.given_name, pe.family_name,
         m.topic, m.reference_label, m.status, m.due_on,
         (m.status = 'open' and m.due_on < v_heute),
         m.created_at, m.last_entry_at, m.closed_at, m.closed_by_side,
         (select count(*)::integer from public.platform_message_entries e where e.message_id = m.id),
         (select e.author_kind from public.platform_message_entries e
           where e.message_id = m.id order by e.created_at, e.id limit 1),
         (select e.author_label from public.platform_message_entries e
           where e.message_id = m.id and e.author_kind <> 'self'
           order by e.created_at, e.id limit 1),
         app.can_answer_platform_message(m.relationship_kind, m.topic),
         m.record_assigned_at
  from public.platform_messages m
  left join public.patients pa on pa.id = m.patient_id
  left join public.training_relationships t on t.id = m.training_relationship_id
  left join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  where m.organization_id = v_org
    and (p_kind is null or m.relationship_kind = p_kind)
    and (p_relationship_id is null or m.relationship_id = p_relationship_id)
    and (p_with_closed or m.status <> 'closed')
    and app.can_read_platform_message(m.relationship_kind, m.topic)
  order by (m.status = 'closed'), (m.status <> 'open'), m.due_on nulls last, m.last_entry_at desc,
           m.id;
end;
$$;

revoke all on function public.list_platform_messages(text, uuid, boolean) from public, anon;
grant execute on function public.list_platform_messages(text, uuid, boolean) to authenticated;

comment on function public.list_platform_messages(text, uuid, boolean) is
  'KOM-002: Vorgaenge der Plattform fuer die Praxis (DSN-001 Abschnitt 6) - ohne Text, mit Person, Thema, Zustand, Frist und Ueberfaelligkeit (ANN-309). Je Vorgang nur, wer ihn lesen darf (ANN-310, ANN-311). Optional ein Bereich und ein Verhaeltnis.';

-- -----------------------------------------------------------------------------
-- 3. Ein Vorgang - Lesen ist "Akte geoeffnet"
-- -----------------------------------------------------------------------------
create function app.practice_message(p_message_id uuid, p_for_answer boolean)
returns public.platform_messages
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
begin
  select m.* into v_vorgang
  from public.platform_messages m
  where m.id = p_message_id and m.organization_id = app.current_organization_id();
  if v_vorgang.id is null
     or not app.can_read_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if p_for_answer
     and not app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'not allowed to answer this message' using errcode = '42501';
  end if;
  return v_vorgang;
end;
$$;

revoke all on function app.practice_message(uuid, boolean) from public, anon, authenticated;

create function public.get_platform_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_vorgang public.platform_messages%rowtype;
  v_name    record;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to read platform messages' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  v_vorgang := app.practice_message(p_message_id, false);

  select pe.given_name, pe.family_name into v_name
  from public.persons pe
  where pe.id = coalesce(
    (select pa.person_id from public.patients pa where pa.id = v_vorgang.patient_id),
    (select t.person_id from public.training_relationships t
      where t.id = v_vorgang.training_relationship_id));

  if v_vorgang.relationship_kind = 'treatment' then
    perform app.log_record_access(v_org, auth.uid(), 'patient_record.viewed', 'patient',
                                  v_vorgang.patient_id);
  else
    perform app.log_record_access(v_org, auth.uid(), 'training_relationship.viewed',
                                  'training_relationship', v_vorgang.training_relationship_id);
  end if;

  return jsonb_build_object(
    'id', v_vorgang.id,
    'relationship_kind', v_vorgang.relationship_kind,
    'relationship_id', v_vorgang.relationship_id,
    'patient_id', v_vorgang.patient_id,
    'training_relationship_id', v_vorgang.training_relationship_id,
    'given_name', v_name.given_name,
    'family_name', v_name.family_name,
    'topic', v_vorgang.topic,
    'reference_label', v_vorgang.reference_label,
    'exercise_plan_id', v_vorgang.exercise_plan_id,
    'status', v_vorgang.status,
    'due_on', v_vorgang.due_on,
    'overdue', v_vorgang.status = 'open' and v_vorgang.due_on < app.training_today(v_org),
    'created_at', v_vorgang.created_at,
    'closed_at', v_vorgang.closed_at,
    'closed_by_side', v_vorgang.closed_by_side,
    'record_assigned_at', v_vorgang.record_assigned_at,
    'record_assigned_by_label', v_vorgang.record_assigned_by_label,
    'can_answer', app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'side', e.side,
        'body', e.body,
        'author_kind', e.author_kind,
        'author_label', e.author_label,
        'created_at', e.created_at
      ) order by e.created_at, e.id)
      from public.platform_message_entries e
      where e.message_id = v_vorgang.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_platform_message(uuid) from public, anon;
grant execute on function public.get_platform_message(uuid) to authenticated;

comment on function public.get_platform_message(uuid) is
  'KOM-002: ein Vorgang der Plattform mit allen Eintraegen fuer die Praxis. Lesen nur, wer ihn lesen darf (ANN-310, ANN-311); protokolliert als "Akte geoeffnet" bzw. "Trainingsverhaeltnis geoeffnet", einmal je Tag (ADR-010 Fassung 3 Punkt 16).';

-- -----------------------------------------------------------------------------
-- 4. Antworten und erledigen
-- -----------------------------------------------------------------------------
create function public.answer_platform_message(p_message_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
  v_text    text;
  v_id      uuid;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to answer platform messages' using errcode = '42501';
  end if;
  v_vorgang := app.practice_message(p_message_id, true);
  if v_vorgang.status = 'closed' then
    raise exception 'message is closed' using errcode = '22023';
  end if;
  v_text := app.platform_message_body(p_body);

  perform 1 from public.platform_messages m where m.id = v_vorgang.id for update;

  insert into public.platform_message_entries (
    organization_id, message_id, side, body, access_id, author_kind, author_label, created_by
  )
  values (
    v_vorgang.organization_id, v_vorgang.id, 'practice', v_text, null, 'staff',
    app.current_display_name(), auth.uid()
  )
  returning id into v_id;

  update public.platform_messages m
     set status = 'answered', due_on = null, last_entry_at = now()
   where m.id = v_vorgang.id;
  return v_id;
end;
$$;

revoke all on function public.answer_platform_message(uuid, text) from public, anon;
grant execute on function public.answer_platform_message(uuid, text) to authenticated;

comment on function public.answer_platform_message(uuid, text) is
  'KOM-002: Antwort der Praxis auf einen offenen oder beantworteten Vorgang (ANN-308). Wer antworten darf: app.can_answer_platform_message (ANN-310, ANN-311). Der Eintrag traegt den Anzeigenamen; auf der Plattform steht "Praxis".';

create function public.close_platform_message_by_practice(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to close platform messages' using errcode = '42501';
  end if;
  v_vorgang := app.practice_message(p_message_id, true);
  if v_vorgang.status = 'closed' then
    raise exception 'message is closed' using errcode = '22023';
  end if;

  update public.platform_messages m
     set status = 'closed', due_on = null, closed_at = now(), closed_by = auth.uid(),
         closed_by_side = 'practice'
   where m.id = v_vorgang.id;
end;
$$;

revoke all on function public.close_platform_message_by_practice(uuid) from public, anon;
grant execute on function public.close_platform_message_by_practice(uuid) to authenticated;

comment on function public.close_platform_message_by_practice(uuid) is
  'KOM-002: einen Vorgang als erledigt markieren (ANN-308) - dieselben Rollen wie beim Antworten.';

-- -----------------------------------------------------------------------------
-- 5. Die Antwortfrist der Praxis (ANN-309) - nur owner, wie die Stammdaten
-- -----------------------------------------------------------------------------
create function public.set_message_response_workdays(p_workdays integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.has_any_role('owner') then
    raise exception 'not allowed to change the response time' using errcode = '42501';
  end if;
  if p_workdays is null or p_workdays not between 1 and 10 then
    raise exception 'response time out of range' using errcode = '22023';
  end if;
  update public.organizations o
     set message_response_workdays = p_workdays
   where o.id = app.current_organization_id();
end;
$$;

revoke all on function public.set_message_response_workdays(integer) from public, anon;
grant execute on function public.set_message_response_workdays(integer) to authenticated;

comment on function public.set_message_response_workdays(integer) is
  'KOM-002 (ANN-309): die Antwortfrist der Praxis in Werktagen, 1 bis 10. Nur owner. Gilt fuer Fragen, die danach eingehen.';

create function public.get_message_response_workdays()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select o.message_response_workdays
  from public.organizations o
  where o.id = app.current_organization_id()
    and app.may_read_platform_messages('any')
$$;

revoke all on function public.get_message_response_workdays() from public, anon;
grant execute on function public.get_message_response_workdays() to authenticated;

comment on function public.get_message_response_workdays() is
  'KOM-002 (ANN-309): die Antwortfrist der Praxis fuer die Rollen, die Nachrichten lesen.';
