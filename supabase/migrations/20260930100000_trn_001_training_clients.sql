-- =============================================================================
-- TRN-001: Schreib- und Lesewege fuer das Trainingsverhaeltnis (TRN-EPIC-001)
--
-- Etappe L hat das Fundament gebaut (LEI-001 bis LEI-003): die Tabelle
-- `training_relationships`, ihre Datenklasse, die Rolle `trainer` und die
-- Lese-Policy. Was fehlte, war jede Tuer dorthin. Diese Migration baut sie:
--
--   create_training_client        neue Person, neues Trainingsverhaeltnis
--   start_training_for_person     vorhandene Person, zweites Verhaeltnis
--   update_training_client        Name, Kontakt, Vertragsbeginn
--   end_training_relationship     Vertragsende setzen (Anker der Frist)
--   reopen_training_relationship  Vertragsende raeumen
--   list_training_clients         Trefferliste
--   get_training_client           Detailansicht, protokolliert
--   find_possible_training_duplicates  Hinweis beim Anlegen
--
-- WER SCHREIBT (ANN-172): owner, trainer und office. owner ist
-- Vertragspartner beider Verhaeltnisse, trainer der Bereich selbst
-- (PROJECT_PRINCIPLES.md §4.9: "anlegen, aendern und beenden"). office ist im
-- Training "nur organisatorisch" (§4.8, Tabelle) - und Anlegen, Kontakt und
-- Vertragsstatus sind genau das, was das Buero auch in der Behandlung tut.
-- Screening- und Gesundheitsangaben gibt es hier nicht; sie bleiben fuer
-- office gesperrt, wenn sie kommen. Eine Stelle: app.can_write_training_relationships().
--
-- NICHT dabei: therapist und team_lead. Der offene Zugriff auf alle Akten
-- (§4.2) gilt innerhalb der Behandlung; aus ihm folgt kein Schreibrecht im
-- Training (ADR-021 Punkt 6). Ein abgewiesener Versuch wird protokolliert.
--
-- KONTAKTDATEN HAENGEN AM VERHAELTNIS, NICHT AN DER PERSON. `persons` traegt
-- seit der Datenminimierung (20260828110000) nur den Namen; Kontakt und
-- Adresse liegen im Patientenkontext in `patient_contact_details`. Das
-- Training bekommt dasselbe Gegenstueck: `training_contact_details`. Damit
-- sieht die Trainingsbetreuung nie die Adresse aus der Akte, und die Akte
-- nie die aus dem Training - geteilt ist nur der Name (ADR-021 Punkt 3).
-- Beim zweiten Verhaeltnis wird nichts aus der Akte uebernommen (ANN-173):
-- auch Kontaktdaten sind im Behandlungskontext erhoben, und eine Uebernahme
-- ist eine dokumentierte Kopie, keine Automatik (ADR-021 Punkt 7).
--
-- DER NAME IST GETEILT (ANN-174): Aendert die Trainingsbetreuung den Namen,
-- aendert sie ihn fuer die Person - also auch in einer Akte, von der sie
-- nichts weiss. Das ist der Preis der einen Identitaet, die ADR-021 gegen
-- zwei Personendatensaetze gewaehlt hat; ein Verbot verriete durch seine
-- Fehlermeldung, dass es eine Akte gibt. Protokolliert wird die Aenderung
-- am Trainingsverhaeltnis.
--
-- DAS ZWEITE VERHAELTNIS (ANN-173): An eine vorhandene Person haengt nur,
-- wer sie aus dem anderen Bereich schon sieht - owner und office. Fuer die
-- Trainingsbetreuung ist eine Akte "nicht gefunden", ununterscheidbar von
-- einer unbekannten Kennung. So entsteht keine Dublette, und niemand
-- schliesst aus dem Training auf eine Behandlung (§4.8).
--
-- AUDIT AUF § 203-NIVEAU (ADR-021 Punkt 8, ADR-010): jede Aenderung, das
-- Oeffnen der Detailansicht und jeder abgewiesene Versuch. Die Trefferliste
-- und der Dublettenhinweis wie in der Kartei nicht (ADR-010: Trefferliste
-- nein), ihr abgewiesener Versuch schon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kontaktdaten im Trainingskontext
-- -----------------------------------------------------------------------------
create table public.training_contact_details (
  training_relationship_id uuid primary key
                             references public.training_relationships (id) on delete cascade,
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  date_of_birth            date,
  email                    text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone                    text check (phone is null or length(btrim(phone)) between 3 and 40),
  street                   text check (street is null or length(btrim(street)) between 1 and 200),
  postal_code              text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  city                     text check (city is null or length(btrim(city)) between 1 and 100),
  created_at               timestamptz not null default now(),
  created_by               uuid,
  updated_at               timestamptz,
  updated_by               uuid
);

