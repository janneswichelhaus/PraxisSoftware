-- =============================================================================
-- ABR-002: Leistungen entstehen aus durchgefuehrten Terminen
--
-- PROJECT_PRINCIPLES.md 19 und ADR-009 Punkt 3 trennen zwei Lebenszyklen:
-- Eine Leistung entsteht am Termin, eine Rechnung entsteht spaeter und fasst
-- mehrere Leistungen zusammen. Werden beide nicht getrennt modelliert,
-- entstehen Doppelabrechnungen oder nicht abgerechnete Leistungen.
--
-- Diese Migration baut die erste Haelfte davon - die Leistung. Die Rechnung
-- kommt mit ABR-EPIC-002a und wird hier NICHT vorbereitet (ADR-014).
--
-- Vier Festlegungen tragen das Ganze:
--
--   1. **Woraus eine Leistung entstehen darf**, sagt Paragraf 19 abschliessend:
--      "Fakturiert wird ausschliesslich aus 'dokumentiert' oder aus einem
--      Vorgang mit Gebuehrenanlass (ADR-018)." **In V1 gibt es keinen
--      Override** - der Satz schlaegt den aelteren Roadmap-Text mit dem
--      protokollierten Override (ANN-072, Rangfolge nach Paragraf 21).
--   2. **Behandlung und Ausfallhonorar rutschen nie ineinander.** Aus einem
--      dokumentierten Termin entstehen ausschliesslich `treatment`-Positionen,
--      aus einem Gebuehrenanlass ausschliesslich `absence_fee`.
--   3. **Der Preis wird nicht kopiert.** Die Leistung zeigt auf eine Position
--      einer veroeffentlichten und damit unveraenderlichen Preisliste
--      (ABR-001). Massgeblich ist die Liste, die am **Leistungstag** galt -
--      nicht die am Tag der Erfassung.
--   4. **Die genutzte Menge der Grundlage wird jetzt fortgeschrieben.** Sie war
--      seit ANN-012 Handarbeit und seit ANN-038/ANN-064 ausdruecklich auf
--      ABR-002 vertagt (ANN-073).
--
-- Die Mehrfachabrechnung verhindert nicht die Sorgfalt im Ablauf, sondern das
-- Modell: je Termin und Position hoechstens eine Leistung (Paragraf 13,
-- ADR-009 Punkt 4).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer Leistungen liest und wer sie erfasst
--
-- Beides `owner` und `office`: Die Erfassung ist der erste Schritt der
-- Abrechnung und gehoert zu "Rechnungen und Zahlungsstatus"
-- (PROJECT_PRINCIPLES.md 4.3). Die therapeutischen Rollen bleiben aussen vor,
-- solange die Erfassung im Abrechnungsbereich stattfindet und nicht am Termin
-- (ANN-071) - zwei Funktionen, damit Lesen und Erfassen spaeter auseinander
-- gehen koennen, ohne dass eine Aenderung beides verschiebt.
-- -----------------------------------------------------------------------------
create or replace function app.can_read_billable_services()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

create or replace function app.can_record_billable_services()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

comment on function app.can_read_billable_services() is
  'Rollen, die erfasste Leistungen lesen duerfen (ABR-002, ANN-071): owner und office.';
comment on function app.can_record_billable_services() is
  'Rollen, die Leistungen erfassen und wieder entfernen duerfen (ABR-002, ANN-071): owner und office.';

