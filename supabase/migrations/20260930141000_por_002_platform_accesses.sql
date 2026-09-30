-- =============================================================================
-- POR-002: Zugang und Einladung (ADR-023 Punkte 3 bis 8, 10, 11, 15, 24)
--
-- ZUGANG. Ein Zugang verbindet EIN Konto mit EINEM Verhaeltnis: einem
-- Behandlungsverhaeltnis (`patients`) oder einem Trainingsverhaeltnis. Er hat
-- einen Zustand (Punkt 3):
--
--   invited  Einladung offen, noch kein Konto gebunden
--   active   Konto gebunden, Plattform nutzbar
--   locked   voruebergehend gesperrt, ruecknehmbar
--   revoked  entzogen, endgueltig; ein neuer Zugang ist eine neue Einladung
--
-- Zugriff folgt dem Zugang, nicht der Person und nicht einer Rolle: Es gibt
-- keine Zeile in `user_roles`, und das Konto bekommt kein Profil (ANN-187).
-- Die Plattform liest nur ueber Projektionen, die einen aktiven Zugang
-- verlangen (POR-004).
--
-- EINLADUNG. Der Dreischritt der Praxiskonten (Punkt 7): Die Einladung
-- vergibt die Berechtigung und gilt 14 Tage (ANN-026); das Konto entsteht beim
-- Anmeldedienst; die Annahme bindet es an den Zugang. Das Anlegen und das
-- Binden uebernimmt der Zugangsdienst (Punkt 9, Edge Function
-- `platform-access`) ueber die zwei Funktionen am Ende dieser Datei, die nur
-- `service_role` ausfuehren darf. Die Einladung traegt einen einmaligen Code;
-- gespeichert wird nur sein Hash, und er steht in keinem Log (ADR-011).
--
-- Zwei Wege, eine Einladung (Punkt 8, W2): vor Ort als QR auf dem Praxisgeraet
-- (Regelweg) oder per Mail an die Adresse im Verhaeltnis, die die Person
-- selbst bestaetigt hat (Punkt 11, ANN-188). Dieselbe Einladung setzt fuer ein
-- bestehendes Konto ein neues Kennwort (Punkt 10): Die Plattform ist ohne
-- Mail benutzbar.
--
-- VORBEREITET FUER DIE VERTRETUNG (W6). `access_kind` ist heute immer
-- `self`; POR-EPIC-001b fuegt die rechtliche Vertretung und die Begleitung
-- hinzu, ohne die Tabelle umzubauen.
--
-- NACHWEIS UND FRISTEN (Punkt 5, Fassung 2; ANN-189). Zugang und Einladungen
-- sind der Nachweis und halten drei Jahre nach dem Ende des Zugangs, das
-- Konto beim Anmeldedienst 30 Tage. Faellt das Verhaeltnis im Loeschlauf,
-- endet der Zugang, und der Nachweis loest sich von Verhaeltnis und Person:
-- Er behaelt nur die Kennung des Verhaeltnisses, wie ein Auditeintrag.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Auditkatalog: Zugangsereignisse, ein Gegenstand und ein zweiter
--    Akteurstyp (ADR-023 Konsequenzen, Punkt 14)
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text, 'training_relationship.created'::text, 'training_relationship.updated'::text, 'training_relationship.ended'::text, 'training_relationship.reopened'::text, 'training_relationship.viewed'::text, 'training_relationships.read'::text, 'training_basis.created'::text, 'training_basis.concluded'::text, 'training_basis.reopened'::text, 'training_protocol.created'::text, 'training_protocol.updated'::text, 'training_protocol.finalized'::text, 'training_protocol.viewed'::text, 'training_protocol.discarded'::text, 'platform_access.invited'::text, 'platform_access.invitation_sent'::text, 'platform_access.activated'::text, 'platform_access.password_reset'::text, 'platform_access.locked'::text, 'platform_access.unlocked'::text, 'platform_access.revoked'::text, 'platform_accesses.read'::text])));

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
    'training_protocol',
    'platform_access'
  ));

alter table public.audit_log drop constraint audit_log_actor_kind_check;
alter table public.audit_log add constraint audit_log_actor_kind_check
  check (actor_kind in ('user', 'system', 'platform'));

alter table public.audit_log drop constraint audit_log_actor_consistent;
alter table public.audit_log add constraint audit_log_actor_consistent
  check ((actor_kind in ('user', 'platform')) = (actor_user_id is not null));

comment on column public.audit_log.actor_kind is
  'user: Praxiskonto; platform: Plattformkonto (ADR-023, POR-002); system: Loeschlauf und andere Vorgaenge ohne Person.';

