-- =============================================================================
-- FIX-015 (BEF-004): Dateizugriff nur ueber den auditierten Weg
--
-- Befund aus dem Zweitreview zu ROL-EPIC-001, am Code und an der Storage-API
-- reproduziert: Die Storage-API signiert, laedt, listet und kopiert mit der
-- Rolle der anfragenden Person gegen storage.objects und fragt dafuer nur die
-- RLS. Die bisherige Leseregel liess jedes Objekt zu, dessen Dokumentart die
-- Rolle sehen darf, und der Objektschluessel <organisation>/<bezug>/<datei-id>
-- ist fuer jede Rolle ableitbar, die die Dateiliste liest. Ein signierter
-- Verweis ging damit am Auditeintrag patient_file.link_issued vorbei; fuer den
-- Owner galt dasselbe bei Objekten offener Loeschauftraege.
--
-- Ein versteckter Zufallsanteil im Schluessel reicht nicht: Wer einmal oeffnen
-- durfte, kennt den Schluessel danach. Der Zugriff haengt deshalb an einer
-- EINMALIGEN FREIGABE (ANN-052):
--
--   issue_patient_file_link       protokolliert patient_file.link_issued und
--                                 legt fuer die aufrufende Person eine
--                                 Freigabe fuer genau diese Datei an
--   claim_storage_deletion_order  protokolliert storage_deletion.claimed (neu)
--                                 und legt eine Freigabe fuer das Objekt
--                                 genau dieses Auftrags an
--   RLS auf storage.objects       laesst eine Zeile nur gegen eine passende,
--                                 nicht abgelaufene Freigabe der anfragenden
--                                 Person zu - und loescht sie dabei
--
-- Warum der Verbrauch in der Policy steckt: Eine Datenbankfunktion kann nicht
-- signieren, und eine Edge Function ist fuer produktive Gesundheitsdaten nicht
-- freigegeben (ADR-015 Punkt 20, ADR-017 Punkt 25). Die RLS ist die einzige
-- Stelle, die die Storage-API vor jeder dieser Operationen fragt, und sie fragt
-- je Operation einmal nach der Zeile (Storage-API 1.72: SELECT ... WHERE
-- name = $1 LIMIT 1 beim Signieren, Laden und Kopieren, DELETE ... RETURNING
-- beim Entfernen). Das Laden ueber einen bereits signierten Verweis liest die
-- Storage-API als Superuser - der Verweis gilt deshalb weiter seine
-- 60 Sekunden (ADR-017 Punkt 15).
--
-- Belegt in supabase/tests/patient-file-access.test.ts und gegen die echte
-- Storage-API in tests/e2e/authenticated/patient-file-access.spec.ts. Faellt
-- dieser E2E-Test nach einem Upgrade der Storage-API, ist die Annahme ueber
-- ihre Abfragen zu pruefen, bevor irgendetwas anderes geaendert wird.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010): storage_deletion.claimed
--
-- Die Loeschfreigabe oeffnet dem Owner genau eine Operation am Objekt eines
-- Auftrags. Sie ist damit ein Zugriff im Sinne von ADR-010 Punkt 2 und steht
-- im Log - bisher entstand erst mit der Quittung ein Eintrag.
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

-- -----------------------------------------------------------------------------
-- patient_file_access_grants
--
-- Eine Zeile ist eine Freigabe fuer genau EINE Storage-Operation: entweder an
-- einer Datei der Akte (patient_file_id) oder am Objekt eines Loeschauftrags
-- (deletion_order_id). Sie gehoert einer Person und einer Organisation und
-- verfaellt nach app.patient_file_access_grant_ttl(). Kein Tabellenrecht und
-- keine Policy: Erreichbar ist sie nur ueber die Funktionen unten.
--
-- Datenminimierung: keine Schluessel, keine Namen, kein Inhalt. Die Zeile
-- lebt Sekunden - verbraucht wird sie beim ersten Zugriff und dabei geloescht,
-- verfallene raeumt die naechste Ausstellung der Organisation ab.
-- -----------------------------------------------------------------------------
create table public.patient_file_access_grants (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  user_id           uuid not null,
  patient_file_id   uuid references public.patient_files (id) on delete cascade,
  deletion_order_id uuid references public.storage_deletion_orders (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,

  constraint patient_file_access_grants_one_subject check (
    (patient_file_id is null) <> (deletion_order_id is null)
  ),
  -- Eine Freigabe ist kurzlebig, und das steht im Schema, nicht nur in der
  -- Funktion, die sie anlegt.
  constraint patient_file_access_grants_short_lived check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  )
);

