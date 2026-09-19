-- =============================================================================
-- ABR-003: Die Rechnung entsteht aus Leistungen
--
-- ADR-009 trennt zwei Lebenszyklen (Punkt 3): Eine Leistung entsteht am
-- Termin, eine Rechnung entsteht spaeter und fasst mehrere Leistungen
-- zusammen. ABR-EPIC-001 hat die erste Haelfte gebaut, hier kommt die zweite.
--
-- Fuenf Festlegungen tragen sie:
--
--   1. **Zwei Zustaende, nicht sieben.** ADR-009 Punkt 7 nennt sieben; gebaut
--      werden hier `draft` und `issued`. `sent`, `partially_paid`, `paid`,
--      `overdue` und `cancelled` haengen an Versand, Zahlungen und Storno -
--      und die baut ABR-EPIC-002b beziehungsweise -003. Einen Wertebereich
--      vorzubauen, den niemand schreiben kann, waere der Vorgriff aus ADR-014.
--   2. **Die Nummer entsteht beim Ausstellen** (Punkt 8), lueckenlos, je
--      Organisation und Kalenderjahr, und sie wird nie wiederverwendet. Die
--      Vergabe sitzt in einer eigenen Zeile mit `for update` - unter
--      gleichzeitigen Zugriffen bekommt genau einer die naechste Nummer
--      (ANN-075).
--   3. **Ausgestellt ist unveraenderlich** (Punkt 9). Der Trigger sperrt jede
--      spaetere Aenderung an der Zeile; die Korrektur laeuft ueber Storno und
--      Neuausstellung, und die baut ABR-EPIC-002b.
--   4. **Der Snapshot ist ein Dokument, kein Spaltensatz** (Punkt 10). Er
--      steht als `jsonb` mit eigener `schema_version` in der Zeile und
--      ueberlebt damit jede spaetere Schemaaenderung - genau die offene
--      Folgefrage aus ADR-009. Gebaut wird er von derselben Funktion, die
--      auch die Entwurfsansicht liefert: ein Dokument, eine Implementierung.
--   5. **Sammelrechnung je Person und Monat.** Ein Entwurf nimmt alle noch
--      nicht abgerechneten Leistungen einer Patientin aus einem Kalendermonat
--      auf; je Person und Monat gibt es hoechstens einen (ANN-077).
--
-- Was NICHT im Snapshot steht: Diagnose, Therapieziel, Verordnerhinweis - kurz
-- jeder klinische Inhalt der Behandlungsgrundlage. Die Rechnung geht regelmaessig
-- an Dritte (Beihilfestelle, Versicherung, Eltern); der Verordnungsbezug steht
-- deshalb als Bauart, Ausstellungsdatum und Verordner:in da und nicht mit
-- Diagnose (PROJECT_PRINCIPLES.md 4.4, ADR-004 Fassung 2, Datensparsamkeit).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Nummernkreis
--
-- Eine Zeile je Organisation und Jahr mit der naechsten freien Nummer. Kein
-- `sequence`: Eine Sequenz ist transaktionsfrei und laesst bei jedem
-- Fehlschlag eine Luecke - und "lueckenlos" ist bei Rechnungsnummern keine
-- Schoenheitsfrage, sondern die Erwartung jeder Betriebspruefung.
-- -----------------------------------------------------------------------------
create table public.invoice_number_series (
  -- Der Schluessel ist eine UUID wie ueberall (ADR-014); die fachliche
  -- Eindeutigkeit steht daneben als Unique. Zwei Zeilen fuer dasselbe Jahr
  -- haetten zwei laufende Nummern zur Folge - genau das darf es nicht geben.
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  year            smallint not null check (year between 2020 and 2200),
  next_number     integer not null default 1 check (next_number >= 1),
  unique (organization_id, year)
);

comment on table public.invoice_number_series is
  'Naechste freie Rechnungsnummer je Organisation und Kalenderjahr (ABR-003, ADR-009 Punkt 8, ANN-075). Kein Personenbezug. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht: erreichbar nur ueber app.next_invoice_number.';

revoke all on public.invoice_number_series from anon, authenticated;
alter table public.invoice_number_series enable row level security;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('invoice_number_series', 'abrechnungsdaten', 'keine',
   'Nummernkreis. Kein Personenbezug; er ist der Nachweis, dass keine Nummer zweimal vergeben wurde (ADR-009 Punkt 8).', 22);

-- -----------------------------------------------------------------------------
-- 2. Die Rechnung
-- -----------------------------------------------------------------------------
create table public.invoices (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  patient_id       uuid not null references public.patients (id) on delete restrict,
  recipient_id     uuid references public.invoice_recipients (id) on delete restrict,
  status           text not null default 'draft' check (status in ('draft', 'issued')),
  period_month     date not null,
  invoice_number   text check (invoice_number is null
                               or length(btrim(invoice_number)) between 3 and 40),
  issued_on        date,
  issued_at        timestamptz,
  issued_by        uuid,
  due_on           date,
  total_cents      integer check (total_cents is null or total_cents >= 0),
  tax_total_cents  integer check (tax_total_cents is null or tax_total_cents >= 0),
  currency         text check (currency is null or currency ~ '^[A-Z]{3}$'),
  snapshot         jsonb,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  -- Ein Entwurf traegt nichts von alldem, eine ausgestellte Rechnung alles.
  -- Die Constraint macht aus dem Zustand eine pruefbare Aussage statt einer
  -- Absichtserklaerung (PROJECT_PRINCIPLES.md 13).
  constraint invoices_issued_is_complete check (
    case status
      when 'draft'  then invoice_number is null and issued_on is null and snapshot is null
      when 'issued' then invoice_number is not null and issued_on is not null
                         and due_on is not null and snapshot is not null
                         and total_cents is not null and tax_total_cents is not null
                         and currency is not null
    end
  ),
  constraint invoices_period_is_month check (period_month = date_trunc('month', period_month))
);

