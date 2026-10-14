-- =============================================================================
-- O-001 (Befund B8): Einen eben angelegten Termin zuruecknehmen
--
-- Nach dem Festschreiben legt ein Tipp den Folgetermin an (ANN-477). Ein
-- Fehltipp liess sich bisher nur absagen - und eine Absage meldet der Person
-- "Termin abgesagt" (KOM-009), obwohl sie von dem Termin nie erfahren hat.
-- Diese Funktion nimmt das Anlegen zurueck: Sie loescht die Zeile, solange
-- der Termin nichts bewirkt hat.
--
-- ANN-534: Zuruecknehmen darf nur, wer angelegt hat, mit einer Rolle der
-- Terminverwaltung, in derselben Organisation und hoechstens 15 Minuten nach
-- dem Anlegen - und nur einen Termin, den seitdem niemand geaendert hat
-- (updated_at = created_at). Es entsteht keine Auditaktion (ADR-010 Punkte
-- 16 und 17, supabase/audit-aktionen.txt bleibt): Der Termin war nie
-- wirksam. Damit er nach einer Wiederherstellung nicht zurueckkehrt, steht er
-- im Loeschjournal (ADR-008 Punkt 8) - Tabelle und Kennung, kein Inhalt,
-- keine Person.
--
-- Wirksam geworden ist er, sobald etwas an ihm haengt. Die Fremdschluessel
-- auf public.appointments (Stand dieser Migration, aus pg_constraint):
--
--   restrict:  treatment_notes, billable_services, training_protocols
--   cascade:   treatment_draft_findings, appointment_session_fees,
--              appointment_notifications, appointment_call_states
--   set null:  waitlist_entries.placed_appointment_id,
--              platform_appointment_requests.appointment_id und
--              .resulting_appointment_id
--
-- Ohne Fremdschluessel zeigen notification_deliveries.subject_id (KOM-009)
-- und audit_log.subject_id auf einen Termin. Jede dieser Zeilen verhindert
-- das Zuruecknehmen - ausser offenen Zustellauftraegen, die mit dem Termin
-- fallen, und dem Auditlog, das bleibt, wie es ist (ADR-010 Punkt 4). Ein
-- cascade oder set null loescht hier also nie still etwas mit. Dateien haengen
-- an Person und Grundlage, nicht am Termin (patient_files).
-- =============================================================================

create function public.undo_appointment_creation(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
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
  select a.id, a.kind, a.status, a.created_by, a.created_at, a.updated_at
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

  -- Der Stand, den die Aufrufende kennt, und kein geaenderter: Die
  -- Schreibwege am Termin setzen updated_at neu, create_appointment legt ihn
  -- gleich created_at an. So greift die Pruefung auch, wenn der Stand erst
  -- jetzt gelesen wurde - eine neue Person, ein anderer Ort oder ein anderes
  -- Ende fallen nicht still mit dem Termin.
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

  -- Mitgeteilt ist mitgeteilt: von Hand (Mitteilungsvermerk, CAL-012) oder
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

  -- Offene, verworfene und aufgegebene Auftraege fallen mit dem Termin.
  delete from public.notification_deliveries d
   where d.subject_id = p_appointment_id
     and d.kind in ('appointment_reminder', 'appointment_changed', 'appointment_cancelled');

  delete from public.appointments a where a.id = p_appointment_id;

  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  values
    (v_org, extensions.gen_random_uuid(), 'appointments', p_appointment_id,
     'termin_ohne_nachweis', now());
end;
$$;

comment on function public.undo_appointment_creation(uuid, timestamptz) is
  'O-001 (B8, ANN-534): nimmt einen eben angelegten Behandlungstermin zurueck und loescht ihn - nur die anlegende Person mit Rolle der Terminverwaltung, hoechstens 15 Minuten nach dem Anlegen, noch geplant, seitdem unveraendert (updated_at = created_at, passend zum erwarteten Stand), ohne Doku, Entwurf, Leistung, Honorar, Anrufstand, Warteliste, Plattformwunsch, Serie und ohne Mitteilung. Offene Zustellauftraege fallen mit. Kein Auditeintrag; im Loeschjournal (ADR-008 Punkt 8).';

revoke all on function public.undo_appointment_creation(uuid, timestamptz) from public, anon;
grant execute on function public.undo_appointment_creation(uuid, timestamptz) to authenticated;
