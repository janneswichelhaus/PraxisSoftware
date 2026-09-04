-- =============================================================================
-- Automatische Finalisierung nach Frist (DOK-004)
--
-- Setzt ADR-016 Punkt 7 um: Ein Entwurf wird nach Ablauf einer
-- konfigurierbaren Frist automatisch finalisiert; Voreinstellung ist das Ende
-- des auf die Behandlung folgenden Kalendertages. Der Entwurfsstand wird dabei
-- unveraendert zur Version 1 - dieselbe Wirkung wie beim ausdruecklichen
-- Schritt aus DOK-002, nur ohne handelnde Person.
--
-- Drei Festlegungen praegen die Umsetzung:
--
--   * Der Mechanismus ist eine Datenbankfunktion, die ein Scheduler aufruft
--     (ANN-007). Sie ist idempotent, sperrt jede Zeile einzeln und ueberspringt,
--     was gerade von Hand bearbeitet oder finalisiert wird. Der Aufruf selbst
--     - pg_cron, sofern vorhanden - ist die einzige Stelle, die den Ausloeser
--     kennt; ein anderer Ausloeser ruft dieselbe Funktion.
--   * Die Frist bezieht sich auf den Behandlungstag in der Praxiszeitzone. Ein
--     Eintrag, der erst spaeter angelegt wird - eine verspaetete Erstdokumentation
--     oder ein Nachtrag -, bekommt dieselbe Frist ab seinem Anlagetag (ANN-008).
--     Sonst wuerde ein Nachtrag zu einem alten Termin beim naechsten Lauf
--     festgeschrieben, bevor jemand ihn fertig schreiben kann.
--   * Die Finalisierung ohne handelnde Person braucht einen Systemakteur im
--     Auditlog (ANN-009). audit_log.actor_user_id war bisher NOT NULL; ein
--     Platzhalter-Account waere eine Luege im Nachweis. Deshalb eine eigene
--     Spalte actor_kind mit der Einschraenkung, dass genau die Systemereignisse
--     ohne Account bleiben.
--
-- Bewusst NICHT enthalten:
--   * Eine Benachrichtigung vor Fristablauf. Sie waere ein eigenes Feature.
--   * Ein Fallback "beim naechsten Zugriff nachziehen". Er wuerde den
--     Zeitpunkt der Finalisierung vom Zufall des Aktenaufrufs abhaengig machen
--     (docs/development/ROADMAP.md, DOK-004).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Frist an der Organisation
--
-- Kalendertage nach dem Behandlungstag: 0 heisst Ende des Behandlungstages,
-- 1 (Voreinstellung nach ADR-016 Punkt 7) Ende des Folgetages. 30 ist eine
-- Obergrenze gegen Fehleingaben, keine fachliche Empfehlung.
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column documentation_auto_finalize_days smallint not null default 1
    check (documentation_auto_finalize_days between 0 and 30);

comment on column public.organizations.documentation_auto_finalize_days is
  'Frist der automatischen Finalisierung in Kalendertagen nach dem Behandlungstag, gerechnet gegen Mitternacht der Praxiszeitzone (ADR-016 Punkt 7, ANN-008). 0 = Ende des Behandlungstages, 1 = Ende des Folgetages.';

-- -----------------------------------------------------------------------------
-- treatment_notes: Art der Finalisierung
--
-- 'manual' traegt die finalisierende Person, 'automatic' bewusst keine. Die
-- Constraint macht beide Faelle vollstaendig: ein Entwurf hat nichts davon,
-- ein finalisierter Eintrag genau eines.
-- -----------------------------------------------------------------------------
alter table public.treatment_notes
  add column finalisation_kind text
    check (finalisation_kind in ('manual', 'automatic'));

update public.treatment_notes
   set finalisation_kind = 'manual'
 where status = 'final';

alter table public.treatment_notes drop constraint treatment_notes_finalisation_consistent;
alter table public.treatment_notes add constraint treatment_notes_finalisation_consistent
  check (
    case
      when status = 'draft' then
        finalized_at is null and finalized_by is null and finalisation_kind is null
      when finalisation_kind = 'manual' then
        finalized_at is not null and finalized_by is not null
      when finalisation_kind = 'automatic' then
        finalized_at is not null and finalized_by is null
      else false
    end
  );

comment on column public.treatment_notes.finalisation_kind is
  'Wie der Eintrag finalisiert wurde: manual durch eine therapeutische Rolle (DOK-002), automatic nach Fristablauf ohne handelnde Person (DOK-004, ADR-016 Punkt 7).';
comment on column public.treatment_notes.finalized_by is
  'auth.users.id der finalisierenden Person bei manueller Finalisierung. Bewusst ohne FK, damit ein spaeter geloeschter Account die Urheberschaft nicht entfernt. Bei automatischer Finalisierung leer (DOK-004).';

