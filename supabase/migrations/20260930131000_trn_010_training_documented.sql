-- =============================================================================
-- TRN-010: `documented` am Trainingstermin erreichbar (TRN-EPIC-004)
--
-- ADR-018 Punkt 3, gelesen nach ADR-022 Punkt 8: `documented` haengt am
-- Trainingstermin am abgeschlossenen Trainingsprotokoll. Den Uebergang setzt
-- finalize_training_protocol (TRN-009) ueber app.mark_appointment_documented;
-- der Riegel am Termin (appointments_training_protocol_guard) haelt jeden
-- anderen Weg fern.
--
-- Was hier dazukommt, ist der Weg dorthin fuer die Person, die die Einheit
-- betreut: Abschliessen und Wiederoeffnen am Trainingstermin. Bisher liessen
-- app.can_complete_appointment() und app.can_reopen_appointment() nur die
-- vier Praxisrollen zu - die Trainingsbetreuung konnte ihre eigene Stunde
-- nicht als durchgefuehrt vermerken (TRN-EPIC-003 half sich mit einer
-- Seed-Stunde).
--
-- WER (ANN-186): dieselben Rollen, die den Trainingstermin schreiben -
-- owner, trainer, office (app.may_write_appointment_context, ANN-176). Die
-- Rollenpruefung laesst trainer zu; welcher Kontext, entscheidet die Abfrage
-- mit app.may_write_appointment_context(a.kind): Ein Behandlungstermin ist
-- fuer die Trainingsbetreuung "nicht gefunden", ein Trainingstermin fuer
-- therapist und team_lead ebenso (ADR-022 Punkt 11).
--
-- Unveraendert aus 20260930110000_trn_004_training_appointments.sql bis auf
-- die Rollenpruefung und den Auditkontext am Trainingstermin.
-- =============================================================================

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

  if v_alt.kind = 'internal' then
    raise exception 'event cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'no-show appointment must be reopened first' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'appointment is already completed' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status       = 'completed',
         completed_at = now(),
         completed_by = v_actor,
         updated_at   = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.completed', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id
    )
    || case when v_alt.kind = 'training' then
         jsonb_build_object('kind', 'training',
                            'training_relationship_id', v_alt.training_relationship_id)
       else '{}'::jsonb end
  );

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
         a.kind, a.training_relationship_id
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

  -- 'documented' und 'invoiced' haben keinen Rueckweg: korrigiert wird in der
  -- Dokumentation beziehungsweise ueber den Rechnungsstorno (ADR-018 Punkt 2).
  if v_alt.status not in ('completed', 'no_show') then
    raise exception 'appointment is not completed' using errcode = '22023';
  end if;

  -- Eine erfasste Leistung haengt an diesem Termin und an seinem Zustand
  -- (ABR-002): Das Ausfallhonorar entsteht aus dem Gebuehrenanlass, die
  -- Behandlung aus 'dokumentiert'. Wer den Termin zurueckdreht, ohne die
  -- Leistung zu entfernen, laesst eine Forderung ohne Anlass stehen. Der Weg
  -- zurueck bleibt offen - er fuehrt ueber delete_billable_services.
  if exists (
    select 1 from public.billable_services b where b.appointment_id = p_appointment_id
  ) then
    raise exception 'billable services recorded, remove them first' using errcode = '23514';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                     = 'confirmed',
         completed_at               = null,
         completed_by               = null,
         no_show_recorded_at        = null,
         no_show_recorded_by        = null,
         no_show_protocol_confirmed = null,
         fee_basis                  = null,
         updated_at                 = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status in ('completed', 'no_show');

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.reopened', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      -- Aus welchem Zustand zurueck: organisatorisch, kein Personenbezug.
      'from_status', v_alt.status
    )
    || case when v_alt.kind = 'training' then
         jsonb_build_object('kind', 'training',
                            'training_relationship_id', v_alt.training_relationship_id)
       else '{}'::jsonb end
  );

  return p_appointment_id;
end;
$function$;

