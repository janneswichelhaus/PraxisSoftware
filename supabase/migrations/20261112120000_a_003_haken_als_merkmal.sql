-- =============================================================================
-- B4 (BEF-154, Auftrag Jannes 14.10.2026, ADR-018 Fassung 5, ADR-016 Fassung 4):
-- Dokumentieren und Abhaken sind getrennt.
--
-- Bisher hakte das Festschreiben den Termin mit ab: `complete_treatment` rief
-- `complete_appointment`, und `app.mark_appointment_documented` setzte bei
-- einem noch bestaetigten Termin `completed_at` mit (ANN-036). Zuruecknehmen
-- liess sich der Haken nur aus 'completed' (nicht aus 'documented') und in der
-- Uebersicht nur kurz danach (ANN-483).
--
-- Jannes: „Eine festgeschriebene Doku hakt den Termin nicht automatisch ab.
-- Abgehakt wird separat in der Uebersicht oder im Kalender, und dort laesst es
-- sich auch wieder rueckgaengig machen (nicht nur kurz nach dem Haken).“
--
-- Umsetzung, ohne PROJECT_PRINCIPLES.md §8 zu beruehren („Dokumentiert setzt
-- die Finalisierung“): Der Zustand bleibt, wie er ist; der Haken ist das
-- Merkmal `completed_at`/`completed_by` daneben (ANN-512).
--   * Finalisierung: 'confirmed' oder 'completed' -> 'documented' wie bisher,
--     aber `completed_at` wird nicht mehr mitgesetzt.
--   * Haken (`complete_appointment`): 'confirmed' -> 'completed' wie bisher;
--     an einem 'documented' Termin ohne Haken setzt er nur das Merkmal.
--   * Haken zuruecknehmen (`reopen_appointment`): aus 'completed' wie bisher
--     nach 'confirmed'; an 'documented' loescht er nur das Merkmal (die Doku
--     bleibt finalisiert, ADR-018 Punkt 2 „documented kehrt nicht nach
--     confirmed zurueck“ bleibt wahr). Erfasste Leistungen des Termins fallen
--     dabei mit, solange keine Rechnung sie fuehrt (B7).
--   * `complete_treatment` schreibt und finalisiert nur noch.
--   * `list_day_plan` liefert den Haken (`checked_at`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Abschlussfelder: 'documented' darf ohne Haken stehen
--
-- Bisher (20260912100000_appointment_states.sql): 'documented' verlangte
-- completed_at, weil ein dokumentierter Termin immer durchgefuehrt war. Seit B4
-- traegt erst der Haken diese Aussage. 'completed' verlangt weiter beide
-- Felder, alle uebrigen Zustaende ausser 'invoiced' weiter keine.
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_completion_fields;

alter table public.appointments
  add constraint appointments_completion_fields check (
    (status = 'completed'  and completed_at is not null and completed_by is not null)
    -- B4 (BEF-154): mit oder ohne Haken; completed_by darf fehlen, wenn ein
    -- frueherer Stand den Haken mit der Finalisierung gesetzt hat (ANN-036).
    or (status = 'documented' and (completed_at is not null or completed_by is null))
    or (status = 'invoiced')
    or (status not in ('completed', 'documented', 'invoiced')
        and completed_at is null and completed_by is null)
  );

-- ANN-512: Der Haken ist ein Merkmal neben dem Zustand; die Finalisierung setzt ihn nie.
CREATE OR REPLACE FUNCTION app.mark_appointment_documented(p_appointment_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- B4 (BEF-154): Die Finalisierung setzt den Zustand (ADR-018 Punkt 3), den
  -- Haken nicht. completed_at/completed_by bleiben am Behandlungstermin, wie
  -- sie sind - an einem abgehakten gesetzt, an einem noch nicht abgehakten
  -- leer. Das Trainingsprotokoll schliesst die Einheit weiter mit ab
  -- (ANN-036, ADR-022 Punkt 6): Der Auftrag betrifft die Behandlungsdoku.
  update public.appointments a
     set status       = 'documented',
         completed_at = case when a.kind = 'training' then coalesce(a.completed_at, now())
                             else a.completed_at end,
         updated_at   = now()
   where a.id = p_appointment_id
     and a.status in ('confirmed', 'completed');

  return found;
end;
$function$;

comment on function app.mark_appointment_documented(uuid, uuid) is
  'ADR-018 Punkt 3, seit B4 (BEF-154, ANN-512): hebt einen bestaetigten oder abgehakten Termin auf documented, wenn seine Dokumentation finalisiert wird. Setzt den Haken (completed_at) am Behandlungstermin nicht mehr mit; am Trainingstermin wie bisher (ANN-036).';

-- -----------------------------------------------------------------------------
-- Leistungen eines Termins zuruecknehmen, ohne Rollenpruefung - nur fuer
-- reopen_appointment. Dieselben Regeln wie delete_billable_services: eine
-- abgerechnete oder in einem Entwurf stehende Leistung bleibt, dann scheitert
-- der ganze Vorgang.
-- -----------------------------------------------------------------------------
create function app.withdraw_appointment_services(p_appointment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  if exists (
    select 1 from public.billable_services
    where appointment_id = p_appointment_id and status = 'invoiced'
  ) or exists (
    select 1
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    where b.appointment_id = p_appointment_id
      and it.released_at is null
  ) then
    raise exception 'billable services are in billing' using errcode = '23514';
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

  delete from public.invoice_items it
   using public.billable_services b
   where it.billable_service_id = b.id
     and b.appointment_id = p_appointment_id
     and it.released_at is not null;

  delete from public.appointment_session_fees where appointment_id = p_appointment_id;

  delete from public.billable_services where appointment_id = p_appointment_id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function app.withdraw_appointment_services(uuid) from public, anon, authenticated;

comment on function app.withdraw_appointment_services(uuid) is
  'B4/B7 (BEF-154, BEF-157): nimmt die Leistungen eines Termins zurueck, wenn sein Haken zurueckgenommen wird - ohne eigene Rollenpruefung, nur aus reopen_appointment. Abgerechnete oder in einem Entwurf stehende Leistungen halten den Vorgang an.';

CREATE OR REPLACE FUNCTION public.complete_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
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

  -- TRN-010 (ANN-186): Am Trainingstermin schliessen die Rollen ab, die ihn
  -- schreiben - owner, trainer, office (app.may_write_appointment_context).
  -- Welcher Kontext, entscheidet die Abfrage unten; eine Rolle ohne Zugang zum
  -- Kontext findet den Termin nicht (ADR-022 Punkt 11).
  if not (app.can_complete_appointment() or app.can_write_training_relationships()) then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind, a.updated_at,
         a.training_relationship_id, a.completed_at
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
    raise exception 'event cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'no-show appointment must be reopened first' using errcode = '22023';
  end if;

  -- B4 (BEF-154, ANN-512): Ein dokumentierter Termin ohne Haken bekommt den
  -- Haken; sein Zustand bleibt 'documented'.
  if not (v_alt.status = 'confirmed'
          or (v_alt.status = 'documented' and v_alt.kind = 'therapy'
              and v_alt.completed_at is null)) then
    raise exception 'appointment is already completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = case when status = 'confirmed' then 'completed' else status end,
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and (status = 'confirmed'
          or (status = 'documented' and kind = 'therapy' and completed_at is null));

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;


  return p_appointment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_appointment(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
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
         a.kind, a.training_relationship_id, a.completed_at
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

  if v_alt.status = 'no_show' or v_alt.kind <> 'therapy' then
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

comment on function public.reopen_appointment(uuid, timestamptz) is
  'Nimmt den Haken zurueck (ADR-018 Fassung 5, B4): completed oder no_show -> confirmed; an documented nur das Merkmal completed_at, die Doku bleibt finalisiert. Die Leistungen eines Behandlungstermins fallen mit, solange keine Rechnung sie fuehrt; ein Ausfallhonorar oder eine Trainingsleistung haelt den Vorgang wie bisher an (R3-002).';

create or replace function public.complete_treatment(
  p_appointment_id                  uuid,
  p_content                         text,
  p_expected_appointment_updated_at timestamptz,
  p_expected_note_updated_at        timestamptz default null,
  p_visit_without_treatment         boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_id      uuid;
  v_note_stand   timestamptz;
  v_note_status  text;
  v_org          uuid;
  v_termin       record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  select a.id, a.status, a.appointment_type, a.updated_at
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  -- Veralteter Terminstand: Wer die Seite an einem offenen Termin geoeffnet
  -- hat, schreibt nicht auf einen inzwischen verlegten oder geaenderten Termin.
  -- Bisher prueft das complete_appointment; die Pruefung bleibt hier, auch
  -- wenn nicht mehr abgehakt wird. Ein abgehakter Termin nimmt den Eintrag wie
  -- bisher ohne diese Pruefung an (der Haken aendert updated_at).
  if v_termin.status = 'confirmed'
     and v_termin.updated_at is distinct from p_expected_appointment_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  if p_visit_without_treatment is true and v_termin.appointment_type <> 'home_visit' then
    raise exception 'visit without treatment applies to home visits only' using errcode = '22023';
  end if;

  select t.id, t.updated_at, t.status
    into v_note_id, v_note_stand, v_note_status
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if v_note_id is null then
    if p_expected_note_updated_at is not null then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    v_note_id := public.create_treatment_note(p_appointment_id, p_content);
  else
    if p_expected_note_updated_at is null
       or v_note_stand is distinct from p_expected_note_updated_at then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    if v_note_status = 'final' then
      raise exception 'treatment note is already final' using errcode = '22023';
    end if;
    perform public.update_treatment_note(v_note_id, v_note_stand, p_content);
  end if;

  -- B4 (BEF-154): Kein Abschluss des Termins mehr - abgehakt wird getrennt
  -- (Uebersicht, Kalender).

  -- Der Pflichtvermerk gehoert zum Eintrag, nicht zum Termin: Er sagt etwas
  -- ueber die Behandlung aus, und die steht in der Akte. Ohne `updated_at`,
  -- damit der Stand fuer die Finalisierung gleich darunter derselbe bleibt,
  -- den update_treatment_note hinterlassen hat.
  update public.treatment_notes
     set visit_without_treatment = coalesce(p_visit_without_treatment, false)
   where id = v_note_id;

  -- Nach dem Schreiben neu lesen: update_treatment_note laesst den Stand bei
  -- unveraendertem Text bewusst stehen, bei geaendertem setzt es ihn neu.
  select t.updated_at into v_note_stand
  from public.treatment_notes t
  where t.id = v_note_id;

  -- Dann die Finalisierung, die den Termin auf documented hebt (CAL-008d).
  perform public.finalize_treatment_note(v_note_id, v_note_stand);

  return v_note_id;
end;
$$;

comment on function public.complete_treatment(uuid, text, timestamptz, timestamptz, boolean) is
  'Schreibt und finalisiert die Dokumentation eines Termins in einem Schritt (UX-007). Seit B4 (BEF-154) ohne Abschluss des Termins: abgehakt wird getrennt. Traegt auf Wunsch den Pflichtvermerk aus Hausbesuch-Szenario 1 ein (CAL-018). Der Termin steht danach auf documented (ADR-018 Punkt 3).';

-- -----------------------------------------------------------------------------
-- Tagesliste mit Haken: juengste Fassung aus 20261002124000_abn_005, dazu
-- checked_at. Die Rueckgabe aendert sich, deshalb neu angelegt.
-- -----------------------------------------------------------------------------
drop function public.list_day_plan(date, uuid);

CREATE FUNCTION public.list_day_plan(p_date date, p_staff_member_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text, title text, status text, starts_at timestamp with time zone, ends_at timestamp with time zone, patient_given_name text, patient_family_name text, location_name text, visit_street text, visit_house_number text, visit_postal_code text, visit_city text, patient_phone text, patient_phone_mobile text, home_visit_access_note text, special_note text, documentation_status text, organization_time_zone text, visit_lat double precision, visit_lon double precision, treatment_table_required boolean, take_along_items text[], training_relationship_id uuid, training_given_name text, training_family_name text, checked_at timestamp with time zone)
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
      case when v_darf_nachweis and a.kind = 'therapy' then coalesce(t.status, 'none') end,
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
      a.completed_at
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
  'Tagesliste einer Person (UX-001, TRN-006, ABN-005); seit B4 mit checked_at - dem Haken als eigenem Merkmal neben dem Zustand (ADR-018 Fassung 5).';

revoke all on function public.list_day_plan(date, uuid) from public, anon;
grant execute on function public.list_day_plan(date, uuid) to authenticated;