-- -----------------------------------------------------------------------------
-- audit_log: Systemakteur
--
-- ANN-009: Ereignisse ohne handelnden Account tragen actor_kind = 'system'
-- und keinen actor_user_id. Alles andere bleibt, wie es war - insbesondere
-- kann kein Benutzerereignis seinen Akteur verlieren.
-- -----------------------------------------------------------------------------
alter table public.audit_log
  add column actor_kind text not null default 'user'
    check (actor_kind in ('user', 'system'));

alter table public.audit_log alter column actor_user_id drop not null;

alter table public.audit_log
  add constraint audit_log_actor_consistent
  check ((actor_kind = 'user') = (actor_user_id is not null));

comment on column public.audit_log.actor_kind is
  'user: ein angemeldeter Account (actor_user_id gesetzt). system: ein zeitgesteuerter Vorgang ohne Account, etwa die automatische Finalisierung (DOK-004, ANN-009).';
comment on column public.audit_log.actor_user_id is
  'auth.users.id des handelnden Accounts; leer nur bei actor_kind = system. Bewusst ohne FK, damit ein spaeter geloeschter Account den Nachweis nicht entfernt (ADR-008).';

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
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
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
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
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed'
  ));

-- -----------------------------------------------------------------------------
-- list_audit_events: Systemakteur mitliefern
--
-- Der Rueckgabetyp aendert sich, deshalb abraeumen und neu anlegen. Der Rest
-- bleibt unveraendert: nur owner, nur eigene Organisation, nur Metadaten, und
-- der Aufruf protokolliert sich selbst. Der Benutzerfilter trifft
-- Systemereignisse nie - sie haben keinen Account.
-- -----------------------------------------------------------------------------
drop function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer);

create function public.list_audit_events(
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_actor_user_id  uuid        default null,
  p_action         text        default null,
  p_limit          integer     default 50,
  p_offset         integer     default 0
)
returns table (
  id                 uuid,
  occurred_at        timestamptz,
  actor_user_id      uuid,
  actor_kind         text,
  actor_display_name text,
  action             text,
  subject_type       text,
  subject_id         uuid,
  outcome            text,
  total_count        bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_limit  integer;
  v_offset integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Rolle und Organisation werden hier geprueft, weil SECURITY DEFINER die
  -- RLS umgeht. Ohne diese Pruefung waere die Funktion ein offener Kanal.
  if not app.has_any_role('owner') then
    raise exception 'audit log access denied' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'audit log access denied' using errcode = '42501';
  end if;

  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    a.id,
    a.occurred_at,
    a.actor_user_id,
    a.actor_kind,
    up.display_name,
    a.action,
    a.subject_type,
    a.subject_id,
    a.outcome,
    count(*) over () as total_count
  from public.audit_log a
  left join public.user_profiles up
    on up.id = a.actor_user_id
   and up.organization_id = v_org
  where a.organization_id = v_org
    and (p_from is null          or a.occurred_at >= p_from)
    and (p_to is null            or a.occurred_at <  p_to)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_action is null        or a.action = p_action)
  order by a.occurred_at desc, a.id desc
  limit v_limit offset v_offset;

  -- Der Zugriff auf das Auditlog ist selbst ein Auditereignis (ADR-010).
  -- Bewusst NACH der Abfrage, damit der eigene Lesevorgang nicht das Ergebnis
  -- verfaelscht, das er gerade liefert.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'audit_log.read', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer) is
  'Kontrollierter Lesepfad auf das Auditlog. Nur owner, nur eigene Organisation, nur Metadaten (ADR-010). Liefert seit DOK-004 die Art des Akteurs mit.';

revoke all on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer)
  to authenticated;

-- -----------------------------------------------------------------------------
-- finalize_treatment_note: die manuelle Finalisierung traegt ihre Art
--
-- Unveraendert gegenueber DOK-002 bis auf finalisation_kind = 'manual'.
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

  -- Urheber der Version 1 ist die Person, von der der Text stammt - nicht
  -- zwingend die finalisierende (ADR-016 Punkt 1). Wer finalisiert hat, steht
  -- in finalized_by und im Auditeintrag.
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

  return p_note_id;
end;
$$;

comment on function public.finalize_treatment_note(uuid, timestamptz) is
  'Finalisiert eine Behandlungsdokumentation von Hand, schreibt den Stand als Version 1 fest und protokolliert treatment_note.finalized (DOK-002, DOK-004, ADR-016 Punkt 4).';

