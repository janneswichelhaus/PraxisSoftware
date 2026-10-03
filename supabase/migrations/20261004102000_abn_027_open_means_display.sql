-- =============================================================================
-- Oeffnen heisst Anzeigen, Herunterladen ist eine eigene Aktion (ABN-027,
-- BEF-059 Teil 1; ADR-017 Fassung 3, Abschnitt J, Punkte 54 und 55)
--
-- issue_patient_file_link bekommt p_download (Vorgabe: false). Der Verweis
-- zum Anzeigen traegt keinen Downloadnamen - das setzt der Client beim
-- Signieren um, die Datenbank sieht die Signatur nicht. Was die Datenbank
-- durchsetzt:
--
--   * Das Kennzeichen im Protokoll: patient_file.link_issued traegt
--     context.download, damit "angesehen" und "auf das Geraet geholt" im
--     Auditlog unterscheidbar sind (Punkt 55).
--   * Kein Herunterladen fuer die beiden Fotoarten (Punkte 40 und 55): Die
--     einzige Herausgabe ist die an die Person selbst durch owner
--     (hand_out_patient_photo, ANN-128).
--
-- Die alte Signatur mit einem Argument faellt weg; ein Aufruf mit nur
-- p_file_id trifft die neue ueber die Vorgabe.
-- =============================================================================

drop function public.issue_patient_file_link(uuid);

CREATE OR REPLACE FUNCTION public.issue_patient_file_link(p_file_id uuid, p_download boolean DEFAULT false)
 RETURNS TABLE(bucket_id text, object_key text, display_name text, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'ready';

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_see_patient_file_type(v_datei.document_type) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Punkt 36: Ein widerrufenes oder faelliges Foto bekommt keinen Verweis -
  -- auch nicht unter Legal Hold. Dieselbe Meldung wie eine fremde Datei.
  if v_datei.document_type = 'patientenfoto'
     and not app.patient_photo_accessible(
       v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
     ) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- ABN-027 (ADR-017 Punkt 55): Herunterladen ist eine eigene Aktion, nicht
  -- fuer die beiden Fotoarten (Punkt 40, ANN-128).
  if coalesce(p_download, false) and app.is_patient_photo_type(v_datei.document_type) then
    raise exception 'photos cannot be downloaded' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.link_issued', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type,
      'download', coalesce(p_download, false)
    )
  );

  delete from public.patient_file_access_grants g
   where g.organization_id = v_datei.organization_id
     and g.expires_at <= now();

  -- ANN-052: eine Freigabe, eine Operation, 30 Sekunden.
  insert into public.patient_file_access_grants (
    organization_id, user_id, patient_file_id, expires_at
  )
  values (
    v_datei.organization_id, v_actor, p_file_id, now() + app.patient_file_access_grant_ttl()
  );

  return query
    select app.patient_file_bucket_for(v_datei.document_type), v_datei.object_key,
           v_datei.display_name, v_datei.mime_type;
end;
$function$
;

comment on function public.issue_patient_file_link(uuid, boolean) is
  'Stellt die einmalige Freigabe fuer genau einen Verweis auf genau eine Datei aus und protokolliert sie (ADR-017 Punkte 15, 20, 21). p_download: eigene Aktion Herunterladen mit Kennzeichen im Protokoll, nicht fuer Fotos (Punkt 55).';

revoke all on function public.issue_patient_file_link(uuid, boolean) from public, anon;
grant execute on function public.issue_patient_file_link(uuid, boolean) to authenticated;
