-- =============================================================================
-- ABR-001: Der Leistungskatalog - versioniert, mit Preis und Steuerkennzeichen
--
-- ADR-009 Punkt 5 und PROJECT_PRINCIPLES.md 19 verlangen einen versionierten
-- Katalog: "Historische Leistungen und Rechnungen duerfen durch spaetere
-- Preisaenderungen nicht veraendert werden." Punkt 6 verlangt die steuerliche
-- Eigenschaft ausdruecklich je Leistung beziehungsweise Leistungsversion - und
-- ausdruecklich nicht aus einem Modell (ADR-005, ADR-006).
--
-- Die Umsetzung ist eine **eingefrorene Preisliste** (ANN-070):
--
--   * Eine **Katalogversion** ist eine Preisliste mit einem Gueltigkeitsbeginn.
--     Solange sie Entwurf ist, laesst sie sich beliebig aendern; mit dem
--     Veroeffentlichen wird sie unveraenderlich - Positionen, Preise und
--     Steuerkennzeichen ebenso wie der Beginn. Eine Preisaenderung ist damit
--     immer eine **neue Version**, nie eine Korrektur an der alten.
--   * Eine **Position** traegt Kuerzel, Bezeichnung, Einzelpreis in Cent, die
--     Waehrung und ihre steuerliche Einordnung. Kein Fliesskomma (ADR-014).
--   * Welche Version an einem Tag gilt, beantwortet genau eine Funktion:
--     die veroeffentlichte mit dem groessten Beginn bis zu diesem Tag.
--
-- Damit haengt eine Leistung (ABR-002) an einer Position und braucht keine
-- Preiskopie: Die Position kann sich nicht mehr aendern. Den Snapshot ueber
-- Stammdaten und Steuerangaben verlangt ADR-009 Punkt 10 erst beim Ausstellen
-- der Rechnung - er wird hier NICHT vorgebaut (ADR-014, "nicht prophylaktisch").
--
-- Ebenfalls nicht hier: Rechnungen, Zahlungen, Nummernkreise, Praxisstammdaten
-- (ABR-000) und echte Preise. Der Seed traegt eine synthetische Preisliste.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer den Katalog liest und wer ihn pflegt
--
-- Lesen duerfen alle vier Praxisrollen: Ein Preis ist keine Patientendatei,
-- und die Leistungserfassung (ABR-002) braucht die Position dort, wo sie
-- stattfindet. Patientenkonten bekommen nichts (PROJECT_PRINCIPLES.md 4.6).
--
-- Pflegen darf allein `owner`. Ein Preis ist eine Unternehmensentscheidung und
-- steht in 4.1 bei den Praxiseinstellungen; 4.3 gibt dem Office Rechnungen und
-- Zahlungsstatus, nicht die Preisbildung (ANN-071).
-- -----------------------------------------------------------------------------
create or replace function app.can_read_service_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

create or replace function app.can_manage_service_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_read_service_catalog() is
  'Rollen, die den Leistungskatalog lesen duerfen (ABR-001). Alle vier Praxisrollen: die Leistungserfassung braucht Kuerzel und Preis.';
comment on function app.can_manage_service_catalog() is
  'Rollen, die Katalogversionen anlegen, aendern und veroeffentlichen duerfen (ABR-001, ANN-071). Nur owner: Preisbildung ist Praxiseinstellung (PROJECT_PRINCIPLES.md 4.1).';

revoke all on function app.can_read_service_catalog()   from public, anon;
revoke all on function app.can_manage_service_catalog() from public, anon;
grant execute on function app.can_read_service_catalog()   to authenticated;
grant execute on function app.can_manage_service_catalog() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Katalogversion
--
-- `published_at` ist der Schalter: null heisst Entwurf, gesetzt heisst
-- unveraenderlich. Ein eigener Zustandstext waere ein zweiter Zaehler neben
-- demselben Sachverhalt (PROJECT_PRINCIPLES.md 13).
-- -----------------------------------------------------------------------------
create table public.service_catalog_versions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  label           text not null check (length(btrim(label)) between 1 and 100),
  valid_from      date not null,
  published_at    timestamptz,
  published_by    uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid
);

