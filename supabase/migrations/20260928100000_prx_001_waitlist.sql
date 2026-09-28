-- =============================================================================
-- Warteliste mit Zeitfenstern (PRX-EPIC-001, Story PRX-001)
--
-- Personen ohne zeitnahen Termin stehen mit ihren Wunschfenstern auf einer
-- Liste; wird ein Platz frei, zeigt die Anwendung die passenden Eintraege
-- (PRX-004), die Praxis ruft an und uebernimmt. Nichts wird automatisch
-- versendet (B15: die Anrufliste bleibt, bis ein Kanal geprueft ist).
--
--   * DRINGLICHKEIT IST ORGANISATORISCH (ANN-132). Drei Gruende - Wunsch der
--     Person, Verordnung endet, Vorgabe der Praxis - und optional ein Datum
--     "bis spaetestens". Kein Freitext als Dringlichkeit, keine Einordnung nach
--     Beschwerdebild: das waere eine Risikoklassifikation (ADR-006 Punkt 4).
--   * WUNSCHFENSTER als jsonb-Liste {weekday 1-7 ISO, from, to}; leer heisst
--     "jederzeit". Die Form prueft app.waitlist_windows_valid in einer
--     Constraint, damit jeder Schreibweg sie einhaelt.
--   * EIN OFFENER EINTRAG JE PERSON UND GRUNDLAGE. Ein zweiter waere eine
--     Dublette, die beim Nachruecken zweimal anruft.
--   * WER: die Rollen der Terminverwaltung (app.can_create_appointment) lesen
--     und schreiben - owner, therapist, team_lead, office. Patientenkonto und
--     Trainingsbetreuung nicht. Nur Behandlung: Ein Eintrag haengt an
--     patients, nie an einem Trainingsverhaeltnis (ADR-021, ADR-022).
--   * AUDIT (ADR-010): created, updated, closed; nur Metadaten, nie die Notiz.
--     Das Lesen der Liste ist wie das Lesen des Kalenders nicht auditiert
--     (ANN-134); ein abgewiesener Leseversuch schon (waitlist.read, G6b).
--   * FRIST (ANN-133): Ein geschlossener Eintrag faellt zwoelf Monate nach dem
--     Schliessen (eigene Klasse `warteliste`, Anker Abschluss des Vorgangs);
--     ein offener faellt mit der Akte (FK on delete cascade). Ein Legal Hold
--     an der Akte haelt auch ihn.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Form der Wunschfenster
-- -----------------------------------------------------------------------------
create function app.waitlist_windows_valid(p_windows jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_fenster jsonb;
  v_von     time;
  v_bis     time;
  v_tag     integer;
begin
  if p_windows is null or jsonb_typeof(p_windows) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_windows) > 14 then
    return false;
  end if;

  for v_fenster in select value from jsonb_array_elements(p_windows)
  loop
    if jsonb_typeof(v_fenster) <> 'object'
       or (select count(*) from jsonb_object_keys(v_fenster)) <> 3
       or jsonb_typeof(v_fenster -> 'weekday') <> 'number'
       or jsonb_typeof(v_fenster -> 'from') <> 'string'
       or jsonb_typeof(v_fenster -> 'to') <> 'string'
       or (v_fenster ->> 'from') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_fenster ->> 'to') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;

    v_tag := (v_fenster ->> 'weekday')::numeric;
    if v_tag <> (v_fenster ->> 'weekday')::numeric or v_tag not between 1 and 7 then
      return false;
    end if;

    v_von := (v_fenster ->> 'from')::time;
    v_bis := (v_fenster ->> 'to')::time;
    if v_bis <= v_von then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function app.waitlist_windows_valid(jsonb) is
  'Prueft die Wunschfenster eines Wartelisteneintrags: Liste von hoechstens 14 Objekten {weekday 1-7 ISO, from HH:MM, to HH:MM}, Ende nach Beginn (PRX-001).';

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------
create table public.waitlist_entries (
  id                         uuid primary key default extensions.gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete restrict,
  patient_id                 uuid not null references public.patients (id) on delete cascade,
  -- Verordnung oder Selbstzahler, fuer die der Termin gesucht wird. Faellt
  -- die Grundlage (falsch erfasst, VER-003), bleibt der Wunsch bestehen.
  treatment_basis_id         uuid references public.treatment_bases (id) on delete set null,
  preferred_staff_member_id  uuid references public.staff_members (id) on delete set null,

  appointment_type           text not null check (appointment_type in ('home_visit', 'practice', 'video')),
  duration_minutes           smallint not null default 60 check (duration_minutes between 5 and 240),
  time_windows               jsonb not null default '[]'::jsonb
                               check (app.waitlist_windows_valid(time_windows)),
  earliest_on                date,
  needed_by                  date,
  priority_reason            text not null
                               check (priority_reason in ('patient_wish', 'prescription_ending', 'practice_priority')),
  note                       text check (note is null or length(btrim(note)) between 1 and 500),

  status                     text not null default 'open'
                               check (status in ('open', 'placed', 'withdrawn')),
  placed_appointment_id      uuid references public.appointments (id) on delete set null,
  closed_at                  timestamptz,
  closed_by                  uuid,

  created_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid,

  constraint waitlist_entries_closed check ((status = 'open') = (closed_at is null)),
  constraint waitlist_entries_placed check (status = 'placed' or placed_appointment_id is null),
  constraint waitlist_entries_dates check (
    earliest_on is null or needed_by is null or needed_by >= earliest_on
  )
);

