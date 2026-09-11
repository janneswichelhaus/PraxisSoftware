-- =============================================================================
-- Legal Hold: Loeschsperre fuer laufende Vorgaenge (LOE-001c)
--
-- ADR-008 Punkt 7 verlangt einen dokumentierten Mechanismus, der die
-- automatische Loeschung waehrend laufender rechtlicher oder regulatorischer
-- Vorgaenge aussetzt, und beschreibt ihn in den Konsequenzen als "expliziten
-- Zustand mit Beginn, Grund, verantwortlicher Person und Ende". Genau das ist
-- diese Tabelle.
--
-- WAS ER TUT UND WAS NICHT. Er setzt die automatische Loeschung aus - nicht
-- die Zugriffsregeln aus ADR-004 (ADR-008, Konsequenzen). Eine Akte unter
-- Legal Hold ist voll benutzbar; sie wird nur nicht geloescht.
--
-- NUR AUF PATIENTENEBENE. Der realistische Fall in einer Einzelpraxis ist der
-- Streit um eine Behandlung oder ein Honorar, und der haengt an genau einer
-- Akte. Eine Sperre "fuer alles" waere heute ein Feature ohne Anwendungsfall
-- (ADR-014, Negativliste) - und sie liesse sich, wenn sie je gebraucht wird,
-- als weiterer subject_type nachziehen. Registriert als ANN-033.
--
-- KEINE PFLEGE-OBERFLAECHE. Die Roadmap fuehrt sie als Komfort; gesetzt und
-- aufgehoben wird der Hold ueber die beiden Funktionen unten, sichtbar ist er
-- in der Aufbewahrungsuebersicht (LOE-002b). Das ist bewusst so: Ein Hold
-- entsteht selten und nie in Eile.
-- =============================================================================

create table public.legal_holds (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- Heute genau ein Gegenstand. Die Spalte ist trotzdem da, weil ein Hold ohne
  -- Angabe, WORAUF er wirkt, im Loeschlauf nicht auswertbar waere.
  subject_type    text not null check (subject_type in ('patient')),
  subject_id      uuid not null,

  reason          text not null check (length(btrim(reason)) between 3 and 1000),

  placed_at       timestamptz not null default now(),
  placed_by       uuid not null,
  released_at     timestamptz,
  released_by     uuid,

  -- Beginn und Ende gehoeren zusammen: ein aufgehobener Hold traegt beides,
  -- ein laufender keines von beidem.
  constraint legal_holds_release_complete check (
    (released_at is null and released_by is null)
    or (released_at is not null and released_by is not null)
  ),
  constraint legal_holds_release_after_place check (
    released_at is null or released_at >= placed_at
  )
);

comment on table public.legal_holds is
  'Loeschsperre fuer laufende rechtliche Vorgaenge (ADR-008 Punkt 7, LOE-001c). Setzt die automatische Loeschung aus, nicht die Zugriffsregeln (ADR-004). Datenklasse: wie die Patientenakte - der Grund ist eine Angabe ueber die betroffene Person.';
comment on column public.legal_holds.reason is
  'Warum die Loeschung ausgesetzt ist. Freitext ohne klinische Inhalte; erscheint nie in Logs (ADR-011) und nie im Auditkontext.';
comment on column public.legal_holds.placed_by is
  'auth.users.id der verantwortlichen Person. Bewusst ohne FK, damit ein spaeter geloeschtes Konto den Nachweis nicht entfernt (ADR-008).';

-- Zwei laufende Sperren auf derselben Akte waeren keine zweite Sperre, sondern
-- ein zweiter Grund fuer dieselbe - und beim Aufheben eine Falle: die eine
-- aufgehoben, die andere vergessen.
create unique index legal_holds_active_subject_idx
  on public.legal_holds (organization_id, subject_type, subject_id)
  where released_at is null;

create index legal_holds_subject_idx on public.legal_holds (subject_type, subject_id);

-- Deny-by-default und bewusst ohne Policy: weder Lesen noch Schreiben ueber
-- den Anwendungspfad. Der Grund eines Holds ist eine Angabe ueber einen
-- laufenden Rechtsstreit; er geht nur owner etwas an (ADR-004).
alter table public.legal_holds enable row level security;
revoke all on public.legal_holds from anon, authenticated;

-- Zuordnung im Retention Schedule (LOE-001a): faellt mit der Akte. Dass beim
-- Loeschen der Akte ueberhaupt noch Holds vorhanden sein koennen, liegt an den
-- aufgehobenen - ein laufender verhindert die Loeschung ja gerade.
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('legal_holds', 'patientenakte', 'ueber_elterndatensatz',
   'Aufgehobene Loeschsperren einer Akte. Fallen mit ihr; eine laufende Sperre verhindert die Loeschung.', 75);

-- -----------------------------------------------------------------------------
-- app.under_legal_hold
--
-- Die eine Frage, die der Loeschlauf stellt. Stable und ohne SECURITY DEFINER:
-- sie wird ausschliesslich aus Funktionen aufgerufen, die selbst schon
-- definer sind.
-- -----------------------------------------------------------------------------
create function app.under_legal_hold(
  p_organization_id uuid,
  p_subject_type    text,
  p_subject_id      uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.legal_holds h
    where h.organization_id = p_organization_id
      and h.subject_type = p_subject_type
      and h.subject_id = p_subject_id
      and h.released_at is null
  )