comment on table public.training_contact_details is
  'Kontakt- und Adressdaten im Trainingskontext (TRN-001). Gegenstueck zu patient_contact_details: haengt am Verhaeltnis, nicht an persons, damit Training und Behandlung keine Kontaktdaten teilen (ADR-021 Punkt 3). Keine Screening- und Gesundheitsangaben. Datenklasse: Trainingsverhaeltnis, faellt mit ihm.';

create index training_contact_details_organization_id_idx
  on public.training_contact_details (organization_id);

alter table public.training_contact_details enable row level security;
revoke all on public.training_contact_details from public, anon, authenticated;
grant select on public.training_contact_details to authenticated;

-- Dieselbe Grenze wie am Verhaeltnis selbst: owner, trainer, office.
create policy training_contact_details_select_scoped
  on public.training_contact_details for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_training_relationships()
  );

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('training_contact_details', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Kontaktdaten des Trainingsverhaeltnisses. Fallen mit ihm (FK on delete cascade).', 56);

-- -----------------------------------------------------------------------------
-- 2. Wer schreibt (ANN-172) - die eine Stelle
-- -----------------------------------------------------------------------------
create function app.can_write_training_relationships()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'trainer', 'office')
$$;

comment on function app.can_write_training_relationships() is
  'Rollen, die Trainingsverhaeltnisse anlegen, aendern und beenden (TRN-001, ANN-172, PROJECT_PRINCIPLES.md 4.8/4.9). Ohne die therapeutischen Rollen.';

revoke all on function app.can_write_training_relationships() from public, anon;
grant execute on function app.can_write_training_relationships() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Auditkatalog
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
    'questionnaire_response',
    'patient_course_event',
    'therapy_report',
    'waitlist_entry',
    'territory',
    'task',
    'training_relationship'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text])));

-- -----------------------------------------------------------------------------
-- 4. Gemeinsame Helfer (nicht aufrufbar fuer Anwendungsrollen)
-- -----------------------------------------------------------------------------

-- Leere Eingaben zaehlen als "nicht angegeben".
create function app.leer_zu_null(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_text), '')
$$;

revoke all on function app.leer_zu_null(text) from public, anon, authenticated;

-- Heute in der Zeitzone der Praxis - Vertragsdaten sind Kalendertage.
create function app.training_today(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.time_zone)::date
  from public.organizations o
  where o.id = p_org
$$;

revoke all on function app.training_today(uuid) from public, anon, authenticated;

