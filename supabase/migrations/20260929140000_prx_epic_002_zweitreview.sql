-- =============================================================================
-- PRX-EPIC-002: Befunde des Zweitreviews
--
--   * get_appointment_brief und get_appointment_billing_context suchen den
--     Termin nur in den Bereichen, die die Rolle lesen darf
--     (app.may_read_appointment_context, ADR-022 Punkt 11). Ein
--     Trainingstermin sah fuer eine Therapeutin bisher anders aus als ein
--     unbekannter - die Fehlermeldung bestaetigte, dass es ihn gibt.
--   * record_billable_services: Behandelnde erfassen am eigenen Termin nur
--     Heilmittel, kein Ausfallhonorar (ANN-140). Das Honorar ist eine
--     Forderung gegen die Patient:in und bleibt bei owner und office.
-- Rumpfe aus 20260929110000, 20260929120000 und 20260929130000; geaendert
-- sind nur die markierten Zeilen.
-- =============================================================================

create or replace function public.get_appointment_brief(p_appointment_id uuid)
returns table (
  appointment_id              uuid,
  patient_id                  uuid,
  home_visit_access_note      text,
  special_note                text,
  take_along_items            text[],
  primary_therapist_name      text,
  treatment_basis_id          uuid,
  treatment_basis_kind        text,
  treatment_basis_issued_on   date,
  basis_appointment_count     integer,
  basis_used                  integer,
  basis_planned               integer,
  basis_items                 jsonb,
  last_note_id                uuid,
  last_note_appointment_start timestamptz,
  last_note_status            text,
  last_note_content           text,
  last_note_visit_without_treatment boolean,
  last_note_author_name       text,
  organization_time_zone      text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_start   timestamptz;
  v_basis   uuid;
  v_note    uuid;
  v_prescribed integer;
  v_used       integer;
  v_planned    integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS; die Rollen prueft die Funktion selbst
  -- (ADR-004). Beide Rechte, weil der Blick Termin und Eintrag zeigt.
  if not (app.can_read_appointments() and app.can_read_treatment_note()) then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'appointment_brief.viewed', 'not allowed to read appointment brief');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointment brief' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.starts_at, a.treatment_basis_id
    into v_patient, v_kind, v_start, v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- Zweitreview: Ein Termin aus einem Bereich, den die Rolle nicht sieht
    -- (ADR-022 Punkt 11), ist von einem unbekannten nicht zu unterscheiden.
    and app.may_read_appointment_context(a.kind);

  -- Ein fremder Termin ist von einem unbekannten nicht zu unterscheiden.
  if not found then
    return;
  end if;

  if v_kind <> 'therapy' or v_patient is null then
    raise exception 'an appointment brief exists only for treatment appointments'
      using errcode = '22023';
  end if;

  -- Der letzte Haupteintrag vor diesem Termin, aus einem Behandlungstermin
  -- derselben Person. Nachtraege stehen in der Akte, nicht im Kurzblick.
  -- Geordnet wie ueberall nach Beginn und Kennung.
  select t.id into v_note
  from public.treatment_notes t
  join public.appointments frueher on frueher.id = t.appointment_id
  where frueher.patient_id = v_patient
    and frueher.organization_id = v_org
    and frueher.kind = 'therapy'
    and frueher.id <> p_appointment_id
    and (frueher.starts_at, frueher.id) < (v_start, p_appointment_id)
    and t.addendum_to_note_id is null
  order by frueher.starts_at desc, frueher.id desc
  limit 1;

  if v_basis is not null then
    select z.prescribed, z.used, z.planned
      into v_prescribed, v_used, v_planned
    from app.treatment_basis_slot_counts(v_basis, v_org) z;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment_brief.viewed', 'appointment', p_appointment_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient, 'treatment_note_id', v_note)
  );

  if v_note is not null then
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    values (
      v_org, v_actor, 'treatment_note.viewed', 'treatment_note', v_note, 'success',
      jsonb_build_object(
        'surface', 'appointment_brief',
        'appointment_id', p_appointment_id,
        'patient_id', v_patient
      )
    );
  end if;

  return query
    select
      p_appointment_id,
      v_patient,
      cd.home_visit_access_note,
      cd.special_note,
      coalesce(cd.take_along_items, '{}'::text[]),
      case when tp.id is null then null else tp.given_name || ' ' || tp.family_name end,
      b.id,
      b.treatment_basis_kind,
      b.issued_on,
      v_prescribed,
      v_used,
      v_planned,
      case when b.id is null then null else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'remedy', i.remedy,
                   'prescribed_quantity', i.prescribed_quantity,
                   'used_quantity', i.used_quantity
                 )
                 order by i.sort_order, i.id
               )
        from public.treatment_base_items i
        where i.treatment_basis_id = b.id
      ), '[]'::jsonb) end,
      t.id,
      frueher.starts_at,
      t.status,
      t.content,
      t.visit_without_treatment,
      verfasser.display_name,
      o.time_zone
    from public.organizations o
    left join public.patient_care_details cd on cd.patient_id = v_patient
    left join public.staff_members tsm       on tsm.id = cd.primary_therapist_staff_member_id
    left join public.persons tp              on tp.id = tsm.person_id
    left join public.treatment_bases b       on b.id = v_basis and b.organization_id = v_org
    left join public.treatment_notes t       on t.id = v_note
    left join public.appointments frueher    on frueher.id = t.appointment_id
    left join public.user_profiles verfasser on verfasser.id = t.created_by
    where o.id = v_org;
