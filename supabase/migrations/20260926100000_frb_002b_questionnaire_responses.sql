-- =============================================================================
-- Erhobene Fragebögen in der Akte (FRB-EPIC-002, Story FRB-002b)
--
-- PROJECT_PRINCIPLES.md §7: Fragebögen werden strukturiert erfasst, jeder
-- hat eine Version, und ein abgeschlossener bleibt in der beantworteten
-- Version erhalten. Der erste ist der Anamnesebogen V8; die Tabelle kennt aber
-- kein Instrument namentlich - sie speichert Kennung und Version der
-- Definition, die als Datei im Release liegt (ANN-083).
--
--   * ZWEI ZUSTAENDE. `entwurf` ist frei aenderbar und darf verworfen werden;
--     `abgeschlossen` ist unveraenderlich - auch fuer den Anwendungspfad, ein
--     Trigger haelt die Zeile fest. Eine Korrektur ist eine NEUE Erhebung, die
--     auf die alte zeigt und eine Begruendung traegt; die alte bleibt
--     vollstaendig lesbar (ANN-103, nach dem Muster von ADR-016 Punkt 5 und 6).
--   * NUR DAS BEHANDLUNGSVERHAELTNIS. Die Zeile haengt an `patients`, nicht an
--     `persons` (ADR-021 Punkt 5). Ein Fragebogen im Training bekommt eine
--     eigene Tabelle am Trainingsverhaeltnis, sobald B2 dessen Frist nennt.
--   * WER: Lesen alle vier Praxisrollen (ADR-004 Punkt 2 und 3, E15), jeder
--     Lesezugriff je Erhebung protokolliert. Erheben, abschliessen, verwerfen
--     und korrigieren nur owner, therapist und team_lead - die Anamnese ist
--     ein Behandlungsschritt (ANN-103).
--   * DIE ANTWORTEN prueft die Anwendung gegen die Definition (Zod). Der
--     Server kennt die Dateien nicht und prueft Form und Groesse (ANN-105).
--
-- Datenklasse: Patientenakte ("Klinisch relevante Anamnese, PROMs", ADR-008).
-- Die Zeilen fallen mit der Akte (FK on delete cascade).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- patient_questionnaire_responses
-- -----------------------------------------------------------------------------
create table public.patient_questionnaire_responses (
  id                      uuid primary key default extensions.gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  patient_id              uuid not null references public.patients (id) on delete cascade,

  -- Kennung und Version der Definition unter src/features/assessments/definitionen/.
  instrument_id           text not null
                            check (instrument_id ~ '^[a-z][a-z0-9_]*$' and length(instrument_id) <= 80),
  definition_version      text not null
                            check (definition_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),

  status                  text not null default 'entwurf'
                            check (status in ('entwurf', 'abgeschlossen')),

  -- Der Tag der Erhebung - das "Datum:" des Bogens, nicht der Tag der Eingabe.
  recorded_on             date not null,

  -- Ein Objekt Kennung -> Antwort. Die Form je Antworttyp prueft die
  -- Anwendung gegen die Definition (ANN-105).
  answers                 jsonb not null default '{}'::jsonb,

  -- Korrektur einer abgeschlossenen Erhebung (ANN-103).
  supersedes_response_id  uuid references public.patient_questionnaire_responses (id) on delete cascade,
  change_reason           text check (change_reason is null or length(btrim(change_reason)) between 3 and 500),

  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  completed_at            timestamptz,
  completed_by            uuid,

  constraint patient_questionnaire_responses_answers_shape check (
    jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536
  ),
  constraint patient_questionnaire_responses_completion_shape check (
    (status = 'abgeschlossen') = (completed_at is not null)
  ),
  constraint patient_questionnaire_responses_correction_shape check (
    (supersedes_response_id is null) = (change_reason is null)
  )
);

comment on table public.patient_questionnaire_responses is
  'Erhobene Fragebögen der Akte (FRB-EPIC-002, PROJECT_PRINCIPLES.md 7). Abgeschlossen unveraenderlich; Korrektur als neue Erhebung mit Verweis und Begruendung (ANN-103). Kein direkter Zugriff, nur ueber die Funktionen. Datenklasse: Patientenakte, faellt mit der Akte.';
comment on column public.patient_questionnaire_responses.answers is
  'Kennung des Items -> Antwort. Auswahl speichert die Kennung der Option (ANN-102). Gegen die Definition geprueft in der Anwendung (ANN-105).';

create index patient_questionnaire_responses_patient_idx
  on public.patient_questionnaire_responses (patient_id, recorded_on desc, created_at desc);

