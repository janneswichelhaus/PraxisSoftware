-- =============================================================================
-- ANG-006 (ANG-EPIC-002): Das Trainingspaket als Vertrag am Trainingsverhaeltnis
--
-- PROJECT_PRINCIPLES.md 4.10 und 19, ADR-009 Punkt 21: Ein Paket gilt fuer
-- einen festen Zeitraum, ist nicht pausierbar und wird als EINE Leistung des
-- Bereichs `training` berechnet. Die Plattform ist im Paketpreis enthalten.
--
--   public.training_packages            das Paket: Position, Beginn, Ende
--   app.can_manage_training_packages    wer es anlegt, liest, entfernt
--   app.training_package_ends_on        das Ende nach Paragraf 188 BGB (ANN-277)
--   app.training_package_start_blocker  warum ein Paket an einem Tag nicht
--                                       beginnen kann (ANN-277, ANN-278)
--   billable_services.training_package_id   die eine Leistung des Pakets
--   public.list_training_package_items  die Pakete der Preisliste eines Tags
--   public.create_training_package      Paket und Leistung in einem Schritt
--   public.delete_training_package      eine Fehlanlage entfernen
--   public.get_training_packages        die Sicht am Trainingsverhaeltnis
--   public.end_training_relationship    nicht vor dem Ende eines Pakets
--
-- ZAHLUNGSWEISE (ANN-276): einmal im Voraus. Mit dem Paket entsteht seine
-- Leistung zum Beginn; die Rechnung buendelt sie ueber den Monatsentwurf des
-- Trainings (create_training_invoice_draft), das Dokument nennt den Zeitraum.
-- Der Preis kommt aus der am Beginn geltenden Preisliste und bleibt fest
-- (ADR-009 Punkt 5): Die Leistung verweist auf die unveraenderliche Position.
--
-- WER (ANN-071): owner und office, wie Leistungen und Rechnungen. Die
-- Trainingsbetreuung hat keinen Zugang zur Abrechnung (TRN-007) und sieht das
-- Paket in diesem Loop nicht.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Punkt 15): Wer was wann angelegt hat, steht
-- in den Spalten der Tabelle; die Leistung ist der Beleg.
--
-- NICHT hier: die Abgeltung der Termine im Zeitraum (ANG-007), die Plattform
-- (ANG-008), der Abschluss ueber die Plattform (KND-EPIC-001).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Wer
-- -----------------------------------------------------------------------------
create function app.can_manage_training_packages()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

revoke all on function app.can_manage_training_packages() from public, anon;
grant execute on function app.can_manage_training_packages() to authenticated;

comment on function app.can_manage_training_packages() is
  'ANG-006: Rollen, die Trainingspakete anlegen, lesen und als Fehlanlage entfernen (owner, office; ANN-071).';

