-- =============================================================================
-- Abgewiesene Lesezugriffe auf klinische Dokumente (G6a, ADR-010)
--
-- ADR-010 Punkt 2 verlangt, dass der Zugriff auf klinische Dokumente
-- auditierbar ist. Ein abgewiesener Versuch ist auch ein Zugriffsversuch, und
-- genau ihn soll der Monatsreport nach Punkt 6 sehen koennen. Bisher brach der
-- Pfad mit einer Ausnahme ab, und die rollte jeden Eintrag mit zurueck.
--
-- Deshalb bekommen die fuenf Lesepfade auf klinische Dokumente denselben
-- Ausgang wie seit OPS-004 das Auditlog und das Loeschjournal: Ein
-- angemeldetes Konto einer Praxis ohne Leserolle bekommt null Zeilen, und der
-- Versuch steht mit outcome = 'denied' im Auditlog - unter derselben Aktion,
-- die der erfolgreiche Zugriff schreibt.
--
--   get_treatment_note, list_patient_treatment_notes -> treatment_note.viewed
--   get_treatment_note_versions                      -> treatment_note.history_viewed
--   get_treatment_basis,
--   list_patient_treatment_bases_clinical            -> treatment_basis.viewed
--
-- Die Leserolle haben alle vier Praxisrollen. Abgewiesen wird damit ein
-- Patientenkonto oder ein Konto, dem alle Rollen entzogen wurden. Die
-- Oberflaeche ruft diese Pfade fuer solche Konten nie auf. Ein Aufruf ist
-- deshalb einer an der Anwendung vorbei, und die Anwendung erwartet an dieser
-- Stelle keine Ausnahme.
--
-- Unveraendert mit Ausnahme bleiben: ohne Sitzung, ohne Organisation (wie
-- OPS-004), die uebrigen Lesepfade und alle Schreibpfade. Dort rollt die
-- Ausnahme den Eintrag weiter zurueck. Die Bestandsaufnahme und der Weg dafuer
-- stehen als G6b in docs/development/ROADMAP.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.record_denied_read
--
-- Die eine Stelle, die einen abgewiesenen Leseversuch schreibt. Die
-- Verallgemeinerung von app.record_denied_owner_read: Die Aktion waehlt der
-- Aufrufer, das Subjekt ist die Organisation. Welcher Datensatz gemeint war,
-- steht bewusst nicht im Eintrag, denn die Kennung stammt vom abgewiesenen
-- Aufrufer. Liegt in app und ist fuer keine Anwendungsrolle ausfuehrbar, sonst
-- liesse sich das Log mit erfundenen denied-Zeilen fuellen.
-- -----------------------------------------------------------------------------
create function app.record_denied_read(
  p_actor   uuid,
  p_action  text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception '%', p_message using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, p_actor, p_action, 'organization', v_org, 'denied',
    jsonb_build_object('surface', 'api', 'reason', 'role')
  );
end;
$$;

comment on function app.record_denied_read(uuid, text, text) is
  'Schreibt einen abgewiesenen Leseversuch ins Auditlog (OPS-004, G6a, ADR-010). Aufrufer: list_audit_events, list_deletion_runs (ueber record_denied_owner_read) und die fuenf klinischen Lesepfade.';

revoke all on function app.record_denied_read(uuid, text, text)
  from public, anon, authenticated, service_role;