comment on table public.invoices is
  'Privatrechnung aus erfassten Leistungen (ABR-003, ADR-009). Enthaelt einen Patientenbezug und im Snapshot Leistungsdaten. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen dieser Migration (ADR-004).';
comment on column public.invoices.recipient_id is
  'Der Empfaenger dieser Rechnung. null heisst: die Patientin selbst (ANN-076). Nach dem Ausstellen steht der Empfaenger ohnehin im Snapshot; die Spalte bleibt als Verweis auf die Stammdaten.';
comment on column public.invoices.period_month is
  'Erster Tag des Kalendermonats, dessen Leistungen diese Rechnung zusammenfasst (ANN-077). Je Patientin und Monat hoechstens ein Entwurf.';
comment on column public.invoices.invoice_number is
  'Wird erst beim Ausstellen vergeben (ADR-009 Punkt 8). Eindeutig je Organisation, lueckenlos je Kalenderjahr, nie wiederverwendet (ANN-075).';
comment on column public.invoices.snapshot is
  'Das ausgestellte Dokument mit allen rechnungsrelevanten Stamm-, Leistungs-, Preis- und Steuerangaben (ADR-009 Punkt 10). Traegt eine eigene schema_version und ist damit von spaeteren Schemaaenderungen unabhaengig - die offene Folgefrage des ADR. Enthaelt KEINE klinischen Inhalte.';
comment on column public.invoices.total_cents is
  'Rechnungsbetrag in ganzen Cent (ADR-014). Der Katalogpreis ist der Endpreis; eine enthaltene Umsatzsteuer wird herausgerechnet und getrennt ausgewiesen (ANN-074).';

-- Eine Nummer gibt es genau einmal (ADR-009 Punkt 8).
create unique index invoices_number_key
  on public.invoices (organization_id, invoice_number)
  where invoice_number is not null;

-- Je Patientin und Monat hoechstens ein Entwurf. Ausgestellte Rechnungen
-- zaehlen nicht mit: Eine nachgereichte Leistung ergibt eine zweite Rechnung
-- fuer denselben Monat, und das ist richtig so.
create unique index invoices_draft_period_key
  on public.invoices (patient_id, period_month)
  where status = 'draft';

create index invoices_org_idx on public.invoices (organization_id, period_month desc, id desc);
create index invoices_patient_idx on public.invoices (organization_id, patient_id);
create index invoices_recipient_idx on public.invoices (recipient_id);

revoke all on public.invoices from anon, authenticated;
alter table public.invoices enable row level security;

-- Aufbewahrung (ADR-008): Abrechnungsdaten, acht Jahre ab Ende des
-- Kalenderjahres. Der Loeschschritt und die Sperre, die eine Akte mit
-- laufender Rechnungsfrist zurueckhaelt, stehen in der Folgemigration.
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('invoices', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Rechnungen. Fallen mit der Patientenakte, aber fruehestens nach Ablauf ihrer eigenen steuerlichen Frist - der Lauf haelt die Akte so lange zurueck (ADR-008 Punkt 2).', 20);

-- -----------------------------------------------------------------------------
-- 3. Die Rechnungszeile
--
-- Sie traegt keinen Preis: Solange die Rechnung Entwurf ist, steht er an der
-- Katalogposition, und die ist unveraenderlich (ABR-001). Mit dem Ausstellen
-- wandert er in den Snapshot. Eine dritte Kopie waere ein dritter Wert fuer
-- denselben Sachverhalt.
-- -----------------------------------------------------------------------------
create table public.invoice_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  billable_service_id uuid not null references public.billable_services (id) on delete restrict,
  sort_order          smallint not null check (sort_order between 1 and 500)
);

comment on table public.invoice_items is
  'Zuordnung einer erfassten Leistung zu einer Rechnung (ABR-003). Haelt die Invariante gegen Doppelabrechnung: eine Leistung steht auf hoechstens einer Rechnung (ADR-009 Punkt 4). Datenklasse: Abrechnungsdaten (ADR-008).';

-- ADR-009 Punkt 4, PROJECT_PRINCIPLES.md 13: Eine Leistung darf nicht
-- unbeabsichtigt mehrfach abgerechnet werden. Das ist hier keine Sorgfalts-,
-- sondern eine Datenbankfrage.
create unique index invoice_items_service_key on public.invoice_items (billable_service_id);
create unique index invoice_items_sort_key on public.invoice_items (invoice_id, sort_order);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

