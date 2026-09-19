-- =============================================================================
-- ABR-003d: Die Zahlungserinnerung ist ein Dokument, kein Mahnlauf
--
-- `IDEA-PRX-012`, von Jannes am 2026-09-06 bestaetigt: aus einer
-- ueberfaelligen Rechnung eine Zahlungserinnerung als Dokument - **ohne
-- Stufenlogik, ohne Gebuehren, ohne Automatik**. Mahnstufen kommen mit
-- ABR-005 nach Praxiserfahrung; ADR-009 fuehrt das Mahnwesen ausdruecklich
-- als nicht entschieden.
--
-- Vier Festlegungen tragen diese Migration (**ANN-080**):
--
--   1. **Keine Stufen.** Jede Erinnerung ist eine Erinnerung; eine zweite ist
--      nicht "die zweite Mahnung", sondern noch eine Erinnerung. Es gibt
--      keinen Rang, keine Gebuehr und keine Verzugszinsen - all das ist eine
--      Rechtsfolge mit eigenen Voraussetzungen und gehoert nicht in eine
--      Zeile, die eine Praxis nebenbei anklickt.
--   2. **Erst ab Faelligkeit.** Vor dem Zahlungsziel gibt es nichts zu
--      erinnern; eine Erinnerung an eine nicht faellige Rechnung waere
--      schlicht falsch.
--   3. **Das Dokument haelt fest, was am Tag seiner Ausstellung galt.** Der
--      offene Betrag steht in der Zeile, nicht in einer Rechnung, die spaeter
--      ein anderes Ergebnis liefert. Ein Beleg, dessen Zahl sich nachtraeglich
--      aendert, ist keiner.
--   4. **Keine eigene Nummer.** Die Erinnerung hebt nichts auf und stellt
--      nichts in Rechnung; sie verweist auf die Rechnungsnummer. Eine Nummer
--      aus dem Rechnungskreis wuerde eine Forderung vortaeuschen, die schon
--      gestellt ist.
--
-- Eine **stornierte Rechnung** wird nicht angemahnt: Sie ist keine Forderung
-- mehr (ABR-003c).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Zahlungserinnerung
-- -----------------------------------------------------------------------------
create table public.invoice_payment_reminders (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  -- RESTRICT wie beim Stornodokument und bei der Zahlung: Ein Beleg, der
  -- still mit der Rechnung faellt, fehlt im Loeschjournal (ADR-008 Punkt 8).
  invoice_id        uuid not null references public.invoices (id) on delete restrict,
  reminder_on       date not null,
  due_on            date not null,
  outstanding_cents integer not null check (outstanding_cents > 0),
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  created_at        timestamptz not null default now(),
  created_by        uuid,
  constraint invoice_payment_reminders_due_after_reminder check (due_on > reminder_on)
);

comment on table public.invoice_payment_reminders is
  'Zahlungserinnerung zu einer ueberfaelligen Rechnung (ABR-003d, IDEA-PRX-012). Ein Dokument ohne Stufe, ohne Gebuehr und ohne eigene Nummer. Enthaelt ueber die Rechnung einen Patientenbezug, aber keine klinischen Angaben. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen dieser Migration (ADR-004).';
comment on column public.invoice_payment_reminders.outstanding_cents is
  'Der offene Betrag am Tag der Erinnerung, festgeschrieben (ANN-080). Nicht gerechnet: Ein Beleg, dessen Zahl sich nachtraeglich aendert, ist keiner. Der heutige Stand steht weiter an der Rechnung und wird dort gerechnet (ANN-078).';
comment on column public.invoice_payment_reminders.due_on is
  'Die neue Frist, die das Dokument setzt. Vierzehn Tage ab Ausstellung (ANN-080) - kein Rechtsanspruch, sondern die Frist, die auf dem Blatt steht.';

-- Zwei gleiche Erinnerungen an einem Tag sind ein Versehen, kein Vorgang.
create unique index invoice_payment_reminders_day_key
  on public.invoice_payment_reminders (invoice_id, reminder_on);
create index invoice_payment_reminders_org_idx
  on public.invoice_payment_reminders (organization_id, reminder_on desc, id desc);