comment on table public.service_catalog_versions is
  'Eine Preisliste mit Gueltigkeitsbeginn (ABR-001, ADR-009 Punkt 5). Enthaelt keine Patientendaten. Datenklasse: Abrechnungsstammdaten, steuerliche Frist (ADR-008). Lesbar fuer alle Praxisrollen; geschrieben ausschliesslich ueber die Funktionen dieser Migration.';
comment on column public.service_catalog_versions.valid_from is
  'Erster Tag, an dem diese Preisliste gilt. Massgeblich ist das Leistungsdatum, nicht der Tag der Erfassung - sonst aenderte eine spaete Erfassung den Preis einer laengst erbrachten Behandlung (ADR-009 Punkt 5).';
comment on column public.service_catalog_versions.published_at is
  'null heisst Entwurf und aenderbar; gesetzt heisst veroeffentlicht und damit unveraenderlich - Positionen eingeschlossen. Zurueck geht es nicht: eine Preisaenderung ist eine neue Version (ANN-070).';

-- Eine veroeffentlichte Preisliste je Beginn. Sonst gaebe es an einem Tag zwei
-- gueltige Preise, und "welcher Preis galt" haette keine Antwort.
create unique index service_catalog_versions_published_valid_from_key
  on public.service_catalog_versions (organization_id, valid_from)
  where published_at is not null;

create index service_catalog_versions_org_idx
  on public.service_catalog_versions (organization_id, valid_from desc, id desc);

revoke all on public.service_catalog_versions from anon, authenticated;
alter table public.service_catalog_versions enable row level security;

create policy service_catalog_versions_select_staff
  on public.service_catalog_versions for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_service_catalog()
  );

grant select on public.service_catalog_versions to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Position
--
-- `item_kind` trennt zwei Sachverhalte, die nie ineinander rutschen duerfen:
-- eine erbrachte Behandlung und ein Ausfallhonorar. ADR-018 Fassung 2 fuehrt
-- den Gebuehrenanlass am Termin ohne Betrag; hier steht der Betrag, und ABR-002
-- laesst aus einem Gebuehrenanlass ausschliesslich eine `absence_fee`-Position
-- entstehen. Die Hausbesuchspauschale braucht dafuer keinen eigenen Wert: Sie
-- ist die Position zum Heilmittel "Hausbesuch" und damit eine Behandlung wie
-- jede andere.
--
-- `remedy` ist die Bruecke zur Behandlungsgrundlage: derselbe Wert, der in
-- `treatment_base_items.remedy` steht (HEILMITTEL in
-- src/features/treatment-bases/heilmittel.ts). Er ist die Vorbelegung der
-- Leistungserfassung und deshalb je Version hoechstens einmal vergeben.
-- -----------------------------------------------------------------------------
create table public.service_catalog_items (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  catalog_version_id uuid not null references public.service_catalog_versions (id) on delete cascade,
  sort_order         smallint not null check (sort_order between 1 and 200),
  code               text not null check (length(btrim(code)) between 1 and 20),
  label              text not null check (length(btrim(label)) between 1 and 120),
  item_kind          text not null check (item_kind in ('treatment', 'absence_fee')),
  remedy             text check (remedy is null or length(btrim(remedy)) between 1 and 200),
  unit_price_cents   integer not null check (unit_price_cents between 0 and 1000000),
  currency           text not null default 'EUR' check (currency = 'EUR'),
  tax_treatment      text not null
                       check (tax_treatment in ('exempt_healthcare', 'taxable', 'not_taxable')),
  tax_rate_permille  smallint not null check (tax_rate_permille between 0 and 1000),
  created_at         timestamptz not null default now(),
  created_by         uuid,
  -- Steuerfrei und ein Steuersatz zugleich waere ein Widerspruch im Beleg.
  constraint service_catalog_items_tax_rate_matches_treatment check (
    (tax_treatment in ('exempt_healthcare', 'not_taxable') and tax_rate_permille = 0)
    or (tax_treatment = 'taxable' and tax_rate_permille > 0)
  ),
  -- Ein Ausfallhonorar ist keine Behandlung und haengt an keinem Heilmittel.
  constraint service_catalog_items_absence_fee_without_remedy check (
    item_kind <> 'absence_fee' or remedy is null
  )
);

