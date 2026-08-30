-- =============================================================================
-- Patientenstatus wechseln (PAT-003)
--
-- Dritter schreibender Fachvorgang, wieder als SECURITY-DEFINER-RPC
-- (PAT-001, PAT-002). Der Vorgang ist bewusst von der Stammdatenaenderung
-- getrennt: er aendert keine Personendaten, sondern nimmt einen Patienten aus
-- dem laufenden Betrieb beziehungsweise zurueck hinein.
--
-- Fachliche Festlegung zu diesem Loop: 'inactive' ist eine REIN
-- ORGANISATORISCHE Markierung ("nicht in laufender Versorgung"). Sie ist
-- ausdruecklich KEIN Behandlungsabschluss im Sinne von ADR-008 und startet
-- keine Aufbewahrungsfrist. Sollte das spaeter gewollt sein, braucht es ein
-- eigenes Feld und einen ADR-Bezug - nicht diese Funktion.
--
-- Der Rollenschnitt ist enger als beim Anlegen und Aendern: behandelnde
-- Therapeut:innen dokumentieren, verwalten aber nicht den Patientenbestand.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog um patient.status_changed erweitern (ADR-010)
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed', 'audit_log.read',
    'patient.created', 'patient.updated', 'patient.status_changed'
  ));

-- -----------------------------------------------------------------------------
-- Wer darf den Status wechseln
--
-- owner, team_lead und office - NICHT therapist. Der Statuswechsel ist ein
-- Vorgang der Praxisfuehrung und der Verwaltung, kein Behandlungsschritt.
-- Bewusst eine eigene Funktion, damit sich dieser Schnitt unabhaengig von
-- can_create_patient/can_update_patient entwickeln kann.
-- -----------------------------------------------------------------------------
create or replace function app.can_change_patient_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead', 'office')
$$;

grant execute on function app.can_change_patient_status() to authenticated;

-- -----------------------------------------------------------------------------
-- set_patient_status
-- -----------------------------------------------------------------------------
create or replace function public.set_patient_status(
  p_patient_id uuid,
  p_status     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_change_patient_status() then
    raise exception 'not allowed to change patient status' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change patient status' using errcode = '42501';
  end if;

  -- Nur die beiden fachlich definierten Zustaende. Die Pruefung steht hier
  -- zusaetzlich zur CHECK-Constraint, damit die Meldung verstaendlich bleibt.
  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'unknown patient status' using errcode = '22023';
  end if;

  -- Zielpatient ausschliesslich in der Organisation des Aufrufers suchen: eine
  -- fremde ID ist damit von einer unbekannten nicht zu unterscheiden.
  select p.status into v_alt
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Kein Wechsel, kein Vorgang: weder Schreibzugriff noch Auditeintrag.
  if v_alt = p_status then
    return;
  end if;

  update public.patients
     set status = p_status
   where id = p_patient_id;

  -- Der neue Status ist hier kein Stammdatum, sondern das Ereignis selbst:
  -- ohne ihn waere der Eintrag nicht auswertbar. Der Vorzustand ergibt sich
  -- daraus, dass ein Eintrag nur bei einem tatsaechlichen Wechsel entsteht
  -- (ADR-010: Metadaten, keine Inhalte).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.status_changed', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'status', p_status)
  );
end;
$$;

comment on function public.set_patient_status(uuid, text) is
  'Setzt den organisatorischen Patientenstatus und protokolliert patient.status_changed. Kein Behandlungsabschluss im Sinne von ADR-008 (PAT-003).';

revoke all on function public.set_patient_status(uuid, text) from public, anon;
grant execute on function public.set_patient_status(uuid, text) to authenticated;
