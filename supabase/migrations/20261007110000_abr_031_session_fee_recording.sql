-- =============================================================================
-- ABR-031 (ABR-EPIC-007, BEF-099): Das Terminhonorar entsteht einmal je Termin
--
-- ADR-009 Fassung 5 Punkt 22: Je durchgefuehrtem Behandlungstermin entsteht
-- genau einmal das vereinbarte Terminhonorar. Drei Groessen werden getrennt
-- gefuehrt und nie auseinander errechnet:
--
--   * verordnete Heilmittel mit ihren Mengen an der Grundlage (ADR-020) -
--     unveraendert `treatment_base_items.prescribed_quantity`;
--   * erbrachte Heilmittel je Termin - unveraendert `billable_services` mit
--     Position und Menge; sie schreiben `used_quantity` fort (ANN-073);
--   * die Honorarberechnung - neu `appointment_session_fees`, genau ein
--     Eintrag je Termin mit dem am Leistungstag geltenden Betrag (ABR-030),
--     beim Bestaetigen festgeschrieben (ANN-232).
--
-- Die Heilmittelauswahl veraendert den Betrag nicht. Auf der Rechnung wird
-- das Honorar auf die bestaetigten Heilmittel aufgeteilt (ADR-009 Punkt 23,
-- ANN-233) - an genau einer Stelle, app.session_fee_lines. Alle Stellen, die
-- bisher Menge mal Katalogpreis rechneten, fragen jetzt
-- app.billable_service_amount.
--
-- Bestand: Leistungen, die vor dieser Migration erfasst wurden, haben kein
-- Terminhonorar und behalten ihren Katalogpreis. Ebenso eine Position ohne
-- Heilmittel (Selbstzahlerleistung) und das Ausfallhonorar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Das Terminhonorar je Termin
--
-- Kein Patientenbezug in der Zeile: Die Person steht am Termin, und das
-- Zusammenfuehren zweier Akten muss hier nichts umschreiben. Faellt der
-- Termin (Loeschlauf nach der Frist der Akte), faellt das Honorar mit; die
-- Leistungen daran halten den Termin bis dahin fest (RESTRICT).
-- -----------------------------------------------------------------------------
create table public.appointment_session_fees (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  appointment_id     uuid not null references public.appointments (id) on delete cascade,
  amount_cents       integer not null check (amount_cents between 0 and 1000000),
  currency           text not null default 'EUR' check (currency = 'EUR'),
  source             text not null check (source in ('agreement', 'tariff')),
  fee_agreement_id   uuid references public.patient_fee_agreements (id) on delete restrict,
  catalog_version_id uuid not null references public.service_catalog_versions (id) on delete restrict,
  performed_on       date not null,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  constraint appointment_session_fees_source_matches check (
    (source = 'agreement') = (fee_agreement_id is not null)
  )
);

comment on table public.appointment_session_fees is
  'Das Terminhonorar eines Behandlungstermins (ABR-031, ADR-009 Punkt 22, ANN-232): genau ein Eintrag je Termin, mit dem Betrag, der am Leistungstag galt, festgeschrieben beim Bestaetigen der Heilmittel. Unveraenderlich. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Nur ueber Funktionen erreichbar.';
comment on column public.appointment_session_fees.source is
  'agreement = Honorarvereinbarung mit der Person (fee_agreement_id), tariff = allgemeiner Tarif der Preisliste (catalog_version_id). Nachweis, woher der Betrag kam.';
comment on column public.appointment_session_fees.catalog_version_id is
  'Die am Leistungstag gueltige Preisliste. Ihre Heilmittelpreise sind die Gewichte der Aufteilung auf der Rechnung (ANN-233), auch wenn der Betrag aus einer Vereinbarung kommt.';

create unique index appointment_session_fees_appointment_key
  on public.appointment_session_fees (appointment_id);
create index appointment_session_fees_agreement_idx
  on public.appointment_session_fees (fee_agreement_id) where fee_agreement_id is not null;
create index appointment_session_fees_version_idx
  on public.appointment_session_fees (catalog_version_id);

