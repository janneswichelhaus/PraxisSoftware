-- =============================================================================
-- ERN-011 (Beratung abrechnen): Die Ernährungsberatung als eigener Terminanlass
--
-- ANN-622 (Abnahme Jannes 2026-10-18), ADR-027 Punkt 15, ADR-009 Punkte 15
-- und 16, ADR-022 Punkte 2, 6 und 10, ADR-018 Punkt 8. Pfad A (Termin,
-- Leistungen, Rechnung, Rechte).
--
--   appointments.occasion            'regular' | 'nutrition_counselling'
--   public.create_nutrition_appointment   Beratungstermin am Verhältnis des
--                                         laufenden Profils anlegen
--   Haken -> Leistung                     die Position der Beratung entsteht
--                                         mit dem Haken (wie B7, ANN-513)
--
-- KEIN VIERTER KONTEXT (ADR-022 Punkt 2): Die Beratung hängt am Verhältnis,
-- an dem das Profil hängt (ADR-027 Punkt 1) - an einer Akte ist sie ein
-- Termin im Kontext 'therapy', an einem Trainingsverhältnis einer im Kontext
-- 'training'. Der Anlass ist eine zweite Eigenschaft daneben: WAS am Termin
-- geschieht, nicht für WEN. Damit steht sie auf der Rechnung des Bereichs des
-- Profils (ADR-027 Punkt 15), ohne dass der Bereich neu gerechnet wird.
--
-- WAS DER ANLASS AUSSCHLIESST (ANN-664):
--   * Behandlungsgrundlage und Trainingsvereinbarung (Constraint) - die
--     Beratung ist keine Heilbehandlung und kein Training;
--   * Behandlungsdoku und Trainingsprotokoll (Trigger) - § 630f gilt für die
--     Behandlung (ADR-022 Punkt 6); Notizen der Beratung stehen im Profil;
--   * einen Gebührenanlass bei kurzfristiger Absage oder Nichtantreffen
--     (ADR-018 Punkt 8 gilt der Behandlung; wie im Training, ANN-178);
--   * das Terminhonorar (ABR-031) - es entsteht nur mit einem Heilmittel.
--
-- ABRECHNUNG (§ 19 je Anlass): abrechenbar aus dem abgehakten Termin, wie das
-- Training (ANN-181); 'documented' ist am Beratungstermin nicht erreichbar.
-- Mit dem Haken entsteht die erste Position „Ernährungsberatung“ des Bereichs
-- aus der am Leistungstag geltenden Preisliste; fehlt sie, steht der Termin
-- wie jeder andere unter „Zu erfassen“. Zurück mit dem Haken fällt die
-- Position, solange keine Rechnung sie führt. Ein Trainingspaket deckt die
-- Beratung nicht.
--
-- WER: Anlegen allein mit der Fähigkeit „Ernährungsberatung“ (ADR-027
-- Punkt 4) und nur am laufenden Profil mit erteilter Einwilligung (Punkt 3).
-- Leistungen erfassen owner und Büro; Behandelnde nicht, auch nicht am
-- eigenen Termin. Den Anlass sieht, wer den Termin sieht - nie den Inhalt des
-- Profils (ANN-665). PROTOKOLL (ADR-010 Fassung 3): keine neue Aktion.
-- DATENKLASSE: unverändert die des Termins je Kontext (ADR-022, ADR-008);
-- der Anlass ist Abrechnungsgrundlage, kein Profildatum.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Anlass am Termin
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column occasion text not null default 'regular';

alter table public.appointments
  add constraint appointments_occasion_values
    check (occasion in ('regular', 'nutrition_counselling'));

-- ANN-664: Die Ernährungsberatung ist ein Termin an Akte oder
-- Trainingsverhältnis, ohne Grundlage, ohne Vereinbarung, ohne Gebührenanlass.
alter table public.appointments
  add constraint appointments_nutrition_occasion check (
    occasion <> 'nutrition_counselling'
    or (kind in ('therapy', 'training')
        and treatment_basis_id is null
        and training_basis_id is null
        and fee_basis is null)
  );

comment on column public.appointments.occasion is
  'ERN-011 (ANN-622, ANN-664): Anlass des Termins neben dem Kontext (ADR-022 Punkt 2) - regular = Behandlung bzw. Training, nutrition_counselling = Ernährungsberatung am Verhältnis des Profils (ADR-027 Punkt 15). Steht mit dem Anlegen fest.';

comment on constraint appointments_nutrition_occasion on public.appointments is
  'ERN-011 (ANN-664): Ein Beratungstermin hängt an Akte oder Trainingsverhältnis, trägt keine Behandlungsgrundlage, keine Trainingsvereinbarung und keinen Gebührenanlass.';