-- Schreibt die Kontaktdaten eines Verhaeltnisses (anlegen oder ersetzen).
create function app.write_training_contact(
  p_relationship_id uuid,
  p_org             uuid,
  p_actor           uuid,
  p_date_of_birth   date,
  p_email           text,
  p_phone           text,
  p_street          text,
  p_postal_code     text,
  p_city            text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_date_of_birth is not null and p_date_of_birth > app.training_today(p_org) then
    raise exception 'date of birth is in the future' using errcode = '22023';
  end if;

  insert into public.training_contact_details as d (
    training_relationship_id, organization_id, date_of_birth, email, phone,
    street, postal_code, city, created_by
  )
  values (
    p_relationship_id, p_org, p_date_of_birth,
    lower(app.leer_zu_null(p_email)), app.leer_zu_null(p_phone),
    app.leer_zu_null(p_street), app.leer_zu_null(p_postal_code), app.leer_zu_null(p_city),
    p_actor
  )
  on conflict (training_relationship_id) do update
     set date_of_birth = excluded.date_of_birth,
         email         = excluded.email,
         phone         = excluded.phone,
         street        = excluded.street,
         postal_code   = excluded.postal_code,
         city          = excluded.city,
         updated_at    = now(),
         updated_by    = p_actor;
end;
$$;

revoke all on function app.write_training_contact(uuid, uuid, uuid, date, text, text, text, text, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. create_training_client - Person und Verhaeltnis neu
--
-- Die Person entsteht ohne Akte: `patients` bleibt unberuehrt. Wer eine
-- Person anlegt, die es schon gibt, bekommt vorher den Hinweis
-- (find_possible_training_duplicates); gesperrt wird nicht - Namensgleiche
-- gibt es (wie ANN-145).
-- -----------------------------------------------------------------------------
create function public.create_training_client(
  p_given_name          text,
  p_family_name         text,
  p_date_of_birth       date default null,
  p_email               text default null,
  p_phone               text default null,
  p_street              text default null,
  p_postal_code         text default null,
  p_city                text default null,
  p_contract_started_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_person uuid;
  v_id     uuid;
  v_start  date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    -- Abgewiesen mit bestaetigtem denied-Eintrag und HTTP 403 (G6c).
    perform app.record_denied_write(v_actor, 'training_relationship.created', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  if app.leer_zu_null(p_given_name) is null or app.leer_zu_null(p_family_name) is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  -- Ohne Angabe beginnt der Vertrag heute.
  v_start := coalesce(p_contract_started_on, app.training_today(v_org));

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, btrim(p_given_name), btrim(p_family_name), v_actor)
  returning id into v_person;

  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (v_org, v_person, 'active', v_start, v_actor)
  returning id into v_id;

  perform app.write_training_contact(
    v_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_postal_code, p_city
  );

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.created', 'training_relationship', v_id, 'success',
    -- Kein Name, kein Kontakt: Metadaten reichen fuer den Nachweis (ADR-010 Punkt 3).
    jsonb_build_object('surface', 'web', 'new_person', true)
  );

  return v_id;
end;
$$;

comment on function public.create_training_client(text, text, date, text, text, text, text, text, date) is
  'TRN-001: legt eine Person OHNE Behandlungsverhaeltnis und ihr Trainingsverhaeltnis an (ADR-021 Punkt 2). owner, trainer, office (ANN-172); protokolliert training_relationship.created, abgewiesen mit denied und HTTP 403.';
revoke all on function public.create_training_client(text, text, date, text, text, text, text, text, date) from public, anon;
grant execute on function public.create_training_client(text, text, date, text, text, text, text, text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. start_training_for_person - das zweite Verhaeltnis einer Person
--
-- Nur fuer eine Person, die der Aufrufer aus dem Behandlungsbereich sieht
-- (Akte oder Beschaeftigung, wie persons_select_scoped) - also fuer owner und
-- office. Fuer alle anderen ist sie "nicht gefunden" (ANN-173).
-- -----------------------------------------------------------------------------
create function public.start_training_for_person(
  p_person_id           uuid,
  p_contract_started_on date default null,
  p_date_of_birth       date default null,
  p_email               text default null,
  p_phone               text default null,
  p_street              text default null,
  p_postal_code         text default null,
  p_city                text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.created', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  -- Die Person sperren und pruefen, dass der Aufrufer sie aus dem anderen
  -- Bereich kennt. app.is_staff() ist die Behandlungsseite; die Trainings-
  -- betreuung allein hat sie nicht.
  perform 1
  from public.persons pe
  where pe.id = p_person_id
    and pe.organization_id = v_org
    and app.is_staff()
    and (
      exists (select 1 from public.patients x where x.person_id = pe.id and x.organization_id = v_org)
      or exists (select 1 from public.staff_members x where x.person_id = pe.id and x.organization_id = v_org)
    )
  for update of pe;
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.training_relationships t where t.person_id = p_person_id) then
    raise exception 'training relationship already exists' using errcode = '23505';
  end if;

  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (
    v_org, p_person_id, 'active',
    coalesce(p_contract_started_on, app.training_today(v_org)), v_actor
  )
  returning id into v_id;

  -- Aus der Akte wird nichts uebernommen (ANN-173). Was im Formular steht,
  -- hat die anlegende Person fuer das Training eingegeben - das kommt mit,
  -- sonst gingen ihre Eingaben still verloren (Zweitreview TRN-EPIC-001).
  perform app.write_training_contact(
    v_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_postal_code, p_city
  );

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.created', 'training_relationship', v_id, 'success',
    jsonb_build_object('surface', 'web', 'new_person', false)
  );

  return v_id;
end;
$$;

comment on function public.start_training_for_person(uuid, date, date, text, text, text, text, text) is
  'TRN-001: gibt einer vorhandenen Person ihr Trainingsverhaeltnis, ohne zweite persons-Zeile. Nur wer die Person aus dem Behandlungsbereich sieht (owner, office); sonst "person not found" (ANN-173). Uebernimmt keine Daten aus der Akte; Kontaktdaten nur aus dem Aufruf.';
revoke all on function public.start_training_for_person(uuid, date, date, text, text, text, text, text) from public, anon;
grant execute on function public.start_training_for_person(uuid, date, date, text, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. update_training_client - Name, Kontakt, Vertragsbeginn
-- -----------------------------------------------------------------------------
create function public.update_training_client(
  p_relationship_id     uuid,
  p_given_name          text,
  p_family_name         text,
  p_date_of_birth       date,
  p_email               text,
  p_phone               text,
  p_street              text,
  p_postal_code         text,
  p_city                text,
  p_contract_started_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_person uuid;
  v_ende   date;
  v_alt    record;
  v_felder text[] := '{}';
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.updated', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  if app.leer_zu_null(p_given_name) is null or app.leer_zu_null(p_family_name) is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  select t.person_id, t.contract_ended_on into v_person, v_ende
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if p_contract_started_on is null then
    raise exception 'contract start is required' using errcode = '22023';
  end if;
  if v_ende is not null and p_contract_started_on > v_ende then
    raise exception 'contract start is after the contract end' using errcode = '22023';
  end if;

  -- Welche Felder sich aendern - nur die Namen der Felder gehen ins Protokoll.
  select pe.given_name, pe.family_name, t.contract_started_on,
         d.date_of_birth, d.email, d.phone, d.street, d.postal_code, d.city
    into v_alt
  from public.training_relationships t
  join public.persons pe on pe.id = t.person_id
  left join public.training_contact_details d on d.training_relationship_id = t.id
  where t.id = p_relationship_id;

  if v_alt.given_name is distinct from btrim(p_given_name)
     or v_alt.family_name is distinct from btrim(p_family_name) then
    v_felder := array_append(v_felder, 'name');
  end if;
  if v_alt.contract_started_on is distinct from p_contract_started_on then
    v_felder := array_append(v_felder, 'contract_started_on');
  end if;
  if v_alt.date_of_birth is distinct from p_date_of_birth
     or v_alt.email is distinct from lower(app.leer_zu_null(p_email))
     or v_alt.phone is distinct from app.leer_zu_null(p_phone)
     or v_alt.street is distinct from app.leer_zu_null(p_street)
     or v_alt.postal_code is distinct from app.leer_zu_null(p_postal_code)
     or v_alt.city is distinct from app.leer_zu_null(p_city) then
    v_felder := array_append(v_felder, 'contact');
  end if;

  if cardinality(v_felder) = 0 then
    return p_relationship_id;
  end if;

  -- Der Name einer Mitarbeiter:in oder eines Kontos gehoert in die
  -- Mitarbeiterstammdaten: Aendern darf ihn dort nur, wer sie pflegt
  -- (app.can_manage_staff_master_data, ANN-174). Aus dem Training heraus
  -- ginge das an Pruefung und Protokoll vorbei (Zweitreview TRN-EPIC-001).
  -- Die Meldung verraet nichts, was §4.8 schuetzt: Zugehoerigkeit zum Team
  -- ist kein Behandlungsdatum.
  if array_position(v_felder, 'name') is not null
     and not app.can_manage_staff_master_data()
     and (
       exists (select 1 from public.staff_members x where x.person_id = v_person)
       or exists (select 1 from public.user_profiles x where x.person_id = v_person)
     ) then
    raise exception 'name is managed in staff master data' using errcode = '42501';
  end if;

  -- Der Name gehoert der Person, nicht dem Verhaeltnis (ANN-174).
  update public.persons
     set given_name = btrim(p_given_name), family_name = btrim(p_family_name)
   where id = v_person
     and (given_name is distinct from btrim(p_given_name)
          or family_name is distinct from btrim(p_family_name));

  update public.training_relationships
     set contract_started_on = p_contract_started_on
   where id = p_relationship_id
     and contract_started_on is distinct from p_contract_started_on;

  perform app.write_training_contact(
    p_relationship_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_postal_code, p_city
  );

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.updated', 'training_relationship', p_relationship_id, 'success',
    jsonb_build_object('surface', 'web', 'fields', to_jsonb(v_felder))
  );

  return p_relationship_id;
end;
$$;

comment on function public.update_training_client(uuid, text, text, date, text, text, text, text, text, date) is
  'TRN-001: aendert Name (der Person, ANN-174), Kontakt (des Verhaeltnisses) und Vertragsbeginn. owner, trainer, office; protokolliert training_relationship.updated mit den Namen der geaenderten Felder, ohne Werte.';
revoke all on function public.update_training_client(uuid, text, text, date, text, text, text, text, text, date) from public, anon;
grant execute on function public.update_training_client(uuid, text, text, date, text, text, text, text, text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. end_training_relationship / reopen_training_relationship
--
-- Gebaut wie conclude_patient_care (LOE-001b): Das Ende ist der Anker der
-- Frist von drei Jahren (ADR-021 Punkt 4). Nicht in der Zukunft - eine Frist,
-- die noch nicht laufen darf -, nicht vor dem Beginn, und nie still
-- umdatiert: wer korrigiert, nimmt zurueck und setzt neu.
-- -----------------------------------------------------------------------------
create function public.end_training_relationship(
  p_relationship_id uuid,
  p_ended_on        date default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_heute  date;
  v_tag    date;
  v_start  date;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.ended', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  v_heute := app.training_today(v_org);
  v_tag := coalesce(p_ended_on, v_heute);
  if v_tag > v_heute then
    raise exception 'contract end is in the future' using errcode = '22023';
  end if;

  select t.contract_started_on, t.contract_ended_on into v_start, v_bisher
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;
  if v_bisher is not null then
    raise exception 'training relationship has already ended' using errcode = '22023';
  end if;
  if v_start is not null and v_tag < v_start then
    raise exception 'contract end is before the contract start' using errcode = '22023';
  end if;

  update public.training_relationships
     set contract_ended_on = v_tag, status = 'inactive'
   where id = p_relationship_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.ended', 'training_relationship', p_relationship_id, 'success',
    -- Der Tag bestimmt die Frist und steht deshalb im Eintrag.
    jsonb_build_object('surface', 'web', 'ended_on', v_tag)
  );

  return v_tag;
end;
$$;

comment on function public.end_training_relationship(uuid, date) is
  'TRN-001: setzt das Vertragsende (Anker der dreijaehrigen Frist, ADR-021 Punkt 4) und den Status inactive. owner, trainer, office; protokolliert training_relationship.ended.';
revoke all on function public.end_training_relationship(uuid, date) from public, anon;
grant execute on function public.end_training_relationship(uuid, date) to authenticated;

create function public.reopen_training_relationship(p_relationship_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.reopened', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  select t.contract_ended_on into v_bisher
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;
  if v_bisher is null then
    raise exception 'training relationship has not ended' using errcode = '22023';
  end if;

  -- Wer nach einer Pause weitertrainiert, bekommt kein zweites Verhaeltnis
  -- (LEI-001): Das Ende wird geraeumt, die Frist laeuft nicht mehr.
  update public.training_relationships
     set contract_ended_on = null, status = 'active'
   where id = p_relationship_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.reopened', 'training_relationship', p_relationship_id, 'success',
    jsonb_build_object('surface', 'web', 'previous_ended_on', v_bisher)
  );

  return p_relationship_id;
end;
$$;

comment on function public.reopen_training_relationship(uuid) is
  'TRN-001: raeumt das Vertragsende wieder (die Frist laeuft nicht mehr) und setzt den Status active. owner, trainer, office; protokolliert training_relationship.reopened mit dem alten Tag.';
revoke all on function public.reopen_training_relationship(uuid) from public, anon;
grant execute on function public.reopen_training_relationship(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Lesen
--
-- Die Trefferliste: Name, Status, Vertragsdaten - kein Kontakt. Wie die
-- Kartei nicht protokolliert (ADR-010), ein abgewiesener Versuch schon.
-- -----------------------------------------------------------------------------
-- VOLATILE, nicht STABLE: Im abgewiesenen Fall schreibt die Funktion einen
-- denied-Eintrag, und PostgREST ruft STABLE-Funktionen in einer lesenden
-- Transaktion auf - das INSERT scheiterte dort (Zweitreview TRN-EPIC-001).
create function public.list_training_clients()
returns table (
  id                  uuid,
  person_id           uuid,
  given_name          text,
  family_name         text,
  status              text,
  contract_started_on date,
  contract_ended_on   date
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'training_relationships.read', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  return query
    select t.id, t.person_id, pe.given_name, pe.family_name, t.status,
           t.contract_started_on, t.contract_ended_on
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    where t.organization_id = v_org
    order by (t.status = 'active') desc, pe.family_name, pe.given_name, t.id;
end;
$$;

comment on function public.list_training_clients() is
  'TRN-001: Trefferliste der Trainingskund:innen (Name, Status, Vertragsdaten). owner, trainer, office; nicht protokolliert (ADR-010), abgewiesen als training_relationships.read.';
revoke all on function public.list_training_clients() from public, anon;
grant execute on function public.list_training_clients() to authenticated;

-- ANN-175: Die Detailansicht ist protokolliert wie das Oeffnen einer Akte
-- (ADR-021 Punkt 8); die Trefferliste oben nicht.
create function public.get_training_client(p_relationship_id uuid)
returns table (
  id                  uuid,
  person_id           uuid,
  given_name          text,
  family_name         text,
  status              text,
  contract_started_on date,
  contract_ended_on   date,
  date_of_birth       date,
  email               text,
  phone               text,
  street              text,
  postal_code         text,
  city                text
)
language plpgsql
volatile
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
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(v_actor, 'training_relationship.viewed', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id, 'success',
    jsonb_build_object('surface', 'web')
  );

  return query
    select t.id, t.person_id, pe.given_name, pe.family_name, t.status,
           t.contract_started_on, t.contract_ended_on,
           d.date_of_birth, d.email, d.phone, d.street, d.postal_code, d.city
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details d on d.training_relationship_id = t.id
    where t.id = p_relationship_id;
end;
$$;

comment on function public.get_training_client(uuid) is
  'TRN-001: Detailansicht einer Trainingskund:in mit Kontakt. owner, trainer, office; protokolliert training_relationship.viewed (ADR-021 Punkt 8), abgewiesen unter derselben Aktion.';
revoke all on function public.get_training_client(uuid) from public, anon;
grant execute on function public.get_training_client(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. find_possible_training_duplicates - Hinweis beim Anlegen
--
-- Dieselbe Regel wie in der Kartei (ANN-145): gleicher Nachname und (gleiches
-- Geburtsdatum oder gleicher Vorname), in der Suchform. Die Kandidaten kommen
-- nur aus dem, was der Aufrufer ohnehin sieht:
--
--   kind = 'training'  Trainingskund:innen - fuer owner, trainer, office.
--   kind = 'patient'   Patient:innen - nur, wer die Kartei liest UND im
--                      Training schreibt (owner, office). Mit Kennung der
--                      Person, damit start_training_for_person sie ohne
--                      zweite persons-Zeile anbindet. Kein Status, keine
--                      Kontaktdaten: der Hinweis braucht sie nicht.
--
-- Fuer die Trainingsbetreuung gibt es damit nie einen Treffer aus der Akte
-- (§4.8: kein Schluss, auch nicht mittelbar ueber die Identitaet).
-- -----------------------------------------------------------------------------
create function public.find_possible_training_duplicates(
  p_given_name    text,
  p_family_name   text,
  p_date_of_birth date default null
)
returns table (
  kind                     text,
  training_relationship_id uuid,
  person_id                uuid,
  given_name               text,
  family_name              text,
  date_of_birth            date
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_vorname text;
  v_name    text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'training_relationships.read', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  v_vorname := app.suchform(btrim(coalesce(p_given_name, '')));
  v_name    := app.suchform(btrim(coalesce(p_family_name, '')));
  if length(v_name) = 0 then
    return;
  end if;

  return query
    -- Das Geburtsdatum nur, wenn es das eingegebene ist: Sonst gaebe der
    -- Hinweis Kontaktdaten ohne Protokoll heraus (ANN-175, Zweitreview).
    select 'training'::text, t.id, t.person_id, pe.given_name, pe.family_name,
           case when d.date_of_birth = p_date_of_birth then d.date_of_birth end
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details d on d.training_relationship_id = t.id
    where t.organization_id = v_org
      and app.suchform(pe.family_name) = v_name
      and (
        (p_date_of_birth is not null and d.date_of_birth = p_date_of_birth)
        or (length(v_vorname) > 0 and app.suchform(pe.given_name) = v_vorname)
      )
    order by pe.family_name, pe.given_name, t.id
    limit 5;

  if app.can_read_patient_directory() and app.can_write_training_relationships() then
    return query
      select 'patient'::text, null::uuid, p.person_id, pe.given_name, pe.family_name, pc.date_of_birth
      from public.patients p
      join public.persons pe on pe.id = p.person_id
      left join public.patient_contact_details pc on pc.patient_id = p.id
      where p.organization_id = v_org
        -- Wer schon trainiert, steht oben als 'training'.
        and not exists (select 1 from public.training_relationships x where x.person_id = p.person_id)
        and app.suchform(pe.family_name) = v_name
        and (
          (p_date_of_birth is not null and pc.date_of_birth = p_date_of_birth)
          or (length(v_vorname) > 0 and app.suchform(pe.given_name) = v_vorname)
        )
      order by pe.family_name, pe.given_name, p.id
      limit 5;
  end if;
end;
$$;

comment on function public.find_possible_training_duplicates(text, text, date) is
  'TRN-002: moegliche Dubletten beim Anlegen einer Trainingskund:in (Regel ANN-145). Trainingstreffer fuer owner, trainer, office; Treffer aus der Kartei nur fuer owner und office (ANN-173). Nicht protokolliert wie die Trefferliste, abgewiesen als training_relationships.read.';
revoke all on function public.find_possible_training_duplicates(text, text, date) from public, anon;
grant execute on function public.find_possible_training_duplicates(text, text, date) to authenticated;
