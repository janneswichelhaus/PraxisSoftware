-- =============================================================================
-- Zugang einladen (STAFF-002b)
--
-- STAFF-001 hat Person, Mitarbeiterdatensatz und Authentifizierungskonto
-- bewusst getrennt (ADR-014) und ausdruecklich KEINEN Zugang erzeugt. Diese
-- Migration schliesst die Luecke - ohne die Trennung aufzugeben.
--
-- WER MACHT WAS. Die Identitaet - das Konto, das Kennwort, die Bestaetigung der
-- E-Mail-Adresse - bleibt vollstaendig beim geprueften Provider (3.4: nichts
-- davon wird selbst gebaut; B13: ausschliesslich dessen Auth-Mails, kein
-- zweiter Dienstleister). Was hier entsteht, ist die BERECHTIGUNG: zu welcher
-- Organisation und zu welchem Mitarbeiterdatensatz ein spaeter entstehendes
-- Konto gehoert und welche Rollen es bekommt.
--
-- Daraus folgt der Ablauf in drei Schritten:
--
--   1. EINLADEN (owner)   -> eine Zeile in staff_account_invitations. Es
--                            entsteht kein auth.users, keine user_profiles,
--                            keine user_roles.
--   2. ANMELDEN (Person)  -> ueber die Auth-Mail des Providers. Das Konto
--                            entsteht dort. Es hat an dieser Stelle noch
--                            keinerlei Zugriff: ohne user_profiles liefert
--                            app.current_organization_id() null, und jede
--                            Policy laeuft ins Leere.
--   3. ANNEHMEN (Person)  -> claim_staff_invitation() bindet das Konto an
--                            Organisation, Person und Rollen. Erst hier
--                            entsteht Zugriff.
--
-- Dass Schritt 2 ein Konto ohne jeden Zugriff erzeugt, ist die tragende
-- Sicherheitseigenschaft dieses Entwurfs (ANN-023): Ein Konto, zu dem keine
-- offene Einladung passt, bleibt dauerhaft leer. Die Berechtigung haengt
-- ausschliesslich an der Einladung, die eine Praxisinhaberin gesetzt hat, nicht
-- daran, wer sich anmelden konnte.
--
-- KEINE LOESCHUNG, KEIN UEBERSCHREIBEN. Eine Einladung wird angenommen oder
-- widerrufen, nicht entfernt: sie ist der Nachweis, auf welcher Grundlage ein
-- Zugang entstanden ist (ADR-010). Fuer einen Mitarbeiterdatensatz gibt es
-- hoechstens EINE offene Einladung; eine zweite verlangt, die erste vorher zu
-- widerrufen.
--
-- Datenklasse: Zugangs- und Authentifizierungsdatum, Frist 12 Monate nach
-- Abschluss der Einladung (ADR-008, ANN-024). Klinische Daten entstehen keine.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010 Punkt 2: "Aenderungen von Rollen und
-- Berechtigungen" sind ausdruecklich auditpflichtig)
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
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
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
-- staff_account_invitations
--
-- Die E-Mail-Adresse wird normalisiert gespeichert (klein, getrimmt). Sie ist
-- der einzige Anknuepfungspunkt zwischen der Einladung und dem Konto, das der
-- Provider spaeter anlegt - ein Vergleich, der an Gross- und Kleinschreibung
-- scheitert, waere eine stille Fehlerquelle.
--
-- role_keys als Array und nicht als eigene Zeilentabelle: eine Einladung ist
-- ein Vorgang mit einem Zustand, kein Bestand. Die dauerhafte Rollenzuordnung
-- bleibt user_roles; hier steht nur, was bei der Annahme gesetzt werden soll.
-- -----------------------------------------------------------------------------
create table public.staff_account_invitations (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  staff_member_id  uuid not null references public.staff_members (id) on delete cascade,
  email            text not null
                     check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
                     check (email = lower(btrim(email))),
  role_keys        text[] not null check (cardinality(role_keys) between 1 and 4),
  status           text not null default 'pending'
                     check (status in ('pending', 'accepted', 'revoked')),
  expires_at       timestamptz not null,
  invited_by       uuid not null,
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  accepted_user_id uuid,
  revoked_at       timestamptz,
  revoked_by       uuid,
  -- Ein abgeschlossener Vorgang traegt seinen Zeitpunkt, ein offener nicht.
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((status = 'revoked')  = (revoked_at  is not null))
);

