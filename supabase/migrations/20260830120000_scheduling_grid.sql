-- =============================================================================
-- Praxisraster (CAL-005)
--
-- Das Raster legt fest, auf welchen Minutenschritten ein Termin beginnen darf.
-- Es gilt fuer die gesamte Praxis, nicht je Person: ein Kalender, in dem jede
-- Spalte ein anderes Raster haette, waere weder lesbar noch planbar.
--
-- Drei Festlegungen praegen die Umsetzung:
--
--   * Gerechnet wird gegen Mitternacht der Praxiszeitzone, nicht gegen UTC.
--     Der Startwert ist eine Ortszeit (`time`); daraus ergibt sich die
--     Minutenzahl seit Mitternacht unmittelbar, ohne jede Zeitzonenrechnung.
--     Gegen UTC gerechnet lieferte eine Praxis mit halbstuendigem Versatz
--     systematisch falsche Raster.
--   * Nur der Beginn liegt auf dem Raster. Die Dauer bleibt frei - sonst
--     liesse sich ein bestehender 45-Minuten-Termin auf einem 10er-Raster
--     nicht mehr verschieben, ohne ihn zu verkuerzen.
--   * Bestehende Termine ausserhalb des Rasters bleiben gueltig und sichtbar.
--     Geprueft wird nur ein NEUER Beginn; wer ein Raster nachtraeglich
--     verschaerft, entwertet damit nicht den bestehenden Kalender.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rasterwert an der Organisation
--
-- Anders als die Zeitzone hat das Raster einen unbedenklichen Standardwert:
-- 5 Minuten ist der feinste zulaessige Wert und schraenkt niemanden ein.
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column appointment_grid_minutes smallint not null default 5
    check (appointment_grid_minutes in (5, 10, 15));

comment on column public.organizations.appointment_grid_minutes is
  'Minutenraster fuer den Beginn von Terminen (5, 10 oder 15). Gilt praxisweit und wird gegen Mitternacht der Praxiszeitzone gerechnet (CAL-005).';

-- -----------------------------------------------------------------------------
-- Rasterpruefung
--
-- Reine Rechnung auf einer Ortszeit, ohne Datenzugriff: deshalb immutable und
-- ohne SECURITY DEFINER. Sekunden muessen null sein - ein Beginn um 09:07:30
-- liegt auf keinem Minutenraster.
-- -----------------------------------------------------------------------------
create or replace function app.is_on_appointment_grid(p_start time, p_minutes integer)
returns boolean
language sql
immutable
as $$
  select p_start is not null
     and p_minutes is not null
     and date_part('second', p_start) = 0
     and (date_part('hour', p_start) * 60 + date_part('minute', p_start))::integer % p_minutes = 0
$$;

comment on function app.is_on_appointment_grid(time, integer) is
  'Prueft eine Ortszeit gegen das Praxisraster - Minuten seit Mitternacht der Praxiszeitzone (CAL-005).';

-- Reine Rechenfunktion ohne Datenbezug: kein Orakel, deshalb allgemein nutzbar.
grant execute on function app.is_on_appointment_grid(time, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
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
    'organization.appointment_grid_changed'
  ));

-- -----------------------------------------------------------------------------
-- Rechte
--
-- Das Raster ist eine Grundeinstellung der Praxis und aendert die Planung
-- aller Beteiligten. Nur owner darf es setzen (PROJECT_PRINCIPLES.md 4.1).
-- -----------------------------------------------------------------------------
create or replace function app.can_change_appointment_grid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

grant execute on function app.can_change_appointment_grid() to authenticated;

-- -----------------------------------------------------------------------------
-- set_appointment_grid
--
-- Der Auditeintrag darf hier ausnahmsweise alten und neuen Wert tragen: ein
-- Minutenraster ist eine organisatorische Einstellung, kein Gesundheitsdatum
-- und kein Stammdatenwert (ADR-010).
-- -----------------------------------------------------------------------------
create or replace function public.set_appointment_grid(p_minutes smallint)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_alt   smallint;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_change_appointment_grid() then
    raise exception 'not allowed to change the appointment grid' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the appointment grid' using errcode = '42501';
  end if;

  if p_minutes is null or p_minutes not in (5, 10, 15) then
    raise exception 'unsupported appointment grid' using errcode = '22023';
  end if;

  select o.appointment_grid_minutes into v_alt
  from public.organizations o
  where o.id = v_org
  for update;

  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  -- Speichern ohne tatsaechliche Aenderung ist kein Vorgang.
  if v_alt = p_minutes then
    return v_alt;
  end if;

  update public.organizations
     set appointment_grid_minutes = p_minutes
   where id = v_org;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.appointment_grid_changed', 'organization', v_org, 'success',
    jsonb_build_object(
      'surface', 'web',
      'previous_minutes', v_alt,
      'minutes', p_minutes
    )
  );

  return p_minutes;
end;
$$;

comment on function public.set_appointment_grid(smallint) is
  'Setzt das praxisweite Minutenraster (5, 10 oder 15) und protokolliert organization.appointment_grid_changed (CAL-005, ADR-010). Nur owner.';

revoke all on function public.set_appointment_grid(smallint) from public, anon;
grant execute on function public.set_appointment_grid(smallint) to authenticated;
