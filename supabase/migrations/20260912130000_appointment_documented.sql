-- =============================================================================
-- Dokumentiert: der Zustand wird gesetzt, nicht abgeleitet (CAL-008d, ADR-018)
--
-- ADR-018 Punkt 3: `documented` setzt der Vorgang, dem die Tatsache gehoert -
-- die Finalisierung der Behandlungsdokumentation, in derselben Transaktion.
-- Es gibt keine Oberflaeche, die den Wert von Hand setzt, und keinen
-- nachgelagerten Lauf, der ihn nachtraegt.
--
-- Daraus folgt die pruefbare Invariante, die ADR-018 ausdruecklich in
-- `pnpm test:db` verlangt:
--
--   status = 'documented'  GENAU DANN,  wenn zu diesem Termin eine
--                                       finalisierte Dokumentation existiert.
--
-- Beide Richtungen stehen in supabase/tests/appointment-states.test.ts.
--
-- WARUM AUCH AUS 'confirmed' (ANN-036). Die Uebergangstabelle in ADR-018
-- nennt nur `completed` -> `documented`. Eine Dokumentation laesst sich aber
-- auch an einem Termin finalisieren, den niemand ausdruecklich abgeschlossen
-- hat - ueber die Dokumentationsseite und ueber die automatische
-- Finalisierung nach Fristablauf (ADR-016 Punkt 7). Bliebe der Termin dann
-- `confirmed`, waere die Invariante aus Punkt 3 verletzt, und Punkt 3 ist die
-- staerkere Zusage: sie ist ausdruecklich als Test formuliert. Der Termin
-- durchlaeuft den Abschluss deshalb mit - `completed_at` wird gesetzt, wenn er
-- noch fehlt. `completed_by` bleibt dabei leer: Es hat niemand abgeschlossen,
-- und ein erfundener Akteur waere schlimmer als ein leeres Feld. Wer
-- finalisiert hat, steht in treatment_notes.finalized_by und im Auditlog.
--
-- Der Auditkatalog waechst um `appointment.documented`.
-- `appointment.invoiced` nennt ADR-018 in derselben Aufzaehlung; es gehoert
-- zu ABR-003 und kommt dort, zusammen mit dem einzigen Vorgang, der es
-- ausloesen kann. Ein Katalogwert, den nichts erzeugt, waere Vorbau (ADR-014).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
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
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
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
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

-- -----------------------------------------------------------------------------
-- Der gemeinsame Schritt beider Finalisierungspfade
--
-- Eigene Funktion statt zweimal derselbe UPDATE: der Seiteneffekt an einer
-- Funktion, die ADR-016 gehoert, soll an genau einer Stelle stehen und dort
-- seine Begruendung tragen (ADR-018, Konsequenzen).
--
-- Ein Nachtrag laeuft hier ebenfalls durch - sein Termin ist dann schon
-- `documented`, der UPDATE trifft keine Zeile und es entsteht kein zweites
-- Ereignis. Genau deshalb haengt der Auditeintrag am Treffer und nicht am
-- Aufruf.
-- -----------------------------------------------------------------------------
create function app.mark_appointment_documented(
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
  returning a.organization_id, a.patient_id, a.staff_member_id into v_termin;

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
  );

  return true;
end;
$$;

comment on function app.mark_appointment_documented(uuid, uuid) is
  'Hebt einen bestaetigten oder abgeschlossenen Termin auf documented und protokolliert appointment.documented (CAL-008d, ADR-018 Punkt 3). Nur fuer die Finalisierungspfade; ohne Rollenpruefung, weil der Aufrufer sie bereits gefuehrt hat.';

-- Wie bei app.delete_patient_record: PostgreSQL gibt EXECUTE auf neue
-- Funktionen an PUBLIC, und `authenticated` hat USAGE auf dem Schema app.
-- Ohne diese Zeile koennte jedes angemeldete Konto einen beliebigen Termin auf
-- documented heben - die Funktion ist SECURITY DEFINER und prueft, ihrem Zweck
-- entsprechend, keine Rolle (ADR-004).
revoke all on function app.mark_appointment_documented(uuid, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- finalize_treatment_note: setzt den Terminzustand mit
--
-- Unveraendert aus 20260904120000_treatment_note_auto_finalisation.sql bis auf
-- den Aufruf am Ende. ADR-016 gehoert diese Funktion; der neue Seiteneffekt
-- steht deshalb hier im Kopfkommentar und nicht nur im ADR (ADR-018,
-- Konsequenzen).
-- -----------------------------------------------------------------------------
create or replace function public.finalize_treatment_note(
  p_note_id             uuid,
  p_expected_updated_at timestamptz
)
returns uuid
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

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.content, t.status, t.updated_at, t.updated_by
    into v_note
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_note.status = 'final' then
    raise exception 'treatment note is already final' using errcode = '22023';
  end if;

  if v_note.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  update public.treatment_notes
     set status            = 'final',
         finalisation_kind = 'manual',
         finalized_at      = now(),
         finalized_by      = v_actor,
         updated_at        = now(),
         updated_by        = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.treatment_note_versions (
    organization_id, note_id, version_no, content, change_reason, author_id
  )
  values (
    v_org, p_note_id, 1, v_note.content, null, v_note.updated_by
  );

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = v_note.appointment_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.finalized', 'treatment_note', p_note_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', v_note.appointment_id,
      'patient_id', v_patient
    )
  );

  -- NEU mit CAL-008d: Die Finalisierung setzt den Terminzustand mit
  -- (ADR-018 Punkt 3). Kein Fehler, sondern der gewollte Seiteneffekt.
  perform app.mark_appointment_documented(v_note.appointment_id, v_actor);

  return p_note_id;
end;
$$;

