-- =============================================================================
-- PRX-017: Zwei Akten derselben Person werden eine (PRX-EPIC-003b, IDEA-PRX-018)
--
-- Der Hinweis beim Anlegen (PRX-015) verhindert nicht jede Dublette. Hier
-- fuehrt owner eine Dublette in die richtige Akte ueber - auditiert, nie
-- automatisch.
--
--   * DER BEZUG WECHSELT, DER INHALT NICHT. Termine (und mit ihnen
--     Dokumentation, Versionen, Anrufstand), Grundlagen, Leistungen,
--     Rechnungen samt ausgestellten, Rechnungsempfaenger, Dateien und Fotos,
--     Datenschutzvermerke, Frageboegen, Verlaufsereignisse, Therapieberichte,
--     Aufgaben, Warteliste und Legal Holds bekommen die Kennung der bleibenden
--     Akte. Sonst aendert sich an ihnen nichts: kein Snapshot, kein
--     Objektschluessel, keine Version, keine Koordinate eines Termins.
--   * UNVERAENDERLICHES BLEIBT UNVERAENDERLICH. Ausgestellte Rechnungen,
--     abgeschlossene Berichte und Frageboegen duerfen ausschliesslich
--     patient_id wechseln, und nur waehrend merge_patients laeuft
--     (app.patient_merge_active, transaktionslokal wie app.event_group_update).
--     Angemeldete Konten haben an keiner dieser Tabellen ein Schreibrecht; die
--     Kennung ist nur aus SECURITY-DEFINER-Funktionen erreichbar.
--   * STAMMDATEN (ANN-147): Die bleibende Akte behaelt ihre Werte, leere Felder
--     fuellt die Dublette, die Anschrift nur als Ganzes. Freitexte werden bei
--     Abweichung angehaengt, "Mitnehmen" wird vereinigt.
--   * VERSORGUNGSSTAND (ANN-148): aktiv, wenn eine der beiden aktiv ist; ein
--     Abschluss bleibt nur, wenn beide abgeschlossen sind, dann der spaetere.
--   * SPERREN STATT RATEN (ANN-149): zwei Rechnungsentwuerfe fuer denselben
--     Monat und Bereich, zwei offene Wartelisteneintraege ohne Grundlage, ein
--     Konto an der Dublette, ein zu langer zusammengefuegter Freitext.
--   * LEGAL HOLD (ANN-150): folgt den Daten. Sind beide Akten gesperrt, wird
--     die Sperre der Dublette aufgehoben und bleibt als Nachweis stehen;
--     place_legal_hold wartet auf ein laufendes Zusammenfuehren.
--   * NACHWEIS (ANN-150): patient.merged an der bleibenden Akte mit der
--     Kennung der Dublette und den Zaehlern, ohne Namen und Inhalt. Die leere
--     Akte faellt; ihre Person nur, wenn nichts anderes an ihr haengt.
--     Nicht rueckgaengig.
--   * FOTOS (ADR-017 Punkt 36): Die Einwilligungsvermerke beider Akten gelten
--     danach gemeinsam. Was dadurch faellig wird, faellt in derselben
--     Transaktion, wie beim Widerruf; ein Legal Hold haelt an.
--   * WER: nur owner (IDEA-PRX-018). Ein abgewiesener Versuch ueberlebt als
--     denied-Eintrag mit HTTP 403 (G6c, ANN-115).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Die Kennung waehrend des Zusammenfuehrens
-- -----------------------------------------------------------------------------
create function app.patient_merge_active()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.patient_merge', true), '') = 'on';
$$;

comment on function app.patient_merge_active() is
  'Laeuft gerade merge_patients? Nur dort gesetzt, transaktionslokal (PRX-017). Erlaubt an unveraenderlichen Zeilen ausschliesslich den Wechsel von patient_id.';