-- Der OPS-004-Helfer bleibt als Name bestehen, weil list_audit_events und
-- list_deletion_runs ihn aufrufen. Er schreibt jetzt ueber die eine Stelle.
create or replace function app.record_denied_owner_read(
  p_actor   uuid,
  p_action  text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.record_denied_read(p_actor, p_action, p_message);
end;
$$;

-- -----------------------------------------------------------------------------
-- get_treatment_note - unveraendert bis auf den Ausgang bei fehlender Leserolle.
-- -----------------------------------------------------------------------------
create or replace function public.get_treatment_note(p_appointment_id uuid)
returns table (id uuid, appointment_id uuid, addendum_to_note_id uuid, status text, content text, visit_without_treatment boolean, created_at timestamp with time zone, updated_at timestamp with time zone, finalized_at timestamp with time zone, finalisation_kind text, version_count integer, author_name text, last_editor_name text, finalized_by_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_note.viewed', 'treatment_note', t.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', p_appointment_id,
           'patient_id', v_patient
         )
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.organization_id = v_org;

  return query
    select t.id,
           t.appointment_id,
           t.addendum_to_note_id,
           t.status,
           t.content,
           t.visit_without_treatment,
           t.created_at,
           t.updated_at,
           t.finalized_at,
           t.finalisation_kind,
           (select count(*) from public.treatment_note_versions v where v.note_id = t.id)::integer,
           verfasser.display_name,
           bearbeiter.display_name,
           finalisierer.display_name
    from public.treatment_notes t
    left join public.user_profiles verfasser    on verfasser.id    = t.created_by
    left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
    left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
    where t.appointment_id = p_appointment_id
      and t.organization_id = v_org
    order by (t.addendum_to_note_id is not null), t.created_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_notes - unveraendert bis auf den Ausgang bei fehlender Leserolle.
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_notes(p_patient_id uuid, p_limit integer default 20, p_before_starts_at timestamp with time zone default null, p_before_id uuid default null)
returns table (appointment_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, appointment_status text, staff_given_name text, staff_family_name text, organization_time_zone text, notes jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_seite uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select array_agg(s.appointment_id order by s.starts_at desc, s.appointment_id desc)
    into v_seite
  from app.patient_record_page(
         v_org, p_patient_id, p_limit, p_before_starts_at, p_before_id
       ) s;

  if v_seite is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_note.viewed', 'treatment_note', t.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', t.appointment_id,
           'patient_id', p_patient_id
         )
  from public.treatment_notes t
  where t.appointment_id = any (v_seite);

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      o.time_zone,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id',                  t.id,
                   'appointment_id',      t.appointment_id,
                   'addendum_to_note_id', t.addendum_to_note_id,
                   'status',              t.status,
                   'content',             t.content,
                   -- Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018).
                   'visit_without_treatment', t.visit_without_treatment,
                   'created_at',          t.created_at,
                   'updated_at',          t.updated_at,
                   'finalized_at',        t.finalized_at,
                   'finalisation_kind',   t.finalisation_kind,
                   'version_count',       (select count(*)
                                             from public.treatment_note_versions v
                                            where v.note_id = t.id),
                   'author_name',         verfasser.display_name,
                   'last_editor_name',    bearbeiter.display_name,
                   'finalized_by_name',   finalisierer.display_name
                 )
                 order by (t.addendum_to_note_id is not null), t.created_at
               )
        from public.treatment_notes t
        left join public.user_profiles verfasser    on verfasser.id    = t.created_by
        left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
        left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
        where t.appointment_id = a.id
      ), '[]'::jsonb)
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.id = any (v_seite)
    order by a.starts_at desc, a.id desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_treatment_note_versions - unveraendert bis auf den Ausgang bei fehlender Leserolle.
-- -----------------------------------------------------------------------------
create or replace function public.get_treatment_note_versions(p_note_id uuid)
returns table (version_no integer, content text, change_reason text, recorded_at timestamp with time zone, author_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_note    record;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.history_viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select t.id, t.appointment_id
    into v_note
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org;

  if not found then
    return;
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_note.appointment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.history_viewed', 'treatment_note', p_note_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_note.appointment_id,
      'patient_id', v_patient
    )
  );

  return query
    select v.version_no,
           v.content,
           v.change_reason,
           v.recorded_at,
           urheber.display_name
    from public.treatment_note_versions v
    left join public.user_profiles urheber on urheber.id = v.author_id
    where v.note_id = p_note_id
    order by v.version_no;
end;
$$;

-- -----------------------------------------------------------------------------
-- get_treatment_basis - unveraendert bis auf den Ausgang bei fehlender Leserolle.
-- -----------------------------------------------------------------------------
create or replace function public.get_treatment_basis(p_treatment_basis_id uuid)
returns table (id uuid, patient_id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, appointment_count integer, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_basis_clinical() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  -- Eine fremde und eine unbekannte ID liefern beide nichts.
  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return query
    select
      p.id,
      p.patient_id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.appointment_count,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      -- Drei Bestandstexte: Das Formular bietet sie seit VER-EPIC-002 nicht
      -- mehr zur Eingabe an, zeigt sie aber weiter an - sonst waere ein
      -- vorhandener Text unsichtbar und damit faktisch verloren.
      p.therapy_goal,
      p.prescriber_note,
      p.follow_up_recommendation
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = p_treatment_basis_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_bases_clinical - unveraendert bis auf den Ausgang bei fehlender Leserolle.
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_bases_clinical(p_patient_id uuid)
returns table (id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Rollenmenge wie bei der Behandlungsdokumentation: die Grundlage
  -- oeffnet keinen zweiten Weg zu klinischem Freitext (4.3, 4.6).
  if not app.can_read_treatment_basis_clinical() then
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_ids := app.patient_treatment_basis_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', unnest(v_ids), 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id);

  return query
    select
      p.id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      p.therapy_goal,
      p.prescriber_note,
      -- ANN-014: die Empfehlung der Therapeut:in, von ihr selbst erfasst.
      p.follow_up_recommendation
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$$;

comment on column public.audit_log.outcome is
  'Ergebnis des protokollierten Vorgangs. denied schreiben list_audit_events, list_deletion_runs (OPS-004) und die fuenf Lesepfade auf klinische Dokumente (G6a); die uebrigen Abweisungen rollen ihren Eintrag weiter mit zurueck (ROADMAP G6b).';
