-- =============================================================================
-- ABR-000: Praxis-Stammdaten fuer Rechnungen
--
-- ADR-009 Punkt 10 verlangt, dass beim Ausstellen "alle rechnungsrelevanten
-- Stammdaten ... als historischer Snapshot gespeichert" werden. Damit es
-- ueberhaupt etwas zu snapshotten gibt, braucht die Praxis einen Absender:
-- Anschrift, Bankverbindung, Steuernummer und ihren umsatzsteuerlichen Status.
--
-- Diese Angaben wurden bewusst NICHT mit ABR-EPIC-001 gebaut: Verbraucht
-- werden sie erst von der Rechnung, und etwas vorzubauen, das niemand liest,
-- waere genau der Vorgriff, den ADR-014 ausschliesst. Jetzt liest sie jemand.
--
-- Drei Festlegungen tragen die Tabelle:
--
--   1. **Eine Zeile je Organisation**, deshalb ist `organization_id` der
--      Primaerschluessel. V1 wird fuer genau eine Organisation betrieben
--      (ADR-003); eine eigene Kennung waere ein zweiter Bezeichner fuer
--      denselben Sachverhalt.
--   2. **Pflichtangaben sind Pflichtspalten.** Ohne Absender, Steuernummer
--      und Bankverbindung ist eine Rechnung keine Rechnung; eine Zeile, die
--      halb gefuellt sein darf, verschoebe die Pruefung in den Schreibpfad und
--      damit hinter jeden zweiten Weg in die Tabelle.
--   3. **Der umsatzsteuerliche Status wird nicht geraten** (ANN-074): Die
--      Spalte `small_business` hat keinen Vorgabewert. Die Praxis muss sich
--      erklaeren, bevor sie eine Rechnung ausstellt - die Software erfindet
--      ihre steuerliche Einordnung nicht (ADR-009 Punkt 6, G13 offen).
--
-- Nicht hier: Rechnungen, Nummernkreise, Empfaenger und das PDF. Der Seed
-- traegt eine synthetische Praxisanschrift mit erfundener Steuernummer und
-- einer IBAN aus dem Dokumentationsbereich der Bundesbank.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer die Stammdaten liest und wer sie pflegt
--
-- Pflegen darf allein `owner`: Anschrift, Bank und Steuernummer sind
-- Praxiseinstellungen (PROJECT_PRINCIPLES.md 4.1) und stehen in derselben
-- Reihe wie die Preisbildung (ANN-071). Lesen darf zusaetzlich `office` - es
-- stellt Rechnungen aus und muss sehen, mit welchem Absender das geschieht
-- (4.3). Die therapeutischen Rollen brauchen sie nicht, Patientenkonten
-- ohnehin nicht (4.6).
-- -----------------------------------------------------------------------------
create or replace function app.can_read_billing_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

create or replace function app.can_manage_billing_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_read_billing_profile() is
  'Rollen, die die Praxis-Stammdaten fuer Rechnungen lesen duerfen (ABR-000, ANN-074): owner und office.';
comment on function app.can_manage_billing_profile() is
  'Rollen, die die Praxis-Stammdaten pflegen duerfen (ABR-000, ANN-074). Nur owner: Anschrift, Bank und Steuernummer sind Praxiseinstellung (PROJECT_PRINCIPLES.md 4.1).';

revoke all on function app.can_read_billing_profile()   from public, anon;
revoke all on function app.can_manage_billing_profile() from public, anon;
grant execute on function app.can_read_billing_profile()   to authenticated;
grant execute on function app.can_manage_billing_profile() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Stammdaten
--
-- `invoice_number_prefix` und `payment_term_days` stehen hier und nicht in
-- einer zweiten Einstellungstabelle: Beide gehoeren zum Absender, beide gehen
-- in denselben Snapshot, und beide aendert dieselbe Person an derselben
-- Stelle. Das Format der Nummer selbst steht in `app.next_invoice_number`
-- (ANN-075) - hier steht nur das Kuerzel, das die Praxis waehlen darf.
-- -----------------------------------------------------------------------------
create table public.practice_billing_profiles (
  organization_id       uuid primary key references public.organizations (id) on delete restrict,
  legal_name            text not null check (length(btrim(legal_name)) between 1 and 200),
  street                text not null check (length(btrim(street)) between 1 and 120),
  house_number          text check (house_number is null or length(btrim(house_number)) between 1 and 20),
  postal_code           text not null check (length(btrim(postal_code)) between 2 and 12),
  city                  text not null check (length(btrim(city)) between 1 and 120),
  phone                 text check (phone is null or length(btrim(phone)) between 3 and 40),
  email                 text check (email is null
                                     or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  tax_number            text not null check (length(btrim(tax_number)) between 3 and 40),
  vat_id                text check (vat_id is null or length(btrim(vat_id)) between 3 and 20),
  small_business        boolean not null,
  bank_name             text check (bank_name is null or length(btrim(bank_name)) between 1 and 120),
  account_holder        text check (account_holder is null
                                    or length(btrim(account_holder)) between 1 and 200),
  iban                  text not null check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic                   text check (bic is null or bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  invoice_number_prefix text not null default 'RG'
                          check (invoice_number_prefix ~ '^[A-Z0-9-]{1,10}$'),
  payment_term_days     smallint not null default 14 check (payment_term_days between 0 and 90),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

comment on table public.practice_billing_profiles is
  'Praxis-Stammdaten fuer Rechnungen (ABR-000, ADR-009 Punkt 10): Absender, Bankverbindung, Steuernummer und umsatzsteuerlicher Status. Enthaelt KEINE Patientendaten. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Lesbar fuer owner und office; geschrieben ausschliesslich ueber save_practice_billing_profile.';
comment on column public.practice_billing_profiles.small_business is
  'Kleinunternehmerregelung nach Par. 19 UStG: true heisst, die Rechnung weist keine Umsatzsteuer aus und traegt den Hinweis. Ohne Vorgabewert - die Software raet den steuerlichen Status nicht (ANN-074, G13 offen).';
comment on column public.practice_billing_profiles.invoice_number_prefix is
  'Kuerzel vor der Rechnungsnummer. Das Format der Nummer selbst legt app.next_invoice_number fest (ANN-075); hier steht nur, was die Praxis daran waehlen darf.';
comment on column public.practice_billing_profiles.payment_term_days is
  'Zahlungsziel in Tagen ab Ausstellung. Geht in den Snapshot und bestimmt das Faelligkeitsdatum der ausgestellten Rechnung (ADR-009 Punkt 10). Mahnwesen und Ueberfaelligkeit entscheidet ABR-EPIC-003, nicht diese Spalte.';
comment on column public.practice_billing_profiles.iban is
  'Bankverbindung der Praxis. Im Seed eine synthetische IBAN; echte Kontodaten traegt allein die Praxis in ihrer eigenen Umgebung ein.';

revoke all on public.practice_billing_profiles from anon, authenticated;
alter table public.practice_billing_profiles enable row level security;

-- Ihre Zeile im Retention Schedule entsteht mit der Tabelle, nicht spaeter:
-- ADR-008 nennt eine Tabelle ohne Fristzuordnung einen Mangel, und ein
-- Datenbanktest haelt beides deckungsgleich.
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('practice_billing_profiles', 'abrechnungsdaten', 'keine',
   'Praxis-Stammdaten fuer Rechnungen. Kein Personenbezug zu Patientinnen; sie gehoeren zur Praxis und fallen mit ihr.', 18);

-- Kein Patientenbezug, deshalb wie die Preisliste: direkt lesbar, die Policy
-- entscheidet (ADR-004). Geschrieben wird nur ueber die Funktion.
create policy practice_billing_profiles_select_staff
  on public.practice_billing_profiles for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_billing_profile()
  );

grant select on public.practice_billing_profiles to authenticated;

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
    'billable_service.removed'
  ));