revoke all on public.invoice_payment_reminders from anon, authenticated;
alter table public.invoice_payment_reminders enable row level security;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('invoice_payment_reminders', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Zahlungserinnerungen. Fallen mit ihrer Rechnung und vor ihr, weil sie mit RESTRICT auf sie zeigen.', 25);

-- -----------------------------------------------------------------------------
-- 2. Auch dieses Dokument ist unveraenderlich
-- -----------------------------------------------------------------------------
create or replace function app.invoice_payment_reminders_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a payment reminder cannot be changed' using errcode = '23514';
end;
$$;

comment on function app.invoice_payment_reminders_frozen() is
  'Haelt eine ausgestellte Zahlungserinnerung unveraenderlich (ABR-003d). Wer eine falsche Angabe verschickt hat, schreibt die naechste Erinnerung - eine Stufe entsteht dadurch nicht.';

create trigger invoice_payment_reminders_frozen
  before update on public.invoice_payment_reminders
  for each row execute function app.invoice_payment_reminders_frozen();


-- -----------------------------------------------------------------------------
-- 3. Auditkatalog (ADR-010)
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
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued',
    'invoice.cancelled',
    'invoice.reminder_created',
    'payment.recorded',
    'payment.voided'
  ));


-- -----------------------------------------------------------------------------
-- 4. Eine Zahlungserinnerung ausstellen
-- -----------------------------------------------------------------------------
create or replace function public.create_payment_reminder(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Die Frist der Erinnerung, an genau einer Stelle (**ANN-080**). Vierzehn
  -- Tage sind die Frist, die auf dem Blatt steht - keine Rechtsfolge und kein
  -- Verzugsbeginn. Wer sie aendert, aendert sie hier.
  c_frist_tage constant integer := 14;
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_offen    integer;
  v_id       uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  -- An einem Entwurf gibt es nichts zu erinnern: Er traegt keine Nummer und
  -- keine Forderung (ANN-075).
  if v_invoice.status <> 'issued' then
    raise exception 'a payment reminder belongs to an issued invoice' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'a cancelled invoice is not reminded' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Vor der Faelligkeit gibt es nichts zu erinnern.
  if v_invoice.due_on >= v_heute then
    raise exception 'this invoice is not overdue yet' using errcode = '23514';
  end if;

  -- Der offene Betrag kommt aus derselben Funktion wie jede andere Anzeige
  -- (ANN-078) - und wird hier festgeschrieben, weil er auf ein Blatt geht.
  v_offen := v_invoice.total_cents - app.invoice_paid_cents(p_invoice_id);

  if v_offen <= 0 then
    raise exception 'this invoice has nothing outstanding' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_payment_reminders r
    where r.invoice_id = p_invoice_id and r.reminder_on = v_heute
  ) then
    raise exception 'a payment reminder for this invoice was already written today'
      using errcode = '23505';
  end if;

  insert into public.invoice_payment_reminders (
    organization_id, invoice_id, reminder_on, due_on, outstanding_cents, currency, created_by
  )
  values (v_org, p_invoice_id, v_heute, v_heute + c_frist_tage, v_offen,
          v_invoice.currency, v_actor)
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.reminder_created', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_invoice.invoice_number,
                       'outstanding_cents', v_offen)
  );

  return v_id;
end;
$$;

comment on function public.create_payment_reminder(uuid) is
  'Stellt zu einer ueberfaelligen Rechnung eine Zahlungserinnerung aus und schreibt den offenen Betrag darin fest (ABR-003d, IDEA-PRX-012, ANN-080). Ohne Stufe, ohne Gebuehr, ohne eigene Nummer.';

