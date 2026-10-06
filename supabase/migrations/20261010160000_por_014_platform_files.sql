-- =============================================================================
-- POR-014: Freigegebene Dokumente (DSN-001 D3; ADR-017 Punkte 15, 20, 21, 37,
-- 54, 55; ADR-023 Punkte 19, 22, 24; ADR-010 Fassung 3)
--
-- Ein Dokument der Akte erscheint auf der Plattform nur, wenn eine
-- Behandlungsrolle es EINZELN freigegeben hat (D3) - owner, therapist,
-- team_lead, dieselben Rollen, die klinische Dateien ablegen (ADR-017 Punkt
-- 13). Nichts ist voreingestellt sichtbar; die Freigabe laesst sich jederzeit
-- zuruecknehmen. Fotos (Arbeitshilfe, Dokumentationsfoto) sind nie
-- freigebbar (Punkt 37; ANN-246).
--
-- Nachweis der Freigabe am Datensatz (released_at, released_by; ADR-010
-- Fassung 3). Der Abruf durch die Person steht im Protokoll als
-- `patient_file.downloaded` (ADR-023 Punkt 24 "jeder Dokumentabruf", ADR-010
-- Punkt 16) mit Akteur Plattformkonto bzw. Vertretung - ob Bild oder PDF:
-- Fuer die Person ist jeder Abruf eine Herausgabe aus der Akte.
--
-- Der Lesepfad der Ablage bleibt zweistufig (ADR-017 Punkte 15, 20, 21;
-- ANN-052): Die Funktion legt eine einmalige Freigabe fuer genau eine Datei
-- an, die Storage-API verbraucht sie. `app.may_read_patient_file_object`
-- bekommt dafuer einen Plattform-Zweig; der Praxispfad bleibt unveraendert.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Freigabe am Datensatz
-- -----------------------------------------------------------------------------
alter table public.patient_files
  add column released_at timestamptz,
  add column released_by uuid,
  add constraint patient_files_release_stamp check ((released_at is null) = (released_by is null)),
  -- Fotos nie (ADR-017 Punkt 37, ANN-246).
  add constraint patient_files_release_not_photo check (
    released_at is null or document_type not in ('patientenfoto', 'dokumentationsfoto')
  );

comment on column public.patient_files.released_at is
  'POR-014 (DSN-001 D3, ANN-246): seit wann die Datei fuer die Person auf der Plattform sichtbar ist; null = nicht freigegeben.';
comment on column public.patient_files.released_by is
  'POR-014: wer die Datei freigegeben hat (owner, therapist, team_lead).';

create index patient_files_released_idx on public.patient_files (patient_id)
  where released_at is not null;

-- -----------------------------------------------------------------------------
-- 2. Freigeben und zuruecknehmen (Praxis)
-- -----------------------------------------------------------------------------
create function public.set_patient_file_release(p_file_id uuid, p_released boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- ANN-246: die Behandlungsrollen, die klinische Dateien ablegen (Punkt 13).
  if not app.can_write_clinical_patient_files() then
    raise exception 'not allowed to release files' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  select f.id, f.document_type, f.released_at into v_datei
  from public.patient_files f
  where f.id = p_file_id and f.organization_id = v_org and f.status = 'ready'
  for update;
  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;
  if app.is_patient_photo_type(v_datei.document_type) then
    raise exception 'photos cannot be released' using errcode = '22023';
  end if;

  if coalesce(p_released, false) then
    update public.patient_files
       set released_at = coalesce(released_at, now()),
           released_by = coalesce(released_by, v_actor)
     where id = p_file_id;
    return true;
  else
    update public.patient_files
       set released_at = null, released_by = null
     where id = p_file_id;
    return false;
  end if;
end;
$$;

revoke all on function public.set_patient_file_release(uuid, boolean) from public, anon;
grant execute on function public.set_patient_file_release(uuid, boolean) to authenticated;

comment on function public.set_patient_file_release(uuid, boolean) is
  'POR-014 (DSN-001 D3, ANN-246): eine Datei der Akte fuer die Person auf der Plattform freigeben oder die Freigabe zuruecknehmen. owner, therapist, team_lead; nie Fotos. Nachweis am Datensatz.';

-- -----------------------------------------------------------------------------
-- 3. Die Praxis sieht die Freigabe in der Dateiliste. Rumpf sonst unveraendert
--    aus 20261004101000_abn_024_patient_file_verification.sql.
-- -----------------------------------------------------------------------------
drop function public.list_patient_files(uuid, uuid);

CREATE OR REPLACE FUNCTION public.list_patient_files(p_patient_id uuid, p_treatment_basis_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, treatment_basis_id uuid, document_type text, is_clinical boolean, display_name text, mime_type text, byte_size bigint, uploaded_at timestamp with time zone, uploaded_by_name text, object_missing boolean, verified_at timestamp with time zone, released_at timestamp with time zone)
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
           ),
           f.verified_at,
           f.released_at
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
$function$;

comment on function public.list_patient_files(uuid, uuid) is
  'Dateien einer Akte oder Grundlage (DAT-001), seit POR-014 mit released_at: fuer die Person auf der Plattform freigegeben (DSN-001 D3).';