-- -----------------------------------------------------------------------------
-- 4. Pflegen
--
-- Eine Funktion fuer Anlegen und Aendern: Es gibt genau eine Zeile je
-- Organisation, und "gibt es sie schon" ist keine Frage, die die Oberflaeche
-- beantworten muss. Was leer bleiben darf, kommt als null herein; was nicht
-- leer bleiben darf, weist die Tabelle ab.
-- -----------------------------------------------------------------------------
create or replace function public.save_practice_billing_profile(
  p_legal_name            text,
  p_street                text,
  p_house_number          text,
  p_postal_code           text,
  p_city                  text,
  p_phone                 text,
  p_email                 text,
  p_tax_number            text,
  p_vat_id                text,
  p_small_business        boolean,
  p_bank_name             text,
  p_account_holder        text,
  p_iban                  text,
  p_bic                   text,
  p_invoice_number_prefix text,
  p_payment_term_days     smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_neu   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_billing_profile() then
    raise exception 'not allowed to manage the billing profile' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_small_business is null then
    raise exception 'the vat status must be stated explicitly' using errcode = '22023';
  end if;

  v_neu := not exists (
    select 1 from public.practice_billing_profiles where organization_id = v_org
  );

  insert into public.practice_billing_profiles as b (
    organization_id, legal_name, street, house_number, postal_code, city,
    phone, email, tax_number, vat_id, small_business,
    bank_name, account_holder, iban, bic,
    invoice_number_prefix, payment_term_days, created_by, updated_by
  )
  values (
    v_org,
    btrim(p_legal_name), btrim(p_street), nullif(btrim(p_house_number), ''),
    btrim(p_postal_code), btrim(p_city),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    btrim(p_tax_number), nullif(btrim(p_vat_id), ''), p_small_business,
    nullif(btrim(p_bank_name), ''), nullif(btrim(p_account_holder), ''),
    -- Die IBAN steht auf dem Papier mit Leerzeichen und in der Datenbank ohne.
    upper(replace(btrim(p_iban), ' ', '')),
    upper(nullif(btrim(p_bic), '')),
    coalesce(upper(nullif(btrim(p_invoice_number_prefix), '')), 'RG'),
    coalesce(p_payment_term_days, 14::smallint),
    v_actor, v_actor
  )
  on conflict (organization_id) do update set
    legal_name            = excluded.legal_name,
    street                = excluded.street,
    house_number          = excluded.house_number,
    postal_code           = excluded.postal_code,
    city                  = excluded.city,
    phone                 = excluded.phone,
    email                 = excluded.email,
    tax_number            = excluded.tax_number,
    vat_id                = excluded.vat_id,
    small_business        = excluded.small_business,
    bank_name             = excluded.bank_name,
    account_holder        = excluded.account_holder,
    iban                  = excluded.iban,
    bic                   = excluded.bic,
    invoice_number_prefix = excluded.invoice_number_prefix,
    payment_term_days     = excluded.payment_term_days,
    updated_at            = now(),
    updated_by            = v_actor
  where b.organization_id = v_org;

  -- Kein Inhalt im Kontext: Eine Steuernummer gehoert nicht ins Auditlog
  -- (ADR-011). Was sich geaendert hat, steht in der Zeile selbst.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.billing_profile_changed', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web', 'created', v_neu)
  );
end;
$$;

comment on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint) is
  'Legt die Praxis-Stammdaten fuer Rechnungen an oder aendert sie (ABR-000). Nur owner (ANN-074). Protokolliert organization.billing_profile_changed ohne Inhalte (ADR-011).';

revoke all on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint)
  from public, anon;
grant execute on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint)
  to authenticated;