create index patient_file_access_grants_file_idx
  on public.patient_file_access_grants (patient_file_id)
  where patient_file_id is not null;

create index patient_file_access_grants_order_idx
  on public.patient_file_access_grants (deletion_order_id)
  where deletion_order_id is not null;

create index patient_file_access_grants_expiry_idx
  on public.patient_file_access_grants (organization_id, expires_at);

comment on table public.patient_file_access_grants is
  'Einmalige Freigabe fuer genau eine Storage-Operation an einer Datei der Akte oder am Objekt eines Loeschauftrags (FIX-015, BEF-004, ANN-052). Angelegt nur von issue_patient_file_link und claim_storage_deletion_order, verbraucht und geloescht durch die RLS auf storage.objects. Datenklasse: technische Zugriffsfreigabe ohne Inhalt; lebt Sekunden, faellt spaetestens mit Datei oder Auftrag.';

alter table public.patient_file_access_grants enable row level security;
revoke all on public.patient_file_access_grants from anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values

  ('patient_file_access_grants', 'patientenakte', 'ueber_elterndatensatz',
   'Einmalige Lesefreigabe an einer Datei der Akte (FIX-015, ANN-052): beim ersten Zugriff verbraucht und geloescht, nach 30 Sekunden verfallen und bei der naechsten Ausstellung der Praxis entfernt; faellt spaetestens mit der Datei (FK on delete cascade).', 36),

  ('patient_file_access_grants', 'loeschjournal', 'ueber_elterndatensatz',
   'Einmalige Loeschfreigabe am Objekt eines Loeschauftrags (FIX-015, ADR-017 Punkt 25): beim ersten Zugriff verbraucht und geloescht, nach 30 Sekunden verfallen; faellt spaetestens mit dem Auftrag (FK on delete cascade).', 116);

-- -----------------------------------------------------------------------------
-- Gueltigkeit einer Freigabe
--
-- ANN-052: 30 Sekunden zwischen Ausstellung und Zugriff. Der Browser signiert
-- unmittelbar nach dem Aufruf; die Zeit deckt eine langsame Verbindung, nicht
-- ein spaeteres Wiederkommen. Der signierte Verweis selbst gilt danach
-- unveraendert 60 Sekunden (ADR-017 Punkt 15).
-- -----------------------------------------------------------------------------
create or replace function app.patient_file_access_grant_ttl()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '30 seconds'
$$;

comment on function app.patient_file_access_grant_ttl() is
  'Gueltigkeit einer einmaligen Dateifreigabe zwischen Ausstellung und Zugriff (ANN-052).';

-- -----------------------------------------------------------------------------
-- Leseregel fuer Dateien der Akte - jetzt verbrauchend
--
-- Dieselbe Funktion, die die SELECT-Policy patient_files_objects_select seit
-- DAT-001 aufruft; die Policy bleibt, ihre Bedingung wird enger. Zusaetzlich
-- zu Organisation, Zustand und Dokumentart verlangt sie eine Freigabe der
-- anfragenden Person fuer genau diese Datei und loescht sie. Deshalb VOLATILE:
-- Eine Pruefung mit Nebenwirkung darf der Planer nicht zusammenfassen.
--
-- SKIP LOCKED: Zwei gleichzeitige Anfragen derselben Person verbrauchen nicht
-- dieselbe Freigabe; die zweite findet keine und bekommt nichts.
-- -----------------------------------------------------------------------------
create or replace function app.may_read_patient_file_object(p_object_key text)
returns boolean
language plpgsql
volatile
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
    and f.organization_id = v_org
    and f.status = 'ready'
    and g.organization_id = v_org
    and g.user_id = v_actor
    and g.expires_at > now()
    and app.can_see_patient_file_type(f.document_type)
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

comment on function app.may_read_patient_file_object(text) is
  'Leseregel der Dateiablage fuer die Policy auf storage.objects (ADR-017 Punkt 11): Organisation, Zustand und Dokumentart wie bisher, dazu eine einmalige, personengebundene Freigabe aus issue_patient_file_link, die dabei verbraucht wird (FIX-015, BEF-004, ANN-052).';