$$;

comment on function app.under_legal_hold(uuid, text, uuid) is
  'Besteht eine laufende Loeschsperre auf diesem Gegenstand (ADR-008 Punkt 7, LOE-001c)?';

-- -----------------------------------------------------------------------------
-- Wer darf sperren
--
-- Nur owner. Ein Legal Hold ist eine Aussage ueber ein laufendes rechtliches
-- Verfahren und eine Entscheidung der Praxisleitung
-- (PROJECT_PRINCIPLES.md 4.1) - kein Behandlungsschritt und kein
-- Verwaltungsvorgang des Tagesgeschaefts.
-- -----------------------------------------------------------------------------
create function app.can_manage_legal_hold()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_manage_legal_hold() is
  'Rollen, die eine Loeschsperre setzen und aufheben duerfen: nur owner (LOE-001c, ANN-033).';

grant execute on function app.can_manage_legal_hold() to authenticated;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
--
-- Gegenstand ist die Akte, nicht die Sperre: so steht das Ereignis im
-- Auditpfad der betroffenen Person, wo es gesucht wird. Die Kennung der Sperre
-- steht im Kontext, der Grund NICHT - er ist Freitext und gehoert nicht ins
-- Auditlog (ADR-010 Punkt 3).
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
-- place_legal_hold
-- -----------------------------------------------------------------------------
create function public.place_legal_hold(
  p_patient_id uuid,
  p_reason     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_hold  uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a legal hold needs a reason' using errcode = '22023';
  end if;

  -- Zielakte ausschliesslich in der Organisation des Aufrufers suchen.
  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if app.under_legal_hold(v_org, 'patient', p_patient_id) then
    raise exception 'patient is already under legal hold' using errcode = '22023';
  end if;

  insert into public.legal_holds (
    organization_id, subject_type, subject_id, reason, placed_by
  )
  values (v_org, 'patient', p_patient_id, btrim(p_reason), v_actor)
  returning id into v_hold;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'legal_hold.placed', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'hold_id', v_hold)
  );

  return v_hold;
end;
$$;

comment on function public.place_legal_hold(uuid, text) is
  'Setzt eine Loeschsperre auf eine Patientenakte und protokolliert legal_hold.placed (ADR-008 Punkt 7, LOE-001c). Nur owner. Der Grund steht in der Tabelle, nicht im Auditkontext.';

revoke all on function public.place_legal_hold(uuid, text) from public, anon;
grant execute on function public.place_legal_hold(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- release_legal_hold
--
-- Aufheben statt loeschen: der Nachweis, DASS eine Sperre bestand und wie
-- lange, ist Teil des Loeschkonzepts (ADR-008 Punkt 7, "mit Beginn, Grund,
-- verantwortlicher Person und Ende").
-- -----------------------------------------------------------------------------
create function public.release_legal_hold(p_hold_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_subject uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  select h.subject_id into v_subject
  from public.legal_holds h
  where h.id = p_hold_id
    and h.organization_id = v_org
    and h.released_at is null
  for update;

  if not found then
    raise exception 'legal hold not found' using errcode = 'P0002';
  end if;

  update public.legal_holds
     set released_at = now(),
         released_by = v_actor
   where id = p_hold_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'legal_hold.released', 'patient', v_subject, 'success',
    jsonb_build_object('surface', 'web', 'hold_id', p_hold_id)
  );
end;
$$;

comment on function public.release_legal_hold(uuid) is
  'Hebt eine laufende Loeschsperre auf und protokolliert legal_hold.released (LOE-001c). Die Zeile bleibt als Nachweis bestehen. Nur owner.';

revoke all on function public.release_legal_hold(uuid) from public, anon;
grant execute on function public.release_legal_hold(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_legal_holds
--
-- Der einzige Lesepfad. Liefert laufende Sperren mit dem Namen der betroffenen
-- Person - fuer eine Uebersicht, die nur owner sieht, ist die Kennung allein
-- unbrauchbar. Aufgehobene Sperren sind nicht dabei: sie sind Nachweis, keine
-- Arbeitsliste.
-- -----------------------------------------------------------------------------
create function public.list_legal_holds()
returns table (
  id           uuid,
  subject_type text,
  subject_id   uuid,
  subject_name text,
  reason       text,
  placed_at    timestamptz,
  placed_by_name text
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

  if not app.can_manage_legal_hold() then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  return query
    select h.id,
           h.subject_type,
           h.subject_id,
           pe.given_name || ' ' || pe.family_name,
           h.reason,
           h.placed_at,
           up.display_name
    from public.legal_holds h
    left join public.patients p  on p.id = h.subject_id and h.subject_type = 'patient'
    left join public.persons pe  on pe.id = p.person_id
    left join public.user_profiles up on up.id = h.placed_by
    where h.organization_id = v_org
      and h.released_at is null
    order by h.placed_at desc;
end;
$$;

comment on function public.list_legal_holds() is
  'Laufende Loeschsperren der eigenen Organisation samt betroffener Person (LOE-001c). Nur owner.';

revoke all on function public.list_legal_holds() from public, anon;
grant execute on function public.list_legal_holds() to authenticated;