comment on table public.staff_account_invitations is
  'Einladung eines Zugangs (STAFF-002b). Haelt die BERECHTIGUNG fest - Organisation, Mitarbeiterdatensatz, Rollen; das Konto selbst entsteht beim Provider. Datenklasse: Zugangsdatum, 12 Monate nach Abschluss (ADR-008, ANN-024).';
comment on column public.staff_account_invitations.email is
  'Normalisiert klein und getrimmt. Einziger Anknuepfungspunkt zum spaeter entstehenden Konto.';
comment on column public.staff_account_invitations.role_keys is
  'Rollen, die bei der Annahme gesetzt werden. Die dauerhafte Zuordnung steht in user_roles.';
comment on column public.staff_account_invitations.accepted_user_id is
  'auth.users.id des annehmenden Kontos. Bewusst ohne FK, damit ein spaeter geloeschter Zugang den Nachweis nicht entfernt (ADR-008, ADR-010).';

-- Hoechstens eine offene Einladung je Datensatz und je Adresse. Abgeschlossene
-- Vorgaenge bleiben beliebig oft stehen - sie sind der Nachweis.
create unique index staff_account_invitations_one_open_per_staff
  on public.staff_account_invitations (staff_member_id)
  where status = 'pending';

create unique index staff_account_invitations_one_open_per_email
  on public.staff_account_invitations (organization_id, email)
  where status = 'pending';

create index staff_account_invitations_open_email_idx
  on public.staff_account_invitations (email)
  where status = 'pending';

alter table public.staff_account_invitations enable row level security;

revoke all on public.staff_account_invitations from anon, authenticated;
grant select on public.staff_account_invitations to authenticated;

-- Lesen nur fuer die Rolle, die einladen darf. Die eingeladene Person sieht
-- ihre eigene Einladung NICHT ueber diesen Weg: solange sie kein Profil hat,
-- greift ohnehin keine Policy, und danach ist die Einladung erledigt.
create policy staff_account_invitations_select_owner
  on public.staff_account_invitations for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_manage_staff_accounts()
  );

-- -----------------------------------------------------------------------------
-- Gueltige Praxisrollen fuer einen Zugang
--
-- 'patient' ist ausdruecklich nicht dabei: ein Patientenzugang ist ein anderes
-- Konzept mit eigener Identitaetspruefung (4.6, offener Punkt B5) und entsteht
-- nicht ueber die Mitarbeiterverwaltung.
-- -----------------------------------------------------------------------------
create or replace function app.assert_staff_role_keys(p_role_keys text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_role_keys is null or cardinality(p_role_keys) = 0 then
    raise exception 'at least one role is required' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_role_keys) as r(key)
    where r.key is null or r.key not in ('owner', 'therapist', 'team_lead', 'office')
  ) then
    raise exception 'unknown role' using errcode = '22023';
  end if;

  if cardinality(p_role_keys) <> (select count(distinct r.key) from unnest(p_role_keys) as r(key)) then
    raise exception 'duplicate role' using errcode = '22023';
  end if;
end;
$$;

comment on function app.assert_staff_role_keys(text[]) is
  'Prueft eine Rollenliste fuer einen Praxiszugang. "patient" ist bewusst ausgeschlossen (PROJECT_PRINCIPLES.md 4.6).';