-- -----------------------------------------------------------------------------
-- 2. Die Tabellen
-- -----------------------------------------------------------------------------
create table public.platform_accesses (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  relationship_kind        text not null check (relationship_kind in ('treatment', 'training')),
  -- Die Kennung des Verhaeltnisses. Bleibt als Nachweis stehen, wenn das
  -- Verhaeltnis faellt - wie `subject_id` im Auditlog, ohne Fremdschluessel.
  relationship_id          uuid not null,
  -- Die lebenden Verweise. `on delete set null`: Faellt das Verhaeltnis im
  -- Loeschlauf, endet der Zugang (Trigger unten), und der Nachweis haelt die
  -- Person nicht fest (ADR-023 Konsequenzen).
  patient_id               uuid references public.patients (id) on delete set null,
  training_relationship_id uuid references public.training_relationships (id) on delete set null,
  access_kind              text not null default 'self' check (access_kind in ('self')),
  -- auth.users.id. Bewusst ohne FK: Das Konto faellt nach 30 Tagen, der
  -- Nachweis nach drei Jahren (Punkt 5).
  account_user_id          uuid,
  status                   text not null default 'invited'
                             check (status in ('invited', 'active', 'locked', 'revoked')),
  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  activated_at             timestamptz,
  locked_at                timestamptz,
  locked_by                uuid,
  revoked_at               timestamptz,
  revoked_by               uuid,
  revoked_reason           text check (revoked_reason in ('practice', 'relationship_deleted', 'account_deleted')),

  constraint platform_accesses_relationship_matches check (
    (relationship_kind = 'treatment' and training_relationship_id is null
       and (patient_id is null or patient_id = relationship_id))
    or (relationship_kind = 'training' and patient_id is null
       and (training_relationship_id is null or training_relationship_id = relationship_id))
  ),
  -- Ein Zugang ohne Verhaeltnis ist nur noch Nachweis.
  constraint platform_accesses_live_has_relationship check (
    status = 'revoked' or patient_id is not null or training_relationship_id is not null
  ),
  constraint platform_accesses_account_by_status check (
    (status = 'invited' and account_user_id is null)
    or (status in ('active', 'locked') and account_user_id is not null)
    or status = 'revoked'
  ),
  constraint platform_accesses_revoked_stamp check (
    (status = 'revoked') = (revoked_at is not null and revoked_reason is not null)
  ),
  constraint platform_accesses_locked_stamp check (
    (status = 'locked') = (locked_at is not null)
  )
);

comment on table public.platform_accesses is
  'Plattformzugang (ADR-023 Punkt 3, POR-002): ein Konto zu einem Verhaeltnis, mit Zustand. Nachweis bis drei Jahre nach dem Ende (ANN-189). Datenklasse: Plattformzugang.';
comment on column public.platform_accesses.relationship_id is
  'Kennung des Verhaeltnisses (patients.id oder training_relationships.id). Ohne FK, damit der Nachweis das Verhaeltnis ueberdauert, ohne es festzuhalten.';
comment on column public.platform_accesses.account_user_id is
  'auth.users.id des Plattformkontos. Ohne FK: das Konto faellt 30 Tage nach dem Ende, der Nachweis erst nach drei Jahren (ADR-023 Punkt 5).';

-- Hoechstens ein lebender eigener Zugang je Verhaeltnis (Punkt 4). Ein
-- entzogener bleibt als Nachweis beliebig oft stehen.
create unique index platform_accesses_one_live_self
  on public.platform_accesses (relationship_id)
  where status <> 'revoked' and access_kind = 'self';

-- Hoechstens ein lebender Zugang je Konto und Verhaeltnis (Punkt 4).
create unique index platform_accesses_one_per_account
  on public.platform_accesses (account_user_id, relationship_id)
  where status <> 'revoked' and account_user_id is not null;

create index platform_accesses_organization_idx on public.platform_accesses (organization_id);
create index platform_accesses_account_idx on public.platform_accesses (account_user_id)
  where account_user_id is not null;
create index platform_accesses_patient_idx on public.platform_accesses (patient_id)
  where patient_id is not null;
create index platform_accesses_training_idx on public.platform_accesses (training_relationship_id)
  where training_relationship_id is not null;

