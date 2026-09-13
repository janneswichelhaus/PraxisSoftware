-- =============================================================================
-- Dateien loeschen, Dokumentart korrigieren, Loeschauftraege quittieren
-- (DAT-002, ADR-017 Punkt 8, 13 und 25)
--
-- DAT-001 hat die Auftragstabelle und den Trigger gebaut: Jede geloeschte
-- Dateizeile hinterlaesst einen Auftrag fuer ihr Objekt. Diese Migration
-- liefert die andere Haelfte - den Weg, auf dem ein Mensch loescht, und den
-- Weg, auf dem ein Objekt tatsaechlich verschwindet.
--
-- WARUM DIE QUITTUNG MEHR IST ALS EIN HAEKCHEN. Punkt 25 verlangt, dass die
-- Loeschung selbst nachweispflichtig ist. Eine Quittung, die nur festhaelt,
-- dass jemand auf "Ausfuehren" getippt hat, waere genau das nicht. Deshalb
-- prueft receipt_storage_deletion_order, dass das Objekt WIRKLICH weg ist,
-- bevor sie stempelt: Liegt es noch, gibt es keine Quittung und der Auftrag
-- bleibt offen. Das Loeschjournal weist die Zeile nach (ANN-031), die Quittung
-- das Objekt - und zwar gemessen, nicht behauptet.
--
-- WARUM EIN OBJEKT NUR MIT AUFTRAG GELOESCHT WERDEN DARF. Die DELETE-Policy
-- auf storage.objects verlangt einen OFFENEN Auftrag zu genau diesem
-- Schluessel. Damit gibt es keinen Weg, ein Objekt zu entfernen, dessen Zeile
-- noch steht - das waere die "fehlende Datei" aus Punkt 27, von Hand erzeugt.
-- Loeschen beginnt immer bei der Datenbank.
--
-- WARUM DIE DOKUMENTART EIN EIGENER VORGANG IST. Punkt 13: Sie zu aendern
-- verschiebt eine Sichtbarkeitsgrenze und ist damit keine Stammdatenpflege.
-- Eine falsch gewaehlte Art ist eine Offenlegung nach PROJECT_PRINCIPLES.md 13.
-- Deshalb: nur therapeutische Rollen, und protokolliert.
--
-- BEWUSST NICHT ENTHALTEN: das Ersetzen einer Datei als eigener Vorgang. Punkt
-- 8 sagt, eine berichtigte Fassung sei "eine neue Datei mit Verweis auf die
-- ersetzte" - und die offene Folgefrage des ADR ("wie wird eine ersetzte Datei
-- angezeigt?") ist nicht beantwortet. Eine Spalte replaces_file_id ohne
-- entschiedene Darstellung waere Vorbau (ADR-014, PROJECT_PRINCIPLES.md 11).
-- Was heute geht und woran Punkt 8 sich nicht stoert: die alte Datei loeschen
-- oder stehen lassen und eine neue hinzufuegen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
--
-- 'patient_file.deleted' steht seit DAT-001 im Katalog. Neu ist die Korrektur
-- der Dokumentart: ADR-017 Punkt 20 nennt drei auditpflichtige Ereignisse,
-- Punkt 13 verlangt zusaetzlich, dass die Korrektur "ein protokollierter
-- Vorgang" ist. Beides zugleich geht nur mit einem vierten Eintrag.
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
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'patient_file',
    'storage_deletion_order'
  ));

-- -----------------------------------------------------------------------------
-- Wer die Dokumentart korrigieren darf
--
-- Eigene Funktion statt Wiederverwendung von can_write_clinical_patient_files:
-- Die Korrektur ist fachlich etwas anderes als das Hochladen - sie greift auch
-- an einer Datei, die jemand anders eingestellt hat -, und der Rollenschnitt
-- soll sich einzeln aendern lassen.
-- -----------------------------------------------------------------------------
create or replace function app.can_correct_patient_file_type()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

comment on function app.can_correct_patient_file_type() is
  'Wer die Dokumentart einer Datei aendern darf (ADR-017 Punkt 13). Ohne office: die Aenderung verschiebt eine Sichtbarkeitsgrenze.';

-- Wer offene Loeschauftraege ausfuehren und quittieren darf.
--
-- Nur owner - wie beim Legal Hold. Es ist kein Alltagsvorgang, sondern der
-- betriebliche Abschluss einer Loeschung, und er gehoert neben das
-- Loeschjournal in "Aufbewahrung und Loeschung".
create or replace function app.can_execute_storage_deletion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

grant execute on function app.can_correct_patient_file_type() to authenticated;
grant execute on function app.can_execute_storage_deletion() to authenticated;