revoke all on function app.can_read_billable_services()   from public, anon;
revoke all on function app.can_record_billable_services() from public, anon;
grant execute on function app.can_read_billable_services()   to authenticated;
grant execute on function app.can_record_billable_services() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Leistung
--
-- Kein Preis, kein Steuersatz, keine Bezeichnung: Alles das steht an der
-- Katalogposition, und die kann sich nicht mehr aendern (ABR-001). Eine Kopie
-- waere ein zweiter Wert fuer denselben Sachverhalt - genau das, was Paragraf
-- 13 an der Abrechnung verbietet. Den Snapshot ueber Stammdaten und Preise
-- verlangt ADR-009 Punkt 10 erst beim **Ausstellen der Rechnung**.
--
-- `treatment_base_item_id` ist nicht die Grundlage des Termins, sondern der
-- Nachweis der **Wirkung**: die Position, deren genutzte Menge diese Leistung
-- erhoeht hat. Nur so nimmt das Entfernen genau das zurueck, was das Erfassen
-- gesetzt hat - auch wenn der Termin danach auf eine andere Grundlage
-- uebertragen wurde (CAL-022).
-- -----------------------------------------------------------------------------
create table public.billable_services (
  id                     uuid primary key default extensions.gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete restrict,
  patient_id             uuid not null references public.patients (id) on delete restrict,
  appointment_id         uuid not null references public.appointments (id) on delete restrict,
  catalog_item_id        uuid not null references public.service_catalog_items (id) on delete restrict,
  treatment_base_item_id uuid references public.treatment_base_items (id) on delete set null,
  quantity               smallint not null default 1 check (quantity between 1 and 10),
  performed_on           date not null,
  status                 text not null default 'billable'
                           check (status in ('billable', 'invoiced')),
  created_at             timestamptz not null default now(),
  created_by             uuid
);

comment on table public.billable_services is
  'Abrechenbare Leistung aus einem Termin (ABR-002, ADR-009 Punkt 3). Enthaelt einen Patientenbezug und damit Gesundheitsdaten im weiteren Sinn; Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008, ADR-009). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen dieser Migration (ADR-004).';
comment on column public.billable_services.performed_on is
  'Leistungstag in der Zeitzone der Organisation. Er entscheidet, welche Preisliste gilt - nicht der Tag der Erfassung (ADR-009 Punkt 5).';
comment on column public.billable_services.status is
  'Eigener Abrechnungsstand der Leistung (ADR-009 Punkt 3). "invoiced" steht im Wertebereich, hat aber heute keinen Schreiber: Die Rechnungsausstellung setzt ihn in derselben Transaktion (ABR-003). Nichts wird dafuer prophylaktisch gebaut (ADR-014).';
comment on column public.billable_services.treatment_base_item_id is
  'Position der Behandlungsgrundlage, deren genutzte Menge diese Leistung erhoeht hat (ANN-073). null heisst: keine - etwa beim Ausfallhonorar oder bei einem Termin ohne Grundlage.';

-- Die Invariante gegen Doppelabrechnung (ADR-009 Punkt 4, Paragraf 13): je
-- Termin und Katalogposition hoechstens eine Leistung. Eine Doppelbehandlung
-- ist eine eigene Position und keine zweite Zeile derselben.
create unique index billable_services_appointment_item_key
  on public.billable_services (appointment_id, catalog_item_id);

create index billable_services_org_performed_idx
  on public.billable_services (organization_id, performed_on desc, id desc);
create index billable_services_patient_idx
  on public.billable_services (organization_id, patient_id, performed_on desc);
create index billable_services_item_idx on public.billable_services (catalog_item_id);
create index billable_services_base_item_idx on public.billable_services (treatment_base_item_id);

