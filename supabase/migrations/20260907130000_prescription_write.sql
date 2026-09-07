-- =============================================================================
-- Verordnung anlegen, aendern und loeschen (VER-003)
--
-- Wie die Patientenstammdaten: SECURITY-DEFINER-RPCs statt direkter
-- Schreibrechte. Verordnung und Positionen entstehen und aendern sich in EINER
-- Transaktion; eine Verordnung ohne Positionen oder mit halb geschriebenen
-- Positionen waere ein Kontingent, auf das man sich nicht verlassen kann
-- (PROJECT_PRINCIPLES.md 13).
--
-- ANN-011: Schreiben duerfen nur die therapeutischen Rollen. Wer eine
-- Verordnung erfasst, tippt die Diagnose mit ab; ein Schreibrecht fuer office
-- waere ein Leserecht auf klinischen Freitext durch die Hintertuer.
--
-- Warum es ein Loeschen gibt: Eine Verordnung, die versehentlich in der
-- falschen Akte landet, ist genau die Falschzuordnung, die M6 als schwersten
-- Befund fuehrt. Art. 16 DSGVO verlangt die Berichtigung unrichtiger Daten,
-- und ADR-008 Punkt 10 verbietet ausdruecklich nur das dauerhafte
-- Soft-Delete, nicht die echte Loeschung. Der Vorgang ist auditpflichtig und
-- den therapeutischen Rollen vorbehalten.
--
-- Die Positionen kommen als JSON-Feld statt als einzelne Parameter: ihre
-- Anzahl steht erst zur Laufzeit fest. Der Server liest ausschliesslich die
-- Felder, die er kennt, und erzeugt die Schluessel und die Reihenfolge selbst.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern (ADR-010)
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
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.completed',
    'appointment.reopened',
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
    'prescription.deleted'
  ));

