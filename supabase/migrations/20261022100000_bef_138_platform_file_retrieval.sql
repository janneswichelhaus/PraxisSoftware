-- =============================================================================
-- BEF-138: Abruf freigegebener Dokumente ueber die Plattform ohne Protokoll
--
-- ADR-010 Fassung 4 Punkt 22, ADR-023 Fassung 3 Punkt 24; Entscheidung des
-- Projektinhabers in der Abnahme der Annahmen vom 2026-10-09 (ANN-249).
--
-- Ruft die Person ein freigegebenes Dokument ab, entsteht kein Eintrag
-- `patient_file.downloaded` mehr; nachgewiesen ist die Freigabe am Datensatz
-- (released_at, released_by). Ruft eine Vertretung ab, zaehlt das als ihr
-- Lesen: app.log_platform_representation schreibt hoechstens einen Eintrag
-- `platform_representation.read` je Tag und Akte und nichts fuer die Person
-- selbst. Die Menge der Aktionen bleibt gleich; das Herunterladen durch die
-- Praxis bleibt `patient_file.downloaded`. Sonst unveraendert gegenueber
-- 20261010160000_por_014_platform_files.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.issue_platform_file_link(p_access_id uuid, p_file_id uuid)
returns table (bucket_id text, object_key text, display_name text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_datei  record;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    raise exception 'file not accessible' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and v_zugang.relationship_kind = 'treatment'
    and f.patient_id = v_zugang.relationship_id
    and f.organization_id = v_zugang.organization_id
    and f.status = 'ready'
    and f.released_at is not null
    and not app.is_patient_photo_type(f.document_type);
  -- Eine fremde, nicht freigegebene und eine nicht vorhandene Datei sehen
  -- gleich aus.
  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- BEF-138 (ADR-010 Punkt 22): kein eigener Eintrag fuer den Abruf. Eine
  -- Vertretung liest damit; fuer die Person selbst schreibt der Aufruf nichts.
  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'files')
  );

  delete from public.patient_file_access_grants g
   where g.organization_id = v_datei.organization_id
     and g.expires_at <= now();

  -- ANN-052: eine Freigabe, eine Operation, kurze Frist.
  insert into public.patient_file_access_grants (
    organization_id, user_id, patient_file_id, expires_at
  )
  values (
    v_datei.organization_id, auth.uid(), p_file_id, now() + app.patient_file_access_grant_ttl()
  );

  return query
    select app.patient_file_bucket_for(v_datei.document_type), v_datei.object_key,
           v_datei.display_name, v_datei.mime_type;
end;
$$;

revoke all on function public.issue_platform_file_link(uuid, uuid) from public, anon;
grant execute on function public.issue_platform_file_link(uuid, uuid) to authenticated;

comment on function public.issue_platform_file_link(uuid, uuid) is
  'POR-014: die einmalige Freigabe fuer genau einen Verweis auf ein freigegebenes Dokument (ADR-017 Punkte 15, 20, 21). Seit BEF-138 ohne eigenen Auditeintrag; eine Vertretung liest (ADR-010 Punkt 22, ADR-023 Punkt 24). Nur Behandlungszugang, nie Fotos.';