-- Hat sich an der Zeile ausser patient_id etwas geaendert?
create function app.only_patient_id_changed(p_new jsonb, p_old jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_new - 'patient_id') = (p_old - 'patient_id');
$$;

comment on function app.only_patient_id_changed(jsonb, jsonb) is
  'Vergleicht zwei Zeilenstaende ohne patient_id (PRX-017).';

revoke all on function app.patient_merge_active() from public, anon;
revoke all on function app.only_patient_id_changed(jsonb, jsonb) from public, anon;

-- -----------------------------------------------------------------------------
-- Unveraenderliche Zeilen: nur der Bezug darf wechseln, nur beim Zusammenfuehren
-- -----------------------------------------------------------------------------
create or replace function app.invoices_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'issued' then
    -- PRX-017: Die ausgestellte Rechnung wandert, ihr Inhalt nicht.
    if app.patient_merge_active()
       and app.only_patient_id_changed(to_jsonb(new), to_jsonb(old)) then
      return new;
    end if;
    raise exception 'an issued invoice cannot be changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function app.therapy_report_unveraenderlich()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'abgeschlossen' then
    if app.patient_merge_active()
       and app.only_patient_id_changed(to_jsonb(new), to_jsonb(old)) then
      return new;
    end if;
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function app.guard_questionnaire_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.patient_merge_active()
     and app.only_patient_id_changed(to_jsonb(new), to_jsonb(old)) then
    return new;
  end if;
  if old.status = 'abgeschlossen' then
    raise exception 'questionnaire response is completed' using errcode = '23514';
  end if;
  if new.organization_id <> old.organization_id
     or new.patient_id <> old.patient_id
     or new.instrument_id <> old.instrument_id
     or new.definition_version <> old.definition_version
     or new.supersedes_response_id is distinct from old.supersedes_response_id then
    raise exception 'questionnaire response identity is fixed' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Die Koordinate eines Termins ist beim Zusammenfuehren kein neuer Hausbesuch:
-- Sie bleibt, wie sie war, statt aus der Anschrift der bleibenden Akte neu
-- abgeleitet oder geleert zu werden.
create or replace function app.copy_visit_coordinate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat       double precision;
  v_lon       double precision;
  v_precision text;
begin
  if tg_op = 'UPDATE'
     and app.patient_merge_active()
     and app.only_patient_id_changed(to_jsonb(new), to_jsonb(old)) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.visit_street       is not distinct from old.visit_street
     and new.visit_house_number is not distinct from old.visit_house_number
     and new.visit_postal_code  is not distinct from old.visit_postal_code
     and new.visit_city         is not distinct from old.visit_city
     and new.patient_id         is not distinct from old.patient_id then
    return new;
  end if;

  new.visit_lat := null;
  new.visit_lon := null;
  new.visit_geocode_precision := null;

  if new.visit_street is null or new.patient_id is null then
    return new;
  end if;

  select c.lat, c.lon, c.geocode_precision
    into v_lat, v_lon, v_precision
  from public.patient_contact_details c
  where c.patient_id = new.patient_id
    and c.organization_id = new.organization_id
    and c.street       is not distinct from new.visit_street
    and c.house_number is not distinct from new.visit_house_number
    and c.postal_code  is not distinct from new.visit_postal_code
    and c.city         is not distinct from new.visit_city
    and c.lat is not null;

  if found then
    new.visit_lat := v_lat;
    new.visit_lon := v_lon;
    new.visit_geocode_precision := v_precision;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auditkatalog: patient.merged
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text])));

-- -----------------------------------------------------------------------------
-- app.can_merge_patients - nur owner (IDEA-PRX-018)
-- -----------------------------------------------------------------------------
create function app.can_merge_patients()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner')
$$;

comment on function app.can_merge_patients() is
  'Rollen, die eine Dublette zusammenfuehren duerfen: nur owner (PRX-017, IDEA-PRX-018).';

grant execute on function app.can_merge_patients() to authenticated;

