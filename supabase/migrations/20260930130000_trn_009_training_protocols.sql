-- =============================================================================
-- TRN-009: Das Trainingsprotokoll (TRN-EPIC-004)
--
-- Was in einer Trainingseinheit gemacht wurde, steht als Protokoll am
-- Trainingstermin. Es ist ein Fachdatum des Trainingsverhaeltnisses und
-- ausdruecklich KEIN Eintrag nach ADR-016 (ADR-022 Punkt 7):
--
--   - eigene Tabelle, eigene Datenklasse (`trainingsverhaeltnis`, drei Jahre
--     ab Vertragsende, ADR-021 Punkt 4), faellt mit dem Verhaeltnis;
--   - keine Versionspflicht aus § 630f BGB, keine automatische Finalisierung
--     (ADR-022 Punkt 6) - abgeschlossen wird nur ausdruecklich;
--   - keine klinische Bewertung, kein Vorschlag, nichts aus der Akte
--     (ADR-006 Punkte 9 bis 13, ADR-021 Punkt 7): Freitext, der erfasst und
--     angezeigt wird.
--
--   save_training_protocol       Entwurf anlegen oder aendern
--   finalize_training_protocol   abschliessen; der Termin wird `documented`
--   get_training_protocol        das Protokoll eines Termins, protokolliert
--   list_training_protocols      die Einheiten einer Kund:in, protokolliert
--
-- WER (ANN-184): owner und trainer schreiben, schliessen ab und lesen. office
-- nicht: Das Protokoll kann Angaben zur Gesundheit tragen, und das Buero ist
-- im Training "nur organisatorisch" (PROJECT_PRINCIPLES.md §4.8). Eine
-- Stelle: app.can_access_training_protocols().
--
-- UNVERAENDERLICH NACH DEM ABSCHLUSS (ANN-185): Dokumentation wird nicht
-- ueberschrieben (§13). Weil ADR-022 Punkt 7 keine Versionspflicht kennt,
-- gibt es in V1 keinen Korrekturweg; der Riegel sitzt am Trigger und gilt
-- fuer jeden Schreibweg.
--
-- DIE INVARIANTE (ADR-018 Punkt 3, gelesen nach ADR-022 Punkt 8): Ein
-- Trainingstermin ist `documented` genau dann, wenn es zu ihm ein
-- abgeschlossenes Protokoll gibt. Gesetzt wird der Zustand im selben Vorgang
-- wie der Abschluss; ein Trigger am Termin haelt jeden anderen Weg fern und
-- verhindert Absage und Nichtantreffen, solange ein Protokoll daran haengt.
-- Die einzige Ausnahme ist der Loeschlauf: Er nimmt das Protokoll eines
-- abgerechneten Termins nach drei Jahren, der Termin bleibt bis zum Ende der
-- Belegfrist `documented` stehen (ANN-183).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Tabelle
-- -----------------------------------------------------------------------------
create table public.training_protocols (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null,
  appointment_id           uuid not null references public.appointments (id) on delete restrict,
  status                   text not null default 'draft' check (status in ('draft', 'final')),
  -- Dieselbe Zeichenmenge wie an der Behandlungsdokumentation: ein Text aus
  -- lauter Zeilenumbruechen ist leer.
  content                  text not null
                             check (length(btrim(content, E' \t\r\n')) between 1 and 20000),
  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  updated_at               timestamptz not null default now(),
  updated_by               uuid not null,
  finalized_at             timestamptz,
  finalized_by             uuid,

  constraint training_protocols_one_per_appointment unique (appointment_id),
  constraint training_protocols_relationship_fk
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id) on delete restrict,
  constraint training_protocols_final_has_stamp
    check ((status = 'final') = (finalized_at is not null and finalized_by is not null))
);

