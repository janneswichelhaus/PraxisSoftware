-- Löschungen von Hand stehen je Praxis und Tag im Löschjournal, ohne Uhrzeit (ANN-752 Fassung 2,
-- §20): Ein Eintrag ohne Lauf (run_id null) bekommt die Tageskennung der Praxis. Funktionen mit
-- eigenem Eintrag gaben bisher je Vorgang eine Kennung und die genaue Zeit mit.

create or replace function app.deletion_journal_once()
returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_lauf text := nullif(current_setting('app.deletion_run', true), '');
begin
  if coalesce(current_setting('app.journal_by_trigger', true), '') = 'on' then
    return new;
  end if;

  -- Ohne Lauf ist es eine Löschung von Hand und gilt wie ein Eintrag des Auslösers: Ein Lauf derselben
  -- Transaktion übernimmt ihn, sonst steht er je Praxis und Tag ohne Uhrzeit (§20, ANN-752).
  if new.run_id is null then
    if v_lauf is null then
      perform pg_catalog.set_config('app.deletion_run_generated', 'on', true);
      new.run_id := md5('tageweise:' || new.organization_id::text || ':' || current_date::text)::uuid;
      new.due_at := date_trunc('day', now());
      -- Ein Verhältnis als Schlüssel braucht die genaue Zeit: Was danach neu entstand, bleibt.
      new.deleted_at := case when exists (select 1 from public.data_registry r
                                           where r.table_name = new.target_table
                                             and r.journal_key <> 'id')
                             then now() else new.due_at end;
    else
      new.run_id := v_lauf::uuid;
      new.due_at := coalesce(new.due_at, now());
      new.deleted_at := now();
    end if;
  -- Ein Lauf mit eigener Kennung gibt sie den Einträgen des Auslösers derselben Transaktion: ein
  -- Lauf je Löschung (list_deletion_runs). Tageweise gebündelte Einträge sind kein Lauf.
  elsif new.target_table <> 'team_message_contents'
     and not exists (select 1 from public.data_registry r
                      where r.table_name = new.target_table and r.journal_daily) then
    if v_lauf is null then
      perform pg_catalog.set_config('app.deletion_run', new.run_id::text, true);
      if coalesce(current_setting('app.deletion_run_generated', true), '') = 'on' then
        update public.deletion_journal j
           set run_id = new.run_id
         where j.run_id in (select md5('tageweise:' || o.id::text || ':' || current_date::text)::uuid
                              from public.organizations o)
           and j.transaction_id = new.transaction_id;
        perform pg_catalog.set_config('app.deletion_run_generated', '', true);
      end if;
    end if;
  end if;

  -- Schrieb der Auslöser schon, ergänzt ein späterer Eintrag derselben Transaktion nur Lauf,
  -- Klasse und Zeitpunkte; so bleibt es bei einem Eintrag je Zeile.
  update public.deletion_journal j
     set run_id = new.run_id,
         retention_class = new.retention_class,
         due_at = new.due_at,
         deleted_at = new.deleted_at
   where j.target_table = new.target_table
     and j.target_id = new.target_id
     and j.transaction_id = new.transaction_id;
  if found then
    return null;
  end if;
  return new;
end;
$$;

comment on function app.deletion_journal_once() is
  'Vor jedem Eintrag ins Löschjournal: ergänzt den Eintrag des Auslösers derselben Zeile und Transaktion, statt einen zweiten zu schreiben, und vereint die Läufe einer Transaktion. Ein Eintrag ohne Lauf ist eine Löschung von Hand und gilt wie ein Eintrag des Auslösers: in einem laufenden Lauf zu diesem, mit genauer Zeit; sonst je Praxis und Tag ohne Uhrzeit, und ein späterer Lauf derselben Transaktion übernimmt ihn (ANN-752).';