-- -----------------------------------------------------------------------------
-- Freitexte zusammenfuegen (ANN-147): gleich oder leer -> einer; sonst beide,
-- durch eine Leerzeile getrennt, die bleibende Akte zuerst.
-- -----------------------------------------------------------------------------
create function app.merge_note(p_target text, p_source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source is null or btrim(p_source) = '' then p_target
    when p_target is null or btrim(p_target) = '' then p_source
    when btrim(p_target) = btrim(p_source) then p_target
    else p_target || E'\n\n' || p_source
  end
$$;

-- "Mitnehmen" vereinigt, ohne Doppel in anderer Schreibung; die bleibende
-- Akte zuerst.
create function app.merge_take_along(p_target text[], p_source text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(e.eintrag order by e.rang, e.pos), '{}'::text[])
  from (
    select distinct on (lower(x.eintrag)) x.eintrag, x.rang, x.pos
    from (
      select t.eintrag, 1 as rang, t.pos
      from unnest(coalesce(p_target, '{}'::text[])) with ordinality as t(eintrag, pos)
      union all
      select s.eintrag, 2 as rang, s.pos
      from unnest(coalesce(p_source, '{}'::text[])) with ordinality as s(eintrag, pos)
    ) x
    order by lower(x.eintrag), x.rang, x.pos
  ) e
$$;

revoke all on function app.merge_note(text, text) from public, anon;
revoke all on function app.merge_take_along(text[], text[]) from public, anon;

-- -----------------------------------------------------------------------------
-- app.patient_merge_plan - was das Zusammenfuehren taete
--
-- Eine Stelle fuer Vorschau und Vorgang: Kopfdaten beider Akten, die Zahl der
-- Zeilen, die wandern, die Felder, in denen beide Akten verschiedene Werte
-- tragen (die bleibende gewinnt), die Freitexte, die angehaengt werden, und
-- die Sperrgruende (ANN-149). Prueft keine Rolle - gehoert den beiden
-- oeffentlichen Funktionen.
-- -----------------------------------------------------------------------------
create function app.patient_merge_plan(
  p_organization_id uuid,
  p_source          uuid,
  p_target          uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quelle     record;
  v_ziel       record;
  v_konflikte  text[] := '{}';
  v_angehaengt text[] := '{}';
  v_sperren    text[] := '{}';
  v_zaehler    jsonb;
  v_text       text;
  v_feld       text;
begin
  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work, c.fax,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_quelle
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_source and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work, c.fax,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_ziel
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_target and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Felder, in denen beide Akten etwas anderes tragen: Die bleibende gewinnt,
  -- die Vorschau zeigt beide (ANN-147). Die Anschrift zaehlt als ein Feld.
  foreach v_feld in array array[
    'given_name', 'family_name', 'date_of_birth', 'email', 'phone', 'phone_mobile',
    'phone_work', 'fax', 'institution', 'primary_therapist_staff_member_id',
    'treatment_table_required'
  ] loop
    if (to_jsonb(v_quelle) ->> v_feld) is not null
       and (to_jsonb(v_ziel) ->> v_feld) is not null
       and lower(btrim(to_jsonb(v_quelle) ->> v_feld)) <> lower(btrim(to_jsonb(v_ziel) ->> v_feld)) then
      v_konflikte := v_konflikte || v_feld;
    end if;
  end loop;

  if coalesce(v_quelle.street, v_quelle.house_number, v_quelle.postal_code, v_quelle.city) is not null
     and coalesce(v_ziel.street, v_ziel.house_number, v_ziel.postal_code, v_ziel.city) is not null
     and row(lower(v_quelle.street), lower(v_quelle.house_number), v_quelle.postal_code, lower(v_quelle.city))
         is distinct from
         row(lower(v_ziel.street), lower(v_ziel.house_number), v_ziel.postal_code, lower(v_ziel.city)) then
    v_konflikte := v_konflikte || 'address'::text;
  end if;

  -- Freitexte: angehaengt, nie verworfen - aber nie ueber die Grenze der
  -- Spalte hinaus gekuerzt. Dann sperrt der Vorgang (ANN-149).
  v_text := app.merge_note(v_ziel.home_visit_access_note, v_quelle.home_visit_access_note);
  if v_text is distinct from v_ziel.home_visit_access_note and v_ziel.home_visit_access_note is not null then
    v_angehaengt := v_angehaengt || 'home_visit_access_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.special_note, v_quelle.special_note);
  if v_text is distinct from v_ziel.special_note and v_ziel.special_note is not null then
    v_angehaengt := v_angehaengt || 'special_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.remark, v_quelle.remark);
  if v_text is distinct from v_ziel.remark and v_ziel.remark is not null then
    v_angehaengt := v_angehaengt || 'remark'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 2000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  if not app.take_along_items_valid(
    app.merge_take_along(v_ziel.take_along_items, v_quelle.take_along_items)
  ) then
    v_sperren := v_sperren || 'take_along_too_many'::text;
  end if;

  -- Ein Konto an der Dublette: Es verloere seine Akte. Das klaert die Praxis
  -- vorher, nicht der Vorgang (ANN-149).
  if exists (
    select 1 from public.user_profiles up where up.person_id = v_quelle.person_id
  ) then
    v_sperren := v_sperren || 'source_has_account'::text;
  end if;

  -- Zwei Entwuerfe fuer denselben Monat und Bereich: Einer muss vorher weg.
  if exists (
    select 1
    from public.invoices q
    join public.invoices z
      on z.patient_id = p_target
     and z.status = 'draft'
     and z.period_month = q.period_month
     and z.service_area = q.service_area
    where q.patient_id = p_source
      and q.status = 'draft'
  ) then
    v_sperren := v_sperren || 'draft_invoice_overlap'::text;
  end if;

  -- Zwei offene Eintraege ohne Grundlage auf der Warteliste. Mit Grundlage
  -- koennen sie nicht zusammenstossen: Die Grundlagen wandern mit.
  if exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_source and w.status = 'open' and w.treatment_basis_id is null
  ) and exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_target and w.status = 'open' and w.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'open_waitlist_overlap'::text;
  end if;

  v_zaehler := jsonb_build_object(
    'appointments',
      (select count(*) from public.appointments a where a.patient_id = p_source),
    'treatment_notes',
      (select count(*) from public.treatment_notes n
         join public.appointments a on a.id = n.appointment_id
        where a.patient_id = p_source),
    'treatment_bases',
      (select count(*) from public.treatment_bases b where b.patient_id = p_source),
    'billable_services',
      (select count(*) from public.billable_services s where s.patient_id = p_source),
    'invoices',
      (select count(*) from public.invoices i where i.patient_id = p_source),
    'invoices_issued',
      (select count(*) from public.invoices i where i.patient_id = p_source and i.status = 'issued'),
    'invoice_recipients',
      (select count(*) from public.invoice_recipients r where r.patient_id = p_source),
    'patient_files',
      (select count(*) from public.patient_files f where f.patient_id = p_source),
    'privacy_records',
      (select count(*) from public.patient_privacy_records r where r.patient_id = p_source),
    'questionnaire_responses',
      (select count(*) from public.patient_questionnaire_responses r where r.patient_id = p_source),
    'course_events',
      (select count(*) from public.patient_course_events e where e.patient_id = p_source),
    'therapy_reports',
      (select count(*) from public.therapy_reports r where r.patient_id = p_source),
    'tasks',
      (select count(*) from public.tasks t where t.patient_id = p_source),
    'waitlist_entries',
      (select count(*) from public.waitlist_entries w where w.patient_id = p_source),
    'legal_holds',
      (select count(*) from public.legal_holds h
        where h.subject_type = 'patient' and h.subject_id = p_source)
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_quelle.id, 'given_name', v_quelle.given_name, 'family_name', v_quelle.family_name,
      'date_of_birth', v_quelle.date_of_birth, 'status', v_quelle.status,
      'care_concluded_on', v_quelle.care_concluded_on
    ),
    'target', jsonb_build_object(
      'id', v_ziel.id, 'given_name', v_ziel.given_name, 'family_name', v_ziel.family_name,
      'date_of_birth', v_ziel.date_of_birth, 'status', v_ziel.status,
      'care_concluded_on', v_ziel.care_concluded_on
    ),
    'counts', v_zaehler,
    'conflicts', to_jsonb(v_konflikte),
    'appended', to_jsonb(v_angehaengt),
    'blockers', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_sperren) x)
  );
