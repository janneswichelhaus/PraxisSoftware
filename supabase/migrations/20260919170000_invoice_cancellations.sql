-- =============================================================================
-- ABR-003c: Storno und Korrektur sind eigene Dokumente
--
-- ADR-009 Punkt 9 ist eindeutig: Eine ausgestellte Rechnung ist unveraenderbar,
-- Korrekturen laufen ueber "nachvollziehbare Korrektur-/Stornodokumente und
-- gegebenenfalls eine neue Rechnung". Diese Migration baut genau diese Kette -
-- und nichts daneben.
--
-- Vier Festlegungen tragen sie (**ANN-079**):
--
--   1. **Storniert ist ein abgeleiteter Zustand, kein dritter Wert.** Die
--      Rechnung selbst wird nicht angefasst: `invoices.status` bleibt bei
--      `draft` und `issued` (ANN-077, ANN-078), und der Trigger, der eine
--      ausgestellte Rechnung einfriert, bleibt unveraendert. Storniert ist
--      eine Rechnung, zu der ein **Stornodokument** existiert. Eine Spalte
--      koennte vom Dokument abweichen, eine Zeile nicht.
--   2. **Das Stornodokument traegt eine eigene Nummer aus demselben
--      Nummernkreis.** Es geht wie die Rechnung an den Empfaenger und ist
--      damit selbst ein ausgehendes Dokument; eine zweite Zaehlung daneben
--      waere ein zweiter Nummernkreis mit eigenen Luecken (ADR-009 Punkt 8).
--   3. **Das Storno gibt die Leistungen wieder frei, ohne eine Zeile zu
--      loeschen.** Die Rechnungszeile bekommt ein `released_at`; welche
--      Leistung auf welcher Rechnung stand, bleibt damit lesbar. Erst diese
--      Freigabe macht die Korrekturrechnung moeglich - ohne sie haenge die
--      Leistung fuer immer an einer stornierten Rechnung.
--   4. **Die Kette ist einfach und in beide Richtungen lesbar:** Rechnung ->
--      Stornodokument -> Korrekturrechnung. Die Korrekturrechnung merkt sich
--      in `replaces_invoice_id`, welche Rechnung sie ersetzt. Damit ist auch
--      die mehrfache Korrektur beantwortet, die ADR-009 als offene Folgefrage
--      fuehrt: Jede Korrektur zeigt auf genau ihre Vorgaengerin.
--
-- **Eine Rechnung mit stehenden Zahlungen wird nicht storniert.** Erst die
-- Zahlung stornieren (mit Grund, ABR-004), dann die Rechnung - sonst bliebe
-- ein Geldeingang an einem Dokument haengen, das es nicht mehr gibt.
--
-- Was NICHT hier entsteht: eine Teilstornierung einzelner Zeilen (ADR-009
-- Punkt 4 laesst die Rechnung als Ganzes entstehen, ANN-077), ein
-- Gutschriftsbeleg ueber einen frei eingegebenen Betrag, Mahnwesen und
-- Mahnstufen (ABR-005) und jede Ablage des gedruckten Dokuments (B14 Weg 1:
-- die Datei entsteht beim Nutzer, ADR-009 Punkt 11 bleibt bis Weg 3 offen).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Rechnungszeile kann freigegeben werden
--
-- `invoice_items` haelt die Invariante gegen Doppelabrechnung: eine Leistung
-- steht auf hoechstens einer Rechnung (ADR-009 Punkt 4). Nach einem Storno
-- muss dieselbe Leistung auf eine Korrekturrechnung koennen - und zwar ohne
-- dass ihre Vergangenheit verschwindet. Deshalb ein Zeitstempel und ein
-- **teilweiser** Index: Freigegebene Zeilen zaehlen nicht mehr mit, bleiben
-- aber stehen.
-- -----------------------------------------------------------------------------
alter table public.invoice_items
  add column released_at timestamptz;

