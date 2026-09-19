-- =============================================================================
-- ABR-003a: Rechnungsempfaenger sind eigene Stammdaten
--
-- ADR-009 Punkt 2: "Patient und Rechnungsempfaenger werden als getrennte
-- Entitaeten modelliert." Die Konsequenz dort nennt auch, warum: "Beihilfe,
-- private Versicherung, Betreuung und minderjaehrige Patienten." Wer die
-- Behandlung bekommt und wer sie bezahlt, ist regelmaessig nicht dieselbe
-- Person - und eine Rechnung an die falsche Anschrift ist genau die
-- Falschzuordnung, die PROJECT_PRINCIPLES.md 13 an der Abrechnung ausschliesst.
--
-- Drei Festlegungen (ANN-076):
--
--   1. **Die Vorgabe ist die Patientin selbst**, und zwar ohne Zeile: Solange
--      keine hinterlegte Empfaengerin als Vorgabe markiert ist, geht die
--      Rechnung an die Person aus der Akte. Eine Zeile "die Patientin selbst"
--      waere eine Kopie ihrer Anschrift - ein zweiter Wert fuer denselben
--      Sachverhalt (13), der still veraltet.
--   2. **Je Patient:in beliebig viele Empfaenger, hoechstens einer als
--      Vorgabe.** Beihilfe und private Versicherung stehen nebeneinander; die
--      Praxis waehlt am Rechnungsentwurf aus, wer diese eine Rechnung bekommt.
--   3. **Eine Rechnung hat genau einen Empfaenger.** Das Aufteilen einer
--      Rechnung auf Beihilfe und Versicherung nach Quote ist NICHT Teil von V1
--      und wird hier auch nicht vorbereitet (ADR-014).
--
-- Die Zeile traegt einen Patientenbezug: Dass fuer eine Person eine
-- Beihilfestelle hinterlegt ist, ist eine Angabe ueber diese Person. Deshalb
-- kein Tabellenrecht, kein Lesen an der RLS vorbei, sondern Funktionen mit
-- Projektion (ADR-004).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer die Rechnungsstellung bedient
--
-- Eine Rechtefrage, nicht drei: Empfaenger pflegen, Entwuerfe bauen und
-- Rechnungen ausstellen gehoeren zu "Rechnungen und Zahlungsstatus"
-- (PROJECT_PRINCIPLES.md 4.3) und liegen bei `owner` und `office` - wie schon
-- die Leistungserfassung (ANN-071). Die therapeutischen Rollen bleiben
-- aussen vor; sie dokumentieren, sie fakturieren nicht.
--
-- Zwei Funktionen, damit Lesen und Schreiben spaeter auseinandergehen koennen,
-- ohne dass eine Aenderung beides verschiebt.
-- -----------------------------------------------------------------------------
create or replace function app.can_read_invoicing()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

create or replace function app.can_manage_invoicing()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

comment on function app.can_read_invoicing() is
  'Rollen, die Rechnungsempfaenger und Rechnungen lesen duerfen (ABR-003a, ANN-076): owner und office (PROJECT_PRINCIPLES.md 4.3).';
comment on function app.can_manage_invoicing() is
  'Rollen, die Rechnungsempfaenger pflegen, Entwuerfe bauen und Rechnungen ausstellen duerfen (ABR-003a, ANN-076): owner und office.';