-- -----------------------------------------------------------------------------
-- delete_patient_file
--
-- Loescht die Zeile; den Auftrag fuer das Objekt schreibt der Trigger aus
-- DAT-001. Das Auditereignis entsteht VOR dem Loeschen: danach gaebe es die
-- Angaben nicht mehr, die es tragen soll - dieselbe Ueberlegung wie bei
-- log_account_security_event (FIX-002). Schlaegt das Loeschen fehl, faellt die
-- Transaktion samt Eintrag zurueck.
-- -----------------------------------------------------------------------------
create function public.delete_patient_file(p_file_id uuid)
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
  if not app.can_write_patient_file(v_datei.document_type, v_datei.prescription_id)
     or not app.can_see_patient_file_type(v_datei.document_type) then
    raise exception 'not allowed to delete this file' using errcode = '42501';
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

comment on function public.delete_patient_file(uuid) is
  'Loescht eine Datei der Akte. Die Zeile faellt sofort, das Objekt ueber den Loeschauftrag mit Quittung (ADR-017 Punkt 25).';

-- -----------------------------------------------------------------------------
-- set_patient_file_document_type
--
-- Die einzige Aenderung, die eine bestaetigte Datei zulaesst - und sie
-- beruehrt den Inhalt nicht (Punkt 8). Der Auditeintrag traegt die alte und
-- die neue Art, damit nachvollziehbar bleibt, in welche Richtung die
-- Sichtbarkeitsgrenze verschoben wurde.
--
-- Geprueft wird das Recht an BEIDEN Arten. Wer die Datei nach der Korrektur
-- nicht mehr sehen duerfte, darf sie auch nicht dorthin verschieben: Das waere
-- ein Weg, ein Dokument aus der eigenen Sicht verschwinden zu lassen.
-- -----------------------------------------------------------------------------
create function public.set_patient_file_document_type(
  p_file_id       uuid,
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

  -- Der Verordnungsscan haengt an einer Verordnung (Punkt 10); umgekehrt darf
  -- eine Datei an einer Verordnung nicht zu etwas werden, das dort nichts
  -- verloren hat. Die Check-Constraint faengt nur die eine Richtung.
  if p_document_type = 'verordnungsscan' and v_datei.prescription_id is null then
    raise exception 'a prescription scan needs a prescription' using errcode = '22023';
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

comment on function public.set_patient_file_document_type(uuid, text) is
  'Korrigiert die Dokumentart und damit die Sichtbarkeit einer Datei (ADR-017 Punkt 13). Nur therapeutische Rollen, protokolliert, nur zwischen Arten, die die Person selbst sehen darf.';

-- -----------------------------------------------------------------------------
-- Offene Loeschauftraege lesen
--
-- Ein Arbeitsvorrat, keine Warteschlange (Punkt 25). Er traegt keinen Namen
-- und keinen Inhalt - nur Schluessel und Zeitpunkt -, und die Kennung im
-- Schluessel gehoert zu einer Zeile, die es nicht mehr gibt.
--
-- object_present sagt, ob ueberhaupt noch etwas zu tun ist. Ein Auftrag ohne
-- Objekt kann sofort quittiert werden; das passiert, wenn jemand nach dem
-- ersten Versuch abgebrochen hat, nachdem das Objekt schon weg war.
-- -----------------------------------------------------------------------------
create function public.list_storage_deletion_orders()
returns table (
  id             uuid,
  bucket_id      text,
  ordered_at     timestamptz,
  object_present boolean
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
  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read deletion orders' using errcode = '42501';
  end if;

  return query
    select o.id,
           o.bucket_id,
           o.ordered_at,
           exists (
             select 1
             from storage.objects s
             where s.bucket_id = o.bucket_id
               and s.name = o.object_key
           )
    from public.storage_deletion_orders o
    where o.organization_id = v_org
      and o.receipted_at is null
    order by o.ordered_at, o.id;
end;
$$;

comment on function public.list_storage_deletion_orders() is
  'Offene Loeschauftraege der eigenen Organisation (ADR-017 Punkt 25). Ohne Objektschluessel: die Oberflaeche braucht ihn nicht, und er gehoert nicht in eine Liste.';

-- -----------------------------------------------------------------------------
-- Den Schluessel eines Auftrags holen
--
-- Der Browser braucht ihn, um das Objekt zu entfernen - dasselbe Muster wie
-- beim signierten Verweis (ANN-052): genau ein Vorgang, genau ein Schluessel,
-- an eine Berechtigung gebunden. Kein Auditeintrag: Geloescht ist noch nichts,
-- und die Quittung unten protokolliert den Abschluss.
-- -----------------------------------------------------------------------------
create function public.claim_storage_deletion_order(p_order_id uuid)
returns table (bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auftrag record;
begin
  if auth.uid() is null then
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

  return query select v_auftrag.bucket_id, v_auftrag.object_key;
end;
$$;

comment on function public.claim_storage_deletion_order(uuid) is
  'Gibt den Objektschluessel eines offenen Loeschauftrags heraus, damit der angemeldete Vorgang ihn loeschen kann (ADR-017 Punkt 25).';

-- -----------------------------------------------------------------------------
-- receipt_storage_deletion_order
--
-- Die Quittung, und sie wird VERDIENT: Solange das Objekt noch liegt, gibt es
-- keine. Damit ist "geloescht" auf der Objektseite ein gemessener Zustand und
-- keine Behauptung der Oberflaeche - genau das, was Punkt 25 mit
-- "selbst nachweispflichtig" meint.
--
-- Der Auditeintrag traegt nur die Kennung des Auftrags: Der Objektschluessel
-- gehoert nicht ins Log (ADR-017 Punkt 20, ADR-011), und einen Patientenbezug
-- gibt es nicht mehr - die Zeile ist weg.
-- -----------------------------------------------------------------------------
create function public.receipt_storage_deletion_order(p_order_id uuid)
returns void
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
    and o.receipted_at is null
  for update;

  if not found then
    raise exception 'deletion order not accessible' using errcode = '42501';
  end if;

  if exists (
    select 1
    from storage.objects s
    where s.bucket_id = v_auftrag.bucket_id
      and s.name = v_auftrag.object_key
  ) then
    raise exception 'object is still present' using errcode = '22023';
  end if;

  update public.storage_deletion_orders
     set receipted_at = now(),
         receipted_by = v_actor
   where id = p_order_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_auftrag.organization_id, v_actor, 'storage_deletion.receipted', 'storage_deletion_order',
    p_order_id, 'success',
    jsonb_build_object('surface', 'web', 'bucket_id', v_auftrag.bucket_id)
  );
end;
$$;

comment on function public.receipt_storage_deletion_order(uuid) is
  'Quittiert einen Loeschauftrag - aber nur, wenn das Objekt tatsaechlich nicht mehr da ist (ADR-017 Punkt 25).';

-- -----------------------------------------------------------------------------
-- DELETE-Policy auf storage.objects
--
-- Die dritte und letzte Policy (DAT-001 hat insert und select gebracht, ein
-- update gibt es bewusst nicht). Sie laesst genau das zu, was ein offener
-- Auftrag deckt - kein Objekt mehr und keins weniger.
--
-- Damit ist ein Objekt ohne Auftrag unloeschbar, und ein Auftrag entsteht nur,
-- wenn die Zeile gefallen ist. Die Reihenfolge "erst Datenbank, dann Objekt"
-- ist damit erzwungen und nicht bloss vereinbart.
-- -----------------------------------------------------------------------------
create or replace function app.may_delete_storage_object(p_bucket text, p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_execute_storage_deletion()
     and exists (
       select 1
       from public.storage_deletion_orders o
       where o.bucket_id = p_bucket
         and o.object_key = p_object_key
         and o.organization_id = app.current_organization_id()
         and o.receipted_at is null
     )
$$;

grant execute on function app.may_delete_storage_object(text, text) to authenticated;

create policy patient_files_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = app.patient_file_bucket()
    and app.may_delete_storage_object(bucket_id, name)
  );

-- Eine zweite SELECT-Policy, und sie ist keine Aufweichung der ersten.
--
-- Die Storage-API sucht das Objekt, bevor sie es entfernt; ohne Leserecht
-- findet sie nichts und meldet Erfolg, obwohl nichts geschehen ist. Genau
-- dieselbe Stelle traefe jedes DELETE mit RETURNING.
--
-- Die Policy aus DAT-001 hilft hier nicht: Sie verlangt eine 'ready'-Zeile in
-- patient_files, und die ist zum Zeitpunkt der Loeschung gerade weg. Was diese
-- Policy zulaesst, ist deshalb enger als das, was sie ergaenzt: nur ein
-- Objekt, zu dem ein OFFENER Auftrag der eigenen Organisation vorliegt, und
-- nur fuer die Rolle, die ihn ausfuehren darf. Sichtbar wird damit der
-- Objektschluessel - der zu diesem Zeitpunkt zu keiner Zeile mehr gehoert.
create policy patient_files_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id = app.patient_file_bucket()
    and app.may_delete_storage_object(bucket_id, name)
  );

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------
revoke all on function public.delete_patient_file(uuid) from public, anon;
revoke all on function public.set_patient_file_document_type(uuid, text) from public, anon;
revoke all on function public.list_storage_deletion_orders() from public, anon;
revoke all on function public.claim_storage_deletion_order(uuid) from public, anon;
revoke all on function public.receipt_storage_deletion_order(uuid) from public, anon;

grant execute on function public.delete_patient_file(uuid) to authenticated;
grant execute on function public.set_patient_file_document_type(uuid, text) to authenticated;
grant execute on function public.list_storage_deletion_orders() to authenticated;
grant execute on function public.claim_storage_deletion_order(uuid) to authenticated;
grant execute on function public.receipt_storage_deletion_order(uuid) to authenticated;