-- Der Anlass steht mit dem Anlegen fest (wie der Kontext, ADR-022 Punkt 10).
-- Der eine Übergang: create_nutrition_appointment setzt ihn in derselben
-- Transaktion am eben angelegten, noch bestätigten Termin ohne Leistung.
create function public.appointments_occasion_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.occasion is not distinct from old.occasion then
    return new;
  end if;
  if not (old.occasion = 'regular'
          and new.occasion = 'nutrition_counselling'
          and old.status = 'confirmed'
          and old.created_at = now()
          and not exists (select 1 from public.billable_services b where b.appointment_id = old.id)) then
    raise exception 'appointment occasion cannot be changed' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger appointments_occasion_guard
  before update of occasion on public.appointments
  for each row execute function public.appointments_occasion_guard();

-- Keine Behandlungsdoku und kein Trainingsprotokoll an der Beratung (ADR-022
-- Punkt 6 sinngemäß). Ein Riegel für beide Tabellen.
create function public.nutrition_appointment_documentation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id and a.occasion = 'nutrition_counselling'
  ) then
    raise exception 'a nutrition counselling appointment carries no treatment documentation or training protocol'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger treatment_notes_nutrition_guard
  before insert or update of appointment_id on public.treatment_notes
  for each row execute function public.nutrition_appointment_documentation_guard();

create trigger training_protocols_nutrition_guard
  before insert or update of appointment_id on public.training_protocols
  for each row execute function public.nutrition_appointment_documentation_guard();

