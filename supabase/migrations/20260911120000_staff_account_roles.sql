-- =============================================================================
-- Rollen eines Zugangs aendern (STAFF-002c)
--
-- Die Rollen eines bestehenden Zugangs sind der Teil der Berechtigungsvergabe,
-- der sich im Betrieb tatsaechlich aendert: jemand uebernimmt die Teamleitung,
-- jemand gibt das Praxismanagement ab. ADR-010 Punkt 2 fuehrt "Aenderungen von
-- Rollen und Berechtigungen" ausdruecklich als auditpflichtig.
--
-- Nur owner (E10). Die Rollen einer noch OFFENEN Einladung werden hier nicht
-- geaendert - dafuer gibt es Zuruecknehmen und neu einladen. Ein zweiter
-- Aenderungspfad auf denselben Gegenstand waere Aufwand ohne Gewinn.
--
-- AUSSPERRSCHUTZ. Die Praxis hat Bus-Faktor 1 (ADR-012). Die letzte aktive
-- Praxisinhaberin darf ihre eigene owner-Rolle nicht ablegen: danach koennte
-- niemand mehr Rollen vergeben, Zugaenge einladen oder das Auditlog lesen -
-- und es gaebe keinen Weg zurueck ausser einem privilegierten
-- Produktionszugriff, den ADR-010 Punkt 9 im Normalbetrieb ausschliesst. Die
-- Regel greift bewusst an der Organisation und nicht am eigenen Konto: Solange
-- eine zweite aktive Inhaberin existiert, darf sich jede abberufen lassen.
--
-- Klinische Daten entstehen hier keine.
-- =============================================================================

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
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
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
-- Gibt es noch eine andere aktive Praxisinhaberin?
--
-- Die eine Frage hinter dem Aussperrschutz - einmal formuliert, damit
-- Rollenwechsel und Sperre (STAFF-003) dieselbe Antwort benutzen und nicht
-- zwei Fassungen davon auseinanderlaufen.
-- -----------------------------------------------------------------------------
create or replace function app.other_active_owners_exist(
  p_organization_id uuid,
  p_except_user_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.user_profiles up on up.id = ur.user_id
    where ur.organization_id = p_organization_id
      and ur.role_key = 'owner'
      and up.organization_id = p_organization_id
      and up.is_active
      and up.id <> p_except_user_id
  )
$$;

comment on function app.other_active_owners_exist(uuid, uuid) is
  'Gibt es ausser diesem Konto noch eine aktive Praxisinhaberin? Grundlage des Aussperrschutzes (STAFF-002c, ADR-012).';

-- Der Aufrufer gibt die Organisation selbst mit; direkt aufrufbar waere die
-- Funktion damit ein Orakel fuer fremde Organisationen.
revoke all on function app.other_active_owners_exist(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- set_staff_account_roles
--
-- Setzt die Rollen auf genau die uebergebene Liste. Kein Hinzufuegen und
-- Entfernen einzelner Rollen: die Oberflaeche zeigt den vollstaendigen Stand
-- an, und ein Vorgang, der den ganzen Stand schreibt, kann nicht auf einem
-- halben Ergebnis stehenbleiben.
--
-- Protokolliert werden die tatsaechlich hinzugekommenen und weggefallenen
-- Rollen - nicht die ganze Liste. Wer den Eintrag spaeter liest, will wissen,
-- was sich geaendert hat (ADR-010).
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_account_roles(
  p_staff_member_id uuid,
  p_role_keys       text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_user   uuid;
  v_alt    text[];
  v_neu    text[];
  v_dazu   text[];
  v_weg    text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_staff_accounts() then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage accounts' using errcode = '42501';
  end if;

  perform app.assert_staff_role_keys(p_role_keys);

  -- Zielkonto ueber den Mitarbeiterdatensatz, ausschliesslich in der eigenen
  -- Organisation. Die Sperre haelt zwei gleichzeitige Rollenwechsel
  -- auseinander.
  select up.id into v_user
  from public.staff_members sm
  join public.user_profiles up
    on up.person_id = sm.person_id
   and up.organization_id = sm.organization_id
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update of up;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(ur.role_key order by ur.role_key), array[]::text[])
    into v_alt
  from public.user_roles ur
  where ur.user_id = v_user
    and ur.organization_id = v_org;

  select array_agg(x order by x) into v_neu
  from unnest(p_role_keys) as t(x);

  select coalesce(array_agg(x order by x), array[]::text[]) into v_dazu
  from unnest(v_neu) as t(x) where not (x = any (v_alt));

  select coalesce(array_agg(x order by x), array[]::text[]) into v_weg
  from unnest(v_alt) as t(x) where not (x = any (v_neu));

  -- Kein Unterschied, kein Vorgang.
  if cardinality(v_dazu) = 0 and cardinality(v_weg) = 0 then
    return;
  end if;

  if 'owner' = any (v_weg)
     and not app.other_active_owners_exist(v_org, v_user) then
    raise exception 'last_owner_required' using errcode = '22023';
  end if;

  delete from public.user_roles ur
   where ur.user_id = v_user
     and ur.organization_id = v_org
     and ur.role_key = any (v_weg);

  insert into public.user_roles (user_id, organization_id, role_key, created_by)
  select v_user, v_org, x, v_actor
  from unnest(v_dazu) as t(x);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.roles_changed', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'added', to_jsonb(v_dazu), 'removed', to_jsonb(v_weg))
  );
end;
$$;

comment on function public.set_staff_account_roles(uuid, text[]) is
  'Setzt die Rollen eines bestehenden Zugangs - nur owner. Die letzte aktive Praxisinhaberin behaelt ihre Rolle (STAFF-002c, ADR-010, ADR-012).';

revoke all on function public.set_staff_account_roles(uuid, text[]) from public, anon;
grant execute on function public.set_staff_account_roles(uuid, text[]) to authenticated;
