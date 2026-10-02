-- =============================================================================
-- POR-007: Unter "Ich" - wer fuer mich Zugang hat (ADR-023 Punkt 14)
--
-- "Hat die vertretene Person selbst ein Konto, sieht sie unter 'Ich', wer fuer
-- sie Zugang hat. Eine Begleitung kann sie dort selbst beenden. Eine
-- rechtliche Vertretung beendet nur die Praxis."
--
-- Beides haengt am Recht `manage_companions` (app.platform_access_allows,
-- POR-006): die Person selbst und ihre rechtliche Vertretung, die "alles darf,
-- was die Person darf" (Punkt 13) - nie die Begleitung. Das Beenden ist der
-- Widerruf der Einwilligung (Punkt 13: "Der Widerruf wirkt wie ein
-- Entziehen") und steht mit Grund `consent_withdrawn` im Protokoll.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lesen: die Vertretungen des eigenen Verhaeltnisses
-- -----------------------------------------------------------------------------
create function public.platform_representatives(p_access_id uuid)
returns table (
  access_id           uuid,
  access_kind         text,
  legal_basis         text,
  representative_name text,
  status              text,
  since               timestamptz,
  can_end             boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eigen public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'manage_companions') then
    return;
  end if;
  select * into v_eigen from public.platform_accesses a where a.id = p_access_id;

  -- Ueber eine rechtliche Vertretung ist auch dieses Lesen protokolliert
  -- (Punkt 24, ANN-209); fuer die Person selbst nicht.
  perform app.log_platform_representation(
    v_eigen.id, 'platform_representation.read', jsonb_build_object('view', 'representatives')
  );

  return query
  select a.id, a.access_kind, a.legal_basis, a.representative_name, a.status,
         coalesce(a.activated_at, a.created_at),
         a.access_kind = 'companion'
  from public.platform_accesses a
  where a.organization_id = v_eigen.organization_id
    and a.relationship_kind = v_eigen.relationship_kind
    and a.relationship_id = v_eigen.relationship_id
    and a.id <> v_eigen.id
    and a.access_kind <> 'self'
    and a.status in ('invited', 'active', 'locked')
    -- Zweitreview: eine beendete Vertretung (Sorgerecht ab 18, Lesefrist)
    -- steht hier nicht mehr, auch solange der Loeschlauf sie noch fuehrt.
    and coalesce(app.platform_access_ended_at(a.id) > now(), true)
  order by a.access_kind, a.created_at;
end;
$$;

revoke all on function public.platform_representatives(uuid) from public, anon;
grant execute on function public.platform_representatives(uuid) to authenticated;

comment on function public.platform_representatives(uuid) is
  'POR-007: Plattformprojektion unter "Ich": wer fuer die Person Zugang hat (ADR-023 Punkt 14). Nur ueber einen eigenen Zugang oder eine rechtliche Vertretung (manage_companions), nie ueber eine Begleitung. Name und Art der Vertretung, kein Konto, kein Nachweis.';

-- -----------------------------------------------------------------------------
-- 2. Eine Begleitung beenden - der Widerruf der Einwilligung
-- -----------------------------------------------------------------------------
create function public.end_platform_companion(p_access_id uuid, p_companion_access_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eigen      public.platform_accesses%rowtype;
  v_begleitung public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'manage_companions') then
    return false;
  end if;
  select * into v_eigen from public.platform_accesses a where a.id = p_access_id;

  select * into v_begleitung
  from public.platform_accesses a
  where a.id = p_companion_access_id
    and a.organization_id = v_eigen.organization_id
    and a.relationship_kind = v_eigen.relationship_kind
    and a.relationship_id = v_eigen.relationship_id
    and a.access_kind = 'companion'
    and a.status <> 'revoked'
  for update;
  -- Eine rechtliche Vertretung beendet nur die Praxis (Punkt 14); eine
  -- fremde oder schon beendete Begleitung gibt es hier nicht.
  if v_begleitung.id is null then
    return false;
  end if;

  update public.platform_accesses
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoked_reason = 'consent_withdrawn', locked_at = null, locked_by = null
   where id = v_begleitung.id;

  update public.platform_access_invitations
     set status = 'revoked', revoked_at = now()
   where platform_access_id = v_begleitung.id and status = 'pending';

  perform app.log_platform_access_event(
    v_eigen.organization_id, auth.uid(),
    case when v_eigen.access_kind = 'self' then 'platform' else 'representative' end,
    'platform_access.revoked', v_begleitung.id,
    jsonb_build_object('surface', 'platform', 'reason', 'consent_withdrawn',
                       'platform_access_id', v_eigen.id, 'access_kind', v_eigen.access_kind,
                       'previous_status', v_begleitung.status)
  );
  return true;
end;
$$;

revoke all on function public.end_platform_companion(uuid, uuid) from public, anon;
grant execute on function public.end_platform_companion(uuid, uuid) to authenticated;

comment on function public.end_platform_companion(uuid, uuid) is
  'POR-007: Die Person (oder ihre rechtliche Vertretung) beendet eine Begleitung unter "Ich" - der Widerruf der Einwilligung (ADR-023 Punkte 13, 14). Grund consent_withdrawn, protokolliert als platform_access.revoked. Eine rechtliche Vertretung beendet nur die Praxis.';