-- -----------------------------------------------------------------------------
-- 2. Das Ende eines Pakets (ANN-277)
--
-- Paragraf 188 Abs. 2 und 3 BGB wie beim Nachsorge-Abo (ANN-270): Ein Paket
-- ueber n Monate ab dem 31. Januar endet am Ende des n-ten Monats, vom Beginn
-- aus gerechnet. Dieselbe Rechnung, eine Stelle: app.aftercare_month_end.
-- -----------------------------------------------------------------------------
create function app.training_package_ends_on(p_starts_on date, p_months integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select app.aftercare_month_end(p_starts_on, p_months - 1)
$$;

revoke all on function app.training_package_ends_on(date, integer) from public, anon, authenticated;

comment on function app.training_package_ends_on(date, integer) is
  'ANG-006 (ANN-277): letzter Tag eines Trainingspakets mit p_months Monaten Laufzeit ab p_starts_on, nach Paragraf 188 BGB vom Beginn aus gerechnet.';

-- -----------------------------------------------------------------------------
-- 3. Das Paket
--
-- Kein Zustand, keine Pause, keine Kuendigung (ANN-277): Ein Paket ist ein
-- Zeitraum mit einem Preis. Ob es geplant ist, laeuft oder vorbei ist, ergibt
-- sich aus dem Tag. Zwei Pakete desselben Verhaeltnisses ueberschneiden sich
-- nie - sonst wuerde dieselbe Zeit zweimal bezahlt.
-- -----------------------------------------------------------------------------
create table public.training_packages (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null,
  catalog_item_id          uuid not null references public.service_catalog_items (id) on delete restrict,
  starts_on                date not null,
  ends_on                  date not null,
  created_at               timestamptz not null default now(),
  created_by               uuid,
  constraint training_packages_relationship_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete cascade,
  constraint training_packages_end_after_start check (ends_on >= starts_on),
  constraint training_packages_no_overlap exclude using gist (
    training_relationship_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

comment on table public.training_packages is
  'Trainingspaket einer Kund:in (ANG-006, PROJECT_PRINCIPLES.md 4.10 und 19, ADR-009 Punkt 21): fester Zeitraum, nicht pausierbar, eine Leistung des Bereichs training zum Beginn (ANN-276, ANN-277). Datenklasse: Abrechnungsdaten; faellt mit dem Trainingsverhaeltnis (on delete cascade), nachdem die Leistung daraus geloescht ist (FK restrict). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die Funktionen (ADR-004).';
comment on column public.training_packages.catalog_item_id is
  'Die Position der Preisliste, die am Beginn galt. Sie ist unveraenderlich, sobald ihre Liste in Kraft ist - damit bleibt der Preis des Pakets fest (ADR-009 Punkt 5).';
comment on column public.training_packages.ends_on is
  'Letzter Tag des Pakets: Beginn plus Laufzeit der Position nach Paragraf 188 BGB (app.training_package_ends_on, ANN-277). Kein Pausieren, kein Verlaengern.';
comment on constraint training_packages_no_overlap on public.training_packages is
  'ANG-006: Zwei Pakete desselben Verhaeltnisses ueberschneiden sich nie - dieselbe Zeit wird nicht zweimal bezahlt (ADR-009 Punkt 4).';

create index training_packages_relationship_idx
  on public.training_packages (organization_id, training_relationship_id, starts_on desc);

revoke all on public.training_packages from anon, authenticated;
alter table public.training_packages enable row level security;

-- Datenklasse (ADR-008, ADR-013 Punkt 9 Nr. 4)
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'training_packages', 'abrechnungsdaten', 'ueber_elterndatensatz',
  'Trainingspakete einer Kund:in (ANG-006). Fallen mit dem Trainingsverhaeltnis (on delete cascade), nachdem ihre Leistung geloescht ist (FK restrict); das Verhaeltnis haelt der Lauf so lange, wie seine Rechnungen es verlangen (app.training_billing_retention_due_at).',
  19
);

-- -----------------------------------------------------------------------------
-- 4. Die Leistung des Pakets
--
-- Eine Leistung ohne Termin, wie der Abo-Monat (ANG-002): genau eine je
-- Paket, Menge 1, am Tag des Beginns. Die Constraint der Quelle bekommt den
-- dritten Zweig; der Trigger prueft, dass Position und Verhaeltnis die des
-- Pakets sind.
-- -----------------------------------------------------------------------------
alter table public.billable_services
  add column training_package_id uuid
    references public.training_packages (id) on delete restrict;

alter table public.billable_services drop constraint billable_services_source;
alter table public.billable_services
  add constraint billable_services_source check (
    (appointment_id is not null and aftercare_subscription_id is null and training_package_id is null)
    or
    (appointment_id is null and aftercare_subscription_id is not null and training_package_id is null
       and service_area = 'therapy' and patient_id is not null and quantity = 1)
    or
    (appointment_id is null and aftercare_subscription_id is null and training_package_id is not null
       and service_area = 'training' and training_relationship_id is not null and quantity = 1)
  );

comment on column public.billable_services.training_package_id is
  'ANG-006: das Trainingspaket, aus dem diese Leistung entstanden ist (ADR-009 Punkt 21). Dann ohne Termin; performed_on ist der Beginn des Pakets.';
comment on constraint billable_services_source on public.billable_services is
  'ANG-002, ANG-006: Eine Leistung entsteht an einem Termin, als Abo-Monat aus einem Nachsorge-Abo oder als Trainingspaket - aus genau einer Quelle.';

-- Die Invariante gegen Doppelabrechnung (ADR-009 Punkt 4) fuer das Paket:
-- genau eine Leistung je Paket (ANN-276).
create unique index billable_services_training_package_key
  on public.billable_services (training_package_id)
  where training_package_id is not null;

-- Leistung und Quelle passen zusammen. Aus 20261014110000_ang_002_aftercare_months.sql
-- um das Trainingspaket ergaenzt.
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
    -- ANG-006: das Trainingspaket - Position, Verhaeltnis und Beginn sind die
    -- des Pakets.
    if new.training_package_id is not null then
      if v_art is distinct from 'training_package' or not exists (
        select 1 from public.training_packages k
        where k.id = new.training_package_id
          and k.training_relationship_id = new.training_relationship_id
          and k.organization_id = new.organization_id
          and k.catalog_item_id = new.catalog_item_id
          and k.starts_on = new.performed_on
      ) then
        raise exception 'billable service does not match its training package'
          using errcode = '23514';
      end if;
      return new;
    end if;
    if v_art is distinct from 'aftercare_month' then
      raise exception 'only an aftercare month or a training package can be billed without an appointment'
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
  -- ANG-006: ein Paket nie am Termin.
  if v_art = 'training_package' then
    raise exception 'a training package is not billed at an appointment' using errcode = '23514';
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
  before insert or update of appointment_id, aftercare_subscription_id, training_package_id,
                             catalog_item_id, service_area, patient_id, training_relationship_id,
                             performed_on
  on public.billable_services
  for each row execute function app.billable_service_matches_appointment_context();

-- Der Zeitraum einer Leistung ohne Termin, fuer das Rechnungsdokument. Aus
-- 20261014110000_ang_002_aftercare_months.sql um das Paket ergaenzt: Es nennt
-- seinen ganzen Zeitraum (Par. 14 Abs. 4 Nr. 6 UStG).
create or replace function app.billable_service_period_until(p_billable_service_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.aftercare_month_end(s.starts_on, app.aftercare_month_index(s.starts_on, b.performed_on))
       from public.aftercare_subscriptions s
      where s.id = b.aftercare_subscription_id),
    (select k.ends_on from public.training_packages k where k.id = b.training_package_id)
  )
  from public.billable_services b
  where b.id = p_billable_service_id
$$;

revoke all on function app.billable_service_period_until(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Warum ein Paket an einem Tag nicht beginnen kann
--
--   not_found        kein Verhaeltnis dieser Praxis
--   ended            das Verhaeltnis ist beendet
--   before_contract  vor dem Vertragsbeginn
--   too_early        mehr als 14 Tage zurueck (wie ANN-268)
--   care_open        dieselbe Person ist in laufender Behandlung (ANN-278)
--   before_care_end  vor dem Abschluss ihrer Versorgung (ANN-278)
--
-- ANN-278: Paragraf 4.10 - "Das Paket beginnt nach dem Ende der Behandlung".
-- Gelesen wird ueber die gemeinsame Identitaet (ADR-021 Punkt 3), nur der
-- Abschluss, kein Inhalt der Akte; anlegen duerfen nur owner und office, die
-- beide Bereiche tragen. Eine Behandlung, die WAEHREND eines Pakets beginnt,
-- haelt es nicht an (ANN-280).
-- -----------------------------------------------------------------------------
create function app.training_package_start_blocker(p_relationship_id uuid, p_starts_on date)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_verh  public.training_relationships%rowtype;
  v_abschluss date;
  v_offen boolean;
begin
  select * into v_verh from public.training_relationships t where t.id = p_relationship_id;
  if not found then
    return 'not_found';
  end if;
  if v_verh.contract_ended_on is not null then
    return 'ended';
  end if;
  if v_verh.contract_started_on is not null and p_starts_on < v_verh.contract_started_on then
    return 'before_contract';
  end if;
  if p_starts_on < app.training_today(v_verh.organization_id) - 14 then
    return 'too_early';
  end if;

  select bool_or(p.care_concluded_on is null), max(p.care_concluded_on)
    into v_offen, v_abschluss
  from public.patients p
  where p.person_id = v_verh.person_id and p.organization_id = v_verh.organization_id;
  if v_offen then
    return 'care_open';
  end if;
  if v_abschluss is not null and p_starts_on < v_abschluss then
    return 'before_care_end';
  end if;
  return null;
end;
$$;

revoke all on function app.training_package_start_blocker(uuid, date) from public, anon, authenticated;

comment on function app.training_package_start_blocker(uuid, date) is
  'ANG-006: warum ein Trainingspaket an diesem Tag nicht beginnen kann (not_found, ended, before_contract, too_early, care_open, before_care_end) oder null. ANN-278: nicht waehrend einer laufenden Behandlung derselben Person.';

-- -----------------------------------------------------------------------------
-- 6. Die Pakete der Preisliste eines Tags
-- -----------------------------------------------------------------------------
create function public.list_training_package_items(p_on date)
returns table (
  catalog_item_id  uuid,
  code             text,
  label            text,
  package_months   smallint,
  unit_price_cents integer,
  currency         text,
  tax_rate_permille smallint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_training_packages() then
    perform app.record_denied_read(auth.uid(), 'training_packages.read', 'not allowed to read training packages');
    return;
  end if;
  v_org := app.current_organization_id();

  return query
  select c.id, c.code, c.label, c.package_months, c.unit_price_cents, c.currency, c.tax_rate_permille
  from public.service_catalog_items c
  where c.catalog_version_id = app.active_service_catalog_version(v_org, p_on)
    and c.item_kind = 'training_package'
  order by c.sort_order;
end;
$$;

revoke all on function public.list_training_package_items(date) from public, anon;
grant execute on function public.list_training_package_items(date) to authenticated;

comment on function public.list_training_package_items(date) is
  'ANG-006: die Trainingspakete der Preisliste, die am Tag gilt, mit Laufzeit und Preis (owner, office).';

-- -----------------------------------------------------------------------------
-- 7. Anlegen: Paket und Leistung in einem Schritt (ANN-276)
--
-- Unter Sperre des Verhaeltnisses: Vertragsende und vorhandene Pakete werden
-- gegen den Stand geprueft, auf den geschrieben wird.
-- -----------------------------------------------------------------------------
create function public.create_training_package(
  p_relationship_id uuid,
  p_catalog_item_id uuid,
  p_starts_on       date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_grund   text;
  v_monate  smallint;
  v_ende    date;
  v_id      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_training_packages() then
    raise exception 'not allowed to manage training packages' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  if p_starts_on is null then
    raise exception 'start date required' using errcode = '22023';
  end if;

  perform 1 from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = '42501';
  end if;

  v_grund := app.training_package_start_blocker(p_relationship_id, p_starts_on);
  if v_grund is not null then
    raise exception 'training package cannot start: %', v_grund using errcode = '22023';
  end if;

  -- Die Position muss ein Paket der Preisliste sein, die am Beginn gilt
  -- (ADR-009 Punkt 5): Ein spaeter gewaehltes Datum nimmt nicht still den
  -- Preis einer anderen Liste.
  select c.package_months into v_monate
  from public.service_catalog_items c
  where c.id = p_catalog_item_id
    and c.organization_id = v_org
    and c.item_kind = 'training_package'
    and c.catalog_version_id = app.active_service_catalog_version(v_org, p_starts_on);
  if not found then
    raise exception 'training package is not in the price list valid on %', p_starts_on
      using errcode = '22023';
  end if;

  v_ende := app.training_package_ends_on(p_starts_on, v_monate);

  insert into public.training_packages (
    organization_id, training_relationship_id, catalog_item_id, starts_on, ends_on, created_by
  )
  values (v_org, p_relationship_id, p_catalog_item_id, p_starts_on, v_ende, v_actor)
  returning id into v_id;

  insert into public.billable_services (
    organization_id, training_relationship_id, appointment_id, training_package_id,
    catalog_item_id, quantity, performed_on, created_by
  )
  values (v_org, p_relationship_id, null, v_id, p_catalog_item_id, 1, p_starts_on, v_actor);

  return v_id;
exception
  when exclusion_violation then
    raise exception 'a training package already covers this period' using errcode = '23P01';
end;
$$;

revoke all on function public.create_training_package(uuid, uuid, date) from public, anon;
grant execute on function public.create_training_package(uuid, uuid, date) to authenticated;

comment on function public.create_training_package(uuid, uuid, date) is
  'ANG-006: Trainingspaket anlegen (owner, office) - mit seiner einen Leistung zum Beginn (ANN-276), zum Preis der am Beginn geltenden Preisliste, ohne Ueberschneidung mit einem anderen Paket, nicht waehrend einer laufenden Behandlung (ANN-278).';

-- -----------------------------------------------------------------------------
-- 8. Eine Fehlanlage entfernen
--
-- Nur, solange die Leistung auf keiner Rechnung steht - auch auf keinem
-- Entwurf. Nach einem Storno ist sie wieder frei (released_at), und das Paket
-- laesst sich entfernen. Danach ist es ein Vertrag mit Beleg; ein Kulanzfall
-- laeuft ueber Storno und neue Rechnung (ANN-280).
-- -----------------------------------------------------------------------------
create function public.delete_training_package(p_package_id uuid)
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
  if not app.can_manage_training_packages() then
    raise exception 'not allowed to manage training packages' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  -- Erst die eigene Praxis, dann der Zustand: Eine fremde Kennung erfaehrt
  -- nichts ueber ihren Datensatz.
  perform 1 from public.training_packages k
  where k.id = p_package_id and k.organization_id = v_org
  for update;
  if not found then
    raise exception 'training package not found' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.billable_services b
    join public.invoice_items it on it.billable_service_id = b.id
    where b.training_package_id = p_package_id and it.released_at is null
  ) then
    raise exception 'training package is on an invoice' using errcode = '23514';
  end if;

  delete from public.billable_services b where b.training_package_id = p_package_id;
  delete from public.training_packages k where k.id = p_package_id;
end;
$$;

revoke all on function public.delete_training_package(uuid) from public, anon;
grant execute on function public.delete_training_package(uuid) to authenticated;

comment on function public.delete_training_package(uuid) is
  'ANG-006: ein irrtuemlich angelegtes Trainingspaket mit seiner Leistung entfernen (owner, office), solange es auf keiner Rechnung steht.';

-- -----------------------------------------------------------------------------
-- 9. Die Sicht am Trainingsverhaeltnis
-- -----------------------------------------------------------------------------
create function public.get_training_packages(p_relationship_id uuid)
returns jsonb
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
  if not app.can_manage_training_packages() then
    perform app.record_denied_read(auth.uid(), 'training_packages.read', 'not allowed to read training packages');
    return null;
  end if;
  v_org := app.current_organization_id();
  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    return null;
  end if;
  v_heute := app.training_today(v_org);

  return jsonb_build_object(
    'today', v_heute,
    -- Warum heute kein Paket beginnen kann; null: Es kann.
    'start_blocker', app.training_package_start_blocker(p_relationship_id, v_heute),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id,
               'code', c.code,
               'label', c.label,
               'package_months', c.package_months,
               'price_cents', c.unit_price_cents,
               'currency', c.currency,
               'starts_on', k.starts_on,
               'ends_on', k.ends_on,
               'state', case
                 when v_heute < k.starts_on then 'planned'
                 when v_heute <= k.ends_on then 'running'
                 else 'ended'
               end,
               'created_at', k.created_at,
               'created_by_name', up.display_name,
               -- Auf einer Rechnung (auch einem Entwurf), die nicht storniert ist.
               'invoiced', exists (
                 select 1 from public.billable_services b
                 join public.invoice_items it on it.billable_service_id = b.id
                 where b.training_package_id = k.id and it.released_at is null
               )
             ) order by k.starts_on desc)
      from public.training_packages k
      join public.service_catalog_items c on c.id = k.catalog_item_id
      left join public.user_profiles up on up.id = k.created_by
      where k.training_relationship_id = p_relationship_id and k.organization_id = v_org
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_training_packages(uuid) from public, anon;
grant execute on function public.get_training_packages(uuid) to authenticated;

comment on function public.get_training_packages(uuid) is
  'ANG-006: Trainingspakete eines Verhaeltnisses mit Preis, Zeitraum und Stand, dazu warum heute keins beginnen kann (owner, office). Andere Rollen: null und ein Eintrag der Abweisung.';

-- -----------------------------------------------------------------------------
-- 10. Das Vertragsende nicht vor dem Ende eines Pakets (ANN-277)
--
-- Aus 20261006110100_log_001b_schreibpfade.sql; neu ist nur die Pruefung.
-- Damit laeuft der Plattformzugang mindestens bis zum Ende des Pakets weiter
-- - die Plattform ist im Paketpreis enthalten (4.10), und die Lesezeit von
-- 30 Tagen zaehlt ab dem Vertragsende (ADR-023 Punkt 5).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_training_relationship(p_relationship_id uuid, p_ended_on date DEFAULT NULL::date)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_heute  date;
  v_tag    date;
  v_start  date;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.ended', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  v_heute := app.training_today(v_org);
  v_tag := coalesce(p_ended_on, v_heute);
  if v_tag > v_heute then
    raise exception 'contract end is in the future' using errcode = '22023';
  end if;

  select t.contract_started_on, t.contract_ended_on into v_start, v_bisher
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;
  if v_bisher is not null then
    raise exception 'training relationship has already ended' using errcode = '22023';
  end if;
  if v_start is not null and v_tag < v_start then
    raise exception 'contract end is before the contract start' using errcode = '22023';
  end if;

  -- ANG-006 (ANN-277): Ein Paket ist nicht pausierbar und nicht kuendbar; der
  -- Vertrag endet fruehestens mit seinem letzten Tag.
  if exists (
    select 1 from public.training_packages k
    where k.training_relationship_id = p_relationship_id and k.ends_on > v_tag
  ) then
    raise exception 'a training package runs beyond the contract end' using errcode = '22023';
  end if;

  update public.training_relationships
     set contract_ended_on = v_tag, status = 'inactive'
   where id = p_relationship_id;


  return v_tag;
end;
$function$;
