-- =============================================================================
-- Fotos von Patient:innen (DOK-006b, ADR-017 Abschnitt G, Fassung 2)
--
-- Setzt die Punkte 32 und 35 bis 38 um. Ein Patientenfoto ist eine Datei wie
-- jede andere - dieselbe Tabelle, dieselben zwei Phasen mit Bestaetigung,
-- dieselben kurzlebigen Verweise, dieselben drei Auditereignisse, dieselbe
-- zweistufige Loeschung und derselbe Abgleich (Punkte 6 bis 27) - mit genau
-- drei Abweichungen (Punkt 32):
--
--   * KEINE ARTKORREKTUR, weder hin noch weg. Eine Korrektur verschoebe
--     Bucket, Klasse und Einwilligungsbindung; ein Foto in der falschen Art
--     wird geloescht und neu aufgenommen.
--   * ANZEIGE OHNE DOWNLOADNAMEN (Punkte 15 und 40). Das setzt der Client um;
--     die Datenbank sieht die Signatur nicht. Die Liste der Akte fuehrt Fotos
--     deshalb gar nicht - sie haben ihre eigene (list_patient_photos), und
--     die Dateiliste bietet sie nicht zum Oeffnen im neuen Fenster an.
--   * KLASSE NACH DER ART, nicht nach dem Bezugsdatensatz (Punkte 23 und 38).
--
-- DIE EINWILLIGUNG PRUEFT EINE FUNKTION (Punkt 36): app.patient_photo_accessible.
-- Vorbereitung, Bestaetigung, Liste und Verweis fragen sie - und die
-- Leseregel am Objekt dazu. Neue Fotos verlangen, dass die juengste Zeile des
-- Zwecks eine Erteilung ist. Ein vorhandenes Foto ist gesperrt und faellig,
-- sobald nach seiner Aufnahme ein Widerruf vermerkt ist, zwoelf Monate nach
-- der Aufnahme oder drei Monate nach dem festgehaltenen Abschluss der
-- Versorgung - zum fruehesten der drei Zeitpunkte (Punkt 38).
--
-- DER WIDERRUF SPERRT SOFORT und loescht in derselben Transaktion wie der
-- Vermerk: Zeilen weg, Loeschauftraege fuer die Objekte (per Trigger),
-- Loeschjournal (Punkt 36, ADR-008 Punkt 8). Ein Legal Hold haelt die
-- Loeschung an, nicht die Sperre; endet er, loescht release_legal_hold.
-- Faellige Fotos ohne Widerruf loescht der Loeschlauf (apply_retention).
--
-- NEU IM MODELL DER EINWILLIGUNGEN (ANN-093, ANN-127):
--   * Zweck 'patient_photos'.
--   * Vermerkart 'consent_refused' - eine Ablehnung ist kein Widerruf
--     (Punkt 35). Die Erstaufnahme fuehrt "abgelehnt" als erledigten Stand.
--
-- NEU IM RETENTION SCHEDULE (ANN-126): Klasse 'patientenfoto' mit einer
-- optionalen Obergrenze - einem zweiten Anker mit eigenem Intervall -, damit
-- beide Zahlen in der Klassenzeile stehen und keine im Code (ANN-001).
-- Anker der Obergrenze ist care_concluded_at, nicht care_concluded_on: Der Tag
-- darf zurueckdatiert werden (ANN-032), und ein um vier Monate
-- zurueckdatierter Abschluss machte sonst jedes Foto sofort faellig.
--
-- BEWUSST NICHT ENTHALTEN: Videos und Audio, Fotos im Trainingsverhaeltnis,
-- Uploads durch Patient:innen, eine Verlaengerung der Frist, eine Galerie
-- (Punkt 42, Punkt 38). Die Herausgabe an die Person kommt mit DOK-006d.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Der Bucket (Punkt 32: eigener privater Bucket, enger als Punkt 18)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patientenfotos', 'patientenfotos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create function app.patient_photo_bucket()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'patientenfotos'::text
$$;