comment on function public.finalize_treatment_note(uuid, timestamptz) is
  'Finalisiert eine Behandlungsdokumentation von Hand, schreibt den Stand als Version 1 fest, protokolliert treatment_note.finalized und hebt den Termin auf documented (DOK-002, DOK-004, ADR-016 Punkt 4, ADR-018 Punkt 3).';

-- -----------------------------------------------------------------------------
-- finalize_overdue_treatment_notes: derselbe Seiteneffekt, ohne Akteur
--
-- ADR-018 Punkt 7 verbietet automatische Uebergaenge durch Zeitablauf und
-- nimmt die automatische Finalisierung ausdruecklich davon aus: sie schreibt
-- eine Dokumentation fest, die bereits existiert. Der Terminzustand folgt
-- dieser Dokumentation, er entsteht nicht aus der Uhr.
--
-- Unveraendert aus 20260904120000_treatment_note_auto_finalisation.sql bis auf
-- den Aufruf am Ende der Schleife.
-- -----------------------------------------------------------------------------
create or replace function public.finalize_overdue_treatment_notes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note  record;
  v_count integer := 0;
begin
  for v_note in
    select t.id,
           t.organization_id,
           t.appointment_id,
           t.content,
           t.updated_by,
           a.patient_id,
           app.documentation_deadline(
             a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
           ) as due_at
    from public.treatment_notes t
    join public.appointments a   on a.id = t.appointment_id
    join public.organizations o  on o.id = t.organization_id
    where t.status = 'draft'
      and app.documentation_deadline(
            a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
          ) <= now()
    order by t.created_at
    for update of t skip locked
  loop
    update public.treatment_notes
       set status            = 'final',
           finalisation_kind = 'automatic',
           finalized_at      = now(),
           finalized_by      = null,
           updated_at        = now()
     where id = v_note.id;

    insert into public.treatment_note_versions (
      organization_id, note_id, version_no, content, change_reason, author_id
    )
    values (
      v_note.organization_id, v_note.id, 1, v_note.content, null, v_note.updated_by
    );

    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    values (
      v_note.organization_id, null, 'system', 'treatment_note.auto_finalized',
      'treatment_note', v_note.id, 'success',
      jsonb_build_object(
        'surface', 'scheduler',
        'appointment_id', v_note.appointment_id,
        'patient_id', v_note.patient_id,
        'due_at', v_note.due_at
      )
    );

    perform app.mark_appointment_documented(v_note.appointment_id, null);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.finalize_overdue_treatment_notes() is
  'Finalisiert alle Entwuerfe, deren Frist abgelaufen ist, als Version 1, protokolliert je Eintrag treatment_note.auto_finalized mit Systemakteur und hebt den zugehoerigen Termin auf documented (DOK-004, ADR-016 Punkt 7, ADR-018 Punkt 3, ANN-007). Nur fuer den Scheduler ausfuehrbar.';

-- -----------------------------------------------------------------------------
-- complete_treatment: erst abschliessen, dann finalisieren
--
-- Die Reihenfolge dreht sich um, und das ist der ganze fachliche Unterschied:
-- Seit die Finalisierung den Termin auf `documented` hebt, wuerde ein
-- nachgelagertes complete_appointment auf einem bereits dokumentierten Termin
-- landen und scheitern. Der Vorgang bleibt dabei unteilbar - eine Transaktion,
-- dieselben aufgerufenen Funktionen, dieselben Pruefungen (UX-007).
-- -----------------------------------------------------------------------------
create or replace function public.complete_treatment(
  p_appointment_id                 uuid,
  p_content                        text,
  p_expected_appointment_updated_at timestamptz,
  p_expected_note_updated_at       timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_id      uuid;
  v_note_stand   timestamptz;
  v_note_status  text;
  v_org          uuid;
  v_termin       record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  select a.id, a.status
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  select t.id, t.updated_at, t.status
    into v_note_id, v_note_stand, v_note_status
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if v_note_id is null then
    if p_expected_note_updated_at is not null then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    v_note_id := public.create_treatment_note(p_appointment_id, p_content);
  else
    if p_expected_note_updated_at is null
       or v_note_stand is distinct from p_expected_note_updated_at then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    if v_note_status = 'final' then
      raise exception 'treatment note is already final' using errcode = '22023';
    end if;
    perform public.update_treatment_note(v_note_id, v_note_stand, p_content);
  end if;

  -- Erst der Abschluss: ein bereits abgeschlossener Termin wird nicht noch
  -- einmal abgeschlossen. Der Fall kommt aus der Tagesliste - dort steht ein
  -- abgeschlossener Termin ohne finalisierte Dokumentation weiterhin unter
  -- "offen" (UX-001).
  if v_termin.status = 'confirmed' then
    perform public.complete_appointment(p_appointment_id, p_expected_appointment_updated_at);
  end if;

  -- Nach dem Schreiben neu lesen: update_treatment_note laesst den Stand bei
  -- unveraendertem Text bewusst stehen, bei geaendertem setzt es ihn neu.
  select t.updated_at into v_note_stand
  from public.treatment_notes t
  where t.id = v_note_id;

  -- Dann die Finalisierung, die den Termin auf documented hebt (CAL-008d).
  perform public.finalize_treatment_note(v_note_id, v_note_stand);

  return v_note_id;
end;
$$;

comment on function public.complete_treatment(uuid, text, timestamptz, timestamptz) is
  'Schliesst eine Behandlung in einem Schritt ab (UX-007): Entwurf schreiben, Termin abschliessen und finalisieren in EINER Transaktion. Ruft ausschliesslich die bestehenden Funktionen auf; deren Rechte-, Zustands- und Auditregeln gelten unveraendert. Der Termin steht danach auf documented (ADR-018 Punkt 3).';
