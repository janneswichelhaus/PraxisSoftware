-- =============================================================================
-- AKTE-009: Im Kalender, ohne eigenen Zugang (ANN-226)
--
-- Jannes 2026-10-03: Neu angelegte Therapeut:innen standen nicht im Kalender,
-- bis sie ihre Einladung selbst angenommen hatten - erst dann gibt es ein
-- Profil mit Rolle, und daran hing `app.is_assignable_therapist`. Die
-- Praxisinhaberin soll Mitarbeitende selbst in den Kalender nehmen koennen,
-- ohne Zutun der Person.
--
--   * Zwei Merkmale am Mitarbeiterdatensatz: `schedulable_treatment` (kann
--     Behandlungen bekommen) und `schedulable_training` (kann Training
--     betreuen). Standard: nein. Setzen darf allein owner
--     (`app.can_manage_staff_accounts`, wie Einladung und Rollen).
--   * Zuordenbar ist, wer aktiv beschaeftigt ist UND entweder das Merkmal
--     traegt ODER - wie bisher - einen aktiven Zugang mit passender Rolle hat.
--     Der bisherige Weg bleibt also unveraendert; das Merkmal ist ein zweiter,
--     der keinen Login braucht. Wer gehen soll, wird wie bisher inaktiv
--     gesetzt (`employment_status`).
--   * Kein Zugang, kein Kennwort, keine Rolle entsteht dabei. Anmelden kann
--     sich die Person weiterhin nur ueber die Einladung (ANN-025, ADR-023).
--   * Beide Praedikate sind die eine Stelle der Regel; alle Schreib- und
--     Lesepfade der Termine fragen sie (CAL-001, TRN-004).
-- =============================================================================

alter table public.staff_members
  add column schedulable_treatment boolean not null default false,
  add column schedulable_training  boolean not null default false;

comment on column public.staff_members.schedulable_treatment is
  'Steht im Kalender fuer Behandlungen, auch ohne eigenen Zugang (AKTE-009, ANN-226). Setzt allein owner ueber set_staff_member_schedulable.';
comment on column public.staff_members.schedulable_training is
  'Steht im Kalender fuer Personal Training, auch ohne eigenen Zugang (AKTE-009, ANN-226). Setzt allein owner ueber set_staff_member_schedulable.';

-- -----------------------------------------------------------------------------
-- 1. Die beiden Praedikate - die eine Stelle der Regel (ANN-226)
-- -----------------------------------------------------------------------------
create or replace function app.is_assignable_therapist(
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = p_organization_id
      and sm.employment_status = 'active'
      and (
        -- ANN-226: von owner in den Kalender genommen, ohne Zugang.
        sm.schedulable_treatment
        -- Bisheriger Weg (CAL-001): aktiver Zugang mit therapeutischer Rolle.
        or exists (
          select 1
          from public.user_profiles up
          join public.user_roles ur
            on ur.user_id = up.id
           and ur.organization_id = up.organization_id
          where up.person_id = sm.person_id
            and up.organization_id = sm.organization_id
            and up.is_active
            and ur.role_key in ('therapist', 'team_lead')
        )
      )
  )
$$;

comment on function app.is_assignable_therapist(uuid, uuid) is
  'Prueft, ob ein staff_member als behandelnde Person zuordenbar ist (CAL-001, AKTE-009): aktiv beschaeftigt und entweder von owner in den Kalender genommen (schedulable_treatment, ANN-226) oder mit aktivem Zugang in der Rolle therapist oder team_lead. Nur fuer die serverseitigen Schreib- und Lesepfade.';

create or replace function app.is_assignable_trainer(
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members sm
    where sm.id = p_staff_member_id
      and sm.organization_id = p_organization_id
      and sm.employment_status = 'active'
      and (
        -- ANN-226: von owner in den Kalender genommen, ohne Zugang.
        sm.schedulable_training
        -- Bisheriger Weg (TRN-004, ANN-176): aktiver Zugang mit Rolle trainer.
        or exists (
          select 1
          from public.user_profiles up
          join public.user_roles ur
            on ur.user_id = up.id
           and ur.organization_id = up.organization_id
          where up.person_id = sm.person_id
            and up.organization_id = sm.organization_id
            and up.is_active
            and ur.role_key = 'trainer'
        )
      )
  )
