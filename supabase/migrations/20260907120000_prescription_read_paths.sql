-- =============================================================================
-- Verordnungen in der Akte, rollenabhaengig projiziert (VER-002)
--
-- VER-001 hat die Tabellen angelegt und ihnen bewusst weder Policy noch
-- Tabellenrecht gegeben. Diese Migration liefert die beiden einzigen Lesepfade
-- und setzt dabei ADR-004 woertlich um - nach demselben Muster wie DOK-003:
--
--   * "Antworten der Anwendung sind rollenabhaengige Projektionen." Es gibt
--     deshalb ZWEI Funktionen mit ZWEI Rueckgabetypen, nicht eine Funktion mit
--     genullten Spalten:
--       - list_patient_prescriptions: die organisatorische Sicht fuer alle
--         vier Praxisrollen. Verordner:in, Art, Ausstellungsdatum, Frequenz,
--         organisatorische Bemerkung und die Positionen mit Kontingent. Ohne
--         Diagnose, ohne Therapieziel, ohne Empfehlung.
--       - list_patient_prescriptions_clinical: dieselben Zeilen zuzueglich der
--         klinischen Felder, ausschliesslich fuer owner, therapist und
--         team_lead.
--   * Die klinische Sicht ist absichtlich schreibend: je gelesener Verordnung
--     entsteht ein prescription.viewed in derselben Transaktion (ADR-010
--     Punkt 2, "Zugriff auf klinische Dokumente"). Die organisatorische Sicht
--     protokolliert nichts - sie enthaelt keinen klinischen Inhalt, und das
--     Oeffnen der Akte wird ohnehin als patient_record.viewed festgehalten.
--     Dieselbe Abwaegung wie beim Behandlungsnachweis (ANN-006).
--
-- Beide Sichten teilen sich app.patient_prescription_ids: welche Verordnungen
-- zur Akte gehoeren und in welcher Reihenfolge, steht an genau einer Stelle.
-- Eine Abweichung zwischen den Sichten waere sonst genau die Art Fehler, die
-- niemandem auffaellt.
--
-- ANN-011: Die Spaltenlisten der beiden Funktionen sind die Stelle, an der die
-- Einordnung "organisatorisch gegen klinisch" greift.
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
    'prescription.viewed'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription'
  ));

-- -----------------------------------------------------------------------------
-- Welche Verordnungen zur Akte gehoeren
--
-- Alle Verordnungen der Patientin in der Organisation des Aufrufers, neueste
-- zuerst. Kein Cursor: eine Patientin hat auch nach zehn Jahren Behandlung
-- Dutzende, keine Tausende - und die Ansicht gruppiert nach Jahr, braucht also
-- den ganzen Bestand. Die Obergrenze von 200 ist keine Seitengroesse, sondern
-- eine Reissleine gegen einen Aufruf, der unbeabsichtigt sehr viel offenlegt
-- und (in der klinischen Sicht) sehr viel protokolliert
-- (PROJECT_PRINCIPLES.md 16).
--
-- Ein unbekannter oder fremder Patient hat in der eigenen Organisation keine
-- Verordnungen und liefert dasselbe leere Ergebnis wie eine Patientin ohne
-- Verordnung - kein Existenz-Orakel (13).
--
-- Kein Grant fuer Anwendungsrollen: die Funktion wird ausschliesslich aus den
-- SECURITY-DEFINER-Funktionen unten aufgerufen.
-- -----------------------------------------------------------------------------
create function app.patient_prescription_ids(
  p_organization_id uuid,
  p_patient_id      uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(v.id order by v.issued_on desc, v.created_at desc, v.id desc)
  from (
    select p.id, p.issued_on, p.created_at
    from public.prescriptions p
    where p.organization_id = p_organization_id
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.created_at desc, p.id desc
    limit 200
  ) v
$$;

comment on function app.patient_prescription_ids(uuid, uuid) is
  'Verordnungen einer Patientin in der Akte, neueste zuerst, hoechstens 200 (VER-002). Gemeinsame Grundlage der organisatorischen und der klinischen Sicht.';

revoke all on function app.patient_prescription_ids(uuid, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Positionen als JSON
--
-- Beide Sichten liefern dieselben Positionen: die Bezeichnung des Heilmittels
-- und die Mengen sind organisatorisch (ANN-011). remaining_quantity wird
-- gerechnet und nirgends gespeichert - ein zweiter Zaehler koennte
-- auseinanderlaufen (PROJECT_PRINCIPLES.md 13, ANN-012).
-- -----------------------------------------------------------------------------
create function app.prescription_items_json(p_prescription_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',                  i.id,
        'sort_order',          i.sort_order,
        'remedy',              i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity',       i.used_quantity,
        'remaining_quantity',  i.prescribed_quantity - i.used_quantity
      )
      order by i.sort_order
    ),
    '[]'::jsonb
  )
  from public.prescription_items i
  where i.prescription_id = p_prescription_id