end;
$$;

comment on function app.patient_merge_plan(uuid, uuid, uuid) is
  'Plan des Zusammenfuehrens (PRX-017): Kopfdaten, Zaehler je Bereich, widerspruechliche Felder, angehaengte Freitexte, Sperrgruende (ANN-147, ANN-149). Ohne Rollenpruefung; nur fuer preview_patient_merge und merge_patients.';

revoke all on function app.patient_merge_plan(uuid, uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- preview_patient_merge - die Vorschau vor dem Bestaetigen
--
-- Nicht auditiert wie eine Trefferliste: Sie zeigt Name, Geburtsdatum, Status
-- und Zahlen, keinen Inhalt; owner oeffnet die Akte ohnehin, bevor er
-- zusammenfuehrt (ADR-010). Ein abgewiesener Versuch schon.
-- -----------------------------------------------------------------------------
create function public.preview_patient_merge(
  p_source_patient_id uuid,
  p_target_patient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  return app.patient_merge_plan(v_org, p_source_patient_id, p_target_patient_id);
end;
$$;

comment on function public.preview_patient_merge(uuid, uuid) is
  'Vorschau des Zusammenfuehrens einer Dublette (PRX-017): beide Kopfdaten, Zaehler, Konflikte, angehaengte Freitexte, Sperrgruende. Nur owner; abgewiesen mit denied-Eintrag patient.merged und HTTP 403 (G6c).';

revoke all on function public.preview_patient_merge(uuid, uuid) from public, anon;
grant execute on function public.preview_patient_merge(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- merge_patients - die Dublette geht in der bleibenden Akte auf
-- -----------------------------------------------------------------------------
create function public.merge_patients(
  p_source_patient_id uuid,
  p_target_patient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_org         uuid;
  v_plan        jsonb;
  v_quelle      public.patients%rowtype;
  v_ziel        public.patients%rowtype;
  v_person      uuid;
  v_status      text;
  v_ende_on     date;
  v_ende_at     timestamptz;
  v_ende_by     uuid;
  v_beginn      date;
  v_anschrift   boolean;
  v_fotos       integer := 0;
  v_sperre      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  -- Beide Akten sperren, in fester Reihenfolge - zwei gleichzeitige Vorgaenge
  -- ueber dasselbe Paar warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source_patient_id, p_target_patient_id)
    and p.organization_id = v_org
  order by p.id
  for update;

  select * into v_quelle from public.patients p
  where p.id = p_source_patient_id and p.organization_id = v_org;
  select * into v_ziel from public.patients p
  where p.id = p_target_patient_id and p.organization_id = v_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Was vor dem Zusammenfuehren schon faellig war, faellt unter dem Stand, der
  -- es faellig gemacht hat (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_quelle.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben geloeschtes Foto ist
  -- nicht mitgewandert und steht schon in photos_deleted.
  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147) --------------------------------------------------
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
           fax           = coalesce(z.fax, q.fax),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Trigger die Koordinate bei jeder
    -- Adressaenderung leert: Die Anschrift kommt mit ihrer Verortung.
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

  -- Der Bezug wechselt ----------------------------------------------------
  -- Zwei Standardempfaenger kann es nicht geben; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Steht die
  -- bleibende Akte schon unter einer Sperre, gibt es fuer dieselbe Akte keine
  -- zweite aktive: Die der Dublette wird aufgehoben und haengt danach mit
  -- Grund und Dauer als Nachweis an der bleibenden Akte. Der Schutz bleibt,
  -- weil die bleibende Akte weiter gesperrt ist.
  if app.under_legal_hold(v_org, 'patient', v_ziel.id) then
    update public.legal_holds
       set released_at = now(),
           released_by = v_actor
     where subject_type = 'patient'
       and subject_id = v_quelle.id
       and released_at is null
    returning id into v_sperre;
  end if;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148) --------------------------------------------
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

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein
  -- Widerruf in der einen trifft die aelteren Fotos der anderen - sofort,
  -- wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die leere Akte faellt (ANN-150) -----------------------------------------
  -- Was noch an ihr haengt, faellt mit ihr (Kontakt und Versorgungsangaben der
  -- Dublette, soweit sie in die bleibende Akte eingeflossen sind).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  -- Die Person nur, wenn nichts anderes an ihr haengt: Mitarbeiter:in, Konto,
  -- Trainingsverhaeltnis (ADR-021) bleiben, wie sie sind.
  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  -- Nachweis: Kennungen und Zahlen, keine Namen, kein Inhalt (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient.merged', 'patient', v_ziel.id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'source_patient_id', v_quelle.id,
      'moved', v_plan -> 'counts',
      'photos_deleted', v_fotos,
      'legal_hold_released', v_sperre
    )
  );

  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$$;

comment on function public.merge_patients(uuid, uuid) is
  'Fuehrt eine Dublette in die bleibende Akte ueber (PRX-017, ANN-147 bis ANN-150): Bezuege wechseln, Inhalte nicht; die leere Akte faellt, ihre Person nur ohne andere Bezuege. Nur owner; protokolliert patient.merged, abgewiesen mit denied-Eintrag und HTTP 403 (G6c). Nicht rueckgaengig.';

revoke all on function public.merge_patients(uuid, uuid) from public, anon;
grant execute on function public.merge_patients(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- place_legal_hold - wartet auf ein laufendes Zusammenfuehren (PRX-017)
--
-- Unveraendert bis auf die Sperre der Akte: Ohne sie koennte ein Legal Hold,
-- der waehrend merge_patients entsteht, an der Kennung der gefallenen Dublette
-- haengen bleiben - legal_holds.subject_id hat keinen Fremdschluessel - und die
-- bleibende Akte waere ungeschuetzt. FOR SHARE wartet auf das FOR UPDATE des
-- Zusammenfuehrens und findet danach die Dublette nicht mehr.
-- -----------------------------------------------------------------------------
create or replace function public.place_legal_hold(p_patient_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_hold  uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_legal_hold() then
    -- G6c: abgewiesen wird mit einem bestaetigten denied-Eintrag und HTTP 403.
    perform app.record_denied_write(v_actor, 'legal_hold.placed', 'not allowed to manage legal holds');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage legal holds' using errcode = '42501';
  end if;

  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a legal hold needs a reason' using errcode = '22023';
  end if;

  -- Zielakte ausschliesslich in der Organisation des Aufrufers suchen - und
  -- sperren, damit ein gleichzeitiges Zusammenfuehren zuerst fertig wird.
  perform 1
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org
  for share;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if app.under_legal_hold(v_org, 'patient', p_patient_id) then
    raise exception 'patient is already under legal hold' using errcode = '22023';
  end if;

  insert into public.legal_holds (
    organization_id, subject_type, subject_id, reason, placed_by
  )
  values (v_org, 'patient', p_patient_id, btrim(p_reason), v_actor)
  returning id into v_hold;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'legal_hold.placed', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'hold_id', v_hold)
  );

  return v_hold;
end;
$$;