-- -----------------------------------------------------------------------------
-- Fristende eines Eintrags
--
-- ANN-008: Mitternacht der Praxiszeitzone nach dem N-ten Kalendertag nach dem
-- Behandlungstag - oder nach dem Anlagetag des Eintrags, falls der spaeter
-- liegt. Reine Rechnung, deshalb ohne SECURITY DEFINER; stable, weil die
-- Zeitzonenrechnung von den Zeitzonendaten des Servers abhaengt.
-- -----------------------------------------------------------------------------
create function app.documentation_deadline(
  p_treated_at timestamptz,
  p_created_at timestamptz,
  p_time_zone  text,
  p_days       integer
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    (((p_treated_at at time zone p_time_zone)::date + (p_days + 1))::timestamp) at time zone p_time_zone,
    (((p_created_at at time zone p_time_zone)::date + (p_days + 1))::timestamp) at time zone p_time_zone
  )
$$;

comment on function app.documentation_deadline(timestamptz, timestamptz, text, integer) is
  'Fristende der automatischen Finalisierung: Mitternacht der Praxiszeitzone nach dem N-ten Kalendertag nach Behandlungs- beziehungsweise Anlagetag, je nachdem, was spaeter liegt (DOK-004, ANN-008).';

grant execute on function app.documentation_deadline(timestamptz, timestamptz, text, integer)
  to authenticated;

-- -----------------------------------------------------------------------------
-- finalize_overdue_treatment_notes
--
-- Der zeitgesteuerte Vorgang. Kein auth.uid(), keine Rollenpruefung: die
-- Funktion ist fuer keine Anwendungsrolle ausfuehrbar und wird ausschliesslich
-- vom Scheduler als Datenbankeigentuemer aufgerufen (ANN-007).
--
-- FOR UPDATE SKIP LOCKED: ein Entwurf, den gerade jemand speichert oder von
-- Hand finalisiert, wird uebersprungen und beim naechsten Lauf erneut geprueft.
-- Umgekehrt weist update_treatment_note einen Entwurf ab, den dieser Lauf
-- soeben finalisiert hat - dieselbe Sperre, dieselbe Reihenfolge.
--
-- Version 1 traegt den Entwurfsstand unveraendert; ihr Urheber ist die zuletzt
-- schreibende Person (ADR-016 Punkt 1 und 7). finalized_at ist der Zeitpunkt
-- der Festschreibung durch diesen Lauf; das Fristende steht als due_at im
-- Auditkontext - kein Personenbezug, kein Inhalt (ADR-010).
-- -----------------------------------------------------------------------------
create function public.finalize_overdue_treatment_notes()
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

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.finalize_overdue_treatment_notes() is
  'Finalisiert alle Entwuerfe, deren Frist abgelaufen ist, als Version 1 und protokolliert je Eintrag treatment_note.auto_finalized mit Systemakteur (DOK-004, ADR-016 Punkt 7, ANN-007). Nur fuer den Scheduler ausfuehrbar.';

revoke all on function public.finalize_overdue_treatment_notes()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- get_treatment_note: Art der Finalisierung mitliefern
--
-- Der Rueckgabetyp aendert sich, deshalb abraeumen und neu anlegen. Alles
-- andere bleibt wie in DOK-002: ein Auditeintrag je gelesenem Eintrag.
-- -----------------------------------------------------------------------------
drop function public.get_treatment_note(uuid);

create function public.get_treatment_note(p_appointment_id uuid)
returns table (
  id                  uuid,
  appointment_id      uuid,
  addendum_to_note_id uuid,
  status              text,
  content             text,
  created_at          timestamptz,
  updated_at          timestamptz,
  finalized_at        timestamptz,
  finalisation_kind   text,
  version_count       integer,
  author_name         text,
  last_editor_name    text,
  finalized_by_name   text
)
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
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
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

comment on function public.get_treatment_note(uuid) is
  'Liefert Haupteintrag und Nachtraege der Behandlungsdokumentation eines Termins samt Art der Finalisierung und protokolliert je Eintrag treatment_note.viewed (DOK-001, DOK-002, DOK-004, ADR-010).';

revoke all on function public.get_treatment_note(uuid) from public, anon;
grant execute on function public.get_treatment_note(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_treatment_notes: Art der Finalisierung im JSON-Feld
--
-- Gleicher Rueckgabetyp (jsonb), deshalb genuegt create or replace. Inhaltlich
-- unveraendert gegenueber DOK-003 bis auf den zusaetzlichen Schluessel.
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_notes(
  p_patient_id       uuid,
  p_limit            integer     default 20,
  p_before_starts_at timestamptz default null,
  p_before_id        uuid        default null
)
returns table (
  appointment_id         uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  appointment_status     text,
  staff_given_name       text,
  staff_family_name      text,
  organization_time_zone text,
  notes                  jsonb
)
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
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
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

comment on function public.list_patient_treatment_notes(uuid, integer, timestamptz, uuid) is
  'Klinische Sicht der Akte (DOK-003, DOK-004): Termine eines Patienten mit ihren Eintraegen samt Inhalt und Art der Finalisierung, protokolliert je Eintrag treatment_note.viewed (ADR-010, ADR-016 Punkt 8 und 9). Nur owner, therapist und team_lead.';