comment on table public.training_protocols is
  'Trainingsprotokoll je Trainingstermin (TRN-009, ADR-022 Punkt 7). Fachdatum des Trainingsverhaeltnisses, kein Eintrag nach ADR-016, keine klinische Bewertung (ADR-006 Punkt 9). Datenklasse: Trainingsverhaeltnis, drei Jahre ab Vertragsende.';
comment on column public.training_protocols.content is
  'Freitext der Einheit. Darf NIEMALS in Betriebslogs oder in den Auditkontext gelangen (ADR-010, ADR-011).';
comment on column public.training_protocols.created_by is
  'auth.users.id der verfassenden Person. Bewusst ohne FK, wie an der Behandlungsdokumentation.';
comment on constraint training_protocols_one_per_appointment on public.training_protocols is
  'Ein Protokoll je Trainingstermin. Zwei parallele Anlagen koennen nicht beide erfolgreich sein.';

create index training_protocols_organization_id_idx on public.training_protocols (organization_id);
create index training_protocols_relationship_idx on public.training_protocols (training_relationship_id);

-- Gelesen und geschrieben wird nur ueber die Funktionen unten: Jedes Lesen ist
-- protokolliert (ADR-021 Punkt 8), und ein direkter Select liefe am Protokoll
-- vorbei. Die Policy bleibt als zweite Grenze stehen (ADR-004).
alter table public.training_protocols enable row level security;
revoke all on public.training_protocols from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Wer (ANN-184) - die eine Stelle
-- -----------------------------------------------------------------------------
create function app.can_access_training_protocols()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'trainer')
$$;

comment on function app.can_access_training_protocols() is
  'Rollen, die Trainingsprotokolle schreiben, abschliessen und lesen (TRN-009, ANN-184): owner und trainer. Ohne office (nur organisatorisch, PROJECT_PRINCIPLES.md 4.8) und ohne die therapeutischen Rollen (ADR-021 Punkt 6).';

revoke all on function app.can_access_training_protocols() from public, anon;
grant execute on function app.can_access_training_protocols() to authenticated;

create policy training_protocols_select_scoped
  on public.training_protocols for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_access_training_protocols()
  );

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('training_protocols', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Trainingsprotokolle. Fallen mit dem Verhaeltnis und im Lauf vor ihrem Termin (FK restrict); in der Teilloeschung nach drei Jahren auch am abgerechneten Termin, denn sie sind kein Beleg (ANN-183).', 56);

-- -----------------------------------------------------------------------------
-- 3. Die Riegel am Protokoll
--
-- Am Trainingstermin, am selben Verhaeltnis, in derselben Organisation -
-- geprueft fuer jeden Schreibweg. Ein Protokoll am Behandlungstermin oder am
-- internen Termin ist damit schemaseitig unmoeglich (ADR-022 Punkte 6 und 7).
-- Nach dem Abschluss aendert sich nichts mehr (ANN-185).
-- -----------------------------------------------------------------------------
create function public.training_protocols_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_termin record;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'final' then
      raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
    end if;
    if new.appointment_id is distinct from old.appointment_id
       or new.training_relationship_id is distinct from old.training_relationship_id
       or new.organization_id is distinct from old.organization_id then
      raise exception 'training protocol cannot be moved' using errcode = '22023';
    end if;
    return new;
  end if;

  select a.kind, a.training_relationship_id, a.organization_id
    into v_termin
  from public.appointments a
  where a.id = new.appointment_id;

  if not found
     or v_termin.kind <> 'training'
     or v_termin.training_relationship_id is distinct from new.training_relationship_id
     or v_termin.organization_id is distinct from new.organization_id then
    raise exception 'training protocol requires a training appointment of the same relationship'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.training_protocols_guard() is
  'Ein Trainingsprotokoll haengt an einem Trainingstermin desselben Verhaeltnisses und derselben Organisation (ADR-022 Punkte 6 und 7) und ist nach dem Abschluss unveraenderlich (ANN-185).';

create trigger training_protocols_guard
  before insert or update on public.training_protocols
  for each row execute function public.training_protocols_guard();

-- -----------------------------------------------------------------------------
-- 4. Der Riegel am Termin (ADR-018 Punkt 3, ADR-022 Punkt 8)
--
-- `documented` am Trainingstermin nur mit abgeschlossenem Protokoll; keine
-- Absage und kein Nichtantreffen, solange ein Protokoll daran haengt - wo
-- protokolliert wurde, hat die Einheit stattgefunden. Ein Trigger statt einer
-- Pruefung in cancel_appointment und record_no_show: Er gilt fuer jeden
-- Schreibweg, auch einen kuenftigen.
-- -----------------------------------------------------------------------------
create function public.appointments_training_protocol_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> 'training' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'documented' and not exists (
    select 1 from public.training_protocols p
    where p.appointment_id = new.id and p.status = 'final'
  ) then
    raise exception 'training appointment is documented only by a finalized training protocol'
      using errcode = '23514';
  end if;

  if new.status in ('cancelled', 'no_show') and exists (
    select 1 from public.training_protocols p where p.appointment_id = new.id
  ) then
    raise exception 'training protocol exists for this appointment' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.appointments_training_protocol_guard() is
  'Invariante am Trainingstermin (TRN-009, ADR-018 Punkt 3 nach ADR-022 Punkt 8): documented nur mit abgeschlossenem Trainingsprotokoll; keine Absage und kein Nichtantreffen neben einem Protokoll.';

create trigger appointments_training_protocol_guard
  before update of status on public.appointments
  for each row execute function public.appointments_training_protocol_guard();

-- -----------------------------------------------------------------------------
-- 5. Auditkatalog
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
    'training_relationship',
    'training_basis',
    'training_protocol'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text])));

