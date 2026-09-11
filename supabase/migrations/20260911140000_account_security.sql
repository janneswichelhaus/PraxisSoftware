-- =============================================================================
-- Sicherheitsereignisse des eigenen Kontos (STAFF-004)
--
-- Kennwort aendern, alle Sitzungen beenden, zweiten Faktor einrichten oder
-- entfernen: Vier Vorgaenge, die vollstaendig beim Anmeldedienst des Providers
-- ablaufen. Diese Anwendung fuehrt sie nicht aus - sie haelt fest, DASS sie
-- stattgefunden haben.
--
-- Warum das trotzdem hierher gehoert. ADR-010 Punkt 2 verlangt ein Auditlog
-- fuer sicherheitsrelevante Aktionen, und ADR-011 verbietet, dafuer die
-- Anwendungslogs zu benutzen. Das Auditlog des Providers ist ein zweiter Ort
-- mit eigener Aufbewahrung und eigenem Zugang; ein "wer hat wann seinen
-- zweiten Faktor entfernt" waere darin fuer die Praxisinhaberin praktisch
-- nicht auffindbar. Der Eintrag hier steht neben den uebrigen Ereignissen
-- desselben Kontos und ist mit demselben Lesepfad zu finden.
--
-- WAS NICHT DRINSTEHT. Kein Kennwort, kein Hash, kein Token, keine
-- Geraetekennung, keine IP-Adresse, kein TOTP-Geheimnis. Der Eintrag traegt
-- Akteur, Zeitpunkt und Art des Vorgangs - mehr braucht die
-- Nachvollziehbarkeit nicht (ADR-010 Punkt 3).
--
-- DIE MELDUNG IST NICHT DER BEWEIS. Der Aufruf kommt aus dem Browser, nachdem
-- der Provider den Vorgang bestaetigt hat. Ein Konto koennte ihn also auch
-- ohne den Vorgang absetzen. Das ist hingenommen: Das Ereignis betrifft
-- ausschliesslich das eigene Konto, es vergibt keine Berechtigung, und die
-- Gegenprobe steht im Auditlog des Providers. Was ein Konto NICHT kann, ist
-- ein Ereignis fuer ein fremdes Konto zu melden - der Akteur ist immer
-- auth.uid().
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

-- Der Gegenstand dieser Ereignisse ist das Konto selbst, nicht der
-- Mitarbeiterdatensatz: Sie betreffen die Anmeldung, nicht die Beschaeftigung.
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
    'text_snippet',
    'user_account'
  ));

-- -----------------------------------------------------------------------------
-- app.has_strong_authentication
--
-- Hat sich dieses Konto mit einem zweiten Faktor angemeldet? Der Anmeldedienst
-- traegt die Antwort im Token als `aal` ("authenticator assurance level"):
-- aal1 fuer Kennwort allein, aal2 nach bestaetigtem zweiten Faktor.
--
-- Die Funktion PRUEFT heute nichts ab - keine Policy und keine RPC verlangt
-- aal2. Sie ist der eine Ausdruck, an dem eine spaetere Durchsetzung haengen
-- wuerde, und macht den Zustand fuer die Oberflaeche lesbar (ANN-026). Das ist
-- kein Vorbauen im Sinne von ADR-014: Ohne sie liesse sich der Hinweis "Ihr
-- Zugang hat noch keinen zweiten Faktor" nur aus dem Browser-Token ableiten,
-- und damit haette die verbindliche Seite gar keinen Ort.
-- -----------------------------------------------------------------------------
create or replace function app.has_strong_authentication()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

comment on function app.has_strong_authentication() is
  'Hat sich das Konto mit zweitem Faktor angemeldet (JWT-Claim aal)? Heute nur lesbar, nicht durchgesetzt (STAFF-004b, ANN-026).';

grant execute on function app.has_strong_authentication() to authenticated;

-- -----------------------------------------------------------------------------
-- log_account_security_event
--
-- Der Akteur ist immer auth.uid(); ein Konto kann kein Ereignis fuer ein
-- fremdes Konto melden. Die Ereignisart ist eine geschlossene Liste - ein
-- freier Text waere ein Weg, beliebigen Inhalt ins Auditlog zu schreiben.
-- -----------------------------------------------------------------------------
create or replace function public.log_account_security_event(p_event text)
returns void
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

  if p_event is null or p_event not in (
    'password_changed', 'sessions_ended', 'mfa_enrolled', 'mfa_removed'
  ) then
    raise exception 'unknown account event' using errcode = '22023';
  end if;

  -- Die Organisation stammt aus dem Profil, nicht aus einem Parameter. Ein
  -- Konto ohne Profil kann kein Ereignis schreiben: Es gehoert zu keiner
  -- Praxis, und das Auditlog ist organisationsgebunden.
  select up.organization_id into v_org
  from public.user_profiles up
  where up.id = v_actor;

  if v_org is null then
    raise exception 'no practice account' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'account.' || p_event, 'user_account', v_actor, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.log_account_security_event(text) is
  'Haelt fest, dass das eigene Konto Kennwort, Sitzungen oder zweiten Faktor geaendert hat. Fuehrt den Vorgang nicht aus - das tut der Anmeldedienst (STAFF-004, ADR-010).';

revoke all on function public.log_account_security_event(text) from public, anon;
grant execute on function public.log_account_security_event(text) to authenticated;