-- Eine abgeschlossene Erhebung wird hoechstens einmal ersetzt: Die Kette bleibt
-- eine Kette und verzweigt nicht.
create unique index patient_questionnaire_responses_supersedes_key
  on public.patient_questionnaire_responses (supersedes_response_id)
  where supersedes_response_id is not null;

-- -----------------------------------------------------------------------------
-- Unveraenderlichkeit (PROJECT_PRINCIPLES.md 7: "bleiben in der beantworteten
-- Version erhalten"). Die Funktionen pruefen dasselbe; der Trigger haelt es
-- auch fuer jeden kuenftigen Pfad fest. Loeschen bleibt moeglich - mit der
-- Akte (Retention, ADR-008) und fuer einen Entwurf ueber die Funktion.
-- -----------------------------------------------------------------------------
create function app.guard_questionnaire_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'abgeschlossen' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;
  if new.organization_id <> old.organization_id
     or new.patient_id <> old.patient_id
     or new.instrument_id <> old.instrument_id
     or new.definition_version <> old.definition_version
     or new.supersedes_response_id is distinct from old.supersedes_response_id then
    raise exception 'questionnaire response identity is fixed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger patient_questionnaire_responses_guard
  before update on public.patient_questionnaire_responses
  for each row execute function app.guard_questionnaire_response();

-- -----------------------------------------------------------------------------
-- Rechte: keine direkte Tabellenberechtigung fuer irgendeine Anwendungsrolle.
-- RLS bleibt trotzdem an (deny-by-default, ADR-004), falls je ein Grant kommt.
-- -----------------------------------------------------------------------------
alter table public.patient_questionnaire_responses enable row level security;
revoke all on public.patient_questionnaire_responses from public, anon, authenticated;

create function app.can_write_questionnaire_response()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

comment on function app.can_write_questionnaire_response() is
  'Wer einen Fragebogen erheben, abschliessen, verwerfen und korrigieren darf: die therapeutischen Rollen (ANN-103). Lesen regelt app.can_read_treatment_note() - alle vier Praxisrollen (ADR-004 Fassung 2).';

grant execute on function app.can_write_questionnaire_response() to authenticated;

-- -----------------------------------------------------------------------------
-- Retention Schedule (ADR-008)
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('patient_questionnaire_responses', 'patientenakte', 'ueber_elterndatensatz',
   'Erhobene Fragebögen (Anamnese, spaeter PROMs) samt Korrekturen. Fallen mit der Akte (FK on delete cascade); ADR-008 fuehrt Anamnese und PROMs ausdruecklich als Teil der Patientenakte.', 47);

-- -----------------------------------------------------------------------------
-- app.assert_questionnaire_answers
--
-- Was der Server pruefen kann, ohne die Definition zu kennen: ein Objekt,
-- Schluessel in der Form einer Kennung, jeder Wert ein Objekt, insgesamt
-- hoechstens 64 KiB. Die Form je Antworttyp prueft die Anwendung (ANN-105).
-- -----------------------------------------------------------------------------
create function app.assert_questionnaire_answers(p_answers jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_val jsonb;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers must be an object' using errcode = '22023';
  end if;
  if octet_length(p_answers::text) > 65536 then
    raise exception 'answers too large' using errcode = '22023';
  end if;
  for v_key, v_val in select key, value from jsonb_each(p_answers) loop
    if v_key !~ '^[a-z][a-z0-9_]*$' or length(v_key) > 80 then
      raise exception 'answer key is not an identifier' using errcode = '22023';
    end if;
    if jsonb_typeof(v_val) <> 'object' then
      raise exception 'answer must be an object' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function app.assert_questionnaire_answers(jsonb) from public, anon;

-- -----------------------------------------------------------------------------
-- save_questionnaire_response
--
-- Der eine Schreibweg fuer Entwuerfe. Ohne p_response_id entsteht eine neue
-- Erhebung - mit p_supersedes_response_id als Korrektur einer abgeschlossenen;
-- mit p_response_id wird ein Entwurf ueberschrieben.
-- -----------------------------------------------------------------------------
create function public.save_questionnaire_response(
  p_patient_id              uuid,
  p_response_id             uuid,
  p_instrument_id           text,
  p_definition_version      text,
  p_recorded_on             date,
  p_answers                 jsonb,
  p_supersedes_response_id  uuid default null,
  p_change_reason           text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_alt      record;
  v_id       uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  -- Eine fremde Akte und eine nicht vorhandene sehen gleich aus (ADR-003).
  perform 1 from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_recorded_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_recorded_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  perform app.assert_questionnaire_answers(p_answers);

  if p_response_id is not null then
    select r.status, r.patient_id
      into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_response_id and r.organization_id = v_org
    for update;

    if not found or v_alt.patient_id <> p_patient_id then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'entwurf' then
      raise exception 'questionnaire response is completed' using errcode = '23514';
    end if;

    update public.patient_questionnaire_responses
       set answers     = p_answers,
           recorded_on = p_recorded_on,
           updated_at  = now(),
           updated_by  = v_actor
     where id = p_response_id;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'questionnaire_response.updated', 'questionnaire_response', p_response_id,
      'success', jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
    );

    return p_response_id;
  end if;

  if p_supersedes_response_id is not null then
    select r.status, r.patient_id, r.instrument_id
      into v_alt
    from public.patient_questionnaire_responses r
    where r.id = p_supersedes_response_id and r.organization_id = v_org
    for update;

    if not found or v_alt.patient_id <> p_patient_id then
      raise exception 'questionnaire response not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'abgeschlossen' then
      raise exception 'only a completed questionnaire can be corrected' using errcode = '23514';
    end if;
    if v_alt.instrument_id <> p_instrument_id then
      raise exception 'correction must use the same instrument' using errcode = '23514';
    end if;
    if p_change_reason is null or length(btrim(p_change_reason)) < 3 then
      raise exception 'a correction needs a reason' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.patient_questionnaire_responses r
      where r.supersedes_response_id = p_supersedes_response_id
    ) then
      raise exception 'questionnaire response already corrected' using errcode = '23505';
    end if;
  elsif p_change_reason is not null then
    raise exception 'a reason belongs to a correction' using errcode = '22023';
  end if;

  -- Kennung und Version pruefen die Constraints der Tabelle.
  insert into public.patient_questionnaire_responses (
    organization_id, patient_id, instrument_id, definition_version, recorded_on, answers,
    supersedes_response_id, change_reason, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_instrument_id, p_definition_version, p_recorded_on, p_answers,
    p_supersedes_response_id, nullif(btrim(p_change_reason), ''), v_actor, v_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'questionnaire_response.created', 'questionnaire_response', v_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'instrument_id', p_instrument_id,
      'definition_version', p_definition_version,
      'supersedes_response_id', p_supersedes_response_id
    )
  );

  return v_id;