-- -----------------------------------------------------------------------------
-- Positionen aus dem JSON-Feld pruefen und schreiben
--
-- Eine Stelle fuer beide Schreibpfade: waeren Anlegen und Aendern getrennt
-- validiert, wuerde eine Regel frueher oder spaeter nur an einer Stelle
-- nachgezogen.
--
-- Die Reihenfolge im Feld bestimmt sort_order. Eine mitgelieferte id wird
-- beibehalten, damit eine bestehende Position beim Aendern nicht neu entsteht;
-- eine id, die nicht zu dieser Verordnung gehoert, wird ignoriert und die
-- Position neu angelegt - sie kann so nicht als Hebel auf fremde Zeilen
-- dienen.
-- -----------------------------------------------------------------------------
create function app.write_prescription_items(
  p_prescription_id uuid,
  p_organization_id uuid,
  p_actor           uuid,
  p_items           jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eintrag    jsonb;
  v_position   smallint := 0;
  v_remedy     text;
  v_verordnet  integer;
  v_genutzt    integer;
  v_id         uuid;
  v_behalten   uuid[] := array[]::uuid[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'at least one prescription item is required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many prescription items' using errcode = '22023';
  end if;

  for v_eintrag in select * from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;

    v_remedy := nullif(btrim(v_eintrag ->> 'remedy'), '');
    if v_remedy is null then
      raise exception 'remedy is required' using errcode = '22023';
    end if;

    -- Zahlen ausdruecklich als Zahl lesen: ein Text im Feld soll eine klare
    -- Meldung erzeugen und keine stillschweigende Umdeutung.
    if jsonb_typeof(v_eintrag -> 'prescribed_quantity') <> 'number'
       or jsonb_typeof(coalesce(v_eintrag -> 'used_quantity', '0'::jsonb)) <> 'number' then
      raise exception 'quantities must be numbers' using errcode = '22023';
    end if;

    v_verordnet := (v_eintrag ->> 'prescribed_quantity')::integer;
    v_genutzt   := coalesce((v_eintrag ->> 'used_quantity')::integer, 0);

    if v_verordnet < 1 or v_verordnet > 500 then
      raise exception 'prescribed quantity out of range' using errcode = '22023';
    end if;

    if v_genutzt < 0 or v_genutzt > v_verordnet then
      raise exception 'used quantity out of range' using errcode = '22023';
    end if;

    -- Eine mitgelieferte id zaehlt nur, wenn sie zu dieser Verordnung gehoert.
    select i.id into v_id
    from public.prescription_items i
    where i.prescription_id = p_prescription_id
      and i.id = nullif(v_eintrag ->> 'id', '')::uuid;

    if v_id is null then
      insert into public.prescription_items (
        organization_id, prescription_id, sort_order, remedy,
        prescribed_quantity, used_quantity, created_by
      )
      values (
        p_organization_id, p_prescription_id, v_position, v_remedy,
        v_verordnet, v_genutzt, p_actor
      )
      returning id into v_id;
    else
      update public.prescription_items
         set sort_order          = v_position,
             remedy              = v_remedy,
             prescribed_quantity = v_verordnet,
             used_quantity       = v_genutzt
       where id = v_id;
    end if;

    v_behalten := array_append(v_behalten, v_id);
  end loop;

  -- Was nicht mehr im Feld steht, ist entfernt worden.
  delete from public.prescription_items i
  where i.prescription_id = p_prescription_id
    and not (i.id = any (v_behalten));
end;
$$;

comment on function app.write_prescription_items(uuid, uuid, uuid, jsonb) is
  'Schreibt die Positionen einer Verordnung aus dem JSON-Feld: prueft Bezeichnung und Mengen, vergibt die Reihenfolge und entfernt weggefallene Positionen (VER-003).';

revoke all on function app.write_prescription_items(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Gemeinsame Pruefung der Kopfdaten
-- -----------------------------------------------------------------------------
create function app.assert_prescription_input(
  p_organization_id  uuid,
  p_prescriber_id    uuid,
  p_prescription_kind text,
  p_issued_on        date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_prescription_kind not in ('first', 'follow_up') then
    raise exception 'unknown prescription kind' using errcode = '22023';
  end if;

  if p_issued_on is null then
    raise exception 'issued_on is required' using errcode = '22023';
  end if;

  -- Ein Ausstellungsdatum in der Zukunft ist in der Praxis ein Tippfehler und
  -- keine Verordnung (PROJECT_PRINCIPLES.md 13).
  if p_issued_on > current_date then
    raise exception 'issued_on must not be in the future' using errcode = '22023';
  end if;

  -- Verordner:in ausschliesslich in der eigenen Organisation suchen: eine
  -- fremde und eine unbekannte ID sind nicht zu unterscheiden.
  if not exists (
    select 1 from public.prescribers v
    where v.id = p_prescriber_id and v.organization_id = p_organization_id
  ) then
    raise exception 'prescriber not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function app.assert_prescription_input(uuid, uuid, text, date) is
  'Prueft Art, Ausstellungsdatum und Verordner:in einer Verordnung (VER-003).';

revoke all on function app.assert_prescription_input(uuid, uuid, text, date)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- get_prescription
--
-- Eine einzelne Verordnung mit allen Feldern, fuer das Aenderungsformular.
-- Nur die therapeutischen Rollen - wer aendern darf, darf lesen, und umgekehrt
-- gibt es hier keine organisatorische Variante: das Formular enthaelt die
-- klinischen Felder.
--
-- Wie die klinische Liste absichtlich schreibend: der Aufruf legt klinischen
-- Inhalt offen und wird als prescription.viewed protokolliert (ADR-010).
-- -----------------------------------------------------------------------------
create function public.get_prescription(p_prescription_id uuid)
returns table (
  id                       uuid,
  patient_id               uuid,
  prescriber_id            uuid,
  prescriber_name          text,
  prescriber_practice_name text,
  prescription_kind        text,
  issued_on                date,
  frequency_note           text,
  note                     text,
  items                    jsonb,
  updated_at               timestamptz,
  diagnosis                text,
  therapy_goal             text,
  prescriber_note          text,
  follow_up_recommendation text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_prescription_clinical() then
    raise exception 'not allowed to read clinical prescription data' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical prescription data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.prescriptions p
  where p.id = p_prescription_id
    and p.organization_id = v_org;

  -- Eine fremde und eine unbekannte ID liefern beide nichts.
  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'prescription.viewed', 'prescription', p_prescription_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return query
    select
      p.id,
      p.patient_id,
      p.prescriber_id,
      btrim(concat_ws(' ', v.title, v.given_name, v.family_name)),
      v.practice_name,
      p.prescription_kind,
      p.issued_on,
      p.frequency_note,
      p.note,
      app.prescription_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      p.therapy_goal,
      p.prescriber_note,
      p.follow_up_recommendation
    from public.prescriptions p
    join public.prescribers v on v.id = p.prescriber_id
    where p.id = p_prescription_id;
end;
$$;

comment on function public.get_prescription(uuid) is
  'Eine Verordnung mit allen Feldern fuer das Aenderungsformular (VER-003). Protokolliert prescription.viewed (ADR-010). Nur owner, therapist und team_lead.';

revoke all on function public.get_prescription(uuid) from public, anon;
grant execute on function public.get_prescription(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- create_prescription
-- -----------------------------------------------------------------------------
create function public.create_prescription(
  p_patient_id             uuid,
  p_prescriber_id          uuid,
  p_prescription_kind      text,
  p_issued_on              date,
  p_items                  jsonb,
  p_frequency_note         text default null,
  p_note                   text default null,
  p_diagnosis              text default null,
  p_therapy_goal           text default null,
  p_prescriber_note        text default null,
  p_follow_up_recommendation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. ANN-011: ohne office.
  if not app.can_write_prescriptions() then
    raise exception 'not allowed to write prescriptions' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write prescriptions' using errcode = '42501';
  end if;

  -- Patient ausschliesslich in der eigenen Organisation suchen.
  if not exists (
    select 1 from public.patients pa
    where pa.id = p_patient_id and pa.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.assert_prescription_input(v_org, p_prescriber_id, p_prescription_kind, p_issued_on);

  insert into public.prescriptions (
    organization_id, patient_id, prescriber_id, prescription_kind, issued_on,
    frequency_note, note, diagnosis, therapy_goal, prescriber_note,
    follow_up_recommendation, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_prescriber_id, p_prescription_kind, p_issued_on,
    nullif(btrim(p_frequency_note), ''),
    nullif(btrim(p_note), ''),
    nullif(btrim(p_diagnosis), ''),
    nullif(btrim(p_therapy_goal), ''),
    nullif(btrim(p_prescriber_note), ''),
    nullif(btrim(p_follow_up_recommendation), ''),
    v_actor, v_actor
  )
  returning id into v_id;

  perform app.write_prescription_items(v_id, v_org, v_actor, p_items);

  -- Auditeintrag ohne klinische Inhalte: Akteur, Organisation,
  -- Verordnungsbezug, Patientenbezug, Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'prescription.created', 'prescription', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  );

  return v_id;
end;
$$;

comment on function public.create_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) is
  'Legt eine Verordnung samt Positionen atomar an und protokolliert prescription.created (VER-003, ADR-010). Nur owner, therapist und team_lead (ANN-011).';

revoke all on function public.create_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- update_prescription
--
-- Die Patientin ist bewusst KEIN Parameter: eine Verordnung wechselt nicht die
-- Akte. Eine in der falschen Akte erfasste Verordnung wird geloescht und neu
-- angelegt - das hinterlaesst im Auditlog zwei ehrliche Ereignisse statt einer
-- stillen Umbuchung.
-- -----------------------------------------------------------------------------
create function public.update_prescription(
  p_prescription_id        uuid,
  p_prescriber_id          uuid,
  p_prescription_kind      text,
  p_issued_on              date,
  p_items                  jsonb,
  p_frequency_note         text default null,
  p_note                   text default null,
  p_diagnosis              text default null,
  p_therapy_goal           text default null,
  p_prescriber_note        text default null,
  p_follow_up_recommendation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_prescriptions() then
    raise exception 'not allowed to write prescriptions' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write prescriptions' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.prescriptions p
  where p.id = p_prescription_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'prescription not found' using errcode = 'P0002';
  end if;

  perform app.assert_prescription_input(v_org, p_prescriber_id, p_prescription_kind, p_issued_on);

  update public.prescriptions
     set prescriber_id            = p_prescriber_id,
         prescription_kind        = p_prescription_kind,
         issued_on                = p_issued_on,
         frequency_note           = nullif(btrim(p_frequency_note), ''),
         note                     = nullif(btrim(p_note), ''),
         diagnosis                = nullif(btrim(p_diagnosis), ''),
         therapy_goal             = nullif(btrim(p_therapy_goal), ''),
         prescriber_note          = nullif(btrim(p_prescriber_note), ''),
         follow_up_recommendation = nullif(btrim(p_follow_up_recommendation), ''),
         updated_at               = now(),
         updated_by               = v_actor
   where id = p_prescription_id;

  perform app.write_prescription_items(p_prescription_id, v_org, v_actor, p_items);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'prescription.updated', 'prescription', p_prescription_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return p_prescription_id;
end;
$$;

comment on function public.update_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) is
  'Aendert eine Verordnung samt Positionen atomar und protokolliert prescription.updated (VER-003, ADR-010). Die Patientin bleibt unveraendert.';

revoke all on function public.update_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- delete_prescription
--
-- Echte Loeschung, kein Flag (ADR-008 Punkt 10). Die Positionen gehen ueber
-- "on delete cascade" mit. Der Auditeintrag bleibt und nennt Verordnung und
-- Patientin - er ist danach der einzige Nachweis, dass es den Datensatz gab
-- (ADR-010).
-- -----------------------------------------------------------------------------
create function public.delete_prescription(p_prescription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_prescriptions() then
    raise exception 'not allowed to write prescriptions' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write prescriptions' using errcode = '42501';
  end if;

  delete from public.prescriptions p
  where p.id = p_prescription_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'prescription not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'prescription.deleted', 'prescription', p_prescription_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );
end;
$$;

comment on function public.delete_prescription(uuid) is
  'Loescht eine falsch erfasste Verordnung endgueltig und protokolliert prescription.deleted (VER-003, ADR-008 Punkt 10, Art. 16 DSGVO). Nur owner, therapist und team_lead.';

revoke all on function public.delete_prescription(uuid) from public, anon;
grant execute on function public.delete_prescription(uuid) to authenticated;