-- -----------------------------------------------------------------------------
-- 2. Abrechenbar je Anlass (§ 19)
-- -----------------------------------------------------------------------------
-- Die Art, nach der ein Termin abgerechnet wird: der Kontext, an der Beratung
-- der Anlass.
create function app.billing_kind(p_kind text, p_occasion text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_occasion = 'nutrition_counselling' then 'nutrition_counselling' else p_kind end
$$;

revoke all on function app.billing_kind(text, text) from public, anon;
grant execute on function app.billing_kind(text, text) to authenticated;

create or replace function app.appointment_is_billable(p_kind text, p_status text, p_fee_basis text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
           when 'therapy'  then p_status = 'documented' or p_fee_basis is not null
           when 'training' then p_status in ('completed', 'documented')
           -- ERN-011: die Beratung aus dem abgehakten Termin (app.billing_kind).
           when 'nutrition_counselling' then p_status = 'completed'
           else false
         end
$$;

comment on function app.appointment_is_billable(text, text, text) is
  'Ob an einem Termin eine Leistung entstehen darf (PROJECT_PRINCIPLES.md 19): Behandlung aus "dokumentiert" oder einem Gebuehrenanlass, ohne Override (ANN-072); Training aus dem durchgefuehrten Termin (ANN-181); die Ernaehrungsberatung (p_kind aus app.billing_kind) aus dem abgehakten Termin (ERN-011); ein interner Termin nie.';

-- -----------------------------------------------------------------------------
-- 3. Mit dem Haken entsteht die Position (wie B7, ANN-513)
-- -----------------------------------------------------------------------------
create function app.record_nutrition_service(p_appointment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a            record;
  v_performed_on date;
  v_version      uuid;
  v_position     uuid;
begin
  select a.id, a.organization_id, a.patient_id, a.training_relationship_id, a.kind,
         a.status, a.completed_by, a.occasion
    into v_a
  from public.appointments a
  where a.id = p_appointment_id;

  if not found or v_a.occasion <> 'nutrition_counselling' or v_a.status <> 'completed' then
    return 0;
  end if;
  if exists (select 1 from public.billable_services b where b.appointment_id = p_appointment_id) then
    return 0;
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_a.organization_id, v_performed_on);
  if v_version is null then
    return 0;
  end if;

  select c.id into v_position
  from public.service_catalog_items c
  where c.catalog_version_id = v_version
    and c.item_kind = 'nutrition_counselling'
    and c.service_area = app.service_area_of_appointment_kind(v_a.kind)
  order by c.sort_order, c.id
  limit 1;
  if v_position is null then
    return 0;
  end if;

  -- Der Haken hält nie an: Kommt ein paralleler Vorgang dazwischen, bleibt
  -- es beim Büro („Zu erfassen“).
  begin
    insert into public.billable_services (
      organization_id, patient_id, training_relationship_id, appointment_id, catalog_item_id,
      quantity, performed_on, created_by
    )
    values (
      v_a.organization_id, v_a.patient_id, v_a.training_relationship_id, p_appointment_id,
      v_position, 1, v_performed_on, coalesce(auth.uid(), v_a.completed_by)
    );
  exception
    when unique_violation or check_violation then
      return 0;
  end;
  return 1;
end;
$$;

revoke all on function app.record_nutrition_service(uuid) from public, anon, authenticated;

comment on function app.record_nutrition_service(uuid) is
  'ERN-011 (ANN-664): Mit dem Haken am Beratungstermin entsteht die erste Position "Ernährungsberatung" des Bereichs aus der am Leistungstag geltenden Preisliste, Menge 1. Ohne Position, ohne Preisliste oder bei einem parallelen Vorgang entsteht nichts; der Termin steht dann unter "Zu erfassen". Ohne Rechteprüfung, nur aus dem Trigger.';

create function app.appointments_record_nutrition_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.record_nutrition_service(new.id);
  return null;
end;
$$;

revoke all on function app.appointments_record_nutrition_service() from public, anon, authenticated;

create trigger appointments_record_nutrition_service
  after update of status, completed_at on public.appointments
  for each row
  when (new.occasion = 'nutrition_counselling' and new.status = 'completed'
        and new.completed_at is not null)
  execute function app.appointments_record_nutrition_service();

-- -----------------------------------------------------------------------------
-- 4. Den Beratungstermin anlegen
--
-- Die bestehenden Wege legen an (Raster, Arbeitszeit, Belegung über alle
-- Kontexte, Anschrift am Hausbesuch); hier kommt hinzu, dass ein laufendes
-- Profil mit erteilter Einwilligung am Verhältnis besteht, und der Anlass.
-- -----------------------------------------------------------------------------
create function public.create_nutrition_appointment(
  p_profile_id                   uuid,
  p_staff_member_id              uuid,
  p_appointment_type             text,
  p_date                         date,
  p_start_time                   time,
  p_end_time                     time,
  p_location_id                  uuid default null,
  p_allow_outside_working_hours  boolean default false,
  p_confirmed_past               boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profil public.nutrition_profiles%rowtype;
  v_id     uuid;
begin
  -- Rolle, Profil (laufend, eigener Mandant) und Einwilligung (ADR-027
  -- Punkte 3 und 4) - eine Stelle mit den übrigen Schreibwegen der Beratung.
  v_profil := app.nutrition_profile_for_writing(p_profile_id, true);

  if v_profil.patient_id is not null then
    v_id := public.create_appointment(
      v_profil.patient_id, p_staff_member_id, p_appointment_type, p_date, p_start_time,
      p_end_time, p_location_id, p_allow_outside_working_hours, null, p_confirmed_past);
  else
    v_id := public.create_training_appointment(
      v_profil.training_relationship_id, p_staff_member_id, p_appointment_type, p_date,
      p_start_time, p_end_time, p_location_id, p_allow_outside_working_hours, null,
      p_confirmed_past);
  end if;

  update public.appointments
     set occasion = 'nutrition_counselling'
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.create_nutrition_appointment(uuid, uuid, text, date, time, time, uuid, boolean, boolean) from public, anon;
grant execute on function public.create_nutrition_appointment(uuid, uuid, text, date, time, time, uuid, boolean, boolean) to authenticated;

comment on function public.create_nutrition_appointment(uuid, uuid, text, date, time, time, uuid, boolean, boolean) is
  'ERN-011 (ANN-622, ANN-664): legt einen Termin mit dem Anlass Ernährungsberatung am Verhältnis des laufenden Profils an - an der Akte über create_appointment, am Trainingsverhältnis über create_training_appointment, ohne Grundlage. Allein app.can_counsel_nutrition, nur mit erteilter Einwilligung.';

-- -----------------------------------------------------------------------------
-- 5. Die bestehenden Wege lesen den Anlass
-- -----------------------------------------------------------------------------

create or replace function app.can_record_services_for_appointment(p_appointment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            -- ERN-011: die Beratung erfasst das Buero oder der Haken.
            and a.occasion = 'regular'
            and sm.person_id = app.current_person_id()
        )
      )
$function$;

create or replace function app.billable_service_matches_appointment_context()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_kind     text;
  v_patient  uuid;
  v_training uuid;
  v_erwartet text;
  v_art      text;
  v_occasion text;
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

  select a.kind, a.patient_id, a.training_relationship_id, a.occasion
    into v_kind, v_patient, v_training, v_occasion
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

  -- ERN-011 (ANN-664): Am Beratungstermin steht nur die Position der
  -- Ernaehrungsberatung, und sie steht an keinem anderen Termin.
  if (v_occasion = 'nutrition_counselling') is distinct from (v_art = 'nutrition_counselling') then
    raise exception 'billable service does not match the appointment occasion' using errcode = '23514';
  end if;

  -- ANG-007 (ANN-279, BEF-114): Ein Trainingstermin im Zeitraum eines Pakets
  -- ist mit dem Paket bezahlt und traegt keine eigene Forderung. Die
  -- Ernaehrungsberatung ist nicht Teil des Pakets (ERN-011).
  if v_kind = 'training' and v_occasion = 'regular' then
    -- Zweitreview: unter Sperre des Verhaeltnisses. create_training_package
    -- haelt es FOR UPDATE; FOR SHARE wartet darauf, und die Abfrage danach
    -- sieht das neue Paket (READ COMMITTED, neuer Snapshot je Anweisung).
    -- Umgekehrt wartet die Paketanlage, bis diese Erfassung feststeht, und
    -- ihr Guard sieht sie. Sonst liefen beide an der Pruefung vorbei.
    perform 1 from public.training_relationships t where t.id = v_training for share;
    if app.training_package_covering(v_training, app.appointment_performed_on(new.appointment_id)) is not null then
      raise exception 'training appointment is covered by a training package' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.record_billable_services(p_appointment_id uuid, p_items jsonb)
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
  v_occasion     text;
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
         a.training_relationship_id, a.occasion
    into v_status, v_fee_basis, v_basis, v_patient, v_kind, v_training, v_occasion
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
  -- ERN-011 (ANN-622, ANN-664): Die Ernaehrungsberatung aus dem abgehakten
  -- Termin, in beiden Bereichen.
  if not app.appointment_is_billable(app.billing_kind(v_kind, v_occasion), v_status, v_fee_basis) then
    if v_occasion = 'nutrition_counselling' then
      raise exception 'nutrition counselling has not taken place' using errcode = '22023';
    end if;
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

  -- ERN-011: Am Beratungstermin nur die Position der Ernaehrungsberatung.
  v_erwartet := case when v_fee_basis is not null then 'absence_fee'
                     when v_occasion = 'nutrition_counselling' then 'nutrition_counselling'
                     else 'treatment' end;

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

create or replace function public.get_billable_service_draft(p_appointment_id uuid)
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
  v_occasion     text;
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
  select a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at), a.treatment_basis_id, a.kind, a.occasion
    into v_status, v_fee_basis, v_basis, v_kind, v_occasion
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
           -- ERN-011: Die Position der Beratung ist der Vorschlag.
           when v_occasion = 'nutrition_counselling' then true
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
    and i.item_kind = case when v_fee_basis is not null then 'absence_fee'
                           when v_occasion = 'nutrition_counselling' then 'nutrition_counselling'
                           else 'treatment' end
    and i.service_area = v_bereich
  order by i.sort_order;
end;
$function$;

create or replace function public.reopen_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-010 (ANN-186): dieselbe Rollenmenge wie beim Abschliessen.
  if not (app.can_reopen_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at,
         a.kind, a.training_relationship_id, a.completed_at, a.occasion
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be reopened' using errcode = '22023';
  end if;

  -- 'invoiced' hat keinen Rueckweg (Rechnungsstorno, ADR-018 Punkt 2). Ein
  -- 'documented' Termin kehrt nicht nach 'confirmed' zurueck; seit B4 laesst
  -- sich dort aber der Haken zuruecknehmen (ANN-512).
  -- Am Trainingstermin bleibt es beim Bisherigen (ADR-022 Punkt 6).
  if not (v_alt.status in ('completed', 'no_show')
          or (v_alt.status = 'documented' and v_alt.kind = 'therapy'
              and v_alt.completed_at is not null)) then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- ERN-011: Am Beratungstermin faellt die Position mit dem Haken, in
  -- beiden Bereichen - sie ist mit ihm entstanden.
  if v_alt.status = 'no_show'
     or (v_alt.kind <> 'therapy' and v_alt.occasion <> 'nutrition_counselling') then
    -- Ein Ausfallhonorar haengt am Vermerk, eine Trainingsleistung am
    -- Training (ABR-002): Zurueck geht es wie bisher nur ueber
    -- delete_billable_services im Buero (R3-002).
    if exists (
      select 1 from public.billable_services b where b.appointment_id = p_appointment_id
    ) then
      raise exception 'billable services recorded, remove them first' using errcode = '23514';
    end if;
  else
    -- B7 (BEF-157): Mit dem Haken gilt die Behandlung als erbracht; ohne ihn
    -- nicht mehr. Ihre Leistungen fallen mit, solange keine Rechnung und kein
    -- Entwurf sie fuehrt - sonst haelt der Vorgang an.
    perform app.withdraw_appointment_services(p_appointment_id);
  end if;

  if v_alt.status = 'documented' then
    update public.appointments
       set completed_at = null,
           completed_by = null,
           reopened_at  = now(),
           reopened_by  = v_actor,
           updated_at   = now()
     where id = p_appointment_id
       and updated_at = p_expected_updated_at
       and status = 'documented'
       and kind = 'therapy';
  else
    update public.appointments
       set status                     = 'confirmed',
           completed_at               = null,
           completed_by               = null,
           no_show_recorded_at        = null,
           no_show_recorded_by        = null,
           no_show_protocol_confirmed = null,
           fee_basis                  = null,
           -- LOG-EPIC-001: die Ruecknahme steht im Datenmodell, nicht im Log.
           reopened_at                = now(),
           reopened_by                = v_actor,
           updated_at                 = now()
     where id = p_appointment_id
       and updated_at = p_expected_updated_at
       and status in ('completed', 'no_show');
  end if;

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

create or replace function public.cancel_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_reason text, p_received_on date, p_received_time time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_tz      text;
  v_alt     record;
  v_eingang timestamptz;
  v_anlass  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-004: wie update_appointment - der Riegel an der Zeile entscheidet den Kontext.
  if not (app.can_cancel_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to cancel appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  -- Die Pflichtangabe wird vor jedem Lesen geprueft: eine unvollstaendige
  -- Eingabe darf nicht erst an der Constraint scheitern.
  if p_reason is null
     or p_reason not in ('patient_request', 'practice_request', 'patient_moved', 'practice_moved', 'other') then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  -- Halb angegeben ist nicht angegeben: Ein Datum ohne Uhrzeit waere
  -- Mitternacht, und das ist eine Erfindung, keine Angabe.
  if (p_received_on is null) <> (p_received_time is null) then
    raise exception 'cancellation receipt needs date and time' using errcode = '22023';
  end if;

  if p_received_on is null then
    v_eingang := now();
  else
    select o.time_zone into v_tz from public.organizations o where o.id = v_org;
    if v_tz is null then
      raise exception 'organization has no time zone' using errcode = '22023';
    end if;
    v_eingang := (p_received_on + p_received_time) at time zone v_tz;
  end if;

  -- Eine Absage, die noch nicht eingegangen ist, gibt es nicht. Ohne diese
  -- Grenze liesse sich die Frist durch ein Datum in der Zukunft aushebeln.
  if v_eingang > now() then
    raise exception 'cancellation cannot be received in the future' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.starts_at, a.updated_at, a.occasion,
         a.training_relationship_id
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'appointment is already cancelled' using errcode = '22023';
  end if;

  if v_alt.status in ('completed', 'no_show') then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'documented appointment cannot be changed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Die Frist rechnet der Server, aus dem Eingang und dem VEREINBARTEN Beginn
  -- des Termins - nie aus der Eingabezeit und nie im Browser
  -- (PROJECT_PRINCIPLES.md 8).
  --
  -- Und nur an einer BEHANDLUNG: Ein Ereignis des Praxisbetriebs hat keine
  -- Patient:in, die absagen koennte, und keinen Behandlungsbeginn, auf den
  -- sich eine Frist beziehen liesse (CAL-016, 8.1).
  -- ANN-178: Auch am Trainingstermin nicht - ob der Anlass im Dienstvertrag
  -- ueber Training entsteht, ist eine offene Vertragsfrage (ADR-022).
  v_anlass := case
    -- ERN-011 (ANN-664): Die Ernaehrungsberatung ist keine Behandlung.
    when v_alt.kind = 'therapy' and v_alt.occasion = 'regular'
     and app.is_late_cancellation(p_reason, v_eingang, v_alt.starts_at) then 'late_cancellation'
    else null
  end;

  update public.appointments
     set status                   = 'cancelled',
         cancellation_reason      = p_reason,
         cancellation_received_at = v_eingang,
         fee_basis                = v_anlass,
         cancelled_at             = now(),
         cancelled_by             = v_actor,
         updated_at               = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

create or replace function public.record_no_show(p_appointment_id uuid, p_expected_updated_at timestamp with time zone, p_protocol_confirmed boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_protokoll boolean;
  v_anlass   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.occasion,
         a.appointment_type, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- TRN-006: kein Durchgriff ueber den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  -- ERN-011 (ANN-664): An der Ernaehrungsberatung Vermerk ja, Forderung nein.
  if v_alt.kind <> 'therapy' or v_alt.occasion <> 'regular' then
    -- Der Trainingstermin: Vermerk ja, Forderung nein. Das Protokoll aus
    -- ANN-055 traegt den Anlass; ohne Anlass hat es nichts zu bestaetigen.
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to treatment appointments only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;

  -- Das Protokoll ist ein Hausbesuchsprotokoll (ANN-055). An der Praxistuer
  -- gibt es nichts zu klingeln, und eine Bestaetigung, die niemand geben
  -- kann, waere hier die Grundlage einer Forderung.
  elsif v_alt.appointment_type = 'home_visit' then
    if p_protocol_confirmed is not true then
      raise exception 'no-show protocol must be confirmed for home visits'
        using errcode = '22023';
    end if;
    v_protokoll := true;
    v_anlass    := 'no_show';
  else
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to home visits only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                    = 'no_show',
         no_show_recorded_at       = now(),
         no_show_recorded_by       = v_actor,
         no_show_protocol_confirmed = v_protokoll,
         fee_basis                 = v_anlass,
         updated_at                = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

-- Rückgabe um den Anlass erweitert: neu anlegen, Rechte und Beschreibung wie zuvor.
drop function public.list_open_billable_appointments(integer);
create or replace function public.list_open_billable_appointments(p_limit integer DEFAULT 100)
 RETURNS TABLE(appointment_id uuid, patient_id uuid, training_relationship_id uuid, service_area text, patient_name text, performed_on date, starts_at timestamp with time zone, status text, fee_basis text, appointment_type text, suggestion_count integer, occasion text)
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
         ),
         a.occasion
  from public.appointments a
  join public.organizations o on o.id = a.organization_id
  left join public.patients p on p.id = a.patient_id
  left join public.training_relationships t on t.id = a.training_relationship_id
  join public.persons pe on pe.id = coalesce(p.person_id, t.person_id)
  where a.organization_id = v_org
    and a.kind in ('therapy', 'training')
    -- ABN-006: Nach einem Verzicht ist der Anlass keine offene Leistung mehr.
    and app.appointment_is_billable(app.billing_kind(a.kind, a.occasion), a.status, app.billable_fee_basis(a.fee_basis, a.fee_waived_at))
    -- B4/B7 (ANN-513): Ohne Haken ist am Behandlungstermin nichts erbracht -
    -- ausser einem Gebuehrenanlass.
    and (app.billable_fee_basis(a.fee_basis, a.fee_waived_at) is not null
         or app.appointment_is_checked(a.kind, a.status, a.completed_at))
    and not exists (
      select 1 from public.billable_services b where b.appointment_id = a.id
    )
    -- ANG-007 (ANN-279): Ein Trainingstermin im Paket ist bezahlt - eine
    -- Ernaehrungsberatung nicht (ERN-011).
    and (a.kind <> 'training'
         or a.occasion = 'nutrition_counselling'
         or app.training_package_covering(
              a.training_relationship_id, (a.starts_at at time zone o.time_zone)::date) is null)
  order by a.starts_at desc, a.id
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$function$;

revoke all on function public.list_open_billable_appointments(integer) from public, anon;
grant execute on function public.list_open_billable_appointments(integer) to authenticated;
comment on function public.list_open_billable_appointments(integer) is
  'Termine, aus denen eine Leistung entstehen darf und an denen noch keine erfasst ist (ABR-002, TRN-007): Behandlung dokumentiert oder mit Gebuehrenanlass, Training durchgefuehrt, Ernaehrungsberatung abgehakt (ERN-011, mit occasion). Der Name kommt aus dem Verhaeltnis des Termins, nie aus der Akte eines Trainingstermins. Die Arbeitsliste des Abrechnungsbereichs.';

drop function public.list_appointments(date, date, uuid, uuid, text);
create or replace function public.list_appointments(p_from date, p_to date, p_staff_member_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, location_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, staff_given_name text, staff_family_name text, location_name text, training_relationship_id uuid, training_given_name text, training_family_name text, documentation_status text, visit_street text, visit_house_number text, occasion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
  -- Zyklen 2-4: wer den Bearbeitungsstand sehen darf (wie list_day_plan).
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- TRN-006: Der Kalender ist auch der Trainingsbetreuung offen; welche
  -- Zeilen sie sieht, entscheidet weiter der Kontext (ADR-022 Punkt 11).
  if not app.can_read_calendar() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_from is null or p_to is null then
    raise exception 'from and to are required' using errcode = '22023';
  end if;

  if p_to <= p_from then
    raise exception 'to must be after from' using errcode = '22023';
  end if;

  if p_to - p_from > 31 then
    raise exception 'requested range is too large' using errcode = '22023';
  end if;

  if p_status is null
     or p_status not in (
       'confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced',
       'active', 'done', 'all'
     ) then
    raise exception 'unknown status filter' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_darf_nachweis := app.can_read_treatment_note();

  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.location_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name,
      a.training_relationship_id,
      tp.given_name,
      tp.family_name,
      -- Zyklen 2-4: der Stand des Haupteintrags, nur am Behandlungstermin.
      -- ERN-011: Die Ernaehrungsberatung kennt keine Behandlungsdoku.
      case when v_darf_nachweis and a.kind = 'therapy' and a.occasion = 'regular'
           then coalesce(t.status, 'none') end,
      -- UBK-017, ANN-242: Strasse und Hausnummer am Hausbesuch - wer die
      -- Zeile sieht, sieht wohin; Postleitzahl und Ort bleiben am Termin.
      case when a.appointment_type = 'home_visit' then a.visit_street end,
      case when a.appointment_type = 'home_visit' then a.visit_house_number end,
      -- ERN-011 (ANN-664): der Anlass, ohne Inhalt der Beratung.
      a.occasion
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    -- TRN-006: der Name am Trainingstermin kommt ueber das Verhaeltnis, nie
    -- ueber die Akte (ADR-021 Punkt 3).
    left join public.training_relationships tr on tr.id = a.training_relationship_id
    left join public.persons tp                on tp.id = tr.person_id
    -- Zyklen 2-4: nur der Haupteintrag (ADR-016 Punkt 6).
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id = v_org
      and app.may_read_appointment_context(a.kind)
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
      and (p_location_id     is null or a.location_id     = p_location_id)
      and (
        p_status = 'all'
        or (p_status = 'active' and a.status <> 'cancelled')
        or (p_status = 'done'   and a.status in ('completed', 'documented', 'invoiced'))
        or a.status = p_status
      )
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$function$;

comment on function public.list_appointments(date, date, uuid, uuid, text) is
  'Liefert die Termine der eigenen Organisation in einem begrenzten Zeitfenster fuer die Kalenderansichten, Behandlungen wie Ereignisse (CAL-002, CAL-004, CAL-008a, CAL-015b), seit TRN-006 auch fuer die Trainingsbetreuung - je Zeile nach Kontext gefiltert (ADR-022 Punkt 11), am Trainingstermin mit Verhaeltnis und Namen. Seit dem UI-Redesign Zyklen 2-4 mit dem Bearbeitungsstand der Dokumentation (documentation_status) am Behandlungstermin, nur fuer Rollen mit app.can_read_treatment_note(). Seit UBK-017 am Hausbesuch mit Strasse und Hausnummer (ANN-242). Seit ERN-011 mit dem Anlass (occasion, ANN-665); an der Ernaehrungsberatung ohne Dokumentationsstand.';
revoke all on function public.list_appointments(date, date, uuid, uuid, text) from public, anon;
grant execute on function public.list_appointments(date, date, uuid, uuid, text) to authenticated;

drop function public.list_day_plan(date, uuid);
create or replace function public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text, visit_lat double precision, visit_lon double precision, treatment_table_required boolean, take_along_items text[], training_relationship_id uuid, training_given_name text, training_family_name text, checked_at timestamp with time zone, occasion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  -- TRN-006: Der Kalender ist auch der Trainingsbetreuung offen; welche
  -- Zeilen sie sieht, entscheidet weiter der Kontext (ADR-022 Punkt 11).
  if not app.can_read_calendar() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_note();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016). Am
      -- Trainingstermin gilt dasselbe, und zwar dauerhaft (ADR-022 Punkt 6).
      -- ERN-011: Die Ernaehrungsberatung kennt keine Behandlungsdoku.
      case when v_darf_nachweis and a.kind = 'therapy' and a.occasion = 'regular'
           then coalesce(t.status, 'none') end,
      v_tz,
      -- MAP-006d: die Kartenposition des Hausbesuchs fuer den Handoff (ANN-018).
      a.visit_lat,
      a.visit_lon,
      -- UX-003b: Behandlungsliege nur am Behandlungstermin (ANN-116).
      case when a.kind = 'therapy' then coalesce(care.treatment_table_required, false) end,
      -- PRX-007: Mitnehmen nur am Behandlungstermin (ANN-138).
      case when a.kind = 'therapy' then coalesce(care.take_along_items, '{}'::text[]) end,
      a.training_relationship_id,
      tp.given_name,
      tp.family_name,
      -- B4 (BEF-154, ADR-018 Fassung 5): der Haken als eigenes Merkmal. Ein
      -- dokumentierter Termin ist nicht von selbst abgehakt.
      a.completed_at,
      -- ERN-011 (ANN-664): der Anlass.
      a.occasion
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    -- TRN-006: der Name am Trainingstermin kommt ueber das Verhaeltnis, nie
    -- ueber die Akte (ADR-021 Punkt 3).
    left join public.training_relationships tr on tr.id = a.training_relationship_id
    left join public.persons tp                on tp.id = tr.person_id
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$function$;

comment on function public.list_day_plan(date, uuid) is
  'Tagesliste einer Person (UX-001, TRN-006, ABN-005); seit B4 mit checked_at - dem Haken als eigenem Merkmal neben dem Zustand (ADR-018 Fassung 5); seit ERN-011 mit dem Anlass (occasion), an der Ernaehrungsberatung ohne Dokumentationsstand.';
revoke all on function public.list_day_plan(date, uuid) from public, anon;
grant execute on function public.list_day_plan(date, uuid) to authenticated;

drop function public.get_training_appointment(uuid);
create or replace function public.get_training_appointment(p_appointment_id uuid)
 RETURNS TABLE(id uuid, training_relationship_id uuid, training_basis_id uuid, client_given_name text, client_family_name text, staff_member_id uuid, staff_given_name text, staff_family_name text, location_id uuid, location_name text, appointment_type text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, updated_at timestamp with time zone, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, cancellation_reason text, cancellation_received_at timestamp with time zone, organization_time_zone text, occasion text)
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
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read training appointments');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training appointments' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.organization_id = v_org and a.kind = 'training'
  ) then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  return query
    select a.id, a.training_relationship_id, a.training_basis_id,
           tp.given_name, tp.family_name,
           a.staff_member_id, sp.given_name, sp.family_name,
           a.location_id, l.name,
           a.appointment_type, a.status, a.starts_at, a.ends_at, a.updated_at,
           a.visit_street, a.visit_house_number, a.visit_postal_code, a.visit_city,
           a.cancellation_reason, a.cancellation_received_at,
           o.time_zone,
           a.occasion
    from public.appointments a
    join public.training_relationships tr on tr.id = a.training_relationship_id
    join public.persons tp                on tp.id = tr.person_id
    join public.staff_members sm          on sm.id = a.staff_member_id
    join public.persons sp                on sp.id = sm.person_id
    join public.organizations o           on o.id = a.organization_id
    left join public.locations l          on l.id = a.location_id
    where a.id = p_appointment_id;
end;
$function$;

comment on function public.get_training_appointment(uuid) is
  'TRN-006: ein Trainingstermin mit Kund:in, betreuender Person und Ort; seit ERN-011 mit dem Anlass (occasion). owner, trainer, office; ein anderer Kontext ist nicht gefunden; abgewiesen mit denied unter appointments.read. Nicht protokolliert wie das Termindetail der Behandlung (ANN-180).';
revoke all on function public.get_training_appointment(uuid) from public, anon;
grant execute on function public.get_training_appointment(uuid) to authenticated;

-- Die Terminsicht der Anwendung nennt den Anlass (Fenster „Aktionen“).
create or replace view public.appointment_directory
with (security_invoker = true) as
 SELECT a.id,
    a.organization_id,
    a.patient_id,
    a.staff_member_id,
    a.location_id,
    a.treatment_basis_id,
    a.appointment_type,
    a.kind,
    a.title,
    a.event_group_id,
    a.event_series_id,
    a.status,
    a.starts_at,
    a.ends_at,
    a.updated_at,
    a.visit_street,
    a.visit_house_number,
    a.visit_postal_code,
    a.visit_city,
    a.completed_at,
    a.cancellation_reason,
    a.cancellation_received_at,
    a.fee_basis,
    a.no_show_recorded_at,
    a.no_show_protocol_confirmed,
    pp.given_name AS patient_given_name,
    pp.family_name AS patient_family_name,
    sp.given_name AS staff_given_name,
    sp.family_name AS staff_family_name,
    l.name AS location_name,
    o.time_zone AS organization_time_zone,
    COALESCE(( SELECT array_agg(DISTINCT n.channel ORDER BY n.channel) AS array_agg
           FROM public.appointment_notifications n
          WHERE n.appointment_id = a.id AND n.notified_at >= a.patient_relevant_changed_at), ARRAY[]::text[]) AS notification_channels,
    app.appointment_is_covered(a.id) AS treatment_basis_covered,
    a.fee_waived_at,
    -- ERN-011 (ANN-665): der Anlass.
    a.occasion
   FROM public.appointments a
     LEFT JOIN public.patients p ON p.id = a.patient_id
     LEFT JOIN public.persons pp ON pp.id = p.person_id
     JOIN public.staff_members sm ON sm.id = a.staff_member_id
     JOIN public.persons sp ON sp.id = sm.person_id
     JOIN public.organizations o ON o.id = a.organization_id
     LEFT JOIN public.locations l ON l.id = a.location_id;