comment on function app.patient_photo_bucket() is
  'Name des privaten Buckets fuer Patientenfotos (ADR-017 Punkt 32). Die einzige Stelle, an der er steht.';

create function app.patient_file_bucket_for(p_document_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_document_type = 'patientenfoto' then app.patient_photo_bucket()
    else app.patient_file_bucket()
  end
$$;

comment on function app.patient_file_bucket_for(text) is
  'Der Bucket einer Dokumentart: patientenfoto im eigenen, alle anderen in patientenakte (ADR-017 Punkt 3 und 32). Jede Stelle, die ein Objekt sucht, fragt hier.';

grant execute on function app.patient_photo_bucket() to authenticated;
grant execute on function app.patient_file_bucket_for(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Die Dokumentart
-- -----------------------------------------------------------------------------
insert into public.patient_file_document_types (key, is_clinical, sort_order, note) values
  ('patientenfoto', true, 45,
   'Foto, das die Praxis von der Person aufnimmt - Koerperregion, Haltung, Schwellung, Narbe. Entsteht nur im Kameradialog der Anwendung, braucht die eigene Einwilligung (Zweck patient_photos) und hat eine eigene, kurze Frist (ADR-017 Abschnitt G).');

update public.patient_file_document_types
   set note = 'Bildgebung und Aufnahmen aus aerztlicher oder klinischer Hand: Roentgen, MRT, Ultraschall, das Wundfoto im Klinikbericht. Nie ein Foto, das die Praxis selbst von der Person macht - das ist ein patientenfoto (ADR-017 Punkt 31).'
 where key = 'klinisches_bild';

-- Punkt 32: nur JPEG, und der Bezug ist die Patient:in - nicht Verordnung,
-- Termin oder Eintrag. Ein finalisierter Eintrag darf nicht auf etwas zeigen,
-- das nach einem Jahr fehlt.
alter table public.patient_files
  add constraint patient_files_photo_is_jpeg check (
    document_type <> 'patientenfoto' or mime_type = 'image/jpeg'
  ),
  add constraint patient_files_photo_belongs_to_patient check (
    document_type <> 'patientenfoto' or treatment_basis_id is null
  );

-- Punkt 32: Die Art patientenfoto wird nicht korrigiert. Die Funktion
-- set_patient_file_document_type weist es ab; der Trigger haelt es auch fuer
-- jeden Weg, den es heute nicht gibt.
create function app.guard_patient_photo_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document_type is distinct from old.document_type
     and 'patientenfoto' in (old.document_type, new.document_type) then
    raise exception 'the document type patientenfoto cannot be corrected' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger patient_files_photo_type_fixed
  before update of document_type on public.patient_files
  for each row execute function app.guard_patient_photo_type();

-- -----------------------------------------------------------------------------
-- Einwilligung: Zweck und Ablehnung (Punkt 35, ANN-093, ANN-127)
-- -----------------------------------------------------------------------------
alter table public.patient_privacy_records
  drop constraint patient_privacy_records_purpose_check,
  drop constraint patient_privacy_records_record_kind_check,
  drop constraint patient_privacy_records_purpose_shape;

alter table public.patient_privacy_records
  add constraint patient_privacy_records_purpose_check check (
    purpose in ('email_contact', 'prescriber_report', 'patient_photos')
  ),
  add constraint patient_privacy_records_record_kind_check check (
    record_kind in (
      'privacy_notice_handed_out', 'treatment_contract_signed',
      'consent_granted', 'consent_withdrawn', 'consent_refused'
    )
  ),
  add constraint patient_privacy_records_purpose_shape check (
    (record_kind in ('consent_granted', 'consent_withdrawn', 'consent_refused'))
      = (purpose is not null)
  );

-- -----------------------------------------------------------------------------
-- Retention Schedule: Klasse patientenfoto mit Obergrenze (Punkt 38, ANN-126)
-- -----------------------------------------------------------------------------
alter table public.retention_classes
  add column upper_bound_anchor text,
  add column upper_bound_interval interval,
  add constraint retention_classes_upper_bound_anchor_check check (
    upper_bound_anchor is null or upper_bound_anchor in ('care_concluded_recorded')
  ),
  add constraint retention_classes_upper_bound_complete check (
    (upper_bound_anchor is null) = (upper_bound_interval is null)
  );

comment on column public.retention_classes.upper_bound_anchor is
  'Optionaler zweiter Anker: Faellig ist der Datensatz zum fruehesten von Frist und Obergrenze. care_concluded_recorded ist patients.care_concluded_at - der Zeitpunkt, zu dem die Praxis den Abschluss festhaelt, nicht der ruecknehmbare Tag (ADR-017 Punkt 38).';

insert into public.retention_classes (
  key, basis, legal_reference, anchor, retention_interval,
  upper_bound_anchor, upper_bound_interval, assumption_key, note, sort_order
) values (
  'patientenfoto', 'intern', 'Art. 9 Abs. 2 lit. a DSGVO', 'event_time', interval '12 months',
  'care_concluded_recorded', interval '3 months', 'ANN-126',
  'Fotos, die die Praxis von der Person aufnimmt: zwoelf Monate nach der Aufnahme, spaetestens drei Monate nach dem festgehaltenen Abschluss der Versorgung, sofort beim Widerruf der Einwilligung. Arbeitshilfe neben der Akte, nicht Teil von ihr - was wesentlich ist, steht im Eintrag (ADR-017 Punkt 35 und 38). Ein Legal Hold haelt die Loeschung an.',
  12
);

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('patient_files', 'patientenfoto', 'automatisch',
   'Nur Zeilen der Art patientenfoto: eigene Regel im Loeschlauf und beim Widerruf der Einwilligung, mit Eintrag im Loeschjournal. Das Objekt folgt ueber den Loeschauftrag (ADR-017 Punkt 36 und 38).', 36);

update public.retention_assignments
   set scope_note = 'Dateien der Akte einschliesslich Verordnungsscan, ausser Patientenfotos (eigene Klasse). Fallen mit der Akte oder mit ihrer Verordnung (FK on delete cascade). Das Objekt folgt ueber einen Loeschauftrag mit Quittung (ADR-017 Punkt 25).'
 where table_name = 'patient_files' and class_key = 'patientenakte';

create function app.retention_upper_interval(p_class text)
returns interval
language sql
stable
set search_path = ''
as $$
  select rc.upper_bound_interval from public.retention_classes rc where rc.key = p_class
$$;

comment on function app.retention_upper_interval(text) is
  'Obergrenze einer Datenklasse aus dem Retention Schedule, leer ohne Obergrenze (ADR-017 Punkt 38, ANN-001).';

-- -----------------------------------------------------------------------------
-- Die eine Pruefung (Punkt 36)
-- -----------------------------------------------------------------------------

-- Ist die juengste Zeile des Zwecks eine Erteilung? Dieselbe Reihenfolge wie
-- record_patient_privacy_entry: nach Eingabe, nicht nach dem Tag auf Papier.
create function app.patient_photo_consent_granted(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.record_kind = 'consent_granted'
    from public.patient_privacy_records r
    where r.patient_id = p_patient_id
      and r.purpose = 'patient_photos'
    order by r.recorded_at desc, r.id desc
    limit 1
  ), false)
$$;

-- Wann ein Foto faellig ist: zum fruehesten von Aufnahme plus Frist,
-- festgehaltenem Abschluss plus Obergrenze und dem ersten Widerruf nach der
-- Aufnahme. least() uebergeht leere Werte - ohne Abschluss und ohne Widerruf
-- bleibt die Frist ab Aufnahme.
create function app.patient_photo_due_at(p_patient_id uuid, p_taken_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    p_taken_at + app.retention_interval('patientenfoto'),
    (
      select p.care_concluded_at + app.retention_upper_interval('patientenfoto')
      from public.patients p
      where p.id = p_patient_id
    ),
    (
      select min(r.recorded_at)
      from public.patient_privacy_records r
      where r.patient_id = p_patient_id
        and r.purpose = 'patient_photos'
        and r.record_kind = 'consent_withdrawn'
        and r.recorded_at > p_taken_at
    )
  )
$$;

comment on function app.patient_photo_due_at(uuid, timestamptz) is
  'Faelligkeit eines Patientenfotos (ADR-017 Punkt 38): frueheste von Aufnahme plus zwoelf Monate, care_concluded_at plus drei Monate, Widerruf nach der Aufnahme. Das Datum, das jedes Foto als Loeschdatum zeigt.';

-- DIE Pruefung. Ohne Aufnahmezeitpunkt: darf ein neues Foto entstehen? Mit
-- Aufnahmezeitpunkt: ist das vorhandene Foto noch nutzbar - nicht widerrufen,
-- nicht abgelaufen? Ein faelliges Foto unter Legal Hold bleibt gesperrt.
create function app.patient_photo_accessible(p_patient_id uuid, p_taken_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_taken_at is null then app.patient_photo_consent_granted(p_patient_id)
    else coalesce(app.patient_photo_due_at(p_patient_id, p_taken_at) > now(), false)
  end
$$;

comment on function app.patient_photo_accessible(uuid, timestamptz) is
  'Die eine Einwilligungspruefung fuer Patientenfotos (ADR-017 Punkt 36). Ohne Zeitpunkt: neue Aufnahme erlaubt (juengster Vermerk ist eine Erteilung). Mit Zeitpunkt: vorhandenes Foto nutzbar (weder widerrufen noch faellig). Gefragt von Vorbereitung, Bestaetigung, Liste, Verweis und der Leseregel am Objekt.';

-- Kein Recht fuer angemeldete Konten: Die Funktionen pruefen keine
-- Organisation und verrieten sonst jedem Konto, das eine Kennung kennt, den
-- Einwilligungsstand einer Patient:in. Gefragt werden sie nur aus
-- SECURITY-DEFINER-Funktionen, auch von den Regeln am Objekt.
revoke all on function app.patient_photo_consent_granted(uuid) from public, anon, authenticated;
revoke all on function app.patient_photo_due_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.patient_photo_accessible(uuid, timestamptz) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Faellige Fotos loeschen - ein Weg fuer Widerruf, Ende des Legal Hold und
-- Loeschlauf
--
-- Die Zeile faellt, der Trigger schreibt den Loeschauftrag fuer das Objekt, das
-- Loeschjournal den Nachweis, der nach einer Wiederherstellung erneut
-- angewendet wird (Punkt 36, ADR-008 Punkt 8). Ein Legal Hold haelt an
-- (Punkt 36, ANN-033). Mit handelnder Person entsteht je Foto ein
-- patient_file.deleted mit dem Anlass; der Loeschlauf fasst im eigenen
-- Eintrag zusammen (retention.applied).
--
-- Kein Recht fuer angemeldete Konten: Die Funktion prueft keine Rolle - sie
-- gehoert den drei Vorgaengen, die sie aufrufen.
-- -----------------------------------------------------------------------------
create function app.delete_due_patient_photos(
  p_organization_id uuid,
  p_patient_id      uuid,
  p_run_id          uuid,
  p_actor           uuid,
  p_reason          text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  -- Ein Befehl mit datenveraendernden Teilausdruecken: Auswahl, Auditeintrag,
  -- Loeschen und Journal sehen dieselbe Menge. Der Trigger an patient_files
  -- schreibt je Zeile den Loeschauftrag fuer das Objekt.
  with kandidaten as (
    select f.id, f.patient_id, app.patient_photo_due_at(f.patient_id, f.confirmed_at) as due_at
    from public.patient_files f
    where f.organization_id = p_organization_id
      and f.document_type = 'patientenfoto'
      and f.status = 'ready'
      and (p_patient_id is null or f.patient_id = p_patient_id)
      and not app.under_legal_hold(p_organization_id, 'patient', f.patient_id)
    for update of f skip locked
  ),
  faellig as (
    select k.id, k.patient_id, k.due_at from kandidaten k where k.due_at <= now()
  ),
  protokoll as (
    insert into public.audit_log (
      organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
    )
    select p_organization_id, p_actor, 'patient_file.deleted', 'patient_file', x.id, 'success',
           jsonb_build_object(
             'surface', 'web',
             'patient_id', x.patient_id,
             'document_type', 'patientenfoto',
             'reason', p_reason
           )
    from faellig x
    where p_actor is not null
    returning 1
  ),
  geloescht as (
    delete from public.patient_files f
    using faellig x
    where f.id = x.id
    returning f.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_organization_id, p_run_id, 'patient_files', g.id, 'patientenfoto', x.due_at
  from geloescht g
  join faellig x on x.id = g.id;
  get diagnostics v_anzahl = row_count;

  return v_anzahl;
end;
$$;

comment on function app.delete_due_patient_photos(uuid, uuid, uuid, uuid, text) is
  'Loescht faellige Patientenfotos einer Organisation (optional einer Patient:in) ausser unter Legal Hold, mit Loeschjournal und - bei handelnder Person - Auditeintrag je Foto (ADR-017 Punkt 36 und 38). Nur fuer record_patient_privacy_entry, release_legal_hold und apply_retention.';

revoke all on function app.delete_due_patient_photos(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Der Trigger, der keinen Loeschweg auslaesst - jetzt mit dem Bucket der Art
-- -----------------------------------------------------------------------------
create or replace function app.order_patient_file_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text := app.patient_file_bucket_for(old.document_type);
begin
  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = v_bucket
      and o.name = old.object_key
  ) then
    insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
    values (old.organization_id, v_bucket, old.object_key)
    on conflict do nothing;
  end if;

  return old;
end;
$$;

-- -----------------------------------------------------------------------------
-- Regeln am Objekt: Bucket und Art muessen zusammenpassen
--
-- Neu mit zwei Argumenten: Ein Objekt im Bucket der Akte darf nicht zu einer
-- Fotozeile gehoeren und umgekehrt - sonst laege ein Foto mit zehn Jahren
-- Frist im falschen Bucket.
-- -----------------------------------------------------------------------------
create function app.may_upload_patient_file_object(p_bucket text, p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_files f
    where f.object_key = p_object_key
      and f.status = 'pending'
      and app.patient_file_bucket_for(f.document_type) = p_bucket
      and f.organization_id = app.current_organization_id()
      and app.can_write_patient_file(f.document_type, f.treatment_basis_id)
      and (
        f.document_type <> 'patientenfoto'
        or app.patient_photo_accessible(f.patient_id, null)
      )
  )
$$;

create function app.may_read_patient_file_object(p_bucket text, p_object_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_grant uuid;
begin
  v_actor := auth.uid();
  v_org := app.current_organization_id();
  if v_actor is null or v_org is null then
    return false;
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
      or app.patient_photo_accessible(f.patient_id, f.confirmed_at)
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
$$;

grant execute on function app.may_upload_patient_file_object(text, text) to authenticated;
grant execute on function app.may_read_patient_file_object(text, text) to authenticated;

drop policy patient_files_objects_insert on storage.objects;
drop policy patient_files_objects_select on storage.objects;
drop policy patient_files_objects_delete on storage.objects;
drop policy patient_files_objects_select_for_deletion on storage.objects;

create policy patient_files_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket())
    and app.may_upload_patient_file_object(bucket_id, name)
  );

create policy patient_files_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket())
    and app.may_read_patient_file_object(bucket_id, name)
  );

create policy patient_files_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket())
    and app.may_delete_storage_object(bucket_id, name)
  );