-- Ein eigener Eintrag mit der Klasse aus dem Register ist doppelt: Der Auslöser schreibt ihn.
create or replace function public.delete_fleet_photo(p_photo_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org  uuid;
  v_foto public.fleet_photos%rowtype;
begin
  v_org := app.fleet_org(app.can_read_fleet(), 'not allowed to use the fleet');
  select f.* into v_foto
  from public.fleet_photos f
  where f.id = p_photo_id and f.organization_id = v_org and f.status = 'ready'
  for update;
  if v_foto.id is null then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;
  if not app.can_delete_fleet_photo(v_foto) then
    raise exception 'not allowed to delete this photo' using errcode = '42501';
  end if;
  -- Der Trigger schreibt den Loeschauftrag mit ordered_by = auth.uid(). Ins Löschjournal trägt
  -- der Auslöser ein, tageweise (ANN-752): Nach einer Wiederherstellung greift die Löschung erneut
  -- (ADR-008 Punkt 8, ADR-017 Punkt 26), etwa wenn doch eine Person im Bild war.
  delete from public.fleet_photos where id = v_foto.id;
end;
$$;

create or replace function public.record_fleet_photo_verification(p_photo_id uuid, p_content_type_ok boolean, p_checksum_ok boolean, p_metadata_ok boolean)
returns text
language plpgsql security definer
set search_path to ''
as $$
declare
  v_foto public.fleet_photos%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null or p_metadata_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select f.* into v_foto from public.fleet_photos f where f.id = p_photo_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_foto.verified_at is not null then
    return 'already_verified';
  end if;
  if v_foto.status <> 'ready' and v_foto.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;

  if p_content_type_ok and p_checksum_ok and p_metadata_ok then
    update public.fleet_photos
       set verified_at = now(),
           status = 'ready',
           confirmed_at = coalesce(confirmed_at, now())
     where id = p_photo_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heisst verwerfen; der Trigger schreibt den Loeschauftrag,
  -- das Loeschjournal haelt es ueber eine Wiederherstellung (Punkt 26).
  delete from public.fleet_photos where id = p_photo_id;
  return 'rejected';
end;
$$;

create or replace function public.discard_reimbursement_receipt(p_receipt_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  -- Der Trigger schreibt den Löschauftrag, falls schon ein Objekt liegt; das
  -- Journal hält die Löschung über eine Wiederherstellung (ADR-008 Punkt 8).
  delete from public.staff_reimbursement_receipts b
   where b.id = p_receipt_id and b.organization_id = v_org and b.created_by = auth.uid()
     and b.reimbursement_id is null
  returning b.id into v_id;
  if v_id is null then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.record_reimbursement_receipt_verification(p_receipt_id uuid, p_content_type_ok boolean, p_checksum_ok boolean, p_metadata_ok boolean)
returns text
language plpgsql security definer
set search_path to ''
as $$
declare
  v_beleg public.staff_reimbursement_receipts%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select b.* into v_beleg from public.staff_reimbursement_receipts b
   where b.id = p_receipt_id for update;
  -- Ein zugeordneter Beleg wird nicht mehr geprüft: Er hängt an einem Antrag.
  if not found or v_beleg.reimbursement_id is not null then
    return 'not_found';
  end if;
  if v_beleg.verified_at is not null then
    return 'already_verified';
  end if;
  if v_beleg.status <> 'ready' and v_beleg.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;
  -- Bilder bekommen ein Metadatenergebnis, PDF nicht (Punkt 49).
  if (v_beleg.mime_type in ('image/jpeg', 'image/png')) <> (p_metadata_ok is not null) then
    raise exception 'metadata result does not match the media type' using errcode = '22023';
  end if;

  if p_content_type_ok and p_checksum_ok and coalesce(p_metadata_ok, true) then
    update public.staff_reimbursement_receipts
       set verified_at = now(),
           status = 'ready',
           confirmed_at = coalesce(confirmed_at, now())
     where id = p_receipt_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heißt verwerfen; der Trigger schreibt den Löschauftrag,
  -- das Journal hält es über eine Wiederherstellung (Punkt 26).
  delete from public.staff_reimbursement_receipts where id = p_receipt_id;
  return 'rejected';
end;
$$;

create or replace function public.appointments_training_protocol_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.kind <> 'training' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'documented' and not exists (
    select 1 from public.training_protocols p
    where p.appointment_id = new.id and p.status = 'final'
  ) then
    raise exception 'training appointment is documented only by a finalized training protocol'
      using errcode = '23514';
  end if;

  if new.status in ('cancelled', 'no_show') then
    if exists (
      select 1 from public.training_protocols p
      where p.appointment_id = new.id and p.status = 'final'
    ) then
      raise exception 'finalized training protocol exists for this appointment' using errcode = '22023';
    end if;

    -- ANN-186: Absage und Nichtantreffen sagen, dass die Einheit nicht stattgefunden hat; ein
    -- Entwurf daran fällt mit. Ins Löschjournal trägt ihn der Auslöser ein, tageweise und nicht
    -- ins Auditlog (ANN-752); die Oberfläche warnt vorher.
    delete from public.training_protocols p
     where p.appointment_id = new.id and p.status = 'draft';
  end if;

  return new;
end;
$$;

-- Eine eigene Klasse bleibt als Eintrag ohne Lauf.
create or replace function public.undo_appointment_creation(p_appointment_id uuid, p_expected_updated_at timestamp with time zone)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_termin record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Rollenmenge wie beim Anlegen (create_appointment).
  if not app.can_create_appointment() then
    raise exception 'not allowed to undo appointment creation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to undo appointment creation' using errcode = '42501';
  end if;

  if p_appointment_id is null or p_expected_updated_at is null then
    raise exception 'appointment and expected updated_at are required' using errcode = '22023';
  end if;

  -- Gesperrt bis zum Ende der Transaktion: Wer gleichzeitig etwas an den
  -- Termin haengt (Fremdschluessel), wartet - und danach sieht die Pruefung
  -- unten seine Zeile, oder sein Eintrag scheitert am fehlenden Termin.
  select a.id, a.kind, a.status, a.patient_id, a.created_by, a.created_at, a.updated_at
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- ANN-534: nur, wer angelegt hat - auch owner nimmt fremde Termine nicht
  -- zurueck; dafuer gibt es die Absage.
  if v_termin.created_by is distinct from v_actor then
    raise exception 'not allowed to undo appointment creation' using errcode = '42501';
  end if;

  -- ANN-534: hoechstens 15 Minuten nach dem Anlegen.
  if now() - v_termin.created_at > interval '15 minutes' then
    raise exception 'undo window has passed' using errcode = '22023';
  end if;

  -- Nur der Stand, den die Aufrufende kennt: Jeder Schreibweg setzt updated_at neu, sonst fielen
  -- eine neue Person, ein anderer Ort oder ein anderes Ende still mit. Eine Übertragung auf eine andere
  -- Grundlage lässt updated_at stehen; sie fällt mit, der Termin hat weder Doku noch Leistung (ANN-534).
  if v_termin.updated_at is distinct from p_expected_updated_at
     or v_termin.updated_at is distinct from v_termin.created_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Nur, was create_appointment anlegt: ein Behandlungstermin, noch geplant.
  if v_termin.kind <> 'therapy' or v_termin.status <> 'confirmed' then
    raise exception 'appointment creation cannot be undone' using errcode = '22023';
  end if;

  if exists (select 1 from public.treatment_notes x where x.appointment_id = p_appointment_id)
     or exists (
       select 1 from public.treatment_draft_findings x where x.appointment_id = p_appointment_id
     )
     or exists (select 1 from public.billable_services x where x.appointment_id = p_appointment_id)
     or exists (
       select 1 from public.appointment_session_fees x where x.appointment_id = p_appointment_id
     )
     or exists (select 1 from public.training_protocols x where x.appointment_id = p_appointment_id)
     or exists (
       select 1 from public.appointment_call_states x where x.appointment_id = p_appointment_id
     )
     or exists (
       select 1 from public.waitlist_entries x where x.placed_appointment_id = p_appointment_id
     )
     or exists (
       select 1 from public.platform_appointment_requests x
       where x.appointment_id = p_appointment_id or x.resulting_appointment_id = p_appointment_id
     )
     -- Eine Serie (create_appointment_series) entsteht in einer Transaktion:
     -- dieselbe Person, derselbe Zeitpunkt now(). Die Serie ist keine
     -- Entitaet (ADR-018 Punkt 5) - erkennbar ist sie nur daran.
     or exists (
       select 1 from public.appointments b
       where b.organization_id = v_org
         and b.created_by = v_termin.created_by
         and b.created_at = v_termin.created_at
         and b.id <> p_appointment_id
     ) then
    raise exception 'appointment creation cannot be undone' using errcode = '22023';
  end if;

  -- Mitgeteilt ist mitgeteilt: von Hand (Mitteilungsvermerk) oder
  -- als Benachrichtigung, die zugestellt ist oder gerade versandt wird
  -- (abgeholt, noch ohne Ergebnis).
  perform 1
  from public.notification_deliveries d
  where d.subject_id = p_appointment_id
    and d.kind in ('appointment_reminder', 'appointment_changed', 'appointment_cancelled')
  for update;

  if exists (
       select 1 from public.appointment_notifications x where x.appointment_id = p_appointment_id
     )
     or exists (
       select 1 from public.notification_deliveries d
       where d.subject_id = p_appointment_id
         and d.kind in ('appointment_reminder', 'appointment_changed', 'appointment_cancelled')
         and (d.state = 'sent' or (d.state = 'pending' and d.claimed_at is not null))
     ) then
    raise exception 'patient already notified' using errcode = '22023';
  end if;

  -- Sieht die Person ihre Termine auf der Plattform, eigener Zugang oder Begleitung, hat sie diesen
  -- womöglich gesehen: Er fällt nicht still weg (ADR-018 Punkt 2), die Oberfläche sagt ihn als Praxis
  -- ab. Ebenso bei einem seit dem Anlegen gesperrten oder entzogenen Zugang; bis dahin war er sichtbar.
  if exists (
    select 1 from public.platform_accesses z
    where z.organization_id = v_org
      and z.relationship_kind = 'treatment'
      and z.patient_id = v_termin.patient_id
      and (z.status = 'active'
           or z.locked_at >= v_termin.created_at
           or z.revoked_at >= v_termin.created_at)
  ) then
    raise exception 'appointment is visible on the platform' using errcode = '22023';
  end if;

  -- Offene, verworfene und aufgegebene Auftraege fallen mit dem Termin.
  delete from public.notification_deliveries d
   where d.subject_id = p_appointment_id
     and d.kind in ('appointment_reminder', 'appointment_changed', 'appointment_cancelled');

  delete from public.appointments a where a.id = p_appointment_id;

  -- Ohne Lauf, also tageweise (ANN-752). Die Klasse ist die des abgesagten Termins ohne Nachweis;
  -- eine eigene für Verworfenes wäre ein eigener Auftrag (ANN-534).
  insert into public.deletion_journal (organization_id, target_table, target_id, retention_class)
  values (v_org, 'appointments', p_appointment_id, 'termin_ohne_nachweis');
end;
$$;

create or replace function app.journal_patient_file_deletion(p_organization_id uuid, p_file_id uuid, p_document_type text)
returns void
language sql
set search_path to ''
as $$
  -- Ohne Lauf, also tageweise (ANN-752); die Klasse trennt die Foto-Arbeitshilfe von der Akte.
  insert into public.deletion_journal (organization_id, target_table, target_id, retention_class)
  values (
    p_organization_id, 'patient_files', p_file_id,
    case when p_document_type = 'patientenfoto' then 'patientenfoto' else 'patientenakte' end
  )
$$;

comment on function app.journal_patient_file_deletion(uuid, uuid, text) is
  'BEF-170: Eintrag im Löschjournal für eine einzeln gelöschte Datei der Akte (ADR-008 Punkt 8, ADR-017 Punkt 26). Klasse patientenfoto für die Foto-Arbeitshilfe, sonst patientenakte; ohne Lauf, also tageweise (ANN-752). Nicht für Clients.';

-- Wer Fotos oder Anhänge von Hand löscht, gibt keinen Lauf mit.
create or replace function public.delete_message_attachment(p_attachment_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anhang  public.platform_message_attachments%rowtype;
  v_vorgang public.platform_messages%rowtype;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select x.* into v_anhang
  from public.platform_message_attachments x
  where x.id = p_attachment_id and x.organization_id = app.current_organization_id()
    and x.status = 'ready' and x.locked_at is null;
  if v_anhang.id is null then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select m.* into v_vorgang from public.platform_messages m where m.id = v_anhang.message_id;
  if not app.can_read_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  if not app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'not allowed to delete this attachment' using errcode = '42501';
  end if;

  perform app.remove_message_attachments(
    v_anhang.organization_id, 'attachment', v_anhang.id, null);
end;
$$;

create or replace function public.delete_platform_message_attachment(p_access_id uuid, p_attachment_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  -- "Jederzeit": auch nach der Lesefrist, solange der eigene Zugang aktiv ist
  -- (wie der Widerruf, ANN-261).
  if not (app.platform_access_allows(p_access_id, 'attach')
          or app.platform_own_access_after_reading(p_access_id)) then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select x.* into v_anhang
  from public.platform_message_attachments x
  join public.platform_messages m on m.id = x.message_id
  join public.platform_accesses a on a.id = p_access_id
  where x.id = p_attachment_id
    and m.organization_id = a.organization_id
    and m.relationship_kind = a.relationship_kind
    and m.relationship_id = a.relationship_id
    and x.status = 'ready'
    and x.locked_at is null;
  if v_anhang.id is null then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;

  perform app.remove_message_attachments(
    v_anhang.organization_id, 'attachment', v_anhang.id, null);
  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
end;
$$;

create or replace function public.record_message_attachment_verification(p_attachment_id uuid, p_content_type_ok boolean, p_checksum_ok boolean, p_metadata_ok boolean, p_no_audio_ok boolean)
returns text
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null or p_metadata_ok is null
     or p_no_audio_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select x.* into v_anhang
  from public.platform_message_attachments x
  where x.id = p_attachment_id
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_anhang.verified_at is not null then
    return 'already_verified';
  end if;
  if v_anhang.status <> 'ready' and v_anhang.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;

  if p_content_type_ok and p_checksum_ok and p_metadata_ok and p_no_audio_ok then
    update public.platform_message_attachments
       set verified_at = now(),
           -- Ohne scharfe Virenpruefung ist der Anhang damit fertig; mit ihr
           -- wartet er auf deren Ergebnis (Punkt 69).
           status = case when app.message_attachment_scan_required() then status else 'ready' end,
           confirmed_at = case when app.message_attachment_scan_required() then confirmed_at
                               else coalesce(confirmed_at, now()) end
     where id = p_attachment_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heisst verwerfen. Unter Legal Hold gesperrt statt
  -- geloescht (ANN-335). Kein Auditeintrag (ANN-334).
  perform app.remove_message_attachments(
    v_anhang.organization_id, 'attachment', v_anhang.id, null);
  return 'rejected';
end;
$$;

create or replace function public.record_patient_privacy_entry(p_patient_id uuid, p_record_kind text, p_purpose text, p_notice_version text, p_occurred_on date)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_letzte   record;
  v_id       uuid;
  v_zeit     timestamptz;
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

  -- ADR-017 Punkt 61, ANN-333: Die Einwilligung zu Anhaengen an
  -- Rueckfragen erteilt die Person auf der Plattform, wenn sie zum ersten Mal
  -- etwas anhaengen will. Die Praxis vermerkt nur den Widerruf vom Papier.
  if p_purpose = 'message_attachments' and p_record_kind <> 'consent_withdrawn' then
    raise exception 'this consent is given on the platform' using errcode = '22023';
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
  -- Der neue Vermerk ist der juengste, auch wenn
  -- ein gleichzeitiger Aufruf spaeter begann und vorher schrieb.
  select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
  from public.patient_privacy_records r
  where r.patient_id = p_patient_id;
  v_zeit := coalesce(v_zeit, now());

  insert into public.patient_privacy_records (
    organization_id, patient_id, record_kind, purpose, notice_version,
    occurred_on, recorded_by, recorded_at
  )
  values (
    v_org, p_patient_id, p_record_kind, p_purpose, p_notice_version,
    p_occurred_on, v_actor, v_zeit
  )
  returning id into v_id;

  -- Punkt 36: Der Widerruf der Fotoeinwilligung sperrt sofort und loescht in
  -- derselben Transaktion - Zeilen, Loeschauftraege, Loeschjournal. Unter
  -- Legal Hold bleiben die Fotos gesperrt stehen (release_legal_hold).
  if p_record_kind = 'consent_withdrawn' and p_purpose = 'patient_photos' then
    v_fotos := app.delete_due_patient_photos(
      v_org, p_patient_id, null, v_actor, 'consent_withdrawn'
    );
  end if;

  -- ADR-017 Punkt 61: Der Widerruf zu Anhaengen loescht sofort alle
  -- Anhaenge der Akte, auch vom Papier vermerkt.
  if p_record_kind = 'consent_withdrawn' and p_purpose = 'message_attachments' then
    perform app.remove_message_attachments(
      v_org, 'relationship', p_patient_id, null);
  end if;


  return v_id;
end;
$$;

create or replace function public.record_platform_consent(p_access_id uuid, p_purpose text, p_grant boolean, p_wording_version text)
returns uuid
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_zone    text;
  v_heute   date;
  v_letzte  text;
  v_zeit    timestamptz;
  v_art     text;
  v_name    text;
  v_id      uuid;
begin
  if p_grant is null then
    raise exception 'grant or withdraw' using errcode = '22023';
  end if;
  -- Erteilen nur mit dem Recht consent (Person, rechtliche Vertretung, in der
  -- Lesezeit); widerrufen zusaetzlich die Person selbst nach der Lesefrist.
  if not (app.platform_access_allows(p_access_id, 'consent')
          or (not p_grant and app.platform_own_access_after_reading(p_access_id))) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  if p_purpose is null
     or not (p_purpose = any (app.platform_consent_purposes(v_zugang.relationship_kind))) then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;
  if p_wording_version is distinct from app.platform_consent_wording_version() then
    raise exception 'wording outdated' using errcode = '22023';
  end if;

  -- Gleichzeitige Aufrufe desselben Verhaeltnisses nacheinander: Der Stand,
  -- gegen den geprueft wird, ist der, auf den geschrieben wird.
  if v_zugang.relationship_kind = 'treatment' then
    perform 1 from public.patients p
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id
    for update;
  else
    perform 1 from public.training_relationships t
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id
    for update;
  end if;
  if not found then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  if v_zugang.relationship_kind = 'treatment' then
    select r.record_kind into v_letzte
    from public.patient_privacy_records r
    where r.patient_id = v_zugang.relationship_id and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;
  else
    select r.record_kind into v_letzte
    from public.training_consent_records r
    where r.training_relationship_id = v_zugang.relationship_id and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;
  end if;

  -- Der neue Vermerk ist der juengste, auch wenn ein gleichzeitiger Aufruf
  -- spaeter begann und vorher schrieb (Zweitreview): now(), mindestens aber
  -- eine Mikrosekunde nach dem bisher juengsten.
  if v_zugang.relationship_kind = 'treatment' then
    select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
    from public.patient_privacy_records r where r.patient_id = v_zugang.relationship_id;
  else
    select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
    from public.training_consent_records r
    where r.training_relationship_id = v_zugang.relationship_id;
  end if;
  v_zeit := coalesce(v_zeit, now());

  if p_grant then
    if v_letzte is not distinct from 'consent_granted' then
      raise exception 'consent already granted' using errcode = '23514';
    end if;
    v_art := 'consent_granted';
  else
    if v_letzte is distinct from 'consent_granted' then
      raise exception 'no consent to withdraw' using errcode = '23514';
    end if;
    v_art := 'consent_withdrawn';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date;
  v_name := case when v_zugang.access_kind = 'legal_representative'
                 then v_zugang.representative_name end;

  if v_zugang.relationship_kind = 'treatment' then
    insert into public.patient_privacy_records (
      organization_id, patient_id, record_kind, purpose, occurred_on, recorded_by, recorded_at,
      source, platform_access_id, platform_access_kind, representative_name, wording_version
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
      v_zeit,
      'platform', v_zugang.id, v_zugang.access_kind, v_name, p_wording_version
    )
    returning id into v_id;

    -- ADR-017 Punkt 36: Der Widerruf der Fotoeinwilligung loescht sofort.
    if v_art = 'consent_withdrawn' and p_purpose = 'patient_photos' then
      perform app.delete_due_patient_photos(
        v_zugang.organization_id, v_zugang.relationship_id, null,
        auth.uid(), 'consent_withdrawn'
      );
    end if;
  else
    insert into public.training_consent_records (
      organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by,
      recorded_at, source, platform_access_id, platform_access_kind, representative_name,
      wording_version
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
      v_zeit,
      'platform', v_zugang.id, v_zugang.access_kind, v_name, p_wording_version
    )
    returning id into v_id;
  end if;

  -- ADR-017 Punkt 61: Der Widerruf der Einwilligung zu Anhaengen loescht sofort alle Anhaenge des
  -- Verhaeltnisses, in derselben Transaktion, mit Loeschjournal und Loeschauftraegen; unter Legal
  -- Hold gesperrt (ANN-335).
  if v_art = 'consent_withdrawn' and p_purpose = 'message_attachments' then
    perform app.remove_message_attachments(
      v_zugang.organization_id, 'relationship', v_zugang.relationship_id, null);
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', case when p_grant then 'consent_granted' else 'consent_withdrawn' end)
  );
  return v_id;
end;
$$;

create or replace function public.release_legal_hold(p_hold_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor        uuid;
  v_org          uuid;
  v_subject      uuid;
  v_subject_type text;
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

  select h.subject_id, h.subject_type into v_subject, v_subject_type
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

  -- Punkt 36: Was der Hold gesperrt gehalten hat, faellt, sobald er endet -
  -- nicht erst im naechsten Loeschlauf.
  if v_subject_type = 'patient' then
    perform app.delete_due_patient_photos(
      v_org, v_subject, null, v_actor, 'legal_hold_released'
    );
  end if;
end;
$$;

create or replace function public.reopen_patient_care(p_patient_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_bisher date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_conclude_patient_care() then
    raise exception 'not allowed to conclude patient care' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to conclude patient care' using errcode = '42501';
  end if;

  select p.care_concluded_on into v_bisher
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Kein Abschluss, kein Vorgang: weder Schreibzugriff noch Auditeintrag.
  if v_bisher is null then
    return;
  end if;

  perform app.delete_due_patient_photos(
    v_org, p_patient_id, null, v_actor, 'care_reopened'
  );

  update public.patients
     set care_concluded_on = null,
         care_concluded_at = null,
         care_concluded_by = null
   where id = p_patient_id;

end;
$$;

create or replace function app.merge_patients_core(p_org uuid, p_source uuid, p_target uuid, p_actor uuid, p_merged_at timestamp with time zone, p_nachziehen boolean)
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_plan      jsonb;
  v_quelle    public.patients%rowtype;
  v_ziel      public.patients%rowtype;
  v_person    uuid;
  v_status    text;
  v_ende_on   date;
  v_ende_at   timestamptz;
  v_ende_by   uuid;
  v_beginn    date;
  v_anschrift boolean;
  v_fotos     integer := 0;
  v_pause     text := coalesce(current_setting('app.journal_paused', true), '');
begin
  -- Beide Akten sperren, in fester Reihenfolge: Zwei gleichzeitige Vorgänge über dasselbe Paar
  -- warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source, p_target)
    and p.organization_id = p_org
  order by p.id
  for update;
  -- Dieselbe Sperre je Person wie beim Anlegen eines Ernährungsprofils, nach den Zeilensperren:
  -- So entsteht zwischen Plan und Umzug keine zweite laufende Beratung (ADR-027 Punkt 1).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition:' || p.person_id::text, 0))
  from public.patients p
  where p.id in (p_source, p_target)
    and p.organization_id = p_org
  order by p.person_id;

  select * into v_quelle from public.patients p
  where p.id = p_source and p.organization_id = p_org;
  select * into v_ziel from public.patients p
  where p.id = p_target and p.organization_id = p_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(p_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Die Dublette fällt als Zusammenführung, nicht als Löschung (ANN-150): Der Auslöser des
  -- Journals schweigt; fällige Fotos tragen ihre Einträge selbst ein.
  perform pg_catalog.set_config('app.journal_paused', 'on', true);

  -- Was vor dem Zusammenführen schon fällig war, fällt unter dem Stand, der es fällig gemacht hat
  -- (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    p_org, v_quelle.id, null, p_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    p_org, v_ziel.id, null, p_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben gelöschtes Foto ist nicht mitgewandert.
  v_plan := app.patient_merge_plan(p_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147)
  if exists (select 1 from public.patient_contact_details c where c.patient_id = v_ziel.id) then
    select coalesce(z.street, z.house_number, z.postal_code, z.city) is null
       and coalesce(q.street, q.house_number, q.postal_code, q.city) is not null
      into v_anschrift
    from public.patient_contact_details z
    left join public.patient_contact_details q on q.patient_id = v_quelle.id
    where z.patient_id = v_ziel.id;

    update public.patient_contact_details z
       set date_of_birth = coalesce(z.date_of_birth, q.date_of_birth),
           email         = coalesce(z.email, q.email),
           phone         = coalesce(z.phone, q.phone),
           phone_mobile  = coalesce(z.phone_mobile, q.phone_mobile),
           phone_work    = coalesce(z.phone_work, q.phone_work),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Auslöser die Koordinate bei jeder Adressänderung leert: Die
    -- Anschrift kommt mit ihrer Verortung.
    if v_anschrift then
      update public.patient_contact_details z
         set lat = q.lat, lon = q.lon, geocode_precision = q.geocode_precision
        from public.patient_contact_details q
       where z.patient_id = v_ziel.id
         and q.patient_id = v_quelle.id;
    end if;
  else
    update public.patient_contact_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  if exists (select 1 from public.patient_care_details d where d.patient_id = v_ziel.id) then
    update public.patient_care_details z
       set primary_therapist_staff_member_id =
             coalesce(z.primary_therapist_staff_member_id, q.primary_therapist_staff_member_id),
           treatment_table_required = coalesce(z.treatment_table_required, q.treatment_table_required),
           home_visit_access_note = app.merge_note(z.home_visit_access_note, q.home_visit_access_note),
           special_note           = app.merge_note(z.special_note, q.special_note),
           remark                 = app.merge_note(z.remark, q.remark),
           take_along_items       = app.merge_take_along(z.take_along_items, q.take_along_items)
      from public.patient_care_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;
  else
    update public.patient_care_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  -- Der Bezug wechselt. Zwei Standardempfänger gibt es nicht; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  -- Was überlappt (Vereinbarungen, Abos, laufende Beratungen, Entwürfe), sperrt schon der Plan.
  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.aftercare_subscriptions      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.training_offers              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.exercise_plans               set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Rückfragen, Terminwünsche, Check-ins, Gewohnheiten und Ernährungsprofile ziehen samt
  -- Verhältnis mit, sonst fielen sie mit der Dublette (cascade).
  update public.platform_messages
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.platform_appointment_requests
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.checkins
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- Den Takt behält die bleibende Akte; hat sie keinen, zieht der der Dublette mit (ANN-350).
  if exists (select 1 from public.checkin_schedules s where s.patient_id = v_ziel.id) then
    delete from public.checkin_schedules where patient_id = v_quelle.id;
  else
    update public.checkin_schedules
       set patient_id = v_ziel.id, relationship_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;
  -- Mehr als drei laufende Gewohnheiten sind danach möglich; die Grenze gilt beim Eintragen
  -- (ANN-370).
  update public.habits
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- Ernährungsprofile ohne Zähler im Vermerk: Den lesen auch Rollen ohne die Fähigkeit (ADR-027
  -- Punkt 4).
  update public.nutrition_profiles
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  -- Beendete Zugänge ziehen mit, sonst stünden sie in keiner Auskunft (ANN-753); ihre Einladungen
  -- hängen am Zugang. Einen laufenden sperrt der Plan.
  update public.platform_accesses
     set patient_id = v_ziel.id, relationship_id = v_ziel.id
   where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schützt; alle Gründe bleiben wirksam (ANN-150).
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Frühere Nachweise der Dublette ziehen mit.
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148)
  v_status := case
    when v_quelle.status = 'active' or v_ziel.status = 'active' then 'active'
    else 'inactive'
  end;
  v_beginn := least(v_quelle.care_started_on, v_ziel.care_started_on);

  if v_quelle.care_concluded_on is null or v_ziel.care_concluded_on is null then
    null;
  elsif (v_quelle.care_concluded_on, v_quelle.care_concluded_at)
        > (v_ziel.care_concluded_on, v_ziel.care_concluded_at) then
    v_ende_on := v_quelle.care_concluded_on;
    v_ende_at := v_quelle.care_concluded_at;
    v_ende_by := v_quelle.care_concluded_by;
  else
    v_ende_on := v_ziel.care_concluded_on;
    v_ende_at := v_ziel.care_concluded_at;
    v_ende_by := v_ziel.care_concluded_by;
  end if;

  update public.patients
     set status            = v_status,
         care_started_on   = v_beginn,
         care_concluded_on = v_ende_on,
         care_concluded_at = v_ende_at,
         care_concluded_by = v_ende_by
   where id = v_ziel.id;

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein Widerruf in der einen trifft
  -- die älteren Fotos der anderen, sofort wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    p_org, v_ziel.id, null, p_actor, 'patient_merged'
  );

  -- Die leere Akte fällt samt Kontakt und Versorgungsangaben, soweit sie eingeflossen sind; die
  -- Person nur, wenn nichts anderes an ihr hängt (ANN-150).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  perform pg_catalog.set_config('app.journal_paused', v_pause, true);

  -- Nachweis an der bleibenden Akte, so lange wie sie: nicht allein im Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted,
    merged_at
  )
  values (p_org, v_ziel.id, v_quelle.id, p_actor, v_plan -> 'counts', v_fotos, p_merged_at);

  -- Und im Löschjournal, das eine Wiederherstellung überdauert; beim Nachziehen steht er schon.
  if not p_nachziehen then
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at, merged_into)
    values (p_org, extensions.gen_random_uuid(), 'patients', v_quelle.id, 'patientenakte', now(),
            v_ziel.id);
  end if;

  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$$;

comment on function app.delete_due_patient_photos(uuid, uuid, uuid, uuid, text) is
  'Löscht fällige Patientenfotos einer Organisation (optional einer Patient:in), auch laufende Uploads, mit Löschjournal und ohne Auditeintrag; unter Legal Hold hält sie die Sperre in photo_locked_at fest (ADR-017 Punkt 36 und 38). Ohne Lauf (p_run_id null) eine Löschung von Hand, tageweise im Journal (ANN-752). Nur für Einwilligung, Legal Hold, Wiederaufnahme, Zusammenführen und apply_retention.';

comment on function app.remove_message_attachments(uuid, text, uuid, uuid) is
  'KOM-005 (ADR-017 Punkte 61, 65, 67; ANN-335): löscht Anhänge mit Löschjournal - einen, alle eines Verhältnisses (Widerruf) oder die fälligen (Lauf). Ohne Lauf (p_run_id null) tageweise im Journal (ANN-752). Unter Legal Hold der Akte gesperrt statt gelöscht. Der Trigger schreibt die Löschaufträge für die Objekte.';

-- Der tägliche Lauf für nicht zugeordnete Belege gab jedem Beleg eine eigene Kennung.
create or replace function public.discard_stale_reimbursement_receipts()
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anzahl integer;
  -- Ein Lauf je Aufruf, nicht je Beleg (list_deletion_runs).
  v_lauf   uuid := extensions.gen_random_uuid();
begin
  -- Mit Journal: Nach einer Wiederherstellung fallen sie erneut (ADR-008
  -- Punkt 8), statt bis zum nächsten Lauf wieder zuordenbar zu sein.
  with geloescht as (
    delete from public.staff_reimbursement_receipts
     where reimbursement_id is null
       and created_at < now() - interval '24 hours'
    returning id, organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, v_lauf, 'staff_reimbursement_receipts', g.id,
         'erstattung', now()
  from geloescht g;
  get diagnostics v_anzahl = row_count;
  -- Abgelaufene, nicht verbrauchte Lesefreigaben hielten sonst fest, wer
  -- wann welchen Beleg öffnen wollte (PROJECT_PRINCIPLES.md 20).
  delete from public.staff_reimbursement_receipt_access_grants where expires_at <= now();
  return v_anzahl;
end;
$$;
