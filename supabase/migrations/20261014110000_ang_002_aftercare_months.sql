-- =============================================================================
-- ANG-002 (ANG-EPIC-001): Je Abo-Monat eine Leistung und eine Monatsrechnung
--
-- ADR-009 Punkt 21: Das Nachsorge-Abo erzeugt je Monat eine Leistung und eine
-- Monatsrechnung im Bereich `therapy`. Die Punkte 1 bis 20 gelten
-- unveraendert - Snapshot, ein Bereich je Rechnung, das Steuerkennzeichen am
-- Posten. Diese Migration baut deshalb nichts neben der Abrechnung, sondern
-- fuehrt das Abo durch denselben Weg:
--
--   service_catalog_items.item_kind  + 'aftercare_month': der Preis des
--                                    Abo-Monats steht in der Preisliste,
--                                    versioniert wie jeder andere (Punkt 5)
--   app.aftercare_tax_allowed        das Steuerkennzeichen (ANN-269)
--   billable_services                + aftercare_subscription_id: eine
--                                    Leistung ohne Termin; je Abo-Monat
--                                    hoechstens eine (Punkt 4)
--   app.aftercare_month_price        die am ersten Tag des Monats geltende
--                                    Position
--   app.aftercare_month_blocker      warum ein Monat (noch) nicht erfasst
--                                    werden kann (ANN-270, ANN-271)
--   public.list_due_aftercare_months die faelligen Abo-Monate
--   public.record_aftercare_month    einen Abo-Monat erfassen
--   public.delete_aftercare_month    eine Erfassung zuruecknehmen
--
-- Die Rechnung entsteht ueber den Monatsentwurf (create_invoice_draft): Eine
-- Abo-Leistung hat keinen Termin und damit keine Grundlage, sie buendelt nach
-- ihrem Kalendermonat (ANN-077 Fassung 2). Dafuer werden vier Stellen, die
-- die Grundlage ueber den Termin lesen, vom inneren auf den aeusseren Join
-- umgestellt. Das Dokument nennt am Abo-Monat seinen Zeitraum, nicht nur
-- seinen ersten Tag (Paragraf 14 Abs. 4 Nr. 6 UStG: Zeitpunkt der Leistung).
--
-- Erfasst wird von Hand im Buero, wie jede Leistung (ANN-071); ein Lauf per
-- pg_cron ist bewusst nicht gebaut.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Positionsart in der Preisliste
-- -----------------------------------------------------------------------------

