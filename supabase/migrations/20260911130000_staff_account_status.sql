-- =============================================================================
-- Zugang sperren und Kennwort zuruecksetzen (STAFF-003)
--
-- Zwei Vorgaenge, die im Alltag zusammen gebraucht werden und trotzdem
-- verschiedene Dinge tun:
--
--   * SPERREN setzt public.user_profiles.is_active auf false. Damit liefert
--     app.current_organization_id() null, und jede Policy laeuft ins Leere -
--     dieselbe Lage wie bei einem Konto ohne Einladung. Das
--     Authentifizierungskonto beim Provider bleibt bestehen; die Person kann
--     sich anmelden und sieht nichts. Das ist Absicht: Die Identitaet gehoert
--     dem Provider, die Berechtigung gehoert der Praxis (ADR-014).
--   * KENNWORT ZURUECKSETZEN aendert hier gar nichts. Der Vorgang haelt nur
--     fest, DASS die Praxisinhaberin es angestossen hat, und gibt die Adresse
--     zurueck, an die der Anmeldedienst seine Mail schickt (B13). Das Kennwort
--     selbst sieht diese Anwendung nie.
--
-- ABGRENZUNG ZUM BESCHAEFTIGUNGSSTATUS. set_staff_employment_status (STAFF-001)
-- nimmt eine Person aus dem laufenden Einsatz und sperrt ausdruecklich keinen
-- Zugang. Die beiden bleiben getrennt, weil sie verschiedene Fragen
-- beantworten: "wird sie noch eingeplant" und "kommt sie noch hinein". Wer
-- ausscheidet, braucht in aller Regel beides - aber nacheinander und sichtbar,
-- nicht als stille Nebenwirkung.
--
-- AUSSPERRSCHUTZ. Zwei Regeln, beide aus ADR-012 (Bus-Faktor 1):
--   * Niemand sperrt sich selbst aus. Ein Fehlgriff waere sonst endgueltig.
--   * Die letzte aktive Praxisinhaberin bleibt entsperrt.
--
-- Die zweite Regel ist heute die ZWEITE LINIE und nicht selbst erreichbar:
-- Sperren darf nur owner, also gibt es immer eine zweite aktive Inhaberin -
-- ausser beim eigenen Konto, und das faengt bereits die erste Regel ab. Sie
-- steht trotzdem da, weil die erste Regel eine Bedienregel ist und die zweite
-- die Sachlage beschreibt: Wird das Sperren spaeter fuer eine weitere Rolle
-- geoeffnet (E10 nennt das ausdruecklich als moeglichen Schritt), traegt sie
-- sofort. Beim Rollenwechsel ist dieselbe Regel sehr wohl erreichbar und
-- getestet (STAFF-002c).
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
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
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
-- set_staff_account_active
-- -----------------------------------------------------------------------------
create or replace function public.set_staff_account_active(
  p_staff_member_id uuid,
  p_active          boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_user  uuid;
  v_alt   boolean;
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

  if p_active is null then
    raise exception 'unknown account state' using errcode = '22023';
  end if;

  select up.id, up.is_active into v_user, v_alt
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

  -- Kein Wechsel, kein Vorgang.
  if v_alt = p_active then
    return;
  end if;

  if not p_active then
    if v_user = v_actor then
      raise exception 'cannot_lock_own_account' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_user and ur.organization_id = v_org and ur.role_key = 'owner'
    ) and not app.other_active_owners_exist(v_org, v_user) then
      raise exception 'last_owner_required' using errcode = '22023';
    end if;
  end if;

  update public.user_profiles
     set is_active = p_active
   where id = v_user
     and organization_id = v_org;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor,
    case when p_active then 'staff_account.unlocked' else 'staff_account.locked' end,
    'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.set_staff_account_active(uuid, boolean) is
  'Sperrt oder entsperrt den Zugang eines Mitarbeiterdatensatzes - nur owner. Beruehrt weder den Beschaeftigungsstatus noch das Konto beim Provider (STAFF-003).';

revoke all on function public.set_staff_account_active(uuid, boolean) from public, anon;
grant execute on function public.set_staff_account_active(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- request_staff_password_reset
--
-- Gibt die Anmeldeadresse zurueck, damit die Oberflaeche den Anmeldedienst
-- bitten kann, seine Mail zu schicken. Die Adresse ist kein neues Wissen fuer
-- die Praxisinhaberin - sie hat den Zugang eingeladen -, aber sie darf nicht
-- geraten werden muessen: Ein Tippfehler im Formular wuerde die Mail an eine
-- fremde Adresse schicken.
--
-- Der Auditeintrag haelt den Anstoss fest, nicht den Erfolg. Ob die Mail
-- ankommt und ob das Kennwort tatsaechlich geaendert wird, weiss ausschliesslich
-- der Provider (ADR-010 Punkt 3: nur die noetigen Metadaten).
-- -----------------------------------------------------------------------------
create or replace function public.request_staff_password_reset(p_staff_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_user  uuid;
  v_email text;
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

  select up.id into v_user
  from public.staff_members sm
  join public.user_profiles up
    on up.person_id = sm.person_id
   and up.organization_id = sm.organization_id
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  select au.email into v_email
  from auth.users au
  where au.id = v_user;

  if v_email is null or v_email = '' then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.password_reset_requested', 'staff_member',
    p_staff_member_id, 'success', jsonb_build_object('surface', 'web')
  );

  return v_email;
end;
$$;

comment on function public.request_staff_password_reset(uuid) is
  'Protokolliert, dass die Praxisinhaberin ein Zuruecksetzen angestossen hat, und liefert die Anmeldeadresse fuer die Auth-Mail des Providers. Aendert selbst kein Kennwort (STAFF-003, B13).';

revoke all on function public.request_staff_password_reset(uuid) from public, anon;
grant execute on function public.request_staff_password_reset(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Der gesperrte Zugang muss sich selbst als gesperrt erkennen koennen
--
-- Die Policy user_profiles_select_scoped laesst jedes Konto seine eigene Zeile
-- lesen - unabhaengig von is_active, sonst koennte ein gesperrtes Konto seinen
-- Zustand nicht von "nie eingerichtet" unterscheiden. Der Spalte fehlte
-- bisher nur der Weg in die Anwendung; die Projektion in
-- src/features/session/useCurrentUser.ts holt sie jetzt mit und zeigt eine
-- verstaendliche Meldung statt einer leeren Anwendung (13).
--
-- Hier steht dazu nur der Kommentar: die Policy bleibt unveraendert richtig.
-- -----------------------------------------------------------------------------
comment on column public.user_profiles.is_active is
  'Ist der Zugang freigeschaltet? false sperrt jeden Datenzugriff (app.current_organization_id() liefert dann null), laesst das Konto beim Provider aber bestehen (STAFF-003).';
