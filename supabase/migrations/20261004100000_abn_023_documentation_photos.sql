-- =============================================================================
-- Dokumentationsfotos zur Akte (ABN-023, BEF-106; ADR-017 Fassung 3, Abschnitt H)
--
-- Neben Dokumentfoto und Foto-Arbeitshilfe (Schluessel weiter 'patientenfoto',
-- in der Oberflaeche "Arbeitshilfe") gibt es das DOKUMENTATIONSFOTO: ein Foto
-- der Person, das fuer die Dokumentation der Behandlung erforderlich ist
-- (Punkt 43). Es ist Teil der Akte:
--
--   * Grundlage ist die Behandlung (Art. 9 Abs. 2 lit. h DSGVO), KEINE
--     Einwilligung (Punkt 45, ANN-126 Fassung 3). Die Pruefung aus Punkt 36
--     gilt nur fuer die Arbeitshilfe.
--   * Klasse patientenakte, Bucket patientenakte (Punkt 45). Die engere
--     Allowlist - nur JPEG, nur an der Patient:in - setzt die Vorbereitung je
--     Art durch, wie fuer die Arbeitshilfe.
--   * Ein Widerruf der Foto-Einwilligung beruehrt es nicht (Punkt 46); der
--     Loeschweg delete_due_patient_photos kennt nur 'patientenfoto'.
--   * Keine Korrektur zwischen den Fotoarten, in keine Richtung (Punkt 47).
--   * Loeschen von Hand nur am Aufnahmetag, durch die aufnehmende Person oder
--     owner (Punkt 48); danach nur der Loeschlauf mit der Akte.
--   * Derselbe Weg wie die Arbeitshilfe in allem anderen: eigene Fotoliste
--     statt Dateiliste, Anzeige ohne Download, Herausgabe nur an die Person
--     selbst durch owner (Punkt 40, ANN-128), auch in der Auskunft.
--
-- Funktionen, die unten neu stehen, sind aus dem Stand nach allen frueheren
-- Migrationen uebernommen (pg_get_functiondef) und nur an den markierten
-- Stellen geaendert.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Die beiden Fotoarten an einer Stelle
-- -----------------------------------------------------------------------------
create function app.is_patient_photo_type(p_document_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_document_type in ('patientenfoto', 'dokumentationsfoto'), false)
$$;

comment on function app.is_patient_photo_type(text) is
  'Ist die Art ein Foto der Person - Arbeitshilfe (patientenfoto) oder Dokumentationsfoto (ADR-017 Punkt 43)? Beide entstehen nur im Kameradialog, sind nur JPEG, haengen an der Patient:in, haben keine Artkorrektur und keinen Download.';

grant execute on function app.is_patient_photo_type(text) to authenticated;