comment on column public.invoice_items.released_at is
  'Gesetzt heisst: Die Rechnung wurde storniert und die Leistung ist wieder abrechenbar (ABR-003c). Die Zeile bleibt stehen - sie sagt weiter, auf welcher Rechnung die Leistung einmal stand.';

drop index public.invoice_items_service_key;

create unique index invoice_items_service_key
  on public.invoice_items (billable_service_id)
  where released_at is null;

-- -----------------------------------------------------------------------------
-- 2. Die eine Ausnahme von der Unveraenderlichkeit
--
-- Die Zeilen einer ausgestellten Rechnung bleiben eingefroren (ADR-009
-- Punkt 9). Das Storno braucht genau einen Schreibzugriff: `released_at` von
-- null auf einen Zeitpunkt. Der Trigger laesst diesen einen zu und prueft
-- dabei Feld fuer Feld, dass sonst nichts wandert - eine Ausnahme, die sich
-- nicht ausweiten laesst, ist keine Luecke.
-- -----------------------------------------------------------------------------
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
    -- Die Freigabe durch das Storno: nur beim Aendern, nur in eine Richtung,
    -- und nur wenn keine andere Spalte sich bewegt.
    if tg_op = 'UPDATE'
       and old.released_at is null
       and new.released_at is not null
       and new.id = old.id
       and new.organization_id = old.organization_id
       and new.invoice_id = old.invoice_id
       and new.billable_service_id = old.billable_service_id
       and new.sort_order = old.sort_order then
      return new;
    end if;

    raise exception 'the items of an issued invoice cannot be changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.invoice_items_frozen() is
  'Haelt die Zeilen einer ausgestellten Rechnung unveraenderlich (ADR-009 Punkt 9). Einzige Ausnahme seit ABR-003c: Das Storno setzt released_at und loest damit die Sperre gegen Doppelabrechnung; die Zeile selbst aendert sich dabei nicht. Das Loeschen bleibt dem Loeschlauf moeglich (ADR-008).';

-- -----------------------------------------------------------------------------
-- 3. Die Korrekturrechnung kennt ihre Vorgaengerin
--
-- `no action` statt `restrict`: Der Loeschlauf raeumt alle Rechnungen einer
-- Akte in einer Anweisung ab, und eine Kette innerhalb derselben Akte darf
-- daran nicht scheitern. `no action` prueft am Ende der Anweisung, `restrict`
-- sofort je Zeile.
-- -----------------------------------------------------------------------------
alter table public.invoices
  add column replaces_invoice_id uuid references public.invoices (id);

comment on column public.invoices.replaces_invoice_id is
  'Die stornierte Rechnung, die diese Rechnung ersetzt (ABR-003c, ADR-009 Punkt 9). null heisst: eine gewoehnliche Rechnung. Mehrfache Korrektur ergibt eine Kette, in der jede Rechnung auf genau ihre Vorgaengerin zeigt.';

create index invoices_replaces_idx on public.invoices (replaces_invoice_id)
  where replaces_invoice_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Das Stornodokument
--
-- Kein eigener Snapshot: Das Storno hebt genau eine Rechnung auf, und die
-- traegt ihr Dokument bereits unveraenderlich bei sich (ADR-009 Punkt 10).
-- Ein zweites jsonb waere eine zweite Fassung derselben Angaben.
-- -----------------------------------------------------------------------------
create table public.invoice_cancellations (
  id                  uuid primary key default extensions.gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  -- RESTRICT wie bei der Zahlung und nicht CASCADE: Ein Beleg, der still mit
  -- der Rechnung faellt, fehlt im Loeschjournal - und das Journal ist der
  -- Nachweis, dass geloescht wurde, was geloescht werden durfte (ADR-008
  -- Punkt 8).
  invoice_id          uuid not null references public.invoices (id) on delete restrict,
  cancellation_number text not null check (length(btrim(cancellation_number)) between 3 and 40),
  reason              text not null check (length(btrim(reason)) between 3 and 500),
  cancelled_on        date not null,
  created_at          timestamptz not null default now(),
  created_by          uuid
);

