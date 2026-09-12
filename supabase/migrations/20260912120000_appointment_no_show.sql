-- =============================================================================
-- Nicht angetroffen, mit Ausfallhonorar-Kennzeichen (CAL-008c, ADR-018 Punkt 4)
--
-- Der Zustand 'no_show' bekommt seinen Schreibpfad. Drei Dinge gehoeren
-- untrennbar dazu:
--
--   * Das Ausfallhonorar-Kennzeichen ist eine PFLICHTENTSCHEIDUNG im selben
--     Schritt, ohne Vorbelegung in der Funktion. Der Termin sagt damit nur, OB
--     abgerechnet werden soll. WIE VIEL steht im Leistungskatalog (ABR-001),
--     und ob eine Rechnung entsteht, entscheidet ABR-003. Die Entscheidung
--     faellt im Hausflur, nicht im Buero - deshalb hier und nicht spaeter.
--   * Der Weg zurueck ist das Wiederoeffnen, genau wie beim Abschluss: Wer
--     sich vertan hat, macht den Termin wieder auf, statt ihn abzusagen. Die
--     Kennzeichen werden dabei geleert; die Historie bleibt im Auditlog.
--   * Ein Termin, an dem niemand angetroffen wurde, hat keine Behandlung -
--     also auch keine Behandlungsdokumentation. Beide Richtungen werden
--     abgewiesen: kein Vermerk an einem dokumentierten Termin, keine
--     Dokumentation an einem Vermerk. Das haelt die Invariante aus ADR-018
--     Punkt 3 sauber, die CAL-008d prueft.
--
-- Der Zeitraum bleibt belegt (CAL-008a): die behandelnde Person ist
-- hingefahren, und ein wieder geoeffneter Termin braucht seinen Zeitraum
-- zurueck.
-- =============================================================================

alter table public.appointments
  add column no_show_recorded_at timestamptz,
  add column no_show_recorded_by uuid,
  add column no_show_fee         boolean;

comment on column public.appointments.no_show_recorded_at is
  'Zeitpunkt des Vermerks "nicht angetroffen". Wird beim Wiederoeffnen geleert; die Historie bleibt im Auditlog (CAL-008c).';
comment on column public.appointments.no_show_recorded_by is
  'auth.users.id des vermerkenden Accounts. Bewusst ohne FK, wie actor_user_id im Auditlog.';
comment on column public.appointments.no_show_fee is
  'Ausfallhonorar-Kennzeichen (ADR-018 Punkt 4): OB abgerechnet werden soll. Kein Betrag - Hoehe und Abrechnungsweg gehoeren zu ABR-001 und ABR-003.';

-- Die drei Felder stehen gemeinsam oder gar nicht, und nur an einem Termin im
-- Zustand 'no_show'. ABR-003 zieht die Bedingung nach, wenn ein No-show mit
-- Kennzeichen nach 'invoiced' wandert - vorher waere der Wert dort Vorbau
-- (ADR-014).
alter table public.appointments
  add constraint appointments_no_show_fields check (
    (status = 'no_show'
      and no_show_recorded_at is not null
      and no_show_recorded_by is not null
      and no_show_fee         is not null)
    or (status <> 'no_show'
      and no_show_recorded_at is null
      and no_show_recorded_by is null
      and no_show_fee         is null)
  );

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
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
-- Wer darf "nicht angetroffen" vermerken
--
-- Die Rollen der Terminverwaltung (ADR-018 Punkt 2). Eigene Funktion statt
-- Wiederverwendung: der Vermerk ist fachlich etwas anderes als eine Absage,
-- und der Rollenschnitt soll sich einzeln aendern lassen.
-- -----------------------------------------------------------------------------
create or replace function app.can_record_no_show()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

grant execute on function app.can_record_no_show() to authenticated;