revoke all on function public.list_patient_files(uuid, uuid) from public, anon;
grant execute on function public.list_patient_files(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Plattform: die freigegebenen Dokumente lesen
-- -----------------------------------------------------------------------------
create function public.platform_files(p_access_id uuid)
returns table (
  id            uuid,
  document_type text,
  display_name  text,
  mime_type     text,
  byte_size     bigint,
  released_at   timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  if v_zugang.relationship_kind <> 'treatment' then
    return;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'files')
  );

  return query
  select f.id, f.document_type, f.display_name, f.mime_type, f.byte_size, f.released_at
  from public.patient_files f
  where f.patient_id = v_zugang.relationship_id
    and f.organization_id = v_zugang.organization_id
    and f.status = 'ready'
    and f.released_at is not null
    and not app.is_patient_photo_type(f.document_type)
  order by f.released_at desc, f.id;
end;
$$;

revoke all on function public.platform_files(uuid) from public, anon;
grant execute on function public.platform_files(uuid) to authenticated;

comment on function public.platform_files(uuid) is
  'POR-014: Plattformprojektion "Dokumente" (DSN-001 D3): die einzeln freigegebenen Dateien der Akte, nie Fotos. Nur Behandlungszugang; Vertretung protokolliert (ADR-023 Punkt 24).';

-- -----------------------------------------------------------------------------
-- 5. Plattform: ein Dokument abrufen
-- -----------------------------------------------------------------------------
create function public.issue_platform_file_link(p_access_id uuid, p_file_id uuid)
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

  -- Jeder Abruf durch die Person ist eine Herausgabe aus der Akte und steht
  -- im Protokoll (ADR-023 Punkt 24, ADR-010 Punkt 16: patient_file.downloaded).
  insert into public.audit_log (
    organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, auth.uid(),
    case when v_zugang.access_kind = 'self' then 'platform' else 'representative' end,
    'patient_file.downloaded', 'patient_file', p_file_id, 'success',
    jsonb_build_object('surface', 'platform', 'patient_id', v_datei.patient_id,
                       'document_type', v_datei.document_type,
                       'platform_access_id', v_zugang.id, 'access_kind', v_zugang.access_kind)
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
  'POR-014: die einmalige Freigabe fuer genau einen Verweis auf ein freigegebenes Dokument (ADR-017 Punkte 15, 20, 21), protokolliert als patient_file.downloaded mit Akteur Plattformkonto bzw. Vertretung (ADR-023 Punkt 24). Nur Behandlungszugang, nie Fotos.';

-- -----------------------------------------------------------------------------
-- 6. Lesepfad der Ablage mit Plattform-Zweig. Rumpf fuer die Praxis
--    unveraendert aus 20261004102000_abn_027_open_means_display.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.may_read_patient_file_object(p_bucket text, p_object_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_grant uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    return false;
  end if;
  v_org := app.current_organization_id();

  -- POR-014: Ein Plattformkonto hat keine Organisation. Es liest genau die
  -- Datei, fuer die issue_platform_file_link eine Freigabe angelegt hat -
  -- freigegeben, kein Foto, an einem lesbaren Behandlungszugang des Kontos.
  -- Dieselbe zweite Linie wie fuer die Praxis (ADR-023 Punkt 19).
  if v_org is null then
    select g.id into v_grant
    from public.patient_file_access_grants g
    join public.patient_files f on f.id = g.patient_file_id
    where f.object_key = p_object_key
      and app.patient_file_bucket_for(f.document_type) = p_bucket
      and f.status = 'ready'
      and f.released_at is not null
      and not app.is_patient_photo_type(f.document_type)
      and g.organization_id = f.organization_id
      and g.user_id = v_actor
      and g.expires_at > now()
      and exists (
        select 1 from public.platform_accesses a
        where a.account_user_id = v_actor
          and a.relationship_kind = 'treatment'
          and a.relationship_id = f.patient_id
          and a.organization_id = f.organization_id
          and exists (select 1 from app.platform_readable_access(a.id))
      )
    order by g.created_at
    limit 1
    for update of g skip locked;

    if v_grant is null then
      return false;
    end if;
    delete from public.patient_file_access_grants where id = v_grant;
    return true;
  end if;

  select g.id into v_grant
  from public.patient_file_access_grants g
  join public.patient_files f on f.id = g.patient_file_id
  where f.object_key = p_object_key
    and app.patient_file_bucket_for(f.document_type) = p_bucket
    and f.organization_id = v_org
    and f.status = 'ready'
    and g.organization_id = v_org
    and g.user_id = v_actor
    and g.expires_at > now()
    and app.can_see_patient_file_type(f.document_type)
    and (
      f.document_type <> 'patientenfoto'
      or app.patient_photo_accessible(f.patient_id, f.created_at, f.photo_locked_at)
    )
  order by g.created_at
  limit 1
  for update of g skip locked;

  if v_grant is null then
    return false;
  end if;

  delete from public.patient_file_access_grants where id = v_grant;
  return true;
end;
$function$;
