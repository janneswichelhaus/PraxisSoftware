-- Die Einsicht der Praxis in die Plattform einer Person entfällt (Jannes, 2026-10-26, ADR-023 Fassung 7):
-- Plattformdaten liest nur noch die Person selbst oder ihre Vertretung, ein Lesepfad der Praxis weniger.
-- Verworfen sind damit ANN-525, ANN-526, ANN-527, ANN-528 und ANN-529.

create or replace function app.platform_readable_access(p_access_id uuid)
returns table(organization_id uuid, relationship_kind text, relationship_id uuid)
language sql stable security definer
set search_path to ''
as $$
  select a.organization_id, a.relationship_kind, a.relationship_id
  from public.platform_accesses a
  where a.id = p_access_id
    and a.status = 'active'
    and coalesce(app.platform_access_ended_at(a.id) > now(), true)
    and app.session_open()
    -- Die Person selbst oder ihre Vertretung (ADR-023 Punkt 19).
    and a.account_user_id = auth.uid()
    and not exists (select 1 from public.user_profiles up where up.id = auth.uid())
$$;

create or replace function app.platform_own_access_after_reading(p_access_id uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select coalesce((
    select true
    from public.platform_accesses a
    where a.id = p_access_id
      and a.access_kind = 'self'
      and a.status = 'active'
      and (a.patient_id is not null or a.training_relationship_id is not null)
      and app.session_open()
      and a.account_user_id = auth.uid()
      and not exists (select 1 from public.user_profiles up where up.id = auth.uid())
  ), false)
$$;

drop function public.platform_preview(uuid, text, jsonb);
drop function app.platform_preview_grant(uuid);
drop function app.platform_preview_functions();
