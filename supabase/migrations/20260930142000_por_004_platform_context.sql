-- =============================================================================
-- POR-004: Die erste Plattformprojektion (ADR-023 Punkte 18, 19, 22, 25)
--
-- Die Plattform liest nur ueber Projektionen. Sie leiten den Zugriff aus
-- `auth.uid()` ueber einen Zugang ab; eine Kennung aus dem Browser waehlt
-- hoechstens unter den eigenen Zugaengen aus und gewaehrt nie etwas
-- (Punkt 19). Jede Projektion liest den Zustand des Zugangs bei jedem Aufruf:
-- Sperren und Entziehen wirken bei der naechsten Anfrage (Punkt 18).
--
--   app.platform_readable_access   die eine Stelle fuer "darf dieses Konto
--                                  ueber diesen Zugang lesen?" - fuer alle
--                                  kuenftigen Projektionen
--   public.platform_context        das Geruest: Praxis und eigene Zugaenge
--
-- Keine Zeile fuer ein Praxiskonto (Punkt 2), keine fuer einen entzogenen
-- Zugang, keine Angabe aus der Akte, auch kein Name (Punkt 22). Das eigene
-- Lesen wird nicht protokolliert (Punkt 24, W5).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.platform_readable_access
--
-- Liefert das Verhaeltnis hinter einem Zugang, wenn er dem angemeldeten Konto
-- gehoert, aktiv ist und die Lesefrist nach dem Ende des Verhaeltnisses nicht
-- abgelaufen ist (DSN-001 D2, ANN-189). Sonst keine Zeile.
-- -----------------------------------------------------------------------------
create function app.platform_readable_access(p_access_id uuid)
returns table (organization_id uuid, relationship_kind text, relationship_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.organization_id, a.relationship_kind, a.relationship_id
  from public.platform_accesses a
  where a.id = p_access_id
    and a.account_user_id = auth.uid()
    and a.status = 'active'
    and not exists (select 1 from public.user_profiles up where up.id = auth.uid())
    and coalesce(app.platform_access_ended_at(a.id) > now(), true)
$$;

revoke all on function app.platform_readable_access(uuid) from public, anon, authenticated;

comment on function app.platform_readable_access(uuid) is
  'POR-004: die eine Pruefung fuer Plattformprojektionen (ADR-023 Punkt 19): eigenes Konto, aktiver Zugang, Lesefrist nicht abgelaufen (DSN-001 D2). Fuer keine Anwendungsrolle ausfuehrbar.';

-- -----------------------------------------------------------------------------
-- public.platform_context
--
-- Je lebendem Zugang des Kontos eine Zeile: welche Praxis, welcher Bereich,
-- welcher Zustand. `readable` sagt, ob dahinter etwas zu sehen ist; ein
-- gesperrter oder abgelaufener Zugang steht da, damit die Oberflaeche es
-- sagen kann (§13), zeigt aber nichts.
-- -----------------------------------------------------------------------------
create function public.platform_context()
returns table (
  access_id         uuid,
  organization_name text,
  relationship_kind text,
  status            text,
  readable          boolean,
  read_until        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id,
         o.name,
         a.relationship_kind,
         a.status,
         exists (select 1 from app.platform_readable_access(a.id)),
         app.platform_access_ended_at(a.id)
  from public.platform_accesses a
  join public.organizations o on o.id = a.organization_id
  where auth.uid() is not null
    and a.account_user_id = auth.uid()
    and a.status in ('active', 'locked')
    -- Ein Praxiskonto hat keine Plattform (Punkt 2); auch nicht, wenn ein
    -- Riegel einmal versagte.
    and not exists (select 1 from public.user_profiles up where up.id = auth.uid())
  order by a.relationship_kind desc, a.created_at
$$;

revoke all on function public.platform_context() from public, anon;
grant execute on function public.platform_context() to authenticated;

comment on function public.platform_context() is
  'POR-004: Plattformprojektion fuer das Geruest (DSN-001 Abschnitt 3, D6): Praxisname und die eigenen Zugaenge mit Zustand. Nur aus auth.uid(), keine Angabe aus dem Verhaeltnis. Eigenes Lesen wird nicht protokolliert (ADR-023 Punkt 24).';