comment on table public.service_catalog_items is
  'Position einer Preisliste: Kuerzel, Bezeichnung, Einzelpreis, Waehrung und steuerliche Einordnung (ABR-001, ADR-009 Punkte 5 und 6). Unveraenderlich, sobald ihre Version veroeffentlicht ist.';
comment on column public.service_catalog_items.item_kind is
  'treatment = erbrachte Behandlung (die Hausbesuchspauschale ist eine davon), absence_fee = Ausfallhonorar zu einem Gebuehrenanlass nach ADR-018 Fassung 2. ABR-002 laesst die beiden nie ineinander rutschen.';
comment on column public.service_catalog_items.remedy is
  'Heilmittel, zu dem diese Position gehoert - derselbe Wert wie in treatment_base_items.remedy. Er belegt die Leistungserfassung vor (ABR-002). null heisst: keine Vorbelegung ueber die Grundlage.';
comment on column public.service_catalog_items.unit_price_cents is
  'Einzelpreis in Cent. Ganzzahlig und damit exakt - Fliesskomma ist fuer Geldwerte ausgeschlossen (ADR-014).';
comment on column public.service_catalog_items.tax_treatment is
  'Steuerliche Einordnung, ausdruecklich je Position gespeichert und nie abgeleitet (ADR-009 Punkt 6): exempt_healthcare = umsatzsteuerfreie Heilbehandlung, taxable = steuerpflichtig (etwa Praevention oder Training), not_taxable = nicht steuerbar, weil kein Leistungsaustausch vorliegt - der Fall des Ausfallhonorars. Die Einordnung im Einzelfall trifft die Praxis mit ihrer Steuerberatung (G13, B4); ADR-009 nimmt sie ausdruecklich aus (ANN-070).';
comment on column public.service_catalog_items.tax_rate_permille is
  'Steuersatz in Promille (190 = 19 Prozent). Promille, weil ein Satz von 7,7 Prozent in ganzen Prozent nicht darstellbar waere. Steuerfrei heisst 0.';

create unique index service_catalog_items_version_code_key
  on public.service_catalog_items (catalog_version_id, code);

-- Je Version hoechstens eine Position zu einem Heilmittel: Die Vorbelegung
-- muss eindeutig sein, sonst haengt der Preis an der Sortierung.
create unique index service_catalog_items_version_remedy_key
  on public.service_catalog_items (catalog_version_id, remedy)
  where remedy is not null;

create unique index service_catalog_items_version_sort_order_key
  on public.service_catalog_items (catalog_version_id, sort_order);

create index service_catalog_items_version_idx
  on public.service_catalog_items (catalog_version_id, sort_order);

revoke all on public.service_catalog_items from anon, authenticated;
alter table public.service_catalog_items enable row level security;

create policy service_catalog_items_select_staff
  on public.service_catalog_items for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_service_catalog()
  );