revoke all on function public.create_payment_reminder(uuid) from public, anon;
grant execute on function public.create_payment_reminder(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Die Erinnerungen einer Rechnung
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_reminders(p_invoice_id uuid)
returns table (
  id                uuid,
  reminder_on       date,
  due_on            date,
  outstanding_cents integer,
  currency          text
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
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select r.id, r.reminder_on, r.due_on, r.outstanding_cents, r.currency
  from public.invoice_payment_reminders r
  where r.invoice_id = p_invoice_id
    and r.organization_id = v_org
  order by r.reminder_on desc, r.created_at desc;
end;
$$;

comment on function public.list_invoice_reminders(uuid) is
  'Die Zahlungserinnerungen einer Rechnung, die juengste zuerst (ABR-003d). Jede traegt ihren eigenen offenen Betrag - den vom Tag ihrer Ausstellung.';

revoke all on function public.list_invoice_reminders(uuid) from public, anon;
grant execute on function public.list_invoice_reminders(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Eine Zahlungserinnerung als Dokument
--
-- Liefert die Erinnerung samt dem Rechnungsdokument, aus dem das Blatt
-- Absender, Empfaenger und Rechnungsangaben nimmt. Eine zweite Abfrage auf
-- die Rechnung waere ein zweiter Weg zu denselben Angaben.
-- -----------------------------------------------------------------------------
create or replace function public.get_payment_reminder(p_reminder_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_reminder record;
  v_invoice  record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select r.* into v_reminder
  from public.invoice_payment_reminders r
  where r.id = p_reminder_id and r.organization_id = v_org;

  if not found then
    raise exception 'payment reminder not found' using errcode = '42501';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = v_reminder.invoice_id;

  return jsonb_build_object(
    'id', v_reminder.id,
    'invoice_id', v_reminder.invoice_id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'invoice_due_on', v_invoice.due_on,
    'reminder_on', v_reminder.reminder_on,
    'due_on', v_reminder.due_on,
    'outstanding_cents', v_reminder.outstanding_cents,
    'currency', v_reminder.currency,
    -- Der Snapshot der ausgestellten Rechnung: Absender, Empfaenger und
    -- Betrag, wie sie beim Ausstellen galten (ADR-009 Punkt 10).
    'document', v_invoice.snapshot
  );
end;
$$;

comment on function public.get_payment_reminder(uuid) is
  'Eine Zahlungserinnerung als Dokument, mit dem Snapshot ihrer Rechnung (ABR-003d, ADR-009 Punkt 10).';

revoke all on function public.get_payment_reminder(uuid) from public, anon;
grant execute on function public.get_payment_reminder(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Der Loeschlauf nimmt die Erinnerung mit
--
-- Unveraendert aus 20260919170000_invoice_cancellations.sql uebernommen bis
-- auf den einen neuen Block ganz vorn: Erinnerungen fallen vor den
-- Rechnungen, weil sie mit RESTRICT auf sie zeigen (ADR-008 Punkt 8).
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

  -- Neu mit ABR-003d: Zahlungserinnerungen zuerst. Auch sie zeigen mit
  -- RESTRICT auf die Rechnung.
  with geloescht as (
    delete from public.invoice_payment_reminders r
     where r.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_payment_reminders', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Mit ABR-003c: Stornodokumente vor den Rechnungen. Sie zeigen mit RESTRICT auf
  -- die Rechnung; faellt eines still mit ihr, fehlt seine Zeile im Journal.
  with geloescht as (
    delete from public.invoice_cancellations c
     where c.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning c.id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_cancellations', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Mit ABR-004: Zahlungen vor den Rechnungen. Sie zeigen mit RESTRICT auf die
  -- Rechnung, und ihre steuerliche Frist ist dieselbe - der Lauf haette die
  -- Akte sonst zurueckgehalten (ADR-008 Punkt 2).
  with geloescht as (
    delete from public.payments z
     where z.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning z.id, z.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'payments', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Rechnungszeilen: Sie zeigen mit RESTRICT auf die Leistung.
  with geloescht as (
    delete from public.invoice_items it
     where it.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning it.id, it.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_items', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoices i
     where i.patient_id = p_patient_id
    returning i.id, i.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoices', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

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
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-003d einschliesslich Zahlungserinnerungen, Stornodokumenten, Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger. Prueft KEINEN Legal Hold und KEINE steuerliche Frist - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8. Die Wiederanwendung kennt die Erinnerung
-- -----------------------------------------------------------------------------

create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-003d einschliesslich Zahlungserinnerungen, Stornodokumenten, Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger.';
