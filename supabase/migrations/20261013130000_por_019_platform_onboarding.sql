-- =============================================================================
-- POR-019: Einstieg mit Ueberspringen (IDEA-LZK-005, DSN-001 4.3 "Einladung",
-- Abschnitt 6; ADR-023 Punkte 6, 19, 22; ADR-010 Fassung 3)
--
-- Nach der ersten Anmeldung ein kurzer Einstieg: Willkommen, Einwilligungen,
-- fertig. Die Praxis kann ihn fuer eine Person ueberspringen - beim
-- Hausbesuch sitzt die Therapeutin oft daneben, und ein Einstieg, der sich
-- nicht ueberspringen laesst, wird dann zum Hindernis (IDEA-LZK-005).
--
-- EINWILLIGUNGEN WERDEN NIE UEBERSPRUNGEN: Ueberspringen setzt nur den
-- Einstieg auf erledigt. Keine Einwilligung entsteht dadurch; sie bleiben
-- unter "Ich" offen, bis die Person selbst entscheidet. Eine Einwilligung,
-- die jemand anders fuer die Person geklickt hat, ist keine.
--
-- Nachweis am Zugang (ADR-010 Fassung 3: das Datenmodell ist der Nachweis):
-- wann die Person den Einstieg beendet hat, wann und von wem er
-- uebersprungen wurde. Die Praxis sieht beides im Abschnitt Plattform, die
-- Person unter "Ich -> Einstellungen" (POR-020) - ohne Namen der
-- Mitarbeitenden (Punkt 22). Je Zugang, weil jeder Zugang seine eigenen
-- Einwilligungen hat (ANN-266).
-- =============================================================================

alter table public.platform_accesses
  add column onboarding_finished_at timestamptz,
  add column onboarding_skipped_at  timestamptz,
  add column onboarding_skipped_by  uuid,
  add constraint platform_accesses_onboarding_skip_stamp check (
    (onboarding_skipped_at is null) = (onboarding_skipped_by is null)
  );

comment on column public.platform_accesses.onboarding_finished_at is
  'POR-019: wann die Person den Einstieg beendet hat (auch "spaeter"); null = noch nicht.';
comment on column public.platform_accesses.onboarding_skipped_at is
  'POR-019 (IDEA-LZK-005): wann die Praxis den Einstieg fuer die Person uebersprungen hat. Einwilligungen bleiben davon unberuehrt.';
comment on column public.platform_accesses.onboarding_skipped_by is
  'POR-019: wer den Einstieg uebersprungen hat (Praxiskonto mit dem Recht, den Zugang zu verwalten).';

-- -----------------------------------------------------------------------------
-- 1. Plattform: der Stand des Einstiegs
-- -----------------------------------------------------------------------------
create function public.platform_onboarding(p_access_id uuid)
returns table (
  pending     boolean,
  finished_at timestamptz,
  skipped_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  -- Kein Vertretungseintrag: Der Stand des Einstiegs ist kein Inhalt der
  -- vertretenen Person, sondern einer des eigenen Zugangs.
  return query
  select a.onboarding_finished_at is null and a.onboarding_skipped_at is null,
         a.onboarding_finished_at,
         a.onboarding_skipped_at
  from public.platform_accesses a
  where a.id = p_access_id;
end;
$$;

revoke all on function public.platform_onboarding(uuid) from public, anon;
grant execute on function public.platform_onboarding(uuid) to authenticated;

comment on function public.platform_onboarding(uuid) is
  'POR-019: ob der Einstieg fuer diesen Zugang noch aussteht, wann er beendet bzw. von der Praxis uebersprungen wurde - ohne Namen. Nur ueber einen lesbaren eigenen Zugang.';

-- -----------------------------------------------------------------------------
-- 2. Plattform: den Einstieg beenden
-- -----------------------------------------------------------------------------
create function public.finish_platform_onboarding(p_access_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  update public.platform_accesses a
     set onboarding_finished_at = now()
   where a.id = p_access_id
     and a.onboarding_finished_at is null;
  return found;
end;
$$;

revoke all on function public.finish_platform_onboarding(uuid) from public, anon;
grant execute on function public.finish_platform_onboarding(uuid) to authenticated;

comment on function public.finish_platform_onboarding(uuid) is
  'POR-019: die Person beendet den Einstieg (auch mit "spaeter"). Nachweis am Zugang; true nur beim ersten Mal.';

-- -----------------------------------------------------------------------------
-- 3. Praxis: den Einstieg fuer die Person ueberspringen (IDEA-LZK-005)
--
-- Dieselben Rollen, die den Zugang verwalten (ADR-023 Punkt 6). Nur fuer
-- einen eingeladenen oder aktiven Zugang, dessen Einstieg noch aussteht -
-- und nie mit einer Einwilligung.
-- -----------------------------------------------------------------------------
create function public.skip_platform_onboarding(p_access_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_zugang public.platform_accesses%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  select * into v_zugang from public.platform_accesses a
  where a.id = p_access_id and a.organization_id = v_org
  for update;
  -- Fremd, nicht vorhanden und ohne Recht sehen gleich aus.
  if not found or not app.can_manage_platform_access(v_zugang.relationship_kind) then
    raise exception 'not allowed to manage platform access' using errcode = '42501';
  end if;
  if v_zugang.status not in ('invited', 'active') then
    raise exception 'access is not live' using errcode = '23514';
  end if;
  if v_zugang.onboarding_finished_at is not null or v_zugang.onboarding_skipped_at is not null then
    return false;
  end if;

  update public.platform_accesses
     set onboarding_skipped_at = now(), onboarding_skipped_by = v_actor
   where id = p_access_id;
  return true;
end;
$$;

revoke all on function public.skip_platform_onboarding(uuid) from public, anon;
grant execute on function public.skip_platform_onboarding(uuid) to authenticated;

comment on function public.skip_platform_onboarding(uuid) is
  'POR-019 (IDEA-LZK-005): die Praxis ueberspringt den Einstieg fuer die Person. Rollen, die den Zugang verwalten; nie Einwilligungen. Nachweis am Zugang (onboarding_skipped_at/by), kein Auditeintrag (ADR-010 Fassung 3).';

-- -----------------------------------------------------------------------------
-- 4. Praxis: der Stand im Abschnitt Plattform
-- -----------------------------------------------------------------------------
create function public.get_platform_onboarding(p_access_id uuid)
returns table (
  finished_at     timestamptz,
  skipped_at      timestamptz,
  skipped_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a
  where a.id = p_access_id and a.organization_id = app.current_organization_id();
  if not found or not app.can_read_platform_access(v_zugang.relationship_kind) then
    return;
  end if;
  return query
  select v_zugang.onboarding_finished_at,
         v_zugang.onboarding_skipped_at,
         (select nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), '')
            from public.user_profiles up
            join public.persons pe on pe.id = up.person_id
           where up.id = v_zugang.onboarding_skipped_by);
end;
$$;

revoke all on function public.get_platform_onboarding(uuid) from public, anon;
grant execute on function public.get_platform_onboarding(uuid) to authenticated;

comment on function public.get_platform_onboarding(uuid) is
  'POR-019: Stand des Einstiegs eines Zugangs fuer den Abschnitt Plattform - beendet, uebersprungen, von wem. Rollen, die den Zugang lesen; sonst keine Zeile.';