-- -----------------------------------------------------------------------------
-- 6. save_training_protocol - Entwurf anlegen oder aendern
--
-- Ein Weg fuer beides, weil die Oberflaeche nur "Speichern" kennt. Das erste
-- Speichern legt an, jedes weitere aendert - mit dem erwarteten Stand, damit
-- zwei offene Fenster einander nicht still ueberschreiben (§13). Am
-- bestaetigten und am durchgefuehrten Termin; eine Absage und ein
-- Nichtantreffen sagen, dass die Einheit nicht stattgefunden hat.
-- -----------------------------------------------------------------------------
create function public.save_training_protocol(
  p_appointment_id      uuid,
  p_content             text,
  p_expected_updated_at timestamptz default null
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_inhalt   text;
  v_termin   record;
  v_protokoll record;
  v_id       uuid;
  v_stand    timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.updated', 'not allowed to write training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'training protocol must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'training protocol is too long' using errcode = '22023';
  end if;

  select a.id, a.status, a.training_relationship_id
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'training'
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be protocolled' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be protocolled' using errcode = '22023';
  end if;

  select p.id, p.status, p.updated_at
    into v_protokoll
  from public.training_protocols p
  where p.appointment_id = p_appointment_id
  for update;

  if not found then
    begin
      insert into public.training_protocols (
        organization_id, training_relationship_id, appointment_id, status, content,
        created_by, updated_by
      )
      values (
        v_org, v_termin.training_relationship_id, p_appointment_id, 'draft', v_inhalt,
        v_actor, v_actor
      )
      returning training_protocols.id, training_protocols.updated_at into v_id, v_stand;
    exception
      when unique_violation then
        raise exception 'training protocol already exists' using errcode = '23505';
    end;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'training_protocol.created', 'training_protocol', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        'appointment_id', p_appointment_id,
        'training_relationship_id', v_termin.training_relationship_id
      )
    );

    return query select v_id, v_stand;
    return;
  end if;

  if v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;
  if v_protokoll.updated_at is distinct from p_expected_updated_at then
    raise exception 'training protocol was changed meanwhile' using errcode = '40001';
  end if;

  update public.training_protocols p
     set content    = v_inhalt,
         updated_at = now(),
         updated_by = v_actor
   where p.id = v_protokoll.id
  returning p.updated_at into v_stand;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_protocol.updated', 'training_protocol', v_protokoll.id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'training_relationship_id', v_termin.training_relationship_id
    )
  );

  return query select v_protokoll.id, v_stand;