grant select on public.service_catalog_items to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Unveraenderlich ab dem Veroeffentlichen
--
-- Die Sperre sitzt am Trigger und nicht im Schreibpfad: Sie gilt dann fuer
-- jeden Weg in die Tabelle, auch fuer einen spaeteren. Genau das verlangt
-- ADR-009 Punkt 5 - eine historische Leistung darf sich nicht nachtraeglich
-- verteuern.
--
-- Erlaubt bleibt der eine Uebergang, der das Einfrieren selbst ist: null ->
-- Zeitpunkt. Alles andere an einer veroeffentlichten Version wird abgewiesen.
-- -----------------------------------------------------------------------------
create or replace function app.service_catalog_version_stays_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'published service catalog version is immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if old.published_at is not null then
    raise exception 'published service catalog version is immutable'
      using errcode = '23514';
  end if;

  -- Der Entwurf darf alles werden ausser einer anderen Organisation.
  if new.organization_id <> old.organization_id then
    raise exception 'service catalog version cannot change organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.service_catalog_version_stays_frozen() is
  'Haelt eine veroeffentlichte Katalogversion unveraenderlich (ABR-001, ADR-009 Punkt 5). Am Trigger und nicht im Schreibpfad, damit die Zusage fuer jeden Weg in die Tabelle gilt.';

create trigger service_catalog_versions_frozen
  before update or delete on public.service_catalog_versions
  for each row execute function app.service_catalog_version_stays_frozen();

create or replace function app.service_catalog_item_stays_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_published timestamptz;
  v_version   uuid;
begin
  v_version := case when tg_op = 'DELETE' then old.catalog_version_id else new.catalog_version_id end;

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = v_version;

  if v_published is not null then
    raise exception 'published service catalog version is immutable'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function app.service_catalog_item_stays_frozen() is
  'Haelt die Positionen einer veroeffentlichten Katalogversion unveraenderlich (ABR-001). Das Loeschen der Version selbst raeumt sie ueber on delete cascade ab - dorthin kommt nur ein Entwurf.';

create trigger service_catalog_items_frozen
  before insert or update or delete on public.service_catalog_items
  for each row execute function app.service_catalog_item_stays_frozen();

-- -----------------------------------------------------------------------------
-- 5. Welche Preisliste galt an diesem Tag
--
-- Die eine Stelle, an der die Frage beantwortet wird. Deterministisch, weil je
-- Beginn hoechstens eine veroeffentlichte Version existiert.
-- -----------------------------------------------------------------------------
create or replace function app.active_service_catalog_version(
  p_organization_id uuid,
  p_on date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id
  from public.service_catalog_versions v
  where v.organization_id = p_organization_id
    and v.published_at is not null
    and v.valid_from <= p_on
  order by v.valid_from desc
  limit 1
$$;

comment on function app.active_service_catalog_version(uuid, date) is
  'Die am Stichtag gueltige veroeffentlichte Preisliste (ABR-001): die mit dem groessten Beginn bis zu diesem Tag. null heisst, dass es fuer diesen Tag keine gibt - dann kann auch keine Leistung erfasst werden.';

revoke all on function app.active_service_catalog_version(uuid, date) from public, anon;
grant execute on function app.active_service_catalog_version(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Auditkatalog (ADR-010)
--
-- Der Katalog enthaelt keine Patientendaten. Protokolliert wird trotzdem, und
-- zwar aus einem anderen Grund: Ein Preis entscheidet ueber eine Forderung
-- gegen eine Patient:in, und das Veroeffentlichen ist der Vorgang, der ihn
-- unveraenderlich macht. Wer wann welche Preisliste in Kraft gesetzt hat,
-- gehoert damit in dieselbe Spur wie die uebrigen abrechnungsrelevanten
-- Vorgaenge (PROJECT_PRINCIPLES.md 13).
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
    'service_catalog_version'
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
    'service_catalog.version_deleted'
  ));

-- -----------------------------------------------------------------------------
-- 7. Schreibpfade
--
-- SECURITY DEFINER wie ueberall sonst: Die Organisation kommt aus der Sitzung,
-- nie vom Client (ADR-003), und die Berechtigung wird in der Funktion selbst
-- geprueft, weil DEFINER die RLS umgeht (ADR-004).
-- -----------------------------------------------------------------------------