comment on table public.invoice_cancellations is
  'Stornodokument zu einer ausgestellten Rechnung (ABR-003c, ADR-009 Punkt 9). Seine Existenz ist der Zustand "storniert" - an der Rechnung steht dazu keine Spalte. Enthaelt ueber die Rechnung einen Patientenbezug, aber keine klinischen Angaben. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen dieser Migration (ADR-004).';
comment on column public.invoice_cancellations.cancellation_number is
  'Eigene Nummer aus demselben lueckenlosen Nummernkreis wie die Rechnung (ANN-075, ANN-079). Das Storno geht an denselben Empfaenger und ist damit selbst ein ausgehendes Dokument.';
comment on column public.invoice_cancellations.reason is
  'Warum storniert wurde, im Klartext und verpflichtend. Steht in der Zeile und NICHT im Auditeintrag: Ein freier Text kann Patientenbezug tragen, und Logs fuehren keinen (ADR-011).';

create unique index invoice_cancellations_invoice_key
  on public.invoice_cancellations (invoice_id);
create unique index invoice_cancellations_number_key
  on public.invoice_cancellations (organization_id, cancellation_number);
create index invoice_cancellations_org_idx
  on public.invoice_cancellations (organization_id, cancelled_on desc, id desc);

revoke all on public.invoice_cancellations from anon, authenticated;
alter table public.invoice_cancellations enable row level security;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('invoice_cancellations', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Stornodokumente. Fallen mit ihrer Rechnung und vor ihr, weil sie mit RESTRICT auf sie zeigen.', 24);

-- -----------------------------------------------------------------------------
-- 5. Ein Stornodokument ist selbst unveraenderlich
--
-- Dieselbe Bauart wie bei Rechnung und Zahlung: Die Sperre sitzt am Trigger
-- und gilt damit fuer jeden Weg in die Tabelle. Das Loeschen bleibt dem
-- Loeschlauf moeglich (ADR-008).
-- -----------------------------------------------------------------------------
create or replace function app.invoice_cancellations_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a cancellation document cannot be changed' using errcode = '23514';
end;
$$;

comment on function app.invoice_cancellations_frozen() is
  'Haelt ein Stornodokument unveraenderlich (ABR-003c, ADR-009 Punkt 9). Ein Storno wird nicht zurueckgenommen - eine irrtuemlich stornierte Rechnung wird als Korrekturrechnung neu ausgestellt.';

create trigger invoice_cancellations_frozen
  before update on public.invoice_cancellations
  for each row execute function app.invoice_cancellations_frozen();


-- -----------------------------------------------------------------------------
-- 6. Auditkatalog (ADR-010)
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
    'payment.recorded',
    'payment.voided'
  ));