end;
$$;

comment on function public.save_questionnaire_response(uuid, uuid, text, text, date, jsonb, uuid, text) is
  'Legt eine Erhebung an, korrigiert eine abgeschlossene als neue Erhebung oder ueberschreibt einen Entwurf (FRB-002b, ANN-103). owner, therapist, team_lead; protokolliert als questionnaire_response.created/updated.';

revoke all on function public.save_questionnaire_response(uuid, uuid, text, text, date, jsonb, uuid, text) from public, anon;
grant execute on function public.save_questionnaire_response(uuid, uuid, text, text, date, jsonb, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- complete_questionnaire_response / discard_questionnaire_response
-- -----------------------------------------------------------------------------
create function public.complete_questionnaire_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  select r.status, r.patient_id into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'questionnaire response not found' using errcode = 'P0002';
  end if;
  if v_alt.status <> 'entwurf' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;

  update public.patient_questionnaire_responses
     set status       = 'abgeschlossen',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now(),
         updated_by   = v_actor
   where id = p_response_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'questionnaire_response.completed', 'questionnaire_response', p_response_id,
    'success', jsonb_build_object('surface', 'web', 'patient_id', v_alt.patient_id)
  );
end;
$$;

comment on function public.complete_questionnaire_response(uuid) is
  'Schliesst eine Erhebung ab; danach ist sie unveraenderlich (FRB-002b, ANN-103). Protokolliert als questionnaire_response.completed.';

revoke all on function public.complete_questionnaire_response(uuid) from public, anon;
grant execute on function public.complete_questionnaire_response(uuid) to authenticated;

create function public.discard_questionnaire_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_questionnaire_response() then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record questionnaires' using errcode = '42501';
  end if;

  select r.status, r.patient_id into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'questionnaire response not found' using errcode = 'P0002';
  end if;
  if v_alt.status <> 'entwurf' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;

  delete from public.patient_questionnaire_responses where id = p_response_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'questionnaire_response.discarded', 'questionnaire_response', p_response_id,
    'success', jsonb_build_object('surface', 'web', 'patient_id', v_alt.patient_id)
  );
end;
$$;

comment on function public.discard_questionnaire_response(uuid) is
  'Verwirft einen Entwurf - eine abgeschlossene Erhebung nie (FRB-002b, ANN-103). Protokolliert als questionnaire_response.discarded.';