/*
 * Eine neue Preisliste anlegen - wahlweise als Kopie einer vorhandenen.
 *
 * Die Kopie ist der Normalfall: Eine Preisrunde aendert zwei Zeilen und laesst
 * zwanzig stehen. Ohne sie waere "neue Version" gleichbedeutend mit "alles noch
 * einmal tippen", und genau daran scheitert Versionierung im Alltag.
 */
create or replace function public.create_service_catalog_version(
  p_label     text,
  p_valid_from date,
  p_copy_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_label text;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_label := nullif(btrim(p_label), '');
  if v_label is null then
    raise exception 'label is required' using errcode = '22023';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  insert into public.service_catalog_versions (organization_id, label, valid_from, created_by)
  values (v_org, v_label, p_valid_from, v_actor)
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.service_catalog_items (
      organization_id, catalog_version_id, sort_order, code, label,
      item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille, created_by
    )
    select v_org, v_id, q.sort_order, q.code, q.label,
           q.item_kind, q.remedy, q.unit_price_cents, q.currency,
           q.tax_treatment, q.tax_rate_permille, v_actor
    from public.service_catalog_items q
    join public.service_catalog_versions qv on qv.id = q.catalog_version_id
    where q.catalog_version_id = p_copy_from
      and qv.organization_id = v_org;

    -- Eine Vorlage, die es nicht gibt, ist ein Tippfehler und kein leerer
    -- Entwurf: Sonst entstuende stillschweigend eine Preisliste ohne Preise.
    if not exists (
      select 1 from public.service_catalog_items where catalog_version_id = v_id
    ) then
      raise exception 'copy source has no items' using errcode = '22023';
    end if;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_created', 'service_catalog_version', v_id, 'success',
    jsonb_build_object('surface', 'web', 'valid_from', p_valid_from, 'copied_from', p_copy_from)
  );

  return v_id;
end;
$$;

comment on function public.create_service_catalog_version(text, date, uuid) is
  'Legt eine Preisliste als Entwurf an, wahlweise als Kopie einer vorhandenen (ABR-001). Nur owner (ANN-071). Protokolliert service_catalog.version_created.';

revoke all on function public.create_service_catalog_version(text, date, uuid) from public, anon;
grant execute on function public.create_service_catalog_version(text, date, uuid) to authenticated;

/*
 * Bezeichnung und Beginn eines Entwurfs aendern.
 *
 * Eine veroeffentlichte Version weist schon der Trigger ab; die Pruefung hier
 * liefert nur die verstaendlichere Meldung.
 */
create or replace function public.update_service_catalog_version(
  p_version_id uuid,
  p_label      text,
  p_valid_from date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_label text;
  v_published timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  v_label := nullif(btrim(p_label), '');
  if v_label is null then
    raise exception 'label is required' using errcode = '22023';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  update public.service_catalog_versions
     set label = v_label, valid_from = p_valid_from
   where id = p_version_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_updated', 'service_catalog_version', p_version_id, 'success',
    jsonb_build_object('surface', 'web', 'valid_from', p_valid_from)
  );

  return p_version_id;
end;
$$;

comment on function public.update_service_catalog_version(uuid, text, date) is
  'Aendert Bezeichnung und Gueltigkeitsbeginn eines Katalogentwurfs (ABR-001). Eine veroeffentlichte Version bleibt unveraenderlich.';

revoke all on function public.update_service_catalog_version(uuid, text, date) from public, anon;
grant execute on function public.update_service_catalog_version(uuid, text, date) to authenticated;

/*
 * Die Positionen eines Entwurfs setzen - alles oder nichts.
 *
 * Die Liste ersetzt den Bestand vollstaendig. Das ist einfacher zu verstehen
 * als ein Abgleich und hat hier keinen Preis: Ein Entwurf haengt an nichts,
 * seine Positionen tragen keine Leistungen.
 *
 * p_items: [{"code","label","item_kind","remedy","unit_price_cents",
 *            "tax_treatment","tax_rate_permille"}, ...] in Anzeigereihenfolge.
 */
