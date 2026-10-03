-- =============================================================================
-- Nachgezogen aus dem Zweitreview von ABN-EPIC-001c (ADR-013 Punkt 9 Nr. 8)
--
--   * Befund 2: Pruefen laesst nur die hochladende Person, und nur innerhalb
--     von 24 Stunden nach der Aufnahme (dasselbe Fenster wie ein
--     unbestaetigter Upload, ADR-017 Punkt 7). So wird aus der Pruefung kein
--     Loeschweg fuer eine Datei, die laengst Teil der Akte ist (Punkt 48),
--     und keine andere Person der Praxis kann sie ausloesen. Unter Legal Hold
--     verwirft ein Befund nicht (Punkt 24), er steht nur im Protokoll.
--   * Befund 3: discard_patient_file_upload verwirft keine bestaetigte Datei,
--     die auf die Pruefung wartet; confirm_patient_file_upload bestaetigt sie
--     kein zweites Mal.
--   * Befund 5: Ein Ergebnis gibt es nur ganz - die Constraint laesst keine
--     Teilergebnisse mehr zu.
-- =============================================================================

alter table public.patient_files
  drop constraint patient_files_verification_complete;

alter table public.patient_files
  add constraint patient_files_verification_complete check (
    (verified_at is null) = (content_type_verified is null)
    and (verified_at is null) = (checksum_verified is null)
    and (verified_at is not null or metadata_verified is null)
  );