revoke all on function app.can_read_invoicing()   from public, anon;
revoke all on function app.can_manage_invoicing() from public, anon;
grant execute on function app.can_read_invoicing()   to authenticated;
grant execute on function app.can_manage_invoicing() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Der Empfaenger
--
-- `recipient_kind` ist keine Zierde: Eine Beihilfestelle bekommt eine andere
-- Anrede und ein Aktenzeichen, eine Mutter bekommt weder das eine noch das
-- andere. Die fuenf Werte decken die vier in ADR-009 genannten Faelle ab und
-- lassen einen Rest ("other") fuer den Kostentraeger, den niemand vorhergesehen
-- hat - ohne dass dafuer eine Migration noetig wird.
--
-- `reference` ist das Aktenzeichen beziehungsweise die Versichertennummer.
-- Es steht bewusst als Freitext da: Beihilfestellen und Versicherer fuehren
-- ihre Kennungen in eigenen Formaten, und eine Pruefung, die nur die haelfte
-- kennt, weist Richtiges ab.
-- -----------------------------------------------------------------------------
create table public.invoice_recipients (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  patient_id      uuid not null references public.patients (id) on delete restrict,
  recipient_kind  text not null
                    check (recipient_kind in ('legal_representative', 'guardian',
                                              'aid_authority', 'private_insurer', 'other')),
  name            text not null check (length(btrim(name)) between 1 and 200),
  street          text check (street is null or length(btrim(street)) between 1 and 120),
  house_number    text check (house_number is null or length(btrim(house_number)) between 1 and 20),
  postal_code     text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  city            text check (city is null or length(btrim(city)) between 1 and 120),
  reference       text check (reference is null or length(btrim(reference)) between 1 and 60),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

comment on table public.invoice_recipients is
  'Rechnungsempfaenger einer Patientin, die nicht sie selbst ist (ABR-003a, ADR-009 Punkt 2): Eltern, Betreuung, Beihilfestelle, private Versicherung. Enthaelt einen Patientenbezug. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen dieser Migration (ADR-004).';
comment on column public.invoice_recipients.recipient_kind is
  'Art des Empfaengers. Steuert Anrede und Aktenzeichen auf der Rechnung - nicht die Berechtigung: Ein Empfaenger ist kein Zugang zur Akte (ADR-009, Konsequenz zu B5).';
comment on column public.invoice_recipients.is_default is
  'Vorbelegung neuer Rechnungsentwuerfe dieser Patientin. Hoechstens eine je Patientin; ist keine gesetzt, geht die Rechnung an die Patientin selbst (ANN-076).';
comment on column public.invoice_recipients.reference is
  'Aktenzeichen oder Versichertennummer beim Empfaenger, Freitext. Geht in den Rechnungssnapshot, weil die Zahlung sonst nicht zugeordnet werden kann.';

-- Hoechstens eine Vorgabe je Patientin - sonst haette "wer bekommt die
-- naechste Rechnung" zwei Antworten.
create unique index invoice_recipients_default_key
  on public.invoice_recipients (patient_id)
  where is_default;

create index invoice_recipients_patient_idx
  on public.invoice_recipients (organization_id, patient_id, name);

revoke all on public.invoice_recipients from anon, authenticated;
alter table public.invoice_recipients enable row level security;

-- Aufbewahrung (ADR-008): Abrechnungsdaten. Die Zeile faellt mit der Akte,
-- und zwar nach den Rechnungen, auf die sie mit RESTRICT zeigen. Den
-- Loeschschritt selbst traegt ABR-003 nach, wo auch die Rechnung entsteht.
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('invoice_recipients', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Rechnungsempfaenger einer Patientin. Fallen mit der Akte, nachdem die Rechnungen geloescht sind (FK restrict).', 19);

-- -----------------------------------------------------------------------------
-- 3. Auditkatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
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
    'invoice_recipient'
  ));

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
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'organization.billing_profile_changed',
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
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'treatment_basis.appointments_transferred',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted',
    'service_catalog.version_created',
    'service_catalog.version_updated',
    'service_catalog.version_published',
    'service_catalog.version_deleted',
    'billable_service.recorded',
    'billable_service.removed',
    'invoice_recipient.created',
    'invoice_recipient.updated',
    'invoice_recipient.deleted'
  ));