revoke all on public.invoice_items from anon, authenticated;
alter table public.invoice_items enable row level security;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('invoice_items', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Zeilen einer Rechnung. Fallen mit ihrer Rechnung und vor den Leistungen, auf die sie mit RESTRICT zeigen.', 21);

-- -----------------------------------------------------------------------------
-- 4. Ausgestellt heisst unveraenderlich (ADR-009 Punkt 9)
--
-- Die Sperre sitzt am Trigger und nicht im Schreibpfad, damit sie fuer JEDEN
-- Weg in die Tabelle gilt - dieselbe Bauart wie bei der veroeffentlichten
-- Preisliste (ANN-070).
--
-- Sie greift beim **Aendern**, nicht beim Loeschen, und das mit Absicht: Nach
-- Ablauf der steuerlichen Frist muss der Loeschlauf die Zeile abraeumen
-- koennen (ADR-008), und ein Trigger, der das verhindert, liesse den ganzen
-- Lauf scheitern. Wer loeschen darf, entscheiden die Funktionen: Die Tabelle
-- traegt kein einziges Tabellenrecht (`revoke all`, keine Policy), erreichbar
-- ist sie nur ueber `delete_invoice_draft` - das eine ausgestellte Rechnung
-- abweist - und ueber den Loeschlauf.
-- -----------------------------------------------------------------------------
create or replace function app.invoices_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'issued' then
    raise exception 'an issued invoice cannot be changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.invoices_frozen() is
  'Haelt eine ausgestellte Rechnung unveraenderlich (ADR-009 Punkt 9). Korrekturen laufen ueber Storno und Neuausstellung (ABR-EPIC-002b). Das Loeschen bleibt dem Loeschlauf moeglich (ADR-008).';

create trigger invoices_frozen
  before update on public.invoices
  for each row execute function app.invoices_frozen();

create or replace function app.invoice_items_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select i.status into v_status
  from public.invoices i
  where i.id = new.invoice_id;

  if v_status = 'issued' then
    raise exception 'the items of an issued invoice cannot be changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.invoice_items_frozen() is
  'Haelt die Zeilen einer ausgestellten Rechnung unveraenderlich (ADR-009 Punkt 9). Wie bei der Rechnung selbst bleibt das Loeschen dem Loeschlauf moeglich (ADR-008).';

create trigger invoice_items_frozen
  before insert or update on public.invoice_items
  for each row execute function app.invoice_items_frozen();

-- -----------------------------------------------------------------------------
-- 5. Auditkatalog (ADR-010)
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
    'invoice_recipient',
    'invoice'
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
    'invoice_recipient.deleted',
    'invoice.draft_created',
    'invoice.draft_deleted',
    'invoice.recipient_changed',
    'invoice.issued'
  ));