revoke all on public.appointment_session_fees from anon, authenticated;
alter table public.appointment_session_fees enable row level security;

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values ('appointment_session_fees', 'abrechnungsdaten', 'ueber_elterndatensatz',
        'Terminhonorar je Behandlungstermin (ABR-031). Faellt mit seinem Termin (on delete cascade); den Termin halten bis dahin die Leistungen daran fest (FK restrict).',
        15);

create or replace function app.appointment_session_fee_stays_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'session fee is immutable' using errcode = '23514';
end;
$$;

create trigger appointment_session_fees_frozen
  before update on public.appointment_session_fees
  for each row execute function app.appointment_session_fee_stays_frozen();

-- -----------------------------------------------------------------------------
-- 2. Die Aufteilung auf die Heilmittel - die eine Stelle (ANN-233)
--
-- Gewicht je bestaetigtem Heilmittel ist sein Preis in der Preisliste des
-- Leistungstags (Menge ist im Terminhonorar 1). Je Position der abgerundete
-- Anteil, die Restcents an die groessten Bruchteile, bei Gleichstand nach der
-- Reihenfolge der Preisliste. Tragen alle Heilmittel den Preis null, wird zu
-- gleichen Teilen aufgeteilt. Die Summe ist genau der Betrag.
--
-- Wer die Darstellung aendern will (B17: andere Gewichte, eine Zeile je
-- Termin), aendert diese Funktion und sonst nichts.
-- -----------------------------------------------------------------------------
create or replace function app.session_fee_lines(p_appointment_id uuid)
returns table (billable_service_id uuid, line_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with honorar as (
    select f.amount_cents::bigint as betrag
    from public.appointment_session_fees f
    where f.appointment_id = p_appointment_id
  ),
  zeile as (
    select b.id,
           c.sort_order,
           c.unit_price_cents::bigint as gewicht
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.appointment_id = p_appointment_id
      and c.item_kind = 'treatment'
      and c.remedy is not null
  ),
  summe as (
    select sum(z.gewicht) as gewichte, count(*) as anzahl from zeile z
  ),
  anteil as (
    select z.id, z.sort_order, h.betrag,
           case when s.gewichte > 0 then (h.betrag * z.gewicht) / s.gewichte
                else h.betrag / s.anzahl end as abgerundet,
           case when s.gewichte > 0 then (h.betrag * z.gewicht) % s.gewichte
                else h.betrag % s.anzahl end as rest
    from zeile z cross join honorar h cross join summe s
  ),
  verteilt as (
    select a.*,
           row_number() over (order by a.rest desc, a.sort_order, a.id) as platz,
           a.betrag - sum(a.abgerundet) over () as offen
    from anteil a
  )
  select v.id, (v.abgerundet + case when v.platz <= v.offen then 1 else 0 end)::bigint
  from verteilt v
$$;

comment on function app.session_fee_lines(uuid) is
  'Teilt das Terminhonorar eines Termins auf seine bestaetigten Heilmittel auf (ABR-031, ADR-009 Punkt 23, ANN-233): anteilig nach den Preisen der Preisliste, Restcents an die groessten Bruchteile. Die Summe ist genau das Honorar. Die eine Stelle der Rechnungsdarstellung (B17).';

revoke all on function app.session_fee_lines(uuid) from public, anon, authenticated;

create or replace function app.billable_service_amount(p_billable_service_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.line_cents
       from app.session_fee_lines(b.appointment_id) l
      where l.billable_service_id = b.id),
    b.quantity::bigint * c.unit_price_cents
  )
  from public.billable_services b
  join public.service_catalog_items c on c.id = b.catalog_item_id
  where b.id = p_billable_service_id
$$;

comment on function app.billable_service_amount(uuid) is
  'Betrag einer erfassten Leistung in Cent (ABR-031): ihr Anteil am Terminhonorar, wenn der Termin eines traegt und die Position ein Heilmittel ist, sonst Menge mal Katalogpreis (Bestand, Ausfallhonorar, Positionen ohne Heilmittel, Training).';

