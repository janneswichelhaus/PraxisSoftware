-- =============================================================================
-- TRN-007: Die Leistung haengt am Trainingsverhaeltnis (TRN-EPIC-003)
--
-- ABR-008 hat den Leistungsbereich an Katalogposition und Leistung gebracht,
-- ABR-009 den Widerspruch zum Terminkontext zum Erfassungsfehler gemacht. Eine
-- Trainingsleistung war trotzdem nicht erfassbar: `billable_services.patient_id`
-- ist Pflicht, und ein Trainingstermin hat keine Patient:in (ADR-022 Punkt 3).
-- Ein Umweg ueber `patients` kommt nicht in Frage - Fachdaten haengen am
-- Verhaeltnis, und zwischen Training und Behandlung gibt es keinen
-- Fremdschluessel (ADR-021 Punkte 3 und 5).
--
--   billable_services.training_relationship_id  zweite, nullbare Verknuepfung
--   billable_services_party                     je Bereich genau ein Verhaeltnis
--   app.billable_service_matches_appointment_context
--                                               + das Verhaeltnis des Termins
--   app.appointment_is_billable                 woraus eine Leistung entsteht
--   app.can_record_services_for_appointment     Behandelnde nur am Behandlungstermin
--   record_billable_services                    + Trainingstermin
--   list_open_billable_appointments             + Trainingstermine, Name aus dem Training
--   list_billable_services                      + Verhaeltnis und Bereich
--
-- WORAUS EINE TRAININGSLEISTUNG ENTSTEHT (ANN-181): aus dem durchgefuehrten
-- Trainingstermin. PROJECT_PRINCIPLES.md 19 nennt fuer das Training "die
-- vereinbarte Trainingsleistung"; die Bindung an die finalisierte
-- Dokumentation gilt ausdruecklich der **Behandlung** (Roadmap, Absatz unter
-- TRN-EPIC-003). Ein Ausfallhonorar gibt es im Training nicht (ANN-178).
--
-- WER ERFASST: owner und office wie bisher (ANN-071). Die Ausnahme aus PRX-009
-- (Behandelnde bestaetigen die Heilmittel am eigenen Termin, ANN-140) bleibt
-- beim Behandlungstermin - die Trainingsbetreuung hat keinen Zugang zur
-- Abrechnung, und wer beide Rollen traegt, bekommt ueber die therapeutische
-- keinen Weg in die Trainingsabrechnung.
--
-- NICHT hier: die Rechnung (TRN-008), der Loeschlauf (TRN-008, er braucht die
-- Rechnungen mit), Paket und Abo (ADR-009 Punkt 21).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die zweite Verknuepfung
--
-- Dieselbe Bauart wie am Termin (ADR-022 Punkt 3): eine nullbare Spalte je
-- Verhaeltnis und eine Constraint, die je Bereich genau eine verlangt. Der
-- Bereich steht schon an der Zeile (ABR-008) und haelt sich ueber den
-- zusammengesetzten Fremdschluessel an die Katalogposition - die Constraint
-- bindet das Verhaeltnis also mittelbar an die Position.
--
-- `on delete restrict` wie bei `patient_id`: Eine Leistung ist ein Beleg der
-- Abrechnung, und das Verhaeltnis faellt nur ueber den Loeschlauf, der sie
-- zuerst nimmt (ADR-008).
-- -----------------------------------------------------------------------------
alter table public.billable_services
  alter column patient_id drop not null;

alter table public.billable_services
  add column training_relationship_id uuid
    references public.training_relationships (id) on delete restrict;

alter table public.billable_services
  add constraint billable_services_party check (
    (service_area = 'therapy'  and patient_id is not null and training_relationship_id is null)
    or
    (service_area = 'training' and training_relationship_id is not null and patient_id is null)
  );

comment on column public.billable_services.training_relationship_id is
  'Das Trainingsverhaeltnis, fuer das die Leistung erbracht wurde (TRN-007, ADR-021 Punkt 5). Gesetzt genau im Bereich training; patient_id ist dann leer. Kein Weg fuehrt von hier in die Akte.';

comment on constraint billable_services_party on public.billable_services is
  'Eine Leistung haengt an genau einem Verhaeltnis, und zwar an dem ihres Bereichs: Behandlung an patients, Training an training_relationships (ADR-021 Punkt 3, ADR-022 Punkt 3). Eine Trainingsleistung mit Patientenbezug ist schemaseitig unmoeglich.';

create index billable_services_training_idx
  on public.billable_services (organization_id, training_relationship_id, performed_on desc)
  where training_relationship_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Das Verhaeltnis der Leistung ist das des Termins