-- Ist ein Foto nutzbar? Die Arbeitshilfe nach der Einwilligungspruefung
-- (Punkt 36), das Dokumentationsfoto immer - es folgt der Akte (Punkt 46).
create function app.patient_photo_usable(
  p_document_type text,
  p_patient_id    uuid,
  p_taken_at      timestamptz,
  p_locked_at     timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_document_type = 'patientenfoto'
      then app.patient_photo_accessible(p_patient_id, p_taken_at, p_locked_at)
    else true
  end
$$;

comment on function app.patient_photo_usable(text, uuid, timestamptz, timestamptz) is
  'Nutzbarkeit eines Fotos der Person: Arbeitshilfe nach app.patient_photo_accessible (Einwilligung, Frist, Sperre), Dokumentationsfoto immer (ADR-017 Punkt 46).';

revoke all on function app.patient_photo_usable(text, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Punkt 48: Am Aufnahmetag - in der Zeitzone der Praxis - loescht die
-- aufnehmende Person oder owner eine Fehlaufnahme. Danach niemand von Hand.
create function app.documentation_photo_deletable(
  p_organization_id uuid,
  p_uploaded_by     uuid,
  p_taken_at        timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (p_taken_at at time zone o.time_zone)::date = (now() at time zone o.time_zone)::date
    from public.organizations o
    where o.id = p_organization_id
  ), false)
  and (p_uploaded_by = auth.uid() or app.has_any_role('owner'))
$$;

comment on function app.documentation_photo_deletable(uuid, uuid, timestamptz) is
  'Darf die angemeldete Person dieses Dokumentationsfoto von Hand loeschen? Nur am Aufnahmetag in der Zeitzone der Praxis und nur als aufnehmende Person oder owner (ADR-017 Punkt 48).';

revoke all on function app.documentation_photo_deletable(uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Die Dokumentart
-- -----------------------------------------------------------------------------
insert into public.patient_file_document_types (key, is_clinical, sort_order, note) values
  ('dokumentationsfoto', true, 44,
   'Foto, das die Praxis von der Person aufnimmt, weil es fuer die Dokumentation der Behandlung erforderlich ist - Ausgangsbefund, Wunde oder Narbe im Verlauf. Teil der Akte (Art. 9 Abs. 2 lit. h DSGVO, zehn Jahre, keine Einwilligung). Entsteht nur im Kameradialog; loeschen nur am Aufnahmetag (ADR-017 Abschnitt H).');

update public.patient_file_document_types
   set note = 'Foto-Arbeitshilfe: Foto, das die Praxis von der Person fuer Uebergabe und Vergleich aufnimmt und das die Dokumentation nicht braucht. Entsteht nur im Kameradialog, braucht die eigene Einwilligung (Zweck patient_photos) und hat eine eigene, kurze Frist (ADR-017 Punkte 35 bis 38 und 43).'
 where key = 'patientenfoto';

update public.patient_file_document_types
   set note = 'Bildgebung und Aufnahmen aus aerztlicher oder klinischer Hand: Roentgen, MRT, Ultraschall, das Wundfoto im Klinikbericht. Nie ein Foto, das die Praxis selbst von der Person macht - das ist ein Dokumentationsfoto oder eine Arbeitshilfe (ADR-017 Punkte 31 und 43).'
 where key = 'klinisches_bild';

-- Punkte 32 und 45: beide Fotoarten nur JPEG, beide an der Patient:in.
alter table public.patient_files
  drop constraint patient_files_photo_is_jpeg,
  drop constraint patient_files_photo_belongs_to_patient;

alter table public.patient_files
  add constraint patient_files_photo_is_jpeg check (
    document_type not in ('patientenfoto', 'dokumentationsfoto') or mime_type = 'image/jpeg'
  ),
  add constraint patient_files_photo_belongs_to_patient check (
    document_type not in ('patientenfoto', 'dokumentationsfoto') or treatment_basis_id is null
  );

-- Retention: Das Dokumentationsfoto faellt mit der Akte (Klasse patientenakte).
update public.retention_assignments
   set scope_note = 'Dateien der Akte einschliesslich Verordnungsscan und Dokumentationsfotos, ausser Foto-Arbeitshilfen (eigene Klasse patientenfoto). Fallen mit der Akte oder mit ihrer Verordnung (FK on delete cascade). Das Objekt folgt ueber einen Loeschauftrag mit Quittung (ADR-017 Punkte 25 und 45).'
 where table_name = 'patient_files' and class_key = 'patientenakte';

-- -----------------------------------------------------------------------------
-- Die Fotos einer Patient:in - beide Arten (Punkt 40, 45)
--
-- Neu: die Art, ein leeres Loeschdatum fuer das Dokumentationsfoto (es folgt
-- der Akte) und ob die angemeldete Person es loeschen darf. Die Sicht folgt
-- der Art je Zeile.
-- -----------------------------------------------------------------------------
drop function public.list_patient_photos(uuid);

create function public.list_patient_photos(p_patient_id uuid)
returns table (
  id uuid,
  document_type text,
  display_name text,
  taken_at timestamptz,
  taken_by_name text,
  delete_after timestamptz,
  deletable boolean,
  object_missing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not (app.can_see_patient_file_type('patientenfoto')
          or app.can_see_patient_file_type('dokumentationsfoto')) then
    perform app.record_denied_read(auth.uid(), 'patient_files.read', 'not allowed to read patient photos');
    return;
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.document_type,
           f.display_name,
           f.created_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           case when f.document_type = 'patientenfoto'
             then app.patient_photo_due_at(f.patient_id, f.created_at, f.photo_locked_at)
           end,
           app.can_write_patient_file(f.document_type, f.treatment_basis_id)
             and (f.document_type <> 'dokumentationsfoto'
                  or app.documentation_photo_deletable(f.organization_id, f.uploaded_by, f.created_at)),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket_for(f.document_type)
               and o.name = f.object_key
           )
    from public.patient_files f
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and app.is_patient_photo_type(f.document_type)
      and app.can_see_patient_file_type(f.document_type)
      and app.patient_photo_usable(f.document_type, f.patient_id, f.created_at, f.photo_locked_at)
    order by f.created_at desc, f.id;
end;
$$;

comment on function public.list_patient_photos(uuid) is
  'Fotos der Person in einer Akte - Dokumentationsfotos und Arbeitshilfen - mit Art, Loeschdatum (nur Arbeitshilfe) und Loeschrecht, ohne Vorschau und ohne Objektschluessel (ADR-017 Punkte 40, 45, 48). Gesperrte Arbeitshilfen fehlen (Punkt 36).';

revoke all on function public.list_patient_photos(uuid) from public, anon;
grant execute on function public.list_patient_photos(uuid) to authenticated;

-- Die Fotos zur Herausgabe - beide Arten, auch gesperrte Arbeitshilfen.
drop function public.list_patient_photos_for_access_request(uuid);

create function public.list_patient_photos_for_access_request(p_patient_id uuid)
returns table (
  id              uuid,
  document_type   text,
  display_name    text,
  taken_at        timestamptz,
  locked          boolean,
  object_missing  boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Dieselbe Pruefung wie die Auskunft: owner, eigene Organisation, eigene Akte.
  v_org := app.auskunft_organisation(p_patient_id);

  return query
    select f.id,
           f.document_type,
           f.display_name,
           f.created_at,
           not app.patient_photo_usable(f.document_type, f.patient_id, f.created_at, f.photo_locked_at),
           not exists (
             select 1 from storage.objects o
             where o.bucket_id = app.patient_file_bucket_for(f.document_type) and o.name = f.object_key)
    from public.patient_files f
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and app.is_patient_photo_type(f.document_type)
    order by f.created_at desc, f.id;
end;
$$;

comment on function public.list_patient_photos_for_access_request(uuid) is
  'Die Fotos einer Akte fuer die Herausgabe nach Art. 15 Abs. 3 DSGVO - Dokumentationsfotos und Arbeitshilfen, auch gesperrte, solange sie vorhanden sind (ABN-017, ABN-023). Nur owner, wie export_patient_record; nur Metadaten.';

revoke all on function public.list_patient_photos_for_access_request(uuid) from public, anon;
grant execute on function public.list_patient_photos_for_access_request(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Uebernommene Funktionen, geaendert an den markierten Stellen:
-- Vorbereitung (Einwilligung nur fuer die Arbeitshilfe), Loeschen (Punkt 48),
-- Artkorrektur und Trigger (Punkt 47), Dateiliste (ohne beide Fotoarten),
-- Auskunft und Herausgabe (beide Fotoarten, Bucket je Art).
-- -----------------------------------------------------------------------------
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_patient_file(p_file_id uuid)
 RETURNS void
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
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Loeschen folgt dem Schreibrecht am Bezugsdatensatz (Punkt 13) - und setzt
  -- voraus, dass die Person die Datei ueberhaupt sehen darf. Ohne die zweite
  -- Pruefung koennte die Verwaltung eine klinische Datei loeschen, die sie
  -- nicht kennt.
  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id)
     or not app.can_see_patient_file_type(v_datei.document_type) then
    raise exception 'not allowed to delete this file' using errcode = '42501';
  end if;

  -- Punkt 36: Ein gesperrtes Foto ist fuer niemanden erreichbar. Es faellt mit
  -- der Frist - unter Legal Hold erst, wenn er endet -, nicht von Hand.
  if v_datei.document_type = 'patientenfoto'
     and v_datei.status = 'ready'
     and not app.patient_photo_accessible(
       v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at
     ) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Punkt 48: Ein Dokumentationsfoto ist ab dem Tag nach der Aufnahme Teil
  -- der Dokumentation. Am Aufnahmetag (in der Zeitzone der Praxis) loescht
  -- die aufnehmende Person oder owner eine Fehlaufnahme; danach nur noch der
  -- Loeschlauf mit der Akte.
  if v_datei.document_type = 'dokumentationsfoto'
     and not app.documentation_photo_deletable(v_datei.organization_id, v_datei.uploaded_by, v_datei.created_at) then
    raise exception 'a documentation photo can only be deleted on the day it was taken'
      using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.deleted', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );

  delete from public.patient_files where id = p_file_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_patient_file_document_type(p_file_id uuid, p_document_type text)
 RETURNS void
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
    and f.status = 'ready'
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patient_file_document_types t where t.key = p_document_type
  ) then
    raise exception 'unknown document type %', p_document_type using errcode = '22023';
  end if;

  if not app.can_correct_patient_file_type()
     or not app.can_see_patient_file_type(v_datei.document_type)
     or not app.can_see_patient_file_type(p_document_type) then
    raise exception 'not allowed to correct this document type' using errcode = '42501';
  end if;

  -- Punkt 32: Eine Korrektur verschoebe Bucket, Klasse und
  -- Einwilligungsbindung. Ein Foto in der falschen Art wird geloescht und neu
  -- aufgenommen; eine Datei wird nie nachtraeglich zum Patientenfoto.
  -- Punkt 47: auch nicht zwischen den beiden Fotoarten.
  if app.is_patient_photo_type(v_datei.document_type) or app.is_patient_photo_type(p_document_type) then
    raise exception 'the document type of a photo cannot be corrected' using errcode = '22023';
  end if;

  -- Der Verordnungsscan haengt an einer Behandlungsgrundlage (Punkt 10);
  -- umgekehrt darf eine Datei an einer Grundlage nicht zu etwas werden, das dort nichts
  -- verloren hat. Die Check-Constraint faengt nur die eine Richtung.
  if p_document_type = 'verordnungsscan' and v_datei.treatment_basis_id is null then
    raise exception 'a prescription scan needs a treatment basis' using errcode = '22023';
  end if;

  if p_document_type = v_datei.document_type then
    return;
  end if;

  update public.patient_files
     set document_type = p_document_type
   where id = p_file_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.type_corrected', 'patient_file', p_file_id,
    'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type_before', v_datei.document_type,
      'document_type', p_document_type
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_patient_photo_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.document_type is distinct from old.document_type
     and (app.is_patient_photo_type(old.document_type) or app.is_patient_photo_type(new.document_type)) then
    raise exception 'the document type of a photo cannot be corrected' using errcode = '22023';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_patient_files(p_patient_id uuid, p_treatment_basis_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, treatment_basis_id uuid, document_type text, is_clinical boolean, display_name text, mime_type text, byte_size bigint, uploaded_at timestamp with time zone, uploaded_by_name text, object_missing boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- G6b: Die Rollenpruefung steht vor der Akte, denn app.patient_file_organization
  -- prueft das Leserecht auf das Verzeichnis mit und wiese sonst mit Ausnahme ab.
  if not app.can_read_patient_files() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_files.read', 'not allowed to read patient files');
    return;
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.treatment_basis_id,
           f.document_type,
           t.is_clinical,
           f.display_name,
           f.mime_type,
           f.byte_size,
           f.confirmed_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket_for(f.document_type)
               and o.name = f.object_key
           )
    from public.patient_files f
    join public.patient_file_document_types t on t.key = f.document_type
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and not app.is_patient_photo_type(f.document_type)
      and (p_treatment_basis_id is null or f.treatment_basis_id = p_treatment_basis_id)
      and app.can_see_patient_file_type(f.document_type)
    order by f.confirmed_at desc, f.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'fax', k.fax,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'take_along_items', v.take_along_items,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'fee_waived_at', t.fee_waived_at,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at,
        'photo_locked_at', da.photo_locked_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Die Fotos gehoeren zur vollstaendigen Kopie, auch
    -- gesperrte, solange sie vorhanden sind. Die Datei selbst gibt owner je
    -- Foto heraus (hand_out_patient_photo, protokolliert); dieser Abschnitt
    -- ist die Liste dazu.
    'patient_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fo.id,
        'display_name', fo.display_name,
        'art', fo.document_type,
        'aufgenommen_am', fo.created_at,
        'gesperrt', not app.patient_photo_usable(fo.document_type, fo.patient_id, fo.created_at, fo.photo_locked_at),
        'datei_vorhanden', exists (
          select 1 from storage.objects o
          where o.bucket_id = app.patient_file_bucket_for(fo.document_type) and o.name = fo.object_key)
      ) order by fo.created_at)
      from public.patient_files fo
      where fo.patient_id = p_patient_id
        and app.is_patient_photo_type(fo.document_type)
        and fo.status = 'ready'
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Datum und Zweck der Zugriffe aus dem Auditlog -
    -- ohne Namen und ohne Kennung der Beschaeftigten (Art. 15 Abs. 4 DSGVO);
    -- eine begruendete Ausnahme prueft owner im Einzelfall (ANN-092).
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zeitpunkt', al.occurred_at,
        'aktion', al.action,
        'gegenstand', al.subject_type,
        'ergebnis', al.outcome,
        'durch', case al.actor_kind
                   when 'user' then 'praxis'
                   when 'system' then 'system'
                   when 'platform' then 'person_selbst'
                   when 'representative' then 'vertretung'
                 end
      ) order by al.occurred_at)
      from public.audit_log al
      where al.organization_id = v_org
        -- Auch die Zugriffe auf zusammengefuehrte Doppelanlagen gehoeren
        -- zu dieser Person (ABN-018, BEF-108).
        and ((al.subject_type = 'patient' and al.subject_id = any(array(
                select p_patient_id
                union all
                select mr2.source_patient_id from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
             or al.context ->> 'patient_id' = any(array(
                select p_patient_id::text
                union all
                select mr2.source_patient_id::text from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
    ), '[]'::jsonb),

    -- ABN-018 (BEF-108): Nachweise des Zusammenfuehrens an dieser Akte.
    'patient_merge_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'merged_at', mr.merged_at,
        'source_patient_id', mr.source_patient_id,
        'counts', mr.counts
      ) order by mr.merged_at)
      from public.patient_merge_records mr
      where mr.target_patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at,
        -- ABN-013 (BEF-102): Ein entferntes Ereignis bleibt Teil der Akte.
        'removed_at', ce.removed_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-015: gesicherte, noch nicht uebernommene Befundangaben.
    'treatment_draft_findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', df.appointment_id,
        'findings', df.findings,
        'updated_at', df.updated_at
      ) order by df.updated_at)
      from public.treatment_draft_findings df
      join public.appointments a on a.id = df.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien und Fotos',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme und jedes Foto, auch gesperrte; die Datei selbst wird je Datei herausgegeben (ADR-017, ANN-128).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION public.hand_out_patient_photo(p_file_id uuid)
 RETURNS TABLE(bucket_id text, object_key text, display_name text)
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

  -- Die Rolle vor der Datei: Wer nicht herausgeben darf, erfaehrt auch nicht,
  -- ob eine Kennung ein Foto ist.
  if not app.has_any_role('owner') then
    raise exception 'data subject access denied' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and app.is_patient_photo_type(f.document_type)
    and f.status = 'ready';

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Dieselbe Pruefung wie die Auskunft: owner, eigene Organisation, eigene
  -- Akte. Wirft sonst - wie export_patient_record.
  perform app.auskunft_organisation(v_datei.patient_id);

  -- ABN-017 (BEF-107): Ein gesperrtes, noch vorhandenes Foto ist nicht
  -- pauschal von der Kopie ausgeschlossen. Die Sperre gilt der Arbeit mit
  -- dem Foto, nicht der Auskunft an die Person selbst; das Protokoll sagt,
  -- ob es gesperrt war.

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.handed_out', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type,
      'gesperrt', not app.patient_photo_usable(
        v_datei.document_type, v_datei.patient_id, v_datei.created_at, v_datei.photo_locked_at)
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
    select app.patient_file_bucket_for(v_datei.document_type), v_datei.object_key, v_datei.display_name;
end;
$function$

;