revoke all on function app.billable_service_amount(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Bestandsfunktionen
--
-- Wortgleich aus dem geltenden Stand uebernommen; geaendert sind nur die mit
-- ABR-031 markierten Stellen.
-- -----------------------------------------------------------------------------

drop function public.get_billable_service_draft(uuid);

CREATE FUNCTION public.get_billable_service_draft(p_appointment_id uuid)
 RETURNS TABLE(catalog_item_id uuid, code text, label text, item_kind text, unit_price_cents integer, currency text, tax_treatment text, tax_rate_permille smallint, service_area text, suggested boolean, in_session_fee boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_kind         text;
  v_bereich      text;
  v_performed_on date;
  v_version      uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen. Die Pruefung braucht den Termin und steht deshalb in
  -- app.can_record_services_for_appointment.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to record billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  -- ABN-006: Ein Verzicht nimmt dem Anlass die Abrechenbarkeit, nicht den Anlass.
  select a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at), a.treatment_basis_id, a.kind
    into v_status, v_fee_basis, v_basis, v_kind
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  v_bereich := app.service_area_of_appointment_kind(v_kind);
  if v_bereich is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  -- Die Reihenfolge der Preisliste bleibt die Reihenfolge des Vorschlags.
  return query
  select i.id, i.code, i.label, i.item_kind, i.unit_price_cents, i.currency,
         i.tax_treatment, i.tax_rate_permille, i.service_area,
         case
           when v_fee_basis is not null then i.item_kind = 'absence_fee'
           else i.remedy is not null
                and exists (
                  select 1 from public.treatment_base_items p
                  where p.treatment_basis_id = v_basis and p.remedy = i.remedy
                )
         end as suggested,
         -- ABR-031: Ein Heilmittel an einem Behandlungstermin geht im
         -- Terminhonorar auf; sein Preis ist dann nur noch Gewicht (ANN-233).
         (v_fee_basis is null and v_kind = 'therapy' and i.remedy is not null) as in_session_fee
  from public.service_catalog_items i
  where i.catalog_version_id = v_version
    and i.item_kind = case when v_fee_basis is not null then 'absence_fee' else 'treatment' end
    and i.service_area = v_bereich
  order by i.sort_order;
end;
$function$;

comment on function public.get_billable_service_draft(uuid) is
  'Vorschlag der Leistungserfassung je Termin aus der am Leistungstag gueltigen Preisliste (ABR-002, PRX-009). Seit ABR-031 mit in_session_fee: Heilmittel an einem Behandlungstermin gehen im Terminhonorar auf.';
revoke all on function public.get_billable_service_draft(uuid) from public, anon;
grant execute on function public.get_billable_service_draft(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.record_billable_services(p_appointment_id uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor        uuid;
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_patient      uuid;
  v_kind         text;
  v_training     uuid;
  v_performed_on date;
  v_version      uuid;
  v_erwartet     text;
  v_anzahl       integer;
  v_honorar      record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen Behandlungstermin (TRN-007). Ein fremder Termin ist von
  -- einem unbekannten nicht zu unterscheiden - beide scheitern hier gleich.
  if not app.can_record_services_for_appointment(p_appointment_id) then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- ABN-006: Ein Verzicht nimmt dem Anlass die Abrechenbarkeit, nicht den Anlass.
  select a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at), a.treatment_basis_id, a.patient_id, a.kind,
         a.training_relationship_id
    into v_status, v_fee_basis, v_basis, v_patient, v_kind, v_training
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  -- TRN-007: Ein interner Termin hat kein Gegenueber und erzeugt nichts
  -- (Paragraf 19). Die Meldung bleibt die bisherige.
  if v_patient is null and v_training is null then
    raise exception 'appointment has no patient' using errcode = '22023';
  end if;

  -- Paragraf 19: Behandlung aus "dokumentiert" oder einem Gebuehrenanlass,
  -- ohne Override (ANN-072); Training aus dem durchgefuehrten Termin
  -- (ANN-181). Eine Stelle: app.appointment_is_billable.
  if not app.appointment_is_billable(v_kind, v_status, v_fee_basis) then
    if v_kind = 'training' then
      raise exception 'training appointment has not taken place' using errcode = '22023';
    end if;
    raise exception 'appointment is neither documented nor a fee occasion'
      using errcode = '22023';
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

  -- Zweitreview (ANN-140): Am eigenen Termin bestaetigen Behandelnde die
  -- Heilmittel. Ein Ausfallhonorar ist eine Forderung gegen die Patient:in
  -- und bleibt beim Buero.
  if v_erwartet = 'absence_fee' and not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  insert into public.billable_services (
    organization_id, patient_id, training_relationship_id, appointment_id, catalog_item_id,
    treatment_base_item_id, quantity, performed_on, created_by
  )
  select
    v_org,
    v_patient,
    v_training,
    p_appointment_id,
    i.id,
    -- Die Position der Grundlage, deren Menge diese Leistung verbraucht. Ein
    -- Trainingstermin hat keine Behandlungsgrundlage (ADR-022 Punkt 4); die
    -- Unterabfrage bleibt dann leer.
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
   and i.item_kind = v_erwartet
   -- TRN-007: nur Positionen des Bereichs dieses Termins. Der Trigger wiese
   -- eine fremde ab; hier faellt sie aus dem Join und der ganze Vorgang
   -- scheitert mit einer Meldung, die den Grund nennt.
   and i.service_area = app.service_area_of_appointment_kind(v_kind);

  get diagnostics v_anzahl = row_count;

  -- Eine Position, die es in der geltenden Preisliste nicht gibt oder die
  -- nicht zum Anlass passt, faellt aus dem Join heraus. Stillschweigend
  -- weniger zu schreiben, als verlangt wurde, waere genau der Fehler aus
  -- Paragraf 13 - also scheitert der ganze Vorgang.
  if v_anzahl <> jsonb_array_length(p_items) then
    raise exception 'item does not belong to the catalog version valid on % or does not match %',
      v_performed_on, v_erwartet using errcode = '22023';
  end if;

  -- ABR-031 (ADR-009 Punkt 22, ANN-232): Traegt ein Behandlungstermin
  -- mindestens ein Heilmittel, entsteht genau einmal das Terminhonorar - mit
  -- dem Betrag, der am Leistungstag gilt, festgeschrieben. Die Auswahl der
  -- Heilmittel aendert ihn nicht. Im Honorar ist die Menge je Heilmittel 1:
  -- eine Doppelbehandlung ist eine eigene Position.
  if v_kind = 'therapy' and v_erwartet = 'treatment' and exists (
    select 1
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.appointment_id = p_appointment_id and c.remedy is not null
  ) then
    if exists (
      select 1
      from public.billable_services b
      join public.service_catalog_items c on c.id = b.catalog_item_id
      where b.appointment_id = p_appointment_id and c.remedy is not null and b.quantity <> 1
    ) then
      raise exception 'within the session fee each remedy is recorded once' using errcode = '22023';
    end if;

    select h.amount_cents, h.source, h.fee_agreement_id
      into v_honorar
    from app.session_fee_on(v_patient, v_performed_on) h;

    if v_honorar.amount_cents is null then
      raise exception 'no session fee for %', v_performed_on using errcode = '22023';
    end if;

    insert into public.appointment_session_fees (
      organization_id, appointment_id, amount_cents, source, fee_agreement_id,
      catalog_version_id, performed_on, created_by
    )
    values (
      v_org, p_appointment_id, v_honorar.amount_cents, v_honorar.source,
      v_honorar.fee_agreement_id, v_version, v_performed_on, v_actor
    );
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


  return v_anzahl;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_billable_services(p_appointment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- ABR-031: Das Terminhonorar faellt mit der Erfassung, die es ausgeloest hat.
  delete from public.appointment_session_fees where appointment_id = p_appointment_id;

  delete from public.billable_services where appointment_id = p_appointment_id;
  get diagnostics v_anzahl = row_count;


  return v_anzahl;
end;
$function$;

drop function public.get_appointment_services(uuid);

CREATE FUNCTION public.get_appointment_services(p_appointment_id uuid)
 RETURNS TABLE(appointment_id uuid, can_record boolean, services jsonb, recorded_at timestamp with time zone, recorded_by_name text, basis_items jsonb, session_fee_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_basis uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not (app.can_read_billable_services()
          or app.can_record_services_for_appointment(p_appointment_id)) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  select a.treatment_basis_id into v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  return query
    select
      p_appointment_id,
      app.can_record_services_for_appointment(p_appointment_id),
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'code', i.code,
                   'label', i.label,
                   'quantity', s.quantity,
                   'status', s.status
                 )
                 order by i.sort_order, i.id
               )
        from public.billable_services s
        join public.service_catalog_items i on i.id = s.catalog_item_id
        where s.appointment_id = p_appointment_id
      ), '[]'::jsonb),
      (select min(s.created_at) from public.billable_services s
        where s.appointment_id = p_appointment_id),
      (select up.display_name
         from public.billable_services s
         join public.user_profiles up on up.id = s.created_by
        where s.appointment_id = p_appointment_id
        order by s.created_at
        limit 1),
      case when v_basis is null then null else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'remedy', p.remedy,
                   'prescribed_quantity', p.prescribed_quantity,
                   'used_quantity', p.used_quantity
                 )
                 order by p.sort_order, p.id
               )
        from public.treatment_base_items p
        where p.treatment_basis_id = v_basis
      ), '[]'::jsonb) end,
      -- ABR-031: Das Honorar sehen nur die Rollen der Abrechnung; wer am
      -- eigenen Termin Heilmittel bestaetigt, braucht den Preis nicht
      -- (Datenminimierung).
      case when app.can_read_billable_services() then (
        select f.amount_cents from public.appointment_session_fees f
        where f.appointment_id = p_appointment_id
      ) end;
