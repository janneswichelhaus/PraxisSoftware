-- =============================================================================
-- ABN-032 (ABN-EPIC-002, BEF-135): Keine neue Arbeitshilfe
--
-- ADR-017 Fassung 4 Punkte 56 und 57; Abnahme der Annahmen vom 2026-10-09
-- (ANN-221). Ein Foto aus der Dokumentation ist ein Dokumentationsfoto; eine
-- Foto-Arbeitshilfe (Art patientenfoto) entsteht nicht mehr. Die Vorbereitung
-- eines Uploads weist die Art ab - die eine Stelle (ANN-316). Art, Klasse,
-- Bucket, Bestaetigung, Widerruf, Loeschlauf und Herausgabe bleiben, solange
-- eine Arbeitshilfe liegen kann. Sonst unveraendert gegenueber
-- 20261004100000_abn_023_documentation_photos.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prepare_patient_file_upload(p_patient_id uuid, p_treatment_basis_id uuid, p_document_type text, p_display_name text, p_mime_type text, p_byte_size bigint, p_checksum_sha256 text)
 RETURNS TABLE(file_id uuid, bucket_id text, object_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patient_file_document_types t where t.key = p_document_type
  ) then
    raise exception 'unknown document type %', p_document_type using errcode = '22023';
  end if;

  -- Die Grundlage muss zu genau dieser Patientin in dieser Organisation
  -- gehoeren. Sonst haenge der Scan an einem fremden Auftrag - und traege
  -- dessen Frist.
  if p_treatment_basis_id is not null and not exists (
    select 1
    from public.treatment_bases pr
    where pr.id = p_treatment_basis_id
      and pr.patient_id = p_patient_id
      and pr.organization_id = v_org
  ) then
    raise exception 'treatment basis not accessible' using errcode = '42501';
  end if;

  -- ANN-316 (ADR-017 Fassung 4 Punkt 57, BEF-135): Eine neue Arbeitshilfe
  -- entsteht nicht mehr. Was schon liegt, bleibt bis Frist oder Widerruf.
  if p_document_type = 'patientenfoto' then
    raise exception 'photo aids are no longer taken' using errcode = '22023';
  end if;

  if not app.can_write_patient_file(p_document_type, p_treatment_basis_id) then
    raise exception 'not allowed to upload this document type' using errcode = '42501';
  end if;

  -- Fotos der Person (ADR-017 Punkte 32, 36 und 45): nur an der Patient:in,
  -- nur JPEG. Die Einwilligung verlangt nur die Arbeitshilfe; das
  -- Dokumentationsfoto stuetzt sich auf die Behandlung (Punkt 45, ANN-126).
  -- Geprueft vor jedem Byte.
  if app.is_patient_photo_type(p_document_type) then
    if p_treatment_basis_id is not null then
      raise exception 'a patient photo belongs to the patient' using errcode = '22023';
    end if;
    if p_mime_type is distinct from 'image/jpeg' then
      raise exception 'unsupported media type' using errcode = '22023';
    end if;
    -- Seit ABN-032 unerreichbar (Abweisung oben); bleibt fuer die Ruecknahme
    -- nach ANN-316.
    if p_document_type = 'patientenfoto'
       and not app.patient_photo_accessible(p_patient_id, null) then
      raise exception 'no consent to patient photos' using errcode = '42501';
    end if;
  end if;

  -- Allowlist und Groesse, erste von zwei Durchsetzungen (Punkt 18). Die
  -- zweite steht am Bucket; die dritte prueft bei der Bestaetigung gegen das,
  -- was tatsaechlich abgelegt wurde.
  if p_mime_type is null or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;

  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;

  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 200 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;

  insert into public.patient_files (
    organization_id, patient_id, treatment_basis_id, document_type,
    display_name, mime_type, byte_size, checksum_sha256, uploaded_by
  )
  values (
    v_org, p_patient_id, p_treatment_basis_id, p_document_type,
    btrim(p_display_name), p_mime_type, p_byte_size, p_checksum_sha256, v_actor
  )
  returning id into v_id;

  return query
    select f.id, app.patient_file_bucket_for(f.document_type), f.object_key
    from public.patient_files f
    where f.id = v_id;
end;
$function$;