comment on table public.waitlist_entries is
  'Warteliste mit Wunschfenstern (PRX-001). Kein direkter Zugriff, nur ueber die Funktionen. Datenklasse: offen mit der Akte, geschlossen zwoelf Monate nach dem Schliessen (warteliste, ANN-133).';
comment on column public.waitlist_entries.priority_reason is
  'Organisatorischer Grund der Dringlichkeit (ANN-132): patient_wish, prescription_ending, practice_priority. Nie klinisch (ADR-006 Punkt 4).';
comment on column public.waitlist_entries.time_windows is
  'Wunschfenster [{weekday 1-7 ISO, from HH:MM, to HH:MM}] in Praxiszeit; leer heisst jederzeit.';
comment on column public.waitlist_entries.note is
  'Organisatorische Notiz (Erreichbarkeit, Absprachen). Keine klinischen Angaben - das Feld sagt es in der Oberflaeche.';

create unique index waitlist_entries_one_open_idx
  on public.waitlist_entries (patient_id, treatment_basis_id) nulls not distinct
  where status = 'open';
create index waitlist_entries_org_status_idx on public.waitlist_entries (organization_id, status, created_at);

alter table public.waitlist_entries enable row level security;
revoke all on public.waitlist_entries from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Aufbewahrung
-- -----------------------------------------------------------------------------
insert into public.retention_classes (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values (
  'warteliste', 'intern', null, 'case_closed', interval '12 months', 'ANN-133',
  'Geschlossene Eintraege der Warteliste (eingeplant oder zurueckgezogen): zwoelf Monate nach dem Schliessen, analog zu den Terminanfragen aus ADR-008. Offene Eintraege fallen mit der Akte. Ein Legal Hold an der Akte haelt die Loeschung an.',
  45
);

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('waitlist_entries', 'patientenakte', 'ueber_elterndatensatz',
   'Offene Wartelisteneintraege. Fallen mit der Akte (FK on delete cascade).', 48),
  ('waitlist_entries', 'warteliste', 'automatisch',
   'Geschlossene Wartelisteneintraege: eigene Regel im Loeschlauf, zwoelf Monate nach closed_at.', 49);

-- -----------------------------------------------------------------------------
-- Auditkatalog
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
    'waitlist_entry'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text])));