-- ANN-269: Bis die Steuerberatung antwortet (B4, ANFRAGEN Frage 7), traegt
-- der Abo-Monat den Regelsatz. Ohne aerztliche Verordnung laesst sich der
-- therapeutische Zweck kaum belegen (UStAE 4.14.1); "steuerfrei" waere dann
-- eine falsche Angabe (PROJECT_PRINCIPLES.md 1.2, ADR-009 Punkt 15).
create function app.aftercare_tax_allowed(p_tax_treatment text, p_tax_rate_permille smallint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tax_treatment = 'taxable' and p_tax_rate_permille = 190
$$;

revoke all on function app.aftercare_tax_allowed(text, smallint) from public, anon, authenticated;

comment on function app.aftercare_tax_allowed(text, smallint) is
  'ANG-002 (ANN-269): das Steuerkennzeichen, das ein Abo-Monat tragen darf - bis zur Antwort der Steuerberatung (B4) steuerpflichtig zum Regelsatz. Die eine Stelle fuer die Annahme.';

alter table public.service_catalog_items
  drop constraint service_catalog_items_item_kind_check;
alter table public.service_catalog_items
  add constraint service_catalog_items_item_kind_check
    check (item_kind in ('treatment', 'absence_fee', 'aftercare_month'));

alter table public.service_catalog_items
  add constraint service_catalog_items_aftercare_month check (
    item_kind <> 'aftercare_month'
    or (service_area = 'therapy'
        and remedy is null
        and app.aftercare_tax_allowed(tax_treatment, tax_rate_permille))
  );

comment on constraint service_catalog_items_aftercare_month on public.service_catalog_items is
  'ANG-002: Der Abo-Monat ist eine Leistung des Bereichs therapy (ADR-009 Punkt 21), ohne Heilmittel und mit dem Steuerkennzeichen aus app.aftercare_tax_allowed (ANN-269).';

-- Je Preisliste hoechstens ein Abo-Monat: Sonst gaebe es zwei Preise fuer
-- denselben Monat.
create unique index service_catalog_items_version_aftercare_key
  on public.service_catalog_items (catalog_version_id) where item_kind = 'aftercare_month';

-- -----------------------------------------------------------------------------
-- 2. Die Leistung ohne Termin
-- -----------------------------------------------------------------------------
alter table public.billable_services
  alter column appointment_id drop not null;

alter table public.billable_services
  add column aftercare_subscription_id uuid
    references public.aftercare_subscriptions (id) on delete restrict;

alter table public.billable_services
  add constraint billable_services_source check (
    (appointment_id is not null and aftercare_subscription_id is null)
    or
    (appointment_id is null and aftercare_subscription_id is not null
       and service_area = 'therapy' and patient_id is not null and quantity = 1)
  );

comment on column public.billable_services.aftercare_subscription_id is
  'ANG-002: das Nachsorge-Abo, aus dem diese Leistung als Abo-Monat entstanden ist (ADR-009 Punkt 21). Dann ohne Termin; performed_on ist der erste Tag des Abo-Monats.';
comment on constraint billable_services_source on public.billable_services is
  'ANG-002: Eine Leistung entsteht entweder an einem Termin oder als Abo-Monat aus einem Nachsorge-Abo - nie aus beidem, nie aus nichts.';

-- Die Invariante gegen Doppelabrechnung (ADR-009 Punkt 4) fuer das Abo: je
-- Abo-Monat hoechstens eine Leistung.
create unique index billable_services_aftercare_month_key
  on public.billable_services (aftercare_subscription_id, performed_on)
  where aftercare_subscription_id is not null;

-- Leistung und Quelle passen zusammen. Aus 20260930120000_trn_007_training_services.sql
-- um den Abo-Monat ergaenzt: Am Termin nie die Position des Abos, am Abo nur
-- sie, und die Person des Abos ist die der Leistung.
create or replace function app.billable_service_matches_appointment_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind     text;
  v_patient  uuid;
  v_training uuid;
  v_erwartet text;
  v_art      text;
begin
  select c.item_kind into v_art
  from public.service_catalog_items c where c.id = new.catalog_item_id;

  if new.appointment_id is null then
    if v_art is distinct from 'aftercare_month' then
      raise exception 'only an aftercare month can be billed without an appointment'
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.aftercare_subscriptions s
      where s.id = new.aftercare_subscription_id
        and s.patient_id = new.patient_id
        and s.organization_id = new.organization_id
    ) then
      raise exception 'billable service does not belong to the patient of its aftercare subscription'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if v_art = 'aftercare_month' then
    raise exception 'an aftercare month is not billed at an appointment' using errcode = '23514';
  end if;

  select a.kind, a.patient_id, a.training_relationship_id
    into v_kind, v_patient, v_training
  from public.appointments a
  where a.id = new.appointment_id;

  v_erwartet := app.service_area_of_appointment_kind(v_kind);

  if v_erwartet is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '23514';
  end if;

  if new.service_area is distinct from v_erwartet then
    raise exception 'service area % does not match the appointment context % (expected %)',
      new.service_area, v_kind, v_erwartet
      using errcode = '23514';
  end if;

  -- TRN-007: dasselbe Verhaeltnis wie der Termin, in beiden Spalten.
  if new.patient_id is distinct from v_patient
     or new.training_relationship_id is distinct from v_training then
    raise exception 'billable service does not belong to the relationship of its appointment'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger billable_services_area_matches_context on public.billable_services;