$$;

comment on function app.prescription_items_json(uuid) is
  'Positionen einer Verordnung als JSON, inklusive der gerechneten Restmenge (VER-002, ANN-012).';

revoke all on function app.prescription_items_json(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_prescriptions: die organisatorische Sicht
--
-- Alle vier Praxisrollen. Fuer office ist das der einzige Blick auf die
-- Verordnung: Kontingent, Verordner:in und Ausstellungsdatum genuegen, um
-- Termine zu planen und eine Folgeverordnung anzufordern (4.3).
--
-- STABLE, weil nichts geschrieben wird; PostgREST ruft die Funktion trotzdem
-- per POST auf, die Parameter sind dafuer unerheblich.
-- -----------------------------------------------------------------------------
create function public.list_patient_prescriptions(p_patient_id uuid)
returns table (
  id                       uuid,
  prescriber_id            uuid,
  prescriber_name          text,
  prescriber_practice_name text,
  prescription_kind        text,
  issued_on                date,
  frequency_note           text,
  note                     text,
  items                    jsonb,
  updated_at               timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_ids  uuid[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_prescriptions() then
    raise exception 'not allowed to read prescriptions' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read prescriptions' using errcode = '42501';
  end if;

  v_ids := app.patient_prescription_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  return query
    select
      p.id,
      p.prescriber_id,
      btrim(concat_ws(' ', v.title, v.given_name, v.family_name)),
      v.practice_name,
      p.prescription_kind,
      p.issued_on,
      p.frequency_note,
      -- ANN-011: die organisatorische Bemerkung ja, die klinischen Felder
      -- ausdruecklich nicht. Diese Spaltenliste ist die Grenze.
      p.note,
      app.prescription_items_json(p.id),
      p.updated_at
    from public.prescriptions p
    join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$$;

comment on function public.list_patient_prescriptions(uuid) is
  'Organisatorische Sicht der Verordnungen einer Patientin (VER-002, ANN-011): Verordner:in, Art, Datum, Frequenz und Kontingent. Ohne klinische Felder. Einzige Sicht auf Verordnungen fuer office.';

revoke all on function public.list_patient_prescriptions(uuid) from public, anon;
grant execute on function public.list_patient_prescriptions(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_prescriptions_clinical: die klinische Sicht
--
-- Wie get_treatment_note absichtlich schreibend: je gelesener Verordnung
-- entsteht ein prescription.viewed in derselben Transaktion (ADR-010). Kein
-- Sammeleintrag - er wuerde verschweigen, welche Inhalte tatsaechlich
-- offengelegt wurden.
--
-- Der Auditkontext bleibt bei Metadaten: Oberflaeche und Patientenbezug. Keine
-- Diagnose, kein Freitext (ADR-010 Punkt 3, ADR-011).
-- -----------------------------------------------------------------------------
create function public.list_patient_prescriptions_clinical(p_patient_id uuid)
returns table (
  id                       uuid,
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
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Rollenmenge wie bei der Behandlungsdokumentation: die Verordnung
  -- oeffnet keinen zweiten Weg zu klinischem Freitext (4.3, 4.6).
  if not app.can_read_prescription_clinical() then
    raise exception 'not allowed to read clinical prescription data' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical prescription data' using errcode = '42501';
  end if;

  v_ids := app.patient_prescription_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'prescription.viewed', 'prescription', unnest(v_ids), 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id);

  return query
    select
      p.id,
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
      -- ANN-014: die Empfehlung der Therapeut:in, von ihr selbst erfasst.
      p.follow_up_recommendation
    from public.prescriptions p
    join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$$;

comment on function public.list_patient_prescriptions_clinical(uuid) is
  'Klinische Sicht der Verordnungen einer Patientin (VER-002, ANN-011): zusaetzlich Diagnose, Therapieziel, Hinweise der Verordner:in und Empfehlung zum Verordnungsende. Protokolliert je Verordnung prescription.viewed (ADR-010). Nur owner, therapist und team_lead.';

revoke all on function public.list_patient_prescriptions_clinical(uuid) from public, anon;
grant execute on function public.list_patient_prescriptions_clinical(uuid) to authenticated;
