-- =============================================================================
-- Autorisierung: Hilfsfunktionen, Grants und RLS-Policies.
--
-- ADR-004: zentraler Policy-Layer in der Anwendung PLUS Datenbank-RLS als
--          Defense-in-Depth. Diese Migration liefert die zweite Verteidigungs-
--          linie. Die Anwendung darf sich nicht darauf verlassen, dass die UI
--          etwas ausblendet.
--
-- Grundsatz: deny-by-default. RLS wird auf jeder exponierten Tabelle
-- aktiviert; ohne passende Policy ist keine Zeile sichtbar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hilfsfunktionen
--
-- SECURITY DEFINER, damit sie die Rollenzuordnung des Aufrufers lesen koennen,
-- ohne dass die Policies auf user_profiles/user_roles rekursiv auf sich selbst
-- zurueckgreifen. search_path ist leer, alle Objekte sind voll qualifiziert.
-- -----------------------------------------------------------------------------
create or replace function app.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.organization_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active
$$;

create or replace function app.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select up.person_id
  from public.user_profiles up
  where up.id = auth.uid()
    and up.is_active
$$;

create or replace function app.has_any_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.user_profiles up on up.id = ur.user_id
    where ur.user_id = auth.uid()
      and up.is_active
      and ur.organization_id = up.organization_id
      and ur.role_key = any (p_roles)
  )
$$;

-- Alle Praxisrollen ausser 'patient'.
create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

-- Rollen mit Zugriff auf die Patientenkartei der Organisation.
-- 'office' ist bewusst enthalten: organisatorische Stammdaten ja,
-- klinischer Freitext nein (PROJECT_PRINCIPLES.md 4.3).
create or replace function app.can_read_patient_directory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.has_any_role(text[]) is
  'Prueft, ob der aktuelle Account eine der uebergebenen Rollen in seiner Organisation hat (ADR-004).';

-- -----------------------------------------------------------------------------
-- Grants
--
-- anon erhaelt keinerlei Zugriff auf Fachdaten. Anmeldung laeuft ueber
-- Supabase Auth, nicht ueber die Datentabellen.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on schema app from anon, authenticated;

grant usage on schema app to authenticated;
grant execute on function app.current_organization_id() to authenticated;
grant execute on function app.current_person_id() to authenticated;
grant execute on function app.has_any_role(text[]) to authenticated;
grant execute on function app.is_staff() to authenticated;
grant execute on function app.can_read_patient_directory() to authenticated;

-- Ausschliesslich lesender Zugriff im ersten Schnitt. Schreibende Zugriffe
-- werden erst mit dem jeweiligen Fachfeature freigegeben.
grant select on public.organizations to authenticated;
grant select on public.locations     to authenticated;
grant select on public.persons       to authenticated;
grant select on public.staff_members to authenticated;
grant select on public.patients      to authenticated;
grant select on public.user_profiles to authenticated;
grant select on public.roles         to authenticated;
grant select on public.user_roles    to authenticated;

-- -----------------------------------------------------------------------------
-- RLS aktivieren (deny-by-default)
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.locations     enable row level security;
alter table public.persons       enable row level security;
alter table public.staff_members enable row level security;
alter table public.patients      enable row level security;
alter table public.user_profiles enable row level security;
alter table public.roles         enable row level security;
alter table public.user_roles    enable row level security;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

-- organizations: nur die eigene Organisation.
create policy organizations_select_own
  on public.organizations for select to authenticated
  using (id = app.current_organization_id());

-- locations: nur Standorte der eigenen Organisation.
create policy locations_select_own_org
  on public.locations for select to authenticated
  using (organization_id = app.current_organization_id());

-- persons: Praxisrollen sehen die Personen ihrer Organisation.
-- Patient:innen sehen ausschliesslich die eigene Person.
create policy persons_select_scoped
  on public.persons for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (app.is_staff() or id = app.current_person_id())
  );

-- staff_members: nur Praxisrollen.
create policy staff_members_select_staff_only
  on public.staff_members for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
  );

-- patients:
--   owner / therapist / team_lead  -> alle Patienten der Organisation
--                                     (bewusste Entscheidung, 4.2)
--   office                         -> organisatorische Stammdaten (4.3)
--   patient                        -> ausschliesslich der eigene Kontext (4.6)
create policy patients_select_scoped
  on public.patients for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (
      app.can_read_patient_directory()
      or person_id = app.current_person_id()
    )
  );

-- user_profiles: eigenes Profil immer, owner zusaetzlich die der Organisation.
create policy user_profiles_select_scoped
  on public.user_profiles for select to authenticated
  using (
    id = auth.uid()
    or (organization_id = app.current_organization_id() and app.has_any_role('owner'))
  );

-- user_roles: eigene Rollen immer, owner zusaetzlich die der Organisation.
create policy user_roles_select_scoped
  on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or (organization_id = app.current_organization_id() and app.has_any_role('owner'))
  );

-- roles: Referenzkatalog ohne Personenbezug.
create policy roles_select_all_authenticated
  on public.roles for select to authenticated
  using (true);