end;
$$;

comment on function public.save_training_protocol(uuid, text, timestamptz) is
  'TRN-009: legt das Trainingsprotokoll eines Trainingstermins als Entwurf an oder aendert den Entwurf (erwarteter Stand Pflicht). owner, trainer (ANN-184); protokolliert training_protocol.created/updated ohne Inhalt, abgewiesen mit denied und HTTP 403.';
revoke all on function public.save_training_protocol(uuid, text, timestamptz) from public, anon;
grant execute on function public.save_training_protocol(uuid, text, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. finalize_training_protocol - abschliessen, der Termin wird `documented`
--
-- Speichern und Abschliessen in einer Transaktion, damit der abgeschlossene
-- Text genau der ist, der auf dem Bildschirm stand. Ohne Entwurf entsteht das
-- Protokoll gleich abgeschlossen. Der Termin geht im selben Vorgang von
-- `confirmed` oder `completed` nach `documented` (ADR-018 Punkt 3 nach
-- ADR-022 Punkt 8) - ueber denselben Schritt wie an der Behandlung
-- (app.mark_appointment_documented). Es gibt keinen Weg zurueck (ANN-185).
-- -----------------------------------------------------------------------------
create function public.finalize_training_protocol(
  p_appointment_id      uuid,
  p_content             text,
  p_expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_inhalt    text;
  v_termin    record;
  v_protokoll record;
  v_id        uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_write(v_actor, 'training_protocol.finalized', 'not allowed to write training protocols');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write training protocols' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'training protocol must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'training protocol is too long' using errcode = '22023';
  end if;

  select a.id, a.status, a.training_relationship_id
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and a.kind = 'training'
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be protocolled' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be protocolled' using errcode = '22023';
  end if;

  select p.id, p.status, p.updated_at
    into v_protokoll
  from public.training_protocols p
  where p.appointment_id = p_appointment_id
  for update;

  if found and v_protokoll.status = 'final' then
    raise exception 'finalized training protocol cannot be changed' using errcode = '22023';
  end if;

  -- Ein Termin ohne Protokoll ist nie `documented` (Trigger); hier also nur
  -- bestaetigt oder durchgefuehrt.
  if v_termin.status not in ('confirmed', 'completed') then
    raise exception 'appointment cannot be documented' using errcode = '22023';
  end if;

  if not found then
    begin
      insert into public.training_protocols (
        organization_id, training_relationship_id, appointment_id, status, content,
        created_by, updated_by, finalized_at, finalized_by
      )
      values (
        v_org, v_termin.training_relationship_id, p_appointment_id, 'final', v_inhalt,
        v_actor, v_actor, now(), v_actor
      )
      returning training_protocols.id into v_id;
    exception
      when unique_violation then
        raise exception 'training protocol already exists' using errcode = '23505';
    end;

    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'training_protocol.created', 'training_protocol', v_id, 'success',
      jsonb_build_object(
        'surface', 'web',
        'appointment_id', p_appointment_id,
        'training_relationship_id', v_termin.training_relationship_id
      )
    );
  else
    if p_expected_updated_at is null then
      raise exception 'expected updated_at is required' using errcode = '22023';
    end if;
    if v_protokoll.updated_at is distinct from p_expected_updated_at then
      raise exception 'training protocol was changed meanwhile' using errcode = '40001';
    end if;

    v_id := v_protokoll.id;
    update public.training_protocols p
       set content      = v_inhalt,
           status       = 'final',
           updated_at   = now(),
           updated_by   = v_actor,
           finalized_at = now(),
           finalized_by = v_actor
     where p.id = v_id;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_protocol.finalized', 'training_protocol', v_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'training_relationship_id', v_termin.training_relationship_id
    )
  );

  perform app.mark_appointment_documented(p_appointment_id, v_actor);

  return v_id;