-- -----------------------------------------------------------------------------
-- invite_staff_account
--
-- Nur owner (E10, ADR-004). Prueft vier Dinge, die alle gleich wichtig sind:
-- die Rolle des Aufrufers, dass der Datensatz zur eigenen Organisation gehoert
-- und aktiv ist, dass es noch keinen Zugang gibt, und dass die Adresse nicht
-- bereits an einem anderen Zugang derselben Praxis haengt.
--
-- Die Frist von 14 Tagen ist eine Annahme (ANN-024): lang genug fuer Urlaub
-- und Krankheit, kurz genug, dass eine vergessene Einladung nicht dauerhaft
-- offensteht. Sie wird nicht durch einen Job aufgeraeumt - eine abgelaufene
-- Einladung wird bei der Annahme abgewiesen und in der Oberflaeche als
-- abgelaufen gezeigt. Kein Zustand, der ohne Beobachtung stillschweigend
-- kippt (ANN-007, kein pg_cron vorausgesetzt).
-- -----------------------------------------------------------------------------
create or replace function public.invite_staff_account(
  p_staff_member_id uuid,
  p_email           text,
  p_role_keys       text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_email     text;
  v_person_id uuid;
  v_id        uuid;
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

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  perform app.assert_staff_role_keys(p_role_keys);

  -- Zielsatz ausschliesslich in der eigenen Organisation; sonst waere die
  -- Funktion ein Orakel fuer fremde Mitarbeiter-IDs (13).
  select sm.person_id into v_person_id
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
    and sm.employment_status = 'active'
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  -- Ein zweiter Zugang zu derselben Person waere ein geteilter Zugang durch
  -- die Hintertuer (4.2: ein individuelles Konto ist Pflicht).
  if exists (
    select 1 from public.user_profiles up
    where up.person_id = v_person_id
      and up.organization_id = v_org
  ) then
    raise exception 'account_already_exists' using errcode = '22023';
  end if;

  -- Dieselbe Adresse darf nicht an zwei Zugaenge derselben Praxis gehen.
  if exists (
    select 1
    from public.user_profiles up
    join auth.users au on au.id = up.id
    where up.organization_id = v_org
      and lower(btrim(au.email)) = v_email
  ) then
    raise exception 'email_already_in_use' using errcode = '22023';
  end if;

  insert into public.staff_account_invitations (
    organization_id, staff_member_id, email, role_keys, expires_at, invited_by
  )
  values (
    v_org, p_staff_member_id, v_email, p_role_keys, now() + interval '14 days', v_actor
  )
  returning id into v_id;

  -- Auditeintrag mit den Rollen, aber OHNE die Adresse: die Rollen sind der
  -- sicherheitsrelevante Teil des Vorgangs, die Adresse ist Kontaktdatum
  -- (ADR-010 Punkt 3, PROJECT_PRINCIPLES.md 20).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.invited', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'roles', to_jsonb(p_role_keys))
  );

  return v_id;
end;
$$;

comment on function public.invite_staff_account(uuid, text, text[]) is
  'Legt die Einladung eines Zugangs an - nur owner. Erzeugt weder Konto noch Rollen; beides entsteht erst bei der Annahme (STAFF-002b).';

revoke all on function public.invite_staff_account(uuid, text, text[]) from public, anon;
grant execute on function public.invite_staff_account(uuid, text, text[]) to authenticated;

-- -----------------------------------------------------------------------------
-- revoke_staff_invitation
--
-- Der Gegenvorgang. Er loescht die Zeile nicht: dass eingeladen und wieder
-- zurueckgenommen wurde, gehoert zum Nachweis (ADR-010).
-- -----------------------------------------------------------------------------
create or replace function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_staff uuid;
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

  update public.staff_account_invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor
   where id = p_invitation_id
     and organization_id = v_org
     and status = 'pending'
  returning staff_member_id into v_staff;

  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_account.invitation_revoked', 'staff_member', v_staff, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.revoke_staff_invitation(uuid) is
  'Nimmt eine offene Einladung zurueck - nur owner. Die Zeile bleibt als Nachweis stehen (STAFF-002b, ADR-010).';

