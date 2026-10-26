-- Das Upload-Recht der Akte prüft wie die vier anderen Dateiarten die vorbereitende Person, den
-- Zustand vor der Bestätigung und das 24-Stunden-Fenster (ADR-017 Punkte 7 und 11). Radflotte und
-- Rückfrage prüfen den Zustand unter der Sperre nach, wie Beleg und Teamchat.

create or replace function app.may_upload_patient_file_object(p_bucket text, p_object_key text)
returns boolean
language sql stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.patient_files f
    where f.object_key = p_object_key
      and f.status = 'pending'
      and f.confirmation_requested_at is null
      and f.uploaded_by = auth.uid()
      and f.created_at > now() - interval '24 hours'
      and app.patient_file_bucket_for(f.document_type) = p_bucket
      and f.organization_id = app.current_organization_id()
      and app.can_write_patient_file(f.document_type, f.treatment_basis_id)
      and (
        f.document_type <> 'patientenfoto'
        or (
          app.patient_photo_accessible(f.patient_id, null)
          and app.patient_photo_accessible(f.patient_id, f.created_at, f.photo_locked_at)
        )
      )
  )
$$;

create or replace function public.confirm_fleet_photo_upload(p_photo_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_foto     public.fleet_photos%rowtype;
  v_metadata jsonb;
begin
  perform app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  v_foto := app.own_pending_fleet_photo(p_photo_id);
  -- Sperren und dabei den Zustand erneut prüfen: Ein gleichzeitig verworfenes
  -- oder bestätigtes Foto meldet keinen Erfolg.
  perform 1 from public.fleet_photos f
   where f.id = v_foto.id and f.status = 'pending' and f.confirmation_requested_at is null
   for update;
  if not found then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.fleet_photo_bucket() and o.name = v_foto.object_key;
  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'size', '')::bigint is distinct from v_foto.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'mimetype', '') is distinct from v_foto.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  -- ADR-017 Punkt 51: Ist die Pruefung am Server scharf, wird das Foto erst
  -- mit ihrem Ergebnis ready - derselbe Schalter wie fuer die Akte.
  if app.patient_file_verification_required() then
    update public.fleet_photos set confirmation_requested_at = now() where id = v_foto.id;
  else
    update public.fleet_photos set status = 'ready', confirmed_at = now() where id = v_foto.id;
  end if;
end;
$$;

create or replace function public.confirm_message_attachment_upload(p_access_id uuid, p_attachment_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anhang   public.platform_message_attachments%rowtype;
  v_vorgang  public.platform_messages%rowtype;
  v_metadata jsonb;
begin
  perform app.assert_platform_message(p_access_id);
  if not app.platform_access_allows(p_access_id, 'attach') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  v_anhang := app.own_pending_attachment(p_access_id, p_attachment_id);
  -- Wie der Nachtrag erst den Vorgang sperren, dann seinen Zustand lesen: Ein gleichzeitiges
  -- Erledigen endet mit 22023 statt mit 23514. Reihenfolge Vorgang vor Anhang wie beim Vorbereiten.
  perform 1 from public.platform_messages m
  where m.id = v_anhang.message_id and m.organization_id = v_anhang.organization_id
  for update;
  v_vorgang := app.platform_open_message(p_access_id, v_anhang.message_id);
  -- Ein Widerruf zwischen Vorbereitung und Bestaetigung laesst den Anhang
  -- nicht mehr sichtbar werden (Punkt 61, wie Punkt 36).
  if app.message_attachment_consent(v_vorgang.relationship_kind, v_vorgang.relationship_id)
     is distinct from 'consent_granted' then
    raise exception 'no consent to attachments' using errcode = '42501';
  end if;

  -- Sperren und dabei den Zustand erneut prüfen: Ein gleichzeitig verworfener
  -- oder bestätigter Anhang öffnet den Vorgang nicht wieder.
  perform 1 from public.platform_message_attachments x
   where x.id = v_anhang.id and x.status = 'pending' and x.confirmation_requested_at is null
   for update;
  if not found then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.message_attachment_bucket() and o.name = v_anhang.object_key;
  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'size', '')::bigint is distinct from v_anhang.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'mimetype', '') is distinct from v_anhang.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  -- Punkte 51 und 69: Ist eine der Pruefungen scharf, wird der Anhang erst
  -- mit ihrem Ergebnis ready.
  if app.patient_file_verification_required() or app.message_attachment_scan_required() then
    update public.platform_message_attachments
       set confirmation_requested_at = now()
     where id = v_anhang.id;
  else
    update public.platform_message_attachments
       set status = 'ready', confirmed_at = now()
     where id = v_anhang.id;
  end if;

  -- Wie nach einem Nachtrag ist die Praxis wieder am Zug; eine neue Frist
  -- nur, wenn sie schon geantwortet hatte (ANN-309).
  update public.platform_messages m
     set status = 'open',
         due_on = case when m.status = 'open' then m.due_on
                       else app.message_due_on(m.organization_id) end,
         last_entry_at = now()
   where m.id = v_anhang.message_id;

  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
end;
$$;