-- -----------------------------------------------------------------------------
-- 6. Die naechste Nummer
--
-- `insert ... on conflict do update ... returning` ist hier atomar: Der
-- Konfliktpfad sperrt die Zeile, und zwei gleichzeitige Ausstellungen
-- bekommen nacheinander zwei verschiedene Nummern. Das Format steht an genau
-- dieser Stelle (ANN-075).
-- -----------------------------------------------------------------------------
create or replace function app.next_invoice_number(
  p_organization_id uuid,
  p_year            smallint,
  p_prefix          text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  -- Beide Wege liefern dieselbe Aussage: `next_number` steht nach der
  -- Anweisung auf der naechsten freien Nummer, vergeben wird die davor.
  insert into public.invoice_number_series as s (organization_id, year, next_number)
  values (p_organization_id, p_year, 2)
  on conflict (organization_id, year) do update
    set next_number = s.next_number + 1
  returning s.next_number - 1 into v_number;

  -- Kuerzel, Jahr, vierstellige laufende Nummer: "RG-2026-0001". Vierstellig,
  -- weil eine Praxis dieser Groesse im Jahr keine zehntausend Rechnungen
  -- schreibt - und laenger wird die Nummer trotzdem, wenn doch.
  return p_prefix || '-' || p_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

comment on function app.next_invoice_number(uuid, smallint, text) is
  'Vergibt die naechste Rechnungsnummer eines Kalenderjahres, lueckenlos und unter gleichzeitigen Zugriffen eindeutig (ADR-009 Punkt 8, ANN-075). Format: Kuerzel-Jahr-vierstellig.';

revoke all on function app.next_invoice_number(uuid, smallint, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Das Rechnungsdokument
--
-- Eine Funktion fuer beides: die Ansicht eines Entwurfs und den Snapshot beim
-- Ausstellen. Zwei Implementierungen desselben Dokuments wuerden frueher oder
-- spaeter auseinanderlaufen, und die Abweichung faende niemand - der Entwurf
-- saehe anders aus als das, was die Praxis verschickt hat.
--
-- Der Preis der Katalogposition ist der **Endpreis**. Eine enthaltene
-- Umsatzsteuer wird daraus herausgerechnet und je Steuersatz getrennt
-- ausgewiesen; unter der Kleinunternehmerregelung entfaellt der Ausweis und
-- die Rechnung traegt den Hinweis nach Par. 19 UStG (ANN-074).
-- -----------------------------------------------------------------------------
create or replace function app.build_invoice_document(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice   record;
  v_profile   record;
  v_items     jsonb;
  v_gruppen   jsonb;
  v_basen     jsonb;
  v_empfaenger jsonb;
  v_patient   jsonb;
  v_summe     integer;
  v_steuer    integer;
  v_waehrung  text;
  v_anzahl    integer;
begin
  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select b.* into v_profile
  from public.practice_billing_profiles b
  where b.organization_id = v_invoice.organization_id;

  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Die Zeilen. Preis, Bezeichnung und Steuerkennzeichen kommen aus der
  -- Katalogposition - sie ist unveraenderlich, solange ihre Preisliste in
  -- Kraft ist (ABR-001).
  select jsonb_agg(z.zeile order by z.sort_order),
         sum(z.brutto)::integer,
         count(*)::integer,
         max(z.currency)
    into v_items, v_summe, v_anzahl, v_waehrung
  from (
    select it.sort_order,
           c.currency,
           (b.quantity * c.unit_price_cents) as brutto,
           jsonb_build_object(
             'performed_on',      b.performed_on,
             'code',              c.code,
             'label',             c.label,
             'item_kind',         c.item_kind,
             'quantity',          b.quantity,
             'unit_price_cents',  c.unit_price_cents,
             'line_total_cents',  b.quantity * c.unit_price_cents,
             'currency',          c.currency,
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille
           ) as zeile
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
  ) z;

  if v_anzahl is null or v_anzahl = 0 then
    raise exception 'invoice has no items' using errcode = '22023';
  end if;

  if (select count(distinct c.currency)
        from public.invoice_items it
        join public.billable_services b     on b.id = it.billable_service_id
        join public.service_catalog_items c on c.id = b.catalog_item_id
       where it.invoice_id = p_invoice_id) > 1 then
    raise exception 'an invoice cannot mix currencies' using errcode = '22023';
  end if;

  -- Steuergruppen: je Kennzeichen und Satz der Bruttobetrag, die darin
  -- enthaltene Steuer und der Nettobetrag. Unter der Kleinunternehmerregelung
  -- ist die enthaltene Steuer null - auch bei einer steuerpflichtigen
  -- Position (Par. 19 UStG).
  select jsonb_agg(g.gruppe order by g.tax_treatment, g.tax_rate_permille),
         sum(g.steuer)::integer
    into v_gruppen, v_steuer
  from (
    select c.tax_treatment,
           c.tax_rate_permille,
           sum(b.quantity * c.unit_price_cents)::integer as brutto,
           case
             when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
             else round(sum(b.quantity * c.unit_price_cents)::numeric
                        * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
           end as steuer,
           jsonb_build_object(
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             'gross_cents',       sum(b.quantity * c.unit_price_cents)::integer,
             'tax_cents',
               case
                 when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                 else round(sum(b.quantity * c.unit_price_cents)::numeric
                            * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
               end,
             'net_cents',
               sum(b.quantity * c.unit_price_cents)::integer
               - case
                   when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                   else round(sum(b.quantity * c.unit_price_cents)::numeric
                              * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
                 end
           ) as gruppe
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
    group by c.tax_treatment, c.tax_rate_permille
  ) g;

  -- Verordnungsbezug: Bauart, Ausstellungsdatum, Verordner:in. Ausdruecklich
  -- ohne Diagnose, Therapieziel und Verordnerhinweis - die Rechnung geht an
  -- Dritte (ADR-004 Fassung 2, Datensparsamkeit).
  select jsonb_agg(v.eintrag order by v.issued_on)
    into v_basen
  from (
    select distinct tb.issued_on,
           jsonb_build_object(
             'kind',       tb.treatment_basis_kind,
             'issued_on',  tb.issued_on,
             'prescriber',
               case when pr.id is null then null
                    else btrim(coalesce(pr.title || ' ', '') || pr.given_name || ' ' || pr.family_name)
               end
           ) as eintrag
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    join public.appointments a      on a.id = b.appointment_id
    join public.treatment_bases tb  on tb.id = a.treatment_basis_id
    left join public.prescribers pr on pr.id = tb.prescriber_id
    where it.invoice_id = p_invoice_id
  ) v;

  -- Empfaenger: die hinterlegte Zeile oder, wenn keine gewaehlt ist, die
  -- Patientin selbst (ANN-076).
  if v_invoice.recipient_id is null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       pc.street,
             'house_number', pc.house_number,
             'postal_code',  pc.postal_code,
             'city',         pc.city,
             'reference',    null
           )
      into v_empfaenger
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.id = v_invoice.patient_id;
  else
    select jsonb_build_object(
             'kind',         r.recipient_kind,
             'name',         r.name,
             'street',       r.street,
             'house_number', r.house_number,
             'postal_code',  r.postal_code,
             'city',         r.city,
             'reference',    r.reference
           )
      into v_empfaenger
    from public.invoice_recipients r
    where r.id = v_invoice.recipient_id;
  end if;

  -- Die behandelte Person steht auch dann auf der Rechnung, wenn jemand
  -- anderes sie bezahlt - sonst liesse sich die Leistung nicht zuordnen.
  select jsonb_build_object(
           'name',          pe.given_name || ' ' || pe.family_name,
           'date_of_birth', pc.date_of_birth
         )
    into v_patient
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details pc on pc.patient_id = p.id
  where p.id = v_invoice.patient_id;

  return jsonb_build_object(
    'schema_version', 1,
    'period_month', v_invoice.period_month,
    'currency', v_waehrung,
    'issuer', jsonb_build_object(
      'legal_name',        v_profile.legal_name,
      'street',            v_profile.street,
      'house_number',      v_profile.house_number,
      'postal_code',       v_profile.postal_code,
      'city',              v_profile.city,
      'phone',             v_profile.phone,
      'email',             v_profile.email,
      'tax_number',        v_profile.tax_number,
      'vat_id',            v_profile.vat_id,
      'small_business',    v_profile.small_business,
      'bank_name',         v_profile.bank_name,
      'account_holder',    v_profile.account_holder,
      'iban',              v_profile.iban,
      'bic',               v_profile.bic,
      'payment_term_days', v_profile.payment_term_days
    ),
    'recipient', v_empfaenger,
    'patient', v_patient,
    'treatment_bases', coalesce(v_basen, '[]'::jsonb),
    'items', v_items,
    'tax_groups', coalesce(v_gruppen, '[]'::jsonb),
    'totals', jsonb_build_object(
      'total_cents', v_summe,
      'tax_total_cents', coalesce(v_steuer, 0)
    )
  );
end;
$$;

comment on function app.build_invoice_document(uuid) is
  'Baut das Rechnungsdokument aus Stammdaten, Empfaenger, Leistungen und Steuergruppen (ABR-003, ADR-009 Punkt 10). Dieselbe Funktion liefert die Entwurfsansicht und den Snapshot beim Ausstellen - ein Dokument, eine Implementierung. Ohne klinische Inhalte.';

revoke all on function app.build_invoice_document(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Was abzurechnen waere
--
-- Die Arbeitsliste des Bereichs: erfasste Leistungen, die auf keiner Rechnung
-- stehen, gebuendelt nach Person und Kalendermonat (ANN-077).
-- -----------------------------------------------------------------------------
create or replace function public.list_invoice_candidates(p_limit integer default 100)
returns table (
  patient_id    uuid,
  patient_name  text,
  period_month  date,
  service_count integer,
  total_cents   integer,
  currency      text,
  has_draft     boolean
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
  select b.patient_id,
         max(pe.given_name || ' ' || pe.family_name),
         date_trunc('month', b.performed_on)::date,
         count(*)::integer,
         sum(b.quantity * c.unit_price_cents)::integer,
         max(c.currency),
         bool_or(exists (
           select 1 from public.invoices i
           where i.patient_id = b.patient_id
             and i.period_month = date_trunc('month', b.performed_on)::date
             and i.status = 'draft'
         ))
  from public.billable_services b
  join public.service_catalog_items c on c.id = b.catalog_item_id
  join public.patients p  on p.id = b.patient_id
  join public.persons  pe on pe.id = p.person_id
  where b.organization_id = v_org
    and b.status = 'billable'
    and not exists (
      select 1 from public.invoice_items it where it.billable_service_id = b.id
    )
  group by b.patient_id, date_trunc('month', b.performed_on)::date
  order by date_trunc('month', b.performed_on)::date desc, max(pe.family_name)
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_invoice_candidates(integer) is
  'Erfasste Leistungen ohne Rechnung, gebuendelt nach Person und Kalendermonat (ABR-003, ANN-077). Die Arbeitsliste des Rechnungsbereichs.';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Rechnungen lesen
-- -----------------------------------------------------------------------------
create or replace function public.list_invoices(p_limit integer default 100)
returns table (
  id             uuid,
  status         text,
  invoice_number text,
  period_month   date,
  issued_on      date,
  due_on         date,
  patient_id     uuid,
  patient_name   text,
  recipient_name text,
  recipient_kind text,
  total_cents    integer,
  currency       text,
  item_count     integer
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
  select i.id, i.status, i.invoice_number, i.period_month, i.issued_on, i.due_on,
         i.patient_id,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         coalesce(r.recipient_kind, 'self'),
         -- Der Entwurf rechnet live, die ausgestellte Rechnung zeigt ihren
         -- festgeschriebenen Betrag (ADR-009 Punkt 10).
         coalesce(i.total_cents, summe.brutto)::integer,
         coalesce(i.currency, summe.currency),
         summe.anzahl::integer
  from public.invoices i
  join public.patients p  on p.id = i.patient_id
  join public.persons  pe on pe.id = p.person_id
  left join public.invoice_recipients r on r.id = i.recipient_id
  left join lateral (
    select sum(b.quantity * c.unit_price_cents) as brutto,
           max(c.currency) as currency,
           count(*) as anzahl
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = i.id
  ) summe on true
  where i.organization_id = v_org
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_invoices(integer) is
  'Rechnungen der Praxis mit Zustand, Nummer, Empfaenger und Betrag (ABR-003). Ein Entwurf rechnet live, eine ausgestellte Rechnung zeigt ihren festgeschriebenen Betrag.';

revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;

create or replace function public.get_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_invoice record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  -- Die ausgestellte Rechnung zeigt ihren Snapshot und nicht die heutigen
  -- Stammdaten: Genau dafuer gibt es ihn (ADR-009 Punkt 10).
  return jsonb_build_object(
    'id', v_invoice.id,
    'status', v_invoice.status,
    'patient_id', v_invoice.patient_id,
    'recipient_id', v_invoice.recipient_id,
    'invoice_number', v_invoice.invoice_number,
    'issued_on', v_invoice.issued_on,
    'due_on', v_invoice.due_on,
    'document', coalesce(v_invoice.snapshot, app.build_invoice_document(p_invoice_id))
  );
end;
$$;

comment on function public.get_invoice(uuid) is
  'Eine Rechnung als Dokument (ABR-003). Ein Entwurf wird aus den heutigen Stammdaten gebaut, eine ausgestellte Rechnung kommt aus ihrem Snapshot (ADR-009 Punkt 10).';

revoke all on function public.get_invoice(uuid) from public, anon;
grant execute on function public.get_invoice(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Einen Entwurf anlegen
--
-- Alles oder nichts: Der Entwurf nimmt alle noch nicht abgerechneten
-- Leistungen der Patientin aus diesem Kalendermonat auf. Eine Auswahl
-- einzelner Zeilen waere die Gelegenheit, eine Leistung zu uebersehen - und
-- genau das schliesst ADR-009 Punkt 4 aus.
-- -----------------------------------------------------------------------------
create or replace function public.create_invoice_draft(
  p_patient_id   uuid,
  p_period_month date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_monat   date;
  v_id      uuid;
  v_empf    uuid;
  v_anzahl  integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  v_monat := date_trunc('month', p_period_month)::date;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Die Vorgabe aus den Stammdaten; ohne sie geht die Rechnung an die
  -- Patientin selbst (ANN-076).
  select r.id into v_empf
  from public.invoice_recipients r
  where r.patient_id = p_patient_id and r.is_default;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, created_by
  )
  values (v_org, p_patient_id, v_empf, v_monat, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it where it.billable_service_id = b.id
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient and month' using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id,
                       'period_month', v_monat, 'item_count', v_anzahl)
  );

  return v_id;
end;
$$;

comment on function public.create_invoice_draft(uuid, date) is
  'Legt den Rechnungsentwurf einer Patientin fuer einen Kalendermonat an und nimmt alle noch nicht abgerechneten Leistungen dieses Monats auf (ABR-003, ANN-077). Je Patientin und Monat hoechstens ein Entwurf.';

revoke all on function public.create_invoice_draft(uuid, date) from public, anon;
grant execute on function public.create_invoice_draft(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Einen Entwurf verwerfen und seinen Empfaenger waehlen
--
-- Ein Entwurf traegt keine Nummer und laesst sich deshalb folgenlos verwerfen
-- (ADR-009, Konsequenz zu Punkt 8). Die Leistungen darauf werden dabei wieder
-- frei - sie waren nie abgerechnet.
-- -----------------------------------------------------------------------------
create or replace function public.delete_invoice_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_status text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.status into v_status
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_status <> 'draft' then
    raise exception 'an issued invoice cannot be deleted' using errcode = '23514';
  end if;

  delete from public.invoices where id = p_invoice_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_deleted', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.delete_invoice_draft(uuid) is
  'Verwirft einen Rechnungsentwurf und gibt seine Leistungen wieder frei (ABR-003). Eine ausgestellte Rechnung wird nicht geloescht, sondern storniert (ADR-009 Punkt 9, ABR-EPIC-002b).';

revoke all on function public.delete_invoice_draft(uuid) from public, anon;
grant execute on function public.delete_invoice_draft(uuid) to authenticated;

create or replace function public.set_invoice_recipient(
  p_invoice_id   uuid,
  p_recipient_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_status  text;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.status, i.patient_id into v_status, v_patient
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_status <> 'draft' then
    raise exception 'an issued invoice cannot be changed' using errcode = '23514';
  end if;

  -- Ein Empfaenger einer anderen Patientin waere die Falschzuordnung aus
  -- PROJECT_PRINCIPLES.md 13 - und zwar die teuerste: eine Rechnung mit
  -- fremden Leistungen an eine fremde Anschrift.
  if p_recipient_id is not null and not exists (
    select 1 from public.invoice_recipients r
    where r.id = p_recipient_id and r.patient_id = v_patient and r.organization_id = v_org
  ) then
    raise exception 'recipient does not belong to this patient' using errcode = '22023';
  end if;

  update public.invoices set recipient_id = p_recipient_id where id = p_invoice_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.recipient_changed', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'to_self', p_recipient_id is null)
  );
end;
$$;

comment on function public.set_invoice_recipient(uuid, uuid) is
  'Waehlt den Empfaenger eines Rechnungsentwurfs (ABR-003a). null heisst: die Patientin selbst. Ein Empfaenger einer anderen Patientin wird abgewiesen (PROJECT_PRINCIPLES.md 13).';

revoke all on function public.set_invoice_recipient(uuid, uuid) from public, anon;
grant execute on function public.set_invoice_recipient(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Ausstellen
--
-- Der eine Vorgang, nach dem nichts mehr zu aendern ist: Nummer vergeben,
-- Snapshot schreiben, Leistungen auf `invoiced` setzen - in einer Transaktion
-- (ADR-009 Punkte 8 bis 10).
-- -----------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_nummer   text;
  v_prefix   text;
  v_frist    smallint;
  v_dokument jsonb;
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
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is already issued' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.invoice_number_prefix, b.payment_term_days
    into v_prefix, v_frist
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  -- Ohne Absender keine Rechnung. Der Hinweis nennt die Luecke, damit die
  -- Oberflaeche nicht raten muss, was fehlt (ADR-009 Punkt 10).
  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  v_dokument := app.build_invoice_document(p_invoice_id);
  v_nummer := app.next_invoice_number(v_org, extract(year from v_heute)::smallint, v_prefix);

  -- Der Snapshot traegt Nummer und Daten mit: Er ist das Dokument, nicht ein
  -- Teil davon (ADR-009 Punkt 11).
  v_dokument := v_dokument || jsonb_build_object(
    'invoice_number', v_nummer,
    'issued_on', v_heute,
    'due_on', v_heute + v_frist::integer
  );

  update public.invoices
     set status          = 'issued',
         invoice_number  = v_nummer,
         issued_on       = v_heute,
         issued_at       = now(),
         issued_by       = v_actor,
         due_on          = v_heute + v_frist::integer,
         total_cents     = (v_dokument -> 'totals' ->> 'total_cents')::integer,
         tax_total_cents = (v_dokument -> 'totals' ->> 'tax_total_cents')::integer,
         currency        = v_dokument ->> 'currency',
         snapshot        = v_dokument
   where id = p_invoice_id;

  -- Die Leistung ist ab jetzt abgerechnet; ihr Entfernen laeuft nur noch ueber
  -- Storno (ADR-009 Punkt 9). Denselben Schreiber hat ABR-002 angekuendigt.
  update public.billable_services b
     set status = 'invoiced'
   where b.id in (select it.billable_service_id
                  from public.invoice_items it
                  where it.invoice_id = p_invoice_id);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.issued', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_nummer,
                       'total_cents', (v_dokument -> 'totals' ->> 'total_cents')::integer)
  );

  return v_nummer;
end;
$$;

comment on function public.issue_invoice(uuid) is
  'Stellt einen Rechnungsentwurf aus: Nummer vergeben, Snapshot schreiben, Leistungen auf "invoiced" setzen - in einer Transaktion (ADR-009 Punkte 8 bis 10). Danach ist die Rechnung unveraenderlich.';

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 13. Leistungen entfernen: der Entwurf haelt sie fest
--
-- Unveraendert aus 20260919110000_billable_services.sql uebernommen bis auf
-- den einen neuen Block: Steht die Leistung auf einem Entwurf, nennt die
-- Meldung den Grund, statt einen Fremdschluesselfehler durchzureichen.
-- PostgreSQL kennt kein teilweises Ersetzen einer Funktion.
-- -----------------------------------------------------------------------------
create or replace function public.delete_billable_services(p_appointment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.organization_id = v_org
  ) then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.billable_services
    where appointment_id = p_appointment_id and status = 'invoiced'
  ) then
    raise exception 'billable service is already invoiced' using errcode = '23514';
  end if;

  -- Neu mit ABR-003: Ein Entwurf haelt seine Leistungen fest. Erst den
  -- Entwurf verwerfen, dann die Erfassung zuruecknehmen.
  if exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    where b.appointment_id = p_appointment_id
  ) then
    raise exception 'billable service is part of an invoice draft' using errcode = '23514';
  end if;

  update public.treatment_base_items p
     set used_quantity = greatest(p.used_quantity - b.menge, 0)
  from (
    select treatment_base_item_id, sum(quantity)::smallint as menge
    from public.billable_services
    where appointment_id = p_appointment_id and treatment_base_item_id is not null
    group by treatment_base_item_id
  ) b
  where p.id = b.treatment_base_item_id;

  delete from public.billable_services where appointment_id = p_appointment_id;
  get diagnostics v_anzahl = row_count;

  if v_anzahl > 0 then
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'billable_service.removed', 'appointment', p_appointment_id, 'success',
      jsonb_build_object('surface', 'web', 'item_count', v_anzahl)
    );
  end if;

  return v_anzahl;
end;
$$;

comment on function public.delete_billable_services(uuid) is
  'Entfernt die noch nicht abgerechneten Leistungen eines Termins und nimmt die genutzte Menge der Grundlage zurueck (ABR-002). Seit ABR-003 auch dann abgewiesen, wenn die Leistung auf einem Rechnungsentwurf steht. Ab "invoiced" laeuft die Korrektur ueber Storno (ADR-009 Punkt 9).';

revoke all on function public.delete_billable_services(uuid) from public, anon;
grant execute on function public.delete_billable_services(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 14. Aufbewahrung der Rechnung (ADR-008)
--
-- Die Datenklasse `abrechnungsdaten` gibt es seit ABR-EPIC-001; die Rechnung
-- ist der Fall, fuer den sie angelegt wurde: "Ausgestellte Rechnungen und
-- Buchungsbelege, gesetzliche steuerliche Aufbewahrungsfrist, aktuell
-- grundsaetzlich acht Jahre" (ADR-008).
--
-- **Die Rechnung kann die Akte ueberleben.** Bei den Leistungen trug das
-- Argument noch: Sie entstehen am Termin, und zehn Jahre ab Abschluss der
-- Versorgung sind nie kuerzer als acht Jahre ab dem Leistungsjahr. Eine
-- Rechnung entsteht spaeter - eine im Dezember 2028 ausgestellte Rechnung
-- laeuft bis Ende 2036, waehrend eine im Januar 2026 abgeschlossene Akte im
-- Januar 2036 faellig waere. Der Loeschlauf haelt die Akte deshalb zurueck,
-- solange die steuerliche Frist einer ihrer ausgestellten Rechnungen laeuft.
-- Das ist ADR-008 Punkt 2 woertlich: Gesetzliche Aufbewahrung hat Vorrang.
--
-- Der abgesagte Termin braucht nichts: Seine Dreijahresfrist nimmt jede Zeile
-- mit `fee_basis` aus, und eine Leistung - und damit eine Rechnung - kann nur
-- an einem dokumentierten Termin oder an einem Gebuehrenanlass entstehen
-- (ABR-002). Die dort vermerkte Bedingung "ohne Rechnung" ist damit erfuellt,
-- ohne dass die Abfrage sie nennen muss.
--
-- Drei bestehende Funktionen ziehen nach. Ihre Ruempfe sind unveraendert
-- uebernommen - aus der laufenden Datenbank ausgelesen, nicht aus den
-- Migrationsdateien zusammengesucht; PostgreSQL kennt kein teilweises
-- Ersetzen einer Funktion. Der fachliche Unterschied steht je an einer
-- Stelle und ist dort vermerkt.
--
-- Wie lange eine Akte wegen ihrer Rechnungen bleibt: der spaeteste Ablauf
-- ueber alle ausgestellten Rechnungen, gerechnet wie jede steuerliche Frist -
-- ab Ende des Kalenderjahres der Ausstellung. `null` heisst: keine
-- ausgestellte Rechnung, also kein Grund zu warten. Ein Entwurf zaehlt nicht,
-- er ist kein Beleg.
-- -----------------------------------------------------------------------------
create or replace function app.billing_retention_due_at(
  p_patient_id uuid,
  p_time_zone  text
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(app.retention_due_at(
           (date_trunc('year', i.issued_on) + interval '1 year' - interval '1 day')::date,
           app.retention_interval('abrechnungsdaten'),
           p_time_zone
         ))
  from public.invoices i
  where i.patient_id = p_patient_id
    and i.status = 'issued'
$$;

comment on function app.billing_retention_due_at(uuid, text) is
  'Ablauf der steuerlichen Aufbewahrung ueber alle ausgestellten Rechnungen einer Patientin (ADR-008, Par. 147 AO). null heisst: keine ausgestellte Rechnung. Haelt die Akte im Loeschlauf zurueck, solange die Frist laeuft.';

revoke all on function app.billing_retention_due_at(uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 15. Der Loeschlauf der Akte nimmt Rechnungen mit
--
-- Unveraendert bis auf die beiden ersten Bloecke: Rechnungszeilen und
-- Rechnungen fallen vor Leistungen und Empfaengern, weil sie mit RESTRICT auf
-- sie zeigen.
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

  -- Rechnungszeilen zuerst: Sie zeigen mit RESTRICT auf die Leistung. Die
  -- steuerliche Frist der Rechnung ist an dieser Stelle abgelaufen - der Lauf
  -- haette die Akte sonst zurueckgehalten (ADR-008 Punkt 2, ABR-003).
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
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-003 einschliesslich Rechnungen, ihrer Zeilen und der Empfaenger. Prueft KEINEN Legal Hold und KEINE steuerliche Frist - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 16. Die Wiederanwendung kennt die beiden neuen Tabellen
--
-- Unveraendert bis auf zwei Eintraege in der Reihenfolge: Was zuerst geloescht
-- wurde, wird nach einer Wiederherstellung zuerst wieder geloescht (ADR-008
-- Punkt 8).
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
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
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-003 einschliesslich Rechnungen, ihrer Zeilen und der Empfaenger.';

-- -----------------------------------------------------------------------------
-- 17. Der Loeschlauf haelt eine Akte mit laufender Rechnungsfrist zurueck
--
-- Unveraendert bis auf einen Block in der Patientenschleife und einen
-- Zaehler: Eine Akte, an der eine ausgestellte Rechnung mit laufender
-- steuerlicher Frist haengt, wird uebersprungen und im naechsten Lauf erneut
-- geprueft - genauso wie eine Akte unter Legal Hold.
--
-- Der Zaehler steht getrennt: "wegen eines Rechtsstreits gehalten" und "wegen
-- Par. 147 AO gehalten" sind zwei verschiedene Auskuenfte, und eine Zahl, die
-- beides zusammenfasst, beantwortet keine von beiden (ADR-010).
-- -----------------------------------------------------------------------------
create or replace function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;

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

    v_gesamt := v_gesamt + v_akten + v_termine + v_audit + v_zugang;

    if v_akten + v_termine + v_audit + v_zugang > 0 or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenakte', v_akten,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

comment on function public.apply_retention() is
  'Fuehrt den Loeschlauf ueber alle Datenklassen aus (ADR-008, LOE-002a). Seit ABR-003 haelt er eine Akte zurueck, solange die steuerliche Frist einer ihrer ausgestellten Rechnungen laeuft (Par. 147 AO, ADR-008 Punkt 2).';