end;
$$;

comment on function public.finalize_training_protocol(uuid, text, timestamptz) is
  'TRN-009/TRN-010: schliesst das Trainingsprotokoll eines Trainingstermins ab (ohne Entwurf: legt es abgeschlossen an) und setzt den Termin im selben Vorgang auf documented (ADR-018 Punkt 3 nach ADR-022 Punkt 8). owner, trainer (ANN-184); unveraenderlich danach (ANN-185); abgewiesen mit denied und HTTP 403.';
revoke all on function public.finalize_training_protocol(uuid, text, timestamptz) from public, anon;
grant execute on function public.finalize_training_protocol(uuid, text, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. get_training_protocol - das Protokoll eines Trainingstermins
--
-- Kein Protokoll heisst keine Zeile. Ein Termin eines anderen Kontexts ist
-- "nicht gefunden". Jedes Oeffnen eines vorhandenen Protokolls ist
-- protokolliert wie das Lesen der Dokumentation (ADR-021 Punkt 8).
-- -----------------------------------------------------------------------------
create function public.get_training_protocol(p_appointment_id uuid)
returns table (
  id                uuid,
  appointment_id    uuid,
  status            text,
  content           text,
  created_at        timestamptz,
  updated_at        timestamptz,
  finalized_at      timestamptz,
  author_name       text,
  finalized_by_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_rel   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_access_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_protocol.viewed', 'not allowed to read training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training protocols' using errcode = '42501';
  end if;

  select a.training_relationship_id into v_rel
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org and a.kind = 'training';

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'training_protocol.viewed', 'training_protocol', p.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', p_appointment_id,
           'training_relationship_id', v_rel
         )
  from public.training_protocols p
  where p.appointment_id = p_appointment_id;

  return query
    select p.id, p.appointment_id, p.status, p.content, p.created_at, p.updated_at,
           p.finalized_at, verfasser.display_name, abschluss.display_name
    from public.training_protocols p
    left join public.user_profiles verfasser on verfasser.id = p.created_by
    left join public.user_profiles abschluss on abschluss.id = p.finalized_by
    where p.appointment_id = p_appointment_id;
end;
$$;

comment on function public.get_training_protocol(uuid) is
  'TRN-009: das Trainingsprotokoll eines Trainingstermins oder keine Zeile. owner, trainer (ANN-184); protokolliert training_protocol.viewed, abgewiesen mit denied.';
revoke all on function public.get_training_protocol(uuid) from public, anon;
grant execute on function public.get_training_protocol(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. list_training_protocols - die Einheiten einer Trainingskund:in
--
-- Das Gegenstueck zu "Sessions" (ROADMAP Block 3, Punkt 3): die
-- protokollierten Einheiten, neueste zuerst, hoechstens 100. Kein Zaehler und
-- keine Auswertung (ADR-006 Punkt 11) - Datum, betreuende Person, Text.
-- Jedes gezeigte Protokoll ist protokolliert.
-- -----------------------------------------------------------------------------
create function public.list_training_protocols(
  p_relationship_id uuid,
  p_limit           integer default 50
)
returns table (
  id                     uuid,
  appointment_id         uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  staff_given_name       text,
  staff_family_name      text,
  status                 text,
  content                text,
  finalized_at           timestamptz,
  author_name            text,
  organization_time_zone text
)
language plpgsql
volatile
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
  if not app.can_access_training_protocols() then
    perform app.record_denied_read(v_actor, 'training_protocol.viewed', 'not allowed to read training protocols');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training protocols' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  select array_agg(s.id)
    into v_ids
  from (
    select p.id
    from public.training_protocols p
    join public.appointments a on a.id = p.appointment_id
    where p.training_relationship_id = p_relationship_id
      and p.organization_id = v_org
    order by a.starts_at desc, p.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) s;

  if v_ids is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'training_protocol.viewed', 'training_protocol', p.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', p.appointment_id,
           'training_relationship_id', p_relationship_id
         )
  from public.training_protocols p
  where p.id = any (v_ids);

  return query
    select p.id, p.appointment_id, a.starts_at, a.ends_at, a.appointment_type,
           sp.given_name, sp.family_name, p.status, p.content, p.finalized_at,
           verfasser.display_name, o.time_zone
    from public.training_protocols p
    join public.appointments a   on a.id  = p.appointment_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = p.organization_id
    left join public.user_profiles verfasser on verfasser.id = p.created_by
    where p.id = any (v_ids)
    order by a.starts_at desc, p.id desc;
end;
$$;

comment on function public.list_training_protocols(uuid, integer) is
  'TRN-009: die Trainingsprotokolle einer Trainingskund:in, neueste zuerst, hoechstens 100. owner, trainer (ANN-184); jedes gezeigte Protokoll protokolliert als training_protocol.viewed, abgewiesen mit denied.';
revoke all on function public.list_training_protocols(uuid, integer) from public, anon;
grant execute on function public.list_training_protocols(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Der Loeschlauf
--
-- Das Protokoll gehoert zur Datenklasse des Verhaeltnisses und ist kein Beleg:
-- Es faellt mit dem Verhaeltnis (app.delete_training_relationship) und in der
-- Teilloeschung nach drei Jahren auch am abgerechneten Termin
-- (app.reduce_training_relationship, ANN-183). Jede Zeile steht im Journal und
-- faellt nach einem Restore vor ihrem Termin (reapply_deletion_journal).
-- -----------------------------------------------------------------------------
create or replace function app.reduce_training_relationship(
  p_relationship_id uuid,
  p_run_id          uuid,
  p_due_at          timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_n     integer;
begin
  -- TRN-009: die Protokolle zuerst - auch die am abgerechneten Termin. Der
  -- Termin bleibt `documented` als Tatsache stehen; was in der Einheit
  -- geschah, traegt die Belegfrist nicht (ANN-183).
  with geloescht as (
    delete from public.training_protocols p
     where p.training_relationship_id = p_relationship_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_protocols', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Kontakt, Anschrift, Geburtsdatum. Der Schluessel ist das Verhaeltnis;
  -- er steht als Kennung im Journal.
  with geloescht as (
    delete from public.training_contact_details c
     where c.training_relationship_id = p_relationship_id
    returning c.training_relationship_id as id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_contact_details', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Termine ohne Leistung: kein Beleg, nichts, was die Frist traegt.
  with geloescht as (
    delete from public.appointments a
     where a.training_relationship_id = p_relationship_id
       and not exists (select 1 from public.billable_services b where b.appointment_id = a.id)
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Vereinbarungen, an denen kein verbliebener Termin mehr haengt.
  with geloescht as (
    delete from public.training_bases tb
     where tb.training_relationship_id = p_relationship_id
       and not exists (select 1 from public.appointments a where a.training_basis_id = tb.id)
    returning tb.id, tb.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_bases', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.reduce_training_relationship(uuid, uuid, timestamptz) is
  'Teilloeschung eines Trainingsverhaeltnisses nach drei Jahren, solange seine Belege noch in der steuerlichen Frist liegen (ANN-183, ADR-021 Punkt 4, ADR-008 Punkt 2): Protokolle, Kontakt, Termine ohne Leistung und unbenutzte Vereinbarungen fallen, jeder Datensatz im Journal. Der Rest faellt mit app.delete_training_relationship.';

-- Unveraendert aus 20260930121000_trn_008_training_invoices.sql bis auf die
-- Protokolle vor den Terminen.
CREATE OR REPLACE FUNCTION app.delete_training_relationship(p_relationship_id uuid, p_run_id uuid, p_due_at timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select t.person_id
    into v_person
  from public.training_relationships t
  where t.id = p_relationship_id;

  if not found then
    return 0;
  end if;

  -- TRN-008: die Belege zuerst. Sie zeigen mit RESTRICT auf Rechnung,
  -- Leistung und Termin; dieselbe Reihenfolge wie an der Akte
  -- (app.delete_patient_record), dieselbe Datenklasse.
  with geloescht as (
    delete from public.invoice_payment_reminders r
     where r.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_payment_reminders', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoice_cancellations c
     where c.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning c.id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_cancellations', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.payments z
     where z.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning z.id, z.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'payments', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoice_items it
     where it.invoice_id in (
       select i.id from public.invoices i where i.training_relationship_id = p_relationship_id
     )
    returning it.id, it.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_items', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoices i
     where i.training_relationship_id = p_relationship_id
    returning i.id, i.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoices', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.billable_services b
     where b.training_relationship_id = p_relationship_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'billable_services', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- TRN-009: die Protokolle vor ihren Terminen (FK restrict). Kein Beleg,
  -- dieselbe Datenklasse wie das Verhaeltnis (ADR-022 Punkt 7).
  with geloescht as (
    delete from public.training_protocols p
     where p.training_relationship_id = p_relationship_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_protocols', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Die Termine des Verhaeltnisses. Sie tragen keinen Behandlungsnachweis und
  -- koennen keinen tragen (ADR-022 Punkt 6); `appointment_notifications`
  -- faellt per Kaskade mit.
  with geloescht as (
    delete from public.appointments a
     where a.training_relationship_id = p_relationship_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.training_bases b
     where b.training_relationship_id = p_relationship_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_bases', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.training_relationships t
     where t.id = p_relationship_id
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_relationships', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Dieselben vier Verweise wie in der Akte, und aus demselben Grund: Die
  -- Person gehoert keinem der beiden Bereiche, sie wird von beiden benutzt.
  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x               where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x          where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x          where x.person_id = pe.id)
       and not exists (select 1 from public.training_relationships x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$function$;


-- Unveraendert aus 20260930122000_trn_epic_003_zweitreview.sql bis auf
-- `training_protocols` vor den Terminen.
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
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
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

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$function$;


-- -----------------------------------------------------------------------------
-- 11. app.mark_appointment_documented nennt am Trainingstermin sein Verhaeltnis
--
-- Der eine Schritt nach `documented` (CAL-008d) gilt jetzt fuer beide
-- Kontexte (ADR-022 Punkt 8). Unveraendert bis auf den Auditkontext.
-- -----------------------------------------------------------------------------
create or replace function app.mark_appointment_documented(
  p_appointment_id uuid,
  p_actor          uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_termin record;
begin
  update public.appointments a
     set status       = 'documented',
         -- Der Termin durchlaeuft den Abschluss mit, falls ihn niemand
         -- ausdruecklich abgeschlossen hat (ANN-036). completed_by bleibt
         -- leer - es hat niemand abgeschlossen.
         completed_at = coalesce(a.completed_at, now()),
         updated_at   = now()
   where a.id = p_appointment_id
     and a.status in ('confirmed', 'completed')
  returning a.organization_id, a.patient_id, a.staff_member_id, a.kind, a.training_relationship_id
    into v_termin;

  if not found then
    return false;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_termin.organization_id,
    p_actor,
    case when p_actor is null then 'system' else 'user' end,
    'appointment.documented', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', case when p_actor is null then 'scheduler' else 'web' end,
      'patient_id', v_termin.patient_id,
      'staff_member_id', v_termin.staff_member_id
    )
    -- TRN-010: der Trainingstermin nennt sein Verhaeltnis, nur als Kennung.
    || case when v_termin.kind = 'training' then
         jsonb_build_object('kind', 'training',
                            'training_relationship_id', v_termin.training_relationship_id)
       else '{}'::jsonb end
  );

  return true;
end;
$$;


revoke all on function app.mark_appointment_documented(uuid, uuid)
  from public, anon, authenticated;