create table public.platform_access_invitations (
  id                   uuid primary key default extensions.gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  platform_access_id   uuid not null references public.platform_accesses (id) on delete cascade,
  -- activate: bindet ein Konto; reset: setzt fuer das gebundene Konto ein
  -- neues Kennwort (ADR-023 Punkt 10).
  purpose              text not null check (purpose in ('activate', 'reset')),
  channel              text not null check (channel in ('on_site', 'email')),
  code_hash            text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  -- Nur beim Weg per Mail. Faellt das Verhaeltnis, wird sie geleert: Der
  -- Nachweis traegt keinen Inhalt aus dem Verhaeltnis (Punkt 5).
  email                text check (email is null or (email = lower(btrim(email))
                         and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- ANN-188: Wer hat wann vermerkt, dass die Person die Adresse selbst
  -- bestaetigt hat (Punkt 11, Fassung 2)?
  address_confirmed_by uuid,
  address_confirmed_at timestamptz,
  status               text not null default 'pending'
                         check (status in ('pending', 'redeemed', 'revoked')),
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  -- Wer die Einladung ausgestellt und uebergeben hat (Punkt 11).
  created_by           uuid not null,
  sent_at              timestamptz,
  redeemed_at          timestamptz,
  revoked_at           timestamptz,

  constraint platform_access_invitations_email_channel check (
    channel = 'on_site'
    or (address_confirmed_by is not null and address_confirmed_at is not null)
  ),
  constraint platform_access_invitations_on_site_without_email check (
    channel = 'email' or (email is null and sent_at is null)
  ),
  constraint platform_access_invitations_redeemed_stamp check (
    (status = 'redeemed') = (redeemed_at is not null)
  ),
  constraint platform_access_invitations_revoked_stamp check (
    (status = 'revoked') = (revoked_at is not null)
  )
);

comment on table public.platform_access_invitations is
  'Einladung zu einem Plattformzugang (ADR-023 Punkte 7, 8, 11). Nur der Hash des Codes ist gespeichert. Faellt mit ihrem Zugang.';
comment on column public.platform_access_invitations.code_hash is
  'SHA-256 des einmaligen Codes, hexadezimal. Der Code selbst wird nie gespeichert und nie protokolliert (ADR-011).';

create unique index platform_access_invitations_one_pending
  on public.platform_access_invitations (platform_access_id)
  where status = 'pending';
create index platform_access_invitations_organization_idx
  on public.platform_access_invitations (organization_id);

-- Gelesen und geschrieben wird nur ueber die Funktionen unten. Die Tabellen
-- sind fuer keine Anwendungsrolle direkt erreichbar (ADR-023 Punkt 19).
alter table public.platform_accesses enable row level security;
alter table public.platform_access_invitations enable row level security;
revoke all on public.platform_accesses from public, anon, authenticated;
revoke all on public.platform_access_invitations from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Datenklasse (ADR-008, Punkt 5 Fassung 2)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('plattformzugang', 'intern', null, 'case_closed', interval '3 years', 'ANN-189',
   'Plattformzugang mit Einladungen als Nachweis: drei Jahre nach dem Ende des Zugangs, so lange wie die Auditeintraege, die auf ihn zeigen. Das Konto beim Anmeldedienst faellt 30 Tage nach dem Ende des letzten Zugangs (ADR-023 Punkt 5).',
   75);

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('platform_accesses', 'plattformzugang', 'automatisch',
   'Zugang je Konto und Verhaeltnis. Faellt das Verhaeltnis, endet er und loest sich von Verhaeltnis und Person; drei Jahre nach dem Ende faellt er im Lauf.', 75),
  ('platform_access_invitations', 'plattformzugang', 'ueber_elterndatensatz',
   'Einladungen eines Zugangs. Fallen mit ihm; die Adresse wird geleert, sobald das Verhaeltnis faellt.', 76);

-- -----------------------------------------------------------------------------
-- 4. Konstanten - je eine Stelle
-- -----------------------------------------------------------------------------

-- ADR-023 Punkt 15 (W4): unter 18 kein eigener Zugang. Eine Zahl an einer
-- Stelle.
create function app.platform_min_age_years()
returns integer
language sql
immutable
set search_path = ''
as $$ select 18 $$;

-- DSN-001 D2: nach dem Ende des Verhaeltnisses 30 Tage lesend, dann nur noch
-- "Ich". Zugleich die Frist, nach der das Konto faellt (ADR-023 Punkt 5).
create function app.platform_read_period()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 days' $$;

-- ANN-026 fuer die Praxiskonten, hier dieselbe Frist (ADR-023 Punkt 7).
create function app.platform_invitation_validity()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '14 days' $$;

revoke all on function app.platform_min_age_years() from public, anon, authenticated;
revoke all on function app.platform_read_period() from public, anon, authenticated;
revoke all on function app.platform_invitation_validity() from public, anon, authenticated;

create function app.platform_code_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(convert_to(coalesce(p_code, ''), 'UTF8'), 'sha256'), 'hex') $$;

revoke all on function app.platform_code_hash(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Das Verhaeltnis hinter einem Zugang
--
-- Liefert Person, Adresse, Geburtsdatum und Ende des Verhaeltnisses. Kennt
-- keine Rolle: Die Aufrufer pruefen vorher, wer fragt.
-- -----------------------------------------------------------------------------
create function app.platform_relationship(p_kind text, p_id uuid)
returns table (
  organization_id uuid,
  person_id       uuid,
  email           text,
  date_of_birth   date,
  ended_on        date
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id, p.person_id, lower(btrim(c.email)), c.date_of_birth, p.care_concluded_on
  from public.patients p
  left join public.patient_contact_details c on c.patient_id = p.id
  where p_kind = 'treatment' and p.id = p_id
  union all
  select t.organization_id, t.person_id, lower(btrim(c.email)), c.date_of_birth, t.contract_ended_on
  from public.training_relationships t
  left join public.training_contact_details c on c.training_relationship_id = t.id
  where p_kind = 'training' and t.id = p_id
$$;

revoke all on function app.platform_relationship(text, uuid) from public, anon, authenticated;

-- Wer Zugaenge zu einem Verhaeltnis einlaedt, sperrt und entzieht: die
-- Rollen, die das Verhaeltnis schreiben (ADR-023 Punkt 6).
create function app.can_manage_platform_access(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.can_update_patient()
    when 'training'  then app.can_write_training_relationships()
    else false
  end
$$;

-- Wer den Zustand im Abschnitt "Plattform" sieht: wer das Verhaeltnis liest.
create function app.can_read_platform_access(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then app.can_read_patient_directory()
    when 'training'  then app.can_read_training_relationships()
    else false
  end
$$;

revoke all on function app.can_manage_platform_access(text) from public, anon;
revoke all on function app.can_read_platform_access(text) from public, anon;
grant execute on function app.can_manage_platform_access(text) to authenticated;
grant execute on function app.can_read_platform_access(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Das Ende eines Zugangs (ANN-189)
--
-- Entzogen: der Zeitpunkt des Entziehens. Sonst endet ein Zugang mit der
-- Lesefrist nach dem Ende des Verhaeltnisses (DSN-001 D2), und ein nie
-- eingeloester mit dem Ablauf seiner letzten Einladung. `null` heisst: laeuft.
-- -----------------------------------------------------------------------------
create function app.platform_access_ended_at(p_access_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.status = 'revoked' then a.revoked_at
    when a.status = 'invited' and not exists (
           select 1 from public.platform_access_invitations i
           where i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now()
         )
      then (select max(i.expires_at) from public.platform_access_invitations i
            where i.platform_access_id = a.id)
    when r.ended_on is not null
      then app.retention_due_at(r.ended_on, app.platform_read_period(), o.time_zone)
    else null
  end
  from public.platform_accesses a
  join public.organizations o on o.id = a.organization_id
  left join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r on true
  where a.id = p_access_id
$$;

revoke all on function app.platform_access_ended_at(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Riegel
-- -----------------------------------------------------------------------------

-- Ein Konto ist Praxis- oder Plattformkonto, nie beides (ADR-023 Punkt 2, W1).
-- ANN-187: Ein Plattformkonto hat kein Profil; dieser Riegel haelt das fest.
-- Richtung 1: Ein Konto, das an einen Zugang gebunden ist oder war, bekommt
-- kein Profil - auch nicht ueber die Annahme einer Praxiseinladung.
create function app.user_profiles_not_platform_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.platform_accesses a where a.account_user_id = new.id
  ) then
    raise exception 'platform account cannot be a practice account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_profiles_not_platform_account
  before insert or update of id on public.user_profiles
  for each row execute function app.user_profiles_not_platform_account();

-- Richtung 2: Ein Zugang bindet kein Konto mit Profil. Dazu die Regel aus
-- Punkt 4: Ein eigener Zugang bindet nur ein Konto, dessen uebrige eigene
-- Zugaenge zu derselben Person gehoeren - ein Konto je Person.
create function app.platform_accesses_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
begin
  -- Faellt das Verhaeltnis (on delete set null), endet der Zugang, und seine
  -- Einladungen verlieren die Adresse (ADR-023 Punkt 5).
  if tg_op = 'UPDATE'
     and new.patient_id is null and new.training_relationship_id is null
     and (old.patient_id is not null or old.training_relationship_id is not null) then
    if new.status <> 'revoked' then
      new.status := 'revoked';
      new.revoked_at := now();
      new.revoked_by := null;
      new.revoked_reason := 'relationship_deleted';
      new.locked_at := null;
      new.locked_by := null;
    end if;
    update public.platform_access_invitations i
       set email = null,
           status = case when i.status = 'pending' then 'revoked' else i.status end,
           revoked_at = case when i.status = 'pending' then now() else i.revoked_at end
     where i.platform_access_id = new.id;
    return new;
  end if;

  if new.account_user_id is not null
     and (tg_op = 'INSERT' or new.account_user_id is distinct from old.account_user_id) then
    if exists (select 1 from public.user_profiles up where up.id = new.account_user_id) then
      raise exception 'practice account cannot hold platform access' using errcode = '23514';
    end if;

    if new.access_kind = 'self' then
      select r.person_id into v_person
      from app.platform_relationship(new.relationship_kind, new.relationship_id) r;

      if exists (
        select 1
        from public.platform_accesses a
        cross join lateral app.platform_relationship(a.relationship_kind, a.relationship_id) r
        where a.account_user_id = new.account_user_id
          and a.id <> new.id
          and a.access_kind = 'self'
          and a.status <> 'revoked'
          and r.person_id is distinct from v_person
      ) then
        raise exception 'account belongs to another person' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger platform_accesses_guard
  before insert or update on public.platform_accesses
  for each row execute function app.platform_accesses_guard();

-- -----------------------------------------------------------------------------
-- 8. Die Akteure im Auditlog
-- -----------------------------------------------------------------------------
create function app.log_platform_access_event(
  p_org       uuid,
  p_actor     uuid,
  p_actor_kind text,
  p_action    text,
  p_access_id uuid,
  p_context   jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    p_org, p_actor, p_actor_kind, p_action, 'platform_access', p_access_id, 'success', p_context
  )
$$;

revoke all on function app.log_platform_access_event(uuid, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Lesen: der Abschnitt "Plattform" an Akte und Trainingsverhaeltnis
--
-- Liefert den juengsten Zugang des Verhaeltnisses mit seiner offenen
-- Einladung. Keine Adresse, kein Code, kein Konto: Die Praxis sieht den
-- Zustand, nicht das Konto der Person.
-- -----------------------------------------------------------------------------
create function public.get_platform_access(p_relationship_kind text, p_relationship_id uuid)
returns table (
  id                   uuid,
  status               text,
  created_at           timestamptz,
  activated_at         timestamptz,
  locked_at            timestamptz,
  revoked_at           timestamptz,
  revoked_reason       text,
  invitation_id        uuid,
  invitation_purpose   text,
  invitation_channel   text,
  invitation_expires_at timestamptz,
  invitation_sent_at   timestamptz,
  relationship_email   text,
  ended_at             timestamptz
)
language plpgsql
-- VOLATILE, nicht STABLE: Der abgewiesene Aufruf schreibt einen Eintrag
-- (audit.test.ts, TRN-EPIC-001).
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
  if not app.can_read_platform_access(p_relationship_kind) then
    perform app.record_denied_read(v_actor, 'platform_accesses.read', 'not allowed to read platform access');
    return;
  end if;
  v_org := app.current_organization_id();

  if not exists (
    select 1 from app.platform_relationship(p_relationship_kind, p_relationship_id) r
    where r.organization_id = v_org
  ) then
    return;
  end if;

  return query
  select a.id, a.status, a.created_at, a.activated_at, a.locked_at, a.revoked_at, a.revoked_reason,
         i.id, i.purpose, i.channel, i.expires_at, i.sent_at,
         -- Die Adresse im Verhaeltnis, damit die Praxis sieht, wohin eine
         -- Mail ginge. Nur fuer die Rollen, die sie ohnehin lesen.
         (select r.email from app.platform_relationship(p_relationship_kind, p_relationship_id) r),
         app.platform_access_ended_at(a.id)
  from (select 1) as eins
  left join lateral (
    select x.*
    from public.platform_accesses x
    where x.organization_id = v_org
      and x.relationship_id = p_relationship_id
      and x.relationship_kind = p_relationship_kind
      and x.access_kind = 'self'
    order by (x.status = 'revoked'), x.created_at desc
    limit 1
  ) a on true
  left join public.platform_access_invitations i
    on i.platform_access_id = a.id and i.status = 'pending' and i.expires_at > now();
end;
$$;

revoke all on function public.get_platform_access(text, uuid) from public, anon;
grant execute on function public.get_platform_access(text, uuid) to authenticated;

comment on function public.get_platform_access(text, uuid) is
  'POR-002: Zustand des eigenen Plattformzugangs eines Verhaeltnisses fuer den Abschnitt "Plattform". Rollen, die das Verhaeltnis lesen; abgewiesen mit denied (platform_accesses.read). Ohne Code, ohne Konto.';

-- -----------------------------------------------------------------------------
-- 10. Einladen (ADR-023 Punkte 6 bis 8, 11, 15)
--
-- Legt den Zugang an, falls es keinen lebenden gibt, und stellt eine
-- Einladung aus. Eine offene Einladung desselben Zugangs wird dabei
-- zurueckgenommen - es gilt immer nur die juengste. Fuer einen aktiven
-- Zugang ist die Einladung eine zum neuen Kennwort (Punkt 10); ein
-- gesperrter muss erst entsperrt werden.
--
-- Liefert den Code GENAU EINMAL. Er steht danach nirgends mehr.
-- -----------------------------------------------------------------------------
create function public.invite_platform_access(
  p_relationship_kind text,
  p_relationship_id   uuid,
  p_channel           text,
  p_address_confirmed boolean default false
)
returns table (
  access_id     uuid,
  invitation_id uuid,
  purpose       text,
  code          text,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_rel     record;
  v_access  public.platform_accesses%rowtype;
  v_purpose text;
  v_code    text;
  v_inv     uuid;
  v_expires timestamptz;
  v_email   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_platform_access(p_relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.invited', 'not allowed to manage platform access');
    return;
  end if;
  v_org := app.current_organization_id();

  if p_channel is null or p_channel not in ('on_site', 'email') then
    raise exception 'unknown channel' using errcode = '22023';
  end if;

  select * into v_rel
  from app.platform_relationship(p_relationship_kind, p_relationship_id) r
  where r.organization_id = v_org;
  if not found then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;

  -- Punkt 15 (W4): Unter 18 gibt es keinen eigenen Zugang. Ohne Geburtsdatum
  -- laesst sich das nicht pruefen, und die restriktive Seite gilt (§16,
  -- ANN-190).
  if v_rel.date_of_birth is null then
    raise exception 'date of birth required' using errcode = '22023';
  end if;
  if v_rel.date_of_birth > (now() at time zone 'UTC')::date
                           - make_interval(years => app.platform_min_age_years()) then
    raise exception 'person is under age' using errcode = '22023';
  end if;

  -- Punkt 11 (Fassung 2, ANN-188): Mail nur an die Adresse im Verhaeltnis,
  -- und nur, wenn die einladende Person vermerkt, dass die Person sie selbst
  -- bestaetigt hat.
  if p_channel = 'email' then
    if v_rel.email is null then
      raise exception 'no email address on record' using errcode = '22023';
    end if;
    if not coalesce(p_address_confirmed, false) then
      raise exception 'address must be confirmed by the person' using errcode = '22023';
    end if;
    v_email := v_rel.email;
  end if;

  select * into v_access
  from public.platform_accesses a
  where a.relationship_id = p_relationship_id
    and a.relationship_kind = p_relationship_kind
    and a.access_kind = 'self'
    and a.status <> 'revoked'
  for update;

  if not found then
    insert into public.platform_accesses (
      organization_id, relationship_kind, relationship_id,
      patient_id, training_relationship_id, created_by
    )
    values (
      v_org, p_relationship_kind, p_relationship_id,
      case when p_relationship_kind = 'treatment' then p_relationship_id end,
      case when p_relationship_kind = 'training' then p_relationship_id end,
      v_actor
    )
    returning * into v_access;
    v_purpose := 'activate';
  elsif v_access.status = 'invited' then
    v_purpose := 'activate';
  elsif v_access.status = 'active' then
    v_purpose := 'reset';
  else
    raise exception 'platform access is locked' using errcode = '22023';
  end if;

  update public.platform_access_invitations i
     set status = 'revoked', revoked_at = now()
   where i.platform_access_id = v_access.id and i.status = 'pending';

  -- 24 Zufallsbytes, URL-tauglich kodiert: 32 Zeichen, nicht zu erraten.
  v_code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  v_expires := now() + app.platform_invitation_validity();

  insert into public.platform_access_invitations (
    organization_id, platform_access_id, purpose, channel, code_hash, email,
    address_confirmed_by, address_confirmed_at, expires_at, created_by
  )
  values (
    v_org, v_access.id, v_purpose, p_channel, app.platform_code_hash(v_code), v_email,
    case when p_channel = 'email' then v_actor end,
    case when p_channel = 'email' then now() end,
    v_expires, v_actor
  )
  returning id into v_inv;

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invited', v_access.id,
    jsonb_build_object('surface', 'web', 'channel', p_channel, 'purpose', v_purpose,
                       'relationship_kind', p_relationship_kind)
  );

  return query select v_access.id, v_inv, v_purpose, v_code, v_expires;
end;
$$;

revoke all on function public.invite_platform_access(text, uuid, text, boolean) from public, anon;
grant execute on function public.invite_platform_access(text, uuid, text, boolean) to authenticated;

comment on function public.invite_platform_access(text, uuid, text, boolean) is
  'POR-002: laedt zu einem Plattformzugang ein (vor Ort oder per Mail an die bestaetigte Adresse, ANN-188) und liefert den Code einmal. Rollen, die das Verhaeltnis schreiben (ADR-023 Punkt 6); abgewiesen mit denied und HTTP 403.';

-- -----------------------------------------------------------------------------
-- 11. Sperren, entsperren, entziehen (ADR-023 Punkte 4, 5, 6)
--
-- Aendern nur den Zugang, nie das Verhaeltnis und nie seine Frist.
-- -----------------------------------------------------------------------------
create function app.platform_access_for_update(p_access_id uuid, p_org uuid)
returns public.platform_accesses
language sql
security definer
set search_path = ''
as $$
  select a.* from public.platform_accesses a
  where a.id = p_access_id and a.organization_id = p_org
  for update
$$;

revoke all on function app.platform_access_for_update(uuid, uuid) from public, anon, authenticated;

create function public.set_platform_access_locked(p_access_id uuid, p_locked boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_access public.platform_accesses%rowtype;
  v_action text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_action := case when coalesce(p_locked, false) then 'platform_access.locked'
                   else 'platform_access.unlocked' end;
  v_org := app.current_organization_id();

  v_access := app.platform_access_for_update(p_access_id, v_org);
  -- Die Rolle haengt am Verhaeltnis. Ein Zugang der eigenen Praxis, den die
  -- Rolle nicht verwalten darf, und ein unbekannter werden gleich
  -- abgewiesen: Die Kennung stammt vom Aufrufer.
  if v_access.id is null or not app.can_manage_platform_access(v_access.relationship_kind) then
    perform app.record_denied_write(v_actor, v_action, 'not allowed to manage platform access');
    return null;
  end if;

  if p_locked and v_access.status = 'active' then
    update public.platform_accesses
       set status = 'locked', locked_at = now(), locked_by = v_actor
     where id = v_access.id;
  elsif not p_locked and v_access.status = 'locked' then
    update public.platform_accesses
       set status = 'active', locked_at = null, locked_by = null
     where id = v_access.id;
  else
    raise exception 'platform access is not in a state for this' using errcode = '22023';
  end if;

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', v_action, v_access.id, jsonb_build_object('surface', 'web')
  );
  return case when p_locked then 'locked' else 'active' end;
end;
$$;

revoke all on function public.set_platform_access_locked(uuid, boolean) from public, anon;
grant execute on function public.set_platform_access_locked(uuid, boolean) to authenticated;

create function public.revoke_platform_access(p_access_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_access public.platform_accesses%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  v_access := app.platform_access_for_update(p_access_id, v_org);
  if v_access.id is null or not app.can_manage_platform_access(v_access.relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.revoked', 'not allowed to manage platform access');
    return null;
  end if;

  if v_access.status = 'revoked' then
    raise exception 'platform access is already revoked' using errcode = '22023';
  end if;

  update public.platform_accesses
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor, revoked_reason = 'practice',
         locked_at = null, locked_by = null
   where id = v_access.id;

  update public.platform_access_invitations
     set status = 'revoked', revoked_at = now()
   where platform_access_id = v_access.id and status = 'pending';

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.revoked', v_access.id,
    jsonb_build_object('surface', 'web', 'previous_status', v_access.status)
  );
  return 'revoked';
end;
$$;

revoke all on function public.revoke_platform_access(uuid) from public, anon;
grant execute on function public.revoke_platform_access(uuid) to authenticated;

comment on function public.set_platform_access_locked(uuid, boolean) is
  'POR-002: sperrt oder entsperrt einen Plattformzugang; wirkt bei der naechsten Anfrage (ADR-023 Punkt 18). Rollen, die das Verhaeltnis schreiben; abgewiesen mit denied und HTTP 403.';
comment on function public.revoke_platform_access(uuid) is
  'POR-002: entzieht einen Plattformzugang endgueltig und nimmt offene Einladungen zurueck. Aendert nie das Verhaeltnis (ADR-023 Punkt 5).';

-- -----------------------------------------------------------------------------
-- 12. Die Mail zur Einladung (ADR-023 Punkt 10)
--
-- Der Zugangsdienst ruft das mit der Sitzung der einladenden Person auf,
-- bevor er versendet. Geprueft wird die Rolle, die offene Einladung per Mail
-- und der Code - so bestimmt der Server die Adresse, nie der Browser. Hat
-- sich die Adresse im Verhaeltnis seither geaendert, braucht es eine neue
-- Einladung (Punkt 11).
-- -----------------------------------------------------------------------------
create function public.platform_invitation_mail(p_invitation_id uuid, p_code text)
returns table (email text, organization_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inv    record;
  v_aktuell text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  select i.id, i.email, i.expires_at, i.status, i.channel, i.code_hash,
         a.id as access_id, a.relationship_kind, a.relationship_id
    into v_inv
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  where i.id = p_invitation_id and i.organization_id = v_org
  for update of i;

  if v_inv.id is null or not app.can_manage_platform_access(v_inv.relationship_kind) then
    perform app.record_denied_write(v_actor, 'platform_access.invitation_sent', 'not allowed to manage platform access');
    return;
  end if;

  if v_inv.channel <> 'email' or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or v_inv.code_hash <> app.platform_code_hash(p_code) then
    raise exception 'invitation cannot be sent' using errcode = '22023';
  end if;

  select r.email into v_aktuell
  from app.platform_relationship(v_inv.relationship_kind, v_inv.relationship_id) r;
  if v_aktuell is distinct from v_inv.email then
    raise exception 'address changed since invitation' using errcode = '22023';
  end if;

  update public.platform_access_invitations set sent_at = now() where id = v_inv.id;

  perform app.log_platform_access_event(
    v_org, v_actor, 'user', 'platform_access.invitation_sent', v_inv.access_id,
    jsonb_build_object('surface', 'web')
  );

  return query
  select v_inv.email, o.name, v_inv.expires_at
  from public.organizations o where o.id = v_org;
end;
$$;

revoke all on function public.platform_invitation_mail(uuid, text) from public, anon;
grant execute on function public.platform_invitation_mail(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 13. Der Zugangsdienst (ADR-023 Punkt 9) - nur service_role
--
-- `platform_invitation_lookup` sagt dem Dienst, ob der Code gilt und wofuer;
-- `redeem_platform_invitation` bindet das Konto, das der Dienst angelegt oder
-- per Kennwort bestaetigt hat, und prueft dabei alles noch einmal. Fuer
-- abgelaufene, benutzte und unbekannte Codes gibt es dieselbe Auskunft (§13):
-- keine Zeile bzw. dieselbe Ausnahme.
-- -----------------------------------------------------------------------------
create function public.platform_invitation_lookup(p_code text)
returns table (purpose text, account_user_id uuid, organization_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.purpose, a.account_user_id, o.name
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  join public.organizations o on o.id = i.organization_id
  where i.code_hash = app.platform_code_hash(p_code)
    and i.status = 'pending'
    and i.expires_at > now()
    and (
      (i.purpose = 'activate' and a.status = 'invited')
      or (i.purpose = 'reset' and a.status = 'active')
    )
$$;

create function public.redeem_platform_invitation(p_code text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv    record;
begin
  if p_user_id is null then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;

  select i.id, i.purpose, i.organization_id, a.id as access_id, a.status as access_status,
         a.account_user_id
    into v_inv
  from public.platform_access_invitations i
  join public.platform_accesses a on a.id = i.platform_access_id
  where i.code_hash = app.platform_code_hash(p_code)
    and i.status = 'pending'
    and i.expires_at > now()
  for update of i, a;

  if v_inv.id is null
     or (v_inv.purpose = 'activate' and v_inv.access_status <> 'invited')
     or (v_inv.purpose = 'reset' and (v_inv.access_status <> 'active'
                                      or v_inv.account_user_id is distinct from p_user_id)) then
    raise exception 'invitation not valid' using errcode = '22023';
  end if;

  if v_inv.purpose = 'activate' then
    -- Der Riegel am Zugang prueft Praxiskonto und Person (Punkte 2 und 4).
    -- ANN-191: Das Konto hat der Zugangsdienst angelegt oder per Kennwort
    -- bestaetigt; seine Adresse darf von der im Verhaeltnis abweichen.
    update public.platform_accesses
       set status = 'active', account_user_id = p_user_id, activated_at = now()
     where id = v_inv.access_id;
  end if;

  update public.platform_access_invitations
     set status = 'redeemed', redeemed_at = now()
   where id = v_inv.id;

  perform app.log_platform_access_event(
    v_inv.organization_id, p_user_id, 'platform',
    case when v_inv.purpose = 'activate' then 'platform_access.activated'
         else 'platform_access.password_reset' end,
    v_inv.access_id, jsonb_build_object('surface', 'platform')
  );

  return v_inv.access_id;
end;
$$;

revoke all on function public.platform_invitation_lookup(text) from public, anon, authenticated;
revoke all on function public.redeem_platform_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.platform_invitation_lookup(text) to service_role;
grant execute on function public.redeem_platform_invitation(text, uuid) to service_role;

comment on function public.platform_invitation_lookup(text) is
  'POR-003: Zugangsdienst. Gilt der Code, und wofuer? Nur service_role. Unbekannt, abgelaufen und benutzt liefern gleich: keine Zeile.';
comment on function public.redeem_platform_invitation(text, uuid) is
  'POR-003: Zugangsdienst. Bindet ein Konto an den Zugang (activate) oder bestaetigt das neue Kennwort (reset). Nur service_role; Akteur im Auditlog ist das Plattformkonto (actor_kind platform).';

-- -----------------------------------------------------------------------------
-- 14. Loeschlauf (ADR-023 Punkt 5 und Konsequenzen, ANN-189)
--
-- Zwei neue Schritte am Ende des Laufs:
--   a) Konten beim Anmeldedienst: 30 Tage nach dem Ende des letzten Zugangs.
--      Ein Konto mit Profil wird nie angefasst. Die Zugaenge des Kontos
--      werden dabei entzogen, falls sie noch nicht entzogen waren (Grund
--      `account_deleted`), mit ihrem tatsaechlichen Ende als Zeitpunkt.
--   b) Zugaenge mit ihren Einladungen: drei Jahre nach dem Ende.
-- Beide stehen im Loeschjournal und werden nach einem Restore erneut
-- geloescht.
-- -----------------------------------------------------------------------------
create function app.delete_due_platform_accounts(p_org uuid, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_konto  record;
  v_anzahl integer := 0;
begin
  for v_konto in
    select a.account_user_id as id,
           max(app.platform_access_ended_at(a.id)) as ended_at
    from public.platform_accesses a
    where a.organization_id = p_org
      and a.account_user_id is not null
      and exists (select 1 from auth.users u where u.id = a.account_user_id)
      and not exists (select 1 from public.user_profiles up where up.id = a.account_user_id)
    group by a.account_user_id
    -- Jeder Zugang des Kontos ist beendet, auch in anderen Organisationen.
    having bool_and(app.platform_access_ended_at(a.id) is not null)
       and not exists (
         select 1 from public.platform_accesses b
         where b.account_user_id = a.account_user_id
           and b.organization_id <> p_org
           and app.platform_access_ended_at(b.id) is null
       )
       and max(app.platform_access_ended_at(a.id)) + app.platform_read_period() <= now()
  loop
    update public.platform_accesses a
       set status = 'revoked',
           revoked_at = app.platform_access_ended_at(a.id),
           revoked_by = null,
           revoked_reason = 'account_deleted',
           locked_at = null,
           locked_by = null
     where a.account_user_id = v_konto.id and a.status <> 'revoked';

    delete from auth.users u where u.id = v_konto.id;

    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    values
      (p_org, p_run, 'auth_users', v_konto.id, 'plattformzugang',
       v_konto.ended_at + app.platform_read_period());
    v_anzahl := v_anzahl + 1;
  end loop;
  return v_anzahl;
end;
$$;

create function app.delete_due_platform_accesses(p_org uuid, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  with faellig as (
    select a.id, a.organization_id,
           app.platform_access_ended_at(a.id) + app.retention_interval('plattformzugang') as due_at
    from public.platform_accesses a
    where a.organization_id = p_org
  ),
  geloescht as (
    delete from public.platform_accesses a
    using faellig f
    where a.id = f.id
      and f.due_at is not null
      and f.due_at <= now()
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'platform_accesses', g.id, 'plattformzugang', f.due_at
  from geloescht g
  join faellig f on f.id = g.id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_platform_accounts(uuid, uuid) from public, anon, authenticated;
revoke all on function app.delete_due_platform_accesses(uuid, uuid) from public, anon, authenticated;

-- apply_retention: unveraendert bis auf den Schritt "Plattform" am Ende.
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

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
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

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

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform > 0
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
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$
;

-- reapply_deletion_journal: unveraendert bis auf Zugang und Konto.
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
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

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    if v_tabelle = 'auth_users' then
      with g as (delete from auth.users u where u.id = any (v_ids) returning u.id)
      select array_agg(g.id) into v_geloescht from g;
    else
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
    end if;

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
$$
;