end;
$function$;

comment on function public.get_appointment_services(uuid) is
  'Erfasste Heilmittel eines Termins ohne Preise, die Mengen der Grundlage und seit ABR-031 fuer owner und office das festgeschriebene Terminhonorar (PRX-009, ANN-140, ANN-232).';
revoke all on function public.get_appointment_services(uuid) from public, anon;
grant execute on function public.get_appointment_services(uuid) to authenticated;

drop function public.list_billable_services(date, date, integer);

CREATE FUNCTION public.list_billable_services(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, appointment_id uuid, patient_id uuid, training_relationship_id uuid, service_area text, patient_name text, performed_on date, code text, label text, item_kind text, quantity smallint, unit_price_cents integer, currency text, tax_treatment text, tax_rate_permille smallint, status text, session_fee boolean)
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

  if not app.can_read_billable_services() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select b.id, b.appointment_id, b.patient_id, b.training_relationship_id, b.service_area,
         pe.given_name || ' ' || pe.family_name,
         b.performed_on, i.code, i.label, i.item_kind, b.quantity,
         -- ABR-031: Betrag je Einheit. Im Terminhonorar ist das der Anteil
         -- der Position am Honorar (Menge 1), sonst der Katalogpreis.
         (app.billable_service_amount(b.id) / b.quantity)::integer,
         i.currency, i.tax_treatment, i.tax_rate_permille,
         b.status,
         exists (select 1 from public.appointment_session_fees f
                 where f.appointment_id = b.appointment_id and i.remedy is not null)
  from public.billable_services b
  join public.service_catalog_items i on i.id = b.catalog_item_id
  left join public.patients p on p.id = b.patient_id
  left join public.training_relationships t on t.id = b.training_relationship_id
  join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
  where b.organization_id = v_org
    and (p_from is null or b.performed_on >= p_from)
    and (p_to   is null or b.performed_on <= p_to)
  order by b.performed_on desc, pe.family_name, i.code
  limit greatest(least(coalesce(p_limit, 200), 500), 1);