-- -----------------------------------------------------------------------------
-- 7. Eine Rechnung stornieren
-- -----------------------------------------------------------------------------
create or replace function public.cancel_invoice(
  p_invoice_id uuid,
  p_reason     text
)
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
  v_prefix   text;
  v_nummer   text;
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

  -- Ein Entwurf wird verworfen, nicht storniert: Er traegt keine Nummer und
  -- hinterlaesst keine Luecke (ADR-009, Konsequenz zu Punkt 8).
  if v_invoice.status <> 'issued' then
    raise exception 'only an issued invoice can be cancelled' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'invoice is already cancelled' using errcode = '23514';
  end if;

  -- Ein Storno ohne Grund waere ein Beleg ohne Aussage - dieselbe Zusage wie
  -- beim Zahlungsstorno (ABR-004).
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a cancellation needs a reason' using errcode = '22023';
  end if;

  -- Zuerst das Geld, dann das Dokument: Eine stehende Zahlung an einer
  -- stornierten Rechnung waere ein Eingang ohne Forderung. Die Zahlung laesst
  -- sich mit Grund stornieren (ABR-004), danach geht das hier.
  if exists (
    select 1 from public.payments p
    where p.invoice_id = p_invoice_id and p.voided_at is null
  ) then
    raise exception 'void the payments of this invoice first' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.invoice_number_prefix into v_prefix
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  v_nummer := app.next_invoice_number(v_org, extract(year from v_heute)::smallint, v_prefix);

  insert into public.invoice_cancellations (
    organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by
  )
  values (v_org, p_invoice_id, v_nummer, btrim(p_reason), v_heute, v_actor);

  -- Die Leistungen sind wieder abrechenbar. Beides gehoert zusammen: die
  -- Freigabe der Zeile und der Zustand der Leistung; nur eines von beiden
  -- liesse die Leistung entweder unsichtbar oder doppelt abrechenbar.
  update public.invoice_items it
     set released_at = now()
   where it.invoice_id = p_invoice_id
     and it.released_at is null;

  update public.billable_services b
     set status = 'billable'
   where b.id in (
     select it.billable_service_id
     from public.invoice_items it
     where it.invoice_id = p_invoice_id
   );

  -- Der Grund steht in der Zeile, nicht hier: Ein freier Text kann
  -- Patientenbezug tragen (ADR-011, ADR-010 Punkt 3).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.cancelled', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_invoice.invoice_number,
                       'cancellation_number', v_nummer,
                       'total_cents', v_invoice.total_cents)
  );

  return v_nummer;
end;
$$;

comment on function public.cancel_invoice(uuid, text) is
  'Storniert eine ausgestellte Rechnung mit Grund und gibt ihre Leistungen wieder frei (ABR-003c, ADR-009 Punkt 9). Die Rechnung selbst bleibt unveraendert; das Stornodokument traegt eine eigene Nummer aus demselben Nummernkreis.';

revoke all on function public.cancel_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Die Korrekturrechnung
--
-- Ein gewoehnlicher Entwurf mit einer zusaetzlichen Aussage: Er ersetzt die
-- stornierte Rechnung. Er nimmt - wie jeder Entwurf - **alle** noch nicht
-- abgerechneten Leistungen der Patientin aus diesem Monat auf (ANN-077), also
-- auch eine, die nach dem Storno hinzugekommen ist. Etwas anderes waere eine
-- Auswahl einzelner Zeilen, und die schliesst ADR-009 Punkt 4 aus.
-- -----------------------------------------------------------------------------
create or replace function public.create_correction_draft(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    record;
  v_id     uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_alt
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'only a cancelled invoice can be corrected' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.patient_id = v_alt.patient_id
      and i.period_month = v_alt.period_month
      and i.status = 'draft'
  ) then
    raise exception 'a draft for this patient and month already exists' using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, replaces_invoice_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.recipient_id, v_alt.period_month, p_invoice_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = v_alt.patient_id
      and b.status = 'billable'
      and date_trunc('month', b.performed_on)::date = v_alt.period_month
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
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
    jsonb_build_object('surface', 'web', 'patient_id', v_alt.patient_id,
                       'period_month', v_alt.period_month, 'item_count', v_anzahl,
                       'replaces_invoice_id', p_invoice_id)
  );

  return v_id;
end;
$$;

comment on function public.create_correction_draft(uuid) is
  'Legt zu einer stornierten Rechnung den Entwurf der Korrekturrechnung an und verweist von ihm auf die ersetzte Rechnung (ABR-003c, ADR-009 Punkt 9). Nimmt alle wieder freien Leistungen des Monats auf (ANN-077).';

