-- =============================================================================
-- BEF-170 Akte: einzeln gelöschte Dateien ins Löschjournal (Pfad A)
--
-- Der Löschlauf schreibt fällige Dateien ins Löschjournal, `delete_patient_file`
-- aber nicht: Nach einer Wiederherstellung käme eine einzeln gelöschte Datei
-- zurück, etwa ein falsch zugeordnetes Foto (ADR-008 Punkt 8, ADR-017
-- Punkt 26). Dasselbe gilt für eine Datei, die die Prüfung am Inhalt
-- verworfen hat. Beide Wege schreiben jetzt einen Eintrag, wie die Fotos am
-- Rad (FLT-002) und die Anhänge an Rückfragen; `reapply_deletion_journal`
-- kennt `patient_files` schon und löscht sie erneut, der Auslöser an der
-- Tabelle schreibt dann wieder den Löschauftrag für das Objekt.
--
-- Datenklasse wie in `retention_assignments`: `patientenfoto` für die
-- Foto-Arbeitshilfe, sonst `patientenakte`. Fällig ist eine Löschung von Hand
-- mit ihrem Zeitpunkt. Der Eintrag trägt Tabelle, Kennung, Klasse und Zeit -
-- keinen Namen, keinen Inhalt (ANN-031).
--
-- Kein Auditeintrag (ADR-010 Punkt 15), keine neue Tabelle, keine Frist,
-- Rechte und Prüfungen beider Funktionen unverändert.
-- =============================================================================

-- Der Journaleintrag einer einzeln gelöschten Datei, an einer Stelle. Nur aus
-- Funktionen mit SECURITY DEFINER aufrufbar: Wer Einträge anlegen könnte,
-- ließe nach einer Wiederherstellung beliebige Dateien löschen.
create function app.journal_patient_file_deletion(
  p_organization_id uuid, p_file_id uuid, p_document_type text
)
returns void
language sql
set search_path = ''
as $$
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  values (
    p_organization_id, extensions.gen_random_uuid(), 'patient_files', p_file_id,
    case when p_document_type = 'patientenfoto' then 'patientenfoto' else 'patientenakte' end,
    now()
  )
$$;

revoke all on function app.journal_patient_file_deletion(uuid, uuid, text)
  from public, anon, authenticated;

comment on function app.journal_patient_file_deletion(uuid, uuid, text) is
  'BEF-170: Eintrag im Loeschjournal fuer eine einzeln geloeschte Datei der Akte (ADR-008 Punkt 8, ADR-017 Punkt 26). Klasse patientenfoto fuer die Foto-Arbeitshilfe, sonst patientenakte; faellig mit der Loeschung. Nicht fuer Clients.';

-- Stand LOG-001b, dazu BEF-170: der Eintrag im Löschjournal.
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

  -- Der Trigger an patient_files schreibt den Loeschauftrag fuer das Objekt;
  -- das Loeschjournal haelt die Loeschung ueber eine Wiederherstellung
  -- (BEF-170, ADR-008 Punkt 8).
  delete from public.patient_files where id = p_file_id;
  perform app.journal_patient_file_deletion(v_datei.organization_id, v_datei.id, v_datei.document_type);
end;
$$;

comment on function public.delete_patient_file(uuid) is
  'Loescht eine Datei der Akte. Die Zeile faellt sofort, das Objekt ueber den Loeschauftrag mit Quittung (ADR-017 Punkt 25); das Loeschjournal haelt die Loeschung ueber eine Wiederherstellung (BEF-170, ADR-008 Punkt 8).';

-- Stand LOG-001a, dazu BEF-170: der Eintrag im Löschjournal beim Verwerfen.
create or replace function public.record_patient_file_verification(
  p_file_id uuid, p_content_type_ok boolean, p_checksum_ok boolean, p_metadata_ok boolean
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
      v_datei.organization_id, null, 'system', 'access.denied', 'patient_file',
      p_file_id, 'denied',
      jsonb_build_object(
        'surface', 'edge_function',
        'operation', 'patient_file.verification',
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
    v_datei.organization_id, null, 'system', 'access.denied', 'patient_file', p_file_id,
    'denied',
    jsonb_build_object(
      'surface', 'edge_function',
        'operation', 'patient_file.verification',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type,
      'content_type_ok', p_content_type_ok,
      'checksum_ok', p_checksum_ok,
      'metadata_ok', p_metadata_ok,
      'was_ready', v_datei.status = 'ready'
    )
  );

  -- Der Trigger an patient_files schreibt den Loeschauftrag fuer das Objekt;
  -- das Loeschjournal haelt die Loeschung ueber eine Wiederherstellung
  -- (BEF-170, ADR-017 Punkt 26).
  delete from public.patient_files where id = p_file_id;
  perform app.journal_patient_file_deletion(v_datei.organization_id, v_datei.id, v_datei.document_type);
  return 'rejected';
end;
$$;