-- -----------------------------------------------------------------------------
-- Gemeinsame Pruefung der Eingaben (create und update)
-- -----------------------------------------------------------------------------
create function app.waitlist_check_input(
  p_org                       uuid,
  p_patient_id                uuid,
  p_treatment_basis_id        uuid,
  p_preferred_staff_member_id uuid,
  p_appointment_type          text,
  p_duration_minutes          integer,
  p_time_windows              jsonb,
  p_earliest_on               date,
  p_needed_by                 date,
  p_priority_reason           text,
  p_note                      text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_appointment_type is null or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'invalid appointment type' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 5 and 240 then
    raise exception 'invalid duration' using errcode = '22023';
  end if;
  if not app.waitlist_windows_valid(coalesce(p_time_windows, '[]'::jsonb)) then
    raise exception 'invalid time windows' using errcode = '22023';
  end if;
  if p_priority_reason is null
     or p_priority_reason not in ('patient_wish', 'prescription_ending', 'practice_priority') then
    raise exception 'invalid priority reason' using errcode = '22023';
  end if;
  if p_earliest_on is not null and p_needed_by is not null and p_needed_by < p_earliest_on then
    raise exception 'needed_by before earliest_on' using errcode = '22023';
  end if;
  if p_note is not null and length(btrim(p_note)) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  if p_treatment_basis_id is not null and not exists (
    select 1 from public.treatment_bases tb
    where tb.id = p_treatment_basis_id
      and tb.organization_id = p_org
      and tb.patient_id = p_patient_id
  ) then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  if p_preferred_staff_member_id is not null
     and not app.is_assignable_therapist(p_preferred_staff_member_id, p_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function app.waitlist_check_input(uuid, uuid, uuid, uuid, text, integer, jsonb, date, date, text, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_waitlist_entry
-- -----------------------------------------------------------------------------
create function public.create_waitlist_entry(
  p_patient_id                uuid,
  p_treatment_basis_id        uuid,
  p_preferred_staff_member_id uuid,
  p_appointment_type          text,
  p_duration_minutes          integer,
  p_time_windows              jsonb,
  p_earliest_on               date,
  p_needed_by                 date,
  p_priority_reason           text,
  p_note                      text
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
  if not app.can_create_appointment() then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.waitlist_check_input(
    v_org, p_patient_id, p_treatment_basis_id, p_preferred_staff_member_id,
    p_appointment_type, p_duration_minutes, p_time_windows, p_earliest_on,
    p_needed_by, p_priority_reason, p_note
  );

  begin
    insert into public.waitlist_entries (
      organization_id, patient_id, treatment_basis_id, preferred_staff_member_id,
      appointment_type, duration_minutes, time_windows, earliest_on, needed_by,
      priority_reason, note, created_by, updated_by
    ) values (
      v_org, p_patient_id, p_treatment_basis_id, p_preferred_staff_member_id,
      p_appointment_type, p_duration_minutes, coalesce(p_time_windows, '[]'::jsonb),
      p_earliest_on, p_needed_by, p_priority_reason, nullif(btrim(p_note), ''),
      v_actor, v_actor
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'patient already on waitlist' using errcode = '23505';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  ) values (
    v_org, v_actor, 'waitlist_entry.created', 'waitlist_entry', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  );

  return v_id;
end;
$$;

comment on function public.create_waitlist_entry(uuid, uuid, uuid, text, integer, jsonb, date, date, text, text) is
  'Setzt eine Patient:in mit Wunschfenstern auf die Warteliste (PRX-001). Terminverwaltung; ein offener Eintrag je Person und Grundlage; auditiert ohne Notiz.';
revoke all on function public.create_waitlist_entry(uuid, uuid, uuid, text, integer, jsonb, date, date, text, text) from public, anon;
grant execute on function public.create_waitlist_entry(uuid, uuid, uuid, text, integer, jsonb, date, date, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- update_waitlist_entry - nur offene Eintraege
-- -----------------------------------------------------------------------------
create function public.update_waitlist_entry(
  p_entry_id                  uuid,
  p_expected_updated_at       timestamptz,
  p_treatment_basis_id        uuid,
  p_preferred_staff_member_id uuid,
  p_appointment_type          text,
  p_duration_minutes          integer,
  p_time_windows              jsonb,
  p_earliest_on               date,
  p_needed_by                 date,
  p_priority_reason           text,
  p_note                      text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_eintrag public.waitlist_entries;
  v_stand   timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;

  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = v_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;
  if v_eintrag.status <> 'open' then
    raise exception 'waitlist entry closed' using errcode = '22023';
  end if;
  if p_expected_updated_at is null or v_eintrag.updated_at <> p_expected_updated_at then
    raise exception 'waitlist entry changed' using errcode = '40001';
  end if;

  perform app.waitlist_check_input(
    v_org, v_eintrag.patient_id, p_treatment_basis_id, p_preferred_staff_member_id,
    p_appointment_type, p_duration_minutes, p_time_windows, p_earliest_on,
    p_needed_by, p_priority_reason, p_note
  );

  begin
    update public.waitlist_entries w
       set treatment_basis_id        = p_treatment_basis_id,
           preferred_staff_member_id = p_preferred_staff_member_id,
           appointment_type          = p_appointment_type,
           duration_minutes          = p_duration_minutes,
           time_windows              = coalesce(p_time_windows, '[]'::jsonb),
           earliest_on               = p_earliest_on,
           needed_by                 = p_needed_by,
           priority_reason           = p_priority_reason,
           note                      = nullif(btrim(p_note), ''),
           updated_at                = clock_timestamp(),
           updated_by                = v_actor
     where w.id = p_entry_id
    returning w.updated_at into v_stand;
  exception
    when unique_violation then
      raise exception 'patient already on waitlist' using errcode = '23505';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  ) values (
    v_org, v_actor, 'waitlist_entry.updated', 'waitlist_entry', p_entry_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_eintrag.patient_id)
  );

  return v_stand;
end;
$$;

comment on function public.update_waitlist_entry(uuid, timestamptz, uuid, uuid, text, integer, jsonb, date, date, text, text) is
  'Aendert einen offenen Wartelisteneintrag mit Stand-Pruefung (PRX-001). Auditiert ohne Notiz.';
revoke all on function public.update_waitlist_entry(uuid, timestamptz, uuid, uuid, text, integer, jsonb, date, date, text, text) from public, anon;
grant execute on function public.update_waitlist_entry(uuid, timestamptz, uuid, uuid, text, integer, jsonb, date, date, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- close_waitlist_entry
--
-- 'withdrawn': von der Liste genommen. 'placed': eingeplant mit einem Termin
-- derselben Person, der nicht abgesagt ist - fuer den Fall, dass der Termin
-- auf anderem Weg entstanden ist. Das Nachruecken (PRX-004) schliesst in
-- derselben Transaktion wie das Anlegen.
-- -----------------------------------------------------------------------------
create function app.close_waitlist_entry(
  p_org            uuid,
  p_actor          uuid,
  p_entry_id       uuid,
  p_outcome        text,
  p_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eintrag public.waitlist_entries;
begin
  select * into v_eintrag
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = p_org
  for update;
  if not found then
    raise exception 'waitlist entry not found' using errcode = 'P0002';
  end if;
  if v_eintrag.status <> 'open' then
    raise exception 'waitlist entry closed' using errcode = '22023';
  end if;

  if p_outcome = 'placed' then
    if p_appointment_id is null or not exists (
      select 1 from public.appointments a
      where a.id = p_appointment_id
        and a.organization_id = p_org
        and a.patient_id = v_eintrag.patient_id
        and a.kind = 'therapy'
        and a.status <> 'cancelled'
    ) then
      raise exception 'appointment not found' using errcode = 'P0002';
    end if;
  elsif p_outcome = 'withdrawn' then
    if p_appointment_id is not null then
      raise exception 'withdrawn entry takes no appointment' using errcode = '22023';
    end if;
  else
    raise exception 'invalid outcome' using errcode = '22023';
  end if;

  update public.waitlist_entries w
     set status                = p_outcome,
         placed_appointment_id = p_appointment_id,
         closed_at             = clock_timestamp(),
         closed_by             = p_actor,
         updated_at            = clock_timestamp(),
         updated_by            = p_actor
   where w.id = p_entry_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  ) values (
    p_org, p_actor, 'waitlist_entry.closed', 'waitlist_entry', p_entry_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_eintrag.patient_id,
      'outcome', p_outcome,
      'appointment_id', p_appointment_id
    )
  );
end;
$$;

revoke all on function app.close_waitlist_entry(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;

create function public.close_waitlist_entry(
  p_entry_id            uuid,
  p_expected_updated_at timestamptz,
  p_outcome             text,
  p_appointment_id      uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_stand timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_create_appointment() then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write waitlist' using errcode = '42501';
  end if;

  select w.updated_at into v_stand
  from public.waitlist_entries w
  where w.id = p_entry_id and w.organization_id = v_org;
  if found and (p_expected_updated_at is null or v_stand <> p_expected_updated_at) then
    raise exception 'waitlist entry changed' using errcode = '40001';
  end if;

  perform app.close_waitlist_entry(v_org, v_actor, p_entry_id, p_outcome, p_appointment_id);
end;
$$;

comment on function public.close_waitlist_entry(uuid, timestamptz, text, uuid) is
  'Schliesst einen offenen Wartelisteneintrag: withdrawn (von der Liste genommen) oder placed mit einem nicht abgesagten Termin derselben Person (PRX-001). Auditiert.';
revoke all on function public.close_waitlist_entry(uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.close_waitlist_entry(uuid, timestamptz, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_waitlist_entries
--
-- Projektion fuer die Liste und das Formular: Name, Telefon fuer den Anruf,
-- Grundlage, Wunsch-Therapeut:in. Die Telefonnummern sehen dieselben Rollen
-- ohnehin in der Kartei (app.can_read_patient_directory). Geordnet nach
-- "bis spaetestens" (ohne Datum zuletzt), dann nach Wartezeit.
-- -----------------------------------------------------------------------------
create function public.list_waitlist_entries(
  p_status     text default 'open',
  p_patient_id uuid default null
)
returns table (
  id                         uuid,
  patient_id                 uuid,
  patient_given_name         text,
  patient_family_name        text,
  phone                      text,
  phone_mobile               text,
  postal_code                text,
  treatment_basis_id         uuid,
  treatment_basis_kind       text,
  treatment_basis_issued_on  date,
  preferred_staff_member_id  uuid,
  preferred_staff_name       text,
  appointment_type           text,
  duration_minutes           smallint,
  time_windows               jsonb,
  earliest_on                date,
  needed_by                  date,
  priority_reason            text,
  note                       text,
  status                     text,
  placed_appointment_id      uuid,
  created_at                 timestamptz,
  updated_at                 timestamptz,
  closed_at                  timestamptz
)
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
  if not app.can_create_appointment() then
    perform app.record_denied_read(auth.uid(), 'waitlist.read', 'not allowed to read waitlist');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read waitlist' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'closed') then
    raise exception 'invalid status filter' using errcode = '22023';
  end if;

  return query
  select w.id,
         w.patient_id,
         pe.given_name,
         pe.family_name,
         cd.phone,
         cd.phone_mobile,
         cd.postal_code,
         w.treatment_basis_id,
         tb.treatment_basis_kind,
         tb.issued_on,
         w.preferred_staff_member_id,
         nullif(btrim(concat_ws(' ', spe.given_name, spe.family_name)), ''),
         w.appointment_type,
         w.duration_minutes,
         w.time_windows,
         w.earliest_on,
         w.needed_by,
         w.priority_reason,
         w.note,
         w.status,
         w.placed_appointment_id,
         w.created_at,
         w.updated_at,
         w.closed_at
  from public.waitlist_entries w
  join public.patients pa on pa.id = w.patient_id
  join public.persons pe on pe.id = pa.person_id
  left join public.patient_contact_details cd on cd.patient_id = w.patient_id
  left join public.treatment_bases tb on tb.id = w.treatment_basis_id
  left join public.staff_members sm on sm.id = w.preferred_staff_member_id
  left join public.persons spe on spe.id = sm.person_id
  where w.organization_id = v_org
    and (p_patient_id is null or w.patient_id = p_patient_id)
    and (
      p_status is null
      or (p_status = 'open' and w.status = 'open')
      or (p_status = 'closed' and w.status <> 'open')
    )
  order by (w.status = 'open') desc,
           w.needed_by asc nulls last,
           w.created_at asc;
end;
$$;

comment on function public.list_waitlist_entries(text, uuid) is
  'Warteliste der eigenen Praxis (PRX-001): offen, geschlossen oder alle; optional je Person. Nur Terminverwaltung; ein abgewiesener Versuch wird als waitlist.read protokolliert. Das Lesen selbst ist wie der Kalender nicht auditiert (ANN-134).';
revoke all on function public.list_waitlist_entries(text, uuid) from public, anon;
grant execute on function public.list_waitlist_entries(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- export_patient_record: die Warteliste gehoert zur Auskunft (Art. 15 DSGVO).
-- Rumpf sonst unveraendert aus 20260926140000_dok_005a_therapy_reports.sql.
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
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
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
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
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
-- apply_retention: dazu die Warteliste. Rumpf sonst unveraendert aus
-- 20260926150000_dok_006b_patient_photos.sql.
-- -----------------------------------------------------------------------------
create or replace function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

-- -----------------------------------------------------------------------------
-- reapply_deletion_journal: die Warteliste bekommt ihren Platz in der
-- Reihenfolge. Rumpf sonst unveraendert aus
-- 20260926150000_dok_006b_patient_photos.sql.
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
    'treatment_base_items',
    'treatment_bases',
    -- Vor appointments: ein eingeplanter Eintrag zeigt auf seinen Termin
    -- (on delete set null) - geloescht wird er vorher, damit nichts
    -- umgeschrieben wird (PRX-001).
    'waitlist_entries',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
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
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
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
$$;