-- -----------------------------------------------------------------------------
-- 4. Lesen
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_recipients(p_patient_id uuid)
returns table (
  id             uuid,
  recipient_kind text,
  name           text,
  street         text,
  house_number   text,
  postal_code    text,
  city           text,
  reference      text,
  is_default     boolean
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

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoice recipients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select r.id, r.recipient_kind, r.name, r.street, r.house_number,
         r.postal_code, r.city, r.reference, r.is_default
  from public.invoice_recipients r
  where r.organization_id = v_org
    and r.patient_id = p_patient_id
  order by r.is_default desc, r.name;
end;
$$;

comment on function public.list_invoice_recipients(uuid) is
  'Hinterlegte Rechnungsempfaenger einer Patientin (ABR-003a). Die Patientin selbst steht nicht in der Liste - sie ist die Vorgabe, solange keine Zeile als Vorgabe markiert ist (ANN-076).';

revoke all on function public.list_invoice_recipients(uuid) from public, anon;
grant execute on function public.list_invoice_recipients(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Anlegen und aendern
--
-- p_id null heisst anlegen, gesetzt heisst aendern. Die Patientin wechselt
-- dabei nie: Ein Empfaenger, der die Seite wechselt, waere eine neue Zeile und
-- keine Aenderung.
-- -----------------------------------------------------------------------------
create or replace function public.save_invoice_recipient(
  p_id             uuid,
  p_patient_id     uuid,
  p_recipient_kind text,
  p_name           text,
  p_street         text,
  p_house_number   text,
  p_postal_code    text,
  p_city           text,
  p_reference      text,
  p_is_default     boolean
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

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoice recipients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Zuerst die alte Vorgabe raeumen, sonst schlaegt der Teilindex zu, bevor
  -- die neue Zeile steht.
  if coalesce(p_is_default, false) then
    update public.invoice_recipients
       set is_default = false, updated_at = now(), updated_by = v_actor
     where patient_id = p_patient_id
       and is_default
       and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.invoice_recipients (
      organization_id, patient_id, recipient_kind, name,
      street, house_number, postal_code, city, reference, is_default,
      created_by, updated_by
    )
    values (
      v_org, p_patient_id, p_recipient_kind, btrim(p_name),
      nullif(btrim(p_street), ''), nullif(btrim(p_house_number), ''),
      nullif(btrim(p_postal_code), ''), nullif(btrim(p_city), ''),
      nullif(btrim(p_reference), ''), coalesce(p_is_default, false),
      v_actor, v_actor
    )
    returning id into v_id;
  else
    update public.invoice_recipients
       set recipient_kind = p_recipient_kind,
           name           = btrim(p_name),
           street         = nullif(btrim(p_street), ''),
           house_number   = nullif(btrim(p_house_number), ''),
           postal_code    = nullif(btrim(p_postal_code), ''),
           city           = nullif(btrim(p_city), ''),
           reference      = nullif(btrim(p_reference), ''),
           is_default     = coalesce(p_is_default, false),
           updated_at     = now(),
           updated_by     = v_actor
     where id = p_id
       and organization_id = v_org
       and patient_id = p_patient_id
    returning id into v_id;

    if v_id is null then
      raise exception 'invoice recipient not found' using errcode = '42501';
    end if;
  end if;

  -- Kein Name im Kontext: Der Empfaenger einer Rechnung ist eine Angabe ueber
  -- eine Person (ADR-011). Die Art steht hier, weil sie den Vorgang erklaert.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor,
    case when p_id is null then 'invoice_recipient.created' else 'invoice_recipient.updated' end,
    'invoice_recipient', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id,
                       'recipient_kind', p_recipient_kind)
  );

  return v_id;
end;
$$;

comment on function public.save_invoice_recipient(uuid, uuid, text, text, text, text, text, text, text, boolean) is
  'Legt einen Rechnungsempfaenger an oder aendert ihn (ABR-003a). Hoechstens einer je Patientin traegt die Vorgabe; die alte wird dabei zurueckgesetzt (ANN-076).';

revoke all on function public.save_invoice_recipient(uuid, uuid, text, text, text, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.save_invoice_recipient(uuid, uuid, text, text, text, text, text, text, text, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Entfernen
--
-- Haengt eine Rechnung daran, bleibt die Zeile stehen: Der Empfaenger einer
-- ausgestellten Rechnung ist Teil ihres Belegs. Der Fremdschluessel aus
-- ABR-003 setzt das durch; hier steht nur die verstaendliche Meldung davor.
-- -----------------------------------------------------------------------------
create or replace function public.delete_invoice_recipient(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoice recipients' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select r.patient_id, r.recipient_kind
    into v_patient, v_kind
  from public.invoice_recipients r
  where r.id = p_id and r.organization_id = v_org;

  if not found then
    raise exception 'invoice recipient not found' using errcode = '42501';
  end if;

  delete from public.invoice_recipients where id = p_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice_recipient.deleted', 'invoice_recipient', p_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient, 'recipient_kind', v_kind)
  );
end;
$$;

comment on function public.delete_invoice_recipient(uuid) is
  'Entfernt einen Rechnungsempfaenger (ABR-003a). Haengt eine Rechnung daran, weist der Fremdschluessel die Loeschung ab - der Empfaenger ist Teil ihres Belegs (ADR-009 Punkt 10).';

revoke all on function public.delete_invoice_recipient(uuid) from public, anon;
grant execute on function public.delete_invoice_recipient(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Der Loeschlauf der Akte nimmt die Empfaenger mit (ADR-008)
--
-- Eine Empfaengerzeile zeigt mit RESTRICT auf die Patientenzeile: Ohne
-- eigenen Loeschschritt scheiterte der Lauf an der ersten Akte, zu der eine
-- Beihilfestelle hinterlegt ist. Die Fristzuordnung steht oben bei der
-- Tabelle; hier steht der Schritt.
--
-- Beide Ruempfe sind unveraendert aus 20260919120000_billing_retention.sql
-- uebernommen - aus der laufenden Datenbank ausgelesen, nicht aus den
-- Migrationsdateien zusammengesucht; PostgreSQL kennt kein teilweises
-- Ersetzen einer Funktion. Der fachliche Unterschied steht je an einer
-- Stelle und ist dort vermerkt.
-- -----------------------------------------------------------------------------
create or replace function app.delete_patient_record(
  p_patient_id uuid,
  p_run_id uuid,
  p_due_at timestamp with time zone
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select p.organization_id, p.person_id
    into v_org, v_person
  from public.patients p
  where p.id = p_patient_id;

  if not found then
    return 0;
  end if;

  -- Rechnungsempfaenger zuerst: Sie zeigen mit RESTRICT auf die
  -- Patientenzeile. Ohne diesen Schritt scheiterte der ganze Lauf an einer
  -- Empfaengerzeile (ADR-008, ABR-003a).
  with geloescht as (
    delete from public.invoice_recipients r
     where r.patient_id = p_patient_id
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_recipients', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Leistungen fallen vor Termin und Patientenzeile, weil sie mit RESTRICT
  -- auf beide zeigen, und ihre steuerliche Frist ist nie laenger als die zehn
  -- Jahre der Akte (ADR-008, ABR-002).
  with geloescht as (
    delete from public.billable_services b
     where b.patient_id = p_patient_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'billable_services', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_notes t
     where t.appointment_id in (
       select a.id from public.appointments a where a.patient_id = p_patient_id
     )
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_notes', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_bases pr
     where pr.patient_id = p_patient_id
    returning pr.id, pr.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_bases', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.appointments a
     where a.patient_id = p_patient_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.legal_holds h
     where h.subject_type = 'patient'
       and h.subject_id = p_patient_id
    returning h.id, h.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'legal_holds', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.patients p
     where p.id = p_patient_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'patients', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x      where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_patient_record(uuid, uuid, timestamp with time zone) is
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-003a einschliesslich der Rechnungsempfaenger. Prueft KEINEN Legal Hold - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;

create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
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

comment on function public.reapply_deletion_journal() is
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-003a einschliesslich der Rechnungsempfaenger.';