end;
$$;

create or replace function public.get_appointment_billing_context(p_appointment_id uuid)
returns table (
  appointment_id            uuid,
  treatment_basis_id        uuid,
  treatment_basis_kind      text,
  treatment_basis_issued_on date,
  basis_position            integer,
  basis_appointment_count   integer,
  billing_visible           boolean,
  recipient_kind            text,
  open_invoice_count        integer,
  open_outstanding_cents    integer,
  open_overdue              boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_basis   uuid;
  v_darf    boolean;
  v_heute   date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.treatment_basis_id
    into v_patient, v_kind, v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- Zweitreview: ein nicht lesbarer Bereich wie ein unbekannter Termin.
    and app.may_read_appointment_context(a.kind);

  if not found then
    return;
  end if;

  -- Die Abrechnungslage gibt es am Behandlungstermin. Training rechnet ueber
  -- ein eigenes Verhaeltnis ab (ADR-021), eine Fehlzeit gar nicht.
  if v_kind <> 'therapy' or v_patient is null then
    raise exception 'a billing context exists only for treatment appointments'
      using errcode = '22023';
  end if;

  -- ANN-139: Zahlungsinformationen nur fuer die Rollen der Abrechnung.
  v_darf := app.can_read_invoicing();
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return query
    select
      p_appointment_id,
      b.id,
      b.treatment_basis_kind,
      b.issued_on,
      app.appointment_basis_position(p_appointment_id),
      b.appointment_count,
      v_darf,
      case when v_darf then coalesce((
        select r.recipient_kind
        from public.invoice_recipients r
        where r.patient_id = v_patient
          and r.organization_id = v_org
          and r.is_default
      ), 'self') end,
      case when v_darf then offen.anzahl end,
      case when v_darf then offen.betrag end,
      case when v_darf then offen.ueberfaellig end
    from (select 1) eins
    left join public.treatment_bases b on b.id = v_basis and b.organization_id = v_org
    left join lateral (
      select count(*)::integer as anzahl,
             coalesce(sum(o.outstanding_cents), 0)::integer as betrag,
             coalesce(bool_or(o.due_on < v_heute), false) as ueberfaellig
      from app.open_invoices(v_org) o
      where o.patient_id = v_patient
    ) offen on v_darf;
end;
$$;

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

  -- PRX-009 (ANN-140): owner und office an jedem Termin, Behandelnde an
  -- ihrem eigenen. Ein fremder Termin ist von einem unbekannten nicht zu
  -- unterscheiden - beide scheitern hier gleich.
  if not app.can_record_services_for_appointment(p_appointment_id) then
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

  -- Zweitreview (ANN-140): Am eigenen Termin bestaetigen Behandelnde die
  -- Heilmittel. Ein Ausfallhonorar ist eine Forderung gegen die Patient:in
  -- und bleibt beim Buero.
  if v_erwartet = 'absence_fee' and not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

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
      -- PRX-009: ob am Termin von der behandelnden Person abgehakt oder im
      -- Buero erfasst - fuer den Nachweis, nicht fuer eine Auswertung (§20).
      'recorded_by_role', case when app.can_record_billable_services() then 'billing' else 'treating' end,
      'patient_id', v_patient,
      'item_count', v_anzahl,
      'performed_on', v_performed_on
    )
  );

  return v_anzahl;
end;
$$;

-- Zweitreview (Kleinigkeit): list_day_plan ohne Recht fuer anon, wie die
-- uebrigen Lesepfade. Ohne Sitzung wies die Funktion schon vorher ab.
revoke all on function public.list_day_plan(date, uuid) from anon;