revoke all on function public.revoke_staff_invitation(uuid) from public, anon;
grant execute on function public.revoke_staff_invitation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- claim_staff_invitation
--
-- Die einzige Funktion des Systems, die ein Konto OHNE Profil aufrufen darf -
-- sie ist genau dafuer da. Deshalb ist sie besonders eng geschnitten:
--
--   * Sie nimmt keinen Parameter. Es gibt nichts zu waehlen und nichts zu
--     raten; massgeblich ist ausschliesslich die Adresse, unter der der
--     Provider das Konto fuehrt.
--   * Sie liest diese Adresse aus auth.users, nicht aus dem JWT. Das JWT wird
--     vom Client mitgebracht; auth.users ist die Quelle, die der Provider
--     pflegt.
--   * Sie verlangt eine offene, nicht abgelaufene Einladung. Ohne sie
--     entsteht nichts - das Konto bleibt zugriffslos (ANN-023).
--   * Sie ist wiederholbar: ein Konto, das sein Profil schon hat, bekommt es
--     zurueck, statt einen zweiten Vorgang auszuloesen. Ein Neuladen der
--     Seite darf nicht zum Fehler fuehren.
--
-- Der Auditeintrag traegt als Akteur das annehmende Konto selbst. Das ist die
-- Wahrheit des Vorgangs: eingeladen hat die Praxisinhaberin (eigener Eintrag),
-- angenommen hat die Person.
-- -----------------------------------------------------------------------------
create or replace function public.claim_staff_invitation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_email     text;
  v_vorhanden uuid;
  v_ein       record;
  v_person_id uuid;
  v_name      text;
  v_rolle     text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Schon eingerichtet: idempotent zurueckgeben, nichts erneut schreiben.
  select up.id into v_vorhanden
  from public.user_profiles up
  where up.id = v_uid;

  if found then
    return v_vorhanden;
  end if;

  select lower(btrim(au.email)) into v_email
  from auth.users au
  where au.id = v_uid;

  if v_email is null or v_email = '' then
    raise exception 'no_open_invitation' using errcode = 'P0002';
  end if;

  select i.id, i.organization_id, i.staff_member_id, i.role_keys, i.invited_by
    into v_ein
  from public.staff_account_invitations i
  where i.email = v_email
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no_open_invitation' using errcode = 'P0002';
  end if;

  -- Der Datensatz muss zwischen Einladung und Annahme aktiv geblieben sein.
  -- Wer in der Zwischenzeit ausgeschieden ist, bekommt keinen Zugang.
  select sm.person_id, pe.given_name || ' ' || pe.family_name
    into v_person_id, v_name
  from public.staff_members sm
  join public.persons pe on pe.id = sm.person_id
  where sm.id = v_ein.staff_member_id
    and sm.organization_id = v_ein.organization_id
    and sm.employment_status = 'active';

  if v_person_id is null then
    raise exception 'no_open_invitation' using errcode = 'P0002';
  end if;

  -- created_by ist die Praxisinhaberin, die eingeladen hat: sie hat den
  -- Zugang veranlasst, das Konto hat ihn nur angenommen.
  insert into public.user_profiles (id, organization_id, person_id, display_name, is_active, created_by)
  values (v_uid, v_ein.organization_id, v_person_id, v_name, true, v_ein.invited_by);

  foreach v_rolle in array v_ein.role_keys loop
    insert into public.user_roles (user_id, organization_id, role_key, created_by)
    values (v_uid, v_ein.organization_id, v_rolle, v_ein.invited_by);
  end loop;

  update public.staff_account_invitations
     set status = 'accepted', accepted_at = now(), accepted_user_id = v_uid
   where id = v_ein.id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_ein.organization_id, v_uid, 'staff_account.invitation_accepted', 'staff_member',
    v_ein.staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'roles', to_jsonb(v_ein.role_keys))
  );

  return v_uid;
end;
$$;

comment on function public.claim_staff_invitation() is
  'Bindet das angemeldete Konto an Organisation, Person und Rollen einer offenen Einladung. Ohne passende Einladung entsteht nichts (STAFF-002b, ANN-023).';

revoke all on function public.claim_staff_invitation() from public, anon;
grant execute on function public.claim_staff_invitation() to authenticated;

-- -----------------------------------------------------------------------------
-- staff_account_directory
--
-- Beantwortet je Mitarbeiterdatensatz: gibt es einen Zugang, ist er aktiv,
-- welche Rollen hat er. security_invoker: die RLS von user_profiles und
-- user_roles gilt unveraendert, die Sicht erweitert also keine Sichtbarkeit.
-- Fuer eine Rolle ohne Einblick kommen die Spalten als null zurueck - es wird
-- nichts ausgeliefert und im Client ausgeblendet (4.7).
-- -----------------------------------------------------------------------------
create view public.staff_account_directory
with (security_invoker = true) as
select
  sm.id              as staff_member_id,
  sm.organization_id,
  up.id              as user_id,
  up.is_active       as account_active,
  (
    select array_agg(ur.role_key order by ur.role_key)
    from public.user_roles ur
    where ur.user_id = up.id
      and ur.organization_id = up.organization_id
  )                  as role_keys
from public.staff_members sm
left join public.user_profiles up
  on up.person_id = sm.person_id
 and up.organization_id = sm.organization_id;

comment on view public.staff_account_directory is
  'Zugangsstand je Mitarbeiterdatensatz. security_invoker: RLS der Basistabellen gilt unveraendert (STAFF-002b).';

revoke all on public.staff_account_directory from anon, authenticated;
grant select on public.staff_account_directory to authenticated;
