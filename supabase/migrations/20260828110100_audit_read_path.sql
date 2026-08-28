-- =============================================================================
-- Audit-Lesepfad (ADR-010)
--
-- V1-Entscheidung: Auditlogs duerfen innerhalb der Praxisanwendung
-- ausschliesslich von Nutzern mit owner-Rolle derselben Organisation gelesen
-- werden.
--
-- Es gibt weiterhin KEIN direktes SELECT-Recht auf public.audit_log. Der
-- Zugriff laeuft ueber eine SECURITY-DEFINER-Funktion, die Authentifizierung,
-- Rolle und Organisation selbst prueft und ausschliesslich Metadaten
-- zurueckgibt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ergebnis eines Auditereignisses
-- -----------------------------------------------------------------------------
alter table public.audit_log
  add column outcome text not null default 'success'
    check (outcome in ('success', 'denied'));

comment on column public.audit_log.outcome is
  'Ergebnis des protokollierten Vorgangs. Abgewiesene Zugriffe werden derzeit nicht persistiert, weil der abweisende Aufruf zurueckgerollt wird - siehe docs/DEVELOPMENT.md.';

-- -----------------------------------------------------------------------------
-- Ereigniskatalog erweitern
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('patient_record.viewed', 'audit_log.read'));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in ('patient', 'organization'));

-- -----------------------------------------------------------------------------
-- list_audit_events
--
-- Gibt bewusst NICHT die Spalte context zurueck. Sie ist der einzige Ort, an
-- dem spaeter freitextnahe Metadaten landen koennten; klinische Inhalte,
-- Secrets und vollstaendige KI-Prompts verlassen die Datenbank hier also gar
-- nicht erst.
-- -----------------------------------------------------------------------------
create or replace function public.list_audit_events(
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_actor_user_id  uuid        default null,
  p_action         text        default null,
  p_limit          integer     default 50,
  p_offset         integer     default 0
)
returns table (
  id                 uuid,
  occurred_at        timestamptz,
  actor_user_id      uuid,
  actor_display_name text,
  action             text,
  subject_type       text,
  subject_id         uuid,
  outcome            text,
  total_count        bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_limit  integer;
  v_offset integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Rolle und Organisation werden hier geprueft, weil SECURITY DEFINER die
  -- RLS umgeht. Ohne diese Pruefung waere die Funktion ein offener Kanal.
  if not app.has_any_role('owner') then
    raise exception 'audit log access denied' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'audit log access denied' using errcode = '42501';
  end if;

  v_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    a.id,
    a.occurred_at,
    a.actor_user_id,
    up.display_name,
    a.action,
    a.subject_type,
    a.subject_id,
    a.outcome,
    count(*) over () as total_count
  from public.audit_log a
  left join public.user_profiles up
    on up.id = a.actor_user_id
   and up.organization_id = v_org
  where a.organization_id = v_org
    and (p_from is null          or a.occurred_at >= p_from)
    and (p_to is null            or a.occurred_at <  p_to)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (p_action is null        or a.action = p_action)
  order by a.occurred_at desc, a.id desc
  limit v_limit offset v_offset;

  -- Der Zugriff auf das Auditlog ist selbst ein Auditereignis (ADR-010).
  -- Bewusst NACH der Abfrage, damit der eigene Lesevorgang nicht das Ergebnis
  -- verfaelscht, das er gerade liefert.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'audit_log.read', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer) is
  'Kontrollierter Lesepfad auf das Auditlog. Nur owner, nur eigene Organisation, nur Metadaten (ADR-010).';

revoke all on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer)
  from public, anon;
grant execute on function public.list_audit_events(timestamptz, timestamptz, uuid, text, integer, integer)
  to authenticated;