create or replace function public.write_service_catalog_items(
  p_version_id uuid,
  p_items      jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  delete from public.service_catalog_items where catalog_version_id = p_version_id;

  insert into public.service_catalog_items (
    organization_id, catalog_version_id, sort_order, code, label,
    item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille, created_by
  )
  select
    v_org,
    p_version_id,
    (zeile.ordinalitaet)::smallint,
    btrim(zeile.eintrag ->> 'code'),
    btrim(zeile.eintrag ->> 'label'),
    coalesce(zeile.eintrag ->> 'item_kind', 'treatment'),
    nullif(btrim(coalesce(zeile.eintrag ->> 'remedy', '')), ''),
    (zeile.eintrag ->> 'unit_price_cents')::integer,
    'EUR',
    coalesce(zeile.eintrag ->> 'tax_treatment', 'exempt_healthcare'),
    coalesce((zeile.eintrag ->> 'tax_rate_permille')::smallint, 0::smallint),
    v_actor
  from jsonb_array_elements(p_items) with ordinality as zeile(eintrag, ordinalitaet);

  select count(*) into v_anzahl
  from public.service_catalog_items where catalog_version_id = p_version_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_updated', 'service_catalog_version', p_version_id, 'success',
    jsonb_build_object('surface', 'web', 'item_count', v_anzahl)
  );

  return v_anzahl;
end;
$$;

comment on function public.write_service_catalog_items(uuid, jsonb) is
  'Ersetzt die Positionen eines Katalogentwurfs vollstaendig, alles oder nichts (ABR-001). Eine veroeffentlichte Version bleibt unveraenderlich.';

revoke all on function public.write_service_catalog_items(uuid, jsonb) from public, anon;
grant execute on function public.write_service_catalog_items(uuid, jsonb) to authenticated;

/*
 * Veroeffentlichen - der Vorgang, der die Preisliste einfriert.
 *
 * Eine leere Preisliste wird abgewiesen: Sie waere ab ihrem Beginn die
 * gueltige und liesse keine einzige Leistung mehr erfassen.
 */
create or replace function public.publish_service_catalog_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
  v_valid_from date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at, v.valid_from into v_published, v_valid_from
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'service catalog version is already published' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.service_catalog_items where catalog_version_id = p_version_id
  ) then
    raise exception 'service catalog version has no items' using errcode = '22023';
  end if;

  update public.service_catalog_versions
     set published_at = now(), published_by = v_actor
   where id = p_version_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_published', 'service_catalog_version', p_version_id, 'success',
    jsonb_build_object('surface', 'web', 'valid_from', v_valid_from)
  );

  return p_version_id;
end;
$$;

comment on function public.publish_service_catalog_version(uuid) is
  'Setzt eine Preisliste in Kraft und macht sie damit unveraenderlich (ABR-001, ADR-009 Punkt 5). Protokolliert service_catalog.version_published.';

revoke all on function public.publish_service_catalog_version(uuid) from public, anon;
grant execute on function public.publish_service_catalog_version(uuid) to authenticated;

/*
 * Einen Entwurf verwerfen. Eine veroeffentlichte Version bleibt.
 */
create or replace function public.delete_service_catalog_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  -- Der Auditeintrag vor dem Loeschen: danach gaebe es die Kennung nicht mehr,
  -- auf die er zeigt.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_deleted', 'service_catalog_version', p_version_id, 'success',
    jsonb_build_object('surface', 'web')
  );

  delete from public.service_catalog_versions where id = p_version_id;
end;
$$;

comment on function public.delete_service_catalog_version(uuid) is
  'Verwirft einen Katalogentwurf samt Positionen (ABR-001). Eine veroeffentlichte Version laesst sich nicht loeschen.';

revoke all on function public.delete_service_catalog_version(uuid) from public, anon;
grant execute on function public.delete_service_catalog_version(uuid) to authenticated;