-- -----------------------------------------------------------------------------
-- record_no_show
-- -----------------------------------------------------------------------------
create function public.record_no_show(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  -- Ohne Vorbelegung: das Kennzeichen ist eine Entscheidung, kein Standard.
  p_fee                 boolean
)
returns uuid
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

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  if p_fee is null then
    raise exception 'no-show fee decision is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status              = 'no_show',
         no_show_recorded_at = now(),
         no_show_recorded_by = v_actor,
         no_show_fee         = p_fee,
         updated_at          = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Das Kennzeichen steht im Kontext: es ist eine organisatorische
  -- Feststellung ohne Personenbezug ueber die ohnehin gefuehrten Bezuege
  -- hinaus, und es begruendet spaeter eine Forderung (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.no_show', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'fee', p_fee
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.record_no_show(uuid, timestamptz, boolean) is
  'Vermerkt einen bestaetigten Termin als nicht angetroffen, verlangt die Entscheidung ueber das Ausfallhonorar im selben Schritt und protokolliert appointment.no_show (CAL-008c, ADR-018 Punkt 4).';

revoke all on function public.record_no_show(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.record_no_show(uuid, timestamptz, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- reopen_appointment: auch aus 'no_show'
--
-- Unveraendert aus 20260912100000_appointment_states.sql bis auf den zweiten
-- Ausgangszustand und die geleerten Kennzeichen.
-- -----------------------------------------------------------------------------
create or replace function public.reopen_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
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

  if not app.can_reopen_appointment() then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  -- 'documented' und 'invoiced' haben keinen Rueckweg: korrigiert wird in der
  -- Dokumentation beziehungsweise ueber den Rechnungsstorno (ADR-018 Punkt 2).
  if v_alt.status not in ('completed', 'no_show') then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status              = 'confirmed',
         completed_at        = null,
         completed_by        = null,
         no_show_recorded_at = null,
         no_show_recorded_by = null,
         no_show_fee         = null,
         updated_at          = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status in ('completed', 'no_show');

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.reopened', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      -- Aus welchem Zustand zurueck: organisatorisch, kein Personenbezug.
      'from_status', v_alt.status
    )
  );

  return p_appointment_id;
end;
$$;

comment on function public.reopen_appointment(uuid, timestamptz) is
  'Setzt einen abgeschlossenen oder als nicht angetroffen vermerkten Termin auf bestaetigt zurueck und protokolliert appointment.reopened (CAL-004, CAL-008c, ADR-010, ADR-018).';

-- -----------------------------------------------------------------------------
-- create_treatment_note: kein Nachweis an einem Nichtantreffen
--
-- Unveraendert aus 20260901100000_treatment_notes.sql bis auf die zweite
-- Zustandspruefung.
-- -----------------------------------------------------------------------------
create or replace function public.create_treatment_note(
  p_appointment_id uuid,
  p_content        text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_note   uuid;
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

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Eine Absage sagt aus, dass die Behandlung NICHT stattgefunden hat.
  -- Bestaetigte und abgeschlossene Termine sind dokumentierbar - der laufende
  -- Hausbesuch ist der Regelfall und noch nicht abgeschlossen.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nicht angetroffen heisst: keine Behandlung, also auch kein Nachweis
  -- (CAL-008c). Wer sich vertan hat, oeffnet den Termin wieder.
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor
    )
    returning id into v_note;
  exception
    when unique_violation then
      raise exception 'treatment note already exists' using errcode = '23505';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_note.created', 'treatment_note', v_note, 'success',
    jsonb_build_object(
      'surface', 'web',
      'appointment_id', p_appointment_id,
      'patient_id', v_termin.patient_id
    )
  );

  return v_note;
end;
$$;

-- -----------------------------------------------------------------------------
-- Loeschlauf: der No-show faellt unter dieselbe Klasse wie die Absage
--
-- ANN-035. Die Klasse 'termin_ohne_nachweis' nennt seit LOE-001a ausdruecklich
-- "Abgesagte Termine und No-shows ohne Rechnung" - die Regel im Lauf fragte
-- bisher nur nach 'cancelled', weil es den Zustand noch nicht gab.
--
-- Zwei Bedingungen kommen dazu:
--
--   * Anker ist der Zeitpunkt des Vermerks statt der Absage. Beide liegen in
--     der Praxis am selben Tag wie der Termin; gerechnet wird unveraendert ab
--     Ende des Kalenderjahres.
--   * Ein No-show MIT Ausfallhonorar-Kennzeichen wird NICHT geloescht. Er ist
--     die Grundlage einer Forderung, und was abgerechnet wird, faellt unter
--     die steuerliche Aufbewahrung, nicht unter die interne Frist. Bis ABR-003
--     die Rechnung fuehrt, bleibt er stehen - die Loeschung nachzuholen ist
--     moeglich, eine geloeschte Grundlage nicht (PROJECT_PRINCIPLES.md 16).
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
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;

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

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- No-show mit Ausfallhonorar-Kennzeichen bleibt stehen: er ist die
    -- Grundlage einer Forderung (ANN-035). Mit der Abrechnung kommt die
    -- allgemeine Bedingung "ohne Rechnung" dazu (ABR).
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
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show'
              and a.no_show_recorded_at is not null
              and a.no_show_fee is not true)
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

    v_gesamt := v_gesamt + v_akten + v_termine + v_audit + v_zugang;

    if v_akten + v_termine + v_audit + v_zugang > 0 or v_gehalten > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenakte', v_akten,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

comment on function public.apply_retention() is
  'Loescht alle faelligen Datensaetze nach dem Retention Schedule, schreibt je Datensatz eine Journalzeile und je Organisation ein Auditereignis retention.applied mit Systemakteur (ADR-008, LOE-002a, CAL-008c, ANN-007, ANN-035). Nur fuer den Scheduler ausfuehrbar.';

-- -----------------------------------------------------------------------------
-- Der Vermerk gehoert in die Terminsicht
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.appointment_type,
  a.status,
  a.starts_at,
  a.ends_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.updated_at,
  a.cancelled_at,
  a.cancellation_reason,
  a.completed_at,
  a.no_show_recorded_at,
  a.no_show_fee,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone
from public.appointments a
join public.patients p      on p.id  = a.patient_id
join public.persons pp      on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp      on sp.id = sm.person_id
join public.organizations o on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010).';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;