revoke all on function public.discard_questionnaire_response(uuid) from public, anon;
grant execute on function public.discard_questionnaire_response(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_questionnaire_responses
--
-- Der Lesepfad: alle Erhebungen einer Akte, neueste zuerst, mit Namen statt
-- Kennungen. Jede gelieferte Erhebung wird als questionnaire_response.viewed
-- protokolliert (ADR-010 Punkt 2). Ohne Leserolle: null Zeilen und ein
-- denied-Eintrag, wie die uebrigen klinischen Lesepfade (G6a).
-- -----------------------------------------------------------------------------
create function public.list_patient_questionnaire_responses(p_patient_id uuid)
returns table (
  id                         uuid,
  instrument_id              text,
  definition_version         text,
  status                     text,
  recorded_on                date,
  answers                    jsonb,
  supersedes_response_id     uuid,
  superseded_by_response_id  uuid,
  change_reason              text,
  created_at                 timestamptz,
  updated_at                 timestamptz,
  completed_at               timestamptz,
  author_name                text,
  completed_by_name          text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'questionnaire_response.viewed', 'not allowed to read questionnaires');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read questionnaires' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'questionnaire_response.viewed', 'questionnaire_response', r.id, 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  from public.patient_questionnaire_responses r
  where r.patient_id = p_patient_id and r.organization_id = v_org;

  return query
    select
      r.id,
      r.instrument_id,
      r.definition_version,
      r.status,
      r.recorded_on,
      r.answers,
      r.supersedes_response_id,
      nachfolger.id,
      r.change_reason,
      r.created_at,
      r.updated_at,
      r.completed_at,
      verfasser.display_name,
      abschluss.display_name
    from public.patient_questionnaire_responses r
    left join public.patient_questionnaire_responses nachfolger
           on nachfolger.supersedes_response_id = r.id
    left join public.user_profiles verfasser on verfasser.id = r.created_by
    left join public.user_profiles abschluss on abschluss.id = r.completed_by
    where r.patient_id = p_patient_id and r.organization_id = v_org
    order by r.recorded_on desc, r.created_at desc;
end;
$$;

comment on function public.list_patient_questionnaire_responses(uuid) is
  'Erhobene Fragebögen einer Akte (FRB-002b). Alle vier Praxisrollen; je Erhebung protokolliert als questionnaire_response.viewed, abgewiesen mit denied-Eintrag (ADR-010, G6a).';

revoke all on function public.list_patient_questionnaire_responses(uuid) from public, anon;
grant execute on function public.list_patient_questionnaire_responses(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Auskunft nach Art. 15 DSGVO: Erhobene Fragebögen gehoeren zur Kopie (Art. 15 Abs. 3).
-- Rumpf sonst unveraendert aus 20260925100000_map_006a_coordinates.sql.
-- -----------------------------------------------------------------------------
create or replace function public.export_patient_record(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        'fax', k.fax,
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
        'updated_at', d.updated_at
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
        'confirmed_at', da.confirmed_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
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
        'recorded_at', pr.recorded_at
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
        'was', 'Inhalt hochgeladener Dateien',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme; die Datei selbst wird getrennt herausgegeben (ADR-017).'
      ),
      jsonb_build_object(
        'was', 'Protokoll der Zugriffe auf die Akte',
        'grund', 'Jede Zeile ist zugleich ein Datensatz ueber eine beschaeftigte Person (Art. 15 Abs. 4 DSGVO); sie wird auf gesondertes Verlangen erteilt (ANN-092).'
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
$$;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; supabase/tests/audit.test.ts prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'treatment_basis',
    'text_snippet',
    'user_account',
    'patient_file',
    'storage_deletion_order',
    'service_catalog_version',
    'invoice_recipient',
    'invoice',
    'payment',
    'questionnaire_response'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'patient_record.exported',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'organization.billing_profile_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted',
    'service_catalog.version_created',
    'service_catalog.version_updated',
    'service_catalog.version_published',
    'service_catalog.version_deleted',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice_recipient.created',
    'invoice_recipient.updated',
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued',
    'invoice.cancelled',
    'invoice.reminder_created',
    'payment.recorded',
    'payment.voided',
    'organization.bootstrapped',
    'deletion_runs.read',
    'patient_privacy.recorded',
    'appointments.read',
    'patient_directory.read',
    'treatment_bases.read',
    'treatment_evidence.read',
    'patient_files.read',
    'text_snippets.read',
    'invoicing.read',
    'billable_services.read',
    'legal_holds.read',
    'storage_deletion.read',
    'patient.address_geocoded',
    'organization.tour_start_changed',
    'questionnaire_response.created',
    'questionnaire_response.updated',
    'questionnaire_response.completed',
    'questionnaire_response.discarded',
    'questionnaire_response.viewed'
  ));
