-- Bestätigen und Verwerfen eines offenen Uploads der Akte darf nur die vorbereitende Person, wie bei
-- Radflotte, Rückfrage, Beleg und Teamchat (ADR-017 Punkt 7). Eine Kollegin mit demselben Recht
-- bekommt dieselbe Antwort wie für eine Datei, die es nicht gibt.

create or replace function public.confirm_patient_file_upload(p_file_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
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
    and f.uploaded_by = v_actor
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to confirm this file' using errcode = '42501';
  end if;

  -- Eine schon bestätigte, auf die Prüfung wartende Datei wird nicht ein zweites Mal bestätigt.
  if v_datei.status <> 'pending' or v_datei.confirmation_requested_at is not null then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  -- Ein Widerruf zwischen Vorbereitung und Bestätigung lässt das Foto nicht mehr sichtbar werden,
  -- auch nicht mit einer neuen Erteilung dazwischen (ADR-017 Punkt 36).
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

  -- Ist die Prüfung am Server scharf, wird die Datei erst mit ihrem Ergebnis ready
  -- (ADR-017 Punkt 51); bis dahin trägt sie den Zeitpunkt der Bestätigung.
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
end;
$$;

create or replace function public.discard_patient_file_upload(p_file_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_datei record;
  v_id    uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.uploaded_by = auth.uid()
    and f.status = 'pending'
    -- Eine bestätigte Datei, die auf die Prüfung wartet, ist kein abgebrochener Upload.
    and f.confirmation_requested_at is null;

  if not found then
    raise exception 'pending upload not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to discard this upload' using errcode = '42501';
  end if;

  -- Der Trigger schreibt den Löschauftrag, falls doch schon ein Objekt liegt. Der Zustand steht
  -- im Löschen selbst: Eine gleichzeitig bestätigte Datei bleibt.
  delete from public.patient_files f
   where f.id = p_file_id
     and f.uploaded_by = auth.uid()
     and f.status = 'pending'
     and f.confirmation_requested_at is null
  returning f.id into v_id;
  if v_id is null then
    raise exception 'pending upload not accessible' using errcode = '42501';
  end if;
end;
$$;

comment on function public.confirm_patient_file_upload(uuid) is
  'Phase (c) des zweiphasigen Uploads (ADR-017 Punkt 7c), nur fuer die vorbereitende Person: prueft Groesse und MIME-Typ gegen storage.objects und macht die Datei sichtbar. Wer und wann steht an der Datei (ANN-230).';