create policy patient_files_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket())
    and app.may_read_storage_object_for_deletion(bucket_id, name)
  );

drop function app.may_upload_patient_file_object(text);
drop function app.may_read_patient_file_object(text);

-- -----------------------------------------------------------------------------
-- (a) Vorbereiten
-- -----------------------------------------------------------------------------
create or replace function public.prepare_patient_file_upload(
  p_patient_id uuid,
  p_treatment_basis_id uuid,
  p_document_type text,
  p_display_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_checksum_sha256 text
)
returns table (file_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Patientenfoto (ADR-017 Punkt 32 und 36): nur an der Patient:in, nur JPEG,
  -- nur mit Einwilligung. Geprueft vor jedem Byte.
  if p_document_type = 'patientenfoto' then
    if p_treatment_basis_id is not null then
      raise exception 'a patient photo belongs to the patient' using errcode = '22023';
    end if;
    if p_mime_type is distinct from 'image/jpeg' then
      raise exception 'unsupported media type' using errcode = '22023';
    end if;
    if not app.patient_photo_accessible(p_patient_id, null) then
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
$$;

-- -----------------------------------------------------------------------------
-- (c) Bestaetigen
-- -----------------------------------------------------------------------------
create or replace function public.confirm_patient_file_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
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
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to confirm this file' using errcode = '42501';
  end if;

  if v_datei.status <> 'pending' then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  -- Punkt 36: Ein Widerruf zwischen Vorbereitung und Bestaetigung laesst das
  -- Foto nicht mehr sichtbar werden.
  if v_datei.document_type = 'patientenfoto'
     and not app.patient_photo_accessible(v_datei.patient_id, null) then
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

  update public.patient_files
     set status = 'ready',
         confirmed_at = now()
   where id = p_file_id;

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
$$;

-- -----------------------------------------------------------------------------
-- Die Dateiliste der Akte - ohne Patientenfotos
--
-- Fotos haben ihre eigene Liste mit Loeschdatum und ihren eigenen Anzeigeweg
-- ohne Download (Punkt 40). In dieser Liste stuenden sie neben "Oeffnen", und
-- das oeffnet einen Verweis mit Downloadnamen in einem neuen Fenster.
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_files(
  p_patient_id uuid,
  p_treatment_basis_id uuid default null
)
returns table (
  id uuid,
  treatment_basis_id uuid,
  document_type text,
  is_clinical boolean,
  display_name text,
  mime_type text,
  byte_size bigint,
  uploaded_at timestamptz,
  uploaded_by_name text,
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
      and f.document_type <> 'patientenfoto'
      and (p_treatment_basis_id is null or f.treatment_basis_id = p_treatment_basis_id)
      and app.can_see_patient_file_type(f.document_type)
    order by f.confirmed_at desc, f.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Die Fotos einer Patient:in (Punkt 40)
--
-- Datum, Anzeigename, aufnehmende Person und Loeschdatum - keine Vorschau, kein
-- Verweis auf Vorrat (Punkt 15). Gesperrte Fotos (widerrufen, faellig, auch
-- unter Legal Hold) erscheinen nicht. Kein eigenes Auditereignis: Das Oeffnen
-- der Akte ist auditiert, jedes Foto wird es beim Oeffnen (Punkte 20 bis 22).
-- -----------------------------------------------------------------------------
create function public.list_patient_photos(p_patient_id uuid)
returns table (
  id uuid,
  display_name text,
  taken_at timestamptz,
  taken_by_name text,
  delete_after timestamptz,
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

  if not app.can_see_patient_file_type('patientenfoto') then
    perform app.record_denied_read(auth.uid(), 'patient_files.read', 'not allowed to read patient photos');
    return;
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.display_name,
           f.confirmed_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           app.patient_photo_due_at(f.patient_id, f.confirmed_at),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_photo_bucket()
               and o.name = f.object_key
           )
    from public.patient_files f
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and f.document_type = 'patientenfoto'
      and app.patient_photo_accessible(f.patient_id, f.confirmed_at)
    order by f.confirmed_at desc, f.id;
end;
$$;

comment on function public.list_patient_photos(uuid) is
  'Patientenfotos einer Akte mit Loeschdatum, ohne Vorschau und ohne Objektschluessel (ADR-017 Punkt 40). Gesperrte Fotos fehlen (Punkt 36).';

revoke all on function public.list_patient_photos(uuid) from public, anon;
grant execute on function public.list_patient_photos(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Verweis ausstellen - mit dem Bucket der Art und der Sperre fuer Fotos
-- -----------------------------------------------------------------------------
create or replace function public.issue_patient_file_link(p_file_id uuid)
returns table (bucket_id text, object_key text, display_name text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
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
     and not app.patient_photo_accessible(v_datei.patient_id, v_datei.confirmed_at) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.link_issued', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
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
$$;

-- -----------------------------------------------------------------------------
-- Loeschen - ein gesperrtes Foto bleibt, wo der Legal Hold es haelt
-- -----------------------------------------------------------------------------
create or replace function public.delete_patient_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
     and not app.patient_photo_accessible(v_datei.patient_id, v_datei.confirmed_at) then
    raise exception 'file not accessible' using errcode = '42501';
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
$$;

-- -----------------------------------------------------------------------------
-- Artkorrektur - nie von oder zu patientenfoto (Punkt 32)
-- -----------------------------------------------------------------------------
create or replace function public.set_patient_file_document_type(
  p_file_id uuid,
  p_document_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if 'patientenfoto' in (v_datei.document_type, p_document_type) then
    raise exception 'the document type patientenfoto cannot be corrected' using errcode = '22023';
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
$$;

-- -----------------------------------------------------------------------------
-- Abgleich (Punkt 27) - ueber beide Buckets
-- -----------------------------------------------------------------------------
create or replace function public.list_missing_patient_file_objects()
returns table (
  file_id uuid,
  patient_id uuid,
  patient_name text,
  document_type text,
  display_name text,
  uploaded_at timestamptz
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

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.patient_id,
           btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')),
           f.document_type,
           f.display_name,
           f.confirmed_at
    from public.patient_files f
    join public.patients p on p.id = f.patient_id
    join public.persons pe on pe.id = p.person_id
    where f.organization_id = v_org
      and f.status = 'ready'
      and not exists (
        select 1
        from storage.objects o
        where o.bucket_id = app.patient_file_bucket_for(f.document_type)
          and o.name = f.object_key
      )
    order by f.confirmed_at;
end;
$$;

create or replace function public.count_orphaned_patient_file_objects()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return null;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  -- Verwaist ist ein Objekt auch dann, wenn seine Zeile im anderen Bucket
  -- stuende: Zeile und Objekt gehoeren ueber die Art zusammen.
  select count(*)
    into v_anzahl
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.storage_deletion_orders d
      where d.bucket_id = o.bucket_id
        and d.object_key = o.name
        and d.receipted_at is null
    );

  return v_anzahl;
end;
$$;

create or replace function public.order_orphaned_object_deletion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- G6c: Rolle und Organisation getrennt pruefen. Ohne Organisation bleibt es
  -- bei der Ausnahme; ohne Rolle wird bestaetigt abgewiesen (record_denied_write
  -- bricht selbst ab, wenn die Organisation fehlt).
  if not app.can_execute_storage_deletion() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(auth.uid(), 'storage_deletion.ordered', 'not allowed to order deletions');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to order deletions' using errcode = '42501';
  end if;

  insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
  select v_org, o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vermerke: Ablehnung und Widerruf der Fotoeinwilligung (Punkt 35 und 36)
-- -----------------------------------------------------------------------------
create or replace function public.record_patient_privacy_entry(
  p_patient_id uuid,
  p_record_kind text,
  p_purpose text,
  p_notice_version text,
  p_occurred_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_letzte   record;
  v_id       uuid;
  v_fotos    integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_patient() then
    raise exception 'not allowed to record privacy entries' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record privacy entries' using errcode = '42501';
  end if;

  -- Eine fremde Akte und eine nicht vorhandene sehen gleich aus (ADR-003).
  perform 1
  from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_occurred_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  if p_record_kind in ('consent_granted', 'consent_withdrawn', 'consent_refused') then
    select r.record_kind, r.occurred_on
      into v_letzte
    from public.patient_privacy_records r
    where r.patient_id = p_patient_id
      and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;

    if p_record_kind = 'consent_granted'
       and v_letzte.record_kind is not distinct from 'consent_granted' then
      raise exception 'consent already granted' using errcode = '23514';
    end if;

    if p_record_kind = 'consent_withdrawn' then
      if v_letzte.record_kind is distinct from 'consent_granted' then
        raise exception 'no consent to withdraw' using errcode = '23514';
      end if;
      if p_occurred_on < v_letzte.occurred_on then
        raise exception 'withdrawal before consent' using errcode = '22023';
      end if;
    end if;

    -- Punkt 35: Eine Ablehnung ist ein eigener Vermerk, kein Widerruf. Wer
    -- eingewilligt hat, widerruft; zweimal hintereinander abgelehnt ist
    -- nichts Neues.
    if p_record_kind = 'consent_refused' then
      if v_letzte.record_kind is not distinct from 'consent_granted' then
        raise exception 'consent is granted, record a withdrawal' using errcode = '23514';
      end if;
      if v_letzte.record_kind is not distinct from 'consent_refused' then
        raise exception 'consent already refused' using errcode = '23514';
      end if;
    end if;
  end if;

  -- Wertebereich und Form pruefen die Constraints der Tabelle.
  insert into public.patient_privacy_records (
    organization_id, patient_id, record_kind, purpose, notice_version,
    occurred_on, recorded_by
  )
  values (
    v_org, p_patient_id, p_record_kind, p_purpose, p_notice_version,
    p_occurred_on, v_actor
  )
  returning id into v_id;

  -- Punkt 36: Der Widerruf der Fotoeinwilligung sperrt sofort und loescht in
  -- derselben Transaktion - Zeilen, Loeschauftraege, Loeschjournal. Unter
  -- Legal Hold bleiben die Fotos gesperrt stehen (release_legal_hold).
  if p_record_kind = 'consent_withdrawn' and p_purpose = 'patient_photos' then
    v_fotos := app.delete_due_patient_photos(
      v_org, p_patient_id, extensions.gen_random_uuid(), v_actor, 'consent_withdrawn'
    );
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_privacy.recorded', 'patient', p_patient_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'record_id', v_id,
      'record_kind', p_record_kind,
      'purpose', p_purpose
    ) || case
      when p_purpose = 'patient_photos' and p_record_kind = 'consent_withdrawn'
        then jsonb_build_object('photos_deleted', v_fotos)
      else '{}'::jsonb
    end
  );

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ende eines Legal Hold: gesperrte Fotos fallen jetzt (Punkt 36)
-- -----------------------------------------------------------------------------
create or replace function public.release_legal_hold(p_hold_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_subject uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'legal_hold.released', 'not allowed to manage legal holds');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  select h.subject_id into v_subject
  from public.legal_holds h
  where h.id = p_hold_id
    and h.organization_id = v_org
    and h.released_at is null
  for update;

  if not found then
    raise exception 'legal hold not found' using errcode = 'P0002';
  end if;

  update public.legal_holds
     set released_at = now(),
         released_by = v_actor
   where id = p_hold_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'legal_hold.released', 'patient', v_subject, 'success',
    jsonb_build_object('surface', 'web', 'hold_id', p_hold_id)
  );

  -- Punkt 36: Was der Hold gesperrt gehalten hat, faellt, sobald er endet -
  -- nicht erst im naechsten Loeschlauf.
  perform app.delete_due_patient_photos(
    v_org, v_subject, extensions.gen_random_uuid(), v_actor, 'legal_hold_released'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Loeschlauf: Patientenfotos nach ihrer eigenen Frist (Punkt 38)
--
-- Unveraendert bis auf den Abschnitt "Patientenfotos" und den Zaehler im
-- Auditeintrag. Die Fotos kommen vor der Akte dran, damit jedes geloeschte
-- Foto unter seiner eigenen Klasse im Journal steht und nicht als stille
-- Kaskade einer Akte.
-- -----------------------------------------------------------------------------
create or replace function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_zugang    integer;
  v_fotos     integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

-- -----------------------------------------------------------------------------
-- Wiederherstellung: Fotoloeschungen erneut anwenden (Punkt 26 und 36)
--
-- Neu: 'patient_files' in der festen Reihenfolge, vor den Grundlagen und der
-- Akte, an denen die Zeilen haengen. Der Trigger schreibt dabei die
-- Loeschauftraege fuer die zurueckgespielten Objekte.
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$$;