create or replace function public.patient_file_for_verification(p_file_id uuid, p_user_id uuid)
returns table (
  bucket_id       text,
  object_key      text,
  mime_type       text,
  byte_size       bigint,
  checksum_sha256 text,
  already_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select app.patient_file_bucket_for(f.document_type),
         f.object_key,
         f.mime_type,
         f.byte_size,
         f.checksum_sha256,
         f.verified_at is not null
  from public.patient_files f
  join public.user_profiles up
    on up.id = p_user_id
   and up.organization_id = f.organization_id
   and up.is_active
  where f.id = p_file_id
    and f.uploaded_by = p_user_id
    and f.created_at > now() - interval '24 hours'
    and (f.status = 'ready' or f.confirmation_requested_at is not null)
$$;

create or replace function public.record_patient_file_verification(
  p_file_id          uuid,
  p_content_type_ok  boolean,
  p_checksum_ok      boolean,
  p_metadata_ok      boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datei record;
begin
  if p_content_type_ok is null or p_checksum_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
  for update;

  if not found then
    return 'not_found';
  end if;

  -- Einmal geprueft bleibt geprueft: Ein zweiter Lauf aendert nichts.
  if v_datei.verified_at is not null then
    return 'already_verified';
  end if;

  if v_datei.status <> 'ready' and v_datei.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;

  -- Bilder bekommen ein Metadatenergebnis, PDF nicht (Punkt 49).
  if (v_datei.mime_type in ('image/jpeg', 'image/png')) <> (p_metadata_ok is not null) then
    raise exception 'metadata result does not match the media type' using errcode = '22023';
  end if;

  if p_content_type_ok and p_checksum_ok and coalesce(p_metadata_ok, true) then
    update public.patient_files
       set verified_at           = now(),
           content_type_verified = true,
           checksum_verified     = true,
           metadata_verified     = p_metadata_ok,
           status                = 'ready',
           confirmed_at          = coalesce(confirmed_at, now())
     where id = p_file_id;
    return 'passed';
  end if;

  -- Zweitreview Befund 2: Eine Datei unter Legal Hold wird nie verworfen,
  -- auch nicht nach Befund (ADR-017 Punkt 24, ANN-033). Der Befund steht im
  -- Protokoll; die Datei bleibt ungeprueft.
  if app.under_legal_hold(v_datei.organization_id, 'patient', v_datei.patient_id) then
    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    values (
      v_datei.organization_id, null, 'system', 'patient_file.verification_failed', 'patient_file',
      p_file_id, 'denied',
      jsonb_build_object(
        'surface', 'edge_function',
        'patient_id', v_datei.patient_id,
        'document_type', v_datei.document_type,
        'content_type_ok', p_content_type_ok,
        'checksum_ok', p_checksum_ok,
        'metadata_ok', p_metadata_ok,
        'was_ready', v_datei.status = 'ready',
        'held', true
      )
    );
    return 'held';
  end if;

  -- Punkt 52: Befund heisst verwerfen. Das Protokoll nennt, welche Pruefung
  -- anschlug - nie Name, Schluessel oder Inhalt (ADR-010 Punkt 3).
  -- ANN-009: ein Ereignis ohne handelnden Account (der Dienst) ist 'system'.
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, null, 'system', 'patient_file.verification_failed', 'patient_file', p_file_id,
    'denied',
    jsonb_build_object(
      'surface', 'edge_function',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type,
      'content_type_ok', p_content_type_ok,
      'checksum_ok', p_checksum_ok,
      'metadata_ok', p_metadata_ok,
      'was_ready', v_datei.status = 'ready'
    )
  );

  -- Der Trigger an patient_files schreibt den Loeschauftrag fuer das Objekt.
  delete from public.patient_files where id = p_file_id;
  return 'rejected';
end;
$$;


CREATE OR REPLACE FUNCTION public.discard_patient_file_upload(p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_datei record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'pending'
    -- Zweitreview Befund 3: Eine bestaetigte Datei, die auf die Pruefung
    -- wartet, ist kein abgebrochener Upload; verwerfen darf sie nur das
    -- Ergebnis der Pruefung oder der Lauf nach 24 Stunden.
    and f.confirmation_requested_at is null;

  if not found then
    raise exception 'pending upload not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to discard this upload' using errcode = '42501';
  end if;

  -- Der Trigger schreibt den Loeschauftrag, falls doch schon ein Objekt liegt.
  delete from public.patient_files where id = p_file_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_patient_file_upload(p_file_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_datei    record;
  v_metadata jsonb;
  v_groesse  bigint;
  v_mime     text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to confirm this file' using errcode = '42501';
  end if;

  -- Zweitreview: Eine schon bestaetigte, auf die Pruefung wartende Datei wird
  -- nicht ein zweites Mal bestaetigt (sonst ein zweites patient_file.uploaded).
  if v_datei.status <> 'pending' or v_datei.confirmation_requested_at is not null then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  -- Punkt 36: Ein Widerruf zwischen Vorbereitung und Bestaetigung laesst das
  -- Foto nicht mehr sichtbar werden.
  -- Und das Foto selbst ist seit seiner Aufnahme nicht faellig geworden: Ein
  -- Widerruf mit neuer Erteilung dazwischen gibt es nicht frei.
  if v_datei.document_type = 'patientenfoto'
     and not (
       app.patient_photo_accessible(v_datei.patient_id, null)
       and app.patient_photo_accessible(
         v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
       )
     ) then
    raise exception 'no consent to patient photos' using errcode = '42501';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket_for(v_datei.document_type)
    and o.name = v_datei.object_key;

  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;

  v_groesse := nullif(v_metadata ->> 'size', '')::bigint;
  v_mime    := nullif(v_metadata ->> 'mimetype', '');

  if v_groesse is distinct from v_datei.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;

  if v_mime is distinct from v_datei.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  if v_groesse > app.patient_file_max_bytes() then
    raise exception 'file too large' using errcode = '22023';
  end if;

  if v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  -- ABN-024 (ADR-017 Punkt 51): Ist die Pruefung am Server scharf, wird die
  -- Datei erst mit ihrem Ergebnis ready (record_patient_file_verification).
  -- Bis dahin bleibt sie pending und traegt den Zeitpunkt der Bestaetigung.
  if app.patient_file_verification_required() then
    update public.patient_files
       set confirmation_requested_at = now()
     where id = p_file_id;
  else
    update public.patient_files
       set status = 'ready',
           confirmed_at = now()
     where id = p_file_id;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.uploaded', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );
end;
$function$
;
