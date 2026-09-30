-- =============================================================================
-- POR-001: Aufräumen vor dem ersten Plattformzugang (ADR-023 Punkte 2, 3, 20, 21)
--
-- Bevor ein Plattformkonto aktiv werden kann, verschwinden drei Dinge, die
-- älter sind als ADR-021 und ADR-023:
--
--   1. Der SELBSTZUGRIFF ÜBER DIE PERSON. `patients`, `patient_contact_details`,
--      `persons` und `log_patient_record_view` ließen jedes Konto die Zeilen
--      seiner eigenen `person_id` lesen. Das fragt nach der Person statt nach
--      dem Verhältnis (§4.8) und kennt keine Sperre je Verhältnis. Die Plattform
--      liest künftig nur über Projektionen, die einen aktiven Zugang verlangen
--      (Punkt 19). Mitarbeitende behalten den Blick auf ihre eigene Person —
--      das gehört zum Praxiskonto (Punkt 20, letzter Satz).
--   2. Die DREI OFFENEN TABELLEN. `organizations`, `locations` und `roles`
--      standen jedem Konto der Organisation offen, `roles` sogar jedem
--      angemeldeten Konto überhaupt. Sie gelten jetzt nur für Praxiskonten.
--   3. Die ROLLE `patient` in `user_roles`. Sie wird nie vergeben (Punkt 3);
--      eine Prüfbedingung hält das fest. Der Katalogeintrag bleibt stehen,
--      damit ältere Auditzeilen und der Rollenkatalog lesbar bleiben.
--
-- Die tragende Linie liegt woanders: Ein Plattformkonto bekommt keine Zeile in
-- `user_profiles` (ANN-187). `app.current_organization_id()` ist für es damit
-- `null`, und jede Praxispolicy läuft ins Leere, bevor sie eine Rolle fragt.
-- Diese Migration ist die zweite Linie dahinter: Auch ein Konto MIT Profil,
-- aber ohne Praxisrolle, sieht nichts mehr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.is_practice_account
--
-- Praxiskonto heißt: aktives Profil und mindestens eine Praxisrolle. Die
-- Trainingsbetreuung zählt mit (§4.9); `patient` nicht, und die kann es nach
-- dem Constraint unten auch nicht mehr geben.
-- -----------------------------------------------------------------------------
create or replace function app.is_practice_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office', 'trainer')
$$;

comment on function app.is_practice_account() is
  'Aktives Profil mit mindestens einer Praxisrolle (ADR-023 Punkt 2). Plattformkonten haben weder Profil noch Rolle.';

revoke all on function app.is_practice_account() from public;
grant execute on function app.is_practice_account() to authenticated;

-- -----------------------------------------------------------------------------
-- Die Rolle `patient` wird nie vergeben (ADR-023 Punkt 3)
-- -----------------------------------------------------------------------------
delete from public.user_roles where role_key = 'patient';

alter table public.user_roles
  add constraint user_roles_no_patient_role check (role_key <> 'patient');

comment on constraint user_roles_no_patient_role on public.user_roles is
  'ADR-023 Punkt 3: Plattformrechte folgen dem Zugang (platform_accesses), nie einer Rolle.';

-- -----------------------------------------------------------------------------
-- Offene Tabellen nur für Praxiskonten (ADR-023 Punkt 21)
-- -----------------------------------------------------------------------------
drop policy organizations_select_own on public.organizations;
create policy organizations_select_own
  on public.organizations for select to authenticated
  using (id = app.current_organization_id() and app.is_practice_account());

drop policy locations_select_own_org on public.locations;
create policy locations_select_own_org
  on public.locations for select to authenticated
  using (organization_id = app.current_organization_id() and app.is_practice_account());

drop policy roles_select_all_authenticated on public.roles;
create policy roles_select_practice_accounts
  on public.roles for select to authenticated
  using (app.is_practice_account());

-- -----------------------------------------------------------------------------
-- Selbstzugriff über die Person entfällt (ADR-023 Punkt 20)
-- -----------------------------------------------------------------------------
drop policy patients_select_scoped on public.patients;
create policy patients_select_scoped
  on public.patients for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_patient_directory()
  );

drop policy patient_contact_details_select_scoped on public.patient_contact_details;
create policy patient_contact_details_select_scoped
  on public.patient_contact_details for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_patient_directory()
    and exists (
      select 1
      from public.patients p
      where p.id = patient_contact_details.patient_id
        and p.organization_id = app.current_organization_id()
    )
  );

-- Die eigene Person sehen nur noch Praxiskonten: Mitarbeitende brauchen ihren
-- Namen, auch die Trainingsbetreuung, die `app.is_staff()` nicht einschließt.
drop policy persons_select_scoped on public.persons;
create policy persons_select_scoped
  on public.persons for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (
      (id = app.current_person_id() and app.is_practice_account())
      or (
        app.is_staff()
        and (
          exists (select 1 from public.patients x where x.person_id = persons.id)
          or exists (select 1 from public.staff_members x where x.person_id = persons.id)
        )
      )
      or (
        app.can_read_training_relationships()
        and exists (select 1 from public.training_relationships x where x.person_id = persons.id)
      )
    )
  );

create or replace function public.log_patient_record_view(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.organization_id
    into v_org
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = app.current_organization_id()
    and app.can_read_patient_directory();

  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, context
  )
  values (
    v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id,
    jsonb_build_object('surface', 'web')
  );
end;
$$;