--
-- Aus 20260921140000_invoice_service_area.sql, Abschnitt 2, um das
-- Verhaeltnis ergaenzt. Die Constraint aus Abschnitt 1 sagt nur, dass eine
-- Spalte gesetzt ist - nicht, dass es die richtige ist. Eine Leistung an
-- Tinas Trainingstermin, die auf ein fremdes Verhaeltnis zeigt, waere eine
-- Forderung gegen die falsche Person (Paragraf 13).
--
-- Der Trigger laeuft auch beim Aendern von patient_id: Das Zusammenfuehren
-- zweier Akten (PRX-017) zieht zuerst die Termine um und dann die
-- Leistungen, der Vergleich sieht also den neuen Stand beider.
-- -----------------------------------------------------------------------------
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
begin
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

comment on function app.billable_service_matches_appointment_context() is
  'Weist eine Leistung ab, deren Leistungsbereich dem Kontext ihres Termins widerspricht (ADR-009 Punkt 16, ADR-022 Punkt 2) oder die an einem anderen Verhaeltnis haengt als ihr Termin (TRN-007). Abweisen und nicht anpassen: Punkt 16 nennt den Widerspruch einen Erfassungsfehler und schliesst die stille Korrektur aus.';

drop trigger billable_services_area_matches_context on public.billable_services;

create trigger billable_services_area_matches_context
  before insert or update of appointment_id, catalog_item_id, service_area,
                             patient_id, training_relationship_id
  on public.billable_services
  for each row execute function app.billable_service_matches_appointment_context();