revoke all on public.billable_services from anon, authenticated;
alter table public.billable_services enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Auditkatalog (ADR-010)
--
-- Ein Ereignis je Vorgang, nicht je Zeile - dieselbe Bauart wie bei der
-- Terminuebertragung (CAL-022). Der Gegenstand ist der Termin: an ihm haengt
-- der Vorgang, und er bleibt auch dann eine stabile Kennung, wenn die
-- Leistungen wieder entfernt werden (ADR-014, "Auditfaehigkeit").
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
-- 4. Der Leistungstag eines Termins
--
-- An genau einer Stelle, damit Vorschlag, Erfassung und Liste denselben Tag
-- meinen. Gerechnet wird in der Zeitzone der Organisation: Ein Termin um 23:30
-- Ortszeit gehoert zu diesem Tag und nicht zum naechsten in UTC.
-- -----------------------------------------------------------------------------
create or replace function app.appointment_performed_on(p_appointment_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (a.starts_at at time zone o.time_zone)::date
  from public.appointments a
  join public.organizations o on o.id = a.organization_id
  where a.id = p_appointment_id
$$;

comment on function app.appointment_performed_on(uuid) is
  'Leistungstag eines Termins in der Zeitzone der Organisation (ABR-002). Er entscheidet ueber die geltende Preisliste.';

revoke all on function app.appointment_performed_on(uuid) from public, anon;
grant execute on function app.appointment_performed_on(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Der Vorschlag
--
-- Was an diesem Termin abzurechnen waere, beantwortet der Server und nicht das
-- Formular: Dieselbe Regel gilt dann fuer jeden Aufrufer, und die Oberflaeche
-- kann keine Position anbieten, die der Schreibpfad anschliessend abweist.
--
-- Aus einem dokumentierten Termin: je Heilmittel der Grundlage die Position
-- der geltenden Preisliste. Aus einem Gebuehrenanlass: das Ausfallhonorar.
-- Mehr schlaegt nichts vor - die Praxis ergaenzt von Hand, was sie braucht.
-- -----------------------------------------------------------------------------
create or replace function public.get_billable_service_draft(p_appointment_id uuid)
returns table (
  catalog_item_id   uuid,
  code              text,
  label             text,
  item_kind         text,
  unit_price_cents  integer,
  currency          text,
  tax_treatment     text,
  tax_rate_permille smallint,
  suggested         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_performed_on date;
  v_version      uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select a.status, a.fee_basis, a.treatment_basis_id
    into v_status, v_fee_basis, v_basis
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  -- Die Reihenfolge der Preisliste bleibt die Reihenfolge des Vorschlags.
  return query
  select i.id, i.code, i.label, i.item_kind, i.unit_price_cents, i.currency,
         i.tax_treatment, i.tax_rate_permille,
         case
           when v_fee_basis is not null then i.item_kind = 'absence_fee'
           else i.remedy is not null
                and exists (
                  select 1 from public.treatment_base_items p
                  where p.treatment_basis_id = v_basis and p.remedy = i.remedy
                )
         end as suggested
  from public.service_catalog_items i
  where i.catalog_version_id = v_version
    and i.item_kind = case when v_fee_basis is not null then 'absence_fee' else 'treatment' end
  order by i.sort_order;
end;
$$;

comment on function public.get_billable_service_draft(uuid) is
  'Waehlbare und vorgeschlagene Katalogpositionen fuer einen Termin (ABR-002). Vorgeschlagen sind die Heilmittel seiner Grundlage beziehungsweise das Ausfallhonorar; waehlbar ist, was die am Leistungstag geltende Preisliste fuer diesen Anlass hergibt.';

revoke all on function public.get_billable_service_draft(uuid) from public, anon;
grant execute on function public.get_billable_service_draft(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Erfassen - alles oder nichts
--
-- p_items: [{"catalog_item_id": uuid, "quantity": 1}, ...]
-- -----------------------------------------------------------------------------
create or replace function public.record_billable_services(
  p_appointment_id uuid,
  p_items          jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_patient      uuid;
  v_performed_on date;
  v_version      uuid;
  v_erwartet     text;
  v_anzahl       integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select a.status, a.fee_basis, a.treatment_basis_id, a.patient_id
    into v_status, v_fee_basis, v_basis, v_patient
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  -- Paragraf 19, abschliessend: dokumentiert oder Gebuehrenanlass. Kein
  -- Override in V1 (ANN-072).
  if v_fee_basis is null and v_status <> 'documented' then
    raise exception 'appointment is neither documented nor a fee occasion'
      using errcode = '22023';
  end if;

  -- Ein Ereignis ohne Patient:in kann keine Leistung erzeugen (Paragraf 19).
  if v_patient is null then
    raise exception 'appointment has no patient' using errcode = '22023';
  end if;

  if exists (select 1 from public.billable_services where appointment_id = p_appointment_id) then
    raise exception 'appointment already has billable services' using errcode = '23505';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  v_erwartet := case when v_fee_basis is not null then 'absence_fee' else 'treatment' end;

  insert into public.billable_services (
    organization_id, patient_id, appointment_id, catalog_item_id,
    treatment_base_item_id, quantity, performed_on, created_by
  )
  select
    v_org,
    v_patient,
    p_appointment_id,
    i.id,
    -- Die Position der Grundlage, deren Menge diese Leistung verbraucht.
    (select p.id
       from public.treatment_base_items p
      where p.treatment_basis_id = v_basis
        and p.remedy = i.remedy
      limit 1),
    coalesce((zeile.eintrag ->> 'quantity')::smallint, 1::smallint),
    v_performed_on,
    v_actor
  from jsonb_array_elements(p_items) as zeile(eintrag)
  join public.service_catalog_items i
    on i.id = (zeile.eintrag ->> 'catalog_item_id')::uuid
   and i.catalog_version_id = v_version
   and i.item_kind = v_erwartet;

  get diagnostics v_anzahl = row_count;

  -- Eine Position, die es in der geltenden Preisliste nicht gibt oder die
  -- nicht zum Anlass passt, faellt aus dem Join heraus. Stillschweigend
  -- weniger zu schreiben, als verlangt wurde, waere genau der Fehler aus
  -- Paragraf 13 - also scheitert der ganze Vorgang.
  if v_anzahl <> jsonb_array_length(p_items) then
    raise exception 'item does not belong to the catalog version valid on % or does not match %',
      v_performed_on, v_erwartet using errcode = '22023';
  end if;

  -- Die genutzte Menge der Grundlage wird jetzt fortgeschrieben (ANN-073).
  -- Die Constraint used_quantity <= prescribed_quantity bleibt bestehen und
  -- schuetzt die Abrechnung (ADR-020 Punkt 5); sie bekommt hier nur eine
  -- verstaendliche Meldung.
  begin
    update public.treatment_base_items p
       set used_quantity = p.used_quantity + b.menge
    from (
      select treatment_base_item_id, sum(quantity)::smallint as menge
      from public.billable_services
      where appointment_id = p_appointment_id and treatment_base_item_id is not null
      group by treatment_base_item_id
    ) b
    where p.id = b.treatment_base_item_id;
  exception
    when check_violation then
      raise exception 'treatment basis quantity exhausted' using errcode = '23514';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'billable_service.recorded', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      'item_count', v_anzahl,
      'performed_on', v_performed_on
    )
  );

  return v_anzahl;
end;
$$;

comment on function public.record_billable_services(uuid, jsonb) is
  'Erfasst die Leistungen eines Termins, alles oder nichts (ABR-002). Nur aus "dokumentiert" oder aus einem Gebuehrenanlass, ohne Override (PROJECT_PRINCIPLES.md 19, ANN-072). Schreibt die genutzte Menge der Grundlage fort (ANN-073) und protokolliert billable_service.recorded.';

revoke all on function public.record_billable_services(uuid, jsonb) from public, anon;
grant execute on function public.record_billable_services(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Zuruecknehmen
--
-- Solange keine Rechnung daran haengt, ist eine falsch erfasste Leistung ein
-- Tippfehler und keine Buchung: Sie wird entfernt, nicht storniert. Ab
-- 'invoiced' gilt das Gegenteil - dann greift die Korrektur ueber Storno und
-- Neuausstellung (ADR-009 Punkt 9), und die baut ABR-EPIC-002b.
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

  -- Genau das zuruecknehmen, was das Erfassen gesetzt hat.
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
  'Entfernt die noch nicht abgerechneten Leistungen eines Termins und nimmt die genutzte Menge der Grundlage zurueck (ABR-002). Ab "invoiced" laeuft die Korrektur ueber Storno (ADR-009 Punkt 9).';

revoke all on function public.delete_billable_services(uuid) from public, anon;
grant execute on function public.delete_billable_services(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Die beiden Lesepfade
--
-- "Was ist zu erfassen" und "was ist erfasst" sind zwei Fragen und deshalb
-- zwei Funktionen. Beide liefern eine rollenabhaengige Projektion und nie die
-- ganze Zeile (ADR-004).
-- -----------------------------------------------------------------------------
create or replace function public.list_open_billable_appointments(p_limit integer default 100)
returns table (
  appointment_id   uuid,
  patient_id       uuid,
  patient_name     text,
  performed_on     date,
  starts_at        timestamptz,
  status           text,
  fee_basis        text,
  appointment_type text,
  suggestion_count integer
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

  if not app.can_read_billable_services() then
    raise exception 'not allowed to read billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select a.id,
         a.patient_id,
         pe.given_name || ' ' || pe.family_name,
         (a.starts_at at time zone o.time_zone)::date,
         a.starts_at,
         a.status,
         a.fee_basis,
         a.appointment_type,
         (
           select count(*)::integer
           from public.treatment_base_items q
           join public.service_catalog_items ci
             on ci.remedy = q.remedy
            and ci.catalog_version_id = app.active_service_catalog_version(
                  v_org, (a.starts_at at time zone o.time_zone)::date)
           where q.treatment_basis_id = a.treatment_basis_id
         )
  from public.appointments a
  join public.organizations o on o.id = a.organization_id
  join public.patients p  on p.id = a.patient_id
  join public.persons  pe on pe.id = p.person_id
  where a.organization_id = v_org
    and a.patient_id is not null
    and (a.status = 'documented' or a.fee_basis is not null)
    and not exists (
      select 1 from public.billable_services b where b.appointment_id = a.id
    )
  order by a.starts_at desc, a.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_open_billable_appointments(integer) is
  'Termine, aus denen eine Leistung entstehen darf und an denen noch keine erfasst ist (ABR-002): dokumentiert oder mit Gebuehrenanlass. Die Arbeitsliste des Abrechnungsbereichs.';

revoke all on function public.list_open_billable_appointments(integer) from public, anon;
grant execute on function public.list_open_billable_appointments(integer) to authenticated;

create or replace function public.list_billable_services(
  p_from  date default null,
  p_to    date default null,
  p_limit integer default 200
)
returns table (
  id                uuid,
  appointment_id    uuid,
  patient_id        uuid,
  patient_name      text,
  performed_on      date,
  code              text,
  label             text,
  item_kind         text,
  quantity          smallint,
  unit_price_cents  integer,
  currency          text,
  tax_treatment     text,
  tax_rate_permille smallint,
  status            text
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

  if not app.can_read_billable_services() then
    raise exception 'not allowed to read billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select b.id, b.appointment_id, b.patient_id,
         pe.given_name || ' ' || pe.family_name,
         b.performed_on, i.code, i.label, i.item_kind, b.quantity,
         i.unit_price_cents, i.currency, i.tax_treatment, i.tax_rate_permille,
         b.status
  from public.billable_services b
  join public.service_catalog_items i on i.id = b.catalog_item_id
  join public.patients p  on p.id = b.patient_id
  join public.persons  pe on pe.id = p.person_id
  where b.organization_id = v_org
    and (p_from is null or b.performed_on >= p_from)
    and (p_to   is null or b.performed_on <= p_to)
  order by b.performed_on desc, pe.family_name, i.code
  limit greatest(least(coalesce(p_limit, 200), 500), 1);
end;
$$;

comment on function public.list_billable_services(date, date, integer) is
  'Erfasste Leistungen mit Kuerzel, Menge, Einzelpreis und Steuerkennzeichen (ABR-002). Der Preis kommt aus der Katalogposition und nicht aus einer Kopie - die Position ist unveraenderlich (ABR-001).';

revoke all on function public.list_billable_services(date, date, integer) from public, anon;
grant execute on function public.list_billable_services(date, date, integer) to authenticated;