grant execute on function app.may_read_patient_file_object(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Leseregel fuer Objekte offener Loeschauftraege - verbrauchend
--
-- Die zweite SELECT-Policy aus DAT-002 bleibt noetig: DELETE ... RETURNING der
-- Storage-API liest die Zeile. Bisher genuegte ein offener Auftrag, und damit
-- konnte der Owner ein solches Objekt auch signieren und laden. Jetzt braucht
-- jede Operation eine Loeschfreigabe, und die DELETE-Policy selbst bleibt
-- unveraendert (app.may_delete_storage_object, ohne Verbrauch) - sonst
-- verbrauchte ein DELETE seine Freigabe zweimal.
-- -----------------------------------------------------------------------------
create or replace function app.may_read_storage_object_for_deletion(
  p_bucket     text,
  p_object_key text
)
returns boolean
language plpgsql
volatile
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
  if v_actor is null or v_org is null or not app.can_execute_storage_deletion() then
    return false;
  end if;

  select g.id into v_grant
  from public.patient_file_access_grants g
  join public.storage_deletion_orders o on o.id = g.deletion_order_id
  where o.bucket_id = p_bucket
    and o.object_key = p_object_key
    and o.organization_id = v_org
    and o.receipted_at is null
    and g.organization_id = v_org
    and g.user_id = v_actor
    and g.expires_at > now()
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

comment on function app.may_read_storage_object_for_deletion(text, text) is
  'Leseregel fuer das Objekt eines offenen Loeschauftrags (ADR-017 Punkt 25): nur owner, nur gegen eine einmalige Loeschfreigabe aus claim_storage_deletion_order, die dabei verbraucht wird (FIX-015, BEF-004).';

grant execute on function app.may_read_storage_object_for_deletion(text, text) to authenticated;

drop policy patient_files_objects_select_for_deletion on storage.objects;

create policy patient_files_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id = app.patient_file_bucket()
    and app.may_read_storage_object_for_deletion(bucket_id, name)
  );

-- -----------------------------------------------------------------------------
-- issue_patient_file_link - stellt jetzt die Freigabe aus
--
-- Unveraendert: Pruefung, Auditeintrag, Rueckgabe. Neu: Verfallene Freigaben
-- der Organisation werden entfernt, und die aufrufende Person bekommt genau
-- eine Freigabe fuer genau diese Datei. Der Auditeintrag steht vor der
-- Freigabe in derselben Transaktion - es gibt keine Freigabe ohne Eintrag.
-- -----------------------------------------------------------------------------
create or replace function public.issue_patient_file_link(p_file_id uuid)
returns table (
  bucket_id    text,
  object_key   text,
  display_name text,
  mime_type    text
)
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
    select app.patient_file_bucket(), v_datei.object_key, v_datei.display_name, v_datei.mime_type;
end;
$$;

comment on function public.issue_patient_file_link(uuid) is
  'Gibt den Objektschluessel fuer genau einen bewussten Zugriff heraus, protokolliert die Ausstellung und legt die einmalige Freigabe an, ohne die die Storage-API das Objekt nicht liefert (ADR-017 Punkt 15, 20, 21; FIX-015, ANN-052).';

-- -----------------------------------------------------------------------------
-- claim_storage_deletion_order - stellt jetzt die Loeschfreigabe aus
--
-- Bisher ohne Auditeintrag, weil "geloescht ist noch nichts". Seit die
-- Freigabe dem Owner eine Operation am Objekt oeffnet, ist sie ein Zugriff und
-- steht im Log (storage_deletion.claimed). Wird die Freigabe nicht zum
-- Loeschen genutzt, bleibt der Auftrag offen: Die Quittung findet das Objekt
-- noch und verweigert.
-- -----------------------------------------------------------------------------
create or replace function public.claim_storage_deletion_order(p_order_id uuid)
returns table (bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_auftrag record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    raise exception 'not allowed to execute deletion orders' using errcode = '42501';
  end if;

  select o.* into v_auftrag
  from public.storage_deletion_orders o
  where o.id = p_order_id
    and o.organization_id = app.current_organization_id()
    and o.receipted_at is null;

  if not found then
    raise exception 'deletion order not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_auftrag.organization_id, v_actor, 'storage_deletion.claimed', 'storage_deletion_order',
    p_order_id, 'success',
    jsonb_build_object('surface', 'web', 'bucket_id', v_auftrag.bucket_id)
  );

  delete from public.patient_file_access_grants g
   where g.organization_id = v_auftrag.organization_id
     and g.expires_at <= now();

  insert into public.patient_file_access_grants (
    organization_id, user_id, deletion_order_id, expires_at
  )
  values (
    v_auftrag.organization_id, v_actor, p_order_id, now() + app.patient_file_access_grant_ttl()
  );

  return query select v_auftrag.bucket_id, v_auftrag.object_key;
end;
$$;

comment on function public.claim_storage_deletion_order(uuid) is
  'Gibt den Objektschluessel eines offenen Loeschauftrags heraus, protokolliert storage_deletion.claimed und legt die einmalige Loeschfreigabe an (ADR-017 Punkt 25; FIX-015).';
