-- =============================================================================
-- R3-002: Ein Termin mit erfasster Leistung wird nicht wieder geoeffnet
--
-- `reopen_appointment` setzt den Termin auf 'confirmed' zurueck und raeumt
-- dabei `fee_basis` ab - den Gebuehrenanlass, aus dem das Ausfallhonorar
-- ueberhaupt erst entstehen durfte (ABR-002, PROJECT_PRINCIPLES.md 19). Die
-- erfasste Leistung blieb davon unberuehrt: Sie stand weiter auf 'billable'
-- und damit unter "Abzurechnen", waehrend der Termin so aussah, als habe es
-- den Anlass nie gegeben. Abgerechnet wurde am Ende eine Gebuehr ohne
-- Vorgang.
--
-- Der Weg zurueck bleibt offen, er fuehrt nur nicht daran vorbei: zuerst
-- `delete_billable_services`, dann wieder oeffnen. Das ist dieselbe Linie wie
-- bei Zahlung und Storno ("zuerst das Geld, dann das Dokument") und wie bei
-- 'documented' und 'invoiced', die nach ADR-018 Punkt 2 gar keinen Rueckweg
-- haben.
-- =============================================================================

-- Uebernommen aus 20260916100000_home_visit_scenarios.sql, Abschnitt 4,
-- ergaenzt um die Pruefung auf erfasste Leistungen.
create or replace function public.reopen_appointment(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_reopen_appointment() then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to reopen appointments' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
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
  );

  return p_appointment_id;
end;
$$;

comment on function public.reopen_appointment(uuid, timestamptz) is
  'Setzt einen abgeschlossenen oder als nicht angetroffen vermerkten Termin auf bestaetigt zurueck, raeumt Gebuehrenanlass und Protokollbestaetigung mit ab und protokolliert appointment.reopened (CAL-004, CAL-008c, CAL-014b, CAL-018, ADR-010, ADR-018, R3-002). Weist ab, solange eine Leistung am Termin erfasst ist.';

revoke all on function public.reopen_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.reopen_appointment(uuid, timestamptz) to authenticated;