revoke all on function public.create_correction_draft(uuid) from public, anon;
grant execute on function public.create_correction_draft(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 9. Die Lesepfade kennen das Storno
--
-- Vier Funktionen ziehen nach. Unveraendert uebernommen bis auf den jeweils
-- genannten Zusatz - PostgreSQL kennt kein teilweises Ersetzen einer Funktion.
-- -----------------------------------------------------------------------------


-- 9a. Die Arbeitsliste: freigegebene Leistungen und der Weg zum Entwurf

drop function public.list_invoice_candidates(integer);

create or replace function public.list_invoice_candidates(p_limit integer default 100)
returns table (
  patient_id    uuid,
  patient_name  text,
  period_month  date,
  service_count integer,
  total_cents   integer,
  currency      text,
  has_draft     boolean,
  draft_id      uuid
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

  -- Erst buendeln, dann den Entwurf dazusuchen. Die Suche steht seit BEF-018
  -- als eigener Schritt daneben und nicht als Unterabfrage in der
  -- Gruppierung: Dort haette sie `b.performed_on` ausserhalb der
  -- Gruppierungsausdruecke gelesen, und PostgreSQL weist das zu Recht ab.
  -- Nebenbei entsteht so beides - "gibt es einen Entwurf" und "welcher" - aus
  -- derselben Abfrage statt aus zweien, die auseinanderlaufen koennten.
  return query
  select k.patient_id,
         k.patient_name,
         k.period_month,
         k.service_count,
         k.total_cents,
         k.currency,
         (entwurf.id is not null),
         entwurf.id
  from (
    select b.patient_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           date_trunc('month', b.performed_on)::date as period_month,
           count(*)::integer as service_count,
           sum(b.quantity * c.unit_price_cents)::integer as total_cents,
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    join public.patients p  on p.id = b.patient_id
    join public.persons  pe on pe.id = p.person_id
    where b.organization_id = v_org
      and b.status = 'billable'
      -- Seit ABR-003c zaehlt nur eine Zeile, die nicht freigegeben ist: Nach
      -- einem Storno ist die Leistung wieder abzurechnen.
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, date_trunc('month', b.performed_on)::date
  ) k
  left join lateral (
    -- Neu mit BEF-018: Die Zeile sagt nicht nur, DASS ein Entwurf steht,
    -- sondern fuehrt auch hin. Vorher war er in der Liste darunter zu suchen
    -- - der einzige Ort, an dem die Seite auf etwas verwies, das sie nicht
    -- anbot. Je Patientin und Monat gibt es hoechstens einen (ANN-077); das
    -- `limit` sagt das noch einmal, statt sich darauf zu verlassen.
    select i.id
    from public.invoices i
    where i.patient_id = k.patient_id
      and i.period_month = k.period_month
      and i.status = 'draft'
    limit 1
  ) entwurf on true
  order by k.period_month desc, k.family_name
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_invoice_candidates(integer) is
  'Erfasste Leistungen ohne Rechnung, gebuendelt nach Person und Kalendermonat (ABR-003, ANN-077). Die Arbeitsliste des Rechnungsbereichs. Seit ABR-003c ohne Leistungen, die auf einer stornierten Rechnung standen - die stehen wieder hier; seit BEF-018 mit der Kennung des vorhandenen Entwurfs.';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;


-- 9b. Der gewoehnliche Entwurf nimmt freigegebene Leistungen wieder auf

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
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
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


-- 9c. Nach dem Storno laesst sich eine Leistung wieder entfernen

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
      and it.released_at is null
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

  -- Freigegebene Rechnungszeilen fallen mit ihrer Leistung: Sie zeigen mit
  -- RESTRICT auf sie, und was die stornierte Rechnung ausgewiesen hat, steht
  -- in ihrem Snapshot und nicht in dieser Zuordnung (ADR-009 Punkt 10). Eine
  -- Zeile, die nicht freigegeben ist, kommt hier nie vorbei - der Block
  -- darueber weist den Vorgang dann schon ab.
  delete from public.invoice_items it
   using public.billable_services b
   where it.billable_service_id = b.id
     and b.appointment_id = p_appointment_id
     and it.released_at is not null;

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
  'Entfernt die noch nicht abgerechneten Leistungen eines Termins und nimmt die genutzte Menge der Grundlage zurueck (ABR-002). Seit ABR-003 auch dann abgewiesen, wenn die Leistung auf einem Rechnungsentwurf steht. Nach einem Storno ist die Leistung wieder frei und laesst sich entfernen (ABR-003c).';

revoke all on function public.delete_billable_services(uuid) from public, anon;
grant execute on function public.delete_billable_services(uuid) to authenticated;


-- 9d. Eine stornierte Rechnung steht in keinem offenen Posten

create or replace function public.list_open_items(p_limit integer default 100)
returns table (
  id                uuid,
  invoice_number    text,
  patient_id        uuid,
  patient_name      text,
  recipient_name    text,
  period_month      date,
  issued_on         date,
  due_on            date,
  total_cents       integer,
  paid_cents        integer,
  outstanding_cents integer,
  currency          text,
  overdue           boolean,
  open_total_cents  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  select offen.id, offen.invoice_number, offen.patient_id, offen.patient_name,
         offen.recipient_name, offen.period_month, offen.issued_on, offen.due_on,
         offen.total_cents, offen.paid_cents, offen.outstanding_cents,
         offen.currency,
         (offen.due_on < v_heute),
         sum(offen.outstanding_cents) over ()::integer
  from (
    select i.id, i.invoice_number, i.patient_id,
           pe.given_name || ' ' || pe.family_name as patient_name,
           coalesce(r.name, pe.given_name || ' ' || pe.family_name) as recipient_name,
           i.period_month, i.issued_on, i.due_on,
           i.total_cents,
           app.invoice_paid_cents(i.id) as paid_cents,
           (i.total_cents - app.invoice_paid_cents(i.id)) as outstanding_cents,
           i.currency
    from public.invoices i
    join public.patients pa on pa.id = i.patient_id
    join public.persons  pe on pe.id = pa.person_id
    left join public.invoice_recipients r on r.id = i.recipient_id
    where i.organization_id = v_org
      and i.status = 'issued'
      -- Eine stornierte Rechnung ist keine Forderung mehr (ABR-003c).
      and not exists (
        select 1 from public.invoice_cancellations c where c.invoice_id = i.id
      )
  ) offen
  where offen.outstanding_cents > 0
  order by offen.due_on, offen.invoice_number
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_open_items(integer) is
  'Ausgestellte Rechnungen mit offenem Betrag, aelteste Faelligkeit zuerst (ABR-004), stornierte ausgenommen (ABR-003c). open_total_cents traegt die Summe ueber ALLE offenen Posten, nicht nur ueber die gelieferten Zeilen.';

revoke all on function public.list_open_items(integer) from public, anon;
grant execute on function public.list_open_items(integer) to authenticated;


-- 9e. Die Rechnungsliste zeigt das Storno

drop function public.list_invoices(integer);

create or replace function public.list_invoices(p_limit integer default 100)
returns table (
  id                uuid,
  status            text,
  invoice_number    text,
  period_month      date,
  issued_on         date,
  due_on            date,
  patient_id        uuid,
  patient_name      text,
  recipient_name    text,
  recipient_kind    text,
  total_cents       integer,
  currency          text,
  item_count        integer,
  paid_cents        integer,
  outstanding_cents integer,
  payment_state     text,
  overdue           boolean,
  cancelled         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

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
         summe.anzahl::integer,
         -- Neu mit ABR-004: Der Zahlungsstand wird gerechnet, nicht gelesen.
         -- Am Entwurf gibt es keinen - an ihm kann niemand zahlen.
         case when i.status = 'issued' then app.invoice_paid_cents(i.id) else 0 end,
         case when i.status = 'issued'
              then i.total_cents - app.invoice_paid_cents(i.id) else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, app.invoice_paid_cents(i.id))
              else 'unpaid' end,
         -- Seit ABR-003c: Eine stornierte Rechnung wird nicht ueberfaellig.
         (i.status = 'issued' and i.due_on < v_heute
          and app.invoice_paid_cents(i.id) < i.total_cents
          and not exists (
            select 1 from public.invoice_cancellations c where c.invoice_id = i.id
          )),
         exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
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
  'Rechnungen der Praxis mit Zustand, Nummer, Empfaenger, Betrag, Zahlungsstand und Storno (ABR-003, ABR-004, ABR-003c). Ein Entwurf rechnet live, eine ausgestellte Rechnung zeigt ihren festgeschriebenen Betrag; Zahlungsstand und Storno sind abgeleitet und nirgends gepflegt (ADR-009 Punkt 12, ANN-079).';

revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;


-- 9f. Die einzelne Rechnung zeigt Storno und Kette

create or replace function public.get_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_bezahlt  integer;
  v_storno   record;
  v_ersetzt  text;
  v_korrektur record;
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

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  -- Am Entwurf gibt es keinen Zahlungsstand: An ihm kann niemand zahlen.
  v_bezahlt := case when v_invoice.status = 'issued'
                    then app.invoice_paid_cents(p_invoice_id) else 0 end;

  -- Die Kette aus ABR-003c, in beide Richtungen lesbar: das Stornodokument
  -- zu dieser Rechnung, die Rechnung, die sie ersetzt, und die Korrektur, die
  -- sie ersetzt hat.
  select c.cancellation_number, c.reason, c.cancelled_on into v_storno
  from public.invoice_cancellations c
  where c.invoice_id = p_invoice_id;

  select i.invoice_number into v_ersetzt
  from public.invoices i
  where i.id = v_invoice.replaces_invoice_id;

  select i.id, i.invoice_number into v_korrektur
  from public.invoices i
  where i.replaces_invoice_id = p_invoice_id
  order by i.created_at
  limit 1;

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
    'paid_cents', v_bezahlt,
    'outstanding_cents', coalesce(v_invoice.total_cents, 0) - v_bezahlt,
    'payment_state', case when v_invoice.status = 'issued'
                          then app.invoice_payment_state(v_invoice.total_cents, v_bezahlt)
                          else 'unpaid' end,
    'overdue', (v_invoice.status = 'issued' and v_invoice.due_on < v_heute
                and v_bezahlt < v_invoice.total_cents
                and v_storno is null),
    'cancellation', case when v_storno is null then null else
      jsonb_build_object('cancellation_number', v_storno.cancellation_number,
                         'reason', v_storno.reason,
                         'cancelled_on', v_storno.cancelled_on)
    end,
    'replaces_invoice_id', v_invoice.replaces_invoice_id,
    'replaces_invoice_number', v_ersetzt,
    'correction_invoice_id', v_korrektur.id,
    'correction_invoice_number', v_korrektur.invoice_number,
    'document', coalesce(v_invoice.snapshot, app.build_invoice_document(p_invoice_id))
  );
end;
$$;

comment on function public.get_invoice(uuid) is
  'Eine Rechnung als Dokument, mit ihrem abgeleiteten Zahlungsstand und ihrer Storno- und Korrekturkette (ABR-003, ABR-004, ABR-003c). Ein Entwurf wird aus den heutigen Stammdaten gebaut, eine ausgestellte Rechnung kommt aus ihrem Snapshot (ADR-009 Punkt 10).';

revoke all on function public.get_invoice(uuid) from public, anon;
grant execute on function public.get_invoice(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 10. Der Loeschlauf nimmt das Stornodokument mit
--
-- Unveraendert aus 20260919160000_payments.sql uebernommen bis auf den einen
-- neuen Block ganz vorn: Stornodokumente fallen vor den Rechnungen, weil sie
-- mit RESTRICT auf sie zeigen (ADR-008 Punkt 8).
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

  -- Neu mit ABR-003c: Stornodokumente zuerst. Sie zeigen mit RESTRICT auf
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
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-003c einschliesslich Stornodokumenten, Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger. Prueft KEINEN Legal Hold und KEINE steuerliche Frist - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 11. Die Wiederanwendung kennt das Stornodokument
--
-- Unveraendert bis auf einen Eintrag in der Reihenfolge: Was zuerst geloescht
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
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-003c einschliesslich Stornodokumenten, Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger.';