end;
$function$;

comment on function public.list_billable_services(date, date, integer) is
  'Erfasste Leistungen mit Kuerzel, Menge, Betrag je Einheit, Steuerkennzeichen und Bereich (ABR-002, TRN-007). Seit ABR-031 ist der Betrag einer Position im Terminhonorar ihr Anteil daran (session_fee = true), sonst der Katalogpreis. Der Name kommt aus dem Verhaeltnis der Leistung.';
revoke all on function public.list_billable_services(date, date, integer) from public, anon;
grant execute on function public.list_billable_services(date, date, integer) to authenticated;

CREATE OR REPLACE FUNCTION public.list_invoice_candidates(p_limit integer DEFAULT 100)
 RETURNS TABLE(patient_id uuid, training_relationship_id uuid, patient_name text, period_month date, service_area text, service_count integer, total_cents integer, currency text, has_draft boolean, draft_id uuid)
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
         entwurf.id
  from (
    select b.patient_id,
           b.training_relationship_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           date_trunc('month', b.performed_on)::date as period_month,
           b.service_area,
           count(*)::integer as service_count,
           -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
           sum(app.billable_service_amount(b.id))::integer as total_cents,
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
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
    group by b.patient_id, b.training_relationship_id,
             date_trunc('month', b.performed_on)::date, b.service_area
  ) k
  left join lateral (
    select i.id
    from public.invoices i
    where i.organization_id = v_org
      and i.patient_id is not distinct from k.patient_id
      and i.training_relationship_id is not distinct from k.training_relationship_id
      and i.period_month = k.period_month
      and i.service_area = k.service_area
      and i.status = 'draft'
    limit 1
  ) entwurf on true
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_invoices(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, status text, invoice_number text, period_month date, service_area text, issued_on date, due_on date, patient_id uuid, training_relationship_id uuid, patient_name text, recipient_name text, recipient_kind text, total_cents integer, currency text, item_count integer, paid_cents integer, outstanding_cents integer, payment_state text, overdue boolean, cancelled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
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

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  with auswahl as (
    -- Erst begrenzen, dann anreichern: Reihenfolge und Auswahl haengen allein
    -- an Spalten der Rechnung. Alles Weitere - Name, Empfaenger, Zeilensumme,
    -- Zahlungsstand - wird nur noch fuer die gelieferten Zeilen geholt.
    select i.*
    from public.invoices i
    where i.organization_id = v_org
    order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id
    limit greatest(least(coalesce(p_limit, 100), 200), 1)
  )
  select i.id, i.status, i.invoice_number, i.period_month, i.service_area, i.issued_on, i.due_on,
         i.patient_id,
         i.training_relationship_id,
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
         case when i.status = 'issued' then coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then i.total_cents - coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, coalesce(zahlung.bezahlt, 0))
              else 'unpaid' end,
         -- Seit ABR-003c: Eine stornierte Rechnung wird nicht ueberfaellig.
         (i.status = 'issued' and i.due_on < v_heute
          and coalesce(zahlung.bezahlt, 0) < i.total_cents
          and not exists (
            select 1 from public.invoice_cancellations c where c.invoice_id = i.id
          )),
         exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
  from auswahl i
  -- TRN-008: der Name aus dem Verhaeltnis der Rechnung, nie aus der Akte
  -- einer Trainingsrechnung.
  left join public.patients pa on pa.id = i.patient_id
  left join public.training_relationships t on t.id = i.training_relationship_id
  join public.persons pe on pe.id = coalesce(pa.person_id, t.person_id)
  left join public.invoice_recipients r on r.id = i.recipient_id
  left join lateral (
    -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
    select sum(app.billable_service_amount(b.id)) as brutto,
           max(c.currency) as currency,
           count(*) as anzahl
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = i.id
  ) summe on true
  -- Die Zahlungssumme einmal je Rechnung statt viermal je Zeile - und nur
  -- noch fuer die begrenzte Auswahl (R3-016).
  left join lateral (
    select sum(case when p.direction = 'incoming' then p.amount_cents
                    else -p.amount_cents end)::integer as bezahlt
    from public.payments p
    where p.invoice_id = i.id
      and p.voided_at is null
  ) zahlung on true
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id;
end;
$function$;

CREATE OR REPLACE FUNCTION app.revenue_staff_lines(p_organization_id uuid, p_from date, p_to date)
 RETURNS TABLE(tag date, invoice_id uuid, staff_member_id uuid, betrag bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with dokument as (
    select i.id, i.issued_on as tag, 1 as vorzeichen
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.status = 'issued'
      and i.issued_on >= p_from
      and i.issued_on < p_to
    union all
    select c.invoice_id, c.cancelled_on, -1
    from public.invoice_cancellations c
    where c.organization_id = p_organization_id
      and c.cancelled_on >= p_from
      and c.cancelled_on < p_to
  )
  select d.tag,
         d.id,
         a.staff_member_id,
         -- ABR-031: Anteil am Terminhonorar oder Katalogpreis.
         (d.vorzeichen * app.billable_service_amount(b.id))::bigint
  from dokument d
  join public.invoice_items it         on it.invoice_id = d.id
  join public.billable_services b      on b.id = it.billable_service_id
  join public.service_catalog_items ci on ci.id = b.catalog_item_id
  left join public.appointments a      on a.id = b.appointment_id
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
    'schema_version', 4,
    'period_month', v_invoice.period_month,
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