-- -----------------------------------------------------------------------------
-- 3. Woraus eine Leistung entsteht - an einer Stelle (ANN-181)
--
-- Bisher stand die Regel zweimal: im Schreibweg und in der Arbeitsliste. Mit
-- dem zweiten Bereich bekommt sie einen Zweig, und zwei Kopien liefen
-- auseinander.
--
--   therapy   dokumentiert oder Gebuehrenanlass (Paragraf 19, ANN-072)
--   training  durchgefuehrt - `completed`, und `documented`, sobald das
--             Trainingsprotokoll ihn erreichbar macht (ADR-022 Punkt 8).
--             Kein Gebuehrenanlass: den gibt es im Training nicht (ANN-178).
--   internal  nie
-- -----------------------------------------------------------------------------
create function app.appointment_is_billable(p_kind text, p_status text, p_fee_basis text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
           when 'therapy'  then p_status = 'documented' or p_fee_basis is not null
           when 'training' then p_status in ('completed', 'documented')
           else false
         end
$$;

comment on function app.appointment_is_billable(text, text, text) is
  'Ob an einem Termin eine Leistung entstehen darf (PROJECT_PRINCIPLES.md 19): Behandlung aus "dokumentiert" oder einem Gebuehrenanlass, ohne Override (ANN-072); Training aus dem durchgefuehrten Termin (ANN-181); ein interner Termin nie.';

revoke all on function app.appointment_is_billable(text, text, text) from public, anon;
grant execute on function app.appointment_is_billable(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Behandelnde bestaetigen nur am eigenen Behandlungstermin
--
-- Aus 20260929130000_prx_009_record_at_appointment.sql. Die Ausnahme fuer
-- therapist und team_lead galt dem Heilmittel am eigenen Termin (ANN-140).
-- Ohne den Kontext reichte sie an einen Trainingstermin, den dieselbe Person
-- mit einer zweiten Rolle betreut - und oeffnete damit ueber die
-- Behandlungsrolle einen Weg in die Trainingsabrechnung (ADR-021 Punkt 6).
-- -----------------------------------------------------------------------------
create or replace function app.can_record_services_for_appointment(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_record_billable_services()
      or (
        app.has_any_role('therapist', 'team_lead')
        and exists (
          select 1
          from public.appointments a
          join public.staff_members sm on sm.id = a.staff_member_id
          where a.id = p_appointment_id
            and a.organization_id = app.current_organization_id()
            and a.kind = 'therapy'
            and sm.person_id = app.current_person_id()
        )
      )
$$;

-- -----------------------------------------------------------------------------
-- 5. Erfassen am Trainingstermin
--
-- Aus 20260929140000_prx_epic_002_zweitreview.sql, geaendert an den
-- markierten Stellen. Das Verhaeltnis kommt vom Termin und nicht vom
-- Aufrufer; der Trigger aus Abschnitt 2 prueft es trotzdem.
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
  v_kind         text;
  v_training     uuid;
  v_performed_on date;
  v_version      uuid;
  v_erwartet     text;
  v_anzahl       integer;
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

  select a.status, a.fee_basis, a.treatment_basis_id, a.patient_id, a.kind,
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
    jsonb_strip_nulls(jsonb_build_object(
      'surface', 'web',
      -- PRX-009: ob am Termin von der behandelnden Person abgehakt oder im
      -- Buero erfasst - fuer den Nachweis, nicht fuer eine Auswertung (§20).
      'recorded_by_role', case when app.can_record_billable_services() then 'billing' else 'treating' end,
      'patient_id', v_patient,
      'training_relationship_id', v_training,
      'item_count', v_anzahl,
      'performed_on', v_performed_on
    ))
  );

  return v_anzahl;
end;
$$;

comment on function public.record_billable_services(uuid, jsonb) is
  'Erfasst die Leistungen eines Termins, alles oder nichts (ABR-002). Behandlung nur aus "dokumentiert" oder einem Gebuehrenanlass, ohne Override (PROJECT_PRINCIPLES.md 19, ANN-072); Training aus dem durchgefuehrten Termin, am Trainingsverhaeltnis (TRN-007, ANN-181). Schreibt die genutzte Menge der Grundlage fort (ANN-073) und protokolliert billable_service.recorded.';

-- -----------------------------------------------------------------------------
-- 6. Die Arbeitsliste kennt den Trainingstermin
--
-- Aus 20260923120000_abgewiesene_lesezugriffe_rest.sql. Die Rueckgabe waechst
-- um das Verhaeltnis und den Bereich, deshalb drop und create.
--
-- DER NAME kommt am Trainingstermin ueber das Trainingsverhaeltnis, nie ueber
-- die Akte - dieselbe Regel wie im Kalender (TRN-006). `patient_id` bleibt
-- dort leer, damit keine Oberflaeche aus ihr auf eine Behandlung schliesst;
-- `patient_name` traegt den Namen der Person, fuer die die Leistung
-- erbracht wird, in beiden Bereichen.
-- -----------------------------------------------------------------------------
drop function public.list_open_billable_appointments(integer);

create function public.list_open_billable_appointments(p_limit integer default 100)
returns table (
  appointment_id           uuid,
  patient_id               uuid,
  training_relationship_id uuid,
  service_area             text,
  patient_name             text,
  performed_on             date,
  starts_at                timestamptz,
  status                   text,
  fee_basis                text,
  appointment_type         text,
  suggestion_count         integer
)
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

  if not app.can_read_billable_services() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read billable services');
    return;
  end if;

  v_org := app.current_organization_id();

  return query
  select a.id,
         a.patient_id,
         a.training_relationship_id,
         app.service_area_of_appointment_kind(a.kind),
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
  left join public.patients p on p.id = a.patient_id
  left join public.training_relationships t on t.id = a.training_relationship_id
  join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
  where a.organization_id = v_org
    and a.kind in ('therapy', 'training')
    and app.appointment_is_billable(a.kind, a.status, a.fee_basis)
    and not exists (
      select 1 from public.billable_services b where b.appointment_id = a.id
    )
  order by a.starts_at desc, a.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_open_billable_appointments(integer) is
  'Termine, aus denen eine Leistung entstehen darf und an denen noch keine erfasst ist (ABR-002, TRN-007): Behandlung dokumentiert oder mit Gebuehrenanlass, Training durchgefuehrt. Der Name kommt aus dem Verhaeltnis des Termins, nie aus der Akte eines Trainingstermins. Die Arbeitsliste des Abrechnungsbereichs.';

revoke all on function public.list_open_billable_appointments(integer) from public, anon;
grant execute on function public.list_open_billable_appointments(integer) to authenticated;

drop function public.list_billable_services(date, date, integer);

create function public.list_billable_services(
  p_from  date default null,
  p_to    date default null,
  p_limit integer default 200
)
returns table (
  id                       uuid,
  appointment_id           uuid,
  patient_id               uuid,
  training_relationship_id uuid,
  service_area             text,
  patient_name             text,
  performed_on             date,
  code                     text,
  label                    text,
  item_kind                text,
  quantity                 smallint,
  unit_price_cents         integer,
  currency                 text,
  tax_treatment            text,
  tax_rate_permille        smallint,
  status                   text
)
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
         i.unit_price_cents, i.currency, i.tax_treatment, i.tax_rate_permille,
         b.status
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
$$;

comment on function public.list_billable_services(date, date, integer) is
  'Erfasste Leistungen mit Kuerzel, Menge, Einzelpreis, Steuerkennzeichen und Bereich (ABR-002, TRN-007). Der Preis kommt aus der Katalogposition und nicht aus einer Kopie - die Position ist unveraenderlich (ABR-001). Der Name kommt aus dem Verhaeltnis der Leistung.';

revoke all on function public.list_billable_services(date, date, integer) from public, anon;
grant execute on function public.list_billable_services(date, date, integer) to authenticated;