$$;

comment on function app.is_assignable_trainer(uuid, uuid) is
  'Wer einen Trainingstermin betreuen kann (TRN-004, AKTE-009): aktiv beschaeftigt und entweder von owner in den Kalender genommen (schedulable_training, ANN-226) oder mit aktivem Zugang in der Rolle trainer.';

-- -----------------------------------------------------------------------------
-- 2. Setzen - allein owner, protokolliert wie jede Stammdatenaenderung
-- -----------------------------------------------------------------------------
create function public.set_staff_member_schedulable(
  p_staff_member_id uuid,
  p_treatment       boolean,
  p_training        boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_alt       record;
  v_geaendert text[] := array[]::text[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_manage_staff_accounts() then
    -- G6c: wie die uebrigen Schreibpfade fuer Konten abgewiesen - bestaetigter
    -- denied-Eintrag, HTTP 403, keine Ausnahme, nichts geaendert.
    perform app.record_denied_write(v_actor, 'staff_member.updated', 'not allowed to manage staff');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage staff' using errcode = '42501';
  end if;
  if p_staff_member_id is null or p_treatment is null or p_training is null then
    raise exception 'staff member and both values are required' using errcode = '22023';
  end if;

  select sm.schedulable_treatment, sm.schedulable_training
    into v_alt
  from public.staff_members sm
  where sm.id = p_staff_member_id
    and sm.organization_id = v_org
  for update;

  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  if v_alt.schedulable_treatment is distinct from p_treatment then
    v_geaendert := array_append(v_geaendert, 'schedulable_treatment');
  end if;
  if v_alt.schedulable_training is distinct from p_training then
    v_geaendert := array_append(v_geaendert, 'schedulable_training');
  end if;

  -- Kein Unterschied, kein Ereignis (ADR-010).
  if array_length(v_geaendert, 1) is null then
    return;
  end if;

  update public.staff_members
     set schedulable_treatment = p_treatment,
         schedulable_training  = p_training
   where id = p_staff_member_id
     and organization_id = v_org;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'staff_member.updated', 'staff_member', p_staff_member_id, 'success',
    jsonb_build_object('surface', 'web', 'changed_fields', to_jsonb(v_geaendert))
  );
end;
$$;

comment on function public.set_staff_member_schedulable(uuid, boolean, boolean) is
  'Nimmt eine Person in den Kalender fuer Behandlungen und/oder Training auf oder nimmt sie heraus - ohne Zugang, Kennwort oder Rolle (AKTE-009, ANN-226). Allein owner; protokolliert als staff_member.updated mit den geaenderten Feldnamen, eine Abweisung als denied-Eintrag mit HTTP 403 (G6c).';

revoke all on function public.set_staff_member_schedulable(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_staff_member_schedulable(uuid, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Lesen: die beiden Merkmale in der Mitarbeiterliste
--
-- Dieselbe Sicht, zwei Spalten hinten angehaengt; security_invoker bleibt,
-- die RLS der Basistabellen gilt unveraendert. Die Merkmale sind keine
-- Privatangaben: Wer im Kalender steht, sieht jede Praxisrolle ohnehin.
-- -----------------------------------------------------------------------------
create or replace view public.staff_directory
with (security_invoker = true) as
select
  sm.id,
  sm.organization_id,
  sm.person_id,
  pe.given_name,
  pe.family_name,
  sm.employment_status,
  sm.work_email,
  sm.work_phone,
  sm.primary_location_id,
  l.name as primary_location_name,
  spd.date_of_birth,
  spd.private_email,
  spd.private_phone,
  spd.street,
  spd.postal_code,
  spd.city,
  sm.schedulable_treatment,
  sm.schedulable_training
from public.staff_members sm
join public.persons pe on pe.id = sm.person_id
left join public.locations l on l.id = sm.primary_location_id
left join public.staff_private_details spd on spd.staff_member_id = sm.id;