create trigger billable_services_area_matches_context
  before insert or update of appointment_id, aftercare_subscription_id, catalog_item_id,
                             service_area, patient_id, training_relationship_id
  on public.billable_services
  for each row execute function app.billable_service_matches_appointment_context();

-- -----------------------------------------------------------------------------
-- 3. Preis und Hindernisse eines Abo-Monats
-- -----------------------------------------------------------------------------

-- Die Position des Abo-Monats in der Preisliste, die am ersten Tag des
-- Monats gilt (ADR-009 Punkt 5). Keine Zeile: Die Liste nennt keinen.
create function app.aftercare_month_price(p_organization_id uuid, p_month_start date)
returns table (catalog_item_id uuid, unit_price_cents integer, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.unit_price_cents, c.currency
  from public.service_catalog_items c
  where c.catalog_version_id = app.active_service_catalog_version(p_organization_id, p_month_start)
    and c.item_kind = 'aftercare_month'
$$;

revoke all on function app.aftercare_month_price(uuid, date) from public, anon, authenticated;

-- Warum ein Abo-Monat nicht erfasst werden kann; null: Er kann.
--
--   not_a_month   der Tag ist kein Beginn eines Abo-Monats dieses Abos
--   not_due       der Monat hat noch nicht begonnen (ANN-270)
--   after_end     der Monat beginnt nach dem Ende des Abos
--   care_open     die Behandlung laeuft wieder (ANN-271)
--   no_price      die geltende Preisliste nennt keinen Abo-Monat
create function app.aftercare_month_blocker(p_subscription_id uuid, p_month_start date)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_abo    public.aftercare_subscriptions%rowtype;
  v_heute  date;
  v_index  integer;
begin
  select * into v_abo from public.aftercare_subscriptions s where s.id = p_subscription_id;
  if not found then
    return 'not_a_month';
  end if;
  v_index := app.aftercare_month_index(v_abo.starts_on, p_month_start);
  if v_index < 0 or app.aftercare_month_start(v_abo.starts_on, v_index) <> p_month_start then
    return 'not_a_month';
  end if;
  if v_abo.ends_on is not null and p_month_start > v_abo.ends_on then
    return 'after_end';
  end if;
  v_heute := app.training_today(v_abo.organization_id);
  if p_month_start > v_heute then
    return 'not_due';
  end if;
  -- ANN-271: Laeuft die Behandlung wieder, wird kein Abo-Monat berechnet -
  -- waehrend der Behandlung ist die Plattform Teil der Heilbehandlung (4.6).
  -- Die Praxis beendet das Abo oder erfasst, sobald die Versorgung wieder
  -- abgeschlossen ist.
  if app.aftercare_earliest_start(v_abo.patient_id) is null then
    return 'care_open';
  end if;
  if not exists (select 1 from app.aftercare_month_price(v_abo.organization_id, p_month_start)) then
    return 'no_price';
  end if;
  return null;
end;
$$;

revoke all on function app.aftercare_month_blocker(uuid, date) from public, anon, authenticated;

comment on function app.aftercare_month_blocker(uuid, date) is
  'ANG-002: warum ein Abo-Monat nicht erfasst werden kann (not_a_month, after_end, not_due, care_open, no_price) oder null. Zu Beginn faellig (ANN-270), nicht waehrend einer neuen Behandlung (ANN-271).';

-- -----------------------------------------------------------------------------
-- 4. Faellige Abo-Monate
--
-- Je Abo die Monate vom Beginn bis heute bzw. bis zum Ende, die noch keine
-- Leistung haben. Ein gesperrter Monat steht mit seinem Grund da, damit das
-- Buero sieht, warum er nicht geht. Hoechstens zehn Jahre je Abo.
-- -----------------------------------------------------------------------------
create function public.list_due_aftercare_months()
returns table (
  subscription_id  uuid,
  patient_id       uuid,
  patient_name     text,
  month_start      date,
  month_end        date,
  unit_price_cents integer,
  currency         text,
  blocker          text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_heute date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    perform app.record_denied_read(auth.uid(), 'aftercare.read', 'not allowed to read aftercare months');
    return;
  end if;
  v_org := app.current_organization_id();
  v_heute := app.training_today(v_org);

  return query
  select s.id,
         s.patient_id,
         pe.given_name || ' ' || pe.family_name,
         m.beginn,
         app.aftercare_month_end(s.starts_on, m.n),
         preis.unit_price_cents,
         preis.currency,
         app.aftercare_month_blocker(s.id, m.beginn)
  from public.aftercare_subscriptions s
  join public.patients p on p.id = s.patient_id
  join public.persons pe on pe.id = p.person_id
  cross join lateral (
    select g.n, app.aftercare_month_start(s.starts_on, g.n) as beginn
    from generate_series(0, least(app.aftercare_month_index(s.starts_on, v_heute), 119)) g(n)
  ) m
  left join lateral app.aftercare_month_price(v_org, m.beginn) preis on true
  where s.organization_id = v_org
    and (s.ends_on is null or m.beginn <= s.ends_on)
    and not exists (
      select 1 from public.billable_services b
      where b.aftercare_subscription_id = s.id and b.performed_on = m.beginn
    )
  order by m.beginn, pe.family_name, s.id
  limit 200;
end;
$$;

revoke all on function public.list_due_aftercare_months() from public, anon;
grant execute on function public.list_due_aftercare_months() to authenticated;

comment on function public.list_due_aftercare_months() is
  'ANG-002: Abo-Monate, die begonnen haben und noch keine Leistung tragen, mit Preis und gegebenenfalls dem Grund, warum sie nicht erfasst werden koennen (owner, office).';

-- -----------------------------------------------------------------------------
-- 5. Einen Abo-Monat erfassen und zuruecknehmen
-- -----------------------------------------------------------------------------
create function public.record_aftercare_month(p_subscription_id uuid, p_month_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_abo     public.aftercare_subscriptions%rowtype;
  v_grund   text;
  v_position uuid;
  v_id      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    raise exception 'not allowed to manage aftercare subscriptions' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  -- Unter Sperre der Akte: Kuendigung und Wiederaufnahme der Behandlung
  -- laufen nicht an der Pruefung vorbei.
  perform 1 from public.patients p
  join public.aftercare_subscriptions s on s.patient_id = p.id
  where s.id = p_subscription_id and s.organization_id = v_org
  for update of p;
  select * into v_abo from public.aftercare_subscriptions s
  where s.id = p_subscription_id and s.organization_id = v_org;
  if not found then
    raise exception 'aftercare subscription not found' using errcode = '42501';
  end if;

  v_grund := app.aftercare_month_blocker(p_subscription_id, p_month_start);
  if v_grund is not null then
    raise exception 'aftercare month cannot be recorded: %', v_grund using errcode = '22023';
  end if;

  select pr.catalog_item_id into v_position
  from app.aftercare_month_price(v_org, p_month_start) pr;

  insert into public.billable_services (
    organization_id, patient_id, appointment_id, aftercare_subscription_id,
    catalog_item_id, quantity, performed_on, created_by
  )
  values (v_org, v_abo.patient_id, null, v_abo.id, v_position, 1, p_month_start, v_actor)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'aftercare month already recorded' using errcode = '23505';
end;
$$;

revoke all on function public.record_aftercare_month(uuid, date) from public, anon;
grant execute on function public.record_aftercare_month(uuid, date) to authenticated;

comment on function public.record_aftercare_month(uuid, date) is
  'ANG-002: einen Abo-Monat als Leistung erfassen (owner, office) - zum Preis der am ersten Tag geltenden Preisliste, je Monat hoechstens einmal (ADR-009 Punkte 4, 5, 21).';

create function public.delete_aftercare_month(p_billable_service_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    raise exception 'not allowed to manage aftercare subscriptions' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  if exists (
    select 1 from public.invoice_items it
    where it.billable_service_id = p_billable_service_id and it.released_at is null
  ) then
    raise exception 'aftercare month is on an invoice' using errcode = '23514';
  end if;

  delete from public.billable_services b
  where b.id = p_billable_service_id
    and b.organization_id = v_org
    and b.aftercare_subscription_id is not null
    and b.status = 'billable';
  if not found then
    raise exception 'aftercare month not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_aftercare_month(uuid) from public, anon;
grant execute on function public.delete_aftercare_month(uuid) to authenticated;

comment on function public.delete_aftercare_month(uuid) is
  'ANG-002: die Erfassung eines Abo-Monats zuruecknehmen (owner, office), solange er auf keiner Rechnung steht.';

-- Eine Fehlanlage entfernen: mit Leistung nicht mehr (ANG-001, jetzt mit
-- eigener Meldung statt der Fremdschluesselverletzung).
create or replace function public.delete_aftercare_subscription(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    raise exception 'not allowed to manage aftercare subscriptions' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  if exists (
    select 1 from public.billable_services b
    where b.aftercare_subscription_id = p_subscription_id
  ) then
    raise exception 'aftercare subscription has recorded months' using errcode = '23514';
  end if;

  delete from public.aftercare_subscriptions s
  where s.id = p_subscription_id and s.organization_id = v_org;
  if not found then
    raise exception 'aftercare subscription not found' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Die Rechnung
--
-- Der letzte Tag des Abo-Monats einer Leistung; null an einer Leistung vom
-- Termin. Aus der jeweils juengsten Fassung uebernommen: create_invoice_draft,
-- create_correction_draft, list_invoice_candidates und
-- app.assert_invoice_items_match_basis lesen den Termin jetzt mit einem
-- aeusseren Join, app.build_invoice_document nennt den Zeitraum. Das Schema
-- des Dokuments bleibt Fassung 5; `period_until` kommt als Schluessel hinzu,
-- den aeltere Snapshots nicht tragen.
-- -----------------------------------------------------------------------------
create function app.billable_service_period_until(p_billable_service_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select app.aftercare_month_end(s.starts_on, app.aftercare_month_index(s.starts_on, b.performed_on))
  from public.billable_services b
  join public.aftercare_subscriptions s on s.id = b.aftercare_subscription_id
  where b.id = p_billable_service_id
$$;

revoke all on function app.billable_service_period_until(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_draft(p_patient_id uuid, p_period_month date, p_service_area text DEFAULT 'therapy'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_monat   date;
  v_bereich text;
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
  v_bereich := coalesce(nullif(btrim(p_service_area), ''), 'therapy');

  if v_bereich not in ('therapy', 'training') then
    raise exception 'unknown service area %', p_service_area using errcode = '22023';
  end if;

  -- TRN-008: Trainingsleistungen haengen am Trainingsverhaeltnis, nie an der
  -- Akte (ADR-021 Punkt 3). Ihr Entwurf entsteht ueber
  -- create_training_invoice_draft; hier gibt es fuer `training` nichts zu
  -- finden, und die Meldung sagt, wo es steht.
  if v_bereich = 'training' then
    raise exception 'training invoices are drafted for the training relationship (create_training_invoice_draft)'
      using errcode = '22023';
  end if;

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

  -- ABR-032: Leistungen an Terminen mit Grundlage gehoeren auf die Rechnung
  -- ihrer Grundlage (create_invoice_draft_for_basis); der Monat buendelt nur
  -- noch, was keine hat.
  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area, created_by
  )
  values (v_org, p_patient_id, v_empf, v_monat, v_bereich, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und damit keine Grundlage.
    left join public.appointments a     on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and a.treatment_basis_id is null
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_correction_draft(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

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
    where i.organization_id = v_org
      and i.patient_id is not distinct from v_alt.patient_id
      and i.training_relationship_id is not distinct from v_alt.training_relationship_id
      and i.service_area = v_alt.service_area
      and i.status = 'draft'
      -- ABR-032: dieselbe Klammer - die Grundlage, ohne sie der Monat.
      and i.treatment_basis_id is not distinct from v_alt.treatment_basis_id
      and (v_alt.treatment_basis_id is not null or i.period_month = v_alt.period_month)
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, training_relationship_id, recipient_id, period_month,
    service_area, replaces_invoice_id, treatment_basis_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.training_relationship_id, v_alt.recipient_id,
          v_alt.period_month, v_alt.service_area, p_invoice_id, v_alt.treatment_basis_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und damit keine Grundlage.
    left join public.appointments a     on a.id = b.appointment_id
    where b.organization_id = v_org
      and b.patient_id is not distinct from v_alt.patient_id
      and b.training_relationship_id is not distinct from v_alt.training_relationship_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      -- ABR-032: dieselbe Klammer wie die stornierte Rechnung - die Grundlage,
      -- ohne sie der Monat, und dann nur Leistungen ohne Grundlage (die
      -- gehoeren auf die Rechnung ihrer Verordnung).
      and (
        (v_alt.treatment_basis_id is not null and a.treatment_basis_id = v_alt.treatment_basis_id)
        or (v_alt.treatment_basis_id is null
            and a.treatment_basis_id is null
            and date_trunc('month', b.performed_on)::date = v_alt.period_month)
      )
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid, treatment_basis_id uuid, basis_kind text, basis_issued_on date, first_performed_on date, last_performed_on date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();

  -- Erst buendeln, dann den Entwurf dazusuchen (BEF-018). Der Bereich steht
  -- seit ABR-009 in beiden Schritten: Er ist der dritte Schluessel der
  -- Klammer und nicht eine Spalte, die nebenher mitlaeuft.
  return query
  select k.patient_id,
         k.training_relationship_id,
         k.patient_name,
         k.period_month,
         k.service_area,
         k.service_count,
         k.total_cents,
         k.currency,
         (entwurf.id is not null),
         entwurf.id,
         k.treatment_basis_id,
         tb.treatment_basis_kind,
         tb.issued_on,
         k.erste,
         k.letzte
  from (
    select b.patient_id,
           b.training_relationship_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           -- ABR-032: Mit Grundlage ist sie die Klammer und der Monat nennt
           -- nur den Beginn; ohne Grundlage ist es der Kalendermonat der
           -- Gruppe - in beiden Faellen der Monat der ersten Leistung.
           date_trunc('month', min(b.performed_on))::date as period_month,
           a.treatment_basis_id,
           min(b.performed_on) as erste,
           max(b.performed_on) as letzte,
           b.service_area,
           count(*)::integer as service_count,
           -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
           sum(app.billable_service_amount(b.id))::integer as total_cents,
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    -- ANG-002: Ein Abo-Monat hat keinen Termin und buendelt nach dem Monat.
    left join public.appointments a on a.id = b.appointment_id
    left join public.patients p on p.id = b.patient_id
    left join public.training_relationships t on t.id = b.training_relationship_id
    join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
    where b.organization_id = v_org
      and b.status = 'billable'
      -- Seit ABR-003c zaehlt nur eine Zeile, die nicht freigegeben ist: Nach
      -- einem Storno ist die Leistung wieder abzurechnen.
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, b.training_relationship_id, a.treatment_basis_id,
             case when a.treatment_basis_id is null
                  then date_trunc('month', b.performed_on)::date end,
             b.service_area
  ) k
  left join public.treatment_bases tb on tb.id = k.treatment_basis_id
  left join lateral (
    select i.id
    from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from k.patient_id
      and i.training_relationship_id is not distinct from k.training_relationship_id
      and i.service_area = k.service_area
      and i.status = 'draft'
      and i.treatment_basis_id is not distinct from k.treatment_basis_id
      and (k.treatment_basis_id is not null or i.period_month = k.period_month)
    limit 1
  ) entwurf on true
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

CREATE OR REPLACE FUNCTION app.assert_invoice_items_match_basis(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_basis   uuid;
  v_bereich text;
begin
  select i.treatment_basis_id, i.service_area into v_basis, v_bereich
  from public.invoices i where i.id = p_invoice_id;

  if v_bereich <> 'therapy' then
    return;
  end if;

  if exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    -- ANG-002: ein Abo-Monat ohne Termin gehoert nie zu einer Grundlage.
    left join public.appointments a on a.id = b.appointment_id
    where it.invoice_id = p_invoice_id
      and a.treatment_basis_id is distinct from v_basis
  ) then
    raise exception 'invoice items do not belong to the treatment basis of the invoice'
      using errcode = '23514';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION app.build_invoice_document(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
           app.billable_service_amount(b.id) as brutto,
           jsonb_build_object(
             'performed_on',      b.performed_on,
             'code',              c.code,
             'label',             c.label,
             'item_kind',         c.item_kind,
             'quantity',          b.quantity,
             'unit_price_cents',  app.billable_service_amount(b.id) / b.quantity,
             'line_total_cents',  app.billable_service_amount(b.id),
             'currency',          c.currency,
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             -- ABR-032 (schema_version 5): Anteil am Terminhonorar? Die
             -- Darstellung fasst gleiche Positionen mit ihren Tagen zusammen.
             'session_fee',       exists (
                                    select 1 from public.appointment_session_fees f
                                    where f.appointment_id = b.appointment_id
                                  ) and c.remedy is not null,
             -- ANG-002: Ein Abo-Monat nennt seinen Zeitraum, nicht nur den
             -- ersten Tag (Par. 14 Abs. 4 Nr. 6 UStG). Sonst null.
             'period_until',      app.billable_service_period_until(b.id)
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
  -- Position (Par. 19 UStG). Der Grund der Befreiung steht an der Gruppe
  -- (ABR-006, ANN-082).
  select jsonb_agg(g.gruppe order by g.tax_treatment, g.tax_rate_permille),
         sum(g.steuer)::integer
    into v_gruppen, v_steuer
  from (
    select c.tax_treatment,
           c.tax_rate_permille,
           sum(app.billable_service_amount(b.id))::integer as brutto,
           case
             when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
             else round(sum(app.billable_service_amount(b.id))::numeric
                        * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
           end as steuer,
           jsonb_build_object(
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             'gross_cents',       sum(app.billable_service_amount(b.id))::integer,
             'tax_cents',
               case
                 when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                 else round(sum(app.billable_service_amount(b.id))::numeric
                            * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
               end,
             'net_cents',
               sum(app.billable_service_amount(b.id))::integer
               - case
                   when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                   else round(sum(app.billable_service_amount(b.id))::numeric
                              * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
                 end,
             'exemption_reason', app.tax_exemption_reason(c.tax_treatment)
           ) as gruppe
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
    group by c.tax_treatment, c.tax_rate_permille
  ) g;

  -- Verordnungsbezug: Bauart, Ausstellungsdatum, Verordner:in - und seit
  -- schema_version 4 die Diagnose der Verordnung, ICD-10 und Text (ANN-229).
  -- Private Kassen und Beihilfe erwarten sie auf der Rechnung. Ob sie
  -- draufsteht, entscheidet allein app.invoice_shows_diagnosis(). Therapieziel
  -- und Verordnerhinweis bleiben weg (Datensparsamkeit), am Selbstzahler gibt
  -- es keine Diagnose.
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
               end,
             'diagnosis_icd10',
               case when app.invoice_shows_diagnosis() then tb.diagnosis_icd10 end,
             'diagnosis',
               case when app.invoice_shows_diagnosis() then nullif(btrim(tb.diagnosis), '') end
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
  --
  -- TRN-008 (ANN-182): Eine Trainingsrechnung geht an die Kund:in selbst, mit
  -- der Anschrift aus dem Trainingskontakt - nie aus der Akte, auch wenn
  -- dieselbe Person eine hat (ADR-021 Punkt 3). Seit ABN-020 (BEF-111) mit
  -- Strasse und Hausnummer in getrennten Feldern wie in der Akte.
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       tc.street,
             'house_number', tc.house_number,
             'postal_code',  tc.postal_code,
             'city',         tc.city,
             'reference',    null
           )
      into v_empfaenger
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details tc on tc.training_relationship_id = t.id
    where t.id = v_invoice.training_relationship_id;
  elsif v_invoice.recipient_id is null then
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
  --
  -- TRN-008 (ANN-182): Im Training ist sie zugleich die Empfaengerin; das
  -- Geburtsdatum dient in der Behandlung der Zuordnung bei Beihilfe und
  -- Versicherung und bleibt im Training weg (Datenminimierung, Art. 5 Abs. 1
  -- lit. c DSGVO). Der Schluessel heisst im Snapshot weiter `patient`: Er
  -- nennt die Person, fuer die geleistet wurde; die Beschriftung waehlt die
  -- Darstellung am Bereich.
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'name',          pe.given_name || ' ' || pe.family_name,
             'date_of_birth', null
           )
      into v_patient
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    where t.id = v_invoice.training_relationship_id;
  else
    select jsonb_build_object(
             'name',          pe.given_name || ' ' || pe.family_name,
             'date_of_birth', pc.date_of_birth
           )
      into v_patient
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.id = v_invoice.patient_id;
  end if;

  return jsonb_build_object(
    'schema_version', 5,
    'period_month', v_invoice.period_month,
    -- ABR-032: der erste und der letzte Leistungstag der Rechnung.
    'service_period', (
      select jsonb_build_object(
               'from', min(b.performed_on),
               'to', max(coalesce(app.billable_service_period_until(b.id), b.performed_on)))
      from public.invoice_items it
      join public.billable_services b on b.id = it.billable_service_id
      where it.invoice_id = p_invoice_id
    ),
    'service_area', v_invoice.service_area,
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
$function$;

-- -----------------------------------------------------------------------------
-- 7. Die Sicht der Akte: erfasste Monate und Preis des naechsten
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_patient_aftercare(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_heute date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_aftercare() then
    perform app.record_denied_read(auth.uid(), 'aftercare.read', 'not allowed to read aftercare subscriptions');
    return null;
  end if;
  v_org := app.current_organization_id();
  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    return null;
  end if;
  v_heute := app.training_today(v_org);

  return jsonb_build_object(
    'today', v_heute,
    'earliest_start', app.aftercare_earliest_start(p_patient_id),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'starts_on', s.starts_on,
               'ends_on', s.ends_on,
               'created_at', s.created_at,
               'created_by_name', up.display_name,
               'cancelled_on', s.cancelled_on,
               'cancelled_via', s.cancelled_via,
               'cancelled_access_kind', s.cancelled_access_kind,
               'cancelled_representative_name', s.cancelled_representative_name,
               'current_month_end', case when s.ends_on is null then
                 case when v_heute < s.starts_on then s.starts_on - 1
                      else app.aftercare_month_end(s.starts_on, app.aftercare_month_index(s.starts_on, v_heute))
                 end
               end,
               -- ANG-002: erfasste Abo-Monate und der Preis des naechsten.
               'recorded_months', (
                 select count(*)::integer from public.billable_services b
                 where b.aftercare_subscription_id = s.id
               ),
               'next_month_price_cents', case when s.ends_on is null then (
                 select pr.unit_price_cents
                 from app.aftercare_month_price(v_org,
                   case when v_heute < s.starts_on then s.starts_on
                        else app.aftercare_month_start(s.starts_on, app.aftercare_month_index(s.starts_on, v_heute) + 1)
                   end) pr
               ) end,
               'next_month_start', case when s.ends_on is null then
                 case when v_heute < s.starts_on then s.starts_on
                      else app.aftercare_month_start(s.starts_on, app.aftercare_month_index(s.starts_on, v_heute) + 1)
                 end
               end
             ) order by s.starts_on desc)
      from public.aftercare_subscriptions s
      left join public.user_profiles up on up.id = s.created_by
      where s.patient_id = p_patient_id and s.organization_id = v_org
    ), '[]'::jsonb)
  );
end;
$function$;
