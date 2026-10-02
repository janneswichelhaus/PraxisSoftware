-- =============================================================================
-- POR-006: "Sie handeln fuer ..." (ADR-023 Punkte 13, 14, 24; W3, W5)
--
--   app.platform_access_allows        die Rechte je Art an EINER Stelle (W3)
--   app.log_platform_representation   jeder Zugriff ueber eine Vertretung,
--                                     auch lesend (Punkt 24, W5; ANN-209)
--   public.platform_context           liefert jetzt die Art und bei einer
--                                     Vertretung den Namen der vertretenen
--                                     Person - und protokolliert genau dann
--
-- Akteur ist das Konto der vertretenden Person (`representative`), Gegenstand
-- das Verhaeltnis der vertretenen, im Kontext steht der Zugang (Punkt 14).
-- Das Lesen der eigenen Daten durch die Person selbst bleibt unprotokolliert.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rechte je Art (ADR-023 Punkt 13, Tabelle; W3)
--
--   read, request, message       alle drei Arten
--   consent, export,             die Person selbst und ihre rechtliche
--   manage_companions            Vertretung - nie die Begleitung
--
-- Jede kuenftige Projektion und jeder Schreibweg der Plattform fragt hier.
-- Ohne lesbaren Zugang (gesperrt, entzogen, Frist abgelaufen, fremdes Konto)
-- gilt nichts.
-- -----------------------------------------------------------------------------
create function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p_capability in ('read', 'request', 'message') then true
      when p_capability in ('consent', 'export', 'manage_companions')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

revoke all on function app.platform_access_allows(uuid, text) from public, anon, authenticated;

comment on function app.platform_access_allows(uuid, text) is
  'POR-006: die Rechtetabelle aus ADR-023 Punkt 13 (W3) an einer Stelle. Begleitung: read, request, message. Person selbst und rechtliche Vertretung zusaetzlich consent, export, manage_companions. Nur ueber einen lesbaren Zugang des angemeldeten Kontos.';

-- -----------------------------------------------------------------------------
-- 2. Protokoll eines Zugriffs ueber eine Vertretung (Punkt 24, ANN-209)
--
-- Schreibt nichts fuer den eigenen Zugang. Gegenstand ist das Verhaeltnis
-- (`patient` bzw. `training_relationship`), wie bei jedem Zugriff der Praxis
-- auf die Akte - damit haelt ein Legal Hold auch diese Eintraege.
-- -----------------------------------------------------------------------------
create function app.log_platform_representation(
  p_access_id uuid, p_action text, p_context jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  select a.organization_id, a.account_user_id, 'representative', p_action,
         case a.relationship_kind when 'treatment' then 'patient' else 'training_relationship' end,
         a.relationship_id, 'success',
         jsonb_build_object('surface', 'platform', 'platform_access_id', a.id,
                            'access_kind', a.access_kind)
           || coalesce(p_context, '{}'::jsonb)
  from public.platform_accesses a
  where a.id = p_access_id
    and a.access_kind <> 'self'
    and a.account_user_id is not null
$$;

revoke all on function app.log_platform_representation(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. platform_context mit Art und "Sie handeln fuer ..." (Punkt 14,
--    DSN-001 Abschnitt 10)
--
-- Der Name der vertretenen Person steht nur an einem lesbaren
-- Vertretungszugang. Die Person selbst bekommt weiterhin keinen Namen (Punkt
-- 22): Sie weiss, wer sie ist. VOLATILE, weil der Aufruf ueber eine
-- Vertretung einen Auditeintrag schreibt.
-- -----------------------------------------------------------------------------
drop function public.platform_context();

create function public.platform_context()
returns table (
  access_id         uuid,
  organization_name text,
  relationship_kind text,
  status            text,
  readable          boolean,
  read_until        timestamptz,
  access_kind       text,
  represented_name  text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zeile record;
begin
  if auth.uid() is null
     or exists (select 1 from public.user_profiles up where up.id = auth.uid()) then
    return;
  end if;

  for v_zeile in
    select a.id, o.name, a.relationship_kind, a.status, a.access_kind,
           exists (select 1 from app.platform_readable_access(a.id)) as lesbar,
           app.platform_access_ended_at(a.id) as bis,
           a.relationship_id, a.created_at
    from public.platform_accesses a
    join public.organizations o on o.id = a.organization_id
    where a.account_user_id = auth.uid()
      and a.status in ('active', 'locked')
    -- Die eigenen Bereiche zuerst, dann die Vertretungen.
    order by (a.access_kind <> 'self'), a.relationship_kind desc, a.created_at
  loop
    access_id := v_zeile.id;
    organization_name := v_zeile.name;
    relationship_kind := v_zeile.relationship_kind;
    status := v_zeile.status;
    readable := v_zeile.lesbar;
    read_until := v_zeile.bis;
    access_kind := v_zeile.access_kind;
    represented_name := null;

    if v_zeile.access_kind <> 'self' and v_zeile.lesbar then
      select concat_ws(' ', p.given_name, p.family_name) into represented_name
      from app.platform_relationship(v_zeile.relationship_kind, v_zeile.relationship_id) r
      join public.persons p on p.id = r.person_id;

      perform app.log_platform_representation(
        v_zeile.id, 'platform_representation.read', jsonb_build_object('view', 'context')
      );
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function public.platform_context() from public, anon;
grant execute on function public.platform_context() to authenticated;

comment on function public.platform_context() is
  'POR-004/POR-006: Plattformprojektion fuer das Geruest (DSN-001 Abschnitt 3, D6): Praxisname, eigene Zugaenge und Vertretungen mit Art. Bei einer lesbaren Vertretung der Name der vertretenen Person ("Sie handeln fuer ...", ADR-023 Punkt 14) und ein Auditeintrag (Punkt 24, ANN-209). Eigenes Lesen wird nicht protokolliert.';
